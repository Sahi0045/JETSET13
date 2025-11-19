# ARC Pay Test Credentials

## Official Test Card Numbers
From ARC Pay Documentation: https://api.arcpay.travel/api/documentation/integrationGuidelines/supportedFeatures/testAndGoLive.html#h2_Card_transaction_test_details

### ✅ Approved Test Cards

| Card Type | Card Number | CVV | Expiry Date | Expected Result |
|-----------|-------------|-----|-------------|-----------------|
| **Visa** | 4111111111111111 | 123 | 12/25 (any future date) | ✅ Approved |
| **Mastercard** | 5555555555554444 | 456 | 11/26 (any future date) | ✅ Approved |
| **American Express** | 378282246310005 | 7897 | 10/27 (any future date) | ✅ Approved |

### ❌ Declined Test Cards

| Card Type | Card Number | CVV | Expiry Date | Expected Result |
|-----------|-------------|-----|-------------|-----------------|
| **Visa** | 4000000000000002 | 123 | 12/25 (any future date) | ❌ Declined |

### 🔐 3D Secure (3DS) Testing

Some test cards may trigger 3D Secure authentication. Follow the on-screen prompts during the transaction process to complete the authentication.

## Test Environment Details

- **Merchant ID:** TESTARC05511704
- **API Base URL:** https://api.arcpay.travel/api/rest/version/100
- **Payment Page URL:** https://api.arcpay.travel/api/page/version/100/pay

## Notes

1. **Cardholder Name:** Use any name (e.g., "Test Customer", "John Doe")
2. **Billing Address:** Can be any valid address format
3. **Email:** Use any valid email format (e.g., test@example.com)
4. **Amount:** Any amount (no real money will be charged)
5. **Currency:** USD (or other supported currencies)

## Test Scenarios

### Scenario 1: Successful Payment
- Use: **4111111111111111** (Visa)
- CVV: **123**
- Expiry: **12/25**
- Expected: Payment completes successfully, status updates to "completed"

### Scenario 2: Successful Payment with Mastercard
- Use: **5555555555554444** (Mastercard)
- CVV: **456**
- Expiry: **11/26**
- Expected: Payment completes successfully

### Scenario 3: Successful Payment with Amex
- Use: **378282246310005** (American Express)
- CVV: **7897**
- Expiry: **10/27**
- Expected: Payment completes successfully

### Scenario 4: Declined Payment
- Use: **4000000000000002** (Visa)
- CVV: **123**
- Expiry: **12/25**
- Expected: Payment is declined, error message shown

## Integration Endpoints

### 1. Create Payment Session
```bash
POST https://www.jetsetterss.com/api/payments?action=initiate-payment
Content-Type: application/json

{
  "quote_id": "your-quote-id",
  "return_url": "https://www.jetsetterss.com/payment/callback",
  "cancel_url": "https://www.jetsetterss.com/inquiry/id?payment=cancelled"
}
```

### 2. Check Payment Status
```bash
GET https://www.jetsetterss.com/api/payments?action=get-payment-details&paymentId=your-payment-id
```

### 3. Payment Callback
```
GET https://www.jetsetterss.com/payment/callback?quote_id=xxx&resultIndicator=xxx
```

## Current Test Transaction

**Active Session:**
- Session ID: SESSION0002300282793G16962529E7
- Payment ID: d3f1da3b-a38f-4a44-bb75-32964709f84c
- Quote ID: b905e4f3-ddb9-4965-b54d-580740dd3cb9
- Amount: $1,000.00 USD

**To Complete Test:**
1. Open: `complete-arc-test-transaction.html`
2. Click "Proceed to ARC Pay Payment Page"
3. Use test card from table above
4. Complete payment on ARC Pay's hosted page

**Monitor Status:**
```bash
curl "https://www.jetsetterss.com/api/payments?action=get-payment-details&paymentId=d3f1da3b-a38f-4a44-bb75-32964709f84c"
```

## References
- [ARC Pay Integration Guidelines](https://api.arcpay.travel/api/documentation/integrationGuidelines/supportedFeatures/testAndGoLive.html)
- [Card Transaction Test Details](https://api.arcpay.travel/api/documentation/integrationGuidelines/supportedFeatures/testAndGoLive.html#h2_Card_transaction_test_details)
- [Secure Your Integration](https://api.arcpay.travel/api/documentation/integrationGuidelines/supportedFeatures/pickSecurityModel/secureYourIntegration.html)

