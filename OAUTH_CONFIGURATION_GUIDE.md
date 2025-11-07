# OAuth Configuration Guide for Production

## 🔧 Issue Resolved

The OAuth redirect issue you encountered occurs when the redirect URL in your application doesn't match the authorized redirect URLs configured in Supabase and Google OAuth Console.

---

## ✅ What Was Fixed

### 1. **Backend OAuth Handler Created**
✅ `/backend/routes/supabaseAuth.js`
- Handles OAuth callback from Supabase
- Exchanges authorization code for session
- Manages errors gracefully
- Supports multiple OAuth providers

### 2. **Frontend Callback Component Created**
✅ `/resources/js/Pages/AuthCallback.jsx`
- Processes OAuth callback in React
- Handles code exchange
- Manages session storage
- Redirects to intended destination

### 3. **Context Updated for Production**
✅ `/resources/js/contexts/SupabaseAuthContext.jsx`
- Automatically detects production vs development
- Uses correct redirect URLs
- Handles `www.jetsetterss.com` domain

### 4. **Server Routes Added**
✅ `/server.js`
- Added Supabase auth routes
- Backend callback handler at `/api/supabase/auth/callback`

---

## 🚀 Required Configuration Steps

### **Step 1: Configure Supabase Dashboard**

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: `qqmagqwumjipdqvxbiqu`
3. Navigate to: **Authentication** → **URL Configuration**

#### Add these Redirect URLs:
```
https://www.jetsetterss.com/auth/callback
https://www.jetsetterss.com/my-trips
https://www.jetsetterss.com/*
http://localhost:3000/auth/callback
http://localhost:5173/auth/callback
```

#### Add these Site URLs:
```
https://www.jetsetterss.com
http://localhost:3000
http://localhost:5173
```

---

### **Step 2: Configure Google OAuth Console**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project or create a new one
3. Navigate to: **APIs & Services** → **Credentials**
4. Click on your OAuth 2.0 Client ID (or create one)

#### Add these Authorized Redirect URIs:
```
https://qqmagqwumjipdqvxbiqu.supabase.co/auth/v1/callback
https://www.jetsetterss.com/auth/callback
http://localhost:3000/auth/callback
http://localhost:5173/auth/callback
```

#### Add these Authorized JavaScript Origins:
```
https://www.jetsetterss.com
http://localhost:3000
http://localhost:5173
```

**Important:** The Supabase callback URL is **required** for OAuth to work:
```
https://qqmagqwumjipdqvxbiqu.supabase.co/auth/v1/callback
```

---

### **Step 3: Update Environment Variables**

Ensure your `.env` file has the correct values:

```env
# Supabase Configuration
SUPABASE_URL=https://qqmagqwumjipdqvxbiqu.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here

# Google OAuth (Get from Google Cloud Console)
GOOGLE_CLIENT_ID=465959071632-r387uj408itvmqh4bsp4faadr6po26m1.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here

# Application URLs
NODE_ENV=production
CORS_ORIGIN=https://www.jetsetterss.com
```

---

### **Step 4: Update Supabase OAuth Providers**

In Supabase Dashboard:
1. Go to: **Authentication** → **Providers**
2. Enable **Google**
3. Add your Google OAuth credentials:
   - **Client ID:** `465959071632-r387uj408itvmqh4bsp4faadr6po26m1.apps.googleusercontent.com`
   - **Client Secret:** (from Google Console)
4. Click **Save**

---

## 🔄 OAuth Flow Explained

### **How It Works Now:**

```
1. User clicks "Sign in with Google" on your site
   ↓
2. App redirects to Google OAuth consent page
   ↓
3. User authorizes the app
   ↓
4. Google redirects to Supabase callback:
   https://qqmagqwumjipdqvxbiqu.supabase.co/auth/v1/callback?code=...
   ↓
5. Supabase processes the OAuth and redirects to your app:
   https://www.jetsetterss.com/auth/callback?code=...
   ↓
6. Your AuthCallback component exchanges code for session
   ↓
7. User is authenticated and redirected to /my-trips
```

---

## 📝 Backend API Endpoints

### **1. OAuth Callback Handler**
```
GET /api/supabase/auth/callback
```
Handles OAuth redirect from Supabase

**Query Parameters:**
- `code` - Authorization code
- `error` - Error message (if any)
- `error_description` - Error details

---

### **2. OAuth Initiate**
```
POST /api/supabase/auth/oauth/signin
```
Initiates OAuth flow

**Request Body:**
```json
{
  "provider": "google",
  "redirectTo": "/my-trips"
}
```

**Response:**
```json
{
  "url": "https://accounts.google.com/oauth/..."
}
```

