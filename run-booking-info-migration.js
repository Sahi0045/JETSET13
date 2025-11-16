import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use service role key for admin operations
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration!');
  console.error('Required environment variables:');
  console.error('  - SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Create Supabase client with service role key (has admin privileges)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

async function runMigration() {
  try {
    console.log('📄 Reading migration file...');
    const sqlFile = path.join(__dirname, 'backend', 'migrations', 'booking_info_schema.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    console.log('🔄 Executing SQL migration...');
    console.log('   File: booking_info_schema.sql');
    
    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`   Found ${statements.length} SQL statements`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.length === 0) continue;
      
      try {
        console.log(`   Executing statement ${i + 1}/${statements.length}...`);
        const { error } = await supabase.rpc('exec_sql', { sql_query: statement });
        
        if (error) {
          // If exec_sql function doesn't exist, try direct query
          // Note: Supabase client doesn't support raw SQL directly
          // We'll need to use the REST API or psql
          console.warn(`   ⚠️  Could not execute via RPC, trying alternative method...`);
          console.warn(`   Error: ${error.message}`);
          
          // Alternative: Use Supabase REST API
          const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseServiceKey,
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({ sql_query: statement })
          });
          
          if (!response.ok) {
            console.error(`   ❌ Failed to execute statement ${i + 1}`);
            console.error(`   Response: ${await response.text()}`);
          } else {
            console.log(`   ✅ Statement ${i + 1} executed successfully`);
          }
        } else {
          console.log(`   ✅ Statement ${i + 1} executed successfully`);
        }
      } catch (err) {
        console.error(`   ❌ Error executing statement ${i + 1}:`, err.message);
        // Continue with next statement
      }
    }
    
    console.log('\n✅ Migration completed!');
    console.log('\n📋 Next steps:');
    console.log('   1. Verify the booking_info table was created in Supabase dashboard');
    console.log('   2. Check that all indexes and policies were created');
    console.log('   3. Test the booking info API endpoints');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();

