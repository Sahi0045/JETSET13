-- Fix existing bookings with missing or zero total_amount
-- Run this in Supabase SQL Editor

-- First, let's see what bookings we have and their current amounts
SELECT 
  id,
  booking_reference,
  total_amount,
  booking_details->>'amount' as details_amount,
  booking_details->'flight_offer'->'price'->>'total' as offer_price,
  created_at
FROM bookings
WHERE travel_type = 'flight'
ORDER BY created_at DESC;

-- Update total_amount from booking_details.flight_offer.price.total where total_amount is 0 or null
UPDATE bookings
SET 
  total_amount = COALESCE(
    NULLIF((booking_details->'flight_offer'->'price'->>'total')::DECIMAL, 0),
    NULLIF((booking_details->>'amount')::DECIMAL, 0),
    0
  ),
  booking_details = booking_details || jsonb_build_object(
    'amount', COALESCE(
      NULLIF((booking_details->'flight_offer'->'price'->>'total')::DECIMAL, 0),
      NULLIF((booking_details->>'amount')::DECIMAL, 0),
      0
    )
  )
WHERE travel_type = 'flight'
  AND (total_amount IS NULL OR total_amount = 0);

-- For bookings where flight_offer doesn't have price, set a default amount based on typical flight prices
-- You can adjust this or skip this step
UPDATE bookings
SET 
  total_amount = 150.00,
  booking_details = booking_details || jsonb_build_object('amount', 150.00, 'currency', 'USD')
WHERE travel_type = 'flight'
  AND (total_amount IS NULL OR total_amount = 0);

-- Verify the update worked
SELECT 
  id,
  booking_reference,
  total_amount,
  booking_details->>'amount' as details_amount,
  booking_details->>'currency' as currency,
  created_at
FROM bookings
WHERE travel_type = 'flight'
ORDER BY created_at DESC;
