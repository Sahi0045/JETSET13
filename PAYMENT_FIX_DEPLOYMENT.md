# 🔧 Payment API Fix - Deployment Instructions

## 🎯 Problem
Getting 500 error: "Payment initiation failed: Error: Failed to create payment session with ARC Pay"

## ✅ What We Fixed

### 1. Enhanced Error Logging
- Added detailed request/response logging
- Separated database errors from "not found" errors
- Added comprehensive error messages

### 2. Improved Supabase Initialization
- Added fallback values for production
- Better error handling for missing credentials
- Validation before database operations

### 3. ARC Pay Response Handling
- Handles multiple response formats
- Better session ID extraction
- Detailed error logging

### 4. Debug Endpoints
- `/api/payments?action=health` - Check service status
- `/api/payments?action=debug` - Detailed environment info

## 🚀 Deployment Steps

### Step 1: Build Production Assets
```bash
cd "/media/OS/for linux work/JETSET13"
npm run build
```

### Step 2: Test Health Check Locally (Optional)
```bash
# Start local server in one terminal
npm run dev

# In another terminal, test endpoints
curl http://localhost:5001/api/payments?action=health
curl http://localhost:5001/api/payments?action=debug
```

### Step 3: Deploy to Production

#### Option A: Using Git (Recommended)
```bash
git add .
git commit -m "fix: Improve payment API error handling and logging"
git push origin main
```

Your hosting platform (Vercel/Netlify/etc) will automatically deploy.

#### Option B: Manual Deployment
```bash
# Upload files to your server
scp -r api/ dist/ server.js user@yourserver:/path/to/jetset13/

# SSH and restart
ssh user@yourserver
cd /path/to/jetset13
pm2 restart jetset-app
# OR
systemctl restart jetset-app
```

### Step 4: Verify Production Environment

1. **Check Health**:
   ```bash
   curl https://www.jetsetterss.com/api/payments?action=health
   ```
   
   Expected response:
   ```json
   {
     "success": true,
     "status": "healthy",
     "services": {
       "supabase": { "status": "ok" },
       "arcPay": { "configured": true }
     }
   }
   ```

2. **Check Debug Info** (if health fails):
   ```bash
   curl https://www.jetsetterss.com/api/payments?action=debug
   ```
   
   This will show:
   - Environment variables status
   - Supabase connection status
   - ARC Pay configuration
   - Database table access

### Step 5: Check Server Logs

When you click "Pay Now" on production, check server logs for detailed error messages:

```bash
# If using PM2
pm2 logs jetset-app --lines 100

# If using systemd
journalctl -u jetset-app -n 100 -f

# If using Vercel
vercel logs
```

Look for these log patterns:
```
📥 Payment API Request: [timestamp]
🔍 Fetching quote: [quote_id]
✅ Quote found: [quote_id]
💳 Creating payment record...
🔄 Calling ARC Pay API...
```

## 🔍 Troubleshooting

### Error: "Database connection failed"
**Cause**: Supabase credentials not set in production

**Fix**:
1. Check environment variables are set on your hosting platform
2. Required variables:
   - `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_ANON_KEY`

### Error: "Payment gateway not configured"
**Cause**: ARC Pay credentials missing

**Fix**:
1. Ensure these are set in production:
   - `ARC_PAY_MERCHANT_ID=TESTARC05511704`
   - `ARC_PAY_API_PASSWORD=4d41a81750f1ee3f6aa4adf0dfd6310c`
   - `ARC_PAY_BASE_URL=https://api.arcpay.travel/api/rest/version/100`

### Error: "Quote not found"
**Cause**: Invalid quote ID or quote doesn't exist

**Fix**:
1. Check quote ID in browser console
2. Verify quote exists in Supabase `quotes` table
3. Check quote has required fields: `total_amount`, `inquiry_id`

### Error: "Invalid credentials" from ARC Pay
**Cause**: Wrong API password or merchant ID

**Fix**:
1. Verify credentials in `.env` match the Integration Settings:
   - Username: `TESTARC05511704`
   - Password: `4d41a81750f1ee3f6aa4adf0dfd6310c`
2. Ensure auth format is: `merchant.MERCHANT_ID:password`

## 📋 Environment Variables Checklist

Make sure these are set in your production environment:

- [ ] `SUPABASE_URL=https://qqmagqwumjipdqvxbiqu.supabase.co`
- [ ] `SUPABASE_SERVICE_ROLE_KEY=[your-service-role-key]`
- [ ] `ARC_PAY_MERCHANT_ID=TESTARC05511704`
- [ ] `ARC_PAY_API_PASSWORD=4d41a81750f1ee3f6aa4adf0dfd6310c`
- [ ] `ARC_PAY_BASE_URL=https://api.arcpay.travel/api/rest/version/100`
- [ ] `FRONTEND_URL=https://www.jetsetterss.com`
- [ ] `NODE_ENV=production`

## 🎯 Expected Result

After deployment:

1. Click "Pay Now" button
2. Browser console shows:
   ```
   💳 Initiating payment for quote: [id]
   ✅ Payment session created successfully
   Session ID: SESSION...
   🔄 Redirecting to ARC Pay payment page...
   ```
3. User is redirected to ARC Pay hosted checkout page
4. After payment, user is redirected back to your site
5. Payment status is updated in database

## 📞 Still Having Issues?

1. Run the debug endpoint and share the output:
   ```bash
   curl https://www.jetsetterss.com/api/payments?action=debug
   ```

2. Share server logs from when you clicked "Pay Now"

3. Share browser console errors (F12 → Console tab)

4. Check Supabase logs in your Supabase dashboard

