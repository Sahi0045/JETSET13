# Firebase Vercel Domain Authorization Fix

## Issue
Firebase Google authentication is failing with error: `auth/unauthorized-domain`

**Current Vercel URL:** `prod-pbnfdvvmz-shubhams-projects-4a867368.vercel.app`

## Solution Steps

### 1. Add Domain to Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `jets-1b5fa`
3. Navigate to **Authentication** → **Settings** → **Authorized domains**
4. Click **Add domain**
5. Add: `prod-pbnfdvvmz-shubhams-projects-4a867368.vercel.app`
6. Click **Done**

### 2. Update Google Cloud Console (if needed)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select project: `jets-1b5fa`
3. Navigate to **APIs & Services** → **Credentials**
4. Find your OAuth 2.0 client ID
5. Add to **Authorized JavaScript origins**:
   - `https://prod-pbnfdvvmz-shubhams-projects-4a867368.vercel.app`
6. Add to **Authorized redirect URIs**:
   - `https://prod-pbnfdvvmz-shubhams-projects-4a867368.vercel.app/__/auth/handler`

### 3. Test the Fix
1. Visit: https://prod-pbnfdvvmz-shubhams-projects-4a867368.vercel.app/firebase-login
2. Try Google Sign-In
3. Should work without errors

## Current Status
- ✅ Application deployed successfully
- ✅ Firebase authentication working for email/password
- ❌ Google OAuth needs domain authorization
- ✅ All other features working

## Deployment Info
- **Live URL:** https://prod-pbnfdvvmz-shubhams-projects-4a867368.vercel.app
- **Inspect URL:** https://vercel.com/shubhams-projects-4a867368/prod/HYCiLS6736dzVuCgxcMNidTL6DWG
- **Deployment Status:** ✅ Success

## Test URLs
- **Homepage:** https://prod-pbnfdvvmz-shubhams-projects-4a867368.vercel.app/
- **Firebase Login:** https://prod-pbnfdvvmz-shubhams-projects-4a867368.vercel.app/firebase-login
- **Firebase Signup:** https://prod-pbnfdvvmz-shubhams-projects-4a867368.vercel.app/firebase-signup
- **Profile Dashboard:** https://prod-pbnfdvvmz-shubhams-projects-4a867368.vercel.app/firebase-profile

## Notes
- Email/password authentication should work immediately
- Google OAuth requires the domain authorization steps above
- All other features (flights, hotels, cruises) should work normally 