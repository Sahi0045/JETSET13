<!-- 2097b7bb-17ee-4af2-93ae-13414ac95a92 92d90d7d-917a-490c-800b-c84b59c8644c -->
# ARC Pay Gateway Integration Plan

## Overview

Integrate ARC Pay Gateway's Hosted Checkout solution ([https://api.arcpay.travel/api/documentation/integrationGuidelines/index.html](https://api.arcpay.travel/api/documentation/integrationGuidelines/index.html)) to enable secure payment processing for flight quotes. 

**Integration Flow:**
1. User clicks "Pay Now" on quote
2. Backend initiates Hosted Checkout session via REST-JSON API
3. User redirected to ARC-hosted payment page (PCI-compliant)
4. User completes payment on ARC's secure page
5. ARC redirects back with payment status via `resultIndicator`
6. Backend verifies transaction and updates quote/inquiry status to 'paid'

**Key Benefits:**
- PCI-DSS compliant (no card data touches our servers)
- Supports all major card schemes
- Hosted payment page handles 3DS authentication
- Professional, mobile-responsive payment interface

## Key Files Identified

- `api/payments.js` - Existing Vercel serverless payment endpoint (mock/test mode)
- `backend/routes/payment.routes.js` - Existing Express payment routes (with ARC Pay config)
- `resources/js/Pages/Common/InquiryDetail.jsx` - User inquiry detail page (needs "Pay Now" button)
- `backend/models/quote.model.js` - Quote database model
- `inquiry-system-schema.sql` - Database schema (quotes table has `payment_status` and `payment_link` fields)

## Implementation Steps

### 1. Database Preparation

**File:** `inquiry-system-schema.sql`

- Verify `quotes` table has necessary columns (already exists):
  - `payment_link TEXT`
  - `payment_status TEXT` (unpaid, paid, refunded, failed)
  - `paid_at TIMESTAMP`
- Add `payments` table to track payment transactions:
```sql
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quote_id UUID NOT NULL REFERENCES quotes(id),
    inquiry_id UUID NOT NULL REFERENCES inquiries(id),
    arc_transaction_id TEXT,
    arc_order_id TEXT,
    arc_session_id TEXT,
    success_indicator TEXT,
    amount DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
    payment_method TEXT,
    customer_email TEXT,
    customer_name TEXT,
    return_url TEXT,
    cancel_url TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);
```


### 2. Backend API - Payment Initiation

**File:** `api/payments.js` (update existing Vercel serverless function)

- Add new action: `initiate-payment`
- Create payment record in database
- Call ARC Pay Hosted Checkout API to create session
- Return session details to frontend for redirect
```javascript
case 'initiate-payment':
  return handlePaymentInitiation(req, res);
```

**Implementation:**

```javascript
async function handlePaymentInitiation(req, res) {
  const { quote_id, return_url, cancel_url } = req.body;
  
  // 1. Fetch quote details from database
  const quote = await Quote.findById(quote_id);
  
  // 2. Create payment record
  const payment = await Payment.create({
    quote_id,
    inquiry_id: quote.inquiry_id,
    amount: quote.total_amount,
    currency: quote.currency || 'USD',
    payment_status: 'pending'
  });
  
  // 3. Call ARC Pay API: POST /merchant/{merchantId}/session
  const arcResponse = await fetch(
    `https://api.arcpay.travel/api/rest/version/100/merchant/${process.env.ARC_PAY_MERCHANT_ID}/session`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(
          `merchant.${process.env.ARC_PAY_MERCHANT_ID}:${process.env.ARC_PAY_API_PASSWORD}`
        ).toString('base64')
      },
      body: JSON.stringify({
        apiOperation: 'INITIATE_CHECKOUT',
        interaction: {
          operation: 'PURCHASE',
          returnUrl: return_url,
          cancelUrl: cancel_url
        },
        order: {
          id: payment.id,
          amount: quote.total_amount,
          currency: quote.currency || 'USD',
          description: `Flight booking for inquiry ${quote.inquiry_id}`
        }
      })
    }
  );
  
  const session = await arcResponse.json();
  
  // 4. Store session ID in payment record
  await Payment.update(payment.id, { 
    arc_session_id: session.session.id,
    success_indicator: session.successIndicator 
  });
  
  // 5. Return session details for Checkout.js integration
  return res.json({
    success: true,
    sessionId: session.session.id,
    successIndicator: session.successIndicator,
    merchantId: process.env.ARC_PAY_MERCHANT_ID
  });
}
```

**API Endpoint:**
- **URL:** `https://api.arcpay.travel/api/rest/version/100/merchant/{merchantId}/session`
- **Method:** POST
- **Auth:** Basic HTTP Authentication (`merchant.<merchantId>:<apiPassword>`)
- **Content-Type:** `application/json`

