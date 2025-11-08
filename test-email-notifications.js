#!/usr/bin/env node

/**
 * Test Email Notifications Script
 * 
 * This script tests the email notification system by creating a test inquiry
 * and verifying that emails are sent to both customer and admin.
 * 
 * Usage:
 *   node test-email-notifications.js
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 5005;
const API_URL = `http://localhost:${PORT}/api`;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'sahi0045@hotmail.com';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testInquiryEmailNotifications() {
  log('\n' + '='.repeat(60), 'blue');
  log('📧 Testing Email Notification System', 'bold');
  log('='.repeat(60), 'blue');
  
  // Test data - only use fields that exist in inquiries table
  // NOTE: On Resend free tier, you can only send to your registered email
  const testInquiry = {
    inquiry_type: 'general',
    customer_name: 'Test Customer',
    customer_email: 'jetsetters721@gmail.com', // Use your Resend registered email
    customer_phone: '+1234567890',
    inquiry_subject: 'Paris Romantic Getaway',
    inquiry_message: 'Test inquiry to verify email notifications are working. Looking for a romantic getaway in Paris from June 1-10, 2025 for 2 adults. Budget: $5000-$10000. Please send me a quote for this trip.',
    travel_details: {
      destination: 'Paris, France',
      dates: 'June 1-10, 2025',
      travelers: 2,
      budget: '$5000-$10000'
    }
  };

  log('\n📋 Test Inquiry Details:', 'yellow');
  log(`   Customer Name: ${testInquiry.customer_name}`);
  log(`   Customer Email: ${testInquiry.customer_email}`);
  log(`   Inquiry Type: ${testInquiry.inquiry_type}`);
  log(`   Travel Details: Paris romantic getaway`);

  log('\n📤 Sending test inquiry to API...', 'yellow');
  
  try {
    const response = await fetch(`${API_URL}/inquiries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testInquiry)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed (${response.status}): ${errorText}`);
    }

    const result = await response.json();

    if (result.success) {
      log('\n✅ Inquiry Created Successfully!', 'green');
      log(`   Inquiry ID: ${result.data.id}`);
      log(`   Status: ${result.data.status}`);
      
      log('\n📧 Expected Email Notifications:', 'blue');
      log('   1. Customer Confirmation Email:', 'yellow');
      log(`      → To: ${testInquiry.customer_email}`);
      log(`      → Subject: ✈️ Inquiry Received - JetSet Travel`);
      log(`      → Contains: Inquiry details, 24-hour response promise, My Trips link`);
      
      log('\n   2. Admin Notification Email:', 'yellow');
      log(`      → To: ${ADMIN_EMAIL}`);
      log(`      → Subject: 🔔 New Travel Inquiry - Action Required`);
      log(`      → Contains: Customer info, inquiry details, admin panel link`);

      log('\n🔍 Verification Steps:', 'blue');
      log('   1. Check server console logs for email status messages:');
      log('      - Look for: "✅ Confirmation email sent to customer"');
      log('      - Look for: "✅ Admin notification email sent to"');
      
      log('\n   2. Check Resend Dashboard:', 'yellow');
      log('      - Visit: https://resend.com/logs');
      log('      - Verify 2 emails were sent');
      log('      - Check delivery status');
      
      log('\n   3. Check Email Inboxes:', 'yellow');
      log(`      - Customer email: ${testInquiry.customer_email}`);
      log(`      - Admin email: ${ADMIN_EMAIL}`);
      log('      - Check spam/junk folders if not in inbox');

      log('\n📊 Next Steps:', 'blue');
      log('   1. If emails not received:');
      log('      - Verify RESEND_API_KEY is set correctly');
      log('      - Check Resend dashboard for errors');
      log('      - Review EMAIL_NOTIFICATIONS_SETUP.md');
      
      log('\n   2. To test quote email notification:');
      log('      - Log in as admin');
      log('      - Go to Admin Panel → Inquiries');
      log(`      - View inquiry #${result.data.id}`);
      log('      - Create and send a quote');
      log('      - Customer will receive quote email');

      log('\n' + '='.repeat(60), 'green');
      log('✅ Test Completed Successfully!', 'green');
      log('='.repeat(60), 'green');
      
    } else {
      throw new Error(result.message || 'Failed to create inquiry');
    }
    
  } catch (error) {
    log('\n' + '='.repeat(60), 'red');
    log('❌ Test Failed', 'red');
    log('='.repeat(60), 'red');
    log(`\nError: ${error.message}`, 'red');
    
    log('\n🔧 Troubleshooting:', 'yellow');
    log('   1. Ensure backend server is running (http://localhost:10000)');
    log('   2. Check that RESEND_API_KEY is set in .env');
    log('   3. Verify database is accessible');
    log('   4. Review backend logs for detailed error messages');
    
    process.exit(1);
  }
}

// Run the test
log('\n🚀 Starting Email Notification Test...', 'blue');
testInquiryEmailNotifications();
