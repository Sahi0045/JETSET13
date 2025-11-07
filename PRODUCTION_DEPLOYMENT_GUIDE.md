# 🚀 Production Deployment Guide - Supabase Auth Fix

## 🎯 **Current Situation**

**Local:** ✅ Working perfectly  
**Production:** ❌ Shows "User not authenticated" + 404 errors

**Why?** Your production server is running old code without the Supabase authentication fixes.

---

## ⚡ **Quick Fix (5 Steps)**

### **Step 1: Add JWT Secret to Production Environment** ⭐ **CRITICAL**

1. Get JWT Secret:
   - Go to: https://supabase.com/dashboard/project/qqmagqwumjipdqvxbiqu/settings/api
   - Scroll to "JWT Settings"
   - Copy the **JWT Secret** (NOT the ANON key)

2. Add to your production environment variables:
   ```
   SUPABASE_JWT_SECRET=your-jwt-secret-here
   ```

---

### **Step 2: Build Production Bundle**

```bash
npm run build
```

This creates the `dist/` folder with your updated frontend code.

---

### **Step 3: Deploy to Production**

Choose your deployment method:

#### **Option A: Using Git (Recommended)**
```bash
git add .
git commit -m "Fix: Add Supabase authentication support"
git push origin main
```

#### **Option B: Using Vercel**
```bash
vercel --prod
```

#### **Option C: Using Netlify**
```bash
netlify deploy --prod
```

#### **Option D: Manual Upload to Server**
```bash
# Upload to your server
scp -r dist/ backend/ server.js user@yourserver:/path/to/app/

# SSH and restart
ssh user@yourserver
cd /path/to/app
pm2 restart jetset-app
```

---

### **Step 4: Restart Production Server**

Make sure your production server restarts to load the new environment variable:

```bash
# If using PM2
pm2 restart jetset-app

# If using systemd
sudo systemctl restart jetset-app

# If using Docker
docker-compose restart
```

---

### **Step 5: Test on Production**

1. Go to: https://www.jetsetterss.com/supabase-login
2. Sign in with Google
3. Open browser console (F12)
4. Should see: "✅ Supabase user detected: your-email@gmail.com"
5. Go to: https://www.jetsetterss.com/request
6. Fill out the inquiry form
7. Submit
8. Should see: "✅ User is authenticated"
9. ✅ Form submits successfully!

---

## 🔍 **Troubleshooting**

### **Problem: Still getting 404 on /api/inquiries**

**Solution:**
```bash
# 1. Check if backend is running
curl https://www.jetsetterss.com/api/health

# 2. If 404, check server logs
pm2 logs jetset-app

# 3. Make sure server.js has the route
grep "inquiryRoutes" server.js
# Should show: app.use('/api/inquiries', inquiryRoutes);
```

---

### **Problem: "User not authenticated" still shows**

**Solution:**
```bash
# 1. Hard refresh browser (clear cache)
Ctrl+Shift+R (Windows/Linux)
Cmd+Shift+R (Mac)

# 2. Check environment variable is set
# SSH into server and run:
echo $SUPABASE_JWT_SECRET

# 3. If empty, add it and restart server
```

---

### **Problem: Token verification fails**

**Check server logs for:**
```
🔐 Auth middleware: Token received
❌ RS256 verification error
```

**Solution:**
- Wrong JWT secret
- Get the correct one from Supabase Dashboard → Settings → API
- Make sure it's the JWT Secret, not ANON key
- Update environment variable and restart

---

## 📋 **Pre-Deployment Checklist**

Before deploying to production:

- [ ] Tested locally with `npm run dev`
- [ ] Verified Supabase login works locally
- [ ] Verified inquiry submission works locally
- [ ] Console shows "User is authenticated" locally
- [ ] Built production bundle with `npm run build`
- [ ] Got JWT Secret from Supabase Dashboard
- [ ] Added `SUPABASE_JWT_SECRET` to production environment

---

## 🎯 **What Should Happen After Deployment**

### **Console Logs (Browser):**
```javascript
✅ Supabase user detected: sahith281@gmail.com
✅ Using Supabase access token for authentication
✅ User is authenticated, associating inquiry with user account
```

### **Server Logs:**
```
🔐 Auth middleware: Token received, length: 500+
🔐 Token header: { alg: 'HS256', ... }
✅ Verified Supabase HS256 token
✅ Found user: { id: '...', email: 'sahith281@gmail.com', role: 'user' }
```

### **API Response:**
```
POST /api/inquiries → 200 OK
{
  "success": true,
  "message": "Inquiry submitted successfully",
  "data": { ... }
}
```

---

## 🧪 **Test Before Deploying**

Run this test locally:
```bash
node test-supabase-auth-local.js
```

Should show:
```
✅ SUPABASE_URL: https://qqmagqwumjipdqvxbiqu.supabase.co
✅ SUPABASE_ANON_KEY: eyJhbGciOiJIUzI1NiI...
✅ SUPABASE_JWT_SECRET: your-super-secret...
✅ Local server is running
✅ Inquiry endpoint is accessible
```

---

## 🔗 **Important Links**

**Get JWT Secret:**
https://supabase.com/dashboard/project/qqmagqwumjipdqvxbiqu/settings/api

**Your Production Site:**
https://www.jetsetterss.com

**Test Pages:**
- Login: https://www.jetsetterss.com/supabase-login
- Inquiry: https://www.jetsetterss.com/request

---

## 📞 **Need Help?**

### **Check These First:**

1. **Is JWT secret added to production?**
   ```bash
   # On your server
   echo $SUPABASE_JWT_SECRET
   ```

2. **Is server restarted?**
   ```bash
   pm2 restart jetset-app
   ```

3. **Is new code deployed?**
   ```bash
   # Check file modification time
   ls -la backend/middleware/auth.middleware.js
   ```

4. **Are there any errors in logs?**
   ```bash
   pm2 logs jetset-app --lines 50
   ```

---

## ✅ **Success Criteria**

You'll know it's working when:

- ✅ No 404 errors on /api/inquiries
- ✅ Console shows "Supabase user detected"
- ✅ Console shows "User is authenticated"
- ✅ Inquiry form submits successfully
- ✅ Inquiry is linked to your user account
- ✅ No errors in server logs

---

**Status:** ⚠️ Awaiting Deployment  
**Time Required:** 10 minutes  
**Difficulty:** ⭐⭐ Medium  
**Priority:** 🔴 High
