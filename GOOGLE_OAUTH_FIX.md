# 🔧 Google OAuth Authorization Error Fix

## Error: `origin_mismatch` - Access blocked: authorization error

This error occurs when your Firebase/Google Cloud project doesn't recognize `localhost` as an authorized domain for OAuth.

## 🚀 Quick Fix Steps

### **Method 1: Firebase Console (Recommended)**

1. **Go to Firebase Console**: https://console.firebase.google.com/
2. **Select Project**: `jets-1b5fa`
3. **Navigate**: Authentication → Sign-in method
4. **Click**: Google provider (pencil icon)
5. **Scroll down**: Find "Authorized domains" section
6. **Add domains**:
   ```
   localhost
   127.0.0.1
   ```
7. **Click**: Save

### **Method 2: Google Cloud Console (If Method 1 doesn't work)**

1. **Go to Google Cloud Console**: https://console.cloud.google.com/
2. **Select Project**: `jets-1b5fa`
3. **Navigate**: APIs & Services → Credentials
4. **Find**: Your OAuth 2.0 Client ID
5. **Click**: Edit (pencil icon)
6. **Add JavaScript origins**:
   ```
   http://localhost:5173
   http://127.0.0.1:5173
   http://localhost:3000
   http://localhost:5174
   ```
7. **Add Authorized redirect URIs**:
   ```
   http://localhost:5173/__/auth/handler
   https://jets-1b5fa.firebaseapp.com/__/auth/handler
   ```
8. **Click**: Save

## ✅ Verification Steps

1. **Wait 5-10 minutes** for changes to propagate
2. **Clear browser cache** and cookies
3. **Restart development server**:
   ```bash
   cd prod
   npm run dev
   ```
4. **Test Google login** at: `http://localhost:5173/firebase-login`

## 🐛 Still Having Issues?

### **Alternative: Use Email/Password Login**

While fixing Google OAuth, you can still test with email/password:

1. **Go to**: `http://localhost:5173/firebase-signup`
2. **Create account** with email/password
3. **Test login** at: `http://localhost:5173/firebase-login`

### **Check Firebase Settings**

1. **Verify Email/Password is enabled**:
   - Firebase Console → Authentication → Sign-in method
   - Email/Password should be "Enabled"

2. **Check Authorized Domains**:
   - Firebase Console → Authentication → Settings
   - Authorized domains should include "localhost"

## 🔍 Debug Information

### **Current Configuration**
- **Project ID**: `jets-1b5fa`
- **Auth Domain**: `jets-1b5fa.firebaseapp.com`
- **Development URL**: `http://localhost:5173`

### **Common Issues**

1. **Browser blocking popups**: Allow popups for localhost
2. **Cache issues**: Clear browser cache and cookies
3. **Multiple Google accounts**: Try incognito mode
4. **Network issues**: Check firewall/proxy settings

### **Test Without Google OAuth**

If Google OAuth continues to have issues, you can temporarily disable it and use email/password:

1. **In Firebase Console**: Authentication → Sign-in method
2. **Disable Google temporarily**
3. **Use Email/Password for testing**
4. **Re-enable Google after fixing**

## 📱 Production Deployment

When deploying to production, add your production domain:

**Firebase Console**:
- Authentication → Settings → Authorized domains
- Add: `your-domain.com`

**Google Cloud Console**:
- APIs & Services → Credentials → OAuth 2.0 Client ID
- Add: `https://your-domain.com`
- Add: `https://your-domain.com/__/auth/handler`

## 🎯 Quick Test

```bash
# 1. Start development server
cd prod
npm run dev

# 2. Open browser
http://localhost:5173

# 3. Test Firebase auth status component
# Should show "❌ Not Authenticated"

# 4. Try email/password signup first
http://localhost:5173/firebase-signup

# 5. Then try Google login
http://localhost:5173/firebase-login
```

---

**Need more help?** 
- Check Firebase Console for error logs
- Look at browser console for detailed error messages
- Try the email/password method while fixing Google OAuth 