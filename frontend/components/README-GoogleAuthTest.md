# Google Auth Test Component

## Quick Access

**Route:** `/google-auth-test`  
**Component:** `GoogleAuthTest.jsx`  
**Client:** `../lib/supabaseClient.js`

## What This Does

Tests Google OAuth authentication using Supabase. Displays user info after successful login.

## Required Setup

1. **Google Cloud Console:**
   - Create OAuth 2.0 Client ID
   - Add callback: `https://qqmagqwumjipdqvxbiqu.supabase.co/auth/v1/callback`

2. **Supabase Dashboard:**
   - Enable Google provider
   - Add Client ID & Secret

3. **Test:**
   - Run: `npm run dev`
   - Visit: `http://localhost:5173/google-auth-test`

## Features

- Sign in with Google
- Display user profile
- Show session data
- Sign out functionality
- Error handling
- Loading states

## Dependencies

- `@supabase/supabase-js` ✅ Installed
- `react-bootstrap` ✅ Installed
- `react-icons` ✅ Installed

## Files

```
frontend/
├── lib/
│   └── supabaseClient.js          # Supabase client config
├── components/
│   ├── GoogleAuthTest.jsx         # This component
│   └── README-GoogleAuthTest.md   # This file
└── App.jsx                        # Route definition
```

## Full Documentation

See project root:
- `GOOGLE_AUTH_SETUP_GUIDE.md` - Complete setup guide
- `GOOGLE_AUTH_QUICK_START.md` - Quick reference
- `GOOGLE_AUTH_TEST_SUMMARY.md` - Implementation summary

## Status

✅ Ready to test after Supabase configuration
