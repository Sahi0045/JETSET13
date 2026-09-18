import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import supabase from '../config/supabase.js';
import { protect, admin } from '../middleware/auth.middleware.js';
import { errorSummary } from '../utils/errorSummary.js';
import { sendStaffInviteEmail } from '../services/emailService.js';

/**
 * Back-office accounts, invited the way travel agents are.
 *
 * A support account used to be made by a script that set a password the owner
 * had chosen, which then had to be sent to the person somehow. Agents have had
 * a better path all along - invite an email address, they open a link, set
 * their own password, and the account activates - so this is that path, for
 * the support desk, with the same 48-hour, single-use, hashed token.
 *
 * Only an admin invites, re-sends or takes access away. The two endpoints the
 * invited person uses are public, because they have no account yet; both reveal
 * nothing beyond the name and address the invitation was sent to.
 */

const router = express.Router();

const INVITE_TTL_MS = 48 * 60 * 60 * 1000;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const makeInvite = () => {
  const raw = crypto.randomBytes(32).toString('hex');
  return { raw, hash: sha256(raw), expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString() };
};
const originOf = (req) =>
  req.get('origin') || req.body?.returnOrigin || process.env.FRONTEND_URL || 'http://localhost:5173';

/** Never the hash, never the password: what the owner may see about an account. */
const publicStaff = (row) => ({
  id: row.id,
  email: row.email,
  name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.name || '',
  role: row.role,
  invitedAt: row.invited_at || null,
  acceptedAt: row.invite_accepted_at || null,
  inviteExpiresAt: row.invite_expires_at || null,
  status: row.invite_accepted_at ? 'active'
    : row.invite_token_hash ? 'invited'
      : 'active',
});

/** GET /api/staff — the support accounts, for the owner. */
router.get('/', protect, admin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, first_name, last_name, role, invited_at, invite_accepted_at, invite_expires_at, invite_token_hash')
      .eq('role', 'support')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ success: true, data: (data || []).map(publicStaff) });
  } catch (error) {
    console.error('❌ Staff list error:', errorSummary(error));
    return res.status(500).json({ success: false, error: 'Could not read the staff accounts' });
  }
});

/**
 * POST /api/staff/invite — invite someone to the support desk.
 *
 * Body: { email, firstName?, lastName? }. An address that already has a
 * customer account is turned into a support account rather than duplicated;
 * their own password is replaced by the invitation, so the account cannot be
 * entered until they set a new one.
 */
router.post('/invite', protect, admin, async (req, res) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    if (!email.includes('@')) {
      return res.status(400).json({ success: false, code: 'EMAIL_REQUIRED', error: 'Please give the email address to invite.' });
    }
    const firstName = String(req.body?.firstName ?? '').trim() || 'Support';
    const lastName = String(req.body?.lastName ?? '').trim() || '';

    const invite = makeInvite();
    const fields = {
      role: 'support',
      first_name: firstName,
      last_name: lastName,
      name: `${firstName} ${lastName}`.trim(),
      // Unusable until they accept: the invitation replaces whatever was there.
      password: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10),
      invite_token_hash: invite.hash,
      invite_expires_at: invite.expiresAt,
      invited_at: new Date().toISOString(),
      invite_accepted_at: null,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase.from('users').select('id, role').eq('email', email).maybeSingle();
    if (existing) {
      const { error } = await supabase.from('users').update(fields).eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('users').insert([{ email, ...fields }]);
      if (error) throw error;
    }

    const link = `${originOf(req)}/desk/set-password?token=${invite.raw}`;
    try {
      await sendStaffInviteEmail(email, fields.name, link);
    } catch (mailError) {
      // The account is invited either way; the owner can re-send, or pass the
      // link on themselves. Saying so beats a silent success.
      console.error('❌ Staff invite email failed:', errorSummary(mailError));
      return res.json({ success: true, emailed: false, message: 'Account invited, but the email could not be sent. Re-send it in a moment.' });
    }

    console.log('✅ Support desk invitation sent:', email);
    return res.json({ success: true, emailed: true, message: `Invitation sent to ${email}. It expires in 48 hours.` });
  } catch (error) {
    // The reason, not just "could not": the first invitation ever sent was
    // refused by the database (`support` was missing from the users_role_check
    // constraint) and the desk showed a dead end with nothing to act on. This
    // endpoint is admin-only, so the cause is safe to show.
    const summary = errorSummary(error);
    console.error('❌ Staff invite error:', summary);
    return res.status(500).json({
      success: false,
      error: 'Could not send the invitation',
      detail: summary.message || null,
    });
  }
});

