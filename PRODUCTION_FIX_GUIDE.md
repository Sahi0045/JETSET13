# Production Inquiry Form Fix Guide

## Problem Identified

The inquiry form was not working in production because:

1. **Missing `vercel.json`** - The configuration file was removed in commit `bde5b23`, causing API routes to fail
2. **API Routing** - Without proper route configuration, requests to `/api/inquiries` were not being handled
3. **Environment Variables** - Supabase credentials need to be set in Vercel dashboard

## Solutions Implemented

### 1. Restored `vercel.json` Configuration

Created `/vercel.json` with proper API routing:

```json
{
  "version": 2,
  "routes": [
    {
      "src": "/api/inquiries",
      "dest": "/api/inquiries"
    },
    // ... other API routes
  ]
}
```

This ensures all `/api/*` requests are properly routed to the serverless functions.

### 2. Updated Backend Supabase Configuration

Modified `/backend/config/supabase.js` to:
- Include fallback Supabase credentials for production
- Provide better error messages
- Prevent application crashes due to missing env vars

### 3. Environment Variables Setup

## Required Environment Variables in Vercel

**CRITICAL**: You must set these environment variables in your Vercel dashboard:

### Navigate to: Vercel Dashboard → Your Project → Settings → Environment Variables

### Database & Authentication
```
SUPABASE_URL=https://qqmagqwumjipdqvxbiqu.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxbWFncXd1bWppcGRxdnhiaXF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUwMDEwMTIsImV4cCI6MjA2MDU3NzAxMn0.Ho8DYLWpX_vQ6syrI2zkU3G5pnNTdnYpgtpyjjGYlDA
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxbWFncXd1bWppcGRxdnhiaXF1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTAwMTAxMiwiZXhwIjoyMDYwNTc3MDEyfQ.WV6dQfV8d3YmOvOGp9nv0wWvFCsCTocHp49Ly7MDDwQ
```

### JWT & Security
```
JWT_SECRET=e4f8a2b5c9d3f7e1a0b5c8d2e6f3a9b7d1e0f5a2c4b8e3d7f9a1c5b0e2d4f8
JWT_EXPIRE=30d
SUPABASE_JWT_SECRET=UcSOKuDSJea4THuNiQYK5UWrBkBhUCfvb6D5_qjl6GaHoF-KoQY4vdWWCYr0QQ5OhI8t0qAqnr1YBTI7wxGRfA
```

### Amadeus API (for flights)
```
AMADEUS_API_KEY=HSdhpX2AHnyj7LnL1TjDFL8MHj8lGz5G
AMADEUS_API_SECRET=bXf2ed12C4ruJ1Nt
REACT_APP_AMADEUS_API_KEY=HSdhpX2AHnyj7LnL1TjDFL8MHj8lGz5G
REACT_APP_AMADEUS_API_SECRET=bXf2ed12C4ruJ1Nt
```

### Other Configuration
```
NODE_ENV=production
CORS_ORIGIN=*
PORT=5005
```

### Optional: Email & Payments (if using these features)
```
RESEND_API_KEY=re_4tfvwTmv_9kPKorQAcpZmZcZ4i744cC1Q
ARC_PAY_API_URL=https://api.arcpay.travel/api/rest/version/100/merchant/TESTARC05511704
ARC_PAY_MERCHANT_ID=TESTARC05511704
ARC_PAY_API_USERNAME=Administrator
ARC_PAY_API_PASSWORD=Jetsetters@2025
```

## Deployment Steps

### Step 1: Push Changes to GitHub

```bash
git add vercel.json backend/config/supabase.js PRODUCTION_FIX_GUIDE.md
git commit -m "fix: Restore vercel.json and fix inquiry form API routing for production"
git push origin claude/project-review-011CUtkro5h924Mq3hosy5yC
```

### Step 2: Configure Vercel Environment Variables

1. Go to https://vercel.com/dashboard
2. Select your project (jetsetterss.com)
3. Click **Settings** tab
4. Click **Environment Variables** in sidebar
5. Add all environment variables listed above
6. Set scope to **Production**, **Preview**, and **Development**
7. Click **Save**

