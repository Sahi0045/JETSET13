# 🔐 Admin Access Guide - Complete Setup

## Admin User Details

**Email:** `sahi0045@hotmail.com`  
**Password:** `Sahi@0045`  
**Role:** `admin`  
**Department:** `Management`  
**Status:** `Active`

---

## 📋 Step-by-Step Setup

### Step 1: Run the Admin Creation SQL

1. Open your **Supabase SQL Editor**
2. Copy and paste the entire contents of `create-admin-user.sql`
3. Click **Run**
4. Check for success message: `✅ SUCCESS: Admin user created`
5. Review the returned user details table

### Step 2: Verify Database

The SQL script automatically creates the admin in both tables:
- ✅ `users` table with `role = 'admin'`
- ✅ `admin_users` table with `is_active = true`

**Verification Query:**
```sql
SELECT 
    u.id,
    u.email,
    u.role,
    au.is_active,
    au.department
FROM users u
LEFT JOIN admin_users au ON u.id = au.id
WHERE u.email = 'sahi0045@hotmail.com';
```

Expected result:
```
| id          | email                  | role  | is_active | department |
|-------------|------------------------|-------|-----------|------------|
| <uuid>      | sahi0045@hotmail.com   | admin | true      | Management |
```

---

## 🚀 How to Login

### Admin Login Page
**URL:** http://localhost:5173/admin/login

### Steps:
1. Open the login page
2. Enter email: `sahi0045@hotmail.com`
3. Enter password: `Sahi@0045`
4. Click **Sign In**
5. You'll be redirected to: http://localhost:5173/admin

---

## 🎯 Admin Panel Access - Full List

Once logged in, you have access to:

### 1. **Admin Dashboard** ✅
- **URL:** `/admin`
- **Features:**
  - Overview statistics
  - Recent inquiries
  - Quick actions
  - System status

### 2. **Inquiry Management** ✅
- **URL:** `/admin/inquiries`
- **Can:**
  - View all customer inquiries
  - Filter by status, type, priority
  - Search inquiries
  - Paginate results
  - Export data (if enabled)

### 3. **Inquiry Details** ✅
- **URL:** `/admin/inquiries/{id}`
- **Can:**
  - View complete customer information
  - See all travel requirements
  - Update inquiry status
  - Set priority level
  - Assign to admin
  - Add internal notes
  - View inquiry history

### 4. **Quote Creation** ✅
- **URL:** `/admin/inquiries/{id}/quote`
- **Can:**
  - Create professional quotes
  - Add cost breakdown
  - Set terms & conditions
  - Calculate totals automatically
  - Save as draft
  - Send directly to customer

### 5. **Feature Flags** ✅
- **URL:** `/admin/feature-flags`
- **Can:**
  - Toggle inquiry forms on/off
  - Enable/disable inquiry types
  - Control system features
  - Real-time updates

### 6. **Quote Management** ✅
- **API Access:** `/api/quotes`
- **Can:**
  - View all quotes
  - Update quote status
  - Resend quotes
  - Track quote lifecycle
  - Monitor expiration

### 7. **Email Notifications** ✅
- **Can:**
  - View sent emails
  - Check email status
  - Resend failed emails
  - Monitor notification queue

---

## 🔒 Admin Permissions

The admin role (`role = 'admin'`) grants access to:

### Protected API Endpoints:
```
GET    /api/inquiries              ✅ View all inquiries
GET    /api/inquiries/:id          ✅ View inquiry details
PUT    /api/inquiries/:id          ✅ Update inquiry
PUT    /api/inquiries/:id/assign   ✅ Assign inquiry
DELETE /api/inquiries/:id          ✅ Delete inquiry
GET    /api/inquiries/stats        ✅ View statistics

POST   /api/quotes                 ✅ Create quote
GET    /api/quotes                 ✅ View all quotes
GET    /api/quotes/:id             ✅ View quote details
PUT    /api/quotes/:id             ✅ Update quote
PUT    /api/quotes/:id/send        ✅ Send quote
DELETE /api/quotes/:id             ✅ Delete quote

GET    /api/feature-flags          ✅ View flags
PUT    /api/feature-flags/:id      ✅ Update flags

GET    /api/email-notifications    ✅ View emails
```

### Frontend Routes:
```
/admin                              ✅ Dashboard
/admin/login                        ✅ Login page (public)
/admin/inquiries                    ✅ Inquiry list
/admin/inquiries/:id                ✅ Inquiry detail
/admin/inquiries/:id/quote          ✅ Create quote
/admin/feature-flags                ✅ Feature flags
```

---

## 🛡️ Security Features

### Authentication
- ✅ JWT-based authentication
- ✅ Secure password hashing (bcrypt)
- ✅ Token expiration (30 days)
- ✅ Auto-logout on token expiry

### Authorization
- ✅ Role-based access control (RBAC)
- ✅ Admin-only route protection
- ✅ Row-level security (RLS) in database
- ✅ API middleware protection

