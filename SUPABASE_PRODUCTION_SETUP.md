# 🚀 Supabase Production Setup - CRITICAL

## ⚠️ THE MAIN ISSUE

Your OAuth is redirecting to `localhost:3000` instead of `www.jetsetterss.com` because Supabase doesn't know about your production domain.

---

## ✅ STEP-BY-STEP FIX

### **1. Configure Supabase Site URL**

1. Go to: https://supabase.com/dashboard/project/qqmagqwumjipdqvxbiqu
2. Navigate to: **Settings** → **General**
3. Under "General Settings", find **Site URL**
4. Change it from: `http://localhost:3000`
5. Change it to: `https://www.jetsetterss.com`
6. Click **Save**

---

### **2. Configure Redirect URLs**

1. Still in: https://supabase.com/dashboard/project/qqmagqwumjipdqvxbiqu
2. Navigate to: **Authentication** → **URL Configuration**
3. Under "Redirect URLs", add these **EXACT** URLs:

```
https://www.jetsetterss.com/*
https://www.jetsetterss.com/auth/callback
https://www.jetsetterss.com/my-trips
http://localhost:3000/*
http://localhost:3000/auth/callback
http://localhost:5173/*
http://localhost:5173/auth/callback
```

4. Click **Save**

---

### **3. Verify Google OAuth Console (Already Done)**

Your Google OAuth should have:

**Authorized JavaScript origins:**
```
https://www.jetsetterss.com
https://qqmagqwumjipdqvxbiqu.supabase.co
http://localhost:5173
http://localhost:3000
```

**Authorized redirect URIs:**
```
https://qqmagqwumjipdqvxbiqu.supabase.co/auth/v1/callback
https://www.jetsetterss.com/auth/callback
http://localhost:5173/auth/callback
http://localhost:3000/auth/callback
```

✅ **You've already configured this based on my previous guide**

---

## 🔍 HOW THE FLOW WORKS NOW

### **Before Fix** (Current Issue):
```
1. User clicks "Sign in with Google" on www.jetsetterss.com
2. Google OAuth starts
3. User authorizes
4. Supabase redirects to: http://localhost:3000/#access_token=...
   ❌ WRONG! This is the problem!
```

### **After Fix** (Once you update Supabase):
```
1. User clicks "Sign in with Google" on www.jetsetterss.com
2. Google OAuth starts
3. User authorizes
4. Supabase redirects to: https://www.jetsetterss.com/auth/callback#access_token=...
   ✅ CORRECT! This goes to your AuthCallback component
5. AuthCallback processes the tokens
6. User is logged in and redirected to /my-trips
```

---

## 🧪 TESTING AFTER CONFIGURATION

### **Test on Production:**

1. Make sure you've updated Supabase Site URL to `https://www.jetsetterss.com`
2. Wait 2-3 minutes for changes to propagate
3. Go to: `https://www.jetsetterss.com/supabase-login`
4. Click "Continue with Google"
5. Authorize the app
6. You should be redirected back to `https://www.jetsetterss.com/auth/callback`
7. The AuthCallback component will process the tokens
8. You'll be redirected to `/my-trips`
9. ✅ Success!

---

## 📝 WHAT THE CODE FIX DOES

I updated `/resources/js/Pages/AuthCallback.jsx` to:

1. **Handle hash-based tokens** (what Supabase is currently sending):
   ```javascript
   // Parse tokens from URL hash
   const hashParams = new URLSearchParams(location.hash.substring(1));
   const access_token = hashParams.get('access_token');
   const refresh_token = hashParams.get('refresh_token');
   ```

2. **Set the session** with those tokens:
   ```javascript
   await supabase.auth.setSession({
     access_token,
     refresh_token
   });
   ```

3. **Store user data** in localStorage:
   ```javascript
   localStorage.setItem('isAuthenticated', 'true');
   localStorage.setItem('user', JSON.stringify({...}));
   localStorage.setItem('supabase_token', access_token);
   ```

4. **Clean the URL** to remove sensitive tokens:
   ```javascript
   window.history.replaceState({}, document.title, window.location.pathname);
   ```

5. **Redirect to intended page**:
   ```javascript
   navigate('/my-trips', { replace: true });
   ```

---

## 🐛 WHY LOCALHOST WAS IN THE URL

The URL you showed me:
```
http://localhost:3000/#access_token=eyJ...
```

This happened because:
1. Supabase's "Site URL" setting was set to `http://localhost:3000`
2. When OAuth completes, Supabase redirects to the "Site URL"
3. Since it was localhost, that's where it went

**Fix:** Change Supabase Site URL to `https://www.jetsetterss.com`

---

## ⚡ QUICK CHECKLIST

Use this to verify everything is configured:

### Supabase Dashboard
- [ ] Site URL set to: `https://www.jetsetterss.com`
- [ ] Redirect URLs include: `https://www.jetsetterss.com/*`
- [ ] Redirect URLs include: `https://www.jetsetterss.com/auth/callback`
- [ ] Google OAuth provider is enabled
- [ ] Google Client ID is configured
- [ ] Google Client Secret is configured

### Google Cloud Console
- [ ] Authorized JavaScript Origins include Supabase URL
- [ ] Authorized Redirect URIs include Supabase callback
- [ ] Authorized Redirect URIs include your domain callback
- [ ] OAuth consent screen is configured
- [ ] App status is "Published" or "In Production"

### Code
- [ ] AuthCallback.jsx handles hash-based tokens ✅ (Already fixed)
- [ ] SupabaseAuthContext auto-detects domain ✅ (Already fixed)
- [ ] Routes include /auth/callback ✅ (Already fixed)

---

## 🔒 SECURITY NOTES

1. **Token in URL Hash:** The tokens appear in the URL hash temporarily, but:
   - The AuthCallback component immediately processes them
   - Cleans the URL using `window.history.replaceState`
   - Stores them securely in localStorage
   - Tokens are not sent to server (hash fragments stay client-side)

2. **HTTPS Required:** Always use HTTPS in production for OAuth

3. **Redirect URL Validation:** Only authorized URLs can receive tokens

---

## 📞 SUPPORT LINKS

- **Your Supabase Project:** https://supabase.com/dashboard/project/qqmagqwumjipdqvxbiqu
- **Supabase Auth Settings:** https://supabase.com/dashboard/project/qqmagqwumjipdqvxbiqu/auth/url-configuration
- **Google Cloud Console:** https://console.cloud.google.com/apis/credentials
- **Supabase Docs:** https://supabase.com/docs/guides/auth/social-login/auth-google

---

## ✅ SUMMARY

### What You Need to Do:
1. Go to Supabase Dashboard
2. Change Site URL to `https://www.jetsetterss.com`
3. Add production redirect URLs
4. Wait 2-3 minutes
5. Test on your production domain

### What I Already Fixed:
1. ✅ AuthCallback component handles hash-based tokens
2. ✅ Processes both implicit and PKCE flows
3. ✅ Cleans URL after processing
4. ✅ Stores user data in localStorage
5. ✅ Redirects to intended destination

---

## 🎉 FINAL RESULT

After completing the setup:
- ✅ Users can sign in with Google on `www.jetsetterss.com`
- ✅ OAuth redirects to your domain (not localhost)
- ✅ Tokens are processed securely
- ✅ Users are logged in automatically
- ✅ Everything works in production!

---

**Last Updated:** November 7, 2024  
**Status:** ⚠️ Requires Supabase Dashboard Configuration  
**ETA:** 5 minutes to configure + 2-3 minutes propagation
