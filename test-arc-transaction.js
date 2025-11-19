#!/usr/bin/env node

/**
 * Complete ARC Pay Transaction Test
 * Tests the full payment flow with ARC Pay API
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PRODUCTION_URL = process.env.PRODUCTION_URL || 'https://www.jetsetterss.com';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🧪 ARC Pay Complete Transaction Test\n');
console.log('═'.repeat(70));
console.log(`Target API: ${PRODUCTION_URL}`);
console.log(`Merchant ID: ${process.env.ARC_PAY_MERCHANT_ID || 'TESTARC05511704'}`);
console.log('═'.repeat(70));
console.log('');

async function testArcTransaction() {
  try {
    // Step 1: Find or create a test quote
    console.log('📋 Step 1: Finding a test quote...');
    let quoteId = null;
    let quote = null;

    // Try to find an existing unpaid quote
    const { data: existingQuotes, error: quoteError } = await supabase
      .from('quotes')
      .select('id, quote_number, total_amount, currency, payment_status, status, inquiry_id')
      .eq('payment_status', 'unpaid')
      .in('status', ['sent', 'accepted'])
      .limit(1)
      .single();

    if (existingQuotes && !quoteError) {
      quote = existingQuotes;
      quoteId = quote.id;
      console.log('✅ Found existing unpaid quote:');
      console.log(`   Quote ID: ${quoteId}`);
      console.log(`   Quote Number: ${quote.quote_number || 'N/A'}`);
      console.log(`   Amount: ${quote.total_amount} ${quote.currency || 'USD'}`);
      console.log(`   Status: ${quote.status}`);
    } else {
      console.log('⚠️  No unpaid quotes found. Creating a test quote...');
      
      // Create a test inquiry first
      const { data: inquiry, error: inquiryError } = await supabase
        .from('inquiries')
        .insert([{
          inquiry_type: 'flight',
          customer_name: 'ARC Test Customer',
          customer_email: 'arctest@jetsetterss.com',
          customer_phone: '+1234567890',
          status: 'quoted',
          travel_date: new Date().toISOString().split('T')[0]
        }])
        .select()
        .single();

      if (inquiryError) {
        throw new Error(`Failed to create test inquiry: ${inquiryError.message}`);
      }

      console.log(`✅ Created test inquiry: ${inquiry.id}`);

      // Create a test quote
      const { data: newQuote, error: createQuoteError } = await supabase
        .from('quotes')
        .insert([{
          inquiry_id: inquiry.id,
          quote_number: `ARC-TEST-${Date.now()}`,
          title: 'ARC Pay Test Transaction',
          total_amount: 100.00,
          currency: 'USD',
          status: 'sent',
          payment_status: 'unpaid',
          description: 'Test quote for ARC Pay transaction testing'
        }])
        .select()
        .single();

      if (createQuoteError) {
        throw new Error(`Failed to create test quote: ${createQuoteError.message}`);
      }

      quote = newQuote;
      quoteId = quote.id;
      console.log(`✅ Created test quote: ${quoteId}`);
      console.log(`   Amount: $${quote.total_amount} ${quote.currency}`);
    }

    console.log('');

    // Step 2: Check if booking info exists (required for payment)
    console.log('📋 Step 2: Checking booking info...');
    const { data: bookingInfo } = await supabase
      .from('booking_info')
      .select('id, status, full_name, email, terms_accepted')
      .eq('quote_id', quoteId)
      .single();

    if (!bookingInfo || bookingInfo.status !== 'completed') {
      console.log('⚠️  No completed booking info found. Creating test booking info...');
      
      const { data: newBookingInfo, error: bookingError } = await supabase
        .from('booking_info')
        .insert([{
          quote_id: quoteId,
          inquiry_id: quote.inquiry_id,
          full_name: 'ARC Test Customer',
          email: 'arctest@jetsetterss.com',
          phone: '+1234567890',
          date_of_birth: '1990-01-01',
          terms_accepted: true,
          status: 'completed',
          govt_id_type: 'drivers_license',
          govt_id_number: 'TEST123456'
        }])
        .select()
        .single();

      if (bookingError) {
        console.warn('⚠️  Could not create booking info:', bookingError.message);
        console.log('   Continuing anyway...');
      } else {
        console.log('✅ Created test booking info');
      }
    } else {
      console.log('✅ Booking info exists and is completed');
    }

    console.log('');

    // Step 3: Initiate payment with ARC Pay
    console.log('📋 Step 3: Initiating payment with ARC Pay...');
    console.log(`   Quote ID: ${quoteId}`);
    console.log(`   Amount: $${quote.total_amount} ${quote.currency || 'USD'}`);
    console.log('');

    const paymentInitResponse = await fetch(`${PRODUCTION_URL}/api/payments?action=initiate-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        quote_id: quoteId,
        return_url: `${PRODUCTION_URL}/payment/callback?quote_id=${quoteId}`,
        cancel_url: `${PRODUCTION_URL}/inquiry/${quote.inquiry_id}?payment=cancelled`
      })
    });

    const paymentData = await paymentInitResponse.json();

    console.log('📊 Payment Initiation Response:');
    console.log(`   Status: ${paymentInitResponse.status}`);
    console.log(`   Success: ${paymentData.success}`);
    
    if (!paymentData.success) {
      console.error('❌ Payment initiation failed!');
      console.error('   Error:', paymentData.error);
      console.error('   Details:', paymentData.details);
      console.error('   Full response:', JSON.stringify(paymentData, null, 2));
      return;
    }

    console.log('✅ Payment session created successfully!');
    console.log(`   Session ID: ${paymentData.sessionId}`);
    console.log(`   Payment ID: ${paymentData.paymentId}`);
    console.log(`   Merchant ID: ${paymentData.merchantId}`);
    console.log(`   Payment Page URL: ${paymentData.paymentPageUrl || paymentData.checkoutUrl}`);
    console.log('');

    // Step 4: Display test card information
    console.log('📋 Step 4: Test Card Information');
    console.log('═'.repeat(70));
    console.log('Use these test cards on the ARC Pay payment page:');
    console.log('');
    console.log('Visa:');
    console.log('   Card Number: 4111111111111111');
    console.log('   CVV: 123');
    console.log('   Expiry: 12/25 (or any future date)');
    console.log('');
    console.log('Mastercard:');
    console.log('   Card Number: 5555555555554444');
    console.log('   CVV: 123');
    console.log('   Expiry: 12/25 (or any future date)');
    console.log('');
    console.log('American Express:');
    console.log('   Card Number: 378282246310005');
    console.log('   CVV: 1234');
    console.log('   Expiry: 12/25 (or any future date)');
    console.log('═'.repeat(70));
    console.log('');

    // Step 5: Check payment record in database
    console.log('📋 Step 5: Verifying payment record in database...');
    const { data: paymentRecord, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentData.paymentId)
      .single();

    if (paymentError) {
      console.warn('⚠️  Could not fetch payment record:', paymentError.message);
    } else {
      console.log('✅ Payment record found:');
      console.log(`   Payment ID: ${paymentRecord.id}`);
      console.log(`   Quote ID: ${paymentRecord.quote_id}`);
      console.log(`   Amount: ${paymentRecord.amount} ${paymentRecord.currency}`);
      console.log(`   Status: ${paymentRecord.payment_status}`);
      console.log(`   ARC Session ID: ${paymentRecord.arc_session_id || 'N/A'}`);
      console.log(`   Created: ${paymentRecord.created_at}`);
    }

    console.log('');

    // Step 6: Summary and next steps
    console.log('═'.repeat(70));
    console.log('📊 TEST SUMMARY');
    console.log('═'.repeat(70));
    console.log('✅ Payment session created successfully');
    console.log(`✅ Session ID: ${paymentData.sessionId}`);
    console.log(`✅ Payment ID: ${paymentData.paymentId}`);
    console.log('');
    console.log('🌐 Next Steps:');
    console.log('   1. Open the payment page URL in your browser:');
    console.log(`      ${paymentData.paymentPageUrl || paymentData.checkoutUrl}`);
    console.log('   2. Use one of the test card numbers above');
    console.log('   3. Complete the payment on ARC Pay\'s hosted page');
    console.log('   4. You will be redirected back after payment');
    console.log('   5. Check the payment status in the database');
    console.log('');
    console.log('💡 To check payment status:');
    console.log(`   curl "${PRODUCTION_URL}/api/payments?action=get-payment-details&paymentId=${paymentData.paymentId}"`);
    console.log('═'.repeat(70));

  } catch (error) {
    console.error('');
    console.error('❌ Test failed with error:');
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testArcTransaction().catch(error => {
  console.error('');
  console.error('❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});





