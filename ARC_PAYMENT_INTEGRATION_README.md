# ARC Pay Gateway Integration - Implementation Guide

## Overview

This document provides a complete guide for the ARC Pay Gateway integration implemented in the JetSet travel booking system. The integration enables secure payment processing for flight quotes using ARC's Hosted Checkout solution.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Files Modified/Created](#files-modifiedcreated)
3. [Database Schema](#database-schema)
4. [API Integration](#api-integration)
5. [Frontend Components](#frontend-components)
6. [Configuration](#configuration)
7. [Testing Guide](#testing-guide)
8. [Deployment Checklist](#deployment-checklist)
9. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### Payment Flow

```
User views quote → Clicks "Pay Now"
    ↓
Frontend calls POST /api/payments?action=initiate-payment
    ↓
Backend creates payment record
    ↓
Backend calls ARC API: POST /merchant/{merchantId}/session
    ↓
ARC returns session.id and successIndicator
    ↓
Frontend configures Checkout.js with session.id
    ↓
Checkout.showPaymentPage() redirects to ARC-hosted page
    ↓
User enters payment details on ARC's secure page
    ↓
ARC processes payment (with 3DS if required)
    ↓
ARC redirects to returnUrl: /payment/callback?resultIndicator=XXX&sessionId=YYY
    ↓
Frontend shows "Verifying..." page
    ↓
Backend verifies resultIndicator === successIndicator
    ↓
Backend calls ARC API: GET /order/{orderId}/transaction/1
    ↓
Backend confirms transaction.result === 'SUCCESS'
    ↓
Backend updates payment/quote/inquiry status to 'paid'
    ↓
Backend redirects to /payment/success
    ↓
User sees confirmation + booking details
```

### Key Security Features

- **PCI-DSS Compliance**: Card data never touches our servers
- **Result Indicator Verification**: Prevents payment tampering
- **Transaction Verification**: Double-checks payment status with ARC
- **HTTPS Required**: All callbacks must use HTTPS in production

---

## Files Modified/Created

### Database

- **`inquiry-system-schema.sql`** - Added `payments` table with ARC-specific fields

### Backend Models

- **`backend/models/payment.model.js`** (NEW) - Payment CRUD operations
- **`backend/models/quote.model.js`** - Added `updatePaymentStatus()` and `getQuoteByPaymentLink()`

### API Endpoints

- **`api/payments.js`** - Added ARC Pay integration handlers:
  - `initiate-payment` - Creates ARC session
  - `payment-callback` - Verifies and processes payment
  - `get-payment-details` - Retrieves payment information

### Frontend Components

- **`resources/js/Pages/Common/PaymentCallback.jsx`** (NEW) - Handles ARC redirect
- **`resources/js/Pages/Common/PaymentSuccess.jsx`** (NEW) - Success confirmation page
- **`resources/js/Pages/Common/PaymentFailed.jsx`** (NEW) - Failure page with retry
- **`resources/js/Pages/Common/InquiryDetail.jsx`** - Added "Pay Now" button with Checkout.js
- **`resources/js/Pages/Admin/InquiryDetail.jsx`** - Added payment details display

### Routes

- **`resources/js/app.jsx`** - Added payment routes:
  - `/payment/callback`
  - `/payment/success`
  - `/payment/failed`

### Configuration

- **`.env.example`** - Added ARC Pay environment variables template

---

## Database Schema

### Payments Table

```sql
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    inquiry_id UUID NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
    
    -- ARC Pay Gateway fields
    arc_transaction_id TEXT,
    arc_order_id TEXT,
    arc_session_id TEXT,
    success_indicator TEXT,
    
    -- Payment details
    amount DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
    payment_method TEXT,
    
    -- Customer information
    customer_email TEXT,
    customer_name TEXT,
    
    -- URLs
    return_url TEXT,
    cancel_url TEXT,
    
    -- Additional data
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);
```

### Indexes

- `idx_payments_quote_id` - Fast quote lookup
- `idx_payments_arc_session_id` - Session verification
- `idx_payments_arc_transaction_id` - Transaction lookup
- `idx_payments_payment_status` - Status filtering

---

## API Integration

### ARC Pay REST-JSON API v100

**Base URL**: `https://api.arcpay.travel/api/rest/version/100`

### Authentication

```javascript
const authHeader = 'Basic ' + Buffer.from(
  `merchant.${merchantId}:${apiPassword}`
).toString('base64');
```

### Endpoint 1: Initiate Checkout

**Request:**
```http
POST /merchant/{merchantId}/session
Authorization: Basic <base64(merchant.merchantId:apiPassword)>
Content-Type: application/json

{
  "apiOperation": "INITIATE_CHECKOUT",
  "interaction": {
    "operation": "PURCHASE",
    "returnUrl": "https://yourdomain.com/payment/callback",
    "cancelUrl": "https://yourdomain.com/inquiry/{id}"
  },
  "order": {
    "id": "payment-uuid",
    "amount": 299.99,
    "currency": "USD",
    "description": "Flight booking - Quote Q-20250108-0001"
  }
}
```

**Response:**
```json
{
  "session": {
    "id": "SESSION0002676698882I0638819J84"
  },
  "successIndicator": "1234567890abcdef",
  "result": "SUCCESS"
}
```

### Endpoint 2: Retrieve Transaction

**Request:**
```http
GET /merchant/{merchantId}/order/{orderId}/transaction/{transactionId}
Authorization: Basic <base64(merchant.merchantId:apiPassword)>
```

**Response:**
```json
{
  "result": "SUCCESS",
  "transaction": {
    "id": "1",
    "amount": 299.99,
    "currency": "USD"
  },
  "sourceOfFunds": {
    "provided": {
      "card": {
        "brand": "VISA",
        "number": "xxxxxxxxxxxx1234"
      }
    }
  }
}
```

---

## Frontend Components

### Pay Now Button (InquiryDetail.jsx)

```jsx
// Load ARC Pay Checkout.js SDK
useEffect(() => {
  loadCheckoutScript()
    .then(() => setCheckoutReady(true))
    .catch(err => console.error('Failed to load Checkout.js:', err));
}, [id]);

const handlePayNow = async (quote) => {
  // 1. Initiate payment session
  const response = await fetch('/api/payments?action=initiate-payment', {
    method: 'POST',
    body: JSON.stringify({
      quote_id: quote.id,
      return_url: `${window.location.origin}/payment/callback`,
      cancel_url: `${window.location.origin}/inquiry/${inquiry.id}`
    })
  });

  const { sessionId, merchantId } = await response.json();

  // 2. Configure Checkout.js
  window.Checkout.configure({
    merchant: merchantId,
    session: { id: sessionId },
    interaction: {
      merchant: {
        name: 'JetSet Travel',
        address: { /* ... */ }
      }
    }
  });

  // 3. Redirect to hosted payment page
  window.Checkout.showPaymentPage();
};
```

### Payment Callback (PaymentCallback.jsx)

```jsx
useEffect(() => {
  const resultIndicator = searchParams.get('resultIndicator');
  const sessionId = searchParams.get('sessionId');
  
  // Backend will verify and redirect
  window.location.href = `/api/payments?action=payment-callback&resultIndicator=${resultIndicator}&sessionId=${sessionId}`;
}, [searchParams]);
```

---

## Configuration

### Environment Variables

Add to `.env`:

```bash
# ARC Pay Gateway Configuration
ARC_PAY_MERCHANT_ID=your_merchant_id_here
ARC_PAY_API_PASSWORD=your_api_password_here
ARC_PAY_API_VERSION=100
ARC_PAY_BASE_URL=https://api.arcpay.travel/api/rest/version/100
```

### Obtaining Credentials

1. **Test Account**: Contact ARC at https://www2.arccorp.com/support/arc-pay/
2. **Request**: Test merchant account for Gateway API
3. **Receive**: Merchant ID and API password
4. **Test Cards**: Use ARC-provided test card numbers

### Production Setup

1. Apply for production merchant account
2. Complete ARC's verification process
3. Update environment variables with production credentials
4. Ensure all URLs use HTTPS
5. Configure proper error monitoring

---

## Testing Guide

### Test Credentials

Contact ARC to obtain test credentials:
- Test Merchant ID
- Test API Password
- Test card numbers

### Test Scenarios

#### 1. Successful Payment
- Navigate to inquiry with unpaid quote
- Click "Pay Now"
- Enter test card details on ARC page
- Verify redirect to success page
- Check payment status in admin panel

#### 2. Failed Payment
- Use declined test card
- Verify redirect to failure page
- Check payment status is 'failed'

#### 3. Cancelled Payment
- Click cancel on ARC payment page
- Verify redirect to cancel URL

#### 4. Session Expiry
- Initiate payment
- Wait 30+ minutes
- Attempt to complete payment
- Verify appropriate error handling

### Database Verification

```sql
-- Check payment record
SELECT * FROM payments WHERE quote_id = 'quote-uuid';

-- Check quote status
SELECT payment_status, paid_at FROM quotes WHERE id = 'quote-uuid';

-- Check inquiry status
SELECT status FROM inquiries WHERE id = 'inquiry-uuid';
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] Run database migration to create `payments` table
- [ ] Obtain production ARC Pay credentials
- [ ] Update `.env` with production values
- [ ] Test payment flow in staging environment
- [ ] Verify HTTPS is enabled on all domains
- [ ] Configure error monitoring (Sentry, LogRocket, etc.)

### Deployment Steps

1. **Database Migration**
   ```bash
   # Run the SQL migration
   psql -U postgres -d your_database -f inquiry-system-schema.sql
   ```

2. **Environment Variables**
   ```bash
   # Set production environment variables
   export ARC_PAY_MERCHANT_ID=prod_merchant_id
   export ARC_PAY_API_PASSWORD=prod_api_password
   ```

3. **Deploy Code**
   ```bash
   # Build and deploy
   npm run build
   # Deploy to your hosting platform
   ```

4. **Verify Installation**
   - Test payment with small amount
   - Verify callback URL is accessible
   - Check payment appears in admin panel
   - Confirm email notifications work

### Post-Deployment

- [ ] Monitor error logs for payment failures
- [ ] Set up payment reconciliation process
- [ ] Document refund procedure
- [ ] Train support team on payment issues
- [ ] Set up alerts for failed payments

---

## Troubleshooting

### Common Issues

#### 1. "Payment gateway not configured"

**Cause**: Missing ARC Pay credentials

**Solution**: 
```bash
# Verify environment variables are set
echo $ARC_PAY_MERCHANT_ID
echo $ARC_PAY_API_PASSWORD
```

#### 2. "Invalid session" error

**Cause**: Session expired or invalid session ID

**Solution**: Sessions expire after 30 minutes. User should restart payment process.

#### 3. "Result indicator mismatch"

**Cause**: Security verification failed

**Solution**: This is a security feature. Check for:
- URL tampering
- Session reuse
- Network issues during callback

#### 4. Checkout.js not loading

**Cause**: Script blocked or network issue

**Solution**:
```javascript
// Check browser console for errors
// Verify script URL is accessible
https://api.arcpay.travel/static/checkout/checkout.min.js
```

### Debug Mode

Enable detailed logging:

```javascript
// In api/payments.js
console.log('ARC API Request:', {
  url,
  method,
  body: JSON.stringify(requestBody, null, 2)
});

console.log('ARC API Response:', {
  status: response.status,
  body: await response.text()
});
```

### Support Contacts

- **ARC Pay Support**: https://www2.arccorp.com/support/arc-pay/
- **API Documentation**: https://api.arcpay.travel/api/documentation/
- **Technical Issues**: Contact ARC technical support team

---

## API Reference

### Internal Endpoints

#### POST /api/payments?action=initiate-payment

**Request Body:**
```json
{
  "quote_id": "uuid",
  "return_url": "https://domain.com/payment/callback",
  "cancel_url": "https://domain.com/inquiry/uuid"
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "SESSION...",
  "successIndicator": "abc123...",
  "merchantId": "MERCHANT123",
  "paymentId": "payment-uuid"
}
```

#### GET /api/payments?action=payment-callback

**Query Parameters:**
- `resultIndicator` - ARC's result indicator
- `sessionId` - ARC session ID

**Response:** Redirects to `/payment/success` or `/payment/failed`

#### GET /api/payments?action=get-payment-details

**Query Parameters:**
- `paymentId` - Payment UUID

**Response:**
```json
{
  "success": true,
  "payment": {
    "id": "uuid",
    "amount": 299.99,
    "currency": "USD",
    "payment_status": "completed",
    "arc_transaction_id": "TXN123",
    "payment_method": "VISA",
    "completed_at": "2025-01-08T10:30:00Z"
  }
}
```

---

## Monitoring & Analytics

### Key Metrics to Track

1. **Payment Success Rate**: `completed / (completed + failed)`
2. **Average Payment Time**: Time from initiation to completion
3. **Abandonment Rate**: Initiated but not completed
4. **Refund Rate**: Refunds / total payments

### Recommended Monitoring

```javascript
// Log payment events
analytics.track('Payment Initiated', {
  quote_id,
  amount,
  currency
});

analytics.track('Payment Completed', {
  payment_id,
  transaction_id,
  amount,
  payment_method
});

analytics.track('Payment Failed', {
  payment_id,
  error_reason
});
```

---

## Security Best Practices

1. **Never log sensitive data**: Card numbers, CVV, full API passwords
2. **Use HTTPS everywhere**: Especially for callbacks
3. **Verify result indicators**: Always check before updating status
4. **Implement rate limiting**: Prevent payment spam
5. **Monitor for fraud**: Unusual payment patterns
6. **Keep dependencies updated**: Regularly update packages
7. **Audit payment logs**: Regular security reviews

---

## Additional Resources

- [ARC Pay Documentation](https://api.arcpay.travel/api/documentation/integrationGuidelines/index.html)
- [Hosted Checkout Guide](https://api.arcpay.travel/api/documentation/integrationGuidelines/hostedCheckout/implementingTheHostedPaymentPage.html)
- [API Changelog](https://api.arcpay.travel/api/documentation/apiDocumentation/rest-json/version/100/changelog.html)
- [Test Account Request](https://www2.arccorp.com/support/arc-pay/)

---

## Version History

- **v1.0.0** (2025-01-08) - Initial ARC Pay Gateway integration
  - Hosted Checkout implementation
  - Payment verification flow
  - Admin panel payment tracking
  - Success/failure pages

---

## License & Compliance

This integration complies with:
- PCI-DSS Level 1 (via ARC Pay)
- GDPR (payment data handling)
- ARC Pay Terms of Service

**Note**: Always review ARC Pay's latest terms and compliance requirements.
