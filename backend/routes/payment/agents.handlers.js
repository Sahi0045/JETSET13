import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { supabase } from './arcpay.config.js';
import { JWT_SECRET, JWT_EXPIRE } from '../../config/jwt.js';
import { isSuperAdmin } from '../../middleware/auth.middleware.js';
import { sendTravelAgentInviteEmail } from '../../services/emailService.js';

const INVITE_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const frontendOrigin = (req) =>
    req.get('origin') || req.body?.returnOrigin || req.query?.returnOrigin ||
    process.env.FRONTEND_URL || 'http://localhost:5173';
function makeInvite() {
    const raw = crypto.randomBytes(32).toString('hex');
    return { raw, hash: sha256(raw), expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString() };
}

/**
 * Resolve the caller from their Bearer token. Travel-admin tokens from /api/auth/login carry
 * only { id, role } (no email), so we load the user to evaluate the super-admin allowlist.
 * Agent tokens carry role:'agent' and are never admin/super-admin.
 * Returns { id, role, email, isSuper } or null if unauthenticated/invalid.
 */
async function getCaller(req) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return null;
    let decoded;
    try {
        decoded = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    } catch {
        return null;
    }
    let { role, email, id } = decoded;
    if (role !== 'agent' && id && !email) {
        const { data } = await supabase.from('users').select('email, role').eq('id', id).maybeSingle();
        if (data) { email = data.email; role = role || data.role; }
    }
    return { id, role, email, isSuper: isSuperAdmin({ role, email }) };
}

/** Gate: only the super admin may manage agents. Sends 403 and returns false if not. */
async function requireSuperAdmin(req, res) {
    const caller = await getCaller(req);
    if (!caller || !caller.isSuper) {
        res.status(403).json({ success: false, error: 'Not authorized — super admin only.' });
        return false;
    }
    return true;
}

/** Gate: any back-office staff (admin or super admin) — used for read-only agent lists. */
async function requireAdmin(req, res) {
    const caller = await getCaller(req);
    if (!caller || !['admin', 'superadmin'].includes(caller.role)) {
        res.status(403).json({ success: false, error: 'Not authorized.' });
        return false;
    }
    return true;
}

/**
 * Agent Login
 */
export async function handleAgentLogin(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password are required' });
        }

        // Find agent by email
        const { data: agent, error } = await supabase
            .from('agents')
            .select('*')
            .eq('email', email.toLowerCase().trim())
            .single();

        if (error || !agent) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        if (agent.status !== 'active') {
            return res.status(403).json({ success: false, error: 'Your account is inactive. Please contact admin.' });
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, agent.password_hash);
        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // Generate JWT with agent role
        const token = jwt.sign(
            { id: agent.id, agentId: agent.id, role: 'agent', email: agent.email },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRE }
        );

        console.log('✅ Agent logged in:', agent.email);

        return res.json({
            success: true,
            id: agent.id,
            firstName: agent.name.split(' ')[0],
            lastName: agent.name.split(' ').slice(1).join(' ') || '',
            email: agent.email,
            role: 'agent',
            agentId: agent.id,
            token
        });
    } catch (error) {
        console.error('❌ Agent login error:', error);
        return res.status(500).json({ success: false, error: 'Login failed', details: error.message });
    }
}

/**
 * Create Agent (super admin only) — invite flow, mirroring visa agents.
 * Body: { name, email, phone?, commissionRate?, returnOrigin? }
 * Creates an 'invited' agent (random placeholder password) and emails a set-password link.
 */
