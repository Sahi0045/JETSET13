import { createClient } from '@supabase/supabase-js';

// Use Vite-provided environment variables for the frontend
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxbWFncXd1bWppcGRxdnhiaXF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUwMDEwMTIsImV4cCI6MjA2MDU3NzAxMn0.Ho8DYLWpX_vQ6syrI2zkU3G5pnNTdnYpgtpyjjGYlDA';

// Create a Supabase client for the frontend.
// persistSession:false → the SDK never writes tokens to localStorage (security:
// no XSS-exfiltratable token at rest). The session lives in memory only and is
// re-hydrated after a reload from the httpOnly refresh cookie via the backend.
const supabase = createClient(supabaseUrl || '', supabaseKey || '', {
  auth: {
    persistSession: false,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

console.log('Supabase client initialized');

// NOTE: there is deliberately no startup "connection test" query here.
// It used to run `select id from callback_requests limit 1` on module load for
// every visitor. With RLS enabled (see
// supabase/migrations/20260728120000_enable_rls_all_public_tables.sql) the anon
// role has INSERT-only access to the lead-capture tables, so that probe would
// fail on every page load and log a misleading error. Reads of those tables go
// through the backend service-role key instead.

export default supabase;


