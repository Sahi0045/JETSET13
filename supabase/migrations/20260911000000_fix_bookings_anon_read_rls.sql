-- Security fix (2026-09-11): close the anonymous-read and anon-insert holes on `bookings`.
--
-- The original policies (backend/migrations/create_bookings_table.sql) were:
--   SELECT  USING (auth.uid() = user_id OR user_id IS NULL)        -- no TO clause -> anon
--   INSERT  WITH CHECK (auth.uid() = user_id OR user_id IS NULL)
--   "Anon can create bookings"  INSERT WITH CHECK (user_id IS NULL)
--
-- With no TO clause these applied to the PUBLIC (anon) role, and the
-- `OR user_id IS NULL` disjunct made every guest / FK-fallback booking
-- (user_id NULL is the norm, not an edge case) readable via the public anon
-- key: passenger PII, PNR, customer_email, and the ARC success_indicator.
-- 27 rows were confirmed anon-readable in production.
--
-- The backend uses the service-role key (which BYPASSES RLS) for ALL booking
-- reads and writes, so RLS only needs to let an AUTHENTICATED owner read their
-- own rows. The frontend never queries `bookings` directly (verified).

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own bookings" ON bookings;
DROP POLICY IF EXISTS "Users can create their own bookings" ON bookings;
DROP POLICY IF EXISTS "Anon can create bookings" ON bookings;

-- Authenticated owners may read ONLY their own rows.
CREATE POLICY "Users can view their own bookings"
    ON bookings FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Authenticated owners may insert ONLY rows they own.
-- (Guest / NULL-owner bookings are created by the service-role backend, not here.)
CREATE POLICY "Users can create their own bookings"
    ON bookings FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Service role (backend API) retains full access. RLS does not apply to the
-- service role at all, so this is documentation / belt-and-suspenders.
DROP POLICY IF EXISTS "Service role can manage all bookings" ON bookings;
CREATE POLICY "Service role can manage all bookings"
    ON bookings FOR ALL
    USING (auth.role() = 'service_role');
