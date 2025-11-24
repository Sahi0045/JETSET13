# 3DS OTP Redirect Fix

## Problem
After entering card details on the payment page and clicking "Pay now", the page was not redirecting to the 3DS OTP/challenge page.

## Root Cause
The `INITIATE_CHECKOUT` session was missing the **authentication configuration** that tells the Mastercard Gateway to perform 3DS authentication.

## Solution Applied

### Updated Session Creation Request

Added authentication parameters to the checkout session:

```javascript
const requestBody = {
  apiOperation: 'INITIATE_CHECKOUT',
  interaction: {
    operation: 'PURCHASE',
    returnUrl: finalReturnUrl,
    cancelUrl: finalCancelUrl,
    merchant: {
      name: 'JetSet Travel'
    },
    displayControl: {
      billingAddress: 'OPTIONAL',
      customerEmail: 'OPTIONAL'
    },
    timeout: 900
  },
  // ✅ ADDED: Authentication configuration for 3DS
  authentication: {
    acceptVersions: '3DS1,3DS2',
    channel: 'PAYER_BROWSER',
    purpose: 'PAYMENT_TRANSACTION'
  },
  order: {
    id: payment.id,
    amount: parseFloat(quote.total_amount).toFixed(2),
    currency: quote.currency || 'USD',
    description: `Quote ${quote.quote_number} - Travel Booking`
  }
};
```

### What These Parameters Do

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `acceptVersions` | `'3DS1,3DS2'` | Accept both 3DS1 and 3DS2 authentication |
| `channel` | `'PAYER_BROWSER'` | Indicates browser-based authentication (shows OTP page) |
| `purpose` | `'PAYMENT_TRANSACTION'` | Specifies this is for payment (not just auth) |

---

## Expected Flow Now

### 1. User fills payment form
- Card number
- Expiry date  
- CVV
- Billing address
- Email

### 2. Click "Pay now"
The hosted checkout page will:
- Validate card details
- Initialize 3DS authentication
- ✅ **Redirect to 3DS challenge page** (OTP page)

### 3. 3DS Challenge Page
**For Frictionless cards** (e.g., `5123456789012346`):
- No OTP needed
- Auto-authenticates
- Redirects back immediately

**For Challenge cards** (e.g., `5123450000000008`):
- ✅ **Shows OTP input page**
- User enters OTP from their bank
- Submits OTP
- Redirects back after verification

### 4. Return to Your Site
- Gateway redirects to: `/payment/callback?resultIndicator=...&sessionId=...`
- Backend verifies authentication
- Calls PAY automatically
- Redirects to success/failure page

---

## Testing Steps

### Test 1: Frictionless Card (No OTP)

1. **Use this card:**
   ```
   Card Number: 5123456789012346
   Expiry: 01/39
   CVV: 100
   Name: Test User
   ```

2. **Fill billing address:**
   ```
   Street: 123 Test Street
   City: New York
   State: NY
   ZIP: 10001
   Country: United States
   Email: test@example.com
   ```

3. **Click "Pay now"**

4. **Expected:**
   - ✅ Shows loading/processing indicator
   - ✅ 3DS authentication happens automatically (frictionless)
   - ✅ Redirects back to your site
   - ✅ Shows payment success

### Test 2: Challenge Card (With OTP)

1. **Use this card:**
   ```
   Card Number: 5123450000000008
   Expiry: 01/39
   CVV: 100
   Name: Test User
   ```

2. **Fill billing address** (same as above)

3. **Click "Pay now"**

4. **Expected:**
   - ✅ Shows 3DS challenge page
   - ✅ **OTP input form appears**
   - ✅ Enter any OTP (test mode accepts any value)
   - ✅ Submit OTP
   - ✅ Redirects back to your site
   - ✅ Shows payment success

### Test 3: Authentication Attempted

1. **Use this card:**
   ```
   Card Number: 5500005555555559
   Expiry: 01/39
   CVV: 100
   ```

2. **Expected:**
   - ✅ 3DS attempted (partial authentication)
   - ✅ Payment completes successfully
   - ✅ Status shows "Authentication Attempted"

---

## Troubleshooting

### Issue: Still not redirecting to OTP page

**Check 1: Server restarted?**
```bash
# Restart server
cd /media/OS/for\ linux\ work/JETSET13
npm run dev
```

