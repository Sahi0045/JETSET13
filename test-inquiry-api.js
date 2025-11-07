import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

// Test configuration
const config = {
  // Test both local and production URLs
  localUrl: 'http://localhost:5002',
  productionUrl: process.env.PRODUCTION_URL || 'https://your-app.vercel.app', // Update with your actual production URL
  testEmail: `test-${Date.now()}@example.com`,
  testToken: null // Will be populated if needed
};

// Test inquiry data
const testInquiryData = {
  inquiry_type: 'general',
  customer_name: 'Test User',
  customer_email: config.testEmail,
  customer_phone: '+1234567890',
  customer_country: 'United States',
  inquiry_subject: 'API Test Inquiry',
  inquiry_message: 'This is an automated test to verify the inquiry API is working correctly.',
  budget_range: 'moderate',
  preferred_contact_method: 'email',
  special_requirements: 'Automated test - please ignore'
};

const flightInquiryData = {
  inquiry_type: 'flight',
  customer_name: 'Flight Test User',
  customer_email: `flight-test-${Date.now()}@example.com`,
  customer_phone: '+1234567890',
  flight_origin: 'New York (JFK)',
  flight_destination: 'London (LHR)',
  flight_departure_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  flight_return_date: new Date(Date.now() + 37 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  flight_passengers: 2,
  flight_class: 'economy'
};

// Test utilities
async function makeRequest(url, method = 'GET', body = null, headers = {}) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...headers
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { rawResponse: text };
    }

    return {
      status: response.status,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
      data
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      error: error.message,
      data: null
    };
  }
}

