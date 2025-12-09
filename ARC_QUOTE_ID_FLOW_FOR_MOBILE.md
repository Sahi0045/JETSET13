# ARC Pay Quote ID Flow for Mobile Implementation

## 📋 Current Situation

Your app has **two different payment flows**:

### 1. **Request/Inquiry Flow** (✅ Already Works)
- User creates inquiry via `/request`
- Admin creates quote: `POST /api/quotes` with `inquiry_id`
- User pays quote: `POST /api/payments?action=initiate-payment` with `{ quote_id }`
- **This flow already works** - quote_id comes from admin-created quotes

### 2. **Direct Booking Flow** (❌ Needs Migration)
- User selects flight/hotel/cruise
- User fills passenger details
- **Currently**: Uses `ArcPayService.initializePayment()` directly (bypasses quote system)
- **Should be**: Create quote first, then use quote_id for ARC Hosted Checkout

---

## 🎯 What Mobile Needs

For **direct bookings** (flights/hotels/cruises/packages), mobile needs to:

1. **Create a quote** with booking details
2. **Get `quote_id`** from the response
3. **Use `quote_id`** to initiate ARC Pay Hosted Checkout

---

## 🔧 Solution: Create Quote Endpoint for Mobile

### Option A: New Endpoint (Recommended)

**Endpoint**: `POST /api/quotes/create-for-booking`

**Request Body**:
```json
{
  "booking_type": "flight", // or "hotel", "cruise", "package"
  "title": "Flight Booking - JFK to LAX",
  "description": "Round trip flight booking",
  "total_amount": 450.00,
  "currency": "USD",
  "breakdown": {
    "base_fare": 400.00,
    "taxes": 30.00,
    "fees": 20.00
  },
  "booking_details": {
    "flight_offer": { /* Amadeus flight offer object */ },
    "travelers": [ /* passenger data */ ],
    "contact_info": { /* email, phone */ }
  },
  "customer_email": "user@example.com",
  "customer_name": "John Doe",
  "customer_phone": "+1234567890"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "quote-uuid-here",
    "quote_number": "Q-1764022622223-018",
    "inquiry_id": null, // or auto-create inquiry if needed
    "total_amount": 450.00,
    "currency": "USD",
    "status": "draft",
    "created_at": "2025-01-15T10:30:00Z"
  }
}
```

### Option B: Auto-Create Inquiry + Quote

**Endpoint**: `POST /api/quotes/create-for-booking` (same as Option A)

**Backend Logic**:
1. Auto-create inquiry if `inquiry_id` not provided:
   ```javascript
   const inquiry = await Inquiry.create({
     user_id: req.user.id,
     travel_type: booking_type, // "flight", "hotel", etc.
     customer_email: customer_email,
     customer_name: customer_name,
     customer_phone: customer_phone,
     status: "quoted", // Skip "pending" since quote is ready
     // ... other inquiry fields
   });
   ```

2. Create quote linked to inquiry:
   ```javascript
   const quote = await Quote.create({
     inquiry_id: inquiry.id,
     title: title,
     total_amount: total_amount,
     currency: currency,
     breakdown: breakdown,
     booking_details: booking_details, // Store flight/hotel data here
     status: "sent", // Ready for payment
     // ... other quote fields
   });
   ```

3. Return quote with `quote_id`

---

## 📱 Mobile Implementation Flow

### Step 1: User Selects Flight/Hotel/Cruise

```javascript
// FlightPaymentScreen.jsx (or similar)
const selectedFlight = { /* Amadeus flight offer */ };
const passengerData = [ /* traveler details */ ];
const totalAmount = 450.00;
```

### Step 2: Create Quote Before Payment

```javascript
const createQuoteForBooking = async (bookingData) => {
  const token = await AsyncStorage.getItem('auth_token');
  
  const response = await axios.post(
    'https://www.jetsetterss.com/api/quotes/create-for-booking',
    {
      booking_type: 'flight',
      title: `Flight Booking - ${bookingData.origin} to ${bookingData.destination}`,
      description: 'Flight booking via mobile app',
      total_amount: bookingData.totalAmount,
      currency: 'USD',
      breakdown: {
        base_fare: bookingData.baseFare,
        taxes: bookingData.taxes,
        fees: bookingData.fees
      },
      booking_details: {
        flight_offer: bookingData.selectedFlight,
        travelers: bookingData.passengerData,
        contact_info: {
          email: bookingData.customerEmail,
          phone: bookingData.customerPhone
        }
      },
      customer_email: bookingData.customerEmail,
      customer_name: bookingData.customerName,
      customer_phone: bookingData.customerPhone
    },
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  return response.data.data; // Returns quote object with id
};
```

