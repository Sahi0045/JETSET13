const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './backend/.env' });
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {
    const { data: payment, error } = await supabase
      .from('payments')
      .select('*')
      .or(`id.eq.00000000-0000-0000-0000-000000000000`)
      .limit(1)
      .single();
      
    if (error) throw error;
    console.log("No error thrown by single, returned:", payment);
  } catch(e) {
    console.log("CAUGHT ERROR:", e.message);
  }
}
run();