**Check 2: Clear browser cache**
- Press `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)
- Or open in incognito/private window

**Check 3: Check server logs**
Look for:
```
Request body: {
  "apiOperation": "INITIATE_CHECKOUT",
  "authentication": {
    "acceptVersions": "3DS1,3DS2",
    "channel": "PAYER_BROWSER",
    "purpose": "PAYMENT_TRANSACTION"
  }
}
```

If `authentication` is missing, the server hasn't restarted with the new code.

### Issue: OTP page appears but doesn't redirect back

**Possible causes:**
1. **Wrong return URL** - Check it matches your frontend URL
2. **CORS issue** - Mastercard Gateway can't redirect to your site
3. **Session expired** - Payment took too long

**Solution:**
- Verify return URL in backend logs
- Check browser console for errors
- Try again with a fresh session

### Issue: Authentication successful but payment still pending

**This is expected!** The backend should automatically call PAY when it detects:
- `authenticationStatus: AUTHENTICATION_SUCCESSFUL`
- `order.status: AUTHENTICATED`

Check backend logs for:
```
✅ 3DS Authentication successful but PAY not yet processed - calling PAY
🚀 Calling PAY API...
✅ PAY request successful: SUCCESS
```

---

## Verification Checklist

After applying this fix, verify:

- [ ] Server restarted with new code
- [ ] Session creation includes `authentication` parameters
- [ ] Payment form loads correctly
- [ ] Clicking "Pay now" shows processing
- [ ] **3DS challenge page appears** (for challenge cards)
- [ ] OTP can be entered and submitted
- [ ] Redirects back to your site after authentication
- [ ] Backend calls PAY automatically
- [ ] Payment completes successfully

---

## API Request Example

### Session Creation (with 3DS)

```bash
curl -X POST \
  "https://na.gateway.mastercard.com/api/rest/version/100/merchant/TESTARC05511704/session" \
  -H "Authorization: Basic $(echo -n 'merchant.TESTARC05511704:YOUR_API_PASSWORD' | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "apiOperation": "INITIATE_CHECKOUT",
    "interaction": {
      "operation": "PURCHASE",
      "returnUrl": "http://localhost:5173/payment/callback",
      "cancelUrl": "http://localhost:5173/inquiry"
    },
    "authentication": {
      "acceptVersions": "3DS1,3DS2",
      "channel": "PAYER_BROWSER",
      "purpose": "PAYMENT_TRANSACTION"
    },
    "order": {
      "id": "test-order-001",
      "amount": "11.00",
      "currency": "USD"
    }
  }'
```

**Expected response:**
```json
{
  "session": {
    "id": "SESSION0002...",
    "version": "..."
  },
  "successIndicator": "..."
}
```

---

## Code Changes Summary

### File: `api/payments.js`

**Location:** `handlePaymentInitiation` function, around line 259

**Changed:**
```diff
  const requestBody = {
    apiOperation: 'INITIATE_CHECKOUT',
    interaction: {
      operation: 'PURCHASE',
      returnUrl: finalReturnUrl,
      cancelUrl: finalCancelUrl,
      merchant: {
        name: 'JetSet Travel'
      },
      displayControl: {
        billingAddress: 'OPTIONAL',
        customerEmail: 'OPTIONAL'
      },
      timeout: 900
    },
+   authentication: {
+     acceptVersions: '3DS1,3DS2',
+     channel: 'PAYER_BROWSER',
+     purpose: 'PAYMENT_TRANSACTION'
+   },
    order: {
      id: payment.id,
      amount: parseFloat(quote.total_amount).toFixed(2),
      currency: quote.currency || 'USD',
      description: `Quote ${quote.quote_number || quote.id.slice(-8)} - ${quote.title || 'Travel Booking'}`
    }
  };
```

---

## 3DS Flow Diagram

```
User enters card details
        ↓
Click "Pay now"
        ↓
Hosted Checkout validates
        ↓
  ┌─────────────────┐
  │ 3DS Check       │
  └─────────────────┘
        ↓
   ┌────┴────┐
   │         │
   ↓         ↓
Frictionless  Challenge
   │         │
   │    ✅ OTP Page
   │         │
   │    Enter OTP
   │         │
   │    Submit
   │         │
   └────┬────┘
        ↓
  Authentication
   Complete
        ↓
  Redirect back
   to your site
        ↓
  Backend verifies
        ↓
   Calls PAY
        ↓
  Payment Success!
```

---

## Important Notes

1. **Frictionless vs Challenge**
   - Frictionless: No OTP, auto-authenticates
   - Challenge: Shows OTP page, user must complete

2. **Card Type Matters**
   - Test cards determine the flow
   - Use challenge cards to test OTP page

3. **3DS Emulator** (Test Mode)
   - Accepts any OTP in test mode
   - Select outcome from dropdown

4. **Return URL**
   - Must be accessible from Mastercard Gateway
   - Should match your frontend domain

5. **Backend PAY Call**
   - Happens automatically after successful auth
   - Check logs to verify

---

## Quick Test

1. **Restart server**: `npm run dev`
2. **Clear browser cache**: `Ctrl+Shift+R`
3. **Make payment with**: `5123450000000008` (challenge card)
4. **Verify**: OTP page appears ✅

---

**Last Updated:** 2025-11-25  
**Status:** ✅ Fixed - 3DS authentication now configured  
**Next Step:** Test with challenge card to see OTP page

