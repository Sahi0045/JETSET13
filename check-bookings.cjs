const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Supabase URL:', supabaseUrl ? 'Found' : 'Missing');
console.log('Supabase Key:', supabaseKey ? 'Found' : 'Missing');

if (!supabaseKey || !supabaseUrl) {
  console.log('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkBookings() {
  // Check inquiries with status booked
  const { data: bookedInquiries, error: e1 } = await supabase
    .from('inquiries')
    .select('id, status, inquiry_type, customer_email')
    .in('status', ['booked', 'paid']);
  
  console.log('\nBooked/Paid Inquiries:', bookedInquiries?.length || 0);
  if (bookedInquiries?.length) console.log(JSON.stringify(bookedInquiries, null, 2));
  if (e1) console.log('Error:', e1.message);
  
  // Check quotes with payment_status paid
  const { data: paidQuotes, error: e2 } = await supabase
    .from('quotes')
    .select('id, quote_number, payment_status, status, total_amount')
    .in('payment_status', ['paid', 'completed']);
  
  console.log('\nPaid Quotes:', paidQuotes?.length || 0);
  if (paidQuotes?.length) console.log(JSON.stringify(paidQuotes, null, 2));
  if (e2) console.log('Error:', e2.message);
  
  // Check completed payments
  const { data: payments, error: e3 } = await supabase
    .from('payments')
    .select('id, quote_id, payment_status, amount')
    .in('payment_status', ['completed', 'paid', 'CAPTURED']);
    
  console.log('\nCompleted Payments:', payments?.length || 0);
  if (payments?.length) console.log(JSON.stringify(payments, null, 2));
  if (e3) console.log('Error:', e3.message);
  
  // Also show all recent inquiries
  const { data: allInquiries } = await supabase
    .from('inquiries')
    .select('id, status, inquiry_type')
    .order('created_at', { ascending: false })
    .limit(5);
    
  console.log('\nRecent 5 Inquiries (any status):');
  if (allInquiries?.length) console.log(JSON.stringify(allInquiries, null, 2));
}

checkBookings().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
