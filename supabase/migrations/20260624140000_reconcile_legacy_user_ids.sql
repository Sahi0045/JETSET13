-- One-time reconciliation: legacy public.users rows were created (via the old
-- email-signup model) with a random uuid that is NOT the Supabase auth uid.
-- When such a user later logs in with Google, the app keys lookups off the auth
-- uid and finds no matching row, so membership/profile data is missed.
--
-- Strategy: for each mismatched row, free its email, INSERT a new row keyed by
-- the auth uid, dynamically repoint EVERY table with a FK to public.users.id,
-- then delete the stale row. All in one transaction.

DO $$
DECLARE
  rec RECORD;
  fk  RECORD;
BEGIN
  FOR rec IN
    SELECT p.id AS old_id, a.id AS new_id, p.email
    FROM public.users p
    JOIN auth.users a ON lower(a.email) = lower(p.email)
    WHERE p.id <> a.id
      AND NOT EXISTS (SELECT 1 FROM public.users p2 WHERE p2.id = a.id)
  LOOP
    -- 1) free the unique email on the stale row
    UPDATE public.users
      SET email = 'legacy-' || rec.old_id || '@migrated.local'
      WHERE id = rec.old_id;

    -- 2) create the auth-keyed row, copying all profile fields
    INSERT INTO public.users (
      id, name, email, password, created_at, updated_at,
      first_name, last_name, role, subscription_tier, subscription_end_date,
      phone, date_of_birth, gender, nationality, marital_status, anniversary,
      city, state, passport_number, passport_expiry, issuing_country,
      pan_number, profile_photo_url
    )
    SELECT
      rec.new_id, name, rec.email, password, created_at, now(),
      first_name, last_name, role, subscription_tier, subscription_end_date,
      phone, date_of_birth, gender, nationality, marital_status, anniversary,
      city, state, passport_number, passport_expiry, issuing_country,
      pan_number, profile_photo_url
    FROM public.users WHERE id = rec.old_id;

    -- 3) dynamically repoint every FK that references public.users(id)
    FOR fk IN
      SELECT tc.table_schema AS sch, tc.table_name AS tbl, kcu.column_name AS col
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_schema = 'public' AND ccu.table_name = 'users' AND ccu.column_name = 'id'
    LOOP
      EXECUTE format('UPDATE %I.%I SET %I = $1 WHERE %I = $2', fk.sch, fk.tbl, fk.col, fk.col)
        USING rec.new_id, rec.old_id;
    END LOOP;

    -- 4) remove the stale row
    DELETE FROM public.users WHERE id = rec.old_id;

    RAISE NOTICE 'Reconciled % : % -> %', rec.email, rec.old_id, rec.new_id;
  END LOOP;
END $$;
