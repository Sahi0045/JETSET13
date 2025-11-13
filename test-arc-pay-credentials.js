import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

// ARC Pay Configuration from environment
const ARC_PAY_CONFIG = {
    MERCHANT_ID: process.env.ARC_PAY_MERCHANT_ID || 'TESTARC05511704',
    API_USERNAME: process.env.ARC_PAY_API_USERNAME || 'TESTARC05511704',
    API_PASSWORD: process.env.ARC_PAY_API_PASSWORD || '4d41a81750f1ee3f6aa4adf0dfd6310c',
    INTEGRATION_PASSWORD_1: process.env.ARC_PAY_INTEGRATION_PASSWORD_1 || '4d41a81750f1ee3f6aa4adf0dfd6310c',
    INTEGRATION_PASSWORD_2: process.env.ARC_PAY_INTEGRATION_PASSWORD_2 || '03762006ad1c7c3337af5fbdbe922d2e',
    REPORTING_PASSWORD_1: process.env.ARC_PAY_REPORTING_PASSWORD_1 || 'e1c1f80f6e8dcc3c3d0b28c3f4fcbae3',
    REPORTING_PASSWORD_2: process.env.ARC_PAY_REPORTING_PASSWORD_2 || '575a62ce17983304ae468a943d57ca1d',
    BASE_URL: process.env.ARC_PAY_BASE_URL || 'https://api.arcpay.travel/api/rest/version/100',
    API_URL: process.env.ARC_PAY_API_URL || `https://api.arcpay.travel/api/rest/version/100/merchant/${process.env.ARC_PAY_MERCHANT_ID || 'TESTARC05511704'}`,
    PORTAL_URL: process.env.ARC_PAY_PORTAL_URL || 'https://api.arcpay.travel/ma/',
    CHECK_GATEWAY_URL: 'https://api.arcpay.travel/api/rest/version/100/information'
};

// Helper function to get auth config
const getAuthConfig = () => {
    return {
        auth: {
            username: ARC_PAY_CONFIG.API_USERNAME,
            password: ARC_PAY_CONFIG.API_PASSWORD
        },
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        timeout: 30000
    };
};

// Helper function for Basic Auth header - try different formats
const getAuthHeader = (format = 'username', password = null) => {
    const pwd = password || ARC_PAY_CONFIG.API_PASSWORD;
    let credentials;
    
    switch(format) {
        case 'merchant':
            // Format: merchant.MERCHANT_ID:password
            credentials = Buffer.from(`merchant.${ARC_PAY_CONFIG.MERCHANT_ID}:${pwd}`).toString('base64');
            break;
        case 'merchantId':
            // Format: MERCHANT_ID:password
            credentials = Buffer.from(`${ARC_PAY_CONFIG.MERCHANT_ID}:${pwd}`).toString('base64');
            break;
        case 'username':
        default:
            // Format: username:password
            credentials = Buffer.from(`${ARC_PAY_CONFIG.API_USERNAME}:${pwd}`).toString('base64');
            break;
    }
    
    return `Basic ${credentials}`;
};

// Test results tracker
const testResults = {
    passed: 0,
    failed: 0,
    errors: []
};

// Test function wrapper
async function runTest(testName, testFn) {
    console.log(`\n🧪 Testing: ${testName}`);
    console.log('─'.repeat(60));
    
    try {
        await testFn();
        testResults.passed++;
        console.log(`✅ PASSED: ${testName}`);
        return true;
    } catch (error) {
        testResults.failed++;
        const errorMsg = error.response?.data || error.message || 'Unknown error';
        testResults.errors.push({ test: testName, error: errorMsg });
        console.log(`❌ FAILED: ${testName}`);
        console.log(`   Error:`, errorMsg);
        if (error.response?.status) {
            console.log(`   Status: ${error.response.status}`);
        }
        return false;
    }
}

// Test 1: Check Gateway Status
async function testGatewayStatus() {
    console.log('📡 Checking ARC Pay Gateway status...');
    
    const response = await axios.get(ARC_PAY_CONFIG.CHECK_GATEWAY_URL, {
        timeout: 10000
    });
    
    console.log('   Gateway Response:', JSON.stringify(response.data, null, 2));
    
    if (response.status === 200) {
        console.log('   ✅ Gateway is operational');
    } else {
        throw new Error(`Gateway returned status ${response.status}`);
    }
}

