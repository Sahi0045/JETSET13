# Google Authentication Test Page Setup Guide

## Overview
A test page has been created at `/google-auth-test` to verify Google OAuth integration with Supabase.

## Files Created

1. **frontend/lib/supabaseClient.js** - Supabase client configuration
2. **frontend/components/GoogleAuthTest.jsx** - Test page component
3. **frontend/App.jsx** - Updated with new route

## Setup Instructions

### Step 1: Configure Google OAuth in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth 2.0 Client ID**
5. Configure the OAuth consent screen if not already done:
   - User Type: External
   - App name: JETSET13
   - User support email: Your email
   - Developer contact: Your email
6. Create OAuth 2.0 Client ID:
   - Application type: **Web application**
   - Name: JETSET13 Web Client
   - Authorized JavaScript origins:
     ```
     http://localhost:5173
     http://localhost:3000
     https://your-production-domain.com
     ```
   - Authorized redirect URIs:
     ```
     https://qqmagqwumjipdqvxbiqu.supabase.co/auth/v1/callback
     http://localhost:5173/google-auth-test
     http://localhost:3000/google-auth-test
     https://your-production-domain.com/google-auth-test
     ```
7. Save and copy the **Client ID** and **Client Secret**

### Step 2: Enable Google Provider in Supabase

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: `qqmagqwumjipdqvxbiqu`
3. Navigate to **Authentication** → **Providers**
4. Find **Google** in the list
5. Toggle **Enable Sign in with Google**
6. Enter your Google OAuth credentials:
   - **Client ID**: Paste from Google Cloud Console
   - **Client Secret**: Paste from Google Cloud Console
7. Configure additional settings (optional):
   - Skip nonce check: Leave unchecked
   - Authorized Client IDs: Leave empty unless needed
8. Click **Save**

### Step 3: Configure Redirect URLs

In Supabase Dashboard:
1. Go to **Authentication** → **URL Configuration**
2. Add the following Site URLs:
   ```
   http://localhost:5173
   http://localhost:3000
   https://your-production-domain.com
   ```
3. Add Redirect URLs:
   ```
   http://localhost:5173/**
   http://localhost:3000/**
   https://your-production-domain.com/**
   ```
4. Click **Save**

### Step 4: Test the Integration

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Navigate to the test page:
   ```
   http://localhost:5173/google-auth-test
   ```

3. Click **"Sign in with Google"** button

4. Complete the Google OAuth flow

5. Verify the user information is displayed correctly

## Expected Behavior

### Before Authentication:
- Shows a "Sign in with Google" button
- Displays setup instructions
- Clean, centered UI with Bootstrap styling

### After Authentication:
- Shows success message
- Displays user information:
  - Email
  - User ID
  - Provider (google)
  - Full name (if available)
  - Avatar (if available)
- Shows complete session details in JSON format
- Provides "Sign Out" button

### On Sign Out:
- Clears session
- Returns to initial state
- Shows "Sign in with Google" button again

## Features Included

✅ **Google OAuth Integration** - Complete OAuth flow with Supabase
✅ **Session Management** - Automatic session persistence and refresh
✅ **User Profile Display** - Shows user info from Google
✅ **Error Handling** - Displays errors with dismissible alerts
✅ **Loading States** - Spinner during authentication
✅ **Responsive Design** - Mobile-friendly Bootstrap layout
✅ **Security** - Uses Supabase security best practices
✅ **Session Monitoring** - Real-time auth state changes

## Troubleshooting

### Error: "Invalid redirect URI"
- Make sure all redirect URIs are added to Google Cloud Console
- Check that the Supabase callback URL is correct

### Error: "Provider not enabled"
- Verify Google provider is enabled in Supabase Dashboard
- Check that Client ID and Secret are entered correctly

### User not appearing after sign-in:
- Check browser console for errors
- Verify Supabase client configuration
- Ensure redirect URL matches configuration

### Session not persisting:
- Check browser storage is enabled
- Verify `persistSession: true` in supabaseClient.js
- Clear browser cache and try again

## Testing Checklist

- [ ] Google Cloud Console project created
- [ ] OAuth 2.0 Client ID created
- [ ] Authorized redirect URIs added
- [ ] Google provider enabled in Supabase
- [ ] Client ID and Secret added to Supabase
- [ ] Site URLs configured in Supabase
- [ ] Development server running
- [ ] Can access /google-auth-test page
- [ ] Can click "Sign in with Google"
- [ ] OAuth popup appears
- [ ] Can complete Google sign-in
- [ ] User info displays correctly
- [ ] Can sign out successfully

## Additional Notes

- The test page uses Bootstrap for styling
- React Icons (FaGoogle, etc.) are used for icons
- Session data is stored in browser localStorage
- The page handles URL redirects automatically
- Auth state changes are monitored in real-time

## Next Steps

After successful testing:
1. Integrate Google auth into your main application
2. Add user profile pages
3. Implement role-based access control
4. Add more OAuth providers (Facebook, GitHub, etc.)
5. Customize the UI to match your branding

## Support

If you encounter issues:
1. Check the browser console for errors
2. Verify all environment variables
3. Review Supabase logs in Dashboard
4. Check Google Cloud Console API usage
5. Ensure all URLs are correctly configured

## Security Reminders

⚠️ **Important Security Notes:**
- Never commit OAuth secrets to version control
- Use environment variables for production
- Regularly rotate OAuth credentials
- Monitor OAuth usage in Google Cloud Console
- Enable 2FA for admin accounts
- Review Supabase Row Level Security policies

---

**Created:** November 7, 2024
**Status:** Ready for Testing
**Route:** `/google-auth-test`
