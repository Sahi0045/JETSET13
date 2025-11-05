-- ========================================
-- CREATE ADMIN USER - STEP BY STEP
-- Email: sahi0045@hotmail.com
-- Password: Sahi@0045
-- 
-- RUN EACH SECTION ONE AT A TIME
-- ========================================

-- ========================================
-- STEP 1: Enable pgcrypto (Run this first)
-- ========================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ========================================
-- STEP 2: Add role column (Run this second)
-- ========================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';


-- ========================================
-- STEP 3: Add role constraint (Run this third)
-- ========================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'));
        RAISE NOTICE '✅ Constraint added';
    ELSE
        RAISE NOTICE '✅ Constraint already exists';
    END IF;
END $$;


-- ========================================
-- STEP 4: Create admin user (Run this fourth)
-- ========================================
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


-- ========================================
-- STEP 5: Add to admin_users table (Run this fifth)
-- ========================================
INSERT INTO admin_users (
    id,
    department,
    is_active,
    created_at,
    updated_at
)
SELECT 
    u.id,
    'Management',
    true,
    NOW(),
    NOW()
FROM users u
WHERE u.email = 'sahi0045@hotmail.com'
ON CONFLICT (id)
DO UPDATE SET
    is_active = true,
    department = 'Management',
    updated_at = NOW();


-- ========================================
-- STEP 6: Verify admin user (Run this last)
-- ========================================
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
-- You should see:
-- email: sahi0045@hotmail.com
-- role: admin
-- admin_active: true
-- department: Management
-- ========================================
