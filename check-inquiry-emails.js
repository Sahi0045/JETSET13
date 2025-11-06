import supabase from './backend/config/supabase.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkAllInquiryEmails() {
  console.log('\n🔍 Checking all inquiry emails in database...\n');
  
  try {
    const { data: inquiries, error } = await supabase
      .from('inquiries')
      .select('id, customer_email, customer_name, user_id, status, inquiry_type, created_at')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('❌ Error:', error.message);
      return;
    }
    
    console.log(`Found ${inquiries.length} inquiries:\n`);
    
    inquiries.forEach((inq, idx) => {
      const hasUserId = inq.user_id ? '✅' : '❌';
      console.log(`${idx + 1}. ${inq.id.slice(-8)}`);
      console.log(`   Email: ${inq.customer_email}`);
      console.log(`   Name: ${inq.customer_name}`);
      console.log(`   Type: ${inq.inquiry_type}`);
      console.log(`   Status: ${inq.status}`);
      console.log(`   User ID: ${hasUserId} ${inq.user_id || '(null)'}`);
      console.log(`   Created: ${inq.created_at}`);
      console.log('');
    });
    
    // Group by email
    const emailGroups = {};
    inquiries.forEach(inq => {
      const email = inq.customer_email?.toLowerCase();
      if (!emailGroups[email]) {
        emailGroups[email] = [];
      }
      emailGroups[email].push(inq);
    });
    
    console.log('\n📊 Grouped by email:\n');
    Object.entries(emailGroups).forEach(([email, inqs]) => {
      console.log(`${email}: ${inqs.length} inquiry(ies)`);
    });
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error);
  }
}

checkAllInquiryEmails().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});

