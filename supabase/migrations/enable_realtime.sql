-- Enable Supabase Realtime for Visa tables
-- This migration enables CDC (Change Data Capture) for real-time subscriptions

-- Enable realtime for visa_applications table
ALTER PUBLICATION supabase_realtime ADD TABLE visa_applications;

-- Enable realtime for visa_messages table
ALTER PUBLICATION supabase_realtime ADD TABLE visa_messages;

-- Optional: Enable for related tables if they exist and need realtime
-- Uncomment as needed:
-- ALTER PUBLICATION supabase_realtime ADD TABLE visa_consultations;
-- ALTER PUBLICATION supabase_realtime ADD TABLE visa_documents;

-- Grant permissions for realtime (RLS must be configured properly)
-- Note: This assumes RLS is already enabled on these tables

-- Create a function to check if realtime is enabled (for debugging)
CREATE OR REPLACE FUNCTION check_realtime_enabled()
RETURNS TABLE(
  tablename TEXT,
  schemaname TEXT,
  rowsecurity BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.relname::TEXT,
    n.nspname::TEXT,
    c.relrowsecurity::BOOLEAN
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname IN ('visa_applications', 'visa_messages')
    AND n.nspname = 'public';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;