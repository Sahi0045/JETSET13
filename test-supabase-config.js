#!/usr/bin/env node

/**
 * Supabase Configuration Test
 * Validates Supabase configuration and environment setup
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

console.log('🔧 Supabase Configuration Test\n');
console.log('='.repeat(60));

// Test 1: Check .env file exists
console.log('\n📄 Test 1: Environment File Check');
console.log('-'.repeat(60));

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  console.log('✅ .env file found');
  const envContent = fs.readFileSync(envPath, 'utf8');
  console.log(`📊 File size: ${envContent.length} bytes`);
} else {
  console.error('❌ .env file not found');
  console.log('💡 Create a .env file from .env.example');
}

// Test 2: Required Environment Variables
console.log('\n🔑 Test 2: Required Environment Variables');
console.log('-'.repeat(60));

const requiredVars = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY'
];

const optionalVars = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ACCESS_TOKEN'
];

let missingVars = [];

requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (!value) {
    console.error(`❌ ${varName} is not set`);
    missingVars.push(varName);
  } else {
    const maskedValue = varName.includes('KEY') || varName.includes('TOKEN')
      ? value.substring(0, 20) + '...'
      : value;
    console.log(`✅ ${varName}: ${maskedValue}`);
  }
});

console.log('\n📋 Optional Variables:');
optionalVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    const maskedValue = value.substring(0, 20) + '...';
    console.log(`✅ ${varName}: ${maskedValue}`);
  } else {
    console.log(`⚠️  ${varName}: Not set (optional)`);
  }
});

// Test 3: Validate Supabase URL Format
console.log('\n🌐 Test 3: Supabase URL Validation');
console.log('-'.repeat(60));

const supabaseUrl = process.env.SUPABASE_URL;
if (supabaseUrl) {
  try {
    const url = new URL(supabaseUrl);
    console.log(`✅ Valid URL format`);
    console.log(`   Protocol: ${url.protocol}`);
    console.log(`   Host: ${url.hostname}`);
    
    if (url.hostname.includes('supabase.co')) {
      console.log('✅ URL appears to be a valid Supabase URL');
    } else {
      console.warn('⚠️  URL does not appear to be from supabase.co');
    }
  } catch (error) {
    console.error(`❌ Invalid URL format: ${error.message}`);
  }
} else {
  console.error('❌ SUPABASE_URL is not set');
}

// Test 4: Validate Anon Key Format
console.log('\n🔐 Test 4: Anon Key Validation');
console.log('-'.repeat(60));

const anonKey = process.env.SUPABASE_ANON_KEY;
if (anonKey) {
  // JWT tokens should have 3 parts separated by dots
  const parts = anonKey.split('.');
  if (parts.length === 3) {
    console.log('✅ Anon key appears to be a valid JWT');
    console.log(`   Header: ${parts[0].substring(0, 10)}...`);
    console.log(`   Payload: ${parts[1].substring(0, 10)}...`);
    console.log(`   Signature: ${parts[2].substring(0, 10)}...`);
    
    // Try to decode the payload (base64)
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      console.log('\n📊 JWT Payload:');
      console.log(`   Issuer: ${payload.iss || 'N/A'}`);
      console.log(`   Role: ${payload.role || 'N/A'}`);
      if (payload.exp) {
        const expiryDate = new Date(payload.exp * 1000);
        console.log(`   Expires: ${expiryDate.toLocaleString()}`);
      }
    } catch (error) {
      console.warn(`⚠️  Could not decode JWT payload: ${error.message}`);
    }
  } else {
    console.error('❌ Anon key does not appear to be a valid JWT');
  }
} else {
  console.error('❌ SUPABASE_ANON_KEY is not set');
}

// Test 5: Frontend Configuration
console.log('\n🎨 Test 5: Frontend Configuration Files');
console.log('-'.repeat(60));

const frontendConfigPath = path.resolve(process.cwd(), 'resources/js/lib/supabase.js');
if (fs.existsSync(frontendConfigPath)) {
  console.log('✅ Frontend Supabase config found');
  const configContent = fs.readFileSync(frontendConfigPath, 'utf8');
  
  if (configContent.includes('createClient')) {
    console.log('✅ Uses createClient from @supabase/supabase-js');
  }
  
  if (configContent.includes(supabaseUrl)) {
    console.log('✅ URL matches environment variable');
  } else {
    console.warn('⚠️  URL in config file may not match .env');
  }
} else {
  console.error('❌ Frontend Supabase config not found');
  console.log(`   Expected: ${frontendConfigPath}`);
}

// Test 6: Backend Configuration
console.log('\n⚙️  Test 6: Backend Configuration Files');
console.log('-'.repeat(60));

const backendConfigPath = path.resolve(process.cwd(), 'backend/config/supabase.js');
if (fs.existsSync(backendConfigPath)) {
  console.log('✅ Backend Supabase config found');
} else {
  console.error('❌ Backend Supabase config not found');
  console.log(`   Expected: ${backendConfigPath}`);
}

// Test 7: Dependencies Check
console.log('\n📦 Test 7: Required Dependencies');
console.log('-'.repeat(60));

const packageJsonPath = path.resolve(process.cwd(), 'package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  
  if (dependencies['@supabase/supabase-js']) {
    console.log(`✅ @supabase/supabase-js: ${dependencies['@supabase/supabase-js']}`);
  } else {
    console.error('❌ @supabase/supabase-js not installed');
    console.log('   Run: npm install @supabase/supabase-js');
  }
} else {
  console.error('❌ package.json not found');
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 Configuration Summary');
console.log('='.repeat(60));

if (missingVars.length === 0 && supabaseUrl && anonKey) {
  console.log('\n✅ Configuration appears to be complete!');
  console.log('\n💡 Next Steps:');
  console.log('   1. Run: node test-supabase-auth.js');
  console.log('   2. Test authentication in your application');
  console.log('   3. Configure OAuth providers in Supabase Dashboard\n');
} else {
  console.log('\n❌ Configuration incomplete');
  console.log('\n📝 Missing Variables:');
  missingVars.forEach(v => console.log(`   - ${v}`));
  console.log('\n💡 Fix:');
  console.log('   1. Copy .env.example to .env');
  console.log('   2. Get your Supabase credentials from https://supabase.com/dashboard');
  console.log('   3. Update .env with your credentials');
  console.log('   4. Run this test again\n');
}
