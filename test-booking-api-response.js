import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testAPIResponse() {
  const quoteId = '5a68169c-2f12-4f85-9d61-4a4f781e16bf';
  
  console.log('🔍 Testing what BookingInfo.findByQuoteId returns...\n');
  
  try {
    // Simulate what the API does
    const { data: bookingInfo, error } = await supabase
      .from('booking_info')
      .select('*')
      .eq('quote_id', quoteId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        console.log('❌ No booking info found (404)');
      } else {
        console.error('❌ Error:', error);
      }
      return;
    }

    console.log('✅ Booking info found:');
    console.log('   Status:', bookingInfo.status);
    console.log('   Full Name:', bookingInfo.full_name);
    console.log('   Email:', bookingInfo.email);
    console.log('   Terms Accepted:', bookingInfo.terms_accepted);
    console.log('\n📋 Full object structure:');
    console.log(JSON.stringify(bookingInfo, null, 2));
    
    // Check if status field exists and what it contains
    console.log('\n🔍 Status field check:');
    console.log('   bookingInfo.status:', bookingInfo.status);
    console.log('   Type:', typeof bookingInfo.status);
    console.log('   Is "completed"?', bookingInfo.status === 'completed');
    console.log('   Is "sent"?', bookingInfo.status === 'sent');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testAPIResponse();