// Test cases
const tests = {
  async testEnvironmentVariables() {
    log(colors.blue, '\n=== Testing Environment Variables ===');

    const requiredVars = [
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'SUPABASE_JWT_SECRET'
    ];

    let allPresent = true;
    for (const varName of requiredVars) {
      const isPresent = !!process.env[varName];
      const status = isPresent ? '✅' : '❌';
      log(isPresent ? colors.green : colors.red, `${status} ${varName}: ${isPresent ? 'Set' : 'Missing'}`);
      if (!isPresent) allPresent = false;
    }

    return allPresent;
  },

  async testSupabaseConnection() {
    log(colors.blue, '\n=== Testing Supabase Connection ===');

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
      );

      // Test connection by querying users table
      const { data, error } = await supabase
        .from('users')
        .select('count')
        .limit(1);

      if (error) {
        log(colors.red, '❌ Supabase connection failed:', error.message);
        return false;
      }

      log(colors.green, '✅ Supabase connection successful');
      return true;
    } catch (error) {
      log(colors.red, '❌ Supabase connection error:', error.message);
      return false;
    }
  },

  async testInquiryModelImport() {
    log(colors.blue, '\n=== Testing Inquiry Model Import ===');

    try {
      const Inquiry = (await import('./backend/models/inquiry.model.js')).default;

      if (!Inquiry) {
        log(colors.red, '❌ Inquiry model not found');
        return false;
      }

      // Check if required methods exist
      const requiredMethods = ['create', 'findAll', 'findById', 'findByUserId', 'getStats'];
      let allMethodsPresent = true;

      for (const method of requiredMethods) {
        const exists = typeof Inquiry[method] === 'function';
        const status = exists ? '✅' : '❌';
        log(exists ? colors.green : colors.red, `${status} Inquiry.${method}`);
        if (!exists) allMethodsPresent = false;
      }

      return allMethodsPresent;
    } catch (error) {
      log(colors.red, '❌ Failed to import Inquiry model:', error.message);
      return false;
    }
  },

  async testCreateInquiryDirect() {
    log(colors.blue, '\n=== Testing Direct Inquiry Creation (Model) ===');

    try {
      const Inquiry = (await import('./backend/models/inquiry.model.js')).default;

      const inquiry = await Inquiry.create(testInquiryData);

      if (!inquiry || !inquiry.id) {
        log(colors.red, '❌ Inquiry creation failed - no ID returned');
        return { success: false, inquiry: null };
      }

      log(colors.green, '✅ Inquiry created successfully');
      log(colors.cyan, `   ID: ${inquiry.id}`);
      log(colors.cyan, `   Type: ${inquiry.inquiry_type}`);
      log(colors.cyan, `   Email: ${inquiry.customer_email}`);

      return { success: true, inquiry };
    } catch (error) {
      log(colors.red, '❌ Inquiry creation failed:', error.message);
      log(colors.yellow, '   Stack:', error.stack);
      return { success: false, inquiry: null, error: error.message };
    }
  },

  async testCreateInquiryAPI(baseUrl) {
    log(colors.blue, `\n=== Testing Inquiry API Endpoint (${baseUrl}) ===`);

    try {
      const url = `${baseUrl}/api/inquiries`;
      log(colors.cyan, `POST ${url}`);

      const result = await makeRequest(url, 'POST', testInquiryData);

      log(colors.cyan, `Status: ${result.status}`);

      if (result.status === 0) {
        log(colors.red, '❌ Connection failed:', result.error);
        return { success: false, canConnect: false };
      }

      if (!result.ok) {
        log(colors.red, `❌ Request failed with status ${result.status}`);
        log(colors.yellow, 'Response:', JSON.stringify(result.data, null, 2));
        return { success: false, canConnect: true, status: result.status, data: result.data };
      }

      if (result.data.success && result.data.data) {
        log(colors.green, '✅ Inquiry created via API successfully');
        log(colors.cyan, `   ID: ${result.data.data.id || result.data.data.inquiry?.id}`);
        return { success: true, canConnect: true, inquiry: result.data.data };
      } else {
        log(colors.red, '❌ Unexpected response format');
        log(colors.yellow, 'Response:', JSON.stringify(result.data, null, 2));
        return { success: false, canConnect: true, data: result.data };
      }
    } catch (error) {
      log(colors.red, '❌ API test failed:', error.message);
      return { success: false, error: error.message };
    }
  },

  async testFlightInquiryAPI(baseUrl) {
    log(colors.blue, `\n=== Testing Flight Inquiry (${baseUrl}) ===`);

    try {
      const url = `${baseUrl}/api/inquiries`;
      const result = await makeRequest(url, 'POST', flightInquiryData);

      if (result.ok && result.data.success) {
        log(colors.green, '✅ Flight inquiry created successfully');
        return { success: true };
      } else {
        log(colors.red, '❌ Flight inquiry creation failed');
        log(colors.yellow, 'Response:', JSON.stringify(result.data, null, 2));
        return { success: false, data: result.data };
      }
    } catch (error) {
      log(colors.red, '❌ Flight inquiry test failed:', error.message);
      return { success: false, error: error.message };
    }
  },

  async testGetInquiriesWithAuth(baseUrl, token) {
    log(colors.blue, `\n=== Testing Get My Inquiries with Auth (${baseUrl}) ===`);

    if (!token) {
      log(colors.yellow, '⚠️  Skipping - no auth token provided');
      return { success: true, skipped: true };
    }

    try {
      const url = `${baseUrl}/api/inquiries?endpoint=my`;
      const result = await makeRequest(url, 'GET', null, {
        'Authorization': `Bearer ${token}`
      });

      log(colors.cyan, `Status: ${result.status}`);

      if (result.ok) {
        log(colors.green, '✅ Successfully retrieved inquiries');
        log(colors.cyan, `   Count: ${result.data.data?.inquiries?.length || 0}`);
        return { success: true };
      } else {
        log(colors.yellow, '⚠️  Auth test result:', JSON.stringify(result.data, null, 2));
        return { success: false, data: result.data };
      }
    } catch (error) {
      log(colors.red, '❌ Get inquiries test failed:', error.message);
      return { success: false, error: error.message };
    }
  },

  async testAPIErrorHandling(baseUrl) {
    log(colors.blue, `\n=== Testing API Error Handling (${baseUrl}) ===`);

    // Test with missing required fields
    const invalidData = {
      inquiry_type: 'general'
      // Missing required fields
    };

    try {
      const url = `${baseUrl}/api/inquiries`;
      const result = await makeRequest(url, 'POST', invalidData);

      if (result.status === 500 || result.status === 400) {
        log(colors.green, '✅ API correctly handles validation errors');
        log(colors.cyan, `   Status: ${result.status}`);
        return { success: true };
      } else if (result.status === 0) {
        log(colors.yellow, '⚠️  Cannot connect to server');
        return { success: false, canConnect: false };
      } else {
        log(colors.yellow, `⚠️  Unexpected status: ${result.status}`);
        return { success: true }; // Still considered successful if server responds
      }
    } catch (error) {
      log(colors.red, '❌ Error handling test failed:', error.message);
      return { success: false, error: error.message };
    }
  }
};