// Test 2: Test Authentication with Basic Auth
async function testAuthentication() {
    console.log('🔐 Testing authentication with new credentials...');
    console.log(`   Username: ${ARC_PAY_CONFIG.API_USERNAME}`);
    console.log(`   Merchant ID: ${ARC_PAY_CONFIG.MERCHANT_ID}`);
    console.log(`   Base URL: ${ARC_PAY_CONFIG.BASE_URL}`);
    
    // Try to access merchant information endpoint
    const merchantInfoUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}`;
    
    try {
        const response = await axios.get(merchantInfoUrl, getAuthConfig());
        console.log('   ✅ Authentication successful');
        console.log('   Response:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        // If merchant info endpoint doesn't exist, try session creation
        if (error.response?.status === 404 || error.response?.status === 405) {
            console.log('   ⚠️  Merchant info endpoint not available, trying session creation...');
            await testSessionCreation();
        } else {
            throw error;
        }
    }
}

// Test 3: Create Payment Session - Try different auth formats
async function testSessionCreation() {
    console.log('💳 Testing payment session creation with different auth formats...');
    
    const sessionUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/session`;
    console.log(`   Session URL: ${sessionUrl}`);
    
    const requestBody = {
        apiOperation: 'INITIATE_CHECKOUT',
        interaction: {
            operation: 'PURCHASE',
            returnUrl: 'https://www.jetsetterss.com/payment/callback',
            cancelUrl: 'https://www.jetsetterss.com/payment/cancel'
        },
        order: {
            id: `TEST-${Date.now()}`,
            amount: '100.00',
            currency: 'USD',
            description: 'Test Payment Session'
        }
    };
    
    console.log('   Request Body:', JSON.stringify(requestBody, null, 2));
    
    // Try different authentication formats - Start with Integration Passwords (most likely)
    const authFormats = [
        { name: 'MerchantID:IntegrationPassword1', format: 'merchantId', password: ARC_PAY_CONFIG.INTEGRATION_PASSWORD_1 },
        { name: 'MerchantID:IntegrationPassword2', format: 'merchantId', password: ARC_PAY_CONFIG.INTEGRATION_PASSWORD_2 },
        { name: 'MerchantID:Password', format: 'merchantId', password: ARC_PAY_CONFIG.API_PASSWORD },
        { name: 'Username:Password', format: 'username', password: ARC_PAY_CONFIG.API_PASSWORD },
        { name: 'merchant.MerchantID:Password', format: 'merchant', password: ARC_PAY_CONFIG.API_PASSWORD }
    ];
    
    for (const authFormat of authFormats) {
        console.log(`\n   🔄 Trying: ${authFormat.name}`);
        try {
            const response = await axios.post(
                sessionUrl,
                requestBody,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Authorization': getAuthHeader(authFormat.format, authFormat.password)
                    },
                    timeout: 15000
                }
            );
            
            console.log(`   ✅ SUCCESS with ${authFormat.name}!`);
            console.log('   Response:', JSON.stringify(response.data, null, 2));
            
            if (response.data.session?.id) {
                console.log(`   Session ID: ${response.data.session.id}`);
            }
            if (response.data.successIndicator) {
                console.log(`   Success Indicator: ${response.data.successIndicator}`);
            }
            
            // Store successful format for future use
            console.log(`\n   💡 Working auth format: ${authFormat.name}`);
            return;
        } catch (error) {
            const errorMsg = error.response?.data || error.message;
            console.log(`   ❌ Failed: ${error.response?.status || 'Network Error'}`);
            if (error.response?.data) {
                console.log(`   Error: ${JSON.stringify(error.response.data, null, 2)}`);
            }
        }
    }
    
    throw new Error('All authentication formats failed');
}

