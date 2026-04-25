/**
 * ARC Pay Certification Test Script
 * 
 * This script helps complete all required transaction types for ARC Pay certification:
 * - Payment (Pay/Authorization) ✅
 * - Authentication (3DS) ✅
 * - Refunds ✅
 * - Voids ✅
 * - Capture ✅
 * - Retrieve ✅
 * 
 * Run this script to test each transaction type and ensure they complete successfully.
 */

const ARC_PAY_CONFIG = {
  merchantId: process.env.ARC_PAY_MERCHANT_ID || 'TESTARC05511704',
  apiPassword: process.env.ARC_PAY_API_PASSWORD || '4d41a81750f1ee3f6aa4adf0dfd6310c',
  baseUrl: process.env.ARC_PAY_BASE_URL || 'https://api.arcpay.travel/api/rest/version/77',
  portalUrl: process.env.ARC_PAY_PORTAL_URL || 'https://api.arcpay.travel/ma/'
};

// Test card numbers from ARC Pay documentation
const TEST_CARDS = {
  // 3DS Success Cards
  mastercard_3ds_success: {
    number: '5123456789012346',
    expiryMonth: '12',
    expiryYear: '2025',
    cvv: '123',
    name: 'Mastercard 3DS Success'
  },
  visa_3ds_success: {
    number: '4111111111111111',
    expiryMonth: '12',
    expiryYear: '2025',
    cvv: '123',
    name: 'Visa 3DS Success'
  },
  // Non-3DS Cards
  mastercard_no_3ds: {
    number: '5123456789012345',
    expiryMonth: '12',
    expiryYear: '2025',
    cvv: '123',
    name: 'Mastercard No 3DS'
  }
};

/**
 * Create Basic Auth header for ARC Pay
 */
function getAuthHeader() {
  const credentials = Buffer.from(`merchant.${ARC_PAY_CONFIG.merchantId}:${ARC_PAY_CONFIG.apiPassword}`).toString('base64');
  return `Basic ${credentials}`;
}

/**
 * Test 1: Complete Payment with 3DS Authentication
 * This is the critical missing piece - we need to complete 3DS successfully
 */
async function testPaymentWith3DS() {
  console.log('\n🧪 TEST 1: Payment with 3DS Authentication');
  console.log('='.repeat(60));
  
  try {
    // Step 1: Create session
    const sessionUrl = `${ARC_PAY_CONFIG.baseUrl}/merchant/${ARC_PAY_CONFIG.merchantId}/session`;
    const orderId = `TEST-3DS-${Date.now()}`;
    
    const sessionRequest = {
      apiOperation: 'INITIATE_CHECKOUT',
      interaction: {
        operation: 'PURCHASE',
        returnUrl: 'https://www.jetsetterss.com/payment/callback',
        cancelUrl: 'https://www.jetsetterss.com/payment/cancelled',
        merchant: {
          name: 'JetSet Travel'
        }
      },
      order: {
        id: orderId,
        amount: '100.00',
        currency: 'USD',
        description: 'Certification Test - 3DS Payment'
      }
    };

    console.log('📤 Creating session...');
    const sessionResponse = await fetch(sessionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader(),
        'Accept': 'application/json'
      },
      body: JSON.stringify(sessionRequest)
    });

    if (!sessionResponse.ok) {
      const errorText = await sessionResponse.text();
      throw new Error(`Session creation failed: ${sessionResponse.status} - ${errorText}`);
    }

    const sessionData = await sessionResponse.json();
    const sessionId = sessionData.session?.id || sessionData.sessionId;
    const successIndicator = sessionData.successIndicator || sessionData.success_indicator;

    if (!sessionId) {
      throw new Error('Session ID not found in response');
    }

    console.log('✅ Session created:', sessionId);
    console.log('   Success Indicator:', successIndicator);
    console.log('   Order ID:', orderId);

    // Step 2: Provide instructions for manual 3DS completion
    const paymentPageUrl = `https://api.arcpay.travel/api/page/version/77/pay?charset=UTF-8`;
    
    console.log('\n📋 IMPORTANT: Complete 3DS Authentication Manually');
    console.log('='.repeat(60));
    console.log('1. Open this URL in your browser:');
    console.log(`   ${paymentPageUrl}`);
    console.log('\n2. Use this form data (POST):');
    console.log(`   session.id = ${sessionId}`);
    console.log('\n3. Use this test card:');
    console.log(`   Card Number: ${TEST_CARDS.mastercard_3ds_success.number}`);
    console.log(`   Expiry: ${TEST_CARDS.mastercard_3ds_success.expiryMonth}/${TEST_CARDS.mastercard_3ds_success.expiryYear}`);
    console.log(`   CVV: ${TEST_CARDS.mastercard_3ds_success.cvv}`);
    console.log('\n4. When 3DS challenge appears:');
    console.log('   - Enter OTP: 123456 (or any 6 digits for test)');
    console.log('   - Complete the authentication');
    console.log('\n5. After successful payment, note the transaction ID');
    console.log('='.repeat(60));

    return {
      success: true,
      sessionId,
      orderId,
      successIndicator,
      paymentPageUrl,
      instructions: 'Complete 3DS manually using the provided URL and card details'
    };

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 2: Payment without 3DS (Simple Purchase)
 */
