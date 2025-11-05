-- ========================================
-- DIAGNOSTIC: Check Admin User Status
-- Run this to see what's wrong
-- ========================================

-- Check if role column exists
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;

-- Check if admin user exists
SELECT 
    id,
    email,
    first_name,
    last_name,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'role'
        ) THEN role
        ELSE 'NO ROLE COLUMN'
    END as role,
    created_at
FROM users 
WHERE email = 'sahi0045@hotmail.com';

-- Check admin_users table
SELECT 
    au.id,
    au.department,
    au.is_active,
    u.email
FROM admin_users au
LEFT JOIN users u ON au.id = u.id
WHERE u.email = 'sahi0045@hotmail.com';

-- Summary
DO $$
DECLARE
    has_role_column BOOLEAN;
    user_exists BOOLEAN;
    is_admin BOOLEAN := FALSE;
BEGIN
    -- Check role column
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'role'
    ) INTO has_role_column;
    
    -- Check user exists
    SELECT EXISTS (
        SELECT 1 FROM users WHERE email = 'sahi0045@hotmail.com'
    ) INTO user_exists;
    
    -- Check if admin (only if role column exists)
    IF has_role_column THEN
        SELECT EXISTS (
            SELECT 1 FROM users 
            WHERE email = 'sahi0045@hotmail.com' AND role = 'admin'
        ) INTO is_admin;
    END IF;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'DIAGNOSTIC RESULTS:';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Role column exists: %', has_role_column;
    RAISE NOTICE 'User exists: %', user_exists;
    RAISE NOTICE 'Is admin: %', is_admin;
    RAISE NOTICE '';
    
    IF NOT has_role_column THEN
        RAISE NOTICE '❌ PROBLEM: Role column missing!';
        RAISE NOTICE 'FIX: Run create-admin-simple.sql';
    ELSIF NOT user_exists THEN
        RAISE NOTICE '❌ PROBLEM: User does not exist!';
        RAISE NOTICE 'FIX: Run create-admin-simple.sql';
    ELSIF NOT is_admin THEN
        RAISE NOTICE '❌ PROBLEM: User exists but is not admin!';
        RAISE NOTICE 'FIX: Run create-admin-simple.sql';
    ELSE
        RAISE NOTICE '✅ ALL GOOD: Admin user is properly configured!';
        RAISE NOTICE 'You can login at: http://localhost:5173/admin/login';
    END IF;
    RAISE NOTICE '========================================';
END $$;
