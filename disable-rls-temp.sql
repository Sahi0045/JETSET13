-- TEMPORARY: Disable RLS for testing
-- Run this in Supabase SQL Editor to allow public inquiry submissions

-- Disable RLS on inquiries table (for testing only)
ALTER TABLE inquiries DISABLE ROW LEVEL SECURITY;

-- Disable RLS on quotes table (for testing only)
ALTER TABLE quotes DISABLE ROW LEVEL SECURITY;

-- Disable RLS on admin_users (for testing only)
ALTER TABLE admin_users DISABLE ROW LEVEL SECURITY;

-- Note: Re-enable RLS later for production using:
-- ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