export async function handleCreateAgent(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const caller = await getCaller(req);
    if (!caller || !caller.isSuper) {
        return res.status(403).json({ success: false, error: 'Not authorized — super admin only.' });
    }

    try {
        const { name, email, phone, commissionRate } = req.body;
        if (!name || !email) {
            return res.status(400).json({ success: false, error: 'Name and email are required' });
        }
        const normEmail = email.toLowerCase().trim();

        const { data: existing } = await supabase
            .from('agents').select('id, status').eq('email', normEmail).maybeSingle();
        if (existing) {
            return res.status(409).json({ success: false, error: 'An agent with this email already exists.' });
        }

        // Random placeholder password — unusable until they accept the invite.
        const placeholder = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
        const invite = makeInvite();

        const { data: agent, error: insertError } = await supabase
            .from('agents')
            .insert({
                name: name.trim(),
                email: normEmail,
                password_hash: placeholder,
                phone: phone || null,
                commission_rate: parseFloat(commissionRate) || 0,
                status: 'invited',
                invite_token_hash: invite.hash,
                invite_expires_at: invite.expiresAt,
                invited_at: new Date().toISOString(),
                created_by: caller.id || null,
                created_at: new Date().toISOString(),
            })
            .select('id, name, email, phone, commission_rate, status')
            .single();

        if (insertError) {
            console.error('❌ Failed to create agent:', insertError);
            return res.status(500).json({ success: false, error: 'Failed to create agent', details: insertError.message });
        }

        const inviteLink = `${frontendOrigin(req)}/agent/set-password?token=${invite.raw}`;
        let emailed = true;
        try {
            await sendTravelAgentInviteEmail(normEmail, name, inviteLink);
        } catch (e) {
            emailed = false;
            console.error('createAgent: invite email failed:', e.message);
        }

        console.log('✅ Travel agent invited:', agent.email);
        return res.json({
            success: true,
            emailed,
            message: emailed
                ? 'Agent invited — they\'ll receive an email to set their password.'
                : 'Agent created, but the invite email failed to send. Use "Resend invite".',
            agent,
        });
    } catch (error) {
        console.error('❌ Create agent error:', error);
        return res.status(500).json({ success: false, error: 'Failed to create agent', details: error.message });
    }
}

/**
 * GET invite details (public). Query: ?token=...  → { name, email } so the set-password page
 * can greet the agent. Reveals nothing else.
 */
export async function handleGetAgentInvite(req, res) {
    try {
        const token = req.query?.token;
        if (!token) return res.status(400).json({ success: false, error: 'token is required' });
        const { data: agent } = await supabase
            .from('agents')
            .select('name, email, invite_expires_at, accepted_at')
            .eq('invite_token_hash', sha256(token))
            .maybeSingle();
        if (!agent) return res.status(404).json({ success: false, error: 'Invalid or used invitation link.' });
        if (agent.accepted_at) return res.status(410).json({ success: false, error: 'This invitation was already used.' });
        if (new Date(agent.invite_expires_at).getTime() < Date.now()) {
            return res.status(410).json({ success: false, error: 'This invitation has expired. Ask the admin to resend it.' });
        }
        return res.json({ success: true, name: agent.name, email: agent.email });
    } catch (error) {
        console.error('❌ Get agent invite error:', error);
        return res.status(500).json({ success: false, error: 'Failed to validate invitation' });
    }
}

/**
 * Accept invite (public). Body: { token, password } → sets the password and activates the agent.
 */
