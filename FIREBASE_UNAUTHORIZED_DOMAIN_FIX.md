# 🔥 Firebase Unauthorized Domain Fix Guide

## Issue
Firebase Google Sign-In error: `auth/unauthorized-domain`

## Current Configuration
- **Firebase Project:** `jets-1b5fa`
- **Auth Domain:** `jets-1b5fa.firebaseapp.com`
- **Dev URL:** `http://localhost:5173`
- **Prod URL:** `https://prod-six-phi.vercel.app`

## Solution Steps

### Step 1: Check Current Domain in Browser
When you see the error, check what domain you're actually using:
- Open browser console (F12)
- Check the URL bar - note the exact domain
- Common formats:
  - `localhost:5173` (dev)
  - `127.0.0.1:5173` (dev)
  - `your-domain.vercel.app` (production)

### Step 2: Add ALL Possible Domains to Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: `jets-1b5fa`
3. Navigate to **Authentication** → **Settings** → **Authorized domains**
4. Add ALL these domains (if not already added):

**Development:**
- `localhost`
- `127.0.0.1`
- `localhost:5173` (if needed)

**Production:**
- `prod-six-phi.vercel.app`
- Your custom domain (if any)

**Important Notes:**
- Firebase automatically includes `localhost` but sometimes you need to explicitly add `127.0.0.1`
- Port numbers usually don't matter, but add both with and without port if needed
- Wait a few minutes after adding domains for changes to propagate

### Step 3: Check Google Cloud Console OAuth Settings

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select project: `jets-1b5fa`
3. Navigate to **APIs & Services** → **Credentials**
4. Find your OAuth 2.0 Client ID (Web client)
5. Click **Edit**
6. Add to **Authorized JavaScript origins**:
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`
   - `https://prod-six-phi.vercel.app`
   - `https://your-custom-domain.com` (if any)

7. Add to **Authorized redirect URIs**:
   - `http://localhost:5173/__/auth/handler`
   - `https://prod-six-phi.vercel.app/__/auth/handler`
   - `https://your-custom-domain.com/__/auth/handler` (if any)

### Step 4: Clear Browser Cache

After making changes:
1. Clear browser cache and cookies
2. Hard refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
3. Try signing in again

### Step 5: Verify Domain Format

Make sure the domain format matches exactly:
- ✅ Correct: `localhost`, `127.0.0.1`, `prod-six-phi.vercel.app`
- ❌ Wrong: `http://localhost`, `https://localhost`, `localhost/`

### Step 6: Check Environment Variables

Verify your `.env` file has:
```env
VITE_FIREBASE_AUTH_DOMAIN=jets-1b5fa.firebaseapp.com
```

### Step 7: Restart Dev Server

After making changes:
```bash
npm run dev
```

## Quick Test

1. Open browser console
2. Check what domain appears in the error
3. Add that exact domain to Firebase Console
4. Wait 2-3 minutes
5. Clear cache and try again

## Common Issues

### Issue 1: Still Getting Error After Adding Domain
- **Solution:** Wait 5-10 minutes for Firebase to propagate changes
- Clear browser cache completely
- Try in incognito/private window

### Issue 2: Localhost Works But Production Doesn't
- **Solution:** Make sure production domain is added to Firebase
- Check Google Cloud Console OAuth settings
- Verify HTTPS is used for production

### Issue 3: Port Number in Domain
- **Solution:** Firebase usually ignores ports, but try adding both:
  - `localhost:5173`
  - `localhost`

## Debugging Commands

Check current domain in browser console:
```javascript
console.log('Current domain:', window.location.hostname);
console.log('Current origin:', window.location.origin);
```

## Contact Info
If issue persists:
- Firebase Support: https://firebase.google.com/support
- Check Firebase status: https://status.firebase.google.com/

