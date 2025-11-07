# 🚨 URGENT: Backend API 404 Fix

## 🎯 The Problem

Your frontend is working perfectly and recognizing Supabase authentication! ✅

**BUT** the backend API is returning **404 Not Found** on production:
```
POST https://www.jetsetterss.com/api/inquiries → 404
```

This means your **backend server is not accessible** at `https://www.jetsetterss.com/api/*`

---

## 🔍 Root Cause

In development:
- Vite proxy forwards `/api/*` to `http://localhost:5004` ✅

In production:
- Frontend tries `https://www.jetsetterss.com/api/*` ❌
- No backend server at this URL ❌
- No reverse proxy configured ❌

---

## ✅ Solution: Deploy Your Backend

You have **3 options** to fix this:

---

### **Option 1: Deploy Backend to Same Domain (Recommended)**

If you're using a VPS or server where you can set up a reverse proxy:

#### **Step 1: Make sure backend is running**

SSH into your server:
```bash
ssh user@yourserver

# Check if backend is running
ps aux | grep node

# If not running, start it
cd /path/to/jetset13
node server.js
# OR
pm2 start server.js --name jetset-backend
```

#### **Step 2: Set up Nginx reverse proxy**

Create Nginx config `/etc/nginx/sites-available/jetsetterss`:
```nginx
server {
    listen 80;
    server_name www.jetsetterss.com jetsetterss.com;

    # Frontend - serve static files
    location / {
        root /path/to/jetset13/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API - proxy to Node.js
    location /api {
        proxy_pass http://localhost:5004;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and restart:
```bash
sudo ln -s /etc/nginx/sites-available/jetsetterss /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

### **Option 2: Deploy Backend to Separate Service**

Deploy your backend to a service like:
- **Railway** (https://railway.app)
- **Render** (https://render.com)
- **Heroku** (https://heroku.com)
- **DigitalOcean App Platform**

#### **For Railway:**

1. Go to https://railway.app
2. Click "New Project" → "Deploy from GitHub repo"
3. Connect your repo
4. Add environment variables:
   - `SUPABASE_JWT_SECRET`
   - `JWT_SECRET`
   - `MONGODB_URI`
   - All other backend env vars
5. Railway will give you a URL like: `https://jetset-backend.railway.app`

#### **Update Frontend to Use Backend URL:**

Update `RequestPage.jsx`:
```javascript
// At the top of the file, add:
const API_URL = import.meta.env.VITE_API_URL || 
                import.meta.env.PROD 
                  ? 'https://jetset-backend.railway.app/api' 
                  : '/api';

// Then in handleSubmit, change:
const response = await fetch('/api/inquiries', {
// To:
const response = await fetch(`${API_URL}/inquiries`, {
```

---

### **Option 3: Quick Test with Backend URL (Temporary)**

For immediate testing, hardcode the backend URL:

1. **Find your backend server URL** (if deployed separately)
2. **Update RequestPage.jsx** temporarily:

```javascript
// In handleSubmit function, change:
const response = await fetch('/api/inquiries', {
// To:
const response = await fetch('https://your-backend-url.com/api/inquiries', {
```

---

## 🚀 Recommended: Deploy Backend to Railway (Fastest)

### **Step-by-Step:**

1. **Create Railway account**: https://railway.app
2. **Click "New Project"**
3. **Deploy from GitHub repo** or **Empty Project**
4. **Add Node.js service**
5. **Set Start Command**: `node server.js`
6. **Add Environment Variables**:
   ```
   SUPABASE_JWT_SECRET=your-jwt-secret
   JWT_SECRET=jetset-app-secret-key
   MONGODB_URI=your-mongodb-uri
   PORT=5004
   NODE_ENV=production
   CORS_ORIGIN=https://www.jetsetterss.com
   ```
7. **Deploy**
8. **Copy the Railway URL** (e.g., `jetset-backend.railway.app`)

9. **Update your frontend** to use this backend URL

---

## 📝 After Backend is Deployed

Update your frontend to use the backend URL:

<function_calls>
<invoke name="read_file">
<parameter name="file_path">/Users/yashwanthreddy/Desktop/JETSET13/resources/js/Pages/Request/RequestPage.jsx
