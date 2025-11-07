# Google Auth Test - Quick Start Guide

## 🚀 Quick Setup (5 Minutes)

### 1. Google Cloud Console
```
1. Go to: console.cloud.google.com
2. Create OAuth 2.0 Client ID
3. Add redirect URI: https://qqmagqwumjipdqvxbiqu.supabase.co/auth/v1/callback
4. Copy: Client ID & Client Secret
```

### 2. Supabase Dashboard
```
1. Go to: supabase.com/dashboard
2. Authentication → Providers → Google
3. Enable Google
4. Paste: Client ID & Client Secret
5. Save
```

### 3. Test It
```bash
# Start dev server
npm run dev

# Open browser to:
http://localhost:5173/google-auth-test

# Click "Sign in with Google"
```

## 🔗 Important URLs

**Supabase Callback URL** (Add to Google Console):
```
https://qqmagqwumjipdqvxbiqu.supabase.co/auth/v1/callback
```

**Test Page:**
```
http://localhost:5173/google-auth-test
```

**Your Supabase Project:**
```
https://supabase.com/dashboard/project/qqmagqwumjipdqvxbiqu
```

## ✅ What's Included

- ✅ Complete Google OAuth flow
- ✅ User profile display
- ✅ Session management
- ✅ Sign out functionality
- ✅ Error handling
- ✅ Beautiful Bootstrap UI

## 📁 Files Created

```
frontend/
├── lib/
│   └── supabaseClient.js          # Supabase configuration
├── components/
│   └── GoogleAuthTest.jsx         # Test page component
└── App.jsx                        # Updated with route
```

## 🎯 Test Page Route

```javascript
Route: /google-auth-test
Component: GoogleAuthTest
```

## 🔧 Required Redirect URIs in Google Console

```
Production:
https://qqmagqwumjipdqvxbiqu.supabase.co/auth/v1/callback

Development:
http://localhost:5173/google-auth-test
http://localhost:3000/google-auth-test
```

## 📝 Common Issues

**"Invalid redirect URI"**
→ Add all redirect URIs to Google Cloud Console

**"Provider not enabled"**
→ Enable Google in Supabase Dashboard

**"Unauthorized domain"**
→ Add domain to Google OAuth consent screen

## 🎨 Features

- Modern, responsive UI
- Real-time auth state monitoring
- Automatic session persistence
- Detailed user information display
- Complete session JSON view
- Loading indicators
- Error messages

## 📱 What You'll See

**Before Login:**
- Sign in button
- Setup instructions

**After Login:**
- ✓ Success message
- User email
- User ID
- Profile picture
- Full session details
- Sign out button

## 🚦 Ready to Test?

1. ✅ Files are created
2. ⏳ Configure Google OAuth
3. ⏳ Enable in Supabase
4. ⏳ Run dev server
5. ⏳ Test authentication

---

Need help? Check `GOOGLE_AUTH_SETUP_GUIDE.md` for detailed instructions!
