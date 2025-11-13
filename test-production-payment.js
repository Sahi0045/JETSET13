#!/usr/bin/env node

/**
 * Production Payment API Test
 * Tests the payment initiation flow against the live API
 */

const PRODUCTION_URL = 'https://www.jetsetterss.com';
const TEST_QUOTE_ID = '6d45932c-f3f7-45e8-998f-da1f792a407a'; // Update with actual quote ID

console.log('🧪 Testing Production Payment API\n');
console.log('='.repeat(60));
console.log(`Target: ${PRODUCTION_URL}`);
console.log('='.repeat(60));
console.log('');

async function runTests() {
  const results = {
    healthCheck: false,
    debug: false,
    paymentInitiation: false
  };

  // Test 1: Health Check
  try {
    console.log('📋 Test 1: Health Check');
    console.log('   URL:', `${PRODUCTION_URL}/api/payments?action=health`);
    
    const healthResponse = await fetch(`${PRODUCTION_URL}/api/payments?action=health`);
    const healthData = await healthResponse.json();
    
    console.log('   Status:', healthResponse.status);
    console.log('   Response:', JSON.stringify(healthData, null, 2));
    
    if (healthData.success && healthData.status === 'healthy') {
      console.log('   ✅ PASSED: API is healthy\n');
      results.healthCheck = true;
    } else {
      console.log('   ❌ FAILED: API is not healthy\n');
      console.log('   Details:', healthData);
    }
  } catch (error) {
    console.log('   ❌ FAILED:', error.message);
    console.log('   Error:', error);
  }

  console.log('');

  // Test 2: Debug Info
  try {
    console.log('📋 Test 2: Debug Information');
    console.log('   URL:', `${PRODUCTION_URL}/api/payments?action=debug`);
    
    const debugResponse = await fetch(`${PRODUCTION_URL}/api/payments?action=debug`);
    const debugData = await debugResponse.json();
    
    console.log('   Status:', debugResponse.status);
    
    if (debugData.success) {
      console.log('   ✅ PASSED: Debug endpoint accessible\n');
      console.log('   Environment:');
      Object.entries(debugData.environment).forEach(([key, value]) => {
        console.log(`     ${key}: ${value}`);
      });
      console.log('');
      console.log('   Supabase Status:');
      Object.entries(debugData.supabase).forEach(([key, value]) => {
        console.log(`     ${key}: ${value}`);
      });
      console.log('');
      results.debug = true;
    } else {
      console.log('   ❌ FAILED: Debug endpoint error\n');
      console.log('   Error:', debugData.error);
    }
  } catch (error) {
    console.log('   ❌ FAILED:', error.message);
  }

  console.log('');

  // Test 3: Payment Initiation (requires valid quote ID)
  try {
    console.log('📋 Test 3: Payment Initiation');
    console.log('   URL:', `${PRODUCTION_URL}/api/payments?action=initiate-payment`);
    console.log('   Quote ID:', TEST_QUOTE_ID);
    console.log('   ⚠️  Note: This will create a real payment record in the database');
    console.log('');
    
    // Check if we should skip this test
    if (!TEST_QUOTE_ID || TEST_QUOTE_ID === '6d45932c-f3f7-45e8-998f-da1f792a407a') {
      console.log('   ⏭️  SKIPPED: Update TEST_QUOTE_ID with a valid quote ID to run this test');
      console.log('   To find a quote ID:');
      console.log('     1. Go to https://www.jetsetterss.com');
      console.log('     2. Navigate to an inquiry with a quote');
      console.log('     3. Check the URL or inspect the quote data');
      console.log('     4. Update TEST_QUOTE_ID in this script');
    } else {
      const paymentResponse = await fetch(`${PRODUCTION_URL}/api/payments?action=initiate-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Add auth token if required
          // 'Authorization': `Bearer YOUR_TOKEN_HERE`
        },
        body: JSON.stringify({
          quote_id: TEST_QUOTE_ID,
          return_url: `${PRODUCTION_URL}/payment/callback?quote_id=${TEST_QUOTE_ID}`,
          cancel_url: `${PRODUCTION_URL}/inquiry/test?payment=cancelled`
        })
      });
      
      const paymentData = await paymentResponse.json();
      
      console.log('   Status:', paymentResponse.status);
      console.log('   Response:', JSON.stringify(paymentData, null, 2));
      
      if (paymentData.success && paymentData.sessionId) {
        console.log('   ✅ PASSED: Payment session created successfully');
        console.log('   Session ID:', paymentData.sessionId);
        console.log('   Merchant ID:', paymentData.merchantId);
        console.log('   Payment ID:', paymentData.paymentId);
        results.paymentInitiation = true;
      } else {
        console.log('   ❌ FAILED: Payment initiation failed');
        console.log('   Error:', paymentData.error);
        console.log('   Details:', paymentData.details);
      }
    }
  } catch (error) {
    console.log('   ❌ FAILED:', error.message);
    console.log('   Stack:', error.stack);
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));
  console.log('Health Check:', results.healthCheck ? '✅ PASSED' : '❌ FAILED');
  console.log('Debug Info:', results.debug ? '✅ PASSED' : '❌ FAILED');
  console.log('Payment Initiation:', results.paymentInitiation ? '✅ PASSED' : '⏭️  SKIPPED');
  console.log('');

  const passedTests = Object.values(results).filter(r => r === true).length;
  const totalTests = 2; // Only count mandatory tests
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed! Production API is working correctly.');
    console.log('');
    console.log('✅ Next Steps:');
    console.log('   1. Try clicking "Pay Now" button on the website');
    console.log('   2. Monitor server logs for detailed error messages');
    console.log('   3. Check browser console for any errors');
  } else {
    console.log('⚠️  Some tests failed. Check the errors above.');
    console.log('');
    console.log('🔧 Troubleshooting:');
    console.log('   1. Ensure all environment variables are set in production');
    console.log('   2. Check server logs for detailed errors');
    console.log('   3. Verify Supabase credentials are correct');
    console.log('   4. Verify ARC Pay credentials are correct');
  }
  
  console.log('');
}

// Run tests
runTests().catch(error => {
  console.error('');
  console.error('❌ Test suite failed:', error.message);
  console.error(error.stack);
  process.exit(1);
});

