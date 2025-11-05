-- Initialize Feature Flags with Default Values
-- Run this in Supabase SQL Editor to set up initial feature flags

INSERT INTO feature_flags (flag_key, flag_name, enabled, description) VALUES
('enable_flight_inquiries', '✈️ Flight Inquiries', true, 'Allow users to submit flight booking inquiries'),
('enable_hotel_inquiries', '🏨 Hotel Inquiries', true, 'Allow users to submit hotel booking inquiries'),
('enable_cruise_inquiries', '🚢 Cruise Inquiries', true, 'Allow users to submit cruise vacation inquiries'),
('enable_package_inquiries', '🎒 Package Inquiries', true, 'Allow users to submit vacation package inquiries'),
('enable_general_inquiries', '💬 General Inquiries', true, 'Allow users to submit general travel inquiries')
ON CONFLICT (flag_key) DO UPDATE SET
  flag_name = EXCLUDED.flag_name,
  description = EXCLUDED.description;

-- Verify the flags were created
SELECT * FROM feature_flags ORDER BY flag_key;
