-- Add profile fields to public.users so the profile dashboard persists
-- all data to the database (in addition to auth user_metadata).
-- Idempotent: safe to run repeatedly.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS date_of_birth text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS nationality text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS marital_status text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS anniversary text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS passport_number text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS passport_expiry text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS issuing_country text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pan_number text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS profile_photo_url text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