async function testPaymentWithout3DS() {
  console.log('\n🧪 TEST 2: Payment without 3DS (Simple Purchase)');
  console.log('='.repeat(60));
  
  try {
    const sessionUrl = `${ARC_PAY_CONFIG.baseUrl}/merchant/${ARC_PAY_CONFIG.merchantId}/session`;
    const orderId = `TEST-SIMPLE-${Date.now()}`;
    
    const sessionRequest = {
      apiOperation: 'INITIATE_CHECKOUT',
      interaction: {
        operation: 'PURCHASE',
        returnUrl: 'https://www.jetsetterss.com/payment/callback',
        cancelUrl: 'https://www.jetsetterss.com/payment/cancelled',
        merchant: {
          name: 'JetSet Travel'
        }
      },
      order: {
        id: orderId,
        amount: '50.00',
        currency: 'USD',
        description: 'Certification Test - Simple Payment'
      }
    };

    console.log('📤 Creating session...');
    const sessionResponse = await fetch(sessionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader(),
        'Accept': 'application/json'
      },
      body: JSON.stringify(sessionRequest)
    });

    if (!sessionResponse.ok) {
      const errorText = await sessionResponse.text();
      throw new Error(`Session creation failed: ${sessionResponse.status} - ${errorText}`);
    }

    const sessionData = await sessionResponse.json();
    const sessionId = sessionData.session?.id || sessionData.sessionId;

    console.log('✅ Session created:', sessionId);
    console.log('   Order ID:', orderId);
    console.log('\n📋 Use card without 3DS:');
    console.log(`   Card: ${TEST_CARDS.mastercard_no_3ds.number}`);
    console.log(`   Expiry: ${TEST_CARDS.mastercard_no_3ds.expiryMonth}/${TEST_CARDS.mastercard_no_3ds.expiryYear}`);

    return {
      success: true,
      sessionId,
      orderId
    };

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 3: Refund Transaction
 * Requires a completed payment transaction ID
 */
