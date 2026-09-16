-- Add 'pending_ticketing' to the bookings status constraint.
--
-- `buildBookingRow` writes `status: ticketed ? 'confirmed' : 'pending_ticketing'`
-- and `flagForReview` writes the same pair, but the live constraint listed only
-- pending / confirmed / paid / cancelled / completed. Confirmed against the
-- production table on 2026-09-16:
--
--   select pg_get_constraintdef(oid) like '%pending_ticketing%'
--   from pg_constraint where conname = 'bookings_status_check';   -- false
--
-- So every booking that commits a PNR without issuing a ticket - the held and
-- queued paths, which the airline-locator patience of #132 makes more likely -
-- is rejected with 23514. `saveBookingToDatabase` does not recover from that
-- code, so it returns null and the order route still answers success:true with
-- savedToDatabase:false: a paid customer with a real PNR, no booking row, no
-- confirmation email, and nothing written to gds, tickets, fare_breakdown or
-- itineraries.
--
-- Nothing has been lost yet - with auto-ticketing on, bookings that commit also
-- ticket and take the 'confirmed' branch, and a check of all 44 flight rows on
-- 2026-09-16 found no paid booking with a PNR stranded outside
-- confirmed/cancelled. This closes it before the first one is.
--
-- Postgres validates existing rows when the constraint is added, so if any row
-- holds a status not listed here the ALTER fails and nothing changes.

-- Drop the existing constraint
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;

-- Re-create with the new allowed value
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'confirmed', 'paid', 'cancelled', 'completed', 'pending_ticketing'));
