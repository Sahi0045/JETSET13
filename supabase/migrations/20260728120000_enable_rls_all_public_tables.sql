-- ============================================================================
-- Security hardening: enable Row Level Security on every public table
-- Fixes Supabase Security Advisor: rls_disabled_in_public, sensitive_columns_exposed
-- ============================================================================
--
-- WHY THIS IS SAFE FOR THE API LAYER
-- Every backend Supabase client is created with SUPABASE_SERVICE_ROLE_KEY
-- (backend/config/supabase.js and the per-route clients all resolve to the
-- service-role key). service_role BYPASSES RLS entirely, so enabling RLS does
-- not change any behaviour of the Express API / serverless handler.
-- The only server-side anon client is backend/routes/supabaseAuth.js, which
-- performs auth calls only and never queries a table.
--
-- WHAT CHANGES
-- The frontend anon client (frontend/src/lib/supabase.js) talks to a small set
-- of tables directly. Those get explicit, minimal policies below. Every other
-- public table becomes deny-by-default for anon/authenticated — which is the
-- whole point: today anyone holding the public anon key can read and write them.
--
-- Apply manually (migrations are not auto-applied in this project):
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/20260728120000_enable_rls_all_public_tables.sql
-- or paste into the Supabase SQL editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- STEP 1. Enable RLS on every base table in `public` that doesn't have it yet.
-- Done as a loop so tables created via the Supabase dashboard (users,
-- subscriptions, callback_requests, hotel_quotes, contact_inquiries, ...) are
-- covered too — they have no DDL in this repo and would otherwise be missed.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'        -- ordinary tables only (not views/matviews)
      and c.relrowsecurity = false
  loop
    execute format('alter table public.%I enable row level security', r.relname);
    raise notice 'RLS enabled on public.%', r.relname;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- STEP 2. Policies for tables the frontend anon client touches directly.
-- Everything else stays deny-by-default (RLS on, no policy) and is reachable
-- only through the backend's service-role key.
-- ---------------------------------------------------------------------------

-- --- public.users -----------------------------------------------------------
-- Mirrors auth.users (public.users.id = auth.users.id, see
-- 20260624130000_auto_create_public_user.sql). Users may only see and edit
-- their own row. NOTE: this table has a `password` column, which is the
-- `sensitive_columns_exposed` advisor finding — scoping reads to the owner is
-- what closes the public exposure.
drop policy if exists "users_select_own" on public.users;
create policy "users_select_own" on public.users
  for select to authenticated
  using (id = auth.uid());

drop policy if exists "users_insert_own" on public.users;
create policy "users_insert_own" on public.users
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own" on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- --- public.application_drafts (visa form autosave, hooks/useAutosave.js) ---
drop policy if exists "drafts_own_all" on public.application_drafts;
create policy "drafts_own_all" on public.application_drafts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- --- public.user_preferences (Pages/Profile/NotificationSettings.jsx) -------
-- NOTE: user_preferences.user_id is `text` (not uuid, unlike every other
-- user_id column here), so auth.uid() must be cast or Postgres raises
-- "operator does not exist: text = uuid".
drop policy if exists "prefs_own_all" on public.user_preferences;
create policy "prefs_own_all" on public.user_preferences
  for all to authenticated
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

-- --- Lead-capture forms: INSERT-only for anonymous visitors -----------------
-- These are public forms submitted before/without login. Anon gets INSERT and
-- deliberately NOT select/update/delete, so nobody can read back the leads
-- (names, emails, phone numbers) with the public anon key. Admin reads go
-- through the backend service-role key.

-- Newsletter signup: Footer.jsx, subscribe-section.jsx, HotelsLanding.jsx, planding.jsx
drop policy if exists "subscriptions_anon_insert" on public.subscriptions;
create policy "subscriptions_anon_insert" on public.subscriptions
  for insert to anon, authenticated
  with check (true);

-- Cruise "request a callback": Services/callbackService.js
drop policy if exists "callback_requests_anon_insert" on public.callback_requests;
create policy "callback_requests_anon_insert" on public.callback_requests
  for insert to anon, authenticated
  with check (true);

-- Packages callback: Services/packageCallbackService.js
drop policy if exists "packagescallback_anon_insert" on public.packagescallback;
create policy "packagescallback_anon_insert" on public.packagescallback
  for insert to anon, authenticated
  with check (true);

-- Rentals callback: Services/rentalsCallbackService.js
drop policy if exists "packages_callback_anon_insert" on public.packages_callback;
create policy "packages_callback_anon_insert" on public.packages_callback
  for insert to anon, authenticated
  with check (true);

-- Rentals/hotel details callback: Pages/Common/rentals/HotelDetails.jsx
drop policy if exists "hotels_callback_anon_insert" on public.hotels_callback;
create policy "hotels_callback_anon_insert" on public.hotels_callback
  for insert to anon, authenticated
  with check (true);

-- Hotel quote request: Pages/Common/hotels/HotelDetailsPage.jsx
drop policy if exists "hotel_quotes_anon_insert" on public.hotel_quotes;
create policy "hotel_quotes_anon_insert" on public.hotel_quotes
  for insert to anon, authenticated
  with check (true);

-- Contact form: Pages/Common/ContactPopup.jsx
drop policy if exists "contact_inquiries_anon_insert" on public.contact_inquiries;
create policy "contact_inquiries_anon_insert" on public.contact_inquiries
  for insert to anon, authenticated
  with check (true);

-- ---------------------------------------------------------------------------
-- STEP 3. Fix the SECURITY DEFINER views flagged by the advisor.
-- security_invoker = on makes the view run with the *querying* user's
-- permissions, so the underlying tables' RLS is respected instead of being
-- silently bypassed. Requires Postgres 15+ (Supabase is 15+).
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select viewname
    from pg_views
    where schemaname = 'public'
      and viewname in ('sla_tracking', 'revenue_summary')
  loop
    execute format('alter view public.%I set (security_invoker = on)', r.viewname);
    raise notice 'security_invoker enabled on view public.%', r.viewname;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- STEP 4. Verification — should return zero rows once this migration is applied.
-- ---------------------------------------------------------------------------
-- select c.relname as table_without_rls
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false;
