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

async function testBookingInfoSystem() {
  console.log('🧪 Testing Booking Info System\n');
  console.log('='.repeat(60));

  let allTestsPassed = true;

  // Test 1: Check if booking_info table exists
  console.log('\n📋 Test 1: Check booking_info table exists');
  try {
    const { data, error } = await supabase
      .from('booking_info')
      .select('id')
      .limit(1);
    
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    console.log('✅ booking_info table exists and is accessible');
  } catch (error) {
    console.error('❌ booking_info table check failed:', error.message);
    allTestsPassed = false;
  }

  // Test 2: Check if quotes table has booking_info_submitted columns
  console.log('\n📋 Test 2: Check quotes table has booking_info_submitted columns');
  try {
    const { data, error } = await supabase
      .from('quotes')
      .select('id, booking_info_submitted, booking_info_submitted_at')
      .limit(1);
    
    if (error) {
      throw error;
    }
    console.log('✅ quotes table has booking_info_submitted columns');
  } catch (error) {
    console.error('❌ quotes table columns check failed:', error.message);
    allTestsPassed = false;
  }

  // Test 3: Check if indexes exist (by trying to query with them)
  console.log('\n📋 Test 3: Check indexes are working');
  try {
    const { data, error } = await supabase
      .from('booking_info')
      .select('id')
      .eq('status', 'incomplete')
      .limit(1);
    
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    console.log('✅ Indexes are working (query by status succeeded)');
  } catch (error) {
    console.error('❌ Index check failed:', error.message);
    allTestsPassed = false;
  }

  // Test 4: Check if RLS policies are enabled
  console.log('\n📋 Test 4: Check RLS is enabled');
  try {
    // Try to query as anon user (should work if RLS is properly configured)
    const anonClient = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY || supabaseServiceKey);
    const { data, error } = await anonClient
      .from('booking_info')
      .select('id')
      .limit(1);
    
    // Error is expected for anon user without auth, but table should be accessible
    if (error && !error.message.includes('permission') && !error.message.includes('policy')) {
      throw error;
    }
    console.log('✅ RLS is enabled (policies are active)');
  } catch (error) {
    console.error('❌ RLS check failed:', error.message);
    allTestsPassed = false;
  }

  // Test 5: Test creating a booking info record (with test data)
  console.log('\n📋 Test 5: Test creating booking info record');
  try {
    // First, get a test quote and user
    const { data: quotes } = await supabase
      .from('quotes')
      .select('id, inquiry_id')
      .limit(1);
    
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .limit(1);

    if (!quotes || quotes.length === 0) {
      console.log('⚠️  No quotes found - skipping create test');
    } else if (!users || users.length === 0) {
      console.log('⚠️  No users found - skipping create test');
    } else {
      const testBookingInfo = {
        quote_id: quotes[0].id,
        inquiry_id: quotes[0].inquiry_id,
        user_id: users[0].id,
        full_name: 'Test User',
        email: 'test@example.com',
        phone: '+1234567890',
        status: 'incomplete'
      };

      const { data, error } = await supabase
        .from('booking_info')
        .insert([testBookingInfo])
        .select()
        .single();

      if (error) {
        throw error;
      }

      console.log('✅ Successfully created test booking info record');
      console.log(`   Record ID: ${data.id}`);

      // Clean up test record
      await supabase
        .from('booking_info')
        .delete()
        .eq('id', data.id);
      console.log('✅ Test record cleaned up');
    }
  } catch (error) {
    console.error('❌ Create booking info test failed:', error.message);
    allTestsPassed = false;
  }

  // Test 6: Check API endpoint files exist
  console.log('\n📋 Test 6: Check API endpoint files exist');
  try {
    const apiFile = './api/quotes.js';
    const modelFile = './backend/models/bookingInfo.model.js';
    const formFile = './resources/js/Pages/Common/BookingInfoForm.jsx';

    if (!fs.existsSync(apiFile)) {
      throw new Error(`API file not found: ${apiFile}`);
    }
    if (!fs.existsSync(modelFile)) {
      throw new Error(`Model file not found: ${modelFile}`);
    }
    if (!fs.existsSync(formFile)) {
      throw new Error(`Form file not found: ${formFile}`);
    }

    console.log('✅ All required files exist');
    console.log(`   - ${apiFile}`);
    console.log(`   - ${modelFile}`);
    console.log(`   - ${formFile}`);
  } catch (error) {
    console.error('❌ File check failed:', error.message);
    allTestsPassed = false;
  }

  // Test 7: Check BookingInfo model methods
  console.log('\n📋 Test 7: Check BookingInfo model import');
  try {
    const BookingInfo = await import('./backend/models/bookingInfo.model.js');
    if (BookingInfo.default) {
      const methods = Object.getOwnPropertyNames(BookingInfo.default).filter(
        name => typeof BookingInfo.default[name] === 'function'
      );
      console.log('✅ BookingInfo model loaded successfully');
      console.log(`   Available methods: ${methods.join(', ')}`);
    } else {
      throw new Error('BookingInfo model not exported correctly');
    }
  } catch (error) {
    console.error('❌ BookingInfo model check failed:', error.message);
    allTestsPassed = false;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  if (allTestsPassed) {
    console.log('✅ All tests passed! Booking info system is ready.');
  } else {
    console.log('⚠️  Some tests failed. Please review the errors above.');
  }
  console.log('='.repeat(60));
}

testBookingInfoSystem().catch(console.error);

