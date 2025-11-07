#!/usr/bin/env node

/**
 * Google Auth Setup Verification Script
 * Run this to check if all files are in place
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Verifying Google Auth Test Setup...\n');

const checks = [];

// Check if files exist
const filesToCheck = [
  'frontend/lib/supabaseClient.js',
  'frontend/components/GoogleAuthTest.jsx',
  'frontend/App.jsx',
  'GOOGLE_AUTH_SETUP_GUIDE.md',
  'GOOGLE_AUTH_QUICK_START.md'
];

filesToCheck.forEach(file => {
  const filePath = path.join(__dirname, file);
  const exists = fs.existsSync(filePath);
  checks.push({
    name: file,
    status: exists,
    message: exists ? '✅ Found' : '❌ Missing'
  });
});

// Check if App.jsx has the route
const appPath = path.join(__dirname, 'frontend/App.jsx');
if (fs.existsSync(appPath)) {
  const appContent = fs.readFileSync(appPath, 'utf8');
  const hasRoute = appContent.includes('/google-auth-test');
  const hasImport = appContent.includes('GoogleAuthTest');
  
  checks.push({
    name: 'Route /google-auth-test in App.jsx',
    status: hasRoute,
    message: hasRoute ? '✅ Configured' : '❌ Missing'
  });
  
  checks.push({
    name: 'GoogleAuthTest import in App.jsx',
    status: hasImport,
    message: hasImport ? '✅ Configured' : '❌ Missing'
  });
}

// Check if Supabase is installed
const packagePath = path.join(__dirname, 'package.json');
if (fs.existsSync(packagePath)) {
  const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const hasSupabase = packageContent.dependencies && 
                      packageContent.dependencies['@supabase/supabase-js'];
  
  checks.push({
    name: '@supabase/supabase-js package',
    status: hasSupabase,
    message: hasSupabase ? `✅ Installed (${packageContent.dependencies['@supabase/supabase-js']})` : '❌ Not installed'
  });
}

// Print results
console.log('📋 Setup Verification Results:\n');
checks.forEach(check => {
  console.log(`${check.message} ${check.name}`);
});

const allPassed = checks.every(check => check.status);

console.log('\n' + '='.repeat(50));
if (allPassed) {
  console.log('✅ All checks passed! Setup is complete.');
  console.log('\n📚 Next Steps:');
  console.log('1. Configure Google OAuth in Google Cloud Console');
  console.log('2. Enable Google provider in Supabase Dashboard');
  console.log('3. Run: npm run dev');
  console.log('4. Visit: http://localhost:5173/google-auth-test');
  console.log('\n📖 See GOOGLE_AUTH_SETUP_GUIDE.md for detailed instructions');
} else {
  console.log('❌ Some checks failed. Please review the setup.');
  console.log('\n🔧 Troubleshooting:');
  console.log('- Ensure all files were created correctly');
  console.log('- Check for any file permission issues');
  console.log('- Verify package.json has @supabase/supabase-js');
}
console.log('='.repeat(50) + '\n');

// Exit with appropriate code
process.exit(allPassed ? 0 : 1);
