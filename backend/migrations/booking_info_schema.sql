-- Booking Information Table for storing passport and booking details
-- This table collects required information before payment can proceed

CREATE TABLE IF NOT EXISTS booking_info (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    inquiry_id UUID NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),

    -- Primary passenger/traveler information
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    date_of_birth DATE,
    nationality TEXT,

    -- Passport information (required for international travel)
    passport_number TEXT,
    passport_expiry_date DATE,
    passport_issue_date DATE,
    passport_issuing_country TEXT,

    -- Emergency contact
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    emergency_contact_relationship TEXT,

    -- Additional booking details based on inquiry type
    booking_details JSONB DEFAULT '{}', -- Flexible field for inquiry-specific data

    -- Terms and conditions
    terms_accepted BOOLEAN DEFAULT false,
    terms_accepted_at TIMESTAMP WITH TIME ZONE,
    privacy_policy_accepted BOOLEAN DEFAULT false,
    privacy_policy_accepted_at TIMESTAMP WITH TIME ZONE,

    -- Status tracking
    status TEXT DEFAULT 'incomplete' CHECK (status IN ('incomplete', 'completed', 'verified')),
    submitted_at TIMESTAMP WITH TIME ZONE,
    verified_at TIMESTAMP WITH TIME ZONE,

    -- Admin verification
    verified_by UUID REFERENCES users(id),
    verification_notes TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_booking_info_quote_id ON booking_info(quote_id);
CREATE INDEX IF NOT EXISTS idx_booking_info_inquiry_id ON booking_info(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_booking_info_user_id ON booking_info(user_id);
CREATE INDEX IF NOT EXISTS idx_booking_info_status ON booking_info(status);
CREATE INDEX IF NOT EXISTS idx_booking_info_created_at ON booking_info(created_at);

-- Enable Row Level Security
ALTER TABLE booking_info ENABLE ROW LEVEL SECURITY;

-- RLS Policies for booking_info
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own booking info" ON booking_info;
DROP POLICY IF EXISTS "Users can create their own booking info" ON booking_info;
DROP POLICY IF EXISTS "Users can update their own booking info" ON booking_info;
DROP POLICY IF EXISTS "Admins can view all booking info" ON booking_info;
DROP POLICY IF EXISTS "Admins can manage all booking info" ON booking_info;

-- Create policies
CREATE POLICY "Users can view their own booking info"
    ON booking_info FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own booking info"
    ON booking_info FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own booking info"
    ON booking_info FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all booking info"
    ON booking_info FOR SELECT
    USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE POLICY "Admins can manage all booking info"
    ON booking_info FOR ALL
    USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- Create trigger for updated_at (drop if exists first)
DROP TRIGGER IF EXISTS update_booking_info_updated_at ON booking_info;
CREATE TRIGGER update_booking_info_updated_at
    BEFORE UPDATE ON booking_info
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add booking_info_submitted field to quotes table to track completion
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS booking_info_submitted BOOLEAN DEFAULT false;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS booking_info_submitted_at TIMESTAMP WITH TIME ZONE;

-- Create index for the new field
CREATE INDEX IF NOT EXISTS idx_quotes_booking_info_submitted ON quotes(booking_info_submitted);

