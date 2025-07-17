#!/usr/bin/env node

/**
 * Firebase Authentication Test Script
 * 
 * This script tests the Firebase authentication setup
 * Run with: node test-firebase-auth.js
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔥 Firebase Authentication Setup Test\n');

// Test 1: Check if Firebase is installed
console.log('1. Checking Firebase installation...');
try {
    const packageJson = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));
    const firebaseVersion = packageJson.dependencies?.firebase;
    
    if (firebaseVersion) {
        console.log(`   ✅ Firebase installed: ${firebaseVersion}`);
    } else {
        console.log('   ❌ Firebase not found in dependencies');
        console.log('   💡 Run: npm install firebase');
    }
} catch (error) {
    console.log('   ❌ Error reading package.json:', error.message);
}

// Test 2: Check if Firebase config file exists
console.log('\n2. Checking Firebase configuration...');
const firebaseConfigPath = join(__dirname, 'resources/js/config/firebase.js');
if (existsSync(firebaseConfigPath)) {
    console.log('   ✅ Firebase config file exists');
    
    // Check if config has required fields
    try {
        const configContent = readFileSync(firebaseConfigPath, 'utf8');
        const requiredFields = [
            'VITE_FIREBASE_API_KEY',
            'VITE_FIREBASE_AUTH_DOMAIN',
            'VITE_FIREBASE_PROJECT_ID',
            'VITE_FIREBASE_STORAGE_BUCKET',
            'VITE_FIREBASE_MESSAGING_SENDER_ID',
            'VITE_FIREBASE_APP_ID'
        ];
        
        const missingFields = requiredFields.filter(field => !configContent.includes(field));
        
        if (missingFields.length === 0) {
            console.log('   ✅ All required Firebase config fields present');
        } else {
            console.log('   ⚠️  Missing config fields:', missingFields.join(', '));
        }
    } catch (error) {
        console.log('   ❌ Error reading config file:', error.message);
    }
} else {
    console.log('   ❌ Firebase config file not found');
    console.log('   💡 Expected at: resources/js/config/firebase.js');
}

// Test 3: Check if Firebase Auth Context exists
console.log('\n3. Checking Firebase Auth Context...');
const authContextPath = join(__dirname, 'resources/js/contexts/FirebaseAuthContext.jsx');
if (existsSync(authContextPath)) {
    console.log('   ✅ Firebase Auth Context exists');
} else {
    console.log('   ❌ Firebase Auth Context not found');
    console.log('   💡 Expected at: resources/js/contexts/FirebaseAuthContext.jsx');
}

// Test 4: Check if Firebase components exist
console.log('\n4. Checking Firebase components...');
const components = [
    'resources/js/Pages/Common/login/FirebaseLogin.jsx',
    'resources/js/Pages/Common/login/FirebaseSignup.jsx',
    'resources/js/Pages/Common/login/FirebaseProfileDashboard.jsx',
    'resources/js/components/ProtectedRoute.jsx'
];

components.forEach(componentPath => {
    const fullPath = join(__dirname, componentPath);
    const componentName = componentPath.split('/').pop();
    
    if (existsSync(fullPath)) {
        console.log(`   ✅ ${componentName} exists`);
    } else {
        console.log(`   ❌ ${componentName} not found`);
    }
});

// Test 5: Check if environment variables are documented
console.log('\n5. Checking environment configuration...');
const envExamplePath = join(__dirname, '.env.example');
if (existsSync(envExamplePath)) {
    console.log('   ✅ .env.example exists');
    
    try {
        const envContent = readFileSync(envExamplePath, 'utf8');
        if (envContent.includes('VITE_FIREBASE_API_KEY')) {
            console.log('   ✅ Firebase environment variables documented');
        } else {
            console.log('   ⚠️  Firebase environment variables not documented');
        }
    } catch (error) {
        console.log('   ❌ Error reading .env.example:', error.message);
    }
} else {
    console.log('   ❌ .env.example not found');
}

// Test 6: Check if routes are added to app.jsx
console.log('\n6. Checking Firebase routes...');
const appPath = join(__dirname, 'resources/js/app.jsx');
if (existsSync(appPath)) {
    try {
        const appContent = readFileSync(appPath, 'utf8');
        const firebaseRoutes = [
            '/firebase-login',
            '/firebase-signup',
            '/firebase-profile'
        ];
        
        const missingRoutes = firebaseRoutes.filter(route => !appContent.includes(route));
        
        if (missingRoutes.length === 0) {
            console.log('   ✅ All Firebase routes added to app.jsx');
        } else {
            console.log('   ⚠️  Missing routes:', missingRoutes.join(', '));
        }
    } catch (error) {
        console.log('   ❌ Error reading app.jsx:', error.message);
    }
} else {
    console.log('   ❌ app.jsx not found');
}

// Test 7: Check if main.jsx is updated
console.log('\n7. Checking main.jsx integration...');
const mainPath = join(__dirname, 'src/main.jsx');
if (existsSync(mainPath)) {
    try {
        const mainContent = readFileSync(mainPath, 'utf8');
        if (mainContent.includes('FirebaseAuthProvider')) {
            console.log('   ✅ FirebaseAuthProvider added to main.jsx');
        } else {
            console.log('   ⚠️  FirebaseAuthProvider not found in main.jsx');
        }
    } catch (error) {
        console.log('   ❌ Error reading main.jsx:', error.message);
    }
} else {
    console.log('   ❌ main.jsx not found');
}

// Summary and next steps
console.log('\n🎯 Next Steps:');
console.log('1. Create a Firebase project at https://console.firebase.google.com/');
console.log('2. Enable Authentication with Email/Password and Google');
console.log('3. Add your Firebase config to .env file');
console.log('4. Run: npm install');
console.log('5. Test the Firebase routes:');
console.log('   - /firebase-login');
console.log('   - /firebase-signup');
console.log('   - /firebase-profile');

console.log('\n📚 Documentation:');
console.log('- Setup Guide: firebase-setup.md');
console.log('- Migration Guide: FIREBASE_MIGRATION_GUIDE.md');

console.log('\n🔥 Firebase Auth Test Complete!'); 