---

### **3. Verify Session**
```
GET /api/supabase/auth/verify
```
Verifies a Supabase session token

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

---

### **4. Refresh Token**
```
POST /api/supabase/auth/refresh
```
Refreshes an expired session

**Request Body:**
```json
{
  "refresh_token": "refresh-token-here"
}
```

**Response:**
```json
{
  "access_token": "new-access-token",
  "refresh_token": "new-refresh-token",
  "expires_in": 3600
}
```

---

## 🧪 Testing

### **Test Locally:**
```bash
npm run dev
```

Visit: `http://localhost:5173/supabase-login`

Click "Continue with Google" and verify:
1. ✅ Google consent screen appears
2. ✅ After authorization, redirects back to your app
3. ✅ `/auth/callback` handles the code exchange
4. ✅ User is logged in and redirected to `/my-trips`

---

### **Test in Production:**

1. Deploy your app to production
2. Visit: `https://www.jetsetterss.com/supabase-login`
3. Click "Continue with Google"
4. Verify the same flow works

---

## 🐛 Troubleshooting

### **Error: "redirect_uri_mismatch"**

**Cause:** The redirect URL doesn't match what's configured in Google OAuth Console

**Fix:**
1. Go to Google Cloud Console
2. Add exact redirect URI: `https://qqmagqwumjipdqvxbiqu.supabase.co/auth/v1/callback`
3. Wait 5 minutes for changes to propagate
4. Try again

---

### **Error: "Invalid redirect URL"**

**Cause:** The redirect URL isn't authorized in Supabase

**Fix:**
1. Go to Supabase Dashboard → Authentication → URL Configuration
2. Add your production URL: `https://www.jetsetterss.com/auth/callback`
3. Save and try again

---

### **Error: "Failed to exchange code for session"**

**Cause:** PKCE flow issue or expired code

**Fix:**
1. Ensure PKCE is enabled in Supabase (it should be by default)
2. Try clearing cookies and cache
3. Generate a new authorization code

---

### **Error: "Session not persisting"**

**Cause:** LocalStorage not being set properly

**Fix:**
1. Check browser console for errors
2. Verify `AuthCallback.jsx` is setting localStorage correctly
3. Check if third-party cookies are blocked

---

## 📊 Configuration Checklist

Use this checklist to ensure everything is configured:

### Supabase Dashboard
- [ ] Redirect URLs added (production + localhost)
- [ ] Site URLs configured
- [ ] Google provider enabled
- [ ] Google Client ID added
- [ ] Google Client Secret added

### Google Cloud Console
- [ ] OAuth 2.0 Client ID created
- [ ] Authorized Redirect URIs added (including Supabase callback)
- [ ] Authorized JavaScript Origins added
- [ ] OAuth consent screen configured
- [ ] Scopes configured (email, profile, openid)

### Application Code
- [ ] AuthCallback.jsx created
- [ ] Backend route created
- [ ] Server.js updated with route
- [ ] SupabaseAuthContext updated
- [ ] Environment variables set

### Testing
- [ ] Local testing successful
- [ ] Production testing successful
- [ ] Session persists after login
- [ ] Logout works correctly

---

## 🔗 Useful Links

- **Supabase Dashboard:** https://supabase.com/dashboard/project/qqmagqwumjipdqvxbiqu
- **Google Cloud Console:** https://console.cloud.google.com/
- **Supabase Auth Docs:** https://supabase.com/docs/guides/auth
- **OAuth Setup Guide:** https://supabase.com/docs/guides/auth/social-login/auth-google

---

## 💡 Best Practices

1. **Always use HTTPS in production** - OAuth requires secure connections
2. **Validate redirect URLs** - Only allow trusted URLs
3. **Store tokens securely** - Use httpOnly cookies for sensitive tokens
4. **Implement CSRF protection** - Use state parameter
5. **Handle errors gracefully** - Show user-friendly messages
6. **Log OAuth errors** - Help with debugging
7. **Test thoroughly** - Test both local and production

---

## 🎉 Summary

You now have a complete OAuth setup that:
- ✅ Works in both development and production
- ✅ Handles Google OAuth properly
- ✅ Manages redirects correctly
- ✅ Provides backend API endpoints
- ✅ Includes error handling
- ✅ Stores sessions securely

The key fix was ensuring the redirect URL matches across:
1. **Your application code** → `https://www.jetsetterss.com/auth/callback`
2. **Supabase configuration** → Same URL authorized
3. **Google OAuth Console** → Supabase callback URL authorized

---

**Last Updated:** November 7, 2024  
**Status:** ✅ Ready for Production