// Test 4: Test with fetch API (like in payments.js) - Try all auth formats
async function testFetchAPI() {
    console.log('🌐 Testing with fetch API (matching payments.js implementation)...');
    
    const sessionUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/session`;
    
    const requestBody = {
        apiOperation: 'INITIATE_CHECKOUT',
        interaction: {
            operation: 'PURCHASE',
            returnUrl: 'https://www.jetsetterss.com/payment/callback',
            cancelUrl: 'https://www.jetsetterss.com/payment/cancel'
        },
        order: {
            id: `FETCH-TEST-${Date.now()}`,
            amount: '50.00',
            currency: 'USD',
            description: 'Fetch API Test'
        }
    };
    
    // Try different auth formats - Start with Integration Passwords (most likely)
    const authFormats = [
        { name: 'MerchantID:IntegrationPassword1', format: 'merchantId', password: ARC_PAY_CONFIG.INTEGRATION_PASSWORD_1 },
        { name: 'MerchantID:IntegrationPassword2', format: 'merchantId', password: ARC_PAY_CONFIG.INTEGRATION_PASSWORD_2 },
        { name: 'MerchantID:Password', format: 'merchantId', password: ARC_PAY_CONFIG.API_PASSWORD },
        { name: 'Username:Password', format: 'username', password: ARC_PAY_CONFIG.API_PASSWORD },
        { name: 'merchant.MerchantID:Password', format: 'merchant', password: ARC_PAY_CONFIG.API_PASSWORD }
    ];
    
    for (const authFormat of authFormats) {
        console.log(`\n   🔄 Trying fetch with: ${authFormat.name}`);
        try {
            const authHeader = getAuthHeader(authFormat.format, authFormat.password);
            const response = await fetch(sessionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': authHeader
                },
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.log(`   ❌ Failed: HTTP ${response.status}`);
                console.log(`   Error: ${errorText}`);
                continue;
            }
            
            const data = await response.json();
            console.log(`   ✅ SUCCESS with ${authFormat.name}!`);
            console.log('   Response:', JSON.stringify(data, null, 2));
            console.log(`\n   💡 Working fetch auth format: ${authFormat.name}`);
            return;
        } catch (error) {
            console.log(`   ❌ Network error: ${error.message}`);
        }
    }
    
    throw new Error('All fetch authentication formats failed');
}

// Test 5: Verify Environment Variables
async function testEnvironmentVariables() {
    console.log('🔍 Verifying environment variables...');
    
    const requiredVars = [
        'ARC_PAY_MERCHANT_ID',
        'ARC_PAY_API_USERNAME',
        'ARC_PAY_API_PASSWORD',
        'ARC_PAY_BASE_URL'
    ];
    
    const missing = [];
    const present = [];
    
    requiredVars.forEach(varName => {
        const value = process.env[varName];
        if (!value) {
            missing.push(varName);
        } else {
            present.push(varName);
            // Don't log password value
            if (varName.includes('PASSWORD')) {
                console.log(`   ${varName}: ${'*'.repeat(value.length)} (${value.length} chars)`);
            } else {
                console.log(`   ${varName}: ${value}`);
            }
        }
    });
    
    if (missing.length > 0) {
        throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    }
    
    console.log('   ✅ All required environment variables are set');
}

// Main test runner
async function runAllTests() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     ARC Pay API Credentials Test Suite                    ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\n📋 Configuration:`);
    console.log(`   Merchant ID: ${ARC_PAY_CONFIG.MERCHANT_ID}`);
    console.log(`   Username: ${ARC_PAY_CONFIG.API_USERNAME}`);
    console.log(`   Base URL: ${ARC_PAY_CONFIG.BASE_URL}`);
    console.log(`   Portal URL: ${ARC_PAY_CONFIG.PORTAL_URL}`);
    
    // Run tests
    await runTest('Environment Variables Check', testEnvironmentVariables);
    await runTest('Gateway Status Check', testGatewayStatus);
    await runTest('Authentication Test', testAuthentication);
    await runTest('Payment Session Creation (Axios)', testSessionCreation);
    await runTest('Payment Session Creation (Fetch)', testFetchAPI);
    
    // Print summary
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    Test Summary                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\n✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`📊 Total:  ${testResults.passed + testResults.failed}`);
    
    if (testResults.errors.length > 0) {
        console.log('\n❌ Errors:');
        testResults.errors.forEach(({ test, error }) => {
            console.log(`   ${test}:`);
            console.log(`      ${JSON.stringify(error, null, 2)}`);
        });
    }
    
    if (testResults.failed === 0) {
        console.log('\n🎉 All tests passed! ARC Pay integration is working correctly.');
    } else {
        console.log('\n⚠️  Some tests failed. Please review the errors above.');
    }
    
    process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
    console.error('\n💥 Fatal error running tests:', error);
    process.exit(1);
});

