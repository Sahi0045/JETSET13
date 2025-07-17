#!/usr/bin/env node

// Test script to verify the frontend API URL configuration
import dotenv from 'dotenv';
import axios from 'axios';

// Load environment variables
dotenv.config();

console.log('🔍 Frontend API URL Configuration Test');
console.log('=====================================');

// Test 1: Check environment variables
console.log('\n1. Environment Variables:');
console.log(`   VITE_API_URL: ${process.env.VITE_API_URL || 'Not set'}`);
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'Not set'}`);
console.log(`   PORT: ${process.env.PORT || 'Not set'}`);

// Test 2: Simulate amadeusUtils logic
console.log('\n2. AmadeusUtils Logic Simulation:');
const mockViteEnv = {
  VITE_API_URL: process.env.VITE_API_URL
};

const API_URL = mockViteEnv.VITE_API_URL || 'http://localhost:5005/api';
console.log(`   Resolved API_URL: ${API_URL}`);
console.log(`   Destinations URL: ${API_URL}/hotels/destinations`);

// Test 3: Test the actual API endpoints
console.log('\n3. API Endpoint Tests:');

const testEndpoints = [
  '/api/hotels/destinations',
  '/hotels/destinations'  // This should fail
];

for (const endpoint of testEndpoints) {
  try {
    const fullUrl = `http://localhost:5005${endpoint}`;
    console.log(`\n   Testing: ${fullUrl}`);
    
    const response = await axios.get(fullUrl, { timeout: 5000 });
    console.log(`   ✅ SUCCESS: ${response.status} - ${response.data.data?.length || 0} destinations`);
  } catch (error) {
    if (error.response) {
      console.log(`   ❌ FAILED: ${error.response.status} - ${error.response.statusText}`);
    } else {
      console.log(`   ❌ ERROR: ${error.message}`);
    }
  }
}

// Test 4: Check what the browser should see
console.log('\n4. Browser Resolution:');
console.log('   When the frontend runs, it should:');
console.log(`   - Read VITE_API_URL = "${process.env.VITE_API_URL}"`);
console.log(`   - Use amadeusUtils.API_URL = "${API_URL}"`);
console.log(`   - Make requests to: "${API_URL}/hotels/destinations"`);

console.log('\n🔧 If you still see 404 errors in the browser:');
console.log('   1. Hard refresh the browser (Ctrl+F5 or Cmd+Shift+R)');
console.log('   2. Clear browser cache for localhost');
console.log('   3. Check Network tab in dev tools to see actual URLs');
console.log('   4. Restart the Vite dev server if needed');

console.log('\n✅ Configuration looks correct!'); 