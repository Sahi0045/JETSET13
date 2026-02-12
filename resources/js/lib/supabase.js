import { createClient } from '@supabase/supabase-js';

// Use Vite-provided environment variables for the frontend
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxbWFncXd1bWppcGRxdnhiaXF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUwMDEwMTIsImV4cCI6MjA2MDU3NzAxMn0.Ho8DYLWpX_vQ6syrI2zkU3G5pnNTdnYpgtpyjjGYlDA';

// Create a Supabase client for the frontend
const supabase = createClient(supabaseUrl || '', supabaseKey || '');

console.log('Supabase client initialized');
// Test the connection (this is optional but helps in debugging)
async function testConnection() {
  try {
    const { data, error } = await supabase.from('callback_requests').select('id').limit(1);
    if (error) {
      console.error('Supabase connection test failed:', error);
    } else {
      console.log('Supabase connection successful!', data);
    }
  } catch (e) {
    console.error('Error testing Supabase connection:', e);
  }
}

// Run the test
testConnection();
export default supabase;


