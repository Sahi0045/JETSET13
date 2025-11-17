-- Add Government ID fields to booking_info table
-- Government ID is required for all bookings (not just flights)

ALTER TABLE booking_info 
ADD COLUMN IF NOT EXISTS govt_id_type TEXT CHECK (govt_id_type IN ('drivers_license', 'national_id', 'passport', 'other')),
ADD COLUMN IF NOT EXISTS govt_id_number TEXT,
ADD COLUMN IF NOT EXISTS govt_id_issue_date DATE,
ADD COLUMN IF NOT EXISTS govt_id_expiry_date DATE,
ADD COLUMN IF NOT EXISTS govt_id_issuing_authority TEXT,
ADD COLUMN IF NOT EXISTS govt_id_issuing_country TEXT;

-- Create index for government ID number
CREATE INDEX IF NOT EXISTS idx_booking_info_govt_id_number ON booking_info(govt_id_number);

