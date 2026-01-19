/**
 * Test Email Notifications for Inquiry System
 * 
 * This script tests the email notification system by simulating
 * inquiry creation and verifying email sending.
 */

import dotenv from 'dotenv';
import { sendInquiryEmails, sendAdminNotification, sendCustomerConfirmation } from './backend/services/email.service.js';

dotenv.config();

console.log('🧪 Testing Email Notification System\n');
console.log('='.repeat(60));

// Test inquiry data - Flight request
const testFlightInquiry = {
    id: 'test-' + Date.now(),
    inquiry_type: 'flight',
    customer_name: 'John Doe',
    customer_email: 'jetsetters721@gmail.com', // Using registered email for testing
    customer_phone: '+1 (555) 123-4567',
    origin: 'New York (JFK)',
    destination: 'London (LHR)',
    departure_date: '2026-03-15',
    return_date: '2026-03-22',
    passengers: 2,
    cabin_class: 'Business',
    created_at: new Date().toISOString(),
    status: 'pending'
};

// Test inquiry data - Hotel request
const testHotelInquiry = {
    id: 'test-hotel-' + Date.now(),
    inquiry_type: 'hotel',
    customer_name: 'Jane Smith',
    customer_email: 'jetsetters721@gmail.com',
    customer_phone: '+1 (555) 987-6543',
    destination: 'Paris, France',
    check_in_date: '2026-04-10',
    check_out_date: '2026-04-17',
    rooms: 1,
    guests: 2,
    created_at: new Date().toISOString(),
    status: 'pending'
};

// Test inquiry data - General request
const testGeneralInquiry = {
    id: 'test-general-' + Date.now(),
    inquiry_type: 'general',
    customer_name: 'Mike Johnson',
    customer_email: 'jetsetters721@gmail.com',
    customer_phone: '+1 (555) 456-7890',
    subject: 'Corporate Travel Package',
    message: 'Looking for a comprehensive corporate travel package for our team of 10 people. We need flights, hotels, and ground transportation for a week-long conference in San Francisco.',
    created_at: new Date().toISOString(),
    status: 'pending'
};

async function runTests() {
    console.log('\n📧 Test 1: Flight Inquiry - Both Emails');
    console.log('-'.repeat(60));
    try {
        const result1 = await sendInquiryEmails(testFlightInquiry);
        console.log('Admin Email:', result1.admin.success ? '✅ Sent' : `❌ Failed: ${result1.admin.error}`);
        console.log('Customer Email:', result1.customer.success ? '✅ Sent' : `❌ Failed: ${result1.customer.error}`);

        if (result1.admin.success) {
            console.log('  Admin Email ID:', result1.admin.id);
        }
        if (result1.customer.success) {
            console.log('  Customer Email ID:', result1.customer.id);
        }
    } catch (error) {
        console.error('❌ Test 1 Failed:', error.message);
    }

    console.log('\n📧 Test 2: Hotel Inquiry - Admin Notification Only');
    console.log('-'.repeat(60));
    try {
        const result2 = await sendAdminNotification(testHotelInquiry);
        console.log('Admin Email:', result2.success ? '✅ Sent' : `❌ Failed: ${result2.error}`);
        if (result2.success) {
            console.log('  Email ID:', result2.id);
        }
    } catch (error) {
        console.error('❌ Test 2 Failed:', error.message);
    }

    console.log('\n📧 Test 3: General Inquiry - Customer Confirmation Only');
    console.log('-'.repeat(60));
    try {
        const result3 = await sendCustomerConfirmation(testGeneralInquiry);
        console.log('Customer Email:', result3.success ? '✅ Sent' : `❌ Failed: ${result3.error}`);
        if (result3.success) {
            console.log('  Email ID:', result3.id);
        }
    } catch (error) {
        console.error('❌ Test 3 Failed:', error.message);
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Email Tests Completed!\n');
    console.log('📋 Next Steps:');
    console.log('1. Check email inbox: jetsetters721@gmail.com');
    console.log('2. Verify Resend dashboard: https://resend.com/logs');
    console.log('3. Confirm email formatting and content');
    console.log('\n⚠️  Note: Free tier can only send to registered email (jetsetters721@gmail.com)');
    console.log('   For production, verify your domain on Resend to send to any email.\n');
}

// Run tests
runTests().catch(error => {
    console.error('\n❌ Test Suite Failed:', error);
    process.exit(1);
});
