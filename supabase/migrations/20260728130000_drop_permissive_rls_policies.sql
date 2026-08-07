-- ============================================================================
-- Security fix: remove wide-open RLS policies that defeat RLS entirely
-- ============================================================================
--
-- WHY THIS EXISTS
-- 20260728120000 enabled RLS on every public table, but RLS only restricts
-- access when no permissive policy already allows it. Postgres OR-s permissive
-- policies together, so a single `USING (true)` policy for anon/public makes the
-- table fully readable (and sometimes writable) regardless of any stricter
-- policy added alongside it.
--
-- Verified after applying 20260728120000: the anon key could still read
-- public.users including bcrypt `password` hashes, plus all customer callback
-- rows, because of the policies dropped below.
--
-- Each policy dropped here was PERMISSIVE with `USING (true)` for anon/public.
-- Restrictive replacements already exist from 20260728120000, and all admin /
-- server-side reads use the service-role key, which bypasses RLS.
-- ============================================================================

-- --- public.users -----------------------------------------------------------
-- "Allow all operations on users" was ALL / public / true / true: anonymous
-- callers could SELECT password hashes and PII, and also UPDATE or DELETE any
-- user row. This is the sensitive_columns_exposed advisor finding.
drop policy if exists "Allow all operations on users" on public.users;

-- "Anyone can insert data" (INSERT / public / check true) let anonymous callers
-- create arbitrary rows in users. Real signups are handled by the
-- security-definer handle_new_user() trigger on auth.users, and authenticated
-- self-service inserts are covered by users_insert_own.
drop policy if exists "Anyone can insert data" on public.users;

-- The remaining auth.uid()-scoped policies on users ("Users can read/update/
-- delete their own data") are correct and intentionally left in place.

-- --- Lead-capture tables ----------------------------------------------------
-- These rows hold customer names, emails and phone numbers. anon keeps INSERT
-- (the public forms) via the *_anon_insert policies from 20260728120000;
-- reads move to the backend service-role key.
drop policy if exists "Allow all operations for anon" on public.callback_requests;
drop policy if exists "Allow all operations for anon" on public.packages_callback;
drop policy if exists "Allow all operations for anon" on public.packagescallback;
drop policy if exists "Anyone can read callback requests" on public.hotels_callback;
drop policy if exists "Anyone can read subscription data" on public.subscriptions;

-- --- public.payment_links ---------------------------------------------------
-- Named "Public can read payment links by token" but its USING clause is
-- `true`, so it exposed every payment link, not just the one whose token the
-- caller holds. RLS cannot enforce "only the token you were given" — the
-- frontend does not query this table directly (it uses the backend
-- get-payment-link action), so the correct fix is to remove anon read access.
drop policy if exists "Public can read payment links by token" on public.payment_links;

-- --- public.agents ----------------------------------------------------------
-- Internal staff records (contact details, commission data). Agent data is
-- served through the backend agent actions, not the anon client.
drop policy if exists "Public read agents" on public.agents;

-- --- Deliberately KEPT ------------------------------------------------------
-- public.flight_deals / "Anyone can view flight deals": public marketing
-- content that is meant to be readable without authentication. Left in place.
