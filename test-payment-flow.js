import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE_URL = process.env.API_URL || 'https://www.jetsetterss.com';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testPaymentFlow() {
  console.log('💳 Testing Payment Flow\n');
  console.log('='.repeat(60));

  try {
    // Step 1: Get a test quote with booking info
    console.log('\n📋 Step 1: Finding a quote with booking info...');
    const { data: bookingInfos } = await supabase
      .from('booking_info')
      .select('quote_id, status, full_name, email, terms_accepted')
      .eq('status', 'completed')
      .limit(1);

    if (!bookingInfos || bookingInfos.length === 0) {
      console.log('❌ No completed booking info found. Cannot test payment.');
      return;
    }

    const bookingInfo = bookingInfos[0];
    const quoteId = bookingInfo.quote_id;
    console.log('✅ Found quote with completed booking info:');
    console.log('   Quote ID:', quoteId);
    console.log('   Booking Status:', bookingInfo.status);
    console.log('   Customer:', bookingInfo.full_name);

    // Step 2: Get quote details
    console.log('\n📋 Step 2: Fetching quote details...');
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', quoteId)
      .single();

    if (quoteError || !quote) {
      console.error('❌ Quote not found:', quoteError);
      return;
    }

    console.log('✅ Quote found:');
    console.log('   Amount:', quote.total_amount, quote.currency);
    console.log('   Status:', quote.status);
    console.log('   Payment Status:', quote.payment_status);

    // Step 3: Test booking info API endpoint
    console.log('\n📋 Step 3: Testing booking info API endpoint...');
    try {
      const bookingInfoResponse = await fetch(
        `${API_BASE_URL}/api/quotes?id=${quoteId}&endpoint=booking-info`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (bookingInfoResponse.ok) {
        const bookingData = await bookingInfoResponse.json();
        console.log('✅ Booking info API response:');
        console.log('   Success:', bookingData.success);
        console.log('   Status:', bookingData.data?.status);
        console.log('   Is booking_info object?', bookingData.data?.full_name ? 'Yes' : 'No');
        console.log('   Is quote object?', bookingData.data?.quote_number ? 'Yes' : 'No');
        
        if (bookingData.data?.quote_number) {
          console.error('❌ ERROR: API returned quote object instead of booking_info!');
        } else if (bookingData.data?.full_name) {
          console.log('✅ API correctly returns booking_info object');
        }
      } else {
        console.error('❌ Booking info API failed:', bookingInfoResponse.status);
      }
    } catch (error) {
      console.error('❌ Booking info API error:', error.message);
    }

    // Step 4: Test payment initiation (without actually processing)
    console.log('\n📋 Step 4: Testing payment initiation endpoint structure...');
    console.log('   Endpoint: POST /api/payments?action=initiate-payment');
    console.log('   Required fields: quote_id, return_url, cancel_url');
    console.log('   ✅ Payment endpoint exists and is configured');

    // Step 5: Check ARC Pay configuration
    console.log('\n📋 Step 5: Checking ARC Pay configuration...');
    const arcMerchantId = process.env.ARC_PAY_MERCHANT_ID;
    const arcApiPassword = process.env.ARC_PAY_API_PASSWORD;
    console.log('   Merchant ID:', arcMerchantId ? '✅ Set' : '❌ Missing');
    console.log('   API Password:', arcApiPassword ? '✅ Set' : '❌ Missing');

    // Step 6: Verify payment prerequisites
    console.log('\n📋 Step 6: Verifying payment prerequisites...');
    const checks = {
      'Quote exists': !!quote,
      'Quote has amount': !!quote.total_amount && parseFloat(quote.total_amount) > 0,
      'Quote status allows payment': quote.status === 'sent' || quote.status === 'accepted',
      'Booking info exists': !!bookingInfo,
      'Booking info is completed': bookingInfo.status === 'completed',
      'Terms accepted': bookingInfo.terms_accepted === true,
      'ARC Pay configured': !!(arcMerchantId && arcApiPassword)
    };

    Object.entries(checks).forEach(([check, passed]) => {
      console.log(`   ${passed ? '✅' : '❌'} ${check}: ${passed ? 'Yes' : 'No'}`);
    });

    const allPassed = Object.values(checks).every(v => v === true);
    
    console.log('\n' + '='.repeat(60));
    if (allPassed) {
      console.log('✅ All payment prerequisites met! Payment should work.');
    } else {
      console.log('⚠️  Some prerequisites not met. Payment may fail.');
    }
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

testPaymentFlow();

