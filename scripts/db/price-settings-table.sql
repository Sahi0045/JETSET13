-- Create price_settings table for storing admin-configurable pricing rules
CREATE TABLE IF NOT EXISTS price_settings (
    id SERIAL PRIMARY KEY,
    settings JSONB NOT NULL DEFAULT '{
        "flight_taxes_fees": 25.00,
        "flight_taxes_fees_percentage": 5.0,
        "cruise_taxes_fees": 150.00,
        "cruise_taxes_fees_percentage": 8.0,
        "cruise_port_charges": 50.00,
        "hotel_taxes_fees": 35.00,
        "hotel_taxes_fees_percentage": 12.0,
        "package_markup_percentage": 10.0,
        "service_fee_percentage": 2.5,
        "cancellation_fee": 50.00
    }'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create an index on the settings JSONB column for faster queries
CREATE INDEX IF NOT EXISTS idx_price_settings_jsonb ON price_settings USING GIN (settings);

-- Insert default settings if table is empty
INSERT INTO price_settings (settings) 
SELECT '{
    "flight_taxes_fees": 25.00,
    "flight_taxes_fees_percentage": 5.0,
    "cruise_taxes_fees": 150.00,
    "cruise_taxes_fees_percentage": 8.0,
    "cruise_port_charges": 50.00,
    "hotel_taxes_fees": 35.00,
    "hotel_taxes_fees_percentage": 12.0,
    "package_markup_percentage": 10.0,
    "service_fee_percentage": 2.5,
    "cancellation_fee": 50.00
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM price_settings);

-- Add a comment to the table
COMMENT ON TABLE price_settings IS 'Stores admin-configurable pricing rules for taxes, fees, and markups across all travel services';
COMMENT ON COLUMN price_settings.settings IS 'JSONB object containing all pricing configuration values';
COMMENT ON INDEX idx_price_settings_jsonb IS 'GIN index for efficient JSONB querying of price settings';