#!/usr/bin/env node
/**
 * Create (or re-point) a customer support account.
 *
 * Support works the bookings the Slack alarms name: they sign in at
 * /support/login, see the queue, settle the money and record what they did.
 * They are NOT admins - settings, coupons, fees and staff accounts stay behind
 * the admin gate (shared/staffRoles.js).
 *
 *   SUPPORT_EMAIL=name@jetsetterss.com SUPPORT_PASSWORD='…' \
 *     node scripts/maintenance/create-support-user.mjs
 *
 * The password is read from the environment and never printed. Give the person
 * their own account - one login each, so the "handled by" on a booking names a
 * person. To take the access away again, run this with ROLE=user.
 *
 * The role column is written with the service role: a customer cannot change
 * their own role (supabase/migrations/20260917090000_lock_user_role.sql).
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = (process.env.SUPPORT_EMAIL || '').trim().toLowerCase();
const password = process.env.SUPPORT_PASSWORD || '';
const role = (process.env.ROLE || 'support').trim();
const firstName = process.env.SUPPORT_FIRST_NAME || 'Support';
const lastName = process.env.SUPPORT_LAST_NAME || 'Desk';

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
if (!email.includes('@')) {
  console.error('Set SUPPORT_EMAIL to the address this person will sign in with.');
  process.exit(1);
}
if (!['support', 'user'].includes(role)) {
  console.error(`Refusing to set role "${role}". This script creates support accounts, and ROLE=user removes the access.`);
  process.exit(1);
}
if (role === 'support' && password.length < 12) {
  console.error('Set SUPPORT_PASSWORD to at least 12 characters. It is never printed or stored in plain text.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

const { data: existing, error: readError } = await supabase
  .from('users').select('id, role').eq('email', email).maybeSingle();
if (readError) {
  console.error('Could not read the users table:', readError.message);
  process.exit(1);
}

const row = { role, first_name: firstName, last_name: lastName, name: `${firstName} ${lastName}`.trim() };
if (role === 'support') row.password = await bcrypt.hash(password, await bcrypt.genSalt(10));

if (existing) {
  const { error } = await supabase.from('users').update(row).eq('id', existing.id);
  if (error) {
    console.error('Could not update the account:', error.message);
    process.exit(1);
  }
  console.log(`Updated ${email}: ${existing.role || 'user'} → ${role}`);
} else {
  if (role !== 'support') {
    console.log(`Nothing to do: ${email} has no account.`);
    process.exit(0);
  }
  const { error } = await supabase.from('users').insert([{ email, ...row }]);
  if (error) {
    console.error('Could not create the account:', error.message);
    process.exit(1);
  }
  console.log(`Created support account ${email}`);
}

console.log('They sign in at https://www.jetsetterss.com/desk/login');
