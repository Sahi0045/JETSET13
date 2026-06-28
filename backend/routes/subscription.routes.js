import express from 'express';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const router = express.Router();

const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function requireSupabase(req, res, next) {
    if (!supabase) {
        return res.status(503).json({
            success: false,
            message: 'Subscription service unavailable: configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
        });
    }
    next();
}

router.use(requireSupabase);

const ARC_PAY_CONFIG = {
    API_URL: process.env.ARC_PAY_API_URL,
    MERCHANT_ID: process.env.ARC_PAY_MERCHANT_ID,
    API_USERNAME: process.env.ARC_PAY_API_USERNAME,
    API_PASSWORD: process.env.ARC_PAY_API_PASSWORD,
    BASE_URL: process.env.ARC_PAY_BASE_URL || 'https://api.arcpay.travel/api/rest/version/77',
    PORTAL_URL: process.env.ARC_PAY_PORTAL_URL || 'https://api.arcpay.travel/ma/',
};

function arcOrderPaymentSuccess(transaction) {
    if (!transaction) return false;
    const arr = transaction.transaction || [];
    const latestTxn = arr[arr.length - 1];
    const result = latestTxn?.result || transaction.result;
    const gatewayCode = latestTxn?.response?.gatewayCode || transaction.response?.gatewayCode;
    return result === 'SUCCESS' && (gatewayCode === 'APPROVED' || !gatewayCode);
}

function subscriptionEndDate(planType) {
    const end = new Date();
    if (planType && String(planType).includes('annual')) {
        end.setFullYear(end.getFullYear() + 1);
    } else {
        end.setMonth(end.getMonth() + 1);
    }
    return end.toISOString();
}

async function activateSubscriptionRow(subRow) {
    const planId = subRow.plan_type;
    const endDate = subscriptionEndDate(planId);
    await supabase
        .from('user_subscriptions')
        .update({ status: 'active', end_date: endDate })
        .eq('transaction_id', subRow.transaction_id);
    await supabase
        .from('users')
        .update({
            subscription_tier: planId,
            subscription_end_date: endDate,
        })
        .eq('id', subRow.user_id);
}

// POST /api/subscription/checkout
router.post('/checkout', async (req, res) => {
    try {
        const { planId, planName, price, email, userId } = req.body;

        if (!planId || !price || !email || !userId) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const arcMerchantId = ARC_PAY_CONFIG.MERCHANT_ID;
        const arcApiPassword = ARC_PAY_CONFIG.API_PASSWORD;
        const arcBaseUrl = ARC_PAY_CONFIG.BASE_URL;

        if (!arcMerchantId || !arcApiPassword) {
            throw new Error('ARC Pay credentials not properly loaded');
        }

        const authHeader = 'Basic ' + Buffer.from(`merchant.${arcMerchantId}:${arcApiPassword}`).toString('base64');
        const transactionRef = `SUB-${Date.now()}-${uuidv4().substring(0, 8)}`;
        // Return to the ORIGIN the checkout was started from, so a payment initiated on
        // localhost comes back to localhost (and completes against the same backend/ARC
        // session) instead of bouncing to the prod site. Falls back to an explicit
        // returnOrigin from the client, then FRONTEND_URL for callers without an Origin.
        const frontend =
            req.get('origin') ||
            req.body?.returnOrigin ||
            process.env.FRONTEND_URL ||
            'http://localhost:5173';

        // Mirror the proven hosted-checkout payload (apiOperation INITIATE_CHECKOUT).
        // The previous "DEFAULT" operation rejected customer.email / order.description.
        const orderData = {
            apiOperation: 'INITIATE_CHECKOUT',
            interaction: {
                operation: 'PURCHASE',
                returnUrl: `${frontend}/membership?status=success&tx=${transactionRef}`,
                cancelUrl: `${frontend}/membership?status=cancel`,
                merchant: { name: 'Jetsetter Travel' },
                displayControl: { billingAddress: 'MANDATORY', customerEmail: 'MANDATORY' },
                timeout: 900
            },
            order: {
                id: transactionRef,
                reference: transactionRef,
                amount: parseFloat(price).toFixed(2),
                currency: 'USD',
                description: `Subscription ${planName}`
            },
            customer: { email }
        };

        const response = await axios.post(
            `${arcBaseUrl}/merchant/${arcMerchantId}/session`,
            orderData,
            {
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            }
        );

        const sessionId = response.data?.session?.id || response.data?.sessionId || response.data?.id;

        if (sessionId) {
            // Clean up this user's prior UNPAID pending intents so retries/abandoned
            // checkouts don't pile up duplicate rows. Only 'pending' is removed — active,
            // cancelled and expired rows are preserved for history.
            await supabase
                .from('user_subscriptions')
                .delete()
                .eq('user_id', userId)
                .eq('status', 'pending');

            // Save the new pending subscription intent
            await supabase.from('user_subscriptions').insert([{
                user_id: userId,
                plan_type: planId,
                status: 'pending',
                end_date: new Date().toISOString(), // Will be updated on success
                transaction_id: transactionRef
            }]);

            res.json({
                success: true,
                checkoutUrl: `https://api.arcpay.travel/checkout/pay/${sessionId}`,
                sessionId,
                orderId: transactionRef
            });
        } else {
            console.error('Unexpected ARC Pay response:', response.data);
            throw new Error('Failed to create payment session format');
        }
    } catch (error) {
        console.error('Subscription Checkout Error:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to initiate checkout',
            error: error.response?.data?.error?.explanation || error.message
        });
    }
});

