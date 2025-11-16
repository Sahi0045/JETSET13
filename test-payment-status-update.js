import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testPaymentStatusUpdate() {
  console.log('🔍 Testing Payment Status Updates\n');
  console.log('='.repeat(60));

  try {
    // Get a quote with payment
    console.log('\n📋 Step 1: Checking quotes with payment status...');
    const { data: quotes } = await supabase
      .from('quotes')
      .select('id, quote_number, payment_status, paid_at, status, total_amount, currency')
      .order('updated_at', { ascending: false })
      .limit(10);

    if (!quotes || quotes.length === 0) {
      console.log('❌ No quotes found');
      return;
    }

    console.log(`\n📊 Found ${quotes.length} quotes:\n`);
    
    quotes.forEach((quote, index) => {
      console.log(`Quote ${index + 1}:`);
      console.log(`   ID: ${quote.id}`);
      console.log(`   Number: ${quote.quote_number || 'N/A'}`);
      console.log(`   Payment Status: ${quote.payment_status || 'unpaid'}`);
      console.log(`   Quote Status: ${quote.status || 'N/A'}`);
      console.log(`   Paid At: ${quote.paid_at || 'Not paid'}`);
      console.log(`   Amount: ${quote.total_amount} ${quote.currency || 'USD'}`);
      console.log('');
    });

    // Check payments table
    console.log('\n📋 Step 2: Checking payments table...');
    const { data: payments } = await supabase
      .from('payments')
      .select('id, quote_id, payment_status, completed_at, amount, currency')
      .order('created_at', { ascending: false })
      .limit(10);

    if (payments && payments.length > 0) {
      console.log(`\n📊 Found ${payments.length} payments:\n`);
      payments.forEach((payment, index) => {
        console.log(`Payment ${index + 1}:`);
        console.log(`   ID: ${payment.id}`);
        console.log(`   Quote ID: ${payment.quote_id}`);
        console.log(`   Status: ${payment.payment_status || 'pending'}`);
        console.log(`   Completed At: ${payment.completed_at || 'Not completed'}`);
        console.log(`   Amount: ${payment.amount} ${payment.currency || 'USD'}`);
        console.log('');
      });

      // Check if payment status matches quote status
      console.log('\n📋 Step 3: Verifying payment-quote status sync...');
      payments.forEach(payment => {
        const relatedQuote = quotes.find(q => q.id === payment.quote_id);
        if (relatedQuote) {
          const paymentCompleted = payment.payment_status === 'completed';
          const quotePaid = relatedQuote.payment_status === 'paid';
          const statusMatch = (paymentCompleted && quotePaid) || (!paymentCompleted && !quotePaid);
          
          console.log(`\nQuote ${relatedQuote.quote_number || relatedQuote.id}:`);
          console.log(`   Payment Status: ${payment.payment_status}`);
          console.log(`   Quote Payment Status: ${relatedQuote.payment_status}`);
          console.log(`   Status Sync: ${statusMatch ? '✅ Match' : '⚠️  Mismatch'}`);
          
          if (!statusMatch) {
            console.log(`   ⚠️  WARNING: Payment and quote status don't match!`);
            console.log(`      Payment says: ${payment.payment_status}`);
            console.log(`      Quote says: ${relatedQuote.payment_status}`);
          }
        }
      });
    } else {
      console.log('⚠️  No payments found in database');
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📈 Summary:');
    const paidQuotes = quotes.filter(q => q.payment_status === 'paid').length;
    const unpaidQuotes = quotes.filter(q => !q.payment_status || q.payment_status === 'unpaid').length;
    const pendingQuotes = quotes.filter(q => q.payment_status === 'pending').length;
    
    console.log(`   ✅ Paid Quotes: ${paidQuotes}`);
    console.log(`   ⏳ Pending Quotes: ${pendingQuotes}`);
    console.log(`   ○ Unpaid Quotes: ${unpaidQuotes}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testPaymentStatusUpdate();

