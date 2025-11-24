#!/usr/bin/env node

/**
 * Fix Authenticated Payment - Manually call PAY for authenticated orders
 * Use this when a payment is stuck at AUTHENTICATED status
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const ARC_PAY_CONFIG = {
  MERCHANT_ID: process.env.ARC_PAY_MERCHANT_ID || 'TESTARC05511704',
  API_PASSWORD: process.env.ARC_PAY_API_PASSWORD || '4d41a81750f1ee3f6aa4adf0dfd6310c',
  BASE_URL: process.env.ARC_PAY_BASE_URL || 'https://api.arcpay.travel/api/rest/version/100'
};

function getAuthHeader() {
  const authString = `merchant.${ARC_PAY_CONFIG.MERCHANT_ID}:${ARC_PAY_CONFIG.API_PASSWORD}`;
  return 'Basic ' + Buffer.from(authString).toString('base64');
}

async function checkAndFixPayment(orderId) {
  console.log('\n' + '='.repeat(70));
  console.log('🔧 FIX AUTHENTICATED PAYMENT');
  console.log('='.repeat(70));
  console.log('Order ID:', orderId);
  console.log('='.repeat(70) + '\n');

  try {
    // Step 1: Retrieve order status
    console.log('📥 Step 1: Retrieving order status...\n');

    const retrieveUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${orderId}`;

    const retrieveResponse = await fetch(retrieveUrl, {
      method: 'GET',
      headers: {
        'Authorization': getAuthHeader(),
        'Accept': 'application/json'
      }
    });

    if (!retrieveResponse.ok) {
      const errorText = await retrieveResponse.text();
      console.error('❌ Failed to retrieve order:', errorText);
      process.exit(1);
    }

    const orderData = await retrieveResponse.json();

    console.log('Order Details:');
    console.log('   Status:', orderData.status);
    console.log('   Result:', orderData.result);
    console.log('   Amount:', orderData.amount, orderData.currency);
    console.log('   Auth Status:', orderData.authenticationStatus);
    console.log('   Total Captured:', orderData.totalCapturedAmount);
    console.log('   Total Authorized:', orderData.totalAuthorizedAmount);

    // Check if order is authenticated but not captured
    if (orderData.status !== 'AUTHENTICATED') {
      console.log('\n⚠️  Order status is not AUTHENTICATED (current: ' + orderData.status + ')');
      console.log('This script is only for fixing AUTHENTICATED orders.');
      console.log('Current order status:', orderData.status);
      process.exit(0);
    }

    if (orderData.totalCapturedAmount > 0) {
      console.log('\n✅ Order already captured! Amount:', orderData.totalCapturedAmount);
      process.exit(0);
    }

    console.log('\n⚠️  Order is AUTHENTICATED but not captured!');
    console.log('This means 3DS succeeded but PAY was not called.\n');

    // Step 2: Find authentication transaction ID
    console.log('📥 Step 2: Finding authentication transaction ID...\n');

    const transactions = orderData.transaction || [];
    console.log('Found', transactions.length, 'transaction(s)');

    let authTransactionId = null;

    // Search for authentication transaction
    for (let i = transactions.length - 1; i >= 0; i--) {
      const txn = transactions[i];

      console.log(`\nTransaction ${i}:`, {
        type: txn.transaction?.type || txn.type,
        result: txn.result,
        hasAuth: !!txn.authentication
      });

      if (txn.transaction?.type === 'AUTHENTICATION' || txn.type === 'AUTHENTICATION') {
        // Check for 3ds structure
        if (txn.authentication?.['3ds']?.transactionId) {
          authTransactionId = txn.authentication['3ds'].transactionId;
          console.log('✅ Found auth transaction ID (3ds):', authTransactionId);
          break;
        }
        // Check for direct transactionId
        if (txn.authentication?.transactionId) {
          authTransactionId = txn.authentication.transactionId;
          console.log('✅ Found auth transaction ID (direct):', authTransactionId);
          break;
        }
      }
    }

    // Also check order-level authentication
    if (!authTransactionId && orderData.authentication?.['3ds']?.transactionId) {
      authTransactionId = orderData.authentication['3ds'].transactionId;
      console.log('✅ Found auth transaction ID (order level):', authTransactionId);
    }

    if (!authTransactionId) {
      console.error('\n❌ Could not find authentication transaction ID');
      console.log('Full order data:', JSON.stringify(orderData, null, 2));
      process.exit(1);
    }

    // Step 3: Call PAY
    console.log('\n📤 Step 3: Calling PAY operation...\n');

    const payTransactionId = `pay-manual-${Date.now()}`;
    const payUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${orderId}/transaction/${payTransactionId}`;

    // For Hosted Checkout, we need to reference the session
    const payRequestBody = {
      apiOperation: 'PAY',
      authentication: {
        transactionId: authTransactionId
      },
      order: {
        amount: parseFloat(orderData.amount).toFixed(2),
        currency: orderData.currency || 'USD'
      },
      session: {
        id: orderData.sessionId || null
      }
    };

    // Remove session if not available
    if (!payRequestBody.session.id) {
      delete payRequestBody.session;
    }

    console.log('PAY Request:');
    console.log('   URL:', payUrl);
    console.log('   Auth Transaction ID:', authTransactionId);
    console.log('   Amount:', payRequestBody.order.amount, payRequestBody.order.currency);

    const payResponse = await fetch(payUrl, {
      method: 'PUT',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payRequestBody)
    });

    const payResponseText = await payResponse.text();
    console.log('\nPAY Response Status:', payResponse.status);

    if (!payResponse.ok) {
      console.error('❌ PAY failed!');
      console.error('Response:', payResponseText);
      process.exit(1);
    }

    const payData = JSON.parse(payResponseText);

    console.log('\n✅ PAY SUCCESSFUL!');
    console.log('   Result:', payData.result);
    console.log('   Gateway Code:', payData.response?.gatewayCode);
    console.log('   Order Status:', payData.order?.status);
    console.log('   Total Captured:', payData.order?.totalCapturedAmount);

    console.log('\n' + '='.repeat(70));
    console.log('🎉 Payment completed successfully!');
    console.log('='.repeat(70));
    console.log('\nFull PAY response:');
    console.log(JSON.stringify(payData, null, 2));

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Get order ID from command line
const orderId = process.argv[2];

if (!orderId) {
  console.error('Usage: node fix-authenticated-payment.js <ORDER_ID>');
  console.error('Example: node fix-authenticated-payment.js adb3715a-e1c8-4979-bb97-7dfcb7032f04');
  process.exit(1);
}

checkAndFixPayment(orderId);