// POST /api/subscription/complete — after ARC returnUrl (?status=success&tx=ORDER_ID)
router.post('/complete', async (req, res) => {
    try {
        const { transactionId, userId } = req.body;
        if (!transactionId || typeof transactionId !== 'string') {
            return res.status(400).json({ success: false, message: 'transactionId is required' });
        }

        const { data: sub, error: findErr } = await supabase
            .from('user_subscriptions')
            .select('*')
            .eq('transaction_id', transactionId.trim())
            .maybeSingle();

        if (findErr) throw findErr;
        if (!sub) {
            return res.status(404).json({ success: false, message: 'Subscription not found for this payment.' });
        }
        if (userId && sub.user_id !== userId) {
            return res.status(403).json({ success: false, message: 'Not allowed.' });
        }

        if (sub.status === 'active') {
            return res.json({ success: true, alreadyActive: true });
        }

        // Only a PENDING subscription may be activated. If an admin cancelled/expired it,
        // do NOT resurrect it just because the success tx is still in the URL on refresh
        // (the ARC order stays "paid" forever, so /complete would otherwise reactivate it).
        if (sub.status !== 'pending') {
            return res.json({
                success: false,
                message: 'This subscription is no longer active. Please contact support if this is unexpected.',
            });
        }

        const arcMerchantId = ARC_PAY_CONFIG.MERCHANT_ID;
        const arcApiPassword = ARC_PAY_CONFIG.API_PASSWORD;
        if (!arcMerchantId || !arcApiPassword) {
            return res.status(503).json({ success: false, message: 'Payment verification unavailable.' });
        }

        const authHeader =
            'Basic ' + Buffer.from(`merchant.${arcMerchantId}:${arcApiPassword}`).toString('base64');
        let transaction;
        try {
            const orderResponse = await axios.get(
                `${ARC_PAY_CONFIG.BASE_URL}/merchant/${arcMerchantId}/order/${encodeURIComponent(transactionId.trim())}`,
                { headers: { Authorization: authHeader, Accept: 'application/json' }, timeout: 30000 }
            );
            transaction = orderResponse.data;
        } catch (e) {
            console.error('Subscription complete: ARC order fetch failed', e.response?.data || e.message);
            return res.status(502).json({
                success: false,
                message: 'Could not verify payment with ARC. Try again shortly or contact support.',
            });
        }

        if (!arcOrderPaymentSuccess(transaction)) {
            return res.json({
                success: false,
                message: 'Payment not completed or still processing.',
            });
        }

        await activateSubscriptionRow(sub);
        return res.json({ success: true, alreadyActive: false });
    } catch (error) {
        console.error('Subscription complete error:', error);
        return res.status(500).json({ success: false, message: 'Failed to complete subscription.' });
    }
});

