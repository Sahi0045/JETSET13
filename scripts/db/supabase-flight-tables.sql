-- Flight Subscription System Tables
-- For Supabase database

-- Admins Table - For managing admin access to subscriber data
CREATE TABLE admins (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(100),
    role VARCHAR(50) DEFAULT 'admin',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email Subscribers Table - Stores user subscription information
CREATE TABLE email_subscribers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    first_name VARCHAR(100),
    subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    last_email_sent TIMESTAMP WITH TIME ZONE,
    source VARCHAR(50) DEFAULT 'website',
    consent_given BOOLEAN DEFAULT TRUE,
    unsubscribed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Promotional Offers Table - Stores promotional offers for flights
CREATE TABLE promotional_offers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    discount_percentage INTEGER CHECK (discount_percentage BETWEEN 0 AND 100),
    discount_code VARCHAR(50),
    start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    end_date TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    image_url VARCHAR(500),
    terms_conditions TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email Campaigns Table - For tracking email campaigns sent
CREATE TABLE email_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE,
    total_recipients INTEGER DEFAULT 0,
    open_count INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0,
    promotion_id UUID REFERENCES promotional_offers(id),
    is_scheduled BOOLEAN DEFAULT FALSE,
    scheduled_for TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subscriber Interactions Table - Tracks how users interact with emails
CREATE TABLE subscriber_interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscriber_id UUID REFERENCES email_subscribers(id) NOT NULL,
    campaign_id UUID REFERENCES email_campaigns(id),
    opened BOOLEAN DEFAULT FALSE,
    clicked BOOLEAN DEFAULT FALSE,
    offer_redeemed BOOLEAN DEFAULT FALSE,
    interaction_time TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Flight Deals Table - For storing special flight deals shown to subscribers
CREATE TABLE flight_deals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_location VARCHAR(100) NOT NULL,
    to_location VARCHAR(100) NOT NULL,
    from_code VARCHAR(3) NOT NULL,
    to_code VARCHAR(3) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    airline VARCHAR(100),
    departure_date DATE,
    return_date DATE,
    is_round_trip BOOLEAN DEFAULT FALSE,
    is_featured BOOLEAN DEFAULT FALSE,
    promotion_id UUID REFERENCES promotional_offers(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Table for storing user avatars shown in subscription card
CREATE TABLE subscriber_avatars (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    image_url VARCHAR(500) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create RLS (Row Level Security) Policies
ALTER TABLE email_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotional_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriber_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE flight_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriber_avatars ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users
CREATE POLICY "Admins can manage all subscriber data" ON email_subscribers 
    FOR ALL 
    TO authenticated 
    USING (auth.uid() IN (SELECT id FROM admins));

-- Alternative policy if you don't have admins table
CREATE POLICY "Authenticated users can view subscriber data" ON email_subscribers 
    FOR SELECT 
    TO authenticated;

-- Policy for public subscription access
CREATE POLICY "Anyone can subscribe" ON email_subscribers 
    FOR INSERT 
    TO anon 
    WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_subscribers_email ON email_subscribers(email);
CREATE INDEX idx_offers_active ON promotional_offers(is_active);
CREATE INDEX idx_flight_deals_from_to ON flight_deals(from_code, to_code);
CREATE INDEX idx_flight_deals_price ON flight_deals(price);

-- Trigger for updating the updated_at field
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_promotional_offers_modtime
BEFORE UPDATE ON promotional_offers
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();

-- Insert a sample admin user (replace with your Supabase user ID)
-- Uncomment and use this if you have auth.users set up
-- INSERT INTO admins (id, email, name) 
-- VALUES ('your-auth-user-id', 'admin@example.com', 'Admin User');

-- Sample data for promotional offers
INSERT INTO promotional_offers (title, description, discount_percentage, discount_code) 
VALUES ('50% OFF Your Next Flight Booking', 'Limited time exclusive offer for new subscribers. Book your next flight and get 50% off.', 50, 'NEWUSER50');

-- Sample flight deals
INSERT INTO flight_deals (from_location, to_location, from_code, to_code, price, airline, departure_date, is_featured) 
VALUES 
('New Delhi', 'Mumbai', 'DEL', 'BOM', 4369, 'IndiGo', '2023-12-15', true),
('New Delhi', 'Bangalore', 'DEL', 'BLR', 4700, 'Air India', '2023-12-20', true),
('New Delhi', 'Goa', 'DEL', 'GOI', 4229, 'SpiceJet', '2024-01-15', true),
('New Delhi', 'Jaipur', 'DEL', 'JAI', 2367, 'IndiGo', '2023-12-28', false),
('New Delhi', 'Leh', 'DEL', 'IXL', 2748, 'Air India', '2024-01-02', false),
('New Delhi', 'Chandigarh', 'DEL', 'IXC', 2899, 'Vistara', '2024-01-01', false),
('New Delhi', 'Srinagar', 'DEL', 'SXR', 3349, 'SpiceJet', '2023-12-08', false),
('New Delhi', 'Bathinda', 'DEL', 'BUP', 1260, 'Alliance Air', '2024-02-05', false);

-- Sample subscriber avatars
INSERT INTO subscriber_avatars (image_url, display_order)
VALUES 
('https://randomuser.me/api/portraits/men/32.jpg', 1),
('https://randomuser.me/api/portraits/women/44.jpg', 2),
('https://randomuser.me/api/portraits/men/67.jpg', 3),
('https://randomuser.me/api/portraits/women/28.jpg', 4); 