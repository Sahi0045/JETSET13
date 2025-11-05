-- ========================================
-- CREATE ADMIN USER - SIMPLE VERSION
-- Email: sahi0045@hotmail.com
-- Password: Sahi@0045
-- Run this in your Supabase SQL Editor
-- ========================================

-- Enable pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add role column if it doesn't exist (run separately first)
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- Add check constraint if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'));
    END IF;
END $$;

-- Create or update the admin user in users table
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
    updated_at = NOW();

-- Get the user ID and create/update in admin_users table
DO $$
DECLARE
    admin_user_id UUID;
BEGIN
    -- Get the user ID
    SELECT id INTO admin_user_id 
    FROM users 
    WHERE email = 'sahi0045@hotmail.com';
    
    -- Create or update in admin_users table
    INSERT INTO admin_users (
        id,
        department,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        admin_user_id,
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
    
    RAISE NOTICE '✅ Admin user created successfully!';
END $$;

-- Verify the admin user
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

-- Success message
DO $$
DECLARE
    user_exists BOOLEAN;
    has_admin_role BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM users WHERE email = 'sahi0045@hotmail.com'
    ) INTO user_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM users WHERE email = 'sahi0045@hotmail.com' AND role = 'admin'
    ) INTO has_admin_role;
    
    IF user_exists AND has_admin_role THEN
        RAISE NOTICE '';
        RAISE NOTICE '========================================';
        RAISE NOTICE '✅ ADMIN USER CREATED SUCCESSFULLY!';
        RAISE NOTICE '========================================';
        RAISE NOTICE 'Email: sahi0045@hotmail.com';
        RAISE NOTICE 'Password: Sahi@0045';
        RAISE NOTICE 'Role: admin';
        RAISE NOTICE 'Status: active';
        RAISE NOTICE '';
        RAISE NOTICE 'Login at: http://localhost:5173/admin/login';
        RAISE NOTICE '========================================';
    ELSE
        RAISE WARNING 'Admin user creation may have failed. Please check the output above.';
    END IF;
END $$;
