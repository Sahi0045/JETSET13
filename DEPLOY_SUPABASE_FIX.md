# 🚀 Deploy Supabase Authentication Fix

## ⚠️ **CRITICAL: Your Production Needs Updated Code**

The console shows "User not authenticated" because your production server is running **OLD CODE** without the Supabase authentication fixes.

---

## ✅ **Deployment Steps**

### **Step 1: Add Environment Variable to Production**

Your production server needs the Supabase JWT secret.

**Get the JWT Secret:**
1. Go to: https://supabase.com/dashboard/project/qqmagqwumjipdqvxbiqu/settings/api
2. Find: **JWT Secret** (under "JWT Settings")
3. Copy the secret

**Add to Production Environment:**

Depending on your hosting platform:

#### **If using Vercel:**
```bash
vercel env add SUPABASE_JWT_SECRET
# Paste the JWT secret when prompted
```

Or in Vercel Dashboard:
1. Go to your project settings
2. Environment Variables
3. Add: `SUPABASE_JWT_SECRET` = `your-jwt-secret`
4. Save

#### **If using Netlify:**
1. Go to Site Settings → Environment Variables
2. Add: `SUPABASE_JWT_SECRET` = `your-jwt-secret`
3. Save

#### **If using Railway/Render:**
1. Go to your app settings
2. Environment Variables
3. Add: `SUPABASE_JWT_SECRET` = `your-jwt-secret`
4. Save

#### **If using VPS/Custom Server:**
Add to your production `.env` file:
```env
SUPABASE_JWT_SECRET=your-jwt-secret-here
```

---

### **Step 2: Build Your Application**

```bash
# Build the frontend
npm run build

# This creates the production bundle in dist/
```

---

### **Step 3: Deploy to Production**

#### **Option A: Automatic Deployment (Vercel/Netlify)**
```bash
# If using Vercel
vercel --prod

# If using Netlify
netlify deploy --prod
```

#### **Option B: Manual Deployment (VPS/Custom Server)**
```bash
# 1. Upload files to server
scp -r dist/ user@your-server:/path/to/app/

# 2. Upload updated backend files
scp -r backend/ user@your-server:/path/to/app/
scp server.js user@your-server:/path/to/app/

# 3. SSH into server
ssh user@your-server

# 4. Navigate to app directory
cd /path/to/app

# 5. Install dependencies (if needed)
npm install

# 6. Restart the server
pm2 restart jetset-app
# OR
systemctl restart jetset-app
# OR
npm run start
```

#### **Option C: Git Push (if using CI/CD)**
```bash
# Commit changes
git add .
git commit -m "Fix: Add Supabase authentication support"

# Push to production branch
git push origin main
# OR
git push origin production

# Your CI/CD will automatically deploy
```

---

### **Step 4: Verify Deployment**

**Test the API endpoint:**
```bash
# Should return 200, not 404
curl https://www.jetsetterss.com/api/health
```

**Test authentication:**
1. Go to: https://www.jetsetterss.com/supabase-login
2. Sign in with Google
3. Open browser console
4. Check for: "✅ Supabase user detected"
5. Go to: https://www.jetsetterss.com/request
6. Fill out inquiry form
7. Submit
8. Should see: "✅ User is authenticated"

---

## 🔍 **Troubleshooting**

### **Issue: Still getting 404 on /api/inquiries**

**Possible Causes:**
1. Backend server not running
2. API routes not properly configured
3. Reverse proxy not forwarding to backend

**Fix:**
```bash
# Check if backend is running
curl https://www.jetsetterss.com/api/health

# If 404, backend is not accessible
# Check your server logs
pm2 logs jetset-app
# OR
journalctl -u jetset-app -f
```

**Check Nginx/Apache config** (if using reverse proxy):
```nginx
# Should have something like:
location /api {
    proxy_pass http://localhost:5004;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

---

### **Issue: "User not authenticated" still shows**

**Causes:**
1. Old JavaScript bundle cached in browser
2. Environment variable not set
3. Server not restarted

**Fix:**
```bash
# 1. Clear browser cache (hard refresh)
Ctrl+Shift+R (Windows/Linux)
Cmd+Shift+R (Mac)

