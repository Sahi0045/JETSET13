-- Enhanced Inquiry System Schema
-- This schema extends the existing quote_requests table with comprehensive inquiry management

-- Feature Flags Table (for controlling inquiry forms)
CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flag_name TEXT UNIQUE NOT NULL,
    enabled BOOLEAN DEFAULT true,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enhanced Inquiries Table (replaces basic quote_requests for comprehensive inquiries)
CREATE TABLE IF NOT EXISTS inquiries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    inquiry_type TEXT NOT NULL CHECK (inquiry_type IN ('flight', 'hotel', 'cruise', 'package', 'general')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'quoted', 'booked', 'cancelled', 'expired')),

    -- Customer Information
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT,
    customer_country TEXT,

    -- Travel Details (JSON for flexibility across different inquiry types)
    travel_details JSONB NOT NULL DEFAULT '{}',

    -- Specific fields based on inquiry type
    -- Flight inquiries
    flight_origin TEXT,
    flight_destination TEXT,
    flight_departure_date DATE,
    flight_return_date DATE,
    flight_passengers INTEGER CHECK (flight_passengers > 0),
    flight_class TEXT CHECK (flight_class IN ('economy', 'premium_economy', 'business', 'first')),

    -- Hotel inquiries
    hotel_destination TEXT,
    hotel_checkin_date DATE,
    hotel_checkout_date DATE,
    hotel_rooms INTEGER CHECK (hotel_rooms > 0),
    hotel_guests INTEGER CHECK (hotel_guests > 0),
    hotel_room_type TEXT,

    -- Cruise inquiries
    cruise_destination TEXT,
    cruise_departure_date DATE,
    cruise_duration INTEGER,
    cruise_cabin_type TEXT,
    cruise_passengers INTEGER CHECK (cruise_passengers > 0),

    -- Package inquiries
    package_destination TEXT,
    package_start_date DATE,
    package_end_date DATE,
    package_travelers INTEGER CHECK (package_travelers > 0),
    package_budget_range TEXT,
    package_interests TEXT[],

    -- General inquiry fields
    inquiry_subject TEXT,
    inquiry_message TEXT,

    -- Additional requirements
    special_requirements TEXT,
    budget_range TEXT,
    preferred_contact_method TEXT DEFAULT 'email' CHECK (preferred_contact_method IN ('email', 'phone', 'whatsapp')),

    -- Admin processing
    assigned_admin UUID REFERENCES users(id),
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    internal_notes TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_contacted_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Quotes Table (separate from inquiries for multiple quotes per inquiry)
CREATE TABLE IF NOT EXISTS quotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inquiry_id UUID NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
    admin_id UUID NOT NULL REFERENCES users(id),

    -- Quote details
    quote_number TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    total_amount DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'USD',

    -- Breakdown
    breakdown JSONB DEFAULT '{}', -- Detailed cost breakdown

    -- Terms and conditions
    terms_conditions TEXT,
    validity_days INTEGER DEFAULT 30,

    -- Status and tracking
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'paid', 'expired', 'rejected')),
    sent_at TIMESTAMP WITH TIME ZONE,
    accepted_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,

    -- Payment integration
    payment_link TEXT,
    payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'refunded', 'failed')),

    -- Internal notes
    admin_notes TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Quote Attachments Table
CREATE TABLE IF NOT EXISTS quote_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Admin Users Table (extends users table for admin-specific data)
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    department TEXT,
    permissions JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email Notifications Table
CREATE TABLE IF NOT EXISTS email_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inquiry_id UUID REFERENCES inquiries(id),
    quote_id UUID REFERENCES quotes(id),
    recipient_email TEXT NOT NULL,
    notification_type TEXT NOT NULL CHECK (notification_type IN ('inquiry_received', 'quote_sent', 'quote_accepted', 'payment_received', 'quote_expiring', 'quote_expired')),
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    sent_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_inquiries_user_id ON inquiries(user_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_type ON inquiries(inquiry_type);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status);
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON inquiries(created_at);
CREATE INDEX IF NOT EXISTS idx_inquiries_expires_at ON inquiries(expires_at);
CREATE INDEX IF NOT EXISTS idx_inquiries_assigned_admin ON inquiries(assigned_admin);