### Database Security
- ✅ RLS policies on all tables
- ✅ Admin-only data access
- ✅ Encrypted passwords
- ✅ Audit trails (timestamps)

---

## 🔧 Troubleshooting

### Issue: Cannot login

**Check:**
1. ✅ Admin user created in database?
   ```sql
   SELECT * FROM users WHERE email = 'sahi0045@hotmail.com';
   ```
2. ✅ Role is 'admin'?
3. ✅ Password correct? (case-sensitive: `Sahi@0045`)
4. ✅ Backend server running?

**Solution:**
- Re-run `create-admin-user.sql`
- Clear browser cache
- Check browser console for errors

---

### Issue: Access denied to admin pages

**Check:**
1. ✅ Logged in successfully?
2. ✅ Token saved in localStorage?
   - Open DevTools → Application → Local Storage
   - Look for `adminToken` and `adminUser`
3. ✅ Token includes admin role?

**Solution:**
- Logout and login again
- Verify admin role in database
- Check `auth.middleware.js` for role check

---

### Issue: "Not authorized as an admin"

**Check:**
1. ✅ User role is exactly `'admin'` (lowercase)
2. ✅ Admin middleware is working

**Fix:**
```sql
-- Force update role to admin
UPDATE users 
SET role = 'admin' 
WHERE email = 'sahi0045@hotmail.com';
```

---

### Issue: Cannot see inquiries

**Check:**
1. ✅ Any inquiries in database?
   ```sql
   SELECT COUNT(*) FROM inquiries;
   ```
2. ✅ RLS policies allowing admin access?
3. ✅ API endpoint returning data?

**Solution:**
- Submit test inquiry from `/request`
- Check browser Network tab
- Verify backend API response

---

## 📊 Admin Capabilities Summary

| Feature | Can View | Can Create | Can Edit | Can Delete |
|---------|----------|------------|----------|------------|
| Inquiries | ✅ All | ❌ No | ✅ Yes | ✅ Yes |
| Quotes | ✅ All | ✅ Yes | ✅ Yes | ✅ Yes |
| Feature Flags | ✅ All | ❌ No | ✅ Yes | ❌ No |
| Email Logs | ✅ All | ❌ Auto | ❌ No | ❌ No |
| Users | ✅ All | ✅ Yes | ✅ Yes | ✅ Yes |

---

## 🎓 Best Practices

### As an Admin, you should:

1. **Respond Quickly**
   - Check dashboard daily
   - Respond to inquiries within 24 hours
   - Set proper priority levels

2. **Create Professional Quotes**
   - Include detailed cost breakdown
   - Add clear terms & conditions
   - Set reasonable validity periods
   - Review before sending

3. **Maintain Data Quality**
   - Add internal notes for context
   - Update inquiry status regularly
   - Archive old inquiries
   - Monitor quote expiration

4. **Use Feature Flags Wisely**
   - Disable forms during maintenance
   - Test changes before enabling
   - Document flag purposes

---

## 🔗 Quick Links

### Production URLs (when deployed):
- **Admin Login:** `/admin/login`
- **Admin Dashboard:** `/admin`
- **Inquiry List:** `/admin/inquiries`
- **Feature Flags:** `/admin/feature-flags`

### Local Development:
- **Admin Login:** http://localhost:5173/admin/login
- **Admin Dashboard:** http://localhost:5173/admin
- **Inquiry List:** http://localhost:5173/admin/inquiries

### Backend API:
- **Base URL:** http://localhost:5004/api
- **Docs:** (Add Swagger/OpenAPI if available)

---

## 📱 Mobile Access

The admin panel is **fully responsive** and works on:
- ✅ Desktop (recommended)
- ✅ Tablet
- ✅ Mobile phones

**Note:** Some features are better used on desktop for optimal experience.

---

## 🎉 Getting Started Checklist

- [ ] Run `create-admin-user.sql` in Supabase
- [ ] Verify admin user exists
- [ ] Login at `/admin/login`
- [ ] Check dashboard access
- [ ] View inquiries list
- [ ] Test creating a quote
- [ ] Check feature flags
- [ ] Verify email notifications

---

## 💡 Tips & Tricks

### Keyboard Shortcuts (if implemented):
- `Ctrl/Cmd + K` - Quick search
- `Ctrl/Cmd + N` - New quote
- `Esc` - Close modals

### Filtering Inquiries:
- Use status filters for workflow
- Priority: Focus on `urgent` and `high`
- Type filters for specialization

### Quote Management:
- Save drafts for complex quotes
- Use templates (if available)
- Always review before sending

---

## 🆘 Support

If you encounter issues:
1. Check this guide first
2. Review browser console errors
3. Check backend server logs
4. Verify database connection
5. Contact: sahi0045@hotmail.com

---

**Admin Account Created:** ✅  
**Full Access Granted:** ✅  
**Ready for Production:** ✅

🎉 **You're all set! Start managing inquiries like a pro!**
