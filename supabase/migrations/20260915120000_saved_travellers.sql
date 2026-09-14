-- ============================================================================
-- Saved travellers: the people a customer books flights for
-- ============================================================================
--
-- Lets the review page fill a traveller form with one tap instead of retyping
-- names, dates of birth and passports on every trip - MakeMyTrip's "My
-- Traveller List", Cleartrip's primary traveller.
--
-- Reached only through the backend (backend/controllers/
-- savedTravellers.controller.js), which uses the service-role key and scopes
-- every query to the signed-in customer's own id. RLS is on with no policies,
-- so the public anon key can neither read nor write it: it holds passport
-- numbers.
--
-- Until this is applied the review page simply shows no saved travellers, and
-- booking is unaffected.
--
-- Apply manually (migrations are not auto-applied in this project):
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/20260915120000_saved_travellers.sql
-- or paste into the Supabase SQL editor.
-- ============================================================================

create table if not exists public.saved_travellers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 60),
  last_name text not null check (char_length(last_name) between 1 and 60),
  gender text check (gender in ('male', 'female')),
  date_of_birth date,
  nationality text check (nationality is null or char_length(nationality) between 2 and 3),
  passport_number text check (passport_number is null or char_length(passport_number) <= 20),
  passport_expiry date,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_travellers_user_id_idx
  on public.saved_travellers (user_id);

-- One row per person per customer. Two people can share a name, so the date of
-- birth is part of what makes them different.
create unique index if not exists saved_travellers_person_idx
  on public.saved_travellers (user_id, lower(first_name), lower(last_name), coalesce(date_of_birth, '0001-01-01'::date));

-- Deny-by-default for anon and authenticated: no policies on purpose.
alter table public.saved_travellers enable row level security;