export async function handleAcceptAgentInvite(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
        const { token, password } = req.body || {};
        if (!token || !password) return res.status(400).json({ success: false, error: 'token and password are required' });
        if (String(password).length < 8) {
            return res.status(400).json({ success: false, error: 'Password must be at least 8 characters.' });
        }
        const { data: agent } = await supabase
            .from('agents')
            .select('id, invite_expires_at, accepted_at')
            .eq('invite_token_hash', sha256(token))
            .maybeSingle();
        if (!agent) return res.status(404).json({ success: false, error: 'Invalid or used invitation link.' });
        if (agent.accepted_at) return res.status(410).json({ success: false, error: 'This invitation was already used.' });
        if (new Date(agent.invite_expires_at).getTime() < Date.now()) {
            return res.status(410).json({ success: false, error: 'This invitation has expired. Ask the admin to resend it.' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const { error } = await supabase.from('agents').update({
            password_hash: passwordHash,
            status: 'active',
            accepted_at: new Date().toISOString(),
            invite_token_hash: null,
            invite_expires_at: null,
            updated_at: new Date().toISOString(),
        }).eq('id', agent.id);
        if (error) throw error;

        return res.json({ success: true, message: 'Password set. You can now sign in.' });
    } catch (error) {
        console.error('❌ Accept agent invite error:', error);
        return res.status(500).json({ success: false, error: 'Failed to set password' });
    }
}

/**
 * Resend invite (super admin only). Body: { agentId, returnOrigin? }
 */
export async function handleResendAgentInvite(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!(await requireSuperAdmin(req, res))) return;
    try {
        const { agentId } = req.body || {};
        if (!agentId) return res.status(400).json({ success: false, error: 'agentId is required' });
        const { data: agent } = await supabase
            .from('agents').select('id, name, email').eq('id', agentId).maybeSingle();
        if (!agent) return res.status(404).json({ success: false, error: 'Agent not found' });

        const invite = makeInvite();
        const { error } = await supabase.from('agents').update({
            status: 'invited',
            invite_token_hash: invite.hash,
            invite_expires_at: invite.expiresAt,
            invited_at: new Date().toISOString(),
            accepted_at: null,
            updated_at: new Date().toISOString(),
        }).eq('id', agentId);
        if (error) throw error;

        const inviteLink = `${frontendOrigin(req)}/agent/set-password?token=${invite.raw}`;
        await sendTravelAgentInviteEmail(agent.email, agent.name, inviteLink);
        return res.json({ success: true, message: 'Invite re-sent.' });
    } catch (error) {
        console.error('❌ Resend agent invite error:', error);
        return res.status(500).json({ success: false, error: 'Failed to resend invite' });
    }
}

/**
 * List Agents (Admin only)
 */
export async function handleListAgents(req, res) {
    if (!(await requireAdmin(req, res))) return;
    try {
        const { data: agents, error } = await supabase
            .from('agents')
            .select('id, name, email, phone, status, commission_rate, created_at, invited_at, accepted_at')
            .order('created_at', { ascending: false });

        if (error) {
            return res.status(500).json({ success: false, error: 'Failed to fetch agents', details: error.message });
        }

        // Per-agent sales + commission stats.
        const enrichedAgents = await Promise.all(agents.map(async (agent) => {
            const { count: linkCount } = await supabase
                .from('payment_links')
                .select('*', { count: 'exact', head: true })
                .eq('agent_id', agent.id);

            const { data: paidLinks } = await supabase
                .from('payment_links')
                .select('amount')
                .eq('agent_id', agent.id)
                .eq('status', 'paid');

            const totalRevenue = (paidLinks || []).reduce((sum, l) => sum + parseFloat(l.amount || 0), 0);
            const rate = parseFloat(agent.commission_rate || 0);
            const commission = +(totalRevenue * rate / 100).toFixed(2);

            return {
                ...agent,
                totalLinks: linkCount || 0,
                paidCount: (paidLinks || []).length,
                totalRevenue,
                commission,
            };
        }));

        return res.json({ success: true, data: enrichedAgents, total: enrichedAgents.length });
    } catch (error) {
        console.error('❌ List agents error:', error);
        return res.status(500).json({ success: false, error: 'Failed to list agents', details: error.message });
    }
}

/**
 * Agent's OWN scoped dashboard stats (agent portal). Auth: the caller's agent token.
 * Returns their sales summary, commission, and a breakdown by booking type + recent links.
 */
export async function handleAgentStats(req, res) {
    const caller = await getCaller(req);
    if (!caller || caller.role !== 'agent' || !caller.id) {
        return res.status(403).json({ success: false, error: 'Agent access only.' });
    }
    try {
        const { data: agent } = await supabase
            .from('agents').select('id, name, email, commission_rate, status').eq('id', caller.id).maybeSingle();
        if (!agent) return res.status(404).json({ success: false, error: 'Agent not found' });

        const { data: links } = await supabase
            .from('payment_links')
            .select('id, customer_name, customer_email, booking_type, amount, currency, status, created_at, paid_at')
            .eq('agent_id', agent.id)
            .order('created_at', { ascending: false });

        const all = links || [];
        const paid = all.filter((l) => l.status === 'paid');
        const pending = all.filter((l) => l.status === 'pending');
        const totalRevenue = paid.reduce((s, l) => s + parseFloat(l.amount || 0), 0);
        const pendingRevenue = pending.reduce((s, l) => s + parseFloat(l.amount || 0), 0);
        const rate = parseFloat(agent.commission_rate || 0);

        const byType = {};
        for (const l of paid) {
            const t = l.booking_type || 'other';
            byType[t] = byType[t] || { count: 0, revenue: 0 };
            byType[t].count += 1;
            byType[t].revenue += parseFloat(l.amount || 0);
        }

        return res.json({
            success: true,
            agent: { id: agent.id, name: agent.name, email: agent.email, commissionRate: rate, status: agent.status },
            stats: {
                totalLinks: all.length,
                paidCount: paid.length,
                pendingCount: pending.length,
                totalRevenue: +totalRevenue.toFixed(2),
                pendingRevenue: +pendingRevenue.toFixed(2),
                commissionEarned: +(totalRevenue * rate / 100).toFixed(2),
                commissionPending: +(pendingRevenue * rate / 100).toFixed(2),
                byType,
            },
            recentLinks: all.slice(0, 20),
        });
    } catch (error) {
        console.error('❌ Agent stats error:', error);
        return res.status(500).json({ success: false, error: 'Failed to load agent stats' });
    }
}

/**
 * Super-admin view of ANY agent's full work: profile, stats, and their complete sales list.
 * GET /api/payments?action=admin-agent-detail&agentId=...   (admin + super admin)
 */
export async function handleAdminAgentDetail(req, res) {
    if (!(await requireAdmin(req, res))) return;
    try {
        const agentId = req.query?.agentId || req.body?.agentId;
        if (!agentId) return res.status(400).json({ success: false, error: 'agentId is required' });

        const { data: agent } = await supabase
            .from('agents')
            .select('id, name, email, phone, commission_rate, status, created_at, accepted_at')
            .eq('id', agentId).maybeSingle();
        if (!agent) return res.status(404).json({ success: false, error: 'Agent not found' });

        const { data: links } = await supabase
            .from('payment_links')
            .select('id, customer_name, customer_email, booking_type, amount, currency, status, description, created_at, paid_at')
            .eq('agent_id', agentId)
            .order('created_at', { ascending: false });

        const all = links || [];
        const paid = all.filter((l) => l.status === 'paid');
        const pending = all.filter((l) => l.status === 'pending');
        const totalRevenue = paid.reduce((s, l) => s + parseFloat(l.amount || 0), 0);
        const pendingRevenue = pending.reduce((s, l) => s + parseFloat(l.amount || 0), 0);
        const rate = parseFloat(agent.commission_rate || 0);
        const byType = {};
        for (const l of paid) {
            const t = l.booking_type || 'other';
            byType[t] = byType[t] || { count: 0, revenue: 0 };
            byType[t].count += 1; byType[t].revenue += parseFloat(l.amount || 0);
        }
        Object.values(byType).forEach((v) => { v.revenue = +v.revenue.toFixed(2); });

        const commissionEarned = +(totalRevenue * rate / 100).toFixed(2);
        const { data: payouts } = await supabase
            .from('commission_payouts')
            .select('id, amount, note, created_at')
            .eq('agent_id', agentId)
            .order('created_at', { ascending: false });
        const commissionPaidOut = +(payouts || []).reduce((s, p) => s + parseFloat(p.amount || 0), 0).toFixed(2);

        return res.json({
            success: true,
            agent: {
                id: agent.id, name: agent.name, email: agent.email, phone: agent.phone,
                commissionRate: rate, status: agent.status, createdAt: agent.created_at, acceptedAt: agent.accepted_at,
            },
            stats: {
                totalLinks: all.length, paidCount: paid.length, pendingCount: pending.length,
                expiredCount: all.filter((l) => l.status === 'expired').length,
                totalRevenue: +totalRevenue.toFixed(2), pendingRevenue: +pendingRevenue.toFixed(2),
                commissionEarned,
                commissionPending: +(pendingRevenue * rate / 100).toFixed(2),
                commissionPaidOut,
                commissionOutstanding: +(commissionEarned - commissionPaidOut).toFixed(2),
                byType,
            },
            sales: all,
            payouts: payouts || [],
        });
    } catch (error) {
        console.error('❌ admin-agent-detail error:', error);
        return res.status(500).json({ success: false, error: 'Failed to load agent detail' });
    }
}

/**
 * Record a commission payout to an agent. POST { agentId, amount, note? }  (super admin)
 */
export async function handleRecordPayout(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const caller = await getCaller(req);
    if (!caller || !caller.isSuper) {
        return res.status(403).json({ success: false, error: 'Not authorized — super admin only.' });
    }
    try {
        const { agentId, amount, note } = req.body || {};
        const amt = parseFloat(amount);
        if (!agentId || !amt || amt <= 0) {
            return res.status(400).json({ success: false, error: 'agentId and a positive amount are required.' });
        }
        const { data: agent } = await supabase.from('agents').select('id').eq('id', agentId).maybeSingle();
        if (!agent) return res.status(404).json({ success: false, error: 'Agent not found' });

        const { data, error } = await supabase
            .from('commission_payouts')
            .insert({ agent_id: agentId, amount: amt, note: note || null, paid_by: caller.id || null })
            .select().single();
        if (error) throw error;
        return res.json({ success: true, payout: data, message: `Recorded $${amt.toFixed(2)} payout.` });
    } catch (error) {
        console.error('❌ record-payout error:', error);
        return res.status(500).json({ success: false, error: 'Failed to record payout' });
    }
}

/**
 * Update Agent (Admin only)
 */
export async function handleUpdateAgent(req, res) {
    if (req.method !== 'POST' && req.method !== 'PUT') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!(await requireSuperAdmin(req, res))) return;

    try {
        const { agentId, name, email, phone, status, commissionRate, password } = req.body;

        if (!agentId) {
            return res.status(400).json({ success: false, error: 'Agent ID is required' });
        }

        const updates = { updated_at: new Date().toISOString() };
        if (name) updates.name = name.trim();
        if (email) updates.email = email.toLowerCase().trim();
        if (phone !== undefined) updates.phone = phone;
        if (status) updates.status = status;
        if (commissionRate !== undefined) updates.commission_rate = parseFloat(commissionRate);

        // If password is provided, hash it
        if (password && password.length >= 6) {
            const salt = await bcrypt.genSalt(10);
            updates.password_hash = await bcrypt.hash(password, salt);
        }

        const { data: agent, error } = await supabase
            .from('agents')
            .update(updates)
            .eq('id', agentId)
            .select('id, name, email, phone, status, commission_rate, created_at, updated_at')
            .single();

        if (error) {
            return res.status(500).json({ success: false, error: 'Failed to update agent', details: error.message });
        }

        console.log('✅ Agent updated:', agent.email);
        return res.json({ success: true, agent });
    } catch (error) {
        console.error('❌ Update agent error:', error);
        return res.status(500).json({ success: false, error: 'Failed to update agent', details: error.message });
    }
}

/**
 * Delete/Deactivate Agent (Admin only)
 */
export async function handleDeleteAgent(req, res) {
    if (req.method !== 'POST' && req.method !== 'DELETE') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!(await requireSuperAdmin(req, res))) return;

    try {
        const agentId = req.body?.agentId || req.query?.agentId;

        if (!agentId) {
            return res.status(400).json({ success: false, error: 'Agent ID is required' });
        }

        // Soft delete — set to disabled (keeps the agent row + payment-link/commission history).
        const { data: agent, error } = await supabase
            .from('agents')
            .update({ status: 'disabled', updated_at: new Date().toISOString() })
            .eq('id', agentId)
            .select('id, name, email, status')
            .single();

        if (error) {
            return res.status(500).json({ success: false, error: 'Failed to remove agent', details: error.message });
        }

        console.log('✅ Agent removed (disabled):', agent.email);
        return res.json({ success: true, agent, message: 'Agent removed.' });
    } catch (error) {
        console.error('❌ Delete agent error:', error);
        return res.status(500).json({ success: false, error: 'Failed to deactivate agent', details: error.message });
    }
}