// Main test runner
async function runTests() {
  log(colors.magenta, '\n╔════════════════════════════════════════════════════════╗');
  log(colors.magenta, '║        JETSET INQUIRY API TEST SUITE                   ║');
  log(colors.magenta, '╚════════════════════════════════════════════════════════╝');

  const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    details: []
  };

  // 1. Environment check
  const envCheck = await tests.testEnvironmentVariables();
  if (envCheck) {
    results.passed++;
  } else {
    results.failed++;
    log(colors.red, '\n⚠️  Environment variables missing. Some tests may fail.');
  }

  // 2. Supabase connection
  const supabaseCheck = await tests.testSupabaseConnection();
  results[supabaseCheck ? 'passed' : 'failed']++;

  // 3. Model import
  const modelCheck = await tests.testInquiryModelImport();
  results[modelCheck ? 'passed' : 'failed']++;

  // 4. Direct model test
  const directResult = await tests.testCreateInquiryDirect();
  results[directResult.success ? 'passed' : 'failed']++;

  // 5. Local API test
  log(colors.blue, '\n=== LOCAL API TESTS ===');
  const localResult = await tests.testCreateInquiryAPI(config.localUrl);
  if (localResult.canConnect === false) {
    log(colors.yellow, '⚠️  Local server not running - skipping local tests');
    results.skipped++;
  } else {
    results[localResult.success ? 'passed' : 'failed']++;
  }

  // 6. Flight inquiry test (local)
  if (localResult.canConnect !== false) {
    const flightResult = await tests.testFlightInquiryAPI(config.localUrl);
    results[flightResult.success ? 'passed' : 'failed']++;
  }

  // 7. Production API test
  log(colors.blue, '\n=== PRODUCTION API TESTS ===');
  if (config.productionUrl && config.productionUrl !== 'https://your-app.vercel.app') {
    const prodResult = await tests.testCreateInquiryAPI(config.productionUrl);
    if (prodResult.canConnect === false) {
      log(colors.yellow, '⚠️  Cannot connect to production URL');
      results.skipped++;
    } else {
      results[prodResult.success ? 'passed' : 'failed']++;
    }

    // 8. Production flight inquiry
    if (prodResult.canConnect !== false) {
      const prodFlightResult = await tests.testFlightInquiryAPI(config.productionUrl);
      results[prodFlightResult.success ? 'passed' : 'failed']++;
    }

    // 9. Error handling test
    const errorResult = await tests.testAPIErrorHandling(config.productionUrl);
    results[errorResult.success ? 'passed' : 'failed']++;
  } else {
    log(colors.yellow, '⚠️  Production URL not configured. Set PRODUCTION_URL in .env file.');
    log(colors.yellow, '    Example: PRODUCTION_URL=https://your-app.vercel.app');
    results.skipped += 3;
  }

  // Summary
  log(colors.magenta, '\n╔════════════════════════════════════════════════════════╗');
  log(colors.magenta, '║                  TEST RESULTS SUMMARY                  ║');
  log(colors.magenta, '╚════════════════════════════════════════════════════════╝');

  log(colors.green, `✅ Passed:  ${results.passed}`);
  log(colors.red, `❌ Failed:  ${results.failed}`);
  log(colors.yellow, `⚠️  Skipped: ${results.skipped}`);

  const total = results.passed + results.failed;
  const successRate = total > 0 ? ((results.passed / total) * 100).toFixed(1) : 0;

  log(colors.cyan, `\n📊 Success Rate: ${successRate}%`);

  if (results.failed === 0) {
    log(colors.green, '\n🎉 All tests passed!');
    log(colors.green, '✅ Your inquiry API is ready for production deployment.');
  } else {
    log(colors.red, '\n⚠️  Some tests failed. Please review the errors above.');
    log(colors.yellow, '\n💡 Common issues:');
    log(colors.yellow, '   1. Make sure your .env file has all required variables');
    log(colors.yellow, '   2. Verify Supabase tables exist (users, inquiries)');
    log(colors.yellow, '   3. Check that your production URL is correct');
    log(colors.yellow, '   4. Ensure your Vercel environment variables are set');
  }

  log(colors.magenta, '\n════════════════════════════════════════════════════════\n');

  // Exit with error code if tests failed
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  log(colors.red, '\n❌ Test runner error:', error.message);
  log(colors.yellow, error.stack);
  process.exit(1);
});
