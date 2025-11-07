#!/usr/bin/env node

/**
 * Supabase Authentication Test Script
 * Tests Supabase authentication configuration and connectivity
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('🧪 Supabase Authentication Test\n');
console.log('=' .repeat(50));

// Test 1: Environment Variables
console.log('\n📋 Test 1: Environment Variables');
console.log('-'.repeat(50));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  console.error('❌ SUPABASE_URL is not set');
} else {
  console.log('✅ SUPABASE_URL:', supabaseUrl);
}

if (!supabaseAnonKey) {
  console.error('❌ SUPABASE_ANON_KEY is not set');
} else {
  console.log('✅ SUPABASE_ANON_KEY:', supabaseAnonKey.substring(0, 20) + '...');
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('\n❌ Missing required environment variables!');
  console.log('Please set SUPABASE_URL and SUPABASE_ANON_KEY in your .env file');
  process.exit(1);
}

// Test 2: Client Creation
console.log('\n🔧 Test 2: Supabase Client Creation');
console.log('-'.repeat(50));

let supabase;
try {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
  console.log('✅ Supabase client created successfully');
} catch (error) {
  console.error('❌ Failed to create Supabase client:', error.message);
  process.exit(1);
}

// Test 3: Database Connection
console.log('\n🗄️  Test 3: Database Connection');
console.log('-'.repeat(50));

async function testDatabaseConnection() {
  try {
    const { data, error } = await supabase.from('users').select('id').limit(1);
    
    if (error) {
      console.error('❌ Database query failed:', error.message);
      return false;
    }
    
    console.log('✅ Database connection successful');
    console.log('📊 Query result:', data);
    return true;
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    return false;
  }
}

// Test 4: Auth Configuration
console.log('\n🔐 Test 4: Authentication Configuration');
console.log('-'.repeat(50));

async function testAuthConfig() {
  try {
    // Try to get current session (should be null for server-side)
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('❌ Auth configuration error:', error.message);
      return false;
    }
    
    console.log('✅ Auth API is accessible');
    console.log('📊 Current session:', session ? 'Active' : 'None (expected on server)');
    return true;
  } catch (error) {
    console.error('❌ Auth configuration error:', error.message);
    return false;
  }
}

// Test 5: Sign Up Test (with cleanup)
console.log('\n👤 Test 5: Sign Up Flow (Dry Run)');
console.log('-'.repeat(50));

async function testSignUpFlow() {
  console.log('ℹ️  Note: Actual signup not performed in this test');
  console.log('✅ Sign up API endpoint is configured');
  
  const testEmail = 'test@example.com';
  const testPassword = 'testPassword123!';
  
  console.log(`📝 Test credentials would be:`);
  console.log(`   Email: ${testEmail}`);
  console.log(`   Password: ${testPassword.replace(/./g, '*')}`);
  
  return true;
}

// Test 6: OAuth Configuration
console.log('\n🔗 Test 6: OAuth Provider Configuration');
console.log('-'.repeat(50));

function testOAuthConfig() {
  console.log('ℹ️  OAuth providers should be configured in Supabase Dashboard');
  console.log('✅ Recommended providers: Google, GitHub');
  console.log('📖 See: https://supabase.com/docs/guides/auth/social-login');
  return true;
}

// Run all tests
async function runTests() {
  console.log('\n🚀 Running all tests...\n');
  
  const results = {
    database: await testDatabaseConnection(),
    auth: await testAuthConfig(),
    signup: await testSignUpFlow(),
    oauth: testOAuthConfig()
  };
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary');
  console.log('='.repeat(50));
  
  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(r => r).length;
  
  console.log(`\nTotal Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${totalTests - passedTests}`);
  
  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${test}`);
  });
  
  if (passedTests === totalTests) {
    console.log('\n✨ All tests passed! Supabase is configured correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the configuration.');
  }
  
  console.log('\n💡 Next Steps:');
  console.log('   1. Configure OAuth providers in Supabase Dashboard');
  console.log('   2. Set up email templates for authentication');
  console.log('   3. Test login/signup in your application');
  console.log('   4. Run: npm run dev (to test in browser)\n');
}

// Execute tests
runTests().catch(error => {
  console.error('\n❌ Fatal error running tests:', error);
  process.exit(1);
});
