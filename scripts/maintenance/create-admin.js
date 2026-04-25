import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase configuration. Check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const email = 'akant@jetsetterss.com';
const password = '123456789';

async function createAdmin() {
  console.log('🚀 Starting admin account creation for:', email);

  try {
    // 1. Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 2. Check if user exists
    const { data: existingUsers, error: queryError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email);

    if (queryError) {
      console.error('❌ Error checking existing user:', queryError.message);
      return;
    }

    let userId;

    if (existingUsers && existingUsers.length > 0) {
      userId = existingUsers[0].id;
      console.log('🔄 User already exists (ID:', userId + '), updating role to admin...');
      
      const { error: updateError } = await supabase
        .from('users')
        .update({ 
          role: 'admin', 
          password: hashedPassword,
          name: 'Akant',
          first_name: 'Akant',
          last_name: 'Admin'
        })
        .eq('id', userId);
      
      if (updateError) {
        console.error('❌ Error updating user role:', updateError.message);
        return;
      }
    } else {
      // 3. Insert into users
      console.log('➕ Creating new user...');
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert([{
          email: email,
          password: hashedPassword,
          name: 'Akant',
          first_name: 'Akant',
          last_name: 'Admin',
          role: 'admin'
        }])
        .select()
        .single();

      if (insertError) {
        console.error('❌ Error inserting into users:', insertError.message);
        return;
      }
      userId = newUser.id;
    }

    // 4. Ensure user is in admin_users table
    console.log('🛡️ Ensuring user is in admin_users table...');
    const { data: existingAdmin, error: adminQueryError } = await supabase
      .from('admin_users')
      .select('id')
      .eq('id', userId);

    if (adminQueryError) {
      console.error('❌ Error checking admin_users:', adminQueryError.message);
      return;
    }

    if (existingAdmin && existingAdmin.length > 0) {
      const { error: adminUpdateError } = await supabase
        .from('admin_users')
        .update({ is_active: true, department: 'Admin' })
        .eq('id', userId);

      if (adminUpdateError) {
        console.error('❌ Error updating admin_users:', adminUpdateError.message);
        return;
      }
    } else {
      const { error: adminInsertError } = await supabase
        .from('admin_users')
        .insert([{
          id: userId,
          department: 'Admin',
          is_active: true
        }]);

      if (adminInsertError) {
        console.error('❌ Error inserting into admin_users:', adminInsertError.message);
        return;
      }
    }

    console.log('✅ Admin account created/updated successfully!');
    console.log('\n--- Account Details ---');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('Role:', 'admin');
    console.log('Status: Active');
    console.log('--- --- --- --- --- ---');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

createAdmin();