/** POST /api/staff/:id/revoke — take the desk away again (back to an ordinary account). */
router.post('/:id/revoke', protect, admin, async (req, res) => {
  try {
    const { data: person } = await supabase.from('users').select('id, role, email').eq('id', req.params.id).maybeSingle();
    if (!person) return res.status(404).json({ success: false, error: 'Account not found' });
    if (person.role !== 'support') {
      return res.status(409).json({ success: false, code: 'NOT_SUPPORT', error: 'That account is not a support account.' });
    }
    const { error } = await supabase.from('users').update({
      role: 'user',
      invite_token_hash: null,
      invite_expires_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', person.id);
    if (error) throw error;
    console.log('✅ Support desk access removed:', person.email);
    return res.json({ success: true, message: 'Access removed.' });
  } catch (error) {
    console.error('❌ Staff revoke error:', errorSummary(error));
    return res.status(500).json({ success: false, error: 'Could not remove the access' });
  }
});

/**
 * GET /api/staff/invite?token=… — public: what this link is for, so the
 * set-password page can greet the person. Reveals nothing else.
 */
router.get('/invite', async (req, res) => {
  try {
    const token = req.query?.token;
    if (!token) return res.status(400).json({ success: false, error: 'This link is incomplete.' });
    const { data: person } = await supabase
      .from('users')
      .select('name, email, invite_expires_at, invite_accepted_at')
      .eq('invite_token_hash', sha256(String(token)))
      .maybeSingle();
    if (!person) return res.status(404).json({ success: false, error: 'This invitation link is not valid any more.' });
    if (person.invite_accepted_at) {
      return res.status(410).json({ success: false, error: 'This invitation was already used. Sign in instead.' });
    }
    if (Date.parse(person.invite_expires_at ?? '') < Date.now()) {
      return res.status(410).json({ success: false, error: 'This invitation has expired. Ask for a new one.' });
    }
    return res.json({ success: true, name: person.name, email: person.email });
  } catch (error) {
    console.error('❌ Staff invite read error:', errorSummary(error));
    return res.status(500).json({ success: false, error: 'Could not check the invitation' });
  }
});

/** POST /api/staff/accept-invite — public: set the password and activate the account. */
router.post('/accept-invite', async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ success: false, error: 'Please choose a password.' });
    }
    if (String(password).length < 10) {
      return res.status(400).json({ success: false, code: 'PASSWORD_TOO_SHORT', error: 'Please use at least 10 characters.' });
    }
    const { data: person } = await supabase
      .from('users')
      .select('id, invite_expires_at, invite_accepted_at')
      .eq('invite_token_hash', sha256(String(token)))
      .maybeSingle();
    if (!person) return res.status(404).json({ success: false, error: 'This invitation link is not valid any more.' });
    if (person.invite_accepted_at) {
      return res.status(410).json({ success: false, error: 'This invitation was already used. Sign in instead.' });
    }
    if (Date.parse(person.invite_expires_at ?? '') < Date.now()) {
      return res.status(410).json({ success: false, error: 'This invitation has expired. Ask for a new one.' });
    }

    const { error } = await supabase.from('users').update({
      password: await bcrypt.hash(String(password), 10),
      invite_accepted_at: new Date().toISOString(),
      // Single use: the link cannot set a second password.
      invite_token_hash: null,
      invite_expires_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', person.id);
    if (error) throw error;

    return res.json({ success: true, message: 'Password set. You can sign in now.' });
  } catch (error) {
    console.error('❌ Staff accept invite error:', errorSummary(error));
    return res.status(500).json({ success: false, error: 'Could not set the password' });
  }
});

export default router;
