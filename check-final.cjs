const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, './backend/.env') });

const supabaseUrl = 'https://qqmagqwumjipdqvxbiqu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxbWFncXd1bWppcGRxdnhiaXF1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTAwMTAxMiwiZXhwIjoyMDYwNTc3MDEyfQ.WV6dQfV8d3YmOvOGp9nv0wWvFCsCTocHp49Ly7MDDwQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: booking, error } = await supabase.from('bookings').select('id, booking_reference, status, payment_status, booking_details, created_at').order('created_at', { ascending: false }).limit(1).single();
  if (error) {
      console.log('Error:', error);
      return;
  }
  console.log("=== FINAL CANCELLATION RUN ===");
  console.log('Ref:', booking.booking_reference);
  console.log('Status:', booking.status);
  console.log('Payment Processed?:', booking.booking_details?.cancellation?.paymentProcessed);
  console.log('Payment Action:', booking.booking_details?.cancellation?.paymentAction);
  console.log('Refund Amount:', booking.booking_details?.cancellation?.refundAmount);
  console.log('Full Cancellation Object:', JSON.stringify(booking.booking_details?.cancellation, null, 2));
}
run();
