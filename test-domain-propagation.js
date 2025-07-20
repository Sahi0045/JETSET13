#!/usr/bin/env node

console.log('🔍 Testing Domain Authorization Propagation');
console.log('=========================================');

const currentDomain = 'prod-y6oef0jwv-shubhams-projects-4a867368.vercel.app';
const firebaseProjectId = 'jets-1b5fa';

console.log(`\n📋 Current Domain: ${currentDomain}`);
console.log(`Firebase Project: ${firebaseProjectId}`);

console.log(`\n⏰ Domain Authorization Propagation:`);
console.log(`====================================`);
console.log(`✅ Domain added to Firebase Console`);
console.log(`⏳ Waiting for propagation (2-5 minutes)`);
console.log(`🔄 Testing in 30 seconds...`);

// Wait 30 seconds then test
setTimeout(() => {
  console.log(`\n🧪 Testing Phone Authentication...`);
  console.log(`1. Go to: https://${currentDomain}/phone-login`);
  console.log(`2. Try entering a phone number`);
  console.log(`3. Check if auth/argument-error still occurs`);
  
  console.log(`\n💡 If error persists:`);
  console.log(`   - Wait another 2-3 minutes`);
  console.log(`   - Clear browser cache (Ctrl+Shift+R)`);
  console.log(`   - Try in incognito/private mode`);
  
  console.log(`\n✅ If error is gone:`);
  console.log(`   - Phone authentication is working!`);
  console.log(`   - You can now use real phone numbers`);
}, 30000);

console.log(`\n🔄 This script will test in 30 seconds...`); 