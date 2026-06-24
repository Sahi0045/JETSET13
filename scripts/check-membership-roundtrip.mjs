// Proves membership status saves AND reads back from Supabase, using a test
// account, then restores the original value (no residue).
//   node scripts/check-membership-roundtrip.mjs
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { getUserMembership } from '../backend/config/membershipTiers.js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const supabase = createClient(url, key);
const TEST_EMAIL = 'testuser@example.com';

const run = async () => {
  const { data: u, error } = await supabase
    .from('users').select('id, email, subscription_tier, subscription_end_date')
    .eq('email', TEST_EMAIL).single();
  if (error || !u) { console.error('Test user not found:', error?.message); process.exit(1); }

  const original = { tier: u.subscription_tier, end: u.subscription_end_date };
  console.log(`Test user ${u.email} — original tier: ${original.tier || 'none'}`);

  const futureEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  // 1) SAVE premium membership
  const { error: wErr } = await supabase.from('users')
    .update({ subscription_tier: 'premium_annual', subscription_end_date: futureEnd })
    .eq('id', u.id);
  if (wErr) { console.error('❌ SAVE failed:', wErr.message); process.exit(1); }
  console.log('✅ SAVE: set subscription_tier=premium_annual');

  // 2) READ back via the same helper the server uses
  const m = await getUserMembership(supabase, u.id);
  console.log('🔁 READ:', JSON.stringify(m));
  const ok = m.tier === 'premium_annual' && m.active === true && m.discountRate === 0.10;
  console.log(ok ? '✅ Membership persisted and reads back as ACTIVE 10%' : '❌ Read-back mismatch');

  // 3) RESTORE original value
  const { error: rErr } = await supabase.from('users')
    .update({ subscription_tier: original.tier, subscription_end_date: original.end })
    .eq('id', u.id);
  console.log(rErr ? `⚠️ restore failed: ${rErr.message}` : `↩️  Restored original tier: ${original.tier || 'none'}`);

  process.exit(ok ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