async function testRefund(transactionId, orderId, amount = '50.00') {
  console.log('\n🧪 TEST 3: Refund Transaction');
  console.log('='.repeat(60));
  
  if (!transactionId || !orderId) {
    console.log('⚠️  Skipping refund test - requires completed payment first');
    console.log('   Run payment test first, then provide transaction ID');
    return { success: false, error: 'Requires completed payment transaction' };
  }

  try {
    const refundUrl = `${ARC_PAY_CONFIG.baseUrl}/merchant/${ARC_PAY_CONFIG.merchantId}/order/${orderId}/transaction/${transactionId}`;
    
    const refundRequest = {
      apiOperation: 'REFUND',
      transaction: {
        amount: amount,
        currency: 'USD'
      }
    };

    console.log('📤 Processing refund...');
    console.log('   Order ID:', orderId);
    console.log('   Transaction ID:', transactionId);
    console.log('   Amount:', amount);

    const refundResponse = await fetch(refundUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader(),
        'Accept': 'application/json'
      },
      body: JSON.stringify(refundRequest)
    });

    if (!refundResponse.ok) {
      const errorText = await refundResponse.text();
      throw new Error(`Refund failed: ${refundResponse.status} - ${errorText}`);
    }

    const refundData = await refundResponse.json();
    console.log('✅ Refund successful!');
    console.log('   Result:', refundData.result);
    console.log('   Refund ID:', refundData.transaction?.id);

    return {
      success: true,
      refundData
    };

  } catch (error) {
    console.error('❌ Refund test failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 4: Retrieve Transaction
 */
async function testRetrieve(orderId, transactionId = '1') {
  console.log('\n🧪 TEST 4: Retrieve Transaction');
  console.log('='.repeat(60));
  
  if (!orderId) {
    console.log('⚠️  Skipping retrieve test - requires order ID');
    return { success: false, error: 'Requires order ID' };
  }

  try {
    const retrieveUrl = `${ARC_PAY_CONFIG.baseUrl}/merchant/${ARC_PAY_CONFIG.merchantId}/order/${orderId}/transaction/${transactionId}`;
    
    console.log('📤 Retrieving transaction...');
    console.log('   Order ID:', orderId);
    console.log('   Transaction ID:', transactionId);

    const retrieveResponse = await fetch(retrieveUrl, {
      method: 'GET',
      headers: {
        'Authorization': getAuthHeader(),
        'Accept': 'application/json'
      }
    });

    if (!retrieveResponse.ok) {
      const errorText = await retrieveResponse.text();
      throw new Error(`Retrieve failed: ${retrieveResponse.status} - ${errorText}`);
    }

    const transactionData = await retrieveResponse.json();
    console.log('✅ Transaction retrieved!');
    console.log('   Result:', transactionData.result);
    console.log('   Status:', transactionData.status);
    console.log('   Amount:', transactionData.order?.amount, transactionData.order?.currency);

    return {
      success: true,
      transactionData
    };

  } catch (error) {
    console.error('❌ Retrieve test failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 5: Authorization (Authorize only, no capture)
 */
async function testAuthorization() {
  console.log('\n🧪 TEST 5: Authorization (Authorize Only)');
  console.log('='.repeat(60));
  
  try {
    const sessionUrl = `${ARC_PAY_CONFIG.baseUrl}/merchant/${ARC_PAY_CONFIG.merchantId}/session`;
    const orderId = `TEST-AUTH-${Date.now()}`;
    
    const sessionRequest = {
      apiOperation: 'INITIATE_CHECKOUT',
      interaction: {
        operation: 'AUTHORIZE', // AUTHORIZE instead of PURCHASE
        returnUrl: 'https://www.jetsetterss.com/payment/callback',
        cancelUrl: 'https://www.jetsetterss.com/payment/cancelled',
        merchant: {
          name: 'JetSet Travel'
        }
      },
      order: {
        id: orderId,
        amount: '75.00',
        currency: 'USD',
        description: 'Certification Test - Authorization'
      }
    };

    console.log('📤 Creating authorization session...');
    const sessionResponse = await fetch(sessionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader(),
        'Accept': 'application/json'
      },
      body: JSON.stringify(sessionRequest)
    });

    if (!sessionResponse.ok) {
      const errorText = await sessionResponse.text();
      throw new Error(`Session creation failed: ${sessionResponse.status} - ${errorText}`);
    }

    const sessionData = await sessionResponse.json();
    const sessionId = sessionData.session?.id || sessionData.sessionId;

    console.log('✅ Authorization session created:', sessionId);
    console.log('   Order ID:', orderId);
    console.log('\n📋 Complete payment to authorize (not capture)');

    return {
      success: true,
      sessionId,
      orderId,
      operation: 'AUTHORIZE'
    };

  } catch (error) {
    console.error('❌ Authorization test failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 6: Capture (Capture a previous authorization)
 */
async function testCapture(orderId, transactionId) {
  console.log('\n🧪 TEST 6: Capture Transaction');
  console.log('='.repeat(60));
  
  if (!orderId || !transactionId) {
    console.log('⚠️  Skipping capture test - requires authorized transaction first');
    console.log('   Run authorization test first, then provide order and transaction IDs');
    return { success: false, error: 'Requires authorized transaction' };
  }

  try {
    const captureUrl = `${ARC_PAY_CONFIG.baseUrl}/merchant/${ARC_PAY_CONFIG.merchantId}/order/${orderId}/transaction/${transactionId}`;
    
    const captureRequest = {
      apiOperation: 'CAPTURE',
      transaction: {
        amount: '75.00',
        currency: 'USD'
      }
    };

    console.log('📤 Processing capture...');
    console.log('   Order ID:', orderId);
    console.log('   Transaction ID:', transactionId);

    const captureResponse = await fetch(captureUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader(),
        'Accept': 'application/json'
      },
      body: JSON.stringify(captureRequest)
    });

    if (!captureResponse.ok) {
      const errorText = await captureResponse.text();
      throw new Error(`Capture failed: ${captureResponse.status} - ${errorText}`);
    }

    const captureData = await captureResponse.json();
    console.log('✅ Capture successful!');
    console.log('   Result:', captureData.result);
    console.log('   Capture ID:', captureData.transaction?.id);

    return {
      success: true,
      captureData
    };

  } catch (error) {
    console.error('❌ Capture test failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 7: Void Transaction
 */
async function testVoid(orderId, transactionId) {
  console.log('\n🧪 TEST 7: Void Transaction');
  console.log('='.repeat(60));
  
  if (!orderId || !transactionId) {
    console.log('⚠️  Skipping void test - requires authorized transaction first');
    console.log('   Run authorization test first, then provide order and transaction IDs');
    return { success: false, error: 'Requires authorized transaction' };
  }

  try {
    const voidUrl = `${ARC_PAY_CONFIG.baseUrl}/merchant/${ARC_PAY_CONFIG.merchantId}/order/${orderId}/transaction/${transactionId}`;
    
    const voidRequest = {
      apiOperation: 'VOID'
    };

    console.log('📤 Processing void...');
    console.log('   Order ID:', orderId);
    console.log('   Transaction ID:', transactionId);

    const voidResponse = await fetch(voidUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader(),
        'Accept': 'application/json'
      },
      body: JSON.stringify(voidRequest)
    });

    if (!voidResponse.ok) {
      const errorText = await voidResponse.text();
      throw new Error(`Void failed: ${voidResponse.status} - ${errorText}`);
    }

    const voidData = await voidResponse.json();
    console.log('✅ Void successful!');
    console.log('   Result:', voidData.result);

    return {
      success: true,
      voidData
    };

  } catch (error) {
    console.error('❌ Void test failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Main test runner
 */
async function runCertificationTests() {
  console.log('\n🚀 ARC Pay Certification Test Suite');
  console.log('='.repeat(60));
  console.log('Merchant ID:', ARC_PAY_CONFIG.merchantId);
  console.log('Base URL:', ARC_PAY_CONFIG.baseUrl);
  console.log('='.repeat(60));

  const results = {
    payment3DS: null,
    paymentSimple: null,
    authorization: null,
    retrieve: null,
    capture: null,
    refund: null,
    void: null
  };

  // Test 1: Payment with 3DS (CRITICAL - This is what's missing)
  results.payment3DS = await testPaymentWith3DS();
  
  // Test 2: Simple Payment
  results.paymentSimple = await testPaymentWithout3DS();
  
  // Test 3: Authorization
  results.authorization = await testAuthorization();

  // Note: Retrieve, Capture, Refund, Void require completed transactions
  console.log('\n📝 NEXT STEPS:');
  console.log('='.repeat(60));
  console.log('1. Complete the 3DS payment manually using the instructions above');
  console.log('2. Note the Order ID and Transaction ID from successful payment');
  console.log('3. Run these commands with the transaction IDs:');
  console.log('   - testRetrieve(orderId, transactionId)');
  console.log('   - testRefund(transactionId, orderId, amount)');
  console.log('4. For Capture/Void, complete an AUTHORIZATION first, then:');
  console.log('   - testCapture(orderId, transactionId)');
  console.log('   - testVoid(orderId, transactionId)');
  console.log('='.repeat(60));

  return results;
}

// Export functions for use (ES module)
export {
  testPaymentWith3DS,
  testPaymentWithout3DS,
  testRefund,
  testRetrieve,
  testAuthorization,
  testCapture,
  testVoid,
  runCertificationTests
};

// Run if executed directly
runCertificationTests().catch(console.error);

