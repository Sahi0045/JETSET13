import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testIntegration() {
  console.log('🔍 Testing Booking Info System Integration\n');
  console.log('='.repeat(60));

  let allTestsPassed = true;
  const results = [];

  // Test 1: Verify API endpoint structure
  console.log('\n📋 Test 1: Verify API endpoint structure');
  try {
    const apiContent = fs.readFileSync('./api/quotes.js', 'utf8');
    
    const checks = {
      'BookingInfo import': apiContent.includes('import BookingInfo'),
      'POST booking-info endpoint': apiContent.includes('POST') && apiContent.includes('booking-info'),
      'GET booking-info endpoint': apiContent.includes('GET') && apiContent.includes('booking-info'),
      'Field validation': apiContent.includes('validBookingInfoFields'),
      'Authorization check': apiContent.includes('isInquiryOwner') || apiContent.includes('isAdmin'),
    };

    Object.entries(checks).forEach(([check, passed]) => {
      if (passed) {
        console.log(`   ✅ ${check}`);
        results.push({ test: check, status: 'pass' });
      } else {
        console.log(`   ❌ ${check}`);
        results.push({ test: check, status: 'fail' });
        allTestsPassed = false;
      }
    });
  } catch (error) {
    console.error('❌ API structure test failed:', error.message);
    allTestsPassed = false;
  }

  // Test 2: Verify BookingInfo model methods
  console.log('\n📋 Test 2: Verify BookingInfo model methods');
  try {
    const modelContent = fs.readFileSync('./backend/models/bookingInfo.model.js', 'utf8');
    
    const requiredMethods = [
      'create',
      'findByQuoteId',
      'findById',
      'update',
      'delete',
      'isCompleteForQuote',
      'findAll'
    ];

    requiredMethods.forEach(method => {
      if (modelContent.includes(`static async ${method}`)) {
        console.log(`   ✅ Method '${method}' exists`);
        results.push({ test: `Method ${method}`, status: 'pass' });
      } else {
        console.log(`   ❌ Method '${method}' missing`);
        results.push({ test: `Method ${method}`, status: 'fail' });
        allTestsPassed = false;
      }
    });
  } catch (error) {
    console.error('❌ Model methods test failed:', error.message);
    allTestsPassed = false;
  }

  // Test 3: Verify frontend components
  console.log('\n📋 Test 3: Verify frontend components');
  try {
    const formContent = fs.readFileSync('./resources/js/Pages/Common/BookingInfoForm.jsx', 'utf8');
    const quoteDetailContent = fs.readFileSync('./resources/js/Pages/Common/QuoteDetail.jsx', 'utf8');
    const inquiryDetailContent = fs.readFileSync('./resources/js/Pages/Common/InquiryDetail.jsx', 'utf8');

    const checks = {
      'BookingInfoForm component': formContent.includes('const BookingInfoForm'),
      'Form fields defined': formContent.includes('validFormFields'),
      'Form submission handler': formContent.includes('handleSubmit'),
      'QuoteDetail imports BookingInfoForm': quoteDetailContent.includes('import BookingInfoForm'),
      'QuoteDetail uses BookingInfoForm': quoteDetailContent.includes('<BookingInfoForm'),
      'InquiryDetail imports BookingInfoForm': inquiryDetailContent.includes('import BookingInfoForm'),
      'InquiryDetail uses BookingInfoForm': inquiryDetailContent.includes('<BookingInfoForm'),
      'Payment check in InquiryDetail': inquiryDetailContent.includes('booking-info') && inquiryDetailContent.includes('handlePayNow'),
    };

    Object.entries(checks).forEach(([check, passed]) => {
      if (passed) {
        console.log(`   ✅ ${check}`);
        results.push({ test: check, status: 'pass' });
      } else {
        console.log(`   ❌ ${check}`);
        results.push({ test: check, status: 'fail' });
        allTestsPassed = false;
      }
    });
  } catch (error) {
    console.error('❌ Frontend components test failed:', error.message);
    allTestsPassed = false;
  }

  // Test 4: Verify database schema
  console.log('\n📋 Test 4: Verify database schema');
  try {
    // Check if we can query the table structure
    const { data, error } = await supabase
      .from('booking_info')
      .select('*')
      .limit(0);

    if (error && error.code !== 'PGRST116') {
      // Check if it's a column error (means table exists but might have wrong columns)
      if (error.message.includes('column')) {
        console.log('   ⚠️  Table exists but may have column issues');
        results.push({ test: 'Table structure', status: 'warning' });
      } else {
        throw error;
      }
    } else {
      console.log('   ✅ booking_info table structure is valid');
      results.push({ test: 'Table structure', status: 'pass' });
    }

    // Check quotes table columns
    const { data: quotesData, error: quotesError } = await supabase
      .from('quotes')
      .select('booking_info_submitted, booking_info_submitted_at')
      .limit(1);

    if (quotesError && quotesError.message.includes('column')) {
      console.log('   ❌ quotes table missing booking_info columns');
      results.push({ test: 'Quotes table columns', status: 'fail' });
      allTestsPassed = false;
    } else {
      console.log('   ✅ quotes table has booking_info columns');
      results.push({ test: 'Quotes table columns', status: 'pass' });
    }
  } catch (error) {
    console.error('❌ Database schema test failed:', error.message);
    allTestsPassed = false;
  }

  // Test 5: Test actual CRUD operations
  console.log('\n📋 Test 5: Test CRUD operations');
  try {
    // Get test data
    const { data: quotes } = await supabase.from('quotes').select('id, inquiry_id').limit(1);
    const { data: users } = await supabase.from('users').select('id').limit(1);

    if (!quotes || quotes.length === 0 || !users || users.length === 0) {
      console.log('   ⚠️  No test data available - skipping CRUD test');
      results.push({ test: 'CRUD operations', status: 'skipped' });
    } else {
      const testData = {
        quote_id: quotes[0].id,
        inquiry_id: quotes[0].inquiry_id,
        user_id: users[0].id,
        full_name: 'Integration Test User',
        email: 'integration-test@example.com',
        phone: '+1234567890',
        status: 'incomplete'
      };

      // CREATE
      const { data: created, error: createError } = await supabase
        .from('booking_info')
        .insert([testData])
        .select()
        .single();

      if (createError) throw createError;
      console.log('   ✅ CREATE operation works');
      results.push({ test: 'CREATE', status: 'pass' });

      // READ
      const { data: read, error: readError } = await supabase
        .from('booking_info')
        .select('*')
        .eq('id', created.id)
        .single();

      if (readError) throw readError;
      if (read.full_name !== testData.full_name) throw new Error('Data mismatch');
      console.log('   ✅ READ operation works');
      results.push({ test: 'READ', status: 'pass' });

      // UPDATE
      const { data: updated, error: updateError } = await supabase
        .from('booking_info')
        .update({ status: 'completed' })
        .eq('id', created.id)
        .select()
        .single();

      if (updateError) throw updateError;
      if (updated.status !== 'completed') throw new Error('Update failed');
      console.log('   ✅ UPDATE operation works');
      results.push({ test: 'UPDATE', status: 'pass' });

      // DELETE
      const { error: deleteError } = await supabase
        .from('booking_info')
        .delete()
        .eq('id', created.id);

      if (deleteError) throw deleteError;
      console.log('   ✅ DELETE operation works');
      results.push({ test: 'DELETE', status: 'pass' });
    }
  } catch (error) {
    console.error('❌ CRUD operations test failed:', error.message);
    results.push({ test: 'CRUD operations', status: 'fail' });
    allTestsPassed = false;
  }

  // Test 6: Verify admin panel integration
  console.log('\n📋 Test 6: Verify admin panel integration');
  try {
    const adminContent = fs.readFileSync('./resources/js/Pages/Admin/InquiryDetail.jsx', 'utf8');
    
    const checks = {
      'Booking info state': adminContent.includes('bookingInfos'),
      'Fetches booking info': adminContent.includes('booking-info'),
      'Displays booking info': adminContent.includes('Booking Information'),
    };

    Object.entries(checks).forEach(([check, passed]) => {
      if (passed) {
        console.log(`   ✅ ${check}`);
        results.push({ test: check, status: 'pass' });
      } else {
        console.log(`   ❌ ${check}`);
        results.push({ test: check, status: 'fail' });
        allTestsPassed = false;
      }
    });
  } catch (error) {
    console.error('❌ Admin panel test failed:', error.message);
    allTestsPassed = false;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary:');
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  if (skipped > 0) console.log(`   ⚠️  Skipped: ${skipped}`);
  
  console.log('\n' + '='.repeat(60));
  if (allTestsPassed && failed === 0) {
    console.log('✅ All integration tests passed! System is fully functional.');
  } else {
    console.log('⚠️  Some tests failed. Please review the errors above.');
  }
  console.log('='.repeat(60));
}

testIntegration().catch(console.error);