# 2. Check environment variable on server
echo $SUPABASE_JWT_SECRET

# 3. Restart server
pm2 restart jetset-app
```

---

### **Issue: Token verification fails**

**Check server logs for:**
```
🔐 Auth middleware: Token received, length: XXX
🔐 Token header: { alg: 'HS256', ... }
❌ RS256 verification error: ...
```

**If you see this:**
- JWT secret is wrong or missing
- Check you copied the correct secret from Supabase Dashboard
- Make sure it's the JWT Secret, not the ANON key

---

## 📋 **Quick Deployment Checklist**

Before deploying:
- [ ] Added `SUPABASE_JWT_SECRET` to local `.env`
- [ ] Tested locally with `npm run dev`
- [ ] Confirmed authentication works locally
- [ ] Built production bundle with `npm run build`

During deployment:
- [ ] Added `SUPABASE_JWT_SECRET` to production environment
- [ ] Deployed updated code to production
- [ ] Restarted production server
- [ ] Cleared CDN cache (if using one)

After deployment:
- [ ] Tested `/api/health` endpoint (should return 200)
- [ ] Tested Supabase login on production
- [ ] Tested inquiry submission
- [ ] Checked server logs for errors
- [ ] Verified user authentication in console

---

## 🎯 **Expected Results After Deployment**

### **Before:**
```
Console: "User not authenticated, creating guest inquiry"
API: POST /api/inquiries → 404 Not Found ❌
```

### **After:**
```
Console: "✅ Supabase user detected: sahith281@gmail.com"
Console: "✅ Using Supabase access token for authentication"
Console: "✅ User is authenticated, associating inquiry with user account"
API: POST /api/inquiries → 200 OK ✅
Result: Inquiry created and linked to user ✅
```

---

## 🔗 **Useful Commands**

### **Check what's running:**
```bash
# Check if Node.js server is running
ps aux | grep node

# Check port 5004 (or your backend port)
lsof -i :5004

# Check PM2 processes
pm2 list
```

### **View logs:**
```bash
# PM2 logs
pm2 logs jetset-app --lines 100

# System logs
tail -f /var/log/jetset-app.log

# Node.js logs
tail -f logs/app.log
```

### **Restart services:**
```bash
# PM2
pm2 restart jetset-app

# Systemd
sudo systemctl restart jetset-app

# Docker
docker-compose restart

# Manual
pkill node && npm run start
```

---

## ⚡ **Quick Deploy Script**

Create `deploy.sh`:
```bash
#!/bin/bash

echo "🚀 Deploying Supabase Auth Fix..."

# Build frontend
echo "📦 Building frontend..."
npm run build

# Deploy based on your platform
if command -v vercel &> /dev/null; then
    echo "🔵 Deploying to Vercel..."
    vercel --prod
elif command -v netlify &> /dev/null; then
    echo "🟢 Deploying to Netlify..."
    netlify deploy --prod
else
    echo "📤 Manual deployment required"
    echo "Upload dist/ and backend/ to your server"
fi

echo "✅ Deployment complete!"
echo "🧪 Test at: https://www.jetsetterss.com/supabase-login"
```

Make it executable:
```bash
chmod +x deploy.sh
./deploy.sh
```

---

## 🆘 **Still Not Working?**

### **Check These:**

1. **Is backend running?**
   ```bash
   curl https://www.jetsetterss.com/api/health
   ```

2. **Are routes registered?**
   Check `server.js` has:
   ```javascript
   app.use('/api/inquiries', inquiryRoutes);
   ```

3. **Is JWT secret set?**
   ```bash
   # On server
   echo $SUPABASE_JWT_SECRET
   ```

4. **Are files uploaded?**
   Check these files exist on server:
   - `backend/middleware/auth.middleware.js` (updated)
   - `resources/js/Pages/Request/RequestPage.jsx` (updated)
   - `dist/` (built frontend)

5. **Is server restarted?**
   ```bash
   pm2 restart jetset-app
   ```

---

**Status:** ⚠️ Requires Deployment  
**Time Required:** 10-15 minutes  
**Difficulty:** ⭐⭐ Medium
