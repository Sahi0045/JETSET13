#!/usr/bin/env node

/**
 * Firebase Configuration Test Script
 * 
 * This script tests if the Firebase configuration is properly loaded
 * Run with: node test-firebase-config.js
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { createServer } from 'vite';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔍 Firebase Configuration Test\n');

// Load environment variables
config({ path: join(__dirname, '.env') });

// Test 1: Check environment variables
console.log('1. Checking Firebase environment variables...');
const requiredEnvVars = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length === 0) {
    console.log('   ✅ All required Firebase environment variables are set');
    console.log('   🔑 API Key:', process.env.VITE_FIREBASE_API_KEY ? 'Present' : 'Missing');
    console.log('   🌐 Auth Domain:', process.env.VITE_FIREBASE_AUTH_DOMAIN || 'Not set');
    console.log('   📁 Project ID:', process.env.VITE_FIREBASE_PROJECT_ID || 'Not set');
} else {
    console.log('   ❌ Missing environment variables:', missingEnvVars.join(', '));
}

// Test 2: Check .env file content
console.log('\n2. Checking .env file content...');
const envPath = join(__dirname, '.env');
if (existsSync(envPath)) {
    try {
        const envContent = readFileSync(envPath, 'utf8');
        const hasFirebaseConfig = envContent.includes('VITE_FIREBASE_API_KEY') && 
                                 envContent.includes('VITE_FIREBASE_AUTH_DOMAIN') &&
                                 envContent.includes('VITE_FIREBASE_PROJECT_ID');
        
        if (hasFirebaseConfig) {
            console.log('   ✅ Firebase configuration found in .env file');
            
            // Extract and show some config values (without revealing secrets)
            const apiKeyMatch = envContent.match(/VITE_FIREBASE_API_KEY=(.*)/);
            const authDomainMatch = envContent.match(/VITE_FIREBASE_AUTH_DOMAIN=(.*)/);
            const projectIdMatch = envContent.match(/VITE_FIREBASE_PROJECT_ID=(.*)/);
            
            if (apiKeyMatch) {
                const apiKey = apiKeyMatch[1].trim();
                console.log('   🔑 API Key:', apiKey ? `Present (${apiKey.substring(0, 10)}...)` : 'Empty');
            }
            
            if (authDomainMatch) {
                console.log('   🌐 Auth Domain:', authDomainMatch[1].trim() || 'Empty');
            }
            
            if (projectIdMatch) {
                console.log('   📁 Project ID:', projectIdMatch[1].trim() || 'Empty');
            }
        } else {
            console.log('   ❌ Firebase configuration not found in .env file');
        }
    } catch (error) {
        console.log('   ❌ Error reading .env file:', error.message);
    }
} else {
    console.log('   ❌ .env file not found');
}

// Test 3: Summary
console.log('\n📋 Configuration Summary:');
if (missingEnvVars.length === 0) {
    console.log('   ✅ Firebase is properly configured');
    console.log('   💡 You can now use Firebase authentication features');
    console.log('   🚀 Try accessing /firebase-login or /firebase-signup in your app');
} else {
    console.log('   ❌ Firebase is not properly configured');
    console.log('   🛠️  Please check your .env file and ensure all required variables are set');
}

console.log('\n✅ Firebase Configuration Test Complete!');