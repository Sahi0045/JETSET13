#!/usr/bin/env node

/**
 * ARC Pay Certification Test Script
 * Tests all required operations for ARC Pay integration certification
 *
 * Standard Features to Test:
 * ✓ Payment (PAY or Authorization)
 * ✓ Voids
 * ✓ Capture
 * ✓ Retrieve
 * ✓ Refunds
 *
 * Optional Features:
 * ✓ Authentication (3DS)
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const ARC_PAY_CONFIG = {
  MERCHANT_ID: process.env.ARC_PAY_MERCHANT_ID || 'TESTARC05511704',
  API_PASSWORD: process.env.ARC_PAY_API_PASSWORD || '4d41a81750f1ee3f6aa4adf0dfd6310c',
  BASE_URL: process.env.ARC_PAY_BASE_URL || 'https://api.arcpay.travel/api/rest/version/77'
};

// Test Cards (Official ARC Pay Test Cards)
const TEST_CARDS = {
  FRICTIONLESS_MC: {
    number: '5123456789012346',
    expiry: { month: '01', year: '39' },
    cvv: '100',
    name: 'Test Cardholder',
    description: 'Mastercard - Frictionless 3DS (Y)'
  },
  CHALLENGE_MC: {
    number: '5123450000000008',
    expiry: { month: '01', year: '39' },
    cvv: '100',
    name: 'Test Cardholder',
    description: 'Mastercard - Challenge 3DS (C)'
  },
  DECLINED_MC: {
    number: '5123456789012346',
    expiry: { month: '05', year: '39' }, // Expiry 05/39 = DECLINED
    cvv: '100',
    name: 'Test Cardholder',
    description: 'Mastercard - Will be DECLINED'
  }
};

// Helper function to create auth header
function getAuthHeader() {
  const authString = `merchant.${ARC_PAY_CONFIG.MERCHANT_ID}:${ARC_PAY_CONFIG.API_PASSWORD}`;
  return 'Basic ' + Buffer.from(authString).toString('base64');
}

// Helper function to generate unique order ID
function generateOrderId() {
  return `TEST-CERT-${Date.now()}`;
}

// Test results tracking
const testResults = {
  passed: [],
  failed: [],
  warnings: []
};

function logTest(name, status, details = '') {
  const emoji = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${emoji} ${name}: ${status}`);
  if (details) console.log(`   ${details}`);

  if (status === 'PASS') testResults.passed.push(name);
  else if (status === 'FAIL') testResults.failed.push({ name, details });
  else testResults.warnings.push({ name, details });
}

// Wait helper
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================
// TEST 1: CREATE SESSION (INITIATE_CHECKOUT)
// ============================================
async function testCreateSession() {
  console.log('\n📝 TEST 1: Create Hosted Checkout Session');
  console.log('='.repeat(60));

  try {
    const orderId = generateOrderId();
    const sessionUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/session`;

    const requestBody = {
      apiOperation: 'INITIATE_CHECKOUT',
      interaction: {
        operation: 'PURCHASE',
        returnUrl: 'https://www.jetsetterss.com/payment/callback',
        cancelUrl: 'https://www.jetsetterss.com/payment/cancelled',
        merchant: {
          name: 'JetSetters'
        }
      },
      order: {
        id: orderId,
        amount: '10.00',
        currency: 'USD',
        description: 'Certification Test - Create Session'
      }
    };

    console.log('Endpoint:', sessionUrl);
    console.log('Order ID:', orderId);

    const response = await fetch(sessionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader(),
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    console.log('Response Status:', response.status);

    if (!response.ok) {
      logTest('Create Session', 'FAIL', `HTTP ${response.status}: ${responseText.substring(0, 200)}`);
      return null;
    }

    const sessionData = JSON.parse(responseText);
    const sessionId = sessionData.session?.id || sessionData.sessionId || sessionData.id;

    if (sessionId) {
      logTest('Create Session', 'PASS', `Session ID: ${sessionId}`);
      return { orderId, sessionId, sessionData };
    } else {
      logTest('Create Session', 'FAIL', 'No session ID in response');
      return null;
    }
  } catch (error) {
    logTest('Create Session', 'FAIL', error.message);
    return null;
  }
}

// ============================================
// TEST 2: AUTHENTICATE PAYER (3DS)
// ============================================
async function testAuthenticate() {
  console.log('\n🔐 TEST 2: Authenticate Payer (3DS)');
  console.log('='.repeat(60));

  try {
    const orderId = generateOrderId();
    const authUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${orderId}/transaction/auth-${Date.now()}`;

    const card = TEST_CARDS.FRICTIONLESS_MC;

    const requestBody = {
      apiOperation: 'AUTHENTICATE_PAYER',
      authentication: {
        acceptVersions: '3DS1,3DS2',
        channel: 'PAYER_BROWSER',
        purpose: 'PAYMENT_TRANSACTION'
      },
      order: {
        amount: '10.00',
        currency: 'USD'
      },
      sourceOfFunds: {
        type: 'CARD',
        provided: {
          card: {
            number: card.number,
            expiry: {
              month: card.expiry.month,
              year: card.expiry.year
            },
            securityCode: card.cvv
          }
        }
      },
      device: {
        browser: 'Mozilla/5.0',
        ipAddress: '127.0.0.1'
      }
    };

    console.log('Endpoint:', authUrl);
    console.log('Order ID:', orderId);
    console.log('Card:', card.description);

    const response = await fetch(authUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader(),
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    console.log('Response Status:', response.status);

    if (!response.ok) {
      logTest('3DS Authentication', 'FAIL', `HTTP ${response.status}: ${responseText.substring(0, 200)}`);
      return null;
    }

    const authData = JSON.parse(responseText);
    const transactionStatus = authData.authentication?.['3ds2']?.transactionStatus ||
      authData.transaction?.[0]?.authentication?.['3ds2']?.transactionStatus;
    const authStatus = authData.authenticationStatus || authData.order?.authenticationStatus;

    console.log('Transaction Status:', transactionStatus);
    console.log('Auth Status:', authStatus);

    if (transactionStatus === 'Y' && authStatus === 'AUTHENTICATION_SUCCESSFUL') {
      logTest('3DS Authentication', 'PASS', `Frictionless authentication successful (${transactionStatus})`);
      return { orderId, authData, transactionStatus };
    } else if (transactionStatus === 'C') {
      logTest('3DS Authentication', 'WARN', 'Challenge required - manual OTP entry needed');
      return { orderId, authData, transactionStatus };
    } else {
      logTest('3DS Authentication', 'FAIL', `Unexpected status: ${transactionStatus}`);
      return null;
    }
  } catch (error) {
    logTest('3DS Authentication', 'FAIL', error.message);
    return null;
  }
}

// ============================================
// TEST 3: PAY (Complete Payment)
// ============================================
async function testPay(authResult) {
  console.log('\n💳 TEST 3: PAY Operation');
  console.log('='.repeat(60));

  try {
    const orderId = authResult?.orderId || generateOrderId();
    const payTransactionId = `pay-${Date.now()}`;
    const payUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${orderId}/transaction/${payTransactionId}`;

    // Extract authentication transaction ID
    const authTransactionId = authResult?.authData?.authentication?.['3ds']?.transactionId ||
      authResult?.authData?.transaction?.[0]?.authentication?.['3ds']?.transactionId;

    const requestBody = {
      apiOperation: 'PAY',
      order: {
        amount: '10.00',
        currency: 'USD'
      },
      sourceOfFunds: {
        type: 'CARD'
      }
    };

    // Add authentication if available
    if (authTransactionId) {
      requestBody.authentication = {
        transactionId: authTransactionId
      };
      console.log('Using Authentication Transaction ID:', authTransactionId);
    }

    console.log('Endpoint:', payUrl);
    console.log('Order ID:', orderId);

    const response = await fetch(payUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader(),
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    console.log('Response Status:', response.status);

    if (!response.ok) {
      logTest('PAY Operation', 'FAIL', `HTTP ${response.status}: ${responseText.substring(0, 200)}`);
      return null;
    }

    const payData = JSON.parse(responseText);
    const result = payData.result || payData.transaction?.[0]?.result;
    const gatewayCode = payData.response?.gatewayCode || payData.transaction?.[0]?.response?.gatewayCode;

    console.log('Result:', result);
    console.log('Gateway Code:', gatewayCode);

    if (result === 'SUCCESS' && (gatewayCode === 'APPROVED' || gatewayCode === 'SUCCESS')) {
      logTest('PAY Operation', 'PASS', `Payment successful (${gatewayCode})`);
      return { orderId, payData };
    } else {
      logTest('PAY Operation', 'FAIL', `Result: ${result}, Gateway: ${gatewayCode}`);
      return null;
    }
  } catch (error) {
    logTest('PAY Operation', 'FAIL', error.message);
    return null;
  }
}

// ============================================
// TEST 4: RETRIEVE Order Status
// ============================================
async function testRetrieve(orderId) {
  console.log('\n🔍 TEST 4: RETRIEVE Operation');
  console.log('='.repeat(60));

  try {
    const retrieveUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${orderId}`;

    console.log('Endpoint:', retrieveUrl);
    console.log('Order ID:', orderId);

    const response = await fetch(retrieveUrl, {
      method: 'GET',
      headers: {
        'Authorization': getAuthHeader(),
        'Accept': 'application/json'
      }
    });

    const responseText = await response.text();
    console.log('Response Status:', response.status);

    if (!response.ok) {
      logTest('RETRIEVE Operation', 'FAIL', `HTTP ${response.status}: ${responseText.substring(0, 200)}`);
      return null;
    }

    const orderData = JSON.parse(responseText);
    console.log('Order Status:', orderData.status);
    console.log('Result:', orderData.result);

    if (orderData.status) {
      logTest('RETRIEVE Operation', 'PASS', `Order status: ${orderData.status}`);
      return orderData;
    } else {
      logTest('RETRIEVE Operation', 'FAIL', 'No status in response');
      return null;
    }
  } catch (error) {
    logTest('RETRIEVE Operation', 'FAIL', error.message);
    return null;
  }
}

// ============================================
// TEST 5: REFUND Operation
// ============================================
async function testRefund(orderId) {
  console.log('\n💸 TEST 5: REFUND Operation');
  console.log('='.repeat(60));

  try {
    const refundTransactionId = `refund-${Date.now()}`;
    const refundUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${orderId}/transaction/${refundTransactionId}`;

    const requestBody = {
      apiOperation: 'REFUND',
      transaction: {
        amount: '5.00', // Partial refund
        currency: 'USD'
      }
    };

    console.log('Endpoint:', refundUrl);
    console.log('Order ID:', orderId);
    console.log('Refund Amount: $5.00');

    const response = await fetch(refundUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader(),
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    console.log('Response Status:', response.status);

    if (!response.ok) {
      logTest('REFUND Operation', 'FAIL', `HTTP ${response.status}: ${responseText.substring(0, 200)}`);
      return null;
    }

    const refundData = JSON.parse(responseText);
    const result = refundData.result || refundData.transaction?.[0]?.result;

    console.log('Result:', result);

    if (result === 'SUCCESS') {
      logTest('REFUND Operation', 'PASS', 'Refund successful');
      return refundData;
    } else {
      logTest('REFUND Operation', 'FAIL', `Result: ${result}`);
      return null;
    }
  } catch (error) {
    logTest('REFUND Operation', 'FAIL', error.message);
    return null;
  }
}

// ============================================
// TEST 6: VOID Operation (Authorization cancellation)
// ============================================
async function testVoid() {
  console.log('\n🚫 TEST 6: VOID Operation');
  console.log('='.repeat(60));
  console.log('Note: This test creates an AUTHORIZE transaction, then voids it');

  try {
    // First, create an AUTHORIZE transaction
    const orderId = generateOrderId();
    const authTransactionId = `auth-${Date.now()}`;
    const authUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${orderId}/transaction/${authTransactionId}`;

    const card = TEST_CARDS.FRICTIONLESS_MC;

    const authBody = {
      apiOperation: 'AUTHORIZE',
      order: {
        amount: '10.00',
        currency: 'USD'
      },
      sourceOfFunds: {
        type: 'CARD',
        provided: {
          card: {
            number: card.number,
            expiry: {
              month: card.expiry.month,
              year: card.expiry.year
            },
            securityCode: card.cvv
          }
        }
      }
    };

    console.log('Step 1: Creating AUTHORIZE transaction...');
    const authResponse = await fetch(authUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader(),
        'Accept': 'application/json'
      },
      body: JSON.stringify(authBody)
    });

    if (!authResponse.ok) {
      const errorText = await authResponse.text();
      logTest('VOID Operation', 'FAIL', `Authorization failed: ${errorText.substring(0, 200)}`);
      return null;
    }

    const authData = await authResponse.json();
    console.log('Authorization Result:', authData.result);

    if (authData.result !== 'SUCCESS') {
      logTest('VOID Operation', 'FAIL', 'Authorization not successful');
      return null;
    }

    // Wait a moment
    await wait(1000);

    // Now VOID the authorization
    console.log('Step 2: Voiding the authorization...');
    const voidTransactionId = `void-${Date.now()}`;
    const voidUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${orderId}/transaction/${voidTransactionId}`;

    const voidBody = {
      apiOperation: 'VOID',
      transaction: {
        targetTransactionId: authTransactionId
      }
    };

    const voidResponse = await fetch(voidUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader(),
        'Accept': 'application/json'
      },
      body: JSON.stringify(voidBody)
    });

    const voidResponseText = await voidResponse.text();
    console.log('VOID Response Status:', voidResponse.status);

    if (!voidResponse.ok) {
      logTest('VOID Operation', 'FAIL', `HTTP ${voidResponse.status}: ${voidResponseText.substring(0, 200)}`);
      return null;
    }

    const voidData = JSON.parse(voidResponseText);
    const result = voidData.result || voidData.transaction?.[0]?.result;

    console.log('VOID Result:', result);

    if (result === 'SUCCESS') {
      logTest('VOID Operation', 'PASS', 'Authorization voided successfully');
      return voidData;
    } else {
      logTest('VOID Operation', 'FAIL', `Result: ${result}`);
      return null;
    }
  } catch (error) {
    logTest('VOID Operation', 'FAIL', error.message);
    return null;
  }
}

// ============================================
// TEST 7: CAPTURE Operation
// ============================================
async function testCapture() {
  console.log('\n💰 TEST 7: CAPTURE Operation');
  console.log('='.repeat(60));
  console.log('Note: This test creates an AUTHORIZE transaction, then captures it');

  try {
    // First, create an AUTHORIZE transaction
    const orderId = generateOrderId();
    const authTransactionId = `auth-${Date.now()}`;
    const authUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${orderId}/transaction/${authTransactionId}`;

    const card = TEST_CARDS.FRICTIONLESS_MC;

    const authBody = {
      apiOperation: 'AUTHORIZE',
      order: {
        amount: '10.00',
        currency: 'USD'
      },
      sourceOfFunds: {
        type: 'CARD',
        provided: {
          card: {
            number: card.number,
            expiry: {
              month: card.expiry.month,
              year: card.expiry.year
            },
            securityCode: card.cvv
          }
        }
      }
    };

    console.log('Step 1: Creating AUTHORIZE transaction...');
    const authResponse = await fetch(authUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader(),
        'Accept': 'application/json'
      },
      body: JSON.stringify(authBody)
    });

    if (!authResponse.ok) {
      const errorText = await authResponse.text();
      logTest('CAPTURE Operation', 'FAIL', `Authorization failed: ${errorText.substring(0, 200)}`);
      return null;
    }

    const authData = await authResponse.json();
    console.log('Authorization Result:', authData.result);

    if (authData.result !== 'SUCCESS') {
      logTest('CAPTURE Operation', 'FAIL', 'Authorization not successful');
      return null;
    }

    // Wait a moment
    await wait(1000);

    // Now CAPTURE the authorization
    console.log('Step 2: Capturing the authorization...');
    const captureTransactionId = `capture-${Date.now()}`;
    const captureUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${orderId}/transaction/${captureTransactionId}`;

    const captureBody = {
      apiOperation: 'CAPTURE',
      transaction: {
        amount: '10.00',
        currency: 'USD'
      }
    };

    const captureResponse = await fetch(captureUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader(),
        'Accept': 'application/json'
      },
      body: JSON.stringify(captureBody)
    });

    const captureResponseText = await captureResponse.text();
    console.log('CAPTURE Response Status:', captureResponse.status);

    if (!captureResponse.ok) {
      logTest('CAPTURE Operation', 'FAIL', `HTTP ${captureResponse.status}: ${captureResponseText.substring(0, 200)}`);
      return null;
    }

    const captureData = JSON.parse(captureResponseText);
    const result = captureData.result || captureData.transaction?.[0]?.result;

    console.log('CAPTURE Result:', result);

    if (result === 'SUCCESS') {
      logTest('CAPTURE Operation', 'PASS', 'Authorization captured successfully');
      return { orderId, captureData };
    } else {
      logTest('CAPTURE Operation', 'FAIL', `Result: ${result}`);
      return null;
    }
  } catch (error) {
    logTest('CAPTURE Operation', 'FAIL', error.message);
    return null;
  }
}

// ============================================
// MAIN TEST EXECUTION
// ============================================
async function runCertificationTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🎯 ARC PAY CERTIFICATION TEST SUITE');
  console.log('='.repeat(60));
  console.log(`Merchant ID: ${ARC_PAY_CONFIG.MERCHANT_ID}`);
  console.log(`Base URL: ${ARC_PAY_CONFIG.BASE_URL}`);
  console.log('='.repeat(60));

  // Test 1: Create Session
  const sessionResult = await testCreateSession();
  await wait(2000);

  // Test 2: 3DS Authentication
  const authResult = await testAuthenticate();
  await wait(2000);

  // Test 3: PAY
  const payResult = await testPay(authResult);
  await wait(2000);

  // Test 4: RETRIEVE
  if (payResult) {
    await testRetrieve(payResult.orderId);
    await wait(2000);

    // Test 5: REFUND
    await testRefund(payResult.orderId);
    await wait(2000);
  }

  // Test 6: VOID
  await testVoid();
  await wait(2000);

  // Test 7: CAPTURE
  await testCapture();

  // Print Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${testResults.passed.length}`);
  console.log(`❌ Failed: ${testResults.failed.length}`);
  console.log(`⚠️  Warnings: ${testResults.warnings.length}`);

  if (testResults.passed.length > 0) {
    console.log('\n✅ Passed Tests:');
    testResults.passed.forEach(test => console.log(`   - ${test}`));
  }

  if (testResults.failed.length > 0) {
    console.log('\n❌ Failed Tests:');
    testResults.failed.forEach(({ name, details }) => {
      console.log(`   - ${name}`);
      console.log(`     ${details}`);
    });
  }

  if (testResults.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    testResults.warnings.forEach(({ name, details }) => {
      console.log(`   - ${name}`);
      console.log(`     ${details}`);
    });
  }

  // Certification Checklist
  console.log('\n' + '='.repeat(60));
  console.log('📋 CERTIFICATION CHECKLIST');
  console.log('='.repeat(60));

  const checklist = {
    'Payment (PAY)': testResults.passed.includes('PAY Operation'),
    'Voids': testResults.passed.includes('VOID Operation'),
    'Capture': testResults.passed.includes('CAPTURE Operation'),
    'Retrieve': testResults.passed.includes('RETRIEVE Operation'),
    'Refunds': testResults.passed.includes('REFUND Operation'),
    'Authentication (3DS)': testResults.passed.includes('3DS Authentication')
  };

  Object.entries(checklist).forEach(([feature, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${feature}`);
  });

  const allPassed = Object.values(checklist).every(v => v);

  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('🎉 CERTIFICATION COMPLETE - ALL TESTS PASSED!');
    console.log('Your ARC Pay integration is ready for production.');
  } else {
    console.log('⚠️  CERTIFICATION INCOMPLETE');
    console.log('Some tests failed. Please review the errors above.');
  }
  console.log('='.repeat(60) + '\n');

  process.exit(allPassed ? 0 : 1);
}

// Run tests
runCertificationTests().catch(error => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});
