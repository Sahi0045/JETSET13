# Vercel Email Configuration Guide

## 🚨 CRITICAL: Add Environment Variables to Vercel

Your emails aren't working on production because Vercel doesn't have the required environment variables.

## Step-by-Step Setup:

### 1. Go to Vercel Dashboard
1. Visit: https://vercel.com/dashboard
2. Select your project (jetsetterss.com or prod-six-phi)
3. Click on **Settings** tab
4. Click on **Environment Variables** in the left sidebar

### 2. Add These Environment Variables:

Add each of these variables one by one:

#### Variable 1: RESEND_API_KEY
```
Name: RESEND_API_KEY
Value: re_TP1fp7vH_4f8dHUoKyLDGwzjZ9iTcrnki
Environment: Production, Preview, Development (select all)
```

#### Variable 2: ADMIN_EMAIL
```
Name: ADMIN_EMAIL
Value: jetsetters721@gmail.com
Environment: Production, Preview, Development (select all)
```
**⚠️ IMPORTANT:** Use `jetsetters721@gmail.com` (your Resend registered email) instead of `sahi0045@hotmail.com` because Resend free tier can only send to the registered email address.

#### Variable 3: FRONTEND_URL
```
Name: FRONTEND_URL
Value: https://jetsetterss.com
Environment: Production, Preview, Development (select all)
```

#### Variable 4: SUPABASE_URL (if not already added)
```
Name: SUPABASE_URL
Value: https://qqmagqwumjipdqvxbiqu.supabase.co
Environment: Production, Preview, Development (select all)
```

#### Variable 5: SUPABASE_ANON_KEY (if not already added)
```
Name: SUPABASE_ANON_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxbWFncXd1bWppcGRxdnhiaXF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUwMDEwMTIsImV4cCI6MjA2MDU3NzAxMn0.Ho8DYLWpX_vQ6syrI2zkU3G5pnNTdnYpgtpyjjGYlDA
Environment: Production, Preview, Development (select all)
```

### 3. Redeploy Your Application

After adding all environment variables:

1. Go to **Deployments** tab in Vercel
2. Click on the **three dots (...)** next to the latest deployment
3. Click **Redeploy**
4. Wait for deployment to complete (usually 2-3 minutes)

### 4. Test Email Notifications

After redeployment:

1. Go to your production site: https://jetsetterss.com
2. Submit a test inquiry
3. Check `jetsetters721@gmail.com` inbox (and spam folder)
4. You should receive:
   - Customer confirmation email
   - Admin notification email

## 🔧 Alternative: Use Vercel CLI

If you prefer using the command line:

```bash
# Install Vercel CLI (if not already installed)
npm i -g vercel

# Login to Vercel
vercel login

# Add environment variables
vercel env add RESEND_API_KEY
# When prompted, paste: re_TP1fp7vH_4f8dHUoKyLDGwzjZ9iTcrnki
# Select: Production, Preview, Development

vercel env add ADMIN_EMAIL
# When prompted, paste: jetsetters721@gmail.com
# Select: Production, Preview, Development

vercel env add FRONTEND_URL
# When prompted, paste: https://jetsetterss.com
# Select: Production, Preview, Development

# Redeploy
vercel --prod
```

## 📊 Verification Checklist

After setup, verify:

- [ ] All 5 environment variables added to Vercel
- [ ] Application redeployed successfully
- [ ] Test inquiry submitted on production
- [ ] Customer email received at jetsetters721@gmail.com
- [ ] Admin email received at jetsetters721@gmail.com
- [ ] Check Resend dashboard: https://resend.com/logs

## 🎯 Important Notes

### About Admin Email:

**Current Setup:**
- Your `.env` has: `ADMIN_EMAIL=sahi0045@hotmail.com`
- But Resend free tier can only send to: `jetsetters721@gmail.com`

**Options:**

1. **Option A (Quick Fix):** Use `jetsetters721@gmail.com` as admin email
   - Both customer and admin emails go to same inbox
   - Works immediately with free tier
   - Good for testing

2. **Option B (Production):** Verify your domain on Resend
   - Go to https://resend.com/domains
   - Add and verify `jetsetterss.com`
   - Then you can send to ANY email address
   - Update sender from `onboarding@resend.dev` to `noreply@jetsetterss.com`
   - Can use `sahi0045@hotmail.com` as admin email

### About Resend Free Tier:

**Limitations:**
- Can only send to email address used to register Resend account
- 100 emails per day
- 3,000 emails per month

**To Send to Any Email:**
- Verify your domain (jetsetterss.com)
- Takes 5-10 minutes
- Free to verify
- Looks more professional

## 🚀 Next Steps

1. **Immediate (5 minutes):**
   - Add environment variables to Vercel
   - Redeploy
   - Test with jetsetters721@gmail.com

2. **For Production (15 minutes):**
   - Verify domain on Resend
   - Update sender email in code
   - Use sahi0045@hotmail.com as admin email

## 🆘 Troubleshooting

### If emails still don't work after Vercel setup:

1. **Check Vercel Logs:**
   - Go to Vercel Dashboard → Deployments
   - Click on latest deployment
   - Click "Functions" tab
   - Look for `/api/inquiries` logs
   - Check for email-related errors

2. **Check Resend Dashboard:**
   - Visit: https://resend.com/logs
   - Look for API requests
   - Check for errors

3. **Test Locally First:**
   ```bash
   PORT=5006 node test-email-notifications.js
   ```
   - If this works, issue is Vercel configuration
   - If this fails, issue is code/API key

4. **Verify Environment Variables:**
   ```bash
   # In Vercel dashboard, check that variables are set
   # Or use Vercel CLI:
   vercel env ls
   ```

## 📞 Support

If you still have issues:
1. Check Vercel deployment logs
2. Check Resend dashboard logs
3. Review `EMAIL_NOTIFICATIONS_SETUP.md`
4. Verify all environment variables are set correctly

---

**Last Updated:** November 2025  
**Status:** Ready for Production Setup
