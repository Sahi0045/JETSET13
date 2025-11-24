# ARC Pay 3DS Authentication & Payment Flow Guide

## 📋 Table of Contents
1. [Payment Flow Overview](#payment-flow-overview)
2. [Test Cards Reference](#test-cards-reference)
3. [3DS Authentication Types](#3ds-authentication-types)
4. [PAY/AUTHORIZE Step](#payauthorize-step)
5. [Troubleshooting](#troubleshooting)

---

## 🔄 Payment Flow Overview

### Hosted Checkout Flow (Current Implementation)

With ARC Pay's **Hosted Checkout**, the entire payment flow is handled on ARC Pay's secure payment page:

```
1. CREATE SESSION (INITIATE_CHECKOUT)
   ↓
2. User redirected to ARC Pay hosted payment page
   ↓
3. User enters card details on ARC Pay page
   ↓
4. ARC Pay handles 3DS authentication internally:
   - Frictionless: Auto-authenticates (no user action)
   - Challenge: Shows OTP page, user enters code
   ↓
5. ARC Pay processes PAY automatically (if configured)
   OR
   Backend calls PAY after authentication verification
   ↓
6. ARC Pay redirects back with resultIndicator & sessionId
   ↓
7. Backend verifies payment status and updates database
   ↓
8. User sees success/failure page
```

### Key Points:
- **Hosted Checkout** = ARC Pay handles everything on their page
- **3DS Challenge** = Handled automatically by ARC Pay (user sees OTP page)
- **No manual redirect HTML injection needed** (unlike direct API integration)
- Backend automatically calls PAY if authentication succeeds but payment is pending

---

## 🧪 Test Cards Reference

### Frictionless Cards (No Challenge Required)

These cards automatically authenticate without user interaction:

| Card Number | Type | Expiry | CVV | Behavior |
|------------|------|--------|-----|----------|
| `5123456789012346` | Mastercard | 01/39 | 100 | ✅ Frictionless - Auto authenticates |
| `5555555555000018` | Mastercard | 01/39 | 100 | ✅ Frictionless - Auto authenticates |
| `4440000042200014` | Visa | 01/39 | 100 | ✅ Frictionless - Auto authenticates |
| `4508750015741019` | Visa | 01/39 | 100 | ✅ Frictionless - Auto authenticates |

**Expected Response:**
- `transactionStatus: "Y"` (Frictionless)
- `authenticationStatus: "AUTHENTICATION_SUCCESSFUL"`
- `gatewayCode: "APPROVED"`
- `payerInteraction: "NOT_REQUIRED"`

### Challenge Cards (Requires OTP)

These cards require the user to complete a 3DS challenge:

| Card Number | Type | Expiry | CVV | Behavior |
|------------|------|--------|-----|----------|
| `5123450000000008` | Mastercard | 01/39 | 100 | ⚠️ Challenge - Requires OTP |
| `2223000000000007` | Mastercard | 01/39 | 100 | ⚠️ Challenge - Requires OTP |
| `4440000009900010` | Visa | 01/39 | 100 | ⚠️ Challenge - Requires OTP |
| `3528249999991755` | JCB | 01/39 | 100 | ⚠️ Challenge - Requires OTP |

**Expected Response:**
- `transactionStatus: "C"` (Challenge)
- `authenticationStatus: "AUTHENTICATION_PENDING"` (initially)
- User must enter OTP on ARC Pay's page
- After OTP: `authenticationStatus: "AUTHENTICATION_SUCCESSFUL"`

### Authentication Attempted Cards

| Card Number | Type | Expiry | CVV | Behavior |
|------------|------|--------|-----|----------|
| `5500005555555559` | Mastercard | 01/39 | 100 | ⚠️ Authentication Attempted |
| `4440000042200022` | Visa | 01/39 | 100 | ⚠️ Authentication Attempted |

**Expected Response:**
- `transactionStatus: "A"` (Authentication Attempted)
- `authenticationStatus: "AUTHENTICATION_SUCCESSFUL"`
- Treated as successful per ARC Pay docs

### Failed Authentication Cards

| Card Number | Type | Expiry | CVV | Behavior |
|------------|------|--------|-----|----------|
| `5111111111111118` | Mastercard | 01/39 | 100 | ❌ Not Authenticated (N) |
| `5506900140100503` | Mastercard | 01/39 | 100 | ❌ Authentication Rejected (R) |
| `5123459999998221` | Mastercard | 01/39 | 100 | ❌ Authentication Unavailable (U) |

---

## 🔐 3DS Authentication Types

### Transaction Status Values

| Status | Code | Meaning | Action Required |
|--------|------|---------|----------------|
| **Frictionless** | `Y` | Authentication successful, no challenge | ✅ Proceed to PAY |
| **Challenge** | `C` | Challenge required (OTP needed) | ⏳ Wait for user to complete |
| **Authentication Attempted** | `A` | Authentication attempted (treated as success) | ✅ Proceed to PAY |
| **Not Authenticated** | `N` | Authentication failed | ❌ Payment should fail |
| **Rejected** | `R` | Authentication rejected by issuer | ❌ Payment should fail |
| **Unavailable** | `U` | 3DS service unavailable | ❌ Payment should fail |

### Authentication Status Values

| Status | Meaning | Next Action |
|--------|---------|-------------|
| `AUTHENTICATION_SUCCESSFUL` | ✅ 3DS completed successfully | Proceed to PAY |
| `AUTHENTICATION_PENDING` | ⏳ Challenge in progress | Wait for completion |
| `AUTHENTICATION_INITIATED` | ⏳ Challenge started | Wait for completion |
| `AUTHENTICATION_FAILED` | ❌ 3DS failed | Mark payment as failed |
| `AUTHENTICATION_UNAVAILABLE` | ❌ 3DS unavailable | Mark payment as failed |

### ECI Codes

| ECI | Meaning | Card Network |
|-----|---------|-------------|
| `05` | Successful 3DS (Visa) | Visa |
| `02` | Successful 3DS (Mastercard) | Mastercard |
| `06` | Authentication Attempted | Any |
| `07` | Failed 3DS | Any |
| `00` | Failed 3DS | Any |
| `undefined` | No 3DS required | Any |

---

## 💳 PAY/AUTHORIZE Step

### When PAY is Called Automatically

The backend automatically calls PAY when:
1. ✅ `authenticationStatus === 'AUTHENTICATION_SUCCESSFUL'`
2. ✅ `transactionStatus === 'Y'` (Frictionless) or `'A'` (Attempted)
3. ✅ `authenticationToken` is present
4. ⏳ `transactionResult === 'PENDING'` (payment not yet processed)
5. ✅ No existing PAY transaction found

### PAY Request Format

```javascript
PUT /api/rest/version/100/merchant/{merchantId}/order/{orderId}/transaction/{payTransactionId}

Headers:
  Authorization: Basic base64(merchant.{merchantId}:{apiPassword})
  Content-Type: application/json

Body:
{
  "apiOperation": "PAY",
  "authentication": {
    "transactionId": "32f3acbb-df11-4bc6-9a1a-675df4e5a182"  // From authentication response
  },
  "order": {
    "amount": "11.00",
    "currency": "USD"
  },
  "sourceOfFunds": {
    "type": "CARD"
  },
  "transaction": {
    "reference": "PAY-{paymentId}"
  }
}
```

### Successful PAY Response

```json
{
  "result": "SUCCESS",
  "response": {
    "gatewayCode": "APPROVED",
    "acquirerCode": "00",
    "acquirerMessage": "Approved"
  },
  "order": {
    "id": "order-id",
    "status": "CAPTURED",
    "amount": "11.00",
    "currency": "USD",
    "authenticationStatus": "AUTHENTICATION_SUCCESSFUL"
  },
  "transaction": {
    "id": "pay-transaction-id",
    "type": "PAYMENT",
    "amount": "11.00",
    "currency": "USD"
  }
}
```

### Payment Status Flow

```
PENDING → AUTHENTICATION_INITIATED → AUTHENTICATION_PENDING 
  → AUTHENTICATION_SUCCESSFUL → PAY called → COMPLETED
```

---

## 🔧 Troubleshooting

### Issue: Transaction Stuck at "AUTHENTICATION_INITIATED"

**Cause:** User closed the ARC Pay page before completing 3DS challenge

**Solution:**
1. User must complete the 3DS challenge on ARC Pay's page
2. For challenge cards, user must enter OTP when prompted
3. Don't close the browser window during authentication

**Prevention:**
- Use frictionless test cards for automated testing
- Show clear instructions to users about completing 3DS

### Issue: Authentication Successful but Payment Still Pending

**Cause:** PAY step not executed automatically

**Solution:**
- Backend automatically calls PAY when authentication succeeds
- Check logs for "✅ 3DS Authentication successful but PAY not yet processed"
- Verify `authenticationTransactionId` is found in response

**Manual Check:**
```bash
# Check order status
GET /api/rest/version/100/merchant/{merchantId}/order/{orderId}

# Check if PAY transaction exists
GET /api/rest/version/100/merchant/{merchantId}/order/{orderId}/transaction/1
```

### Issue: Authentication Transaction ID Not Found

**Possible Locations:**
1. `transaction.authentication.transactionId`
2. `transaction.transaction[0].authentication.transactionId`
3. `orderData.authentication.transactionId`
4. `orderData.transaction[0].authentication.transactionId`

**Debug:**
- Check backend logs for "⚠️ Authentication transaction ID not found"
- Review full transaction structure in logs
- Verify order data retrieval is successful

### Issue: PAY Request Fails

**Common Errors:**

1. **400 Bad Request**
   - Check authentication transaction ID format
   - Verify order ID matches payment record
   - Ensure amount and currency are correct

2. **401 Unauthorized**
   - Verify merchant ID and API password
   - Check Authorization header format

3. **404 Not Found**
   - Order ID doesn't exist
   - Transaction ID format incorrect

4. **409 Conflict**
   - PAY already processed
   - Transaction already exists

**Solution:**
- Check backend logs for detailed error response
- Verify all required fields are present
- Ensure authentication transaction ID is from the same order

### Issue: Wrong Test Card Behavior

**Problem:** Using `5111111111111118` (Not Authenticated card)

**Solution:** Use correct test cards:
- Frictionless: `5123456789012346`
- Challenge: `5123450000000008`

**Quick Reference:**
```javascript
// Frictionless (recommended for testing)
const frictionlessCard = '5123456789012346'; // Expiry: 01/39, CVV: 100

// Challenge (requires OTP)
const challengeCard = '5123450000000008'; // Expiry: 01/39, CVV: 100
```

---

## 📊 Status Check Endpoints

### Check Payment Status

```javascript
// Backend automatically checks status in callback
GET /api/payments?action=payment-callback&resultIndicator={indicator}&sessionId={sessionId}
```

### Manual Status Check

```javascript
// Check order
GET /api/rest/version/100/merchant/{merchantId}/order/{orderId}

// Check transaction
GET /api/rest/version/100/merchant/{merchantId}/order/{orderId}/transaction/1
```

---

## ✅ Success Criteria

Payment is marked as successful when **ALL** of these are true:

1. ✅ `transactionResult === 'SUCCESS'`
2. ✅ `gatewayCode === 'APPROVED'` or `'SUCCESS'`
3. ✅ `transactionStatus === 'Y'` (Frictionless) or `'A'` (Attempted) or undefined (no 3DS)
4. ✅ `authenticationStatus === 'AUTHENTICATION_SUCCESSFUL'` or undefined (no 3DS)
5. ✅ `eci === '05'` (Visa) or `'02'` (Mastercard) or `'06'` (Attempted) or undefined (no 3DS)

---

## 🎯 Best Practices

1. **Use Frictionless Cards for Testing**
   - Faster testing
   - No user interaction required
   - Recommended: `5123456789012346`

2. **Handle All 3DS Statuses**
   - Don't assume all cards require 3DS
   - Handle `undefined` transactionStatus (no 3DS)
   - Check both transactionStatus and authenticationStatus

3. **Log Everything**
   - Log full transaction response
   - Log authentication data extraction
   - Log PAY request/response

4. **Error Handling**
   - Never mark PENDING as successful
   - Always check multiple status fields
   - Provide clear error messages to users

5. **Test Both Flows**
   - Test with frictionless cards (automatic)
   - Test with challenge cards (requires OTP)
   - Verify PAY is called correctly

---

## 📝 Code Examples

### Complete Payment Flow (Backend)

The backend automatically handles:
1. ✅ Session creation
2. ✅ Payment callback verification
3. ✅ 3DS status detection
4. ✅ Automatic PAY call when needed
5. ✅ Status updates

### Frontend (No Changes Needed)

The frontend just:
1. Initiates payment session
2. Redirects to ARC Pay page
3. Handles callback redirect

**No manual 3DS handling needed** - ARC Pay handles it all!

---

## 🔗 Resources

- [ARC Pay Test Cards Documentation](https://api.arcpay.travel/api/documentation/integrationGuidelines/supportedFeatures/testAndGoLive.html)
- [ARC Pay 3DS Test Cards](https://api.arcpay.travel/ma/transactionFilteringRules.s)
- [ARC Pay API Reference](https://api.arcpay.travel/api/documentation/)

---

**Last Updated:** 2025-11-24
**Version:** 1.0

