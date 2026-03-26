import express from 'express';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const router = express.Router();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

const ARC_PAY_CONFIG = {
    API_URL: process.env.ARC_PAY_API_URL || 'https://api.arcpay.travel/api/rest/version/77/merchant/TESTARC05511704',
    MERCHANT_ID: process.env.ARC_PAY_MERCHANT_ID || 'TESTARC05511704',
    API_USERNAME: process.env.ARC_PAY_API_USERNAME || 'TESTARC05511704',
    API_PASSWORD: process.env.ARC_PAY_API_PASSWORD,
    BASE_URL: process.env.ARC_PAY_BASE_URL || 'https://api.arcpay.travel/api/rest/version/77',
};

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

        const orderData = {
            apiOperation: "DEFAULT",
            order: {
                id: transactionRef,
                amount: price,
                currency: "USD",
                description: `Subscription: ${planName}`
            },
            interaction: {
                operation: "PURCHASE",
                merchant: {
                    name: "Jetsetter Travel",
                    logo: "https://www.jetsetterss.com/logo.png"
                },
                returnUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/membership?status=success&tx=${transactionRef}`,
                cancelUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/membership?status=cancel`
            },
            customer: {
                email: email
            }
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

        if (response.data && response.data.session && response.data.session.id) {
            // Save pending subscription intent
            await supabase.from('user_subscriptions').insert([{
                user_id: userId,
                plan_type: planId,
                status: 'pending',
                end_date: new Date().toISOString(), // Will be updated on success
                transaction_id: transactionRef
            }]);

            res.json({
                success: true,
                checkoutUrl: `${ARC_PAY_CONFIG.PORTAL_URL || 'https://api.arcpay.travel/ma/'}checkout/enterCard.html?merchantSearchId=${arcMerchantId}&session.id=${response.data.session.id}`,
                sessionId: response.data.session.id,
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

// GET /api/subscription/status/:userId
router.get('/status/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('subscription_tier, subscription_end_date')
            .eq('id', userId)
            .single();

        if (userError) throw userError;

        res.json({ success: true, data: user });
    } catch (error) {
        console.error('Status fetch error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch status' });
    }
});

// POST /api/subscription/webhook
router.post('/webhook', async (req, res) => {
    try {
        // Here we handle the ARC Pay completion
        const { orderId, result, planId, userId } = req.body;

        if (result === 'SUCCESS') {
            const endDate = new Date();
            if (planId.includes('annual')) {
                endDate.setFullYear(endDate.getFullYear() + 1);
            } else {
                endDate.setMonth(endDate.getMonth() + 1);
            }

            // Update user_subscriptions table
            await supabase
                .from('user_subscriptions')
                .update({ status: 'active', end_date: endDate.toISOString() })
                .eq('transaction_id', orderId);

            // Update users table
            await supabase
                .from('users')
                .update({ 
                    subscription_tier: planId,
                    subscription_end_date: endDate.toISOString()
                })
                .eq('id', userId);

            res.json({ success: true, message: 'Subscription activated' });
        } else {
            res.json({ success: false, message: 'Payment not successful' });
        }
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

        // Update user_subscriptions table
        const { data: subData, error: subError } = await supabase
            .from('user_subscriptions')
            .update({ status, plan_type, end_date })
            .eq('id', id)
            .select()
            .single();

        if (subError) throw subError;

        // Also update the users table if active
        if (subData && subData.user_id) {
            const userUpdate = {
                subscription_tier: status === 'active' ? plan_type : null,
                subscription_end_date: status === 'active' ? end_date : null
            };
            await supabase
                .from('users')
                .update(userUpdate)
                .eq('id', subData.user_id);
        }

        res.json({ success: true, message: 'Subscription updated successfully', data: subData });
    } catch (error) {
        console.error('Update subscription error:', error);
        res.status(500).json({ success: false, message: 'Failed to update subscription' });
    }
});

export default router;
