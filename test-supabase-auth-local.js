#!/usr/bin/env node

/**
 * Test Supabase Authentication Locally
 * Run this to verify the fix works before deploying
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

console.log('🧪 Testing Supabase Authentication Fix\n');
console.log('='.repeat(60));

// Check environment variables
console.log('\n📋 Step 1: Check Environment Variables');
console.log('-'.repeat(60));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;

if (!supabaseUrl) {
  console.error('❌ SUPABASE_URL not set');
} else {
  console.log('✅ SUPABASE_URL:', supabaseUrl);
}

if (!supabaseAnonKey) {
  console.error('❌ SUPABASE_ANON_KEY not set');
} else {
  console.log('✅ SUPABASE_ANON_KEY:', supabaseAnonKey.substring(0, 20) + '...');
}

if (!supabaseJwtSecret) {
  console.error('❌ SUPABASE_JWT_SECRET not set');
  console.log('⚠️  You need to add this to your .env file!');
  console.log('   Get it from: https://supabase.com/dashboard/project/qqmagqwumjipdqvxbiqu/settings/api');
} else {
  console.log('✅ SUPABASE_JWT_SECRET:', supabaseJwtSecret.substring(0, 20) + '...');
}

// Test local server
console.log('\n🌐 Step 2: Test Local Server');
console.log('-'.repeat(60));

async function testLocalServer() {
  try {
    const response = await fetch('http://localhost:5004/api/health');
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Local server is running');
      console.log('   Status:', data.status);
      console.log('   Uptime:', Math.floor(data.uptime), 'seconds');
    } else {
      console.error('❌ Local server returned:', response.status);
    }
  } catch (error) {
    console.error('❌ Local server not running');
    console.log('   Start it with: npm run dev');
  }
}

await testLocalServer();

// Test inquiry endpoint
console.log('\n📝 Step 3: Test Inquiry Endpoint');
console.log('-'.repeat(60));

async function testInquiryEndpoint() {
  try {
    const response = await fetch('http://localhost:5004/api/inquiries', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inquiry_type: 'general',
        customer_name: 'Test User',
        customer_email: 'test@example.com',
        customer_phone: '1234567890',
        customer_country: 'Test Country',
        inquiry_subject: 'Test',
        inquiry_message: 'This is a test inquiry'
      })
    });

    if (response.ok) {
      console.log('✅ Inquiry endpoint is accessible');
      const data = await response.json();
      console.log('   Response:', data.message);
    } else {
      console.error('❌ Inquiry endpoint returned:', response.status);
      const text = await response.text();
      console.log('   Error:', text.substring(0, 100));
    }
  } catch (error) {
    console.error('❌ Could not reach inquiry endpoint');
    console.log('   Error:', error.message);
  }
}

await testInquiryEndpoint();

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 Summary');
console.log('='.repeat(60));

if (supabaseUrl && supabaseAnonKey && supabaseJwtSecret) {
  console.log('\n✅ All environment variables are set!');
  console.log('\n📝 Next Steps:');
  console.log('   1. Make sure local server is running: npm run dev');
  console.log('   2. Test login: http://localhost:5173/supabase-login');
  console.log('   3. Test inquiry: http://localhost:5173/request');
  console.log('   4. Check console for "User is authenticated"');
  console.log('   5. If working, deploy to production!');
} else {
  console.log('\n⚠️  Missing environment variables!');
  console.log('\n📝 Required Actions:');
  if (!supabaseJwtSecret) {
    console.log('   1. Get JWT Secret from Supabase Dashboard');
    console.log('   2. Add to .env: SUPABASE_JWT_SECRET=your-secret');
  }
  console.log('   3. Restart server: npm run dev');
  console.log('   4. Run this test again');
}

console.log('\n🔗 Useful Links:');
console.log('   Supabase Dashboard: https://supabase.com/dashboard/project/qqmagqwumjipdqvxbiqu');
console.log('   API Settings: https://supabase.com/dashboard/project/qqmagqwumjipdqvxbiqu/settings/api');
console.log('\n');