CREATE INDEX IF NOT EXISTS idx_quotes_inquiry_id ON quotes(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_expires_at ON quotes(expires_at);
CREATE INDEX IF NOT EXISTS idx_quotes_quote_number ON quotes(quote_number);

CREATE INDEX IF NOT EXISTS idx_quote_attachments_quote_id ON quote_attachments(quote_id);

CREATE INDEX IF NOT EXISTS idx_email_notifications_inquiry_id ON email_notifications(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_email_notifications_quote_id ON email_notifications(quote_id);
CREATE INDEX IF NOT EXISTS idx_email_notifications_status ON email_notifications(status);

-- Enable Row Level Security
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- RLS Policies for inquiries
CREATE POLICY "Users can view their own inquiries"
    ON inquiries FOR SELECT
    USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE POLICY "Users can create their own inquiries"
    ON inquiries FOR INSERT
    WITH CHECK (auth.uid() = user_id OR auth.uid() IS NULL);

CREATE POLICY "Admins can update all inquiries"
    ON inquiries FOR UPDATE
    USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- RLS Policies for quotes
CREATE POLICY "Users can view quotes for their inquiries"
    ON quotes FOR SELECT
    USING (EXISTS (SELECT 1 FROM inquiries WHERE id = quotes.inquiry_id AND (user_id = auth.uid() OR EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))));

CREATE POLICY "Admins can manage all quotes"
    ON quotes FOR ALL
    USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- RLS Policies for quote attachments
CREATE POLICY "Users can view attachments for their quotes"
    ON quote_attachments FOR SELECT
    USING (EXISTS (SELECT 1 FROM quotes q JOIN inquiries i ON q.inquiry_id = i.id WHERE q.id = quote_attachments.quote_id AND (i.user_id = auth.uid() OR EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))));

CREATE POLICY "Admins can manage all attachments"
    ON quote_attachments FOR ALL
    USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- RLS Policies for admin_users
CREATE POLICY "Admins can view admin users"
    ON admin_users FOR SELECT
    USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE POLICY "Admins can manage admin users"
    ON admin_users FOR ALL
    USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- RLS Policies for email_notifications
CREATE POLICY "Admins can view all notifications"
    ON email_notifications FOR SELECT
    USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE POLICY "Admins can manage notifications"
    ON email_notifications FOR ALL
    USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- RLS Policies for feature_flags
CREATE POLICY "Admins can manage feature flags"
    ON feature_flags FOR ALL
    USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE POLICY "Anyone can view enabled feature flags"
    ON feature_flags FOR SELECT
    USING (enabled = true);

-- Create triggers for updated_at
CREATE TRIGGER update_inquiries_updated_at
    BEFORE UPDATE ON inquiries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quotes_updated_at
    BEFORE UPDATE ON quotes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admin_users_updated_at
    BEFORE UPDATE ON admin_users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert default feature flags
INSERT INTO feature_flags (flag_name, enabled, description) VALUES
    ('inquiry_forms_enabled', true, 'Enable inquiry forms in the request section'),
    ('flight_inquiries', true, 'Enable flight inquiry forms'),
    ('hotel_inquiries', true, 'Enable hotel inquiry forms'),
    ('cruise_inquiries', true, 'Enable cruise inquiry forms'),
    ('package_inquiries', true, 'Enable package inquiry forms')
ON CONFLICT (flag_name) DO NOTHING;

-- Create function to generate quote numbers
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TEXT AS $$
DECLARE
    quote_num TEXT;
BEGIN
    SELECT 'Q-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(NEXTVAL('quote_number_seq')::TEXT, 4, '0')
    INTO quote_num;
    RETURN quote_num;
END;
$$ LANGUAGE plpgsql;

-- Create sequence for quote numbers
CREATE SEQUENCE IF NOT EXISTS quote_number_seq START 1;

-- Create function to automatically set quote expiration
CREATE OR REPLACE FUNCTION set_quote_expiration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.validity_days IS NOT NULL AND NEW.sent_at IS NOT NULL THEN
        NEW.expires_at = NEW.sent_at + INTERVAL '1 day' * NEW.validity_days;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_quote_expiration_trigger
    BEFORE INSERT OR UPDATE ON quotes
    FOR EACH ROW
    EXECUTE FUNCTION set_quote_expiration();

-- Create function to automatically set inquiry expiration (30 days default)
CREATE OR REPLACE FUNCTION set_inquiry_expiration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.expires_at IS NULL THEN
        NEW.expires_at = NEW.created_at + INTERVAL '30 days';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_inquiry_expiration_trigger
    BEFORE INSERT ON inquiries
    FOR EACH ROW
    EXECUTE FUNCTION set_inquiry_expiration();
