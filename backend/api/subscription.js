import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

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
  PORTAL_URL: process.env.ARC_PAY_PORTAL_URL || 'https://api.arcpay.travel/ma/',
};

export default async function handler(req, res) {
  // CORS configuration
  const rawCorsOrigin = (process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGIN || '').trim();
  const origin = req.headers.origin;

  let isAllowed = false;
  if (rawCorsOrigin === '*') {
    isAllowed = true;
  } else if (rawCorsOrigin) {
    const allowed = rawCorsOrigin.split(',').map(o => o.trim()).filter(Boolean);
    if (allowed.includes(origin)) {
      isAllowed = true;
    }
  } else {
    isAllowed = origin && origin.includes('jetsetterss.com');
  }

  // Fallback for missing origin (e.g., server-to-server or webhook calls)
  if (!origin) isAllowed = true;

  if (isAllowed && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://www.jetsetterss.com');
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action } = req.query;

  if (req.method === 'POST' && action === 'checkout') {
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
        await supabase.from('user_subscriptions').insert([{
          user_id: userId,
          plan_type: planId,
          status: 'pending',
          end_date: new Date().toISOString(),
          transaction_id: transactionRef
        }]);

        return res.json({
          success: true,
          checkoutUrl: `${ARC_PAY_CONFIG.PORTAL_URL || 'https://api.arcpay.travel/ma/'}checkout/enterCard.html?merchantSearchId=${arcMerchantId}&session.id=${response.data.session.id}`,
          sessionId: response.data.session.id,
          orderId: transactionRef
        });
      } else {
        throw new Error('Failed to create payment session format');
      }
    } catch (error) {
      console.error('Subscription Checkout Error:', error.response?.data || error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to initiate checkout',
        error: error.response?.data?.error?.explanation || error.message
      });
    }
  }

  if (req.method === 'GET' && action === 'status') {
    try {
      const { userId } = req.query;
      
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('subscription_tier, subscription_end_date')
        .eq('id', userId)
        .single();

      if (userError) throw userError;

      return res.json({ success: true, data: user });
    } catch (error) {
      console.error('Status fetch error:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch status' });
    }
  }

  if (req.method === 'POST' && action === 'webhook') {
    try {
      const { orderId, result, planId, userId } = req.body;

      if (result === 'SUCCESS') {
        const endDate = new Date();
        if (planId.includes('annual')) {
          endDate.setFullYear(endDate.getFullYear() + 1);
        } else {
          endDate.setMonth(endDate.getMonth() + 1);
        }

        await supabase
          .from('user_subscriptions')
          .update({ status: 'active', end_date: endDate.toISOString() })
          .eq('transaction_id', orderId);

        await supabase
          .from('users')
          .update({ 
            subscription_tier: planId,
            subscription_end_date: endDate.toISOString()
          })
          .eq('id', userId);

        return res.json({ success: true, message: 'Subscription activated' });
      } else {
        return res.json({ success: false, message: 'Payment not successful' });
      }
    } catch (error) {
      console.error('Webhook error:', error);
      return res.status(500).json({ success: false, message: 'Webhook processing failed' });
    }
  }

  return res.status(404).json({ success: false, message: 'Invalid action or method' });
}