### 3. Backend API - Payment Callback Handler

**File:** `api/payments.js`

- Add new action: `payment-callback`
- Verify `resultIndicator` matches stored `successIndicator`
- Retrieve transaction details from ARC Pay API
- Update payment record status
- Update quote status to 'paid' and set `paid_at`
- Update inquiry status to 'paid'
- Send confirmation email

```javascript
case 'payment-callback':
  return handlePaymentCallback(req, res);
```

**Implementation:**

```javascript
async function handlePaymentCallback(req, res) {
  const { resultIndicator, sessionId } = req.query;
  
  // 1. Retrieve payment by session ID
  const payment = await Payment.findBySessionId(sessionId);
  
  if (!payment) {
    return res.redirect('/payment/failed?error=invalid_session');
  }
  
  // 2. Verify resultIndicator matches successIndicator (security check)
  if (resultIndicator !== payment.success_indicator) {
    return res.redirect('/payment/failed?error=invalid_indicator');
  }
  
  // 3. Retrieve transaction details from ARC Pay
  const txnResponse = await fetch(
    `https://api.arcpay.travel/api/rest/version/100/merchant/${process.env.ARC_PAY_MERCHANT_ID}/order/${payment.id}/transaction/1`,
    {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(
          `merchant.${process.env.ARC_PAY_MERCHANT_ID}:${process.env.ARC_PAY_API_PASSWORD}`
        ).toString('base64')
      }
    }
  );
  
  const transaction = await txnResponse.json();
  
  // 4. Check transaction result
  if (transaction.result === 'SUCCESS') {
    // Update payment status
    await Payment.updateStatus(payment.id, {
      payment_status: 'completed',
      completed_at: new Date(),
      arc_transaction_id: transaction.transaction.id,
      payment_method: transaction.sourceOfFunds?.provided?.card?.brand
    });
    
    // Update quote status
    await Quote.updatePaymentStatus(payment.quote_id, {
      payment_status: 'paid',
      paid_at: new Date()
    });
    
    // Update inquiry status
    await Inquiry.updateStatus(payment.inquiry_id, 'paid');
    
    // Send confirmation email (async)
    sendPaymentConfirmationEmail(payment);
    
    return res.redirect(`/payment/success?paymentId=${payment.id}`);
  } else {
    // Payment failed
    await Payment.updateStatus(payment.id, {
      payment_status: 'failed',
      metadata: { error: transaction.error }
    });
    
    return res.redirect(`/payment/failed?reason=${transaction.error?.cause}`);
  }
}
```

**API Endpoint for Verification:**
- **URL:** `https://api.arcpay.travel/api/rest/version/100/merchant/{merchantId}/order/{orderId}/transaction/{transactionId}`
- **Method:** GET
- **Auth:** Basic HTTP Authentication


### 4. Backend Model - Quote Payment Methods

**File:** `backend/models/quote.model.js`

