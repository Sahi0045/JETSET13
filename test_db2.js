import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
async function checkBooking() {
  const { data, error } = await supabase
    .from('bookings')
    .select('booking_details')
    .eq('booking_reference', 'FLTMLY7PZEF');
    
  console.log(JSON.stringify(data[0].booking_details, null, 2));
}
checkBooking();
