import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkBookingData() {
  console.log('🔍 Checking booking_info table data...\n');
  console.log('='.repeat(60));

  try {
    // Get all booking info records
    const { data: allRecords, error: allError } = await supabase
      .from('booking_info')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (allError) {
      console.error('❌ Error fetching all records:', allError);
      return;
    }

    console.log(`\n📊 Total records found: ${allRecords.length}\n`);

    if (allRecords.length === 0) {
      console.log('⚠️  No booking_info records found in the database.');
      console.log('   This means no booking information has been saved yet.');
      return;
    }

    // Display each record
    allRecords.forEach((record, index) => {
      console.log(`\n📋 Record ${index + 1}:`);
      console.log('   ID:', record.id);
      console.log('   Quote ID:', record.quote_id);
      console.log('   User ID:', record.user_id);
      console.log('   Full Name:', record.full_name || 'N/A');
      console.log('   Email:', record.email || 'N/A');
      console.log('   Phone:', record.phone || 'N/A');
      console.log('   Status:', record.status || 'N/A');
      console.log('   Terms Accepted:', record.terms_accepted ? '✅ Yes' : '❌ No');
      console.log('   Privacy Accepted:', record.privacy_policy_accepted ? '✅ Yes' : '❌ No');
      console.log('   Passport Number:', record.passport_number || 'N/A');
      console.log('   Passport Expiry:', record.passport_expiry_date || 'N/A');
      console.log('   Created At:', record.created_at || 'N/A');
      console.log('   Updated At:', record.updated_at || 'N/A');
      console.log('   Submitted At:', record.submitted_at || 'N/A');
    });

    // Summary statistics
    console.log('\n' + '='.repeat(60));
    console.log('📈 Summary Statistics:');
    const completed = allRecords.filter(r => r.status === 'completed').length;
    const incomplete = allRecords.filter(r => r.status === 'incomplete').length;
    const verified = allRecords.filter(r => r.status === 'verified').length;
    const invalidStatus = allRecords.filter(r => !['completed', 'incomplete', 'verified'].includes(r.status)).length;

    console.log(`   ✅ Completed: ${completed}`);
    console.log(`   ⏳ Incomplete: ${incomplete}`);
    console.log(`   ✓ Verified: ${verified}`);
    if (invalidStatus > 0) {
      console.log(`   ⚠️  Invalid Status: ${invalidStatus}`);
      const invalidRecords = allRecords.filter(r => !['completed', 'incomplete', 'verified'].includes(r.status));
      console.log('   Invalid statuses found:', invalidRecords.map(r => `${r.id}: ${r.status}`).join(', '));
    }

    // Check for the specific quote mentioned in the error
    const specificQuoteId = '5a68169c-2f12-4f85-9d61-4a4f781e16bf';
    const specificRecord = allRecords.find(r => r.quote_id === specificQuoteId);
    
    if (specificRecord) {
      console.log('\n' + '='.repeat(60));
      console.log(`🎯 Record for Quote ID: ${specificQuoteId}`);
      console.log('   Status:', specificRecord.status);
      console.log('   Full Name:', specificRecord.full_name);
      console.log('   Email:', specificRecord.email);
      console.log('   Terms Accepted:', specificRecord.terms_accepted);
      console.log('   Privacy Accepted:', specificRecord.privacy_policy_accepted);
      console.log('   All Data:', JSON.stringify(specificRecord, null, 2));
    } else {
      console.log(`\n⚠️  No record found for Quote ID: ${specificQuoteId}`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkBookingData();

