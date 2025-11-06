import supabase from './backend/config/supabase.js';
import dotenv from 'dotenv';

dotenv.config();

const TARGET_EMAIL = 'sahi0045@hotmail.com';
const TARGET_USER_ID = '2c48de58-d24e-48a0-98fc-371167d9afc7';

async function linkInquiry() {
  console.log('\n🔗 Linking Inquiry to User Account\n');
  console.log(`Target Email: ${TARGET_EMAIL}`);
  console.log(`Target User ID: ${TARGET_USER_ID}\n`);
  
  try {
    // Get all inquiries
    const { data: inquiries, error } = await supabase
      .from('inquiries')
      .select('id, customer_email, customer_name, status, inquiry_type, user_id')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) {
      console.error('❌ Error:', error.message);
      return;
    }
    
    console.log('Available inquiries:\n');
    inquiries.forEach((inq, idx) => {
      const hasUserId = inq.user_id ? '✅' : '❌';
      console.log(`${idx + 1}. ${inq.id.slice(-8)} - ${inq.customer_email} - ${inq.inquiry_type} - ${inq.status} ${hasUserId}`);
    });
    
    // Find the most recent inquiry without user_id
    const unlinked = inquiries.filter(i => !i.user_id);
    
    if (unlinked.length === 0) {
      console.log('\n✅ All inquiries are already linked to users');
      return;
    }
    
    // Link the most recent one
    const toLink = unlinked[0];
    console.log(`\n🔗 Linking inquiry ${toLink.id.slice(-8)} to your account...`);
    
    const { error: updateError } = await supabase
      .from('inquiries')
      .update({ 
        user_id: TARGET_USER_ID,
        customer_email: TARGET_EMAIL, // Also update email to match
        updated_at: new Date().toISOString()
      })
      .eq('id', toLink.id);
    
    if (updateError) {
      console.error('❌ Error linking:', updateError.message);
      return;
    }
    
    console.log('✅ Successfully linked!');
    console.log(`   Inquiry ID: ${toLink.id}`);
    console.log(`   Type: ${toLink.inquiry_type}`);
    console.log(`   Status: ${toLink.status}`);
    console.log(`\n💡 Now refresh My Trips → Requests to see it!`);
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error);
  }
}

linkInquiry().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});

