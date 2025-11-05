-- ========================================
-- CREATE ADMIN USER WITH FULL ACCESS
-- Email: sahi0045@hotmail.com
-- Password: Sahi@0045
-- Run this in your Supabase SQL Editor
-- ========================================

-- First, ensure the pgcrypto extension is enabled (for password hashing)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Step 1: Add role column to users table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'role'
    ) THEN
        ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';
        ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'));
        RAISE NOTICE '✅ Added role column to users table';
    ELSE
        RAISE NOTICE '✅ Role column already exists in users table';
    END IF;
END $$;

-- Step 2: Create or update admin user
DO $$
DECLARE
    user_id_var UUID;
    has_email_column BOOLEAN;
BEGIN
    -- Check if admin_users has email column (standalone table)
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'admin_users' AND column_name = 'email'
    ) INTO has_email_column;

    IF has_email_column THEN
        -- Standalone admin_users table with email/password
        INSERT INTO admin_users (
          email,
          password,
          first_name,
          last_name,
          role,
          is_active,
          created_at,
          updated_at
        ) VALUES (
          'sahi0045@hotmail.com',
          crypt('Sahi@0045', gen_salt('bf')),
          'Sahi',
          'Admin',
          'admin',
          true,
          NOW(),
          NOW()
        ) 
        ON CONFLICT (email) 
        DO UPDATE SET 
          password = EXCLUDED.password,
          role = 'admin',
          is_active = true,
          updated_at = NOW();
          
        RAISE NOTICE '✅ Admin user created in standalone admin_users table';
    ELSE
        -- admin_users references users table - create in both tables
        -- First, create/update in users table
        INSERT INTO users (
          email,
          password,
          name,
          first_name,
          last_name,
          role,
          created_at,
          updated_at
        ) VALUES (
          'sahi0045@hotmail.com',
          crypt('Sahi@0045', gen_salt('bf')),
          'Sahi Admin',
          'Sahi',
          'Admin',
          'admin',
          NOW(),
          NOW()
        )
        ON CONFLICT (email) 
        DO UPDATE SET 
          password = EXCLUDED.password,
          role = 'admin',
          updated_at = NOW()
        RETURNING id INTO user_id_var;
        
        -- Get user_id if update happened
        IF user_id_var IS NULL THEN
            SELECT id INTO user_id_var FROM users WHERE email = 'sahi0045@hotmail.com';
        END IF;
        
        -- Then create/update in admin_users
        INSERT INTO admin_users (
          id,
          department,
          is_active,
          created_at,
          updated_at
        ) VALUES (
          user_id_var,
          'Management',
          true,
          NOW(),
          NOW()
        )
        ON CONFLICT (id)
        DO UPDATE SET
          is_active = true,
          department = 'Management',
          updated_at = NOW();
          
        RAISE NOTICE '✅ Admin user created in users + admin_users tables';
    END IF;
END $$;

-- ========================================
-- VERIFY ADMIN USER CREATION
-- ========================================

DO $$
DECLARE
    has_email_column BOOLEAN;
    user_count INTEGER;
    admin_count INTEGER;
BEGIN
    -- Check table structure
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'admin_users' AND column_name = 'email'
    ) INTO has_email_column;

    IF has_email_column THEN
        -- Standalone admin_users table
        SELECT COUNT(*) INTO admin_count
        FROM admin_users 
        WHERE email = 'sahi0045@hotmail.com' AND role = 'admin' AND is_active = true;
        
        IF admin_count > 0 THEN
            RAISE NOTICE '✅ SUCCESS: Admin user created in standalone admin_users table';
            RAISE NOTICE 'Email: sahi0045@hotmail.com';
            RAISE NOTICE 'Role: admin';
            RAISE NOTICE 'Status: active';
        ELSE
            RAISE WARNING '❌ WARNING: Admin user not found or not properly configured';
        END IF;
    ELSE
        -- Users + admin_users table structure
        SELECT COUNT(*) INTO user_count
        FROM users u
        WHERE u.email = 'sahi0045@hotmail.com' AND u.role = 'admin';
        
        SELECT COUNT(*) INTO admin_count
        FROM users u
        JOIN admin_users au ON u.id = au.id
        WHERE u.email = 'sahi0045@hotmail.com' AND au.is_active = true;
        
        IF user_count > 0 AND admin_count > 0 THEN
            RAISE NOTICE '✅ SUCCESS: Admin user created in users + admin_users tables';
            RAISE NOTICE 'Email: sahi0045@hotmail.com';
            RAISE NOTICE 'Role: admin';
            RAISE NOTICE 'Status: active';
            RAISE NOTICE 'Tables: users ✓, admin_users ✓';
        ELSE
            RAISE WARNING '❌ WARNING: Admin user not found or not properly configured';
            RAISE WARNING 'User count: %', user_count;
            RAISE WARNING 'Admin count: %', admin_count;
        END IF;
    END IF;
END $$;

-- Display admin user details
SELECT 
    u.id,
    u.email,
    u.first_name,
    u.last_name,
    u.role,
    au.is_active as admin_active,
    au.department,
    u.created_at
FROM users u
LEFT JOIN admin_users au ON u.id = au.id
WHERE u.email = 'sahi0045@hotmail.com';

-- ========================================
-- ADMIN ACCESS SUMMARY
-- ========================================
-- This admin user (sahi0045@hotmail.com) can now:
-- ✅ Login at: http://localhost:5173/admin/login
-- ✅ Access Admin Dashboard
-- ✅ View All Inquiries
-- ✅ Create & Send Quotes
-- ✅ Manage Feature Flags
-- ✅ View Email Notifications
-- ✅ Update Inquiry Status
-- ✅ Full Admin Panel Access
-- ========================================