- Add method `updatePaymentStatus(quoteId, status, transactionId)`
- Add method `getQuoteByPaymentLink(paymentLink)`
```javascript
static async updatePaymentStatus(quoteId, paymentData) {
  const { payment_status, paid_at, arc_transaction_id } = paymentData;
  
  const { data, error } = await supabase
    .from('quotes')
    .update({
      payment_status,
      paid_at,
      status: payment_status === 'paid' ? 'paid' : status,
      updated_at: new Date().toISOString()
    })
    .eq('id', quoteId)
    .select()
    .single();
    
  return data;
}
```


### 5. Backend Model - Payment Model

**File:** `backend/models/payment.model.js` (NEW)

- Create payment model with methods:
  - `create(paymentData)` - Create payment record
  - `findByQuoteId(quoteId)` - Get payment by quote
  - `findBySessionId(sessionId)` - Get payment by ARC session ID
  - `findByArcOrderId(arcOrderId)` - Get payment by ARC order ID
  - `update(paymentId, data)` - Update payment record
  - `updateStatus(paymentId, statusData)` - Update payment status with transaction details

### 6. Frontend - Pay Now Button & Checkout Integration

**File:** `resources/js/Pages/Common/InquiryDetail.jsx`

- Add ARC Pay Checkout.js SDK script to page
- Add "Pay Now" button to quote display section
- Only show if quote status is 'sent' or 'accepted' and payment_status is 'unpaid'
- On click: initiate session → configure Checkout.js → redirect to hosted page

```jsx
// Add to component head/useEffect
useEffect(() => {
  // Load ARC Pay Checkout.js SDK
  const script = document.createElement('script');
  script.src = 'https://api.arcpay.travel/static/checkout/checkout.min.js';
  script.async = true;
  script.setAttribute('data-error', 'errorCallback');
  script.setAttribute('data-cancel', 'cancelCallback');
  document.body.appendChild(script);
  
  return () => {
    document.body.removeChild(script);
  };
}, []);

const handlePayNow = async (quoteId) => {
  setLoading(true);
  
  try {
    // 1. Initiate payment session
    const response = await fetch('/api/payments?action=initiate-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quote_id: quoteId,
        return_url: `${window.location.origin}/payment/callback`,
        cancel_url: `${window.location.origin}/inquiry/${inquiry.id}`
      })
    });
    
    const { sessionId, merchantId } = await response.json();
    
    // 2. Configure and show ARC Pay hosted checkout
    Checkout.configure({
      merchant: merchantId,
      session: {
        id: sessionId
      },
      interaction: {
        merchant: {
          name: 'JetSet Travel',
          address: {
            line1: 'Your Business Address',
            line2: 'Suite/Floor',
            city: 'City',
            stateProvince: 'State',
            postalCode: 'ZIP',
            country: 'USA'
          }
        },
        displayControl: {
          billingAddress: 'OPTIONAL',
          customerEmail: 'OPTIONAL'
        }
      }
    });
    
    // 3. Redirect to hosted payment page
    Checkout.showPaymentPage();
    
  } catch (error) {
    console.error('Payment initiation failed:', error);
    alert('Failed to initiate payment. Please try again.');
  } finally {
    setLoading(false);
  }
};

// Render button
{quote.payment_status === 'unpaid' && (quote.status === 'sent' || quote.status === 'accepted') && (
  <button
    onClick={() => handlePayNow(quote.id)}
    disabled={loading}
    className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {loading ? 'Processing...' : `Pay Now - $${quote.total_amount} ${quote.currency || 'USD'}`}
  </button>
)}
```