// GET /api/subscription/status/:userId
router.get('/status/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('subscription_tier, subscription_end_date')
            .eq('id', userId)
            .maybeSingle();

        if (userError) throw userError;

        // No row yet → treat as a free (non-member) user instead of erroring.
        res.json({
            success: true,
            data: user || { subscription_tier: null, subscription_end_date: null },
        });
    } catch (error) {
        console.error('Status fetch error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch status' });
    }
});

// POST /api/subscription/webhook
router.post('/webhook', async (req, res) => {
    try {
        const { orderId, result } = req.body;

        if (result !== 'SUCCESS' || !orderId) {
            return res.json({ success: false, message: 'Payment not successful' });
        }

        const { data: sub, error } = await supabase
            .from('user_subscriptions')
            .select('*')
            .eq('transaction_id', orderId)
            .maybeSingle();

        if (error) throw error;
        if (!sub) {
            return res.status(404).json({ success: false, message: 'Unknown order' });
        }

        if (!sub.plan_type || !sub.user_id) {
            return res.status(400).json({ success: false, message: 'Invalid subscription row' });
        }

        if (sub.status === 'active') {
            return res.json({ success: true, message: 'Already active' });
        }

        await activateSubscriptionRow(sub);
        return res.json({ success: true, message: 'Subscription activated' });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ success: false, message: 'Webhook processing failed' });
    }
});

// GET /api/subscription (Admin: list all subscriptions)
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('user_subscriptions')
            .select(`
                *,
                users!inner(first_name, last_name, email)
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Map data to easier format
        const formattedData = data.map(sub => ({
            ...sub,
            user_email: sub.users?.email,
            user_name: `${sub.users?.first_name || ''} ${sub.users?.last_name || ''}`.trim() || 'Unknown User'
        }));

        res.json({ success: true, data: formattedData });
    } catch (error) {
        console.error('Admin Fetch subscriptions error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch subscriptions' });
    }
});

// PUT /api/subscription/:id (Admin: update subscription status)
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, plan_type, end_date } = req.body;

        // Build the update from provided fields only — never write an empty string into the
        // NOT NULL timestamptz end_date (that errors and leaves the row unchanged → the
        // dreaded "I changed it but nothing happened").
        const subUpdate = {};
        if (status !== undefined) subUpdate.status = status;
        if (plan_type !== undefined) subUpdate.plan_type = plan_type;
        if (end_date) subUpdate.end_date = end_date;

        const { data: subData, error: subError } = await supabase
            .from('user_subscriptions')
            .update(subUpdate)
            .eq('id', id)
            .select()
            .single();

        if (subError) throw subError;

        // Recompute the user's membership from ALL their subscription rows (source of truth)
        // so an admin change ALWAYS reflects on the user side. A user is a member iff they
        // have at least one ACTIVE, non-expired subscription — this correctly handles users
        // with multiple rows (several pending + one active, etc.).
        if (subData && subData.user_id) {
            const { data: rows } = await supabase
                .from('user_subscriptions')
                .select('plan_type, status, end_date')
                .eq('user_id', subData.user_id)
                .eq('status', 'active');

            const now = Date.now();
            const activeRow = (rows || [])
                .filter((r) => !r.end_date || new Date(r.end_date).getTime() > now)
                .sort((a, b) => new Date(b.end_date || 0) - new Date(a.end_date || 0))[0];

            const { error: userErr } = await supabase
                .from('users')
                .update({
                    subscription_tier: activeRow ? activeRow.plan_type : null,
                    subscription_end_date: activeRow ? activeRow.end_date : null,
                })
                .eq('id', subData.user_id);
            if (userErr) console.error('⚠️ users membership sync failed:', userErr.message);
        }

        res.json({ success: true, message: 'Subscription updated successfully', data: subData });
    } catch (error) {
        console.error('Update subscription error:', error);
        res.status(500).json({ success: false, message: 'Failed to update subscription' });
    }
});

export default router;
