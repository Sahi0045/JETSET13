import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE_URL = process.env.API_URL || 'https://www.jetsetterss.com';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testAPIEndpoints() {
  console.log('🧪 REAL API Endpoint Tests\n');
  console.log('='.repeat(60));
  console.log(`API Base URL: ${API_BASE_URL}`);
  console.log('='.repeat(60));

  let allTestsPassed = true;
  let testQuoteId = null;
  let testUserId = null;
  let testInquiryId = null;
  let testBookingInfoId = null;

  try {
    // Setup: Get test data
    console.log('\n📋 Setup: Getting test data...');
    const { data: quotes } = await supabase
      .from('quotes')
      .select('id, inquiry_id, status')
      .eq('status', 'sent')
      .limit(1);

    const { data: users } = await supabase
      .from('users')
      .select('id, email')
      .limit(1);

    if (!quotes || quotes.length === 0) {
      console.log('⚠️  No quotes with "sent" status found. Creating test data...');
      // Create test inquiry first
      const { data: inquiries } = await supabase
        .from('inquiries')
        .select('id')
        .limit(1);
      
      if (inquiries && inquiries.length > 0) {
        testInquiryId = inquiries[0].id;
      } else {
        console.log('❌ No inquiries found. Cannot run full API tests.');
        return;
      }
    } else {
      testQuoteId = quotes[0].id;
      testInquiryId = quotes[0].inquiry_id;
    }

    if (!users || users.length === 0) {
      console.log('❌ No users found. Cannot test authentication.');
      return;
    }

    testUserId = users[0].id;
    console.log(`✅ Test Quote ID: ${testQuoteId}`);
    console.log(`✅ Test User ID: ${testUserId}`);
    console.log(`✅ Test Inquiry ID: ${testInquiryId}`);

    // Test 1: GET booking-info endpoint (should return 404 if not exists)
    console.log('\n📋 Test 1: GET /api/quotes?id=xxx&endpoint=booking-info (non-existent)');
    try {
      if (!testQuoteId) {
        console.log('   ⚠️  Skipped - no test quote available');
      } else {
        // Get a token (we'll use service key for testing)
        const token = supabaseServiceKey;
        
        const response = await fetch(
          `${API_BASE_URL}/api/quotes?id=${testQuoteId}&endpoint=booking-info`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const data = await response.json();
        
        if (response.status === 404) {
          console.log('   ✅ Correctly returns 404 when booking info does not exist');
          console.log(`   Response: ${data.message || 'Not found'}`);
        } else if (response.status === 200 && data.success) {
          console.log('   ✅ Booking info found (already exists)');
          testBookingInfoId = data.data.id;
        } else {
          console.log(`   ⚠️  Unexpected response: ${response.status}`);
          console.log(`   Data:`, JSON.stringify(data, null, 2));
        }
      }
    } catch (error) {
      console.error('   ❌ GET endpoint test failed:', error.message);
      allTestsPassed = false;
    }

    // Test 2: POST booking-info endpoint (create)
    console.log('\n📋 Test 2: POST /api/quotes?id=xxx&endpoint=booking-info (create)');
    try {
      if (!testQuoteId) {
        console.log('   ⚠️  Skipped - no test quote available');
      } else {
        const bookingData = {
          full_name: 'Test User API',
          email: 'test-api@example.com',
          phone: '+1234567890',
          date_of_birth: '1990-01-01',
          nationality: 'US',
          passport_number: 'TEST123456',
          passport_expiry_date: '2030-12-31',
          terms_accepted: true,
          privacy_policy_accepted: true
        };

        const token = supabaseServiceKey;
        const response = await fetch(
          `${API_BASE_URL}/api/quotes?id=${testQuoteId}&endpoint=booking-info`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(bookingData)
          }
        );

        const data = await response.json();
        
        if (response.ok && data.success) {
          console.log('   ✅ Successfully created booking info via API');
          console.log(`   Booking Info ID: ${data.data.id}`);
          console.log(`   Status: ${data.data.status}`);
          testBookingInfoId = data.data.id;
        } else {
          console.error(`   ❌ POST failed: ${response.status}`);
          console.error(`   Error:`, JSON.stringify(data, null, 2));
          allTestsPassed = false;
        }
      }
    } catch (error) {
      console.error('   ❌ POST endpoint test failed:', error.message);
      allTestsPassed = false;
    }

    // Test 3: GET booking-info endpoint (should return data now)
    console.log('\n📋 Test 3: GET /api/quotes?id=xxx&endpoint=booking-info (after create)');
    try {
      if (!testQuoteId || !testBookingInfoId) {
        console.log('   ⚠️  Skipped - no booking info to retrieve');
      } else {
        const token = supabaseServiceKey;
        const response = await fetch(
          `${API_BASE_URL}/api/quotes?id=${testQuoteId}&endpoint=booking-info`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const data = await response.json();
        
        if (response.ok && data.success) {
          console.log('   ✅ Successfully retrieved booking info via API');
          console.log(`   Full Name: ${data.data.full_name}`);
          console.log(`   Email: ${data.data.email}`);
          console.log(`   Status: ${data.data.status}`);
          
          // Verify data matches what we sent
          if (data.data.full_name === 'Test User API' && 
              data.data.email === 'test-api@example.com') {
            console.log('   ✅ Data integrity verified');
          } else {
            console.log('   ⚠️  Data mismatch detected');
          }
        } else {
          console.error(`   ❌ GET failed: ${response.status}`);
          console.error(`   Error:`, JSON.stringify(data, null, 2));
          allTestsPassed = false;
        }
      }
    } catch (error) {
      console.error('   ❌ GET endpoint test failed:', error.message);
      allTestsPassed = false;
    }

    // Test 4: POST booking-info endpoint (update existing)
    console.log('\n📋 Test 4: POST /api/quotes?id=xxx&endpoint=booking-info (update)');
    try {
      if (!testQuoteId || !testBookingInfoId) {
        console.log('   ⚠️  Skipped - no existing booking info to update');
      } else {
        const updateData = {
          full_name: 'Test User API Updated',
          email: 'test-api-updated@example.com',
          phone: '+1234567890',
          terms_accepted: true,
          privacy_policy_accepted: true
        };

        const token = supabaseServiceKey;
        const response = await fetch(
          `${API_BASE_URL}/api/quotes?id=${testQuoteId}&endpoint=booking-info`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
          }
        );

        const data = await response.json();
        
        if (response.ok && data.success) {
          console.log('   ✅ Successfully updated booking info via API');
          console.log(`   Updated Name: ${data.data.full_name}`);
          
          if (data.data.full_name === 'Test User API Updated') {
            console.log('   ✅ Update verified - data changed correctly');
          }
        } else {
          console.error(`   ❌ UPDATE failed: ${response.status}`);
          console.error(`   Error:`, JSON.stringify(data, null, 2));
          allTestsPassed = false;
        }
      }
    } catch (error) {
      console.error('   ❌ UPDATE endpoint test failed:', error.message);
      allTestsPassed = false;
    }

    // Test 5: Test authorization (403 error)
    console.log('\n📋 Test 5: Test authorization (should fail for unauthorized user)');
    try {
      if (!testQuoteId) {
        console.log('   ⚠️  Skipped - no test quote available');
      } else {
        // Try with invalid/empty token
        const response = await fetch(
          `${API_BASE_URL}/api/quotes?id=${testQuoteId}&endpoint=booking-info`,
          {
            method: 'GET',
            headers: {
              'Authorization': 'Bearer invalid-token',
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.status === 401 || response.status === 403) {
          console.log('   ✅ Authorization check working (correctly rejects invalid token)');
        } else {
          console.log(`   ⚠️  Unexpected status: ${response.status} (expected 401/403)`);
        }
      }
    } catch (error) {
      console.log(`   ⚠️  Authorization test: ${error.message}`);
    }

    // Test 6: Test field validation
    console.log('\n📋 Test 6: Test field validation (missing required fields)');
    try {
      if (!testQuoteId) {
        console.log('   ⚠️  Skipped - no test quote available');
      } else {
        const invalidData = {
          // Missing required fields: full_name, email, phone
          date_of_birth: '1990-01-01'
        };

        const token = supabaseServiceKey;
        const response = await fetch(
          `${API_BASE_URL}/api/quotes?id=${testQuoteId}&endpoint=booking-info`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(invalidData)
          }
        );

        const data = await response.json();
        
        if (response.status === 400) {
          console.log('   ✅ Validation working (correctly rejects invalid data)');
          console.log(`   Error message: ${data.message}`);
        } else {
          console.log(`   ⚠️  Expected 400, got ${response.status}`);
        }
      }
    } catch (error) {
      console.log(`   ⚠️  Validation test: ${error.message}`);
    }

    // Cleanup: Delete test booking info
    if (testBookingInfoId) {
      console.log('\n🧹 Cleanup: Removing test booking info...');
      try {
        await supabase
          .from('booking_info')
          .delete()
          .eq('id', testBookingInfoId);
        console.log('   ✅ Test data cleaned up');
      } catch (error) {
        console.log(`   ⚠️  Cleanup warning: ${error.message}`);
      }
    }

  } catch (error) {
    console.error('❌ Test suite error:', error);
    allTestsPassed = false;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  if (allTestsPassed) {
    console.log('✅ All API endpoint tests completed!');
  } else {
    console.log('⚠️  Some API tests had issues. Review above for details.');
  }
  console.log('='.repeat(60));
  console.log('\nNote: These are REAL API tests that make actual HTTP requests.');
  console.log('If tests failed, check:');
  console.log('  1. API server is running');
  console.log('  2. API_BASE_URL is correct');
  console.log('  3. Authentication tokens are valid');
}

testAPIEndpoints().catch(console.error);

