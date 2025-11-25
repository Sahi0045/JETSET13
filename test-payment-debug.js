// Quick test script to check payment API
// Run: node test-payment-debug.js

const testPaymentAPI = async () => {
  try {
    console.log('🧪 Testing Payment API Health...\n');
    
    // Test 1: Health check
    const healthResponse = await fetch('http://localhost:3000/api/payments?action=health');
    const healthData = await healthResponse.json();
    
    console.log('✅ Health Check:', healthData.status);
    console.log('   Supabase:', healthData.services?.supabase?.status);
    console.log('   ARC Pay Configured:', healthData.services?.arcPay?.configured);
    console.log('   Merchant ID:', healthData.services?.arcPay?.merchantId);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
};

testPaymentAPI();
