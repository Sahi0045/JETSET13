import supabase from './backend/config/supabase.js';
import dotenv from 'dotenv';

dotenv.config();

const TEST_EMAIL = 'shubhamkush012@gmail.com';
const TEST_USER_ID = 'e5c37bbc-c9ce-4ae6-bef2-da5dd60e3cfa';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function checkInquiries() {
  log('\n' + '='.repeat(70), 'cyan');
  log('🔍 Inquiry Diagnostic Tool', 'cyan');
  log('='.repeat(70), 'cyan');
  
  try {
    // 1. Check all inquiries
    log('\n📋 Checking all inquiries in database...', 'blue');
    const { data: allInquiries, error: allError } = await supabase
      .from('inquiries')
      .select('id, customer_email, user_id, status, inquiry_type, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (allError) {
      log(`❌ Error fetching inquiries: ${allError.message}`, 'red');
      return;
    }
    
    log(`✅ Found ${allInquiries.length} total inquiries`, 'green');
    
    // 2. Check inquiries by user_id
    log(`\n👤 Checking inquiries with user_id = ${TEST_USER_ID}...`, 'blue');
    const { data: byUserId, error: userIdError } = await supabase
      .from('inquiries')
      .select('id, customer_email, user_id, status, inquiry_type, created_at')
      .eq('user_id', TEST_USER_ID);
    
    if (userIdError) {
      log(`❌ Error: ${userIdError.message}`, 'red');
    } else {
      log(`✅ Found ${byUserId.length} inquiries with user_id`, 'green');
      if (byUserId.length > 0) {
        byUserId.forEach((inq, idx) => {
          log(`   ${idx + 1}. ${inq.id.slice(-8)} - ${inq.inquiry_type} - ${inq.status}`, 'blue');
        });
      }
    }
    
    // 3. Check inquiries by email (case-insensitive)
    log(`\n📧 Checking inquiries with customer_email = ${TEST_EMAIL}...`, 'blue');
    const { data: byEmail, error: emailError } = await supabase
      .from('inquiries')
      .select('id, customer_email, user_id, status, inquiry_type, created_at')
      .ilike('customer_email', TEST_EMAIL);
    
    if (emailError) {
      log(`❌ Error: ${emailError.message}`, 'red');
    } else {
      log(`✅ Found ${byEmail.length} inquiries with matching email`, 'green');
      if (byEmail.length > 0) {
        byEmail.forEach((inq, idx) => {
          const hasUserId = inq.user_id ? '✅' : '❌';
          log(`   ${idx + 1}. ${inq.id.slice(-8)} - ${inq.inquiry_type} - ${inq.status} - user_id: ${hasUserId}`, 'blue');
        });
      }
    }
    
    // 4. Check for unlinked inquiries (email matches but no user_id)
    log(`\n🔗 Checking for unlinked inquiries (email matches but user_id is null)...`, 'blue');
    const unlinked = byEmail?.filter(i => !i.user_id) || [];
    if (unlinked.length > 0) {
      log(`⚠️  Found ${unlinked.length} unlinked inquiries:`, 'yellow');
      unlinked.forEach((inq, idx) => {
        log(`   ${idx + 1}. ${inq.id} - ${inq.inquiry_type} - ${inq.status}`, 'yellow');
        log(`      Email: ${inq.customer_email}`, 'yellow');
        log(`      Created: ${inq.created_at}`, 'yellow');
      });
      log(`\n💡 These should be auto-linked when you access /api/inquiries/my`, 'blue');
    } else {
      log(`✅ All inquiries with matching email are linked to user_id`, 'green');
    }
    
    // 5. Check quotes for inquiries
    log(`\n💰 Checking quotes for inquiries...`, 'blue');
    const inquiryIds = [...new Set([...(byUserId || []), ...(byEmail || [])].map(i => i.id))];
    
    if (inquiryIds.length > 0) {
      const { data: quotes, error: quotesError } = await supabase
        .from('quotes')
        .select('id, inquiry_id, status, quote_number, created_at')
        .in('inquiry_id', inquiryIds);
      
      if (quotesError) {
        log(`❌ Error fetching quotes: ${quotesError.message}`, 'red');
      } else {
        log(`✅ Found ${quotes.length} quotes for your inquiries`, 'green');
        if (quotes.length > 0) {
          const sentQuotes = quotes.filter(q => q.status === 'sent');
          const draftQuotes = quotes.filter(q => q.status === 'draft');
          log(`   - Sent: ${sentQuotes.length}`, 'blue');
          log(`   - Draft: ${draftQuotes.length}`, 'blue');
          
          // Check if inquiry status matches quote status
          for (const quote of sentQuotes) {
            const inquiry = [...(byUserId || []), ...(byEmail || [])].find(i => i.id === quote.inquiry_id);
            if (inquiry && inquiry.status !== 'quoted') {
              log(`   ⚠️  Quote ${quote.quote_number} is sent but inquiry status is ${inquiry.status} (expected 'quoted')`, 'yellow');
            }
          }
        }
      }
    } else {
      log(`ℹ️  No inquiries found, skipping quote check`, 'blue');
    }
    
    // Summary
    log('\n' + '='.repeat(70), 'cyan');
    log('📊 Summary', 'cyan');
    log('='.repeat(70), 'cyan');
    log(`Total inquiries in DB: ${allInquiries.length}`, 'blue');
    log(`Inquiries with user_id: ${byUserId?.length || 0}`, 'blue');
    log(`Inquiries with matching email: ${byEmail?.length || 0}`, 'blue');
    log(`Unlinked inquiries: ${unlinked.length}`, unlinked.length > 0 ? 'yellow' : 'green');
    
    if (byUserId?.length === 0 && byEmail?.length === 0) {
      log('\n💡 No inquiries found for this user/email', 'yellow');
      log('   Create a new inquiry at /request while logged in', 'yellow');
    } else if (unlinked.length > 0) {
      log('\n💡 Some inquiries need to be linked', 'yellow');
      log('   They will be auto-linked when you access My Trips → Requests', 'yellow');
    } else {
      log('\n✅ Everything looks good!', 'green');
      log('   Your inquiries should appear in My Trips → Requests', 'green');
    }
    
  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    console.error(error);
  }
}

checkInquiries().then(() => {
  process.exit(0);
}).catch(error => {
  console.error(error);
  process.exit(1);
});

