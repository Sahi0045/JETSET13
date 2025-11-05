-- Fix RLS Policies - Remove Infinite Recursion
-- Run this in Supabase SQL Editor

-- Drop ALL existing policies on admin_users
DROP POLICY IF EXISTS "Admins can view admin users" ON admin_users CASCADE;
DROP POLICY IF EXISTS "Admins can manage admin users" ON admin_users CASCADE;
DROP POLICY IF EXISTS "Admin users can view themselves" ON admin_users CASCADE;
DROP POLICY IF EXISTS "Service role can manage admin users" ON admin_users CASCADE;

-- Drop ALL existing policies on inquiries
DROP POLICY IF EXISTS "Users can view their inquiries" ON inquiries CASCADE;
DROP POLICY IF EXISTS "Admins can manage all inquiries" ON inquiries CASCADE;
DROP POLICY IF EXISTS "Anyone can create inquiries" ON inquiries CASCADE;
DROP POLICY IF EXISTS "Users can view their own inquiries" ON inquiries CASCADE;
DROP POLICY IF EXISTS "Authenticated admins can view all inquiries" ON inquiries CASCADE;
DROP POLICY IF EXISTS "Authenticated admins can update inquiries" ON inquiries CASCADE;
DROP POLICY IF EXISTS "Authenticated admins can delete inquiries" ON inquiries CASCADE;

-- Fix admin_users policies (avoid circular reference)
CREATE POLICY "Admin users can view themselves"
    ON admin_users FOR SELECT
    USING (id = auth.uid());

CREATE POLICY "Service role can manage admin users"
    ON admin_users FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- Fix inquiries policies - Allow public INSERT, restrict others
CREATE POLICY "Anyone can create inquiries"
    ON inquiries FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Users can view their own inquiries"
    ON inquiries FOR SELECT
    USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Authenticated admins can view all inquiries"
    ON inquiries FOR SELECT
    USING (
        auth.uid() IN (SELECT id FROM admin_users WHERE is_active = true)
    );

CREATE POLICY "Authenticated admins can update inquiries"
    ON inquiries FOR UPDATE
    USING (
        auth.uid() IN (SELECT id FROM admin_users WHERE is_active = true)
    );

CREATE POLICY "Authenticated admins can delete inquiries"
    ON inquiries FOR DELETE
    USING (
        auth.uid() IN (SELECT id FROM admin_users WHERE is_active = true)
    );

-- Drop ALL existing policies on quotes
DROP POLICY IF EXISTS "Users can view quotes for their inquiries" ON quotes CASCADE;
DROP POLICY IF EXISTS "Admins can manage all quotes" ON quotes CASCADE;
DROP POLICY IF EXISTS "Users can view their quotes" ON quotes CASCADE;
DROP POLICY IF EXISTS "Authenticated admins can manage quotes" ON quotes CASCADE;

CREATE POLICY "Users can view their quotes"
    ON quotes FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM inquiries 
            WHERE id = quotes.inquiry_id 
            AND user_id = auth.uid()
        )
    );

CREATE POLICY "Authenticated admins can manage quotes"
    ON quotes FOR ALL
    USING (
        auth.uid() IN (SELECT id FROM admin_users WHERE is_active = true)
    );

-- Drop ALL existing policies on email_notifications
DROP POLICY IF EXISTS "Admins can view all notifications" ON email_notifications CASCADE;
DROP POLICY IF EXISTS "Admins can manage notifications" ON email_notifications CASCADE;
DROP POLICY IF EXISTS "Authenticated admins can manage notifications" ON email_notifications CASCADE;

CREATE POLICY "Authenticated admins can manage notifications"
    ON email_notifications FOR ALL
    USING (
        auth.uid() IN (SELECT id FROM admin_users WHERE is_active = true)
    );

-- Drop ALL existing policies on feature_flags
DROP POLICY IF EXISTS "Admins can manage feature flags" ON feature_flags CASCADE;
DROP POLICY IF EXISTS "Authenticated admins can manage feature flags" ON feature_flags CASCADE;
DROP POLICY IF EXISTS "Anyone can view enabled feature flags" ON feature_flags CASCADE;

CREATE POLICY "Authenticated admins can manage feature flags"
    ON feature_flags FOR ALL
    USING (
        auth.uid() IN (SELECT id FROM admin_users WHERE is_active = true)
    );
