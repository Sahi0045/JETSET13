-- Direct-booking quotes (mobile + web) ─────────────────────────
-- The customer-facing "create quote for a direct booking" flow
-- (POST /api/quotes?action=create-for-booking) creates a quote that is NOT
-- authored by an admin and needs to stash the flight/hotel/cruise/package
-- payload. The original quotes schema requires admin_id and has no place for
-- that payload, which is why the flow 500'd. These changes are additive and
-- safe (they only relax a constraint and add a nullable column) — existing
-- admin-authored quotes are unaffected.

-- Allow quotes with no admin (created directly by a customer at checkout).
ALTER TABLE quotes ALTER COLUMN admin_id DROP NOT NULL;

-- Store the booking payload (selected flight/hotel/cruise/package + pax) so the
-- quote is self-describing for payment + My Trips.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS booking_details JSONB DEFAULT '{}';