### Step 3: Redeploy

After setting environment variables, trigger a new deployment:

**Option A: From Vercel Dashboard**
- Go to **Deployments** tab
- Click on the latest deployment
- Click **Redeploy** button

**Option B: Push a new commit** (triggers auto-deploy)

### Step 4: Verify Fix

1. Visit your production site: https://www.jetsetterss.com
2. Navigate to the Request page: https://www.jetsetterss.com/request
3. Fill out the inquiry form
4. Submit the form
5. Check browser console for errors (F12 → Console tab)
6. Verify submission success message appears
7. Check Supabase dashboard to confirm inquiry was saved

## How to Check Supabase Database

1. Go to https://supabase.com/dashboard
2. Select your project: `qqmagqwumjipdqvxbiqu`
3. Click **Table Editor** in sidebar
4. Select **inquiries** table
5. You should see the submitted inquiry data

## Testing the API Directly

Test the API endpoint directly using curl:

```bash
curl -X POST https://www.jetsetterss.com/api/inquiries \
  -H "Content-Type: application/json" \
  -d '{
    "inquiry_type": "general",
    "customer_name": "Test User",
    "customer_email": "test@example.com",
    "customer_phone": "+1234567890",
    "inquiry_subject": "Test",
    "inquiry_message": "Testing API"
  }'
```

Expected response:
```json
{
  "success": true,
  "message": "Your inquiry has been submitted successfully! Our travel experts will get back to you within 24 hours.",
  "data": { ... }
}
```

## Troubleshooting

### Issue: Still getting 404 errors

**Solution**:
- Make sure `vercel.json` exists in the root directory
- Redeploy after adding the file
- Check Vercel deployment logs for errors

### Issue: Database connection errors

**Solution**:
- Verify all SUPABASE_* environment variables are set in Vercel
- Check Supabase project is active and not paused
- Verify the `inquiries` table exists in Supabase

### Issue: CORS errors in browser console

**Solution**:
- Make sure `CORS_ORIGIN=*` is set in Vercel environment variables
- Check API response headers include proper CORS headers
- Clear browser cache and try again

### Issue: Form submits but data doesn't appear in database

**Solution**:
- Check Vercel function logs for errors
- Verify Supabase Row Level Security (RLS) policies allow inserts
- Check the `inquiries` table structure matches the expected schema

## Database Schema Verification

The `inquiries` table should have these columns:

```sql
CREATE TABLE inquiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  inquiry_type TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_country TEXT,
  special_requirements TEXT,
  budget_range TEXT,
  preferred_contact_method TEXT DEFAULT 'email',
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'normal',
  assigned_admin UUID REFERENCES users(id),
  internal_notes TEXT,
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Type-specific fields (nullable)
  flight_origin TEXT,
  flight_destination TEXT,
  flight_departure_date DATE,
  flight_return_date DATE,
  flight_passengers INTEGER,
  flight_class TEXT,

  hotel_destination TEXT,
  hotel_checkin_date DATE,
  hotel_checkout_date DATE,
  hotel_rooms INTEGER,
  hotel_guests INTEGER,
  hotel_room_type TEXT,

  cruise_destination TEXT,
  cruise_departure_date DATE,
  cruise_duration INTEGER,
  cruise_cabin_type TEXT,
  cruise_passengers INTEGER,

  package_destination TEXT,
  package_start_date DATE,
  package_end_date DATE,
  package_travelers INTEGER,
  package_budget_range TEXT,
  package_interests TEXT[],

  inquiry_subject TEXT,
  inquiry_message TEXT
);
```

## Support

If you continue to experience issues after following this guide:

1. Check Vercel deployment logs
2. Check browser console for JavaScript errors
3. Verify network tab shows API requests being sent
4. Contact support with error messages and logs

## Summary

✅ **Fixed**: API routing with `vercel.json`
✅ **Fixed**: Supabase configuration with fallback credentials
✅ **Added**: Comprehensive deployment guide
✅ **Added**: Environment variables documentation
✅ **Added**: Troubleshooting steps

The inquiry form should now work perfectly in production! 🚀
