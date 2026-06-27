import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from './arcpay.config.js';
import { JWT_SECRET, JWT_EXPIRE } from '../../config/jwt.js';


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
 * Create Agent (Admin only)
 */
export async function handleCreateAgent(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { name, email, password, phone, commissionRate } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Name, email, and password are required'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                error: 'Password must be at least 6 characters'
            });
        }

        // Check if email already exists
        const { data: existing } = await supabase
            .from('agents')
            .select('id')
            .eq('email', email.toLowerCase().trim())
            .single();

        if (existing) {
            return res.status(409).json({ success: false, error: 'An agent with this email already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Insert agent
        const { data: agent, error: insertError } = await supabase
            .from('agents')
            .insert({
                name: name.trim(),
                email: email.toLowerCase().trim(),
                password_hash: passwordHash,
                phone: phone || null,
                commission_rate: parseFloat(commissionRate) || 0,
                status: 'active',
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (insertError) {
            console.error('❌ Failed to create agent:', insertError);
            return res.status(500).json({ success: false, error: 'Failed to create agent', details: insertError.message });
        }

        // Remove password hash from response
        const { password_hash, ...agentData } = agent;

        console.log('✅ Agent created:', agent.email);

        return res.json({ success: true, agent: agentData });
    } catch (error) {
        console.error('❌ Create agent error:', error);
        return res.status(500).json({ success: false, error: 'Failed to create agent', details: error.message });
    }
}

/**
 * List Agents (Admin only)
 */
export async function handleListAgents(req, res) {
    try {
        const { data: agents, error } = await supabase
            .from('agents')
            .select('id, name, email, phone, status, commission_rate, created_at')
            .order('created_at', { ascending: false });

        if (error) {
            return res.status(500).json({ success: false, error: 'Failed to fetch agents', details: error.message });
        }

        // Get stats per agent
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

            return {
                ...agent,
                totalLinks: linkCount || 0,
                totalRevenue: totalRevenue
            };
        }));

        return res.json({ success: true, data: enrichedAgents, total: enrichedAgents.length });
    } catch (error) {
        console.error('❌ List agents error:', error);
        return res.status(500).json({ success: false, error: 'Failed to list agents', details: error.message });
    }
}

/**
 * Update Agent (Admin only)
 */
export async function handleUpdateAgent(req, res) {
    if (req.method !== 'POST' && req.method !== 'PUT') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

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

    try {
        const agentId = req.body?.agentId || req.query?.agentId;

        if (!agentId) {
            return res.status(400).json({ success: false, error: 'Agent ID is required' });
        }

        // Soft delete — set to inactive
        const { data: agent, error } = await supabase
            .from('agents')
            .update({ status: 'inactive', updated_at: new Date().toISOString() })
            .eq('id', agentId)
            .select('id, name, email, status')
            .single();

        if (error) {
            return res.status(500).json({ success: false, error: 'Failed to deactivate agent', details: error.message });
        }

        console.log('✅ Agent deactivated:', agent.email);
        return res.json({ success: true, agent, message: 'Agent deactivated successfully' });
    } catch (error) {
        console.error('❌ Delete agent error:', error);
        return res.status(500).json({ success: false, error: 'Failed to deactivate agent', details: error.message });
    }
}


