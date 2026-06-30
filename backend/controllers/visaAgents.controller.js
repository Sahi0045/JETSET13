/**
 * Visa processing agents — superadmin-managed staff who process visa applications.
 *
 * Identity & login live in public.users (role='agent'); the visa-specific profile +
 * invite state live in public.visa_agents. A new agent is created in an "invited" state
 * with a random placeholder password and a one-time, hashed invite token emailed to them;
 * they set their real password via the accept-invite endpoint, which flips them to "active".
 *
 * Enforcement: an agent's panel access is driven by users.role. active → 'agent',
 * disabled → 'user' (so a disabled agent immediately fails the panel's role gate).
 */
import supabase from '../config/supabase.js';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { sendAgentInviteEmail } from '../services/emailService.js';

const INVITE_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const frontendOrigin = (req) =>
  req.get('origin') || req.body?.returnOrigin || process.env.FRONTEND_URL || 'http://localhost:5173';

/** Issue a fresh invite token: returns { raw, hash, expiresAt }. */
function makeInvite() {
  const raw = crypto.randomBytes(32).toString('hex');
  return { raw, hash: sha256(raw), expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString() };
}

/**
 * POST /api/visa/admin/agents   (superadmin)
 * Body: { name, email, phone?, specialization?, returnOrigin? }
 * Creates/promotes the user to an agent, stores the profile, emails a set-password invite.
 */
export const createAgent = async (req, res) => {
  try {
    const { name, email, phone = null, specialization = null } = req.body || {};
    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'name and email are required' });
    }
    const normEmail = String(email).trim().toLowerCase();

    // Does a user already exist with this email?
    const { data: existing } = await supabase
      .from('users')
      .select('id, role')
      .eq('email', normEmail)
      .maybeSingle();

    if (existing && ['admin', 'superadmin'].includes(existing.role)) {
      return res.status(409).json({ success: false, message: 'That email already belongs to an admin account.' });
    }

    let userId;
    let createdUser; // did WE create this account (staff-only) vs promote an existing user?
    if (existing) {
      // Promote an existing customer account to an agent (keep their password until they accept).
      const { data: alreadyAgent } = await supabase
        .from('visa_agents').select('id').eq('user_id', existing.id).maybeSingle();
      if (alreadyAgent) {
        return res.status(409).json({ success: false, message: 'That person is already a visa agent.' });
      }
      userId = existing.id;
      createdUser = false; // pre-existing account — must be preserved on removal
      await supabase.from('users')
        .update({ role: 'agent', name, ...(phone ? { phone } : {}), updated_at: new Date().toISOString() })
        .eq('id', userId);
    } else {
      // Brand-new account. Random placeholder password — unusable until they accept the invite.
      const placeholder = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
      const { data: created, error: createErr } = await supabase
        .from('users')
        .insert([{ name, email: normEmail, password: placeholder, role: 'agent', phone }])
        .select('id')
        .single();
      if (createErr) throw createErr;
      userId = created.id;
      createdUser = true; // staff-only account we made — safe to hard-delete on removal
    }

    const invite = makeInvite();
    const { error: profErr } = await supabase
      .from('visa_agents')
      .insert([{
        user_id: userId,
        status: 'invited',
        specialization,
        invite_token_hash: invite.hash,
        invite_expires_at: invite.expiresAt,
        created_by: req.user?.id || null,
        created_user: createdUser,
      }]);
    if (profErr) throw profErr;

    const inviteLink = `${frontendOrigin(req)}/visa/agent/set-password?token=${invite.raw}`;
    let emailed = true;
    try {
      await sendAgentInviteEmail(normEmail, name, inviteLink);
    } catch (e) {
      emailed = false;
      console.error('createAgent: invite email failed:', e.message);
    }

    return res.status(201).json({
      success: true,
      message: emailed ? 'Agent invited — they\'ll receive an email to set their password.'
                       : 'Agent created, but the invite email failed to send. Use "Resend invite".',
      agent: { id: userId, name, email: normEmail, phone, specialization, status: 'invited' },
      emailed,
    });
  } catch (err) {
    console.error('createAgent error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to create agent' });
  }
};

/**
 * GET /api/visa/admin/agents   (superadmin)
 * Lists agents with their profile + a count of currently-assigned applications.
 */