**Checkout.js SDK Reference:**
- **SDK URL:** `https://api.arcpay.travel/static/checkout/checkout.min.js`
- **Documentation:** [Hosted Checkout Integration](https://api.arcpay.travel/api/documentation/integrationGuidelines/hostedCheckout/implementingTheHostedPaymentPage.html)


### 7. Frontend - Payment Callback Page

**File:** `resources/js/Pages/Common/PaymentCallback.jsx` (NEW)

- Create new page to handle ARC Pay redirect
- Parse query parameters (`resultIndicator`, `sessionId`)
- Call backend callback API for verification
- Backend handles verification and redirects to success/failure page

```jsx
import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

export default function PaymentCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  useEffect(() => {
    const verifyPayment = async () => {
      const resultIndicator = searchParams.get('resultIndicator');
      const sessionId = searchParams.get('sessionId');
      
      if (!resultIndicator || !sessionId) {
        navigate('/payment/failed?error=missing_params');
        return;
      }
      
      // Backend will verify and redirect
      window.location.href = `/api/payments?action=payment-callback&resultIndicator=${resultIndicator}&sessionId=${sessionId}`;
    };
    
    verifyPayment();
  }, [searchParams, navigate]);
  
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <h2 className="text-xl font-semibold text-gray-700">Verifying Payment...</h2>
        <p className="text-gray-500 mt-2">Please wait while we confirm your payment.</p>
      </div>
    </div>
  );
}
```

### 8. Frontend - Payment Success/Failed Pages

**Files:**

- `resources/js/Pages/Common/PaymentSuccess.jsx` (NEW)
- `resources/js/Pages/Common/PaymentFailed.jsx` (NEW)
- Display payment confirmation or error message
- Show booking details if successful
- Provide link back to "My Trips"

### 9. Update App Routes

**File:** `resources/js/app.jsx`

- Add routes for payment callback, success, and failed pages
```jsx
<Route path="/payment/callback" element={<PaymentCallback />} />
<Route path="/payment/success" element={<PaymentSuccess />} />
<Route path="/payment/failed" element={<PaymentFailed />} />
```


### 10. Environment Variables

**File:** `.env`

- Add ARC Pay credentials (obtain from ARC):
```bash
# ARC Pay Gateway Configuration
ARC_PAY_MERCHANT_ID=your_merchant_id_here
ARC_PAY_API_PASSWORD=your_api_password_here
ARC_PAY_API_VERSION=100
ARC_PAY_BASE_URL=https://api.arcpay.travel/api/rest/version/100

# For testing, use test credentials from ARC
# Production credentials require approval from ARC
```

**Obtaining Test Credentials:**
1. Contact ARC at: [https://www2.arccorp.com/support/arc-pay/](https://www2.arccorp.com/support/arc-pay/)
2. Request test merchant account for Gateway API
3. Receive merchant ID and API password
4. Use test card numbers provided by ARC for testing

**Authentication Method:**
- **Type:** Basic HTTP Authentication
- **Username:** `merchant.<merchantId>`
- **Password:** Your API password
- **Header:** `Authorization: Basic <base64(merchant.merchantId:apiPassword)>`


### 11. Admin Panel Updates

**File:** `resources/js/Pages/Admin/InquiryDetail.jsx`

- Display payment status in quote section
- Show payment transaction details if paid
- Add "View Payment" link to payment details

### 12. Inquiry Model - Status Update

**File:** `backend/models/inquiry.model.js`

- Ensure inquiry status can be updated to 'paid'
- Update status enum if needed

## Payment Flow Diagram

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

## API Endpoints Summary

### Internal API Endpoints
- `POST /api/payments?action=initiate-payment` - Create ARC payment session
- `GET /api/payments?action=payment-callback` - Handle ARC redirect and verify payment
- `GET /api/payments?action=get-payment-details&paymentId=X` - Get payment details for display

### ARC Pay Gateway API Endpoints
- `POST https://api.arcpay.travel/api/rest/version/100/merchant/{merchantId}/session`
  - **Purpose:** Initiate Hosted Checkout session
  - **Auth:** Basic HTTP Auth
  - **Returns:** `session.id`, `successIndicator`

- `GET https://api.arcpay.travel/api/rest/version/100/merchant/{merchantId}/order/{orderId}/transaction/{transactionId}`
  - **Purpose:** Retrieve transaction details for verification
  - **Auth:** Basic HTTP Auth
  - **Returns:** Transaction status, payment details, card info

### Frontend Routes
- `/payment/callback` - ARC redirect landing page (verifying)
- `/payment/success?paymentId=X` - Payment success confirmation
- `/payment/failed?error=X` - Payment failure page

## Database Status Updates

When payment is successful:

1. `payments.payment_status` = 'completed'
2. `payments.completed_at` = NOW()
3. `quotes.payment_status` = 'paid'
4. `quotes.paid_at` = NOW()
5. `quotes.status` = 'paid'
6. `inquiries.status` = 'paid'

## Testing Considerations

- Use ARC Pay test/sandbox mode initially
- Verify callback URL handling with query parameters
- Test failed payment scenarios
- Ensure status updates are atomic (use transactions)
- Validate payment amounts match quote amounts

## Technical Notes

### Security Considerations
- **PCI Compliance:** Card data never touches our servers (handled by ARC)
- **Verification:** Always verify `resultIndicator` matches `successIndicator` to prevent tampering
- **HTTPS Required:** All callbacks must use HTTPS in production
- **API Authentication:** Use Basic Auth with merchant credentials
- **Session Expiry:** ARC sessions expire automatically (typical: 30 minutes)

### Error Handling
- Handle network failures when calling ARC API
- Implement retry logic for transient failures
- Log all API requests/responses for debugging
- Show user-friendly error messages
- Provide support contact for payment issues

### Testing Strategy
1. Use ARC test credentials for development
2. Test with ARC-provided test card numbers
3. Test success, failure, and cancellation flows
4. Verify idempotency (prevent duplicate payments)
5. Test 3DS authentication flow
6. Verify webhook/callback handling

### Production Checklist
- [ ] Obtain production merchant credentials from ARC
- [ ] Update environment variables with production keys
- [ ] Ensure return URLs use HTTPS
- [ ] Configure proper error monitoring (Sentry, LogRocket, etc.)
- [ ] Set up payment reconciliation process
- [ ] Document refund procedure
- [ ] Test with small transaction first

### API Version
- Current integration uses API version **100**
- Monitor ARC changelog for updates: [https://api.arcpay.travel/api/documentation/apiDocumentation/rest-json/version/100/changelog.html](https://api.arcpay.travel/api/documentation/apiDocumentation/rest-json/version/100/changelog.html)
- Non-breaking changes are supported from version 100+

### Existing Code Reuse
- Existing payment routes in `backend/routes/payment.routes.js` may have ARC Pay configuration
- Review and integrate existing auth configuration if applicable
- Replace mock payment functionality in `api/payments.js` with real ARC Pay integration
- Payment table provides complete audit trail for compliance

### To-dos

- [ ] Create payments table with arc_session_id and success_indicator columns
- [ ] Implement POST /api/payments?action=initiate-payment with ARC Hosted Checkout API integration
- [ ] Implement GET /api/payments?action=payment-callback with resultIndicator verification
- [ ] Create backend/models/payment.model.js with methods: create, findBySessionId, updateStatus
- [ ] Add updatePaymentStatus method to backend/models/quote.model.js
- [ ] Add Checkout.js SDK integration and Pay Now button to InquiryDetail.jsx
- [ ] Create PaymentCallback.jsx with loading state and auto-redirect to backend
- [ ] Create PaymentSuccess.jsx displaying payment confirmation and booking details
- [ ] Create PaymentFailed.jsx with error message and retry option
- [ ] Add routes: /payment/callback, /payment/success, /payment/failed to app.jsx
- [ ] Display payment details (transaction ID, amount, date) in Admin InquiryDetail.jsx
- [ ] Add ARC Pay credentials to .env: MERCHANT_ID, API_PASSWORD, BASE_URL
- [ ] Obtain test credentials from ARC for development
- [ ] Test complete payment flow: initiate → hosted page → callback → verify → success
- [ ] Implement error handling and logging for all ARC API calls