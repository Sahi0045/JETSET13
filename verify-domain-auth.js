#!/usr/bin/env node

console.log('🔍 Firebase Domain Authorization Check');
console.log('=====================================');

const currentDomain = 'prod-y6oef0jwv-shubhams-projects-4a867368.vercel.app';
const firebaseProjectId = 'jets-1b5fa';

console.log(`\n📋 Current Deployment Info:`);
console.log(`Domain: ${currentDomain}`);
console.log(`Firebase Project: ${firebaseProjectId}`);

console.log(`\n🚨 IMMEDIATE ACTION REQUIRED:`);
console.log(`================================`);
console.log(`1. Open: https://console.firebase.google.com/project/${firebaseProjectId}/authentication/settings`);
console.log(`2. Scroll to "Authorized domains" section`);
console.log(`3. Click "Add domain"`);
console.log(`4. Enter: ${currentDomain}`);
console.log(`5. Click "Add"`);
console.log(`6. Wait 1-2 minutes`);
console.log(`7. Test phone authentication again`);

console.log(`\n💡 Why this fixes the auth/argument-error:`);
console.log(`   - Firebase requires domains to be explicitly authorized`);
console.log(`   - RecaptchaVerifier creation fails if domain not authorized`);
console.log(`   - This is a security feature to prevent unauthorized usage`);

console.log(`\n✅ After adding domain, phone auth should work immediately!`); 