export const listAgents = async (req, res) => {
  try {
    const { data: profiles, error } = await supabase
      .from('visa_agents')
      .select('user_id, status, specialization, invited_at, accepted_at, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const ids = profiles.map((p) => p.user_id);
    const userMap = {};
    if (ids.length) {
      const { data: users } = await supabase
        .from('users').select('id, name, email, phone, role').in('id', ids);
      (users || []).forEach((u) => { userMap[u.id] = u; });
    }

    // Assigned-application counts (assigned_agent stores the agent's user_id as text).
    const counts = {};
    if (ids.length) {
      const { data: apps } = await supabase
        .from('visa_applications').select('assigned_agent').in('assigned_agent', ids.map(String));
      (apps || []).forEach((a) => { counts[a.assigned_agent] = (counts[a.assigned_agent] || 0) + 1; });
    }

    const agents = profiles.map((p) => {
      const u = userMap[p.user_id] || {};
      return {
        id: p.user_id,
        name: u.name || null,
        email: u.email || null,
        phone: u.phone || null,
        status: p.status,
        specialization: p.specialization,
        assignedCount: counts[String(p.user_id)] || 0,
        invitedAt: p.invited_at,
        acceptedAt: p.accepted_at,
      };
    });

    return res.json({ success: true, agents });
  } catch (err) {
    console.error('listAgents error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to list agents' });
  }
};

/**
 * GET /api/visa/admin/assignable-agents   (admin + superadmin)
 * Lightweight list of ACTIVE agents (id + name) for the "Assign to agent" dropdown on an
 * application. Admins can assign work even though only the superadmin manages agents.
 */
export const listAssignableAgents = async (req, res) => {
  try {
    const { data: profiles, error } = await supabase
      .from('visa_agents')
      .select('user_id, specialization')
      .eq('status', 'active');
    if (error) throw error;

    const ids = profiles.map((p) => p.user_id);
    let agents = [];
    if (ids.length) {
      const { data: users } = await supabase.from('users').select('id, name, email').in('id', ids);
      const specBy = Object.fromEntries(profiles.map((p) => [p.user_id, p.specialization]));
      agents = (users || []).map((u) => ({
        id: u.id,
        name: u.name || u.email,
        specialization: specBy[u.id] || null,
      }));
    }
    return res.json({ success: true, agents });
  } catch (err) {
    console.error('listAssignableAgents error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to list agents' });
  }
};

/**
 * PATCH /api/visa/admin/agents/:userId   (superadmin)
 * Body: { status?: 'active'|'disabled', specialization?, name?, phone? }
 * Disabling sets users.role='user' (revokes panel access); enabling restores 'agent'.
 */
export const updateAgent = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, specialization, name, phone } = req.body || {};

    const { data: profile } = await supabase
      .from('visa_agents').select('id, status').eq('user_id', userId).maybeSingle();
    if (!profile) return res.status(404).json({ success: false, message: 'Agent not found' });

    const profUpdate = { updated_at: new Date().toISOString() };
    if (specialization !== undefined) profUpdate.specialization = specialization;
    if (status !== undefined) {
      if (!['active', 'disabled'].includes(status)) {
        return res.status(400).json({ success: false, message: 'status must be active or disabled' });
      }
      profUpdate.status = status;
    }
    const { error: e1 } = await supabase.from('visa_agents').update(profUpdate).eq('user_id', userId);
    if (e1) throw e1;

    const userUpdate = { updated_at: new Date().toISOString() };
    if (name !== undefined) userUpdate.name = name;
    if (phone !== undefined) userUpdate.phone = phone;
    // Keep panel access in sync with status (don't downgrade someone still mid-invite).
    if (status === 'disabled') userUpdate.role = 'user';
    if (status === 'active') userUpdate.role = 'agent';
    if (Object.keys(userUpdate).length > 1) {
      const { error: e2 } = await supabase.from('users').update(userUpdate).eq('id', userId);
      if (e2) throw e2;
    }

    return res.json({ success: true, message: 'Agent updated' });
  } catch (err) {
    console.error('updateAgent error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to update agent' });
  }
};

/**
 * POST /api/visa/admin/agents/:userId/resend-invite   (superadmin)
 * Issues a fresh token, resets the agent to "invited", and re-sends the email.
 */
export const resendInvite = async (req, res) => {
  try {
    const { userId } = req.params;
    const { data: user } = await supabase
      .from('users').select('id, name, email').eq('id', userId).maybeSingle();
    if (!user) return res.status(404).json({ success: false, message: 'Agent not found' });

    const invite = makeInvite();
    const { error } = await supabase.from('visa_agents').update({
      status: 'invited',
      invite_token_hash: invite.hash,
      invite_expires_at: invite.expiresAt,
      accepted_at: null,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);
    if (error) throw error;
    // Re-enable role so they can log in once they accept.
    await supabase.from('users').update({ role: 'agent' }).eq('id', userId);

    const inviteLink = `${frontendOrigin(req)}/visa/agent/set-password?token=${invite.raw}`;
    await sendAgentInviteEmail(user.email, user.name, inviteLink);
    return res.json({ success: true, message: 'Invite re-sent.' });
  } catch (err) {
    console.error('resendInvite error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to resend invite' });
  }
};

