-- Add 'partially_refunded' to the bookings payment_status constraint
-- This is needed because cancellations charge a fee and refund a partial amount

-- Drop the existing constraint
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;

-- Re-create with the new allowed values
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check 
  CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'refunded', 'partially_refunded'));
