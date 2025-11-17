-- Delete All Data from Tables (Preserves Table Structure)
-- This script deletes all data while keeping table structures intact
-- Tables are deleted in order to respect foreign key constraints

-- Disable triggers temporarily to speed up deletion
SET session_replication_role = 'replica';

-- Delete data from child tables first (those with foreign keys)

-- 1. Delete booking_info (references quotes, inquiries, users)
DELETE FROM booking_info;

-- 2. Delete payments (references quotes, inquiries)
DELETE FROM payments;

-- 3. Delete quote_attachments (references quotes, users)
DELETE FROM quote_attachments;

-- 4. Delete email_notifications (references inquiries, quotes)
DELETE FROM email_notifications;

-- 5. Delete quotes (references inquiries, users)
DELETE FROM quotes;

-- 6. Delete admin_users (references users)
DELETE FROM admin_users;

-- 7. Delete inquiries (references users)
DELETE FROM inquiries;

-- 8. Delete feature_flags (no dependencies, but keep default flags)
-- Note: We'll keep feature_flags as they contain system configuration
-- Uncomment the line below if you want to delete feature flags too
-- DELETE FROM feature_flags;

-- 9. Delete from flight-related tables (if they exist)
DELETE FROM subscriber_interactions;
DELETE FROM subscriber_avatars;
DELETE FROM flight_deals;
DELETE FROM email_campaigns;
DELETE FROM promotional_offers;
DELETE FROM email_subscribers;
DELETE FROM admins;

-- 10. Delete users (be careful - this might affect auth.users)
-- Note: Only delete from custom users table, not auth.users
-- Uncomment if you have a separate users table
-- DELETE FROM users;

-- Re-enable triggers
SET session_replication_role = 'origin';

-- Reset sequences (optional - uncomment if you want to reset auto-increment counters)
-- ALTER SEQUENCE quote_number_seq RESTART WITH 1;

-- Verify deletion (optional - shows count of remaining rows)
-- SELECT 
--     'booking_info' as table_name, COUNT(*) as row_count FROM booking_info
-- UNION ALL
-- SELECT 'payments', COUNT(*) FROM payments
-- UNION ALL
-- SELECT 'quote_attachments', COUNT(*) FROM quote_attachments
-- UNION ALL
-- SELECT 'email_notifications', COUNT(*) FROM email_notifications
-- UNION ALL
-- SELECT 'quotes', COUNT(*) FROM quotes
-- UNION ALL
-- SELECT 'admin_users', COUNT(*) FROM admin_users
-- UNION ALL
-- SELECT 'inquiries', COUNT(*) FROM inquiries;

