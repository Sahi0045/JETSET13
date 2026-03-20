import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase configuration.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupDatabase() {
  console.log('🚀 Setting up password_resets table...');

  try {
    // We can't run raw SQL directly via the JS client easily, 
    // but we can try to use the query builder to check if it's there.
    // If we want to create a table, we usually need to use the SQL editor in Supabase UI.
    // However, I will try to use a little trick: if there's an RPC for raw SQL, we use it.
    
    // For now, I'll just check if I can access it.
    const { error: checkError } = await supabase
      .from('password_resets')
      .select('id')
      .limit(1);

    if (checkError && checkError.code === 'PGRST116' || checkError && checkError.message.includes('not found')) {
      console.log('⚠️ table "password_resets" does not exist.');
      console.log('Please run the following SQL in your Supabase SQL Editor:');
      console.log(`
      CREATE TABLE IF NOT EXISTS public.password_resets (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email TEXT NOT NULL,
        token TEXT NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      -- Enable RLS
      ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;
      
      -- Create policy for service role (backend)
      CREATE POLICY "Service role can manage password resets" 
      ON public.password_resets FOR ALL 
      TO service_role 
      USING (true) 
      WITH CHECK (true);
      `);
    } else if (checkError) {
      console.error('❌ Error checking table:', checkError.message);
    } else {
      console.log('✅ table "password_resets" already exists.');
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

setupDatabase();
