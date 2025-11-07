import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

async function inspectDatabase() {
  console.log('🔍 Inspecting Supabase Database...\n');
  console.log(`📡 Connected to: ${supabaseUrl}\n`);

  const tables = [
    'users',
    'callback_requests',
    'quote_requests',
    'contact_messages',
    'bookings',
    'subscriptions',
    'email_subscribers',
    'promotional_offers',
    'email_campaigns',
    'subscriber_interactions',
    'flight_deals',
    'subscriber_avatars'
  ];

  for (const tableName of tables) {
    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📊 Table: ${tableName.toUpperCase()}`);
      console.log('='.repeat(60));

      const { data, error, count } = await supabase
        .from(tableName)
        .select('*', { count: 'exact' })
        .limit(5);

      if (error) {
        if (error.code === 'PGRST116' || error.message.includes('relation') || error.message.includes('does not exist')) {
          console.log(`❌ Table does not exist or is not accessible`);
        } else {
          console.log(`⚠️  Error: ${error.message}`);
        }
        continue;
      }

      console.log(`📈 Total Records: ${count || 0}`);

      if (data && data.length > 0) {
        console.log(`\n📋 Sample Data (showing first ${Math.min(5, data.length)} records):`);
        console.log(JSON.stringify(data, null, 2));
        
        console.log(`\n🔑 Columns in this table:`);
        const columns = Object.keys(data[0]);
        columns.forEach(col => {
          const sampleValue = data[0][col];
          const type = sampleValue === null ? 'NULL' : 
                      typeof sampleValue === 'string' ? 'TEXT' :
                      typeof sampleValue === 'number' ? 'NUMBER' :
                      typeof sampleValue === 'boolean' ? 'BOOLEAN' :
                      Array.isArray(sampleValue) ? 'ARRAY' :
                      typeof sampleValue === 'object' ? 'JSON/JSONB' : 'UNKNOWN';
          console.log(`   - ${col}: ${type}`);
        });
      } else {
        console.log(`ℹ️  Table exists but is empty`);
      }

    } catch (error) {
      console.log(`❌ Unexpected error for table ${tableName}: ${error.message}`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ Database inspection complete');
  console.log('='.repeat(60));
}

inspectDatabase().catch(console.error);