/**
 * DELETE /api/visa/admin/agents/:userId   (superadmin)
 * Fully remove an agent. Safe by design:
 *   1. Un-assign any applications they hold (assigned_agent → null) so work returns to the pool.
 *   2. Delete their visa_agents profile (removes them from the agents list + revokes the role).
 *   3. If WE created the account just to be an agent (created_user), hard-delete it. If it was a
 *      pre-existing user we promoted, only demote it to 'user' so their account/data survives.
 *      (created_user is the reliable signal — visa_applications.user_id references auth.users,
 *      not public.users, so a customer-footprint lookup against public.users can't be trusted.)
 */
export const deleteAgent = async (req, res) => {
  try {
    const { userId } = req.params;
    const { data: profile } = await supabase
      .from('visa_agents').select('id, created_user').eq('user_id', userId).maybeSingle();
    if (!profile) return res.status(404).json({ success: false, message: 'Agent not found' });

    // 1. Free up their assigned applications.
    await supabase.from('visa_applications')
      .update({ assigned_agent: null }).eq('assigned_agent', String(userId));

    // 2. Remove the agent profile.
    const { error: pErr } = await supabase.from('visa_agents').delete().eq('user_id', userId);
    if (pErr) throw pErr;

    // 3. Demote a promoted account; hard-delete a staff-only account.
    if (!profile.created_user) {
      await supabase.from('users').update({ role: 'user', updated_at: new Date().toISOString() }).eq('id', userId);
      return res.json({ success: true, message: 'Agent removed. Their existing account was kept (demoted to a normal user).' });
    }
    // Staff-only account — try a clean delete; fall back to demote if a FK blocks it.
    const { error: dErr } = await supabase.from('users').delete().eq('id', userId);
    if (dErr) {
      await supabase.from('users').update({ role: 'user', updated_at: new Date().toISOString() }).eq('id', userId);
      return res.json({ success: true, message: 'Agent removed (account retained — it is linked to other records).' });
    }
    return res.json({ success: true, message: 'Agent deleted.' });
  } catch (err) {
    console.error('deleteAgent error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to remove agent' });
  }
};

/**
 * GET /api/visa/agent/invite/:token   (public)
 * Validates an invite token and returns the agent's email/name so the set-password
 * page can greet them. Reveals nothing else.
 */
export const getInvite = async (req, res) => {
  try {
    const { token } = req.params;
    const { data: profile } = await supabase
      .from('visa_agents')
      .select('user_id, invite_expires_at, accepted_at')
      .eq('invite_token_hash', sha256(token || ''))
      .maybeSingle();
    if (!profile) return res.status(404).json({ success: false, message: 'Invalid or used invitation link.' });
    if (profile.accepted_at) return res.status(410).json({ success: false, message: 'This invitation was already used.' });
    if (new Date(profile.invite_expires_at).getTime() < Date.now()) {
      return res.status(410).json({ success: false, message: 'This invitation has expired. Ask the admin to resend it.' });
    }
    const { data: user } = await supabase
      .from('users').select('email, name').eq('id', profile.user_id).maybeSingle();
    return res.json({ success: true, email: user?.email || null, name: user?.name || null });
  } catch (err) {
    console.error('getInvite error:', err);
    return res.status(500).json({ success: false, message: 'Failed to validate invitation' });
  }
};

/**
 * POST /api/visa/agent/accept-invite   (public)
 * Body: { token, password }
 * Sets the agent's password, activates them, and consumes the token.
 */
export const acceptInvite = async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ success: false, message: 'token and password are required' });
    if (String(password).length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    const { data: profile } = await supabase
      .from('visa_agents')
      .select('user_id, invite_expires_at, accepted_at')
      .eq('invite_token_hash', sha256(token))
      .maybeSingle();
    if (!profile) return res.status(404).json({ success: false, message: 'Invalid or used invitation link.' });
    if (profile.accepted_at) return res.status(410).json({ success: false, message: 'This invitation was already used.' });
    if (new Date(profile.invite_expires_at).getTime() < Date.now()) {
      return res.status(410).json({ success: false, message: 'This invitation has expired. Ask the admin to resend it.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const { error: uErr } = await supabase
      .from('users').update({ password: hashed, role: 'agent', updated_at: new Date().toISOString() })
      .eq('id', profile.user_id);
    if (uErr) throw uErr;

    const { error: pErr } = await supabase.from('visa_agents').update({
      status: 'active',
      accepted_at: new Date().toISOString(),
      invite_token_hash: null,
      invite_expires_at: null,
      updated_at: new Date().toISOString(),
    }).eq('user_id', profile.user_id);
    if (pErr) throw pErr;

    const { data: user } = await supabase.from('users').select('email').eq('id', profile.user_id).maybeSingle();
    return res.json({ success: true, message: 'Password set. You can now sign in.', email: user?.email || null });
  } catch (err) {
    console.error('acceptInvite error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to set password' });
  }
};
