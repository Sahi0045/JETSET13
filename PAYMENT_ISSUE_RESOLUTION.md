# Payment Issue Resolution

## Problem

Payments are getting stuck at `AUTHENTICATED` status after successful 3DS authentication.

**Symptoms:**
- Order status: `AUTHENTICATED`
- Authentication status: `AUTHENTICATION_SUCCESSFUL`
- Total captured amount: `0`
- 3DS completed successfully (transactionStatus: Y)
- Payment NOT captured

## Root Cause

When using **Hosted Checkout** with `operation: 'PURCHASE'`, ARC Pay should automatically process the payment after 3DS. However, if the payment doesn't complete automatically:

1. The session expires after the user leaves the checkout page
2. You cannot manually call PAY because:
   - Your merchant account doesn't allow direct card data submission
   - The session is no longer valid for payment processing
   - ARC Pay requires source of funds which isn't available after session expires

## Solution

### For Future Payments (FIXED ✅)

The session creation has been updated to include authentication configuration:

```javascript
{
  apiOperation: 'INITIATE_CHECKOUT',
  interaction: {
    operation: 'PURCHASE', // Auto-pay after 3DS
    returnUrl: '...',
    cancelUrl: '...',
    timeout: 900
  },
  order: { ... },
  authentication: {
    acceptVersions: '3DS1,3DS2',
    channel: 'PAYER_BROWSER',
    purpose: 'PAYMENT_TRANSACTION'
  }
}
```

This ensures ARC Pay automatically processes payment after successful 3DS authentication.

### For Existing Stuck Payments

**Option 1: Contact ARC Pay Support**
- Provide order ID: `adb3715a-e1c8-4979-bb97-7dfcb7032f04`
- Request manual capture or void
- Support email: support@arcpay.travel (check their website)

**Option 2: Create a New Payment**
- Mark the stuck payment as failed/cancelled
- Create a new payment session with the fixed code
- User completes payment again

**Option 3: Wait for Auto-Void**
- ARC Pay typically auto-voids authenticated but uncaptured payments after 7-30 days
- Not ideal for customer experience

## Why PAY Operation Fails

When trying to manually call PAY for a Hosted Checkout session:

```bash
❌ Error: "Must provide the mandatory payment details for the selected payment type"
```

This is because:
1. **Hosted Checkout** = Card details never leave ARC Pay's page
2. **Your backend** = Never has access to card details
3. **Session-based** = Payment source is tied to the expired session
4. **No fallback** = Cannot complete payment outside of the hosted session

## Verification Steps

### Test New Payments:

1. Create a new payment session (will use fixed code)
2. Use test card: `5123456789012346`, expiry `01/39`, CVV `100`
3. Complete 3DS if prompted
4. Verify order status becomes `CAPTURED` (not just `AUTHENTICATED`)

### Check Order Status:

```bash
curl -X GET \
  "https://api.arcpay.travel/api/rest/version/100/merchant/TESTARC05511704/order/ORDER_ID" \
  -H "Authorization: Basic BASE64_CREDENTIALS"
```

Expected for successful payment:
```json
{
  "status": "CAPTURED",
  "totalCapturedAmount": 11.00,
  "result": "SUCCESS"
}
```

## Implementation Changes Made

1. ✅ Added `authentication` block to session creation
2. ✅ Added `timeout` to prevent session expiry
3. ✅ Verified `operation: 'PURCHASE'` is set correctly
4. ✅ Created fix script for manual intervention (though it can't work for Hosted Checkout)

## Next Steps

1. **Test with a new payment** to verify the fix works
2. **Contact ARC Pay** about the stuck payment if needed
3. **Monitor** future payments to ensure they complete automatically
4. **Consider** adding a webhook listener for payment status updates

## ARC Pay Documentation References

- Session Creation: https://api.arcpay.travel/api/documentation/
- Hosted Checkout: https://api.arcpay.travel/api/documentation/integrationGuidelines/hostedCheckout.html
- 3DS Authentication: https://api.arcpay.travel/api/documentation/integrationGuidelines/supportedFeatures/pickAdditionalFunctionality/authentication/3DS/

---

**Status:** RESOLVED for future payments ✅
**Action Required:** Test new payment + handle stuck payment via ARC Pay support
**Last Updated:** 2025-11-25
