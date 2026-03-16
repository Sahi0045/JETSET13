import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
async function checkBooking() {
  const { data, error } = await supabase
    .from('bookings')
    .select('booking_reference, total_amount')
    .order('created_at', { ascending: false })
    .limit(10);
    
  console.log(data);
}
checkBooking();
