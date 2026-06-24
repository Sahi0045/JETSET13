// Verifies membership data is persisted in Supabase.
//   node scripts/check-membership-db.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

const supabase = createClient(url, key);

const run = async () => {
  console.log('🔎 Checking membership persistence on', url, '\n');

  // 1) users table has subscription columns + show members
  const { data: members, error: uErr } = await supabase
    .from('users')
    .select('id, email, subscription_tier, subscription_end_date')
    .not('subscription_tier', 'is', null)
    .limit(20);

  if (uErr) {
    console.error('❌ users.subscription_tier read failed:', uErr.message);
  } else {
    console.log(`✅ users table reachable. Members with a tier: ${members.length}`);
    members.forEach((m) => {
      const active = m.subscription_end_date ? new Date(m.subscription_end_date) > new Date() : true;
      console.log(`   • ${m.email || m.id}: ${m.subscription_tier} (ends ${m.subscription_end_date || 'n/a'}) ${active ? '[ACTIVE]' : '[expired]'}`);
    });
    if (!members.length) console.log('   (no users currently have a subscription_tier set)');
  }

  // 2) user_subscriptions audit table
  const { data: subs, error: sErr } = await supabase
    .from('user_subscriptions')
    .select('id, user_id, plan_type, status, end_date, transaction_id, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (sErr) {
    console.error('\n❌ user_subscriptions read failed:', sErr.message);
  } else {
    console.log(`\n✅ user_subscriptions table reachable. Recent rows: ${subs.length}`);
    subs.forEach((s) => {
      console.log(`   • ${s.transaction_id}: ${s.plan_type} -> ${s.status} (user ${s.user_id})`);
    });
    if (!subs.length) console.log('   (no subscription checkout rows yet)');
  }

  console.log('\nDone.');
};

run().catch((e) => { console.error(e); process.exit(1); });
