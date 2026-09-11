-- Bookings table for storing all travel bookings (flights, hotels, cruises, packages)
-- Run this in Supabase SQL Editor if the table doesn't exist

CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    booking_reference TEXT UNIQUE NOT NULL,
    travel_type TEXT NOT NULL CHECK (travel_type IN ('flight', 'hotel', 'package', 'cruise', 'car')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'paid', 'cancelled', 'completed')),
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'refunded')),
    booking_details JSONB NOT NULL DEFAULT '{}',
    passenger_details JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_reference ON bookings(booking_reference);
CREATE INDEX IF NOT EXISTS idx_bookings_travel_type ON bookings(travel_type);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings(created_at DESC);

-- Enable Row Level Security
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view their own bookings" ON bookings;
DROP POLICY IF EXISTS "Users can create their own bookings" ON bookings;
DROP POLICY IF EXISTS "Service role can manage all bookings" ON bookings;
DROP POLICY IF EXISTS "Anon can create bookings" ON bookings;

-- RLS Policies
-- SECURITY: scope every policy `TO authenticated` and to the OWNER only.
-- Never use `OR user_id IS NULL` or omit the TO clause: `user_id` is NULL on
-- every guest and FK-fallback booking (the norm here), so that would expose all
-- of them — passenger PII, PNR, customer_email, the ARC success_indicator — to
-- the public anon key. All guest / NULL-owner reads and writes go through the
-- service-role backend, which bypasses RLS. (See migration
-- supabase/migrations/20260911000000_fix_bookings_anon_read_rls.sql.)
-- Users can view ONLY their own bookings
CREATE POLICY "Users can view their own bookings"
    ON bookings FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Users can create ONLY their own bookings
CREATE POLICY "Users can create their own bookings"
    ON bookings FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Service role can do everything (for backend API)
CREATE POLICY "Service role can manage all bookings"
    ON bookings FOR ALL
    USING (auth.role() = 'service_role');

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_bookings_updated_at ON bookings;
CREATE TRIGGER update_bookings_updated_at
    BEFORE UPDATE ON bookings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Example booking_details structure for flights:
-- {
--   "pnr": "ABC123",
--   "order_id": "ORDER-123456",
--   "transaction_id": "TXN-789",
--   "origin": "LAX",
--   "destination": "JFK",
--   "departure_date": "2026-02-15",
--   "departure_time": "10:30 AM",
--   "arrival_time": "06:45 PM",
--   "airline": "AA",
--   "airline_name": "American Airlines",
--   "flight_number": "AA123",
--   "duration": "5h 15m",
--   "cabin_class": "ECONOMY",
--   "flight_offer": { ... full Amadeus offer object ... }
-- }

-- Example passenger_details structure:
-- [
--   {
--     "id": "1",
--     "firstName": "John",
--     "lastName": "Doe",
--     "dateOfBirth": "1990-01-15",
--     "gender": "MALE"
--   }
-- ]