### Step 3: Use Quote ID for ARC Pay

```javascript
// After quote is created
const quote = await createQuoteForBooking(bookingData);
const quoteId = quote.id;

// Now use existing ARC Pay flow
const paymentResult = await PaymentService.initiatePayment(quoteId);

// Navigate to ArcPaymentScreen with paymentPageUrl
navigation.navigate('ArcPayment', {
  paymentPageUrl: paymentResult.paymentPageUrl,
  quoteId: quoteId,
  sessionId: paymentResult.sessionId
});
```

---

## 🔄 Complete Mobile Flow

```
1. User selects flight/hotel/cruise
   ↓
2. User fills passenger/contact details
   ↓
3. Mobile calls: POST /api/quotes/create-for-booking
   ↓
4. Backend creates inquiry + quote
   ↓
5. Backend returns: { quote_id, quote_number, total_amount }
   ↓
6. Mobile calls: POST /api/payments?action=initiate-payment
   Body: { quote_id }
   ↓
7. Backend calls ARC Pay INITIATE_CHECKOUT
   ↓
8. Backend returns: { sessionId, paymentPageUrl }
   ↓
9. Mobile opens WebView with paymentPageUrl
   ↓
10. User completes payment (3DS handled in WebView)
    ↓
11. ARC redirects to: /payment/callback?resultIndicator=...&sessionId=...
    ↓
12. Mobile captures callback URL
    ↓
13. Mobile calls: GET /api/payments?action=payment-callback
    Params: { resultIndicator, sessionId, quote_id }
    ↓
14. Backend verifies with ARC Pay, calls PAY API
    ↓
15. Backend updates payment status in Supabase
    ↓
16. Mobile shows PaymentSuccessScreen
```

---

## 🛠️ Backend Implementation Needed

### File: `api/quotes.js`

Add new handler:

```javascript
// POST /api/quotes/create-for-booking
if (method === 'POST' && query.action === 'create-for-booking') {
  // Require authentication
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  const {
    booking_type, // "flight", "hotel", "cruise", "package"
    title,
    description,
    total_amount,
    currency = 'USD',
    breakdown = {},
    booking_details = {}, // Store flight/hotel data here
    customer_email,
    customer_name,
    customer_phone
  } = req.body;

  try {
    // 1. Auto-create inquiry
    const inquiryData = {
      user_id: req.user.id,
      travel_type: booking_type,
      customer_email: customer_email || req.user.email,
      customer_name: customer_name || req.user.name,
      customer_phone: customer_phone,
      status: 'quoted', // Skip "pending" since quote is ready
      // Add other inquiry fields as needed
    };

    const inquiry = await Inquiry.create(inquiryData);

    // 2. Create quote
    const quoteData = {
      inquiry_id: inquiry.id,
      quote_number: Quote.generateQuoteNumber(),
      title: title || `${booking_type} Booking`,
      description: description || '',
      total_amount: parseFloat(total_amount),
      currency: currency,
      breakdown: breakdown,
      booking_details: booking_details, // Store flight/hotel data
      status: 'sent', // Ready for payment
      validity_days: 30
    };

    const quote = await Quote.create(quoteData);

    return res.status(201).json({
      success: true,
      message: 'Quote created successfully',
      data: quote
    });
  } catch (error) {
    console.error('Create quote for booking error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create quote',
      error: error.message
    });
  }
}
```

---

## ✅ Summary

**For Mobile to use ARC Hosted Checkout:**

1. ✅ **Backend**: Create `POST /api/quotes/create-for-booking` endpoint
2. ✅ **Mobile**: Call this endpoint BEFORE payment initiation
3. ✅ **Mobile**: Use returned `quote_id` for `POST /api/payments?action=initiate-payment`
4. ✅ **Mobile**: Follow existing ARC Hosted Checkout flow (WebView + callback)

**This unifies both flows** (request/inquiry and direct bookings) to use the same quote-based payment system.

---

## 📝 Next Steps

1. **Implement backend endpoint** `POST /api/quotes/create-for-booking`
2. **Update mobile FlightPaymentScreen** to create quote first
3. **Test flow**: Flight selection → Quote creation → ARC Pay → Success
4. **Repeat for**: Hotel, Cruise, Package bookings

---

**Document Status**: ✅ **READY FOR IMPLEMENTATION**  
**Last Updated**: January 2025

