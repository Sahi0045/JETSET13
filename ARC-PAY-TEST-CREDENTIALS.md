# ARC Pay Test Credentials

## Official Test Card Numbers
From ARC Pay Documentation: https://api.arcpay.travel/api/documentation/integrationGuidelines/supportedFeatures/testAndGoLive.html

**IMPORTANT: Use ONLY these official ARC Pay test cards. Other test cards will NOT work!**

### ✅ Approved Test Cards (NO 3DS - Recommended for Testing)

Use these cards for straightforward testing without 3DS challenge:

| Card Type | Card Number | CVV | Expiry Date | Expected Result |
|-----------|-------------|-----|-------------|-----------------|
| **Mastercard (No 3DS)** | 5111111111111118 | 100 | 01/39 | ✅ APPROVED (No 3DS) |
| **Mastercard (No 3DS)** | 2223000000000023 | 100 | 01/39 | ✅ APPROVED (No 3DS) |
| **Visa (No 3DS)** | 4005550000000001 | 100 | 01/39 | ✅ APPROVED (No 3DS) |

### ✅ 3DS Frictionless Test Cards (Auto-Approved with 3DS)

These cards trigger 3DS but auto-approve without user challenge:

| Card Type | Card Number | CVV | Expiry Date | Expected Result |
|-----------|-------------|-----|-------------|-----------------|
| **Mastercard Frictionless** | 5123456789012346 | 100 | 01/39 | ✅ APPROVED (3DS Frictionless) |
| **Mastercard Frictionless** | 5555555555000018 | 100 | 01/39 | ✅ APPROVED (3DS Frictionless) |
| **Visa Frictionless** | 4440000042200014 | 100 | 01/39 | ✅ APPROVED (3DS Frictionless) |
| **Visa Standard** | 4508750015741019 | 100 | 01/39 | ✅ APPROVED |

### 🔐 3DS Challenge Test Cards (Requires User Interaction)

These cards trigger a 3DS challenge popup requiring user to select "Successful authentication":

| Card Type | Card Number | CVV | Expiry Date | Expected Result |
|-----------|-------------|-----|-------------|-----------------|
| **Mastercard Challenge** | 5123450000000008 | 100 | 01/39 | 🔐 Challenge (Select "Successful") |
| **Mastercard Challenge** | 2223000000000007 | 100 | 01/39 | 🔐 Challenge (Select "Successful") |
| **Visa Challenge** | 4440000009900010 | 100 | 01/39 | 🔐 Challenge (Select "Successful") |

**Note:** When 3DS Challenge appears, select "Successful authentication" from the dropdown menu to complete the payment.

### ❌ Declined Test Cards

| Card Type | Card Number | CVV | Expiry Date | Expected Result |
|-----------|-------------|-----|-------------|-----------------|
| **Any card** | Any test card | 100 | 05/39 | ❌ DECLINED |
| **Any card** | Any test card | 100 | 04/27 | ❌ EXPIRED_CARD |
| **Any card** | Any test card | 100 | 08/28 | ❌ TIMED_OUT |

## Test Environment Details

- **Merchant ID:** TESTARC05511704
- **API Base URL:** https://api.arcpay.travel/api/rest/version/100
- **Payment Page URL:** https://api.arcpay.travel/api/page/version/100/pay

## Critical Testing Notes

1. **ALWAYS use expiry date 01/39** for approved transactions
2. **ALWAYS use CVV 100** for CVV match response
3. **Cardholder Name:** Use "Test User" for best results
4. **Billing Street:** Use "Alpha St" for AVS ADDRESS_MATCH response
5. **Email:** Use any valid email format (e.g., test@example.com)
6. **Currency:** USD (or other supported currencies)

## Test Scenarios

### Scenario 1: Quick Test (No 3DS) - RECOMMENDED
- Use: **5111111111111118** (Mastercard No 3DS)
- CVV: **100**
- Expiry: **01/39**
- Cardholder: **Test User**
- Expected: Payment completes immediately without 3DS challenge

### Scenario 2: 3DS Frictionless Test
- Use: **5123456789012346** (Mastercard Frictionless)
- CVV: **100**
- Expiry: **01/39**
- Expected: Payment completes with auto-approved 3DS

### Scenario 3: 3DS Challenge Test
- Use: **5123450000000008** (Mastercard Challenge)
- CVV: **100**
- Expiry: **01/39**
- Expected: 3DS popup appears, select "Successful authentication"

### Scenario 4: Declined Payment
- Use: **5111111111111118** (Any test card)
- CVV: **100**
- Expiry: **05/39** (NOT 01/39)
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

