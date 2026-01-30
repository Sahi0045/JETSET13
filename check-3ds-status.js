#!/usr/bin/env node

/**
 * Check 3DS Authentication Status and Help Complete Transaction
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ARC_MERCHANT_ID = process.env.ARC_PAY_MERCHANT_ID || 'TESTARC05511704';
const ARC_API_PASSWORD = process.env.ARC_PAY_API_PASSWORD || '4d41a81750f1ee3f6aa4adf0dfd6310c';
const ARC_BASE_URL = process.env.ARC_PAY_BASE_URL || 'https://api.arcpay.travel/api/rest/version/77';

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const PAYMENT_ID = 'd3f1da3b-a38f-4a44-bb75-32964709f84c';

console.log('');
console.log('═'.repeat(80));
console.log('🔍 Checking 3DS Authentication Status');
console.log('═'.repeat(80));
console.log('');

async function checkStatus() {
  try {
    // 1. Get payment from database
    console.log('📋 Step 1: Fetching payment from database...');
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', PAYMENT_ID)
      .single();

    if (paymentError || !payment) {
      console.error('❌ Payment not found:', paymentError);
      return;
    }

    console.log('✅ Payment found:');
    console.log(`   Payment ID: ${payment.id}`);
    console.log(`   Status: ${payment.payment_status}`);
    console.log(`   ARC Session ID: ${payment.arc_session_id}`);
    console.log(`   Success Indicator: ${payment.success_indicator}`);
    console.log('');

    // 2. Check transaction status from ARC Pay
    console.log('📋 Step 2: Checking transaction status from ARC Pay API...');
    const authHeader = 'Basic ' + Buffer.from(`merchant.${ARC_MERCHANT_ID}:${ARC_API_PASSWORD}`).toString('base64');
    
    // Try to get order details
    const orderUrl = `${ARC_BASE_URL}/merchant/${ARC_MERCHANT_ID}/order/${payment.id}`;
    console.log(`   URL: ${orderUrl}`);
    
    const orderResponse = await fetch(orderUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });

    if (!orderResponse.ok) {
      const errorText = await orderResponse.text();
      console.error(`❌ Failed to get order (${orderResponse.status}):`, errorText);
      console.log('');
      console.log('💡 This might mean:');
      console.log('   1. The transaction is still pending 3DS completion');
      console.log('   2. You need to complete the 3DS challenge on the payment page');
      console.log('   3. The redirect back from ARC Pay hasn\'t happened yet');
      return;
    }

    const orderData = await orderResponse.json();
    console.log('✅ Order details retrieved:');
    console.log(`   Status: ${orderData.status || 'N/A'}`);
    console.log(`   Result: ${orderData.result || 'N/A'}`);
    console.log(`   Authentication Status: ${orderData.authenticationStatus || 'N/A'}`);
    console.log('');

    // 3. Check if transaction is completed
    if (orderData.result === 'SUCCESS' && orderData.status !== 'AUTHENTICATION_INITIATED') {
      console.log('✅ Payment appears to be completed!');
      console.log('   Updating database status...');
      
      // Update payment status
      await supabase
        .from('payments')
        .update({
          payment_status: 'completed',
          completed_at: new Date().toISOString(),
          metadata: { orderData }
        })
        .eq('id', payment.id);

      // Update quote status
      await supabase
        .from('quotes')
        .update({
          payment_status: 'paid',
          paid_at: new Date().toISOString(),
          status: 'paid'
        })
        .eq('id', payment.quote_id);

      console.log('✅ Database updated!');
    } else {
      console.log('⏳ Payment is still pending 3DS authentication');
      console.log('');
      console.log('📝 To complete the payment:');
      console.log('   1. Go back to the ARC Pay payment page');
      console.log('   2. Complete the 3DS challenge (enter OTP if prompted)');
      console.log('   3. You will be redirected back automatically');
      console.log('');
      console.log('💡 If you\'re stuck on the 3DS page:');
      console.log('   - Check your email/SMS for the OTP');
      console.log('   - For test cards, use any 6-digit number (e.g., 123456)');
      console.log('   - Or try: 000000, 111111, 123456');
    }

    console.log('');
    console.log('═'.repeat(80));
    console.log('📊 Summary');
    console.log('═'.repeat(80));
    console.log(`Payment ID: ${payment.id}`);
    console.log(`Database Status: ${payment.payment_status}`);
    console.log(`ARC Pay Status: ${orderData.status || 'Unknown'}`);
    console.log(`ARC Pay Result: ${orderData.result || 'Unknown'}`);
    console.log(`3DS Status: ${orderData.authenticationStatus || 'Unknown'}`);
    console.log('═'.repeat(80));

  } catch (error) {
    console.error('');
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

checkStatus();

