# Jetsetterss — Hotel Search, Availability, and Booking Implementation Guide

This document gives an AI agent everything needed to implement the complete hotel flow using the existing codebase:
- Real Amadeus hotel search and booking (no mocks)
- Frontend integration (search → results → details → payment → booking confirmation)
- ARC Pay payment handoff
- Optional Supabase persistence of bookings

All paths and contracts match the current repository. Use only the backend endpoints provided; do not call Amadeus directly from the frontend.

---

## 1) Environment and Configuration

- Backend .env (already supported by the code):
```env
AMADEUS_API_KEY=YOUR_KEY
AMADEUS_API_SECRET=YOUR_SECRET
SUPABASE_URL=YOUR_SUPABASE_URL
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
ARC_PAY_API_URL=https://api.arcpay.travel/api/rest/version/77/merchant/TESTARC05511704
ARC_PAY_MERCHANT_ID=TESTARC05511704
ARC_PAY_API_USERNAME=Administrator
ARC_PAY_API_PASSWORD=Jetsetters@2025
PORT=5005
```

- Frontend .env (Vite):
```env
VITE_API_URL=http://localhost:5005/api
```

- Ensure the backend is started with PORT 5005 (or update `VITE_API_URL` accordingly).

---

## 2) Backend Endpoints (already implemented)

- Base: `/api/hotels`

### Hotel Search
- Method: `GET /api/hotels/search`
- File: `api/hotels.js` (handleHotelSearch function)
- Description: Calls real Amadeus API to search hotels by city with availability
- Query parameters:
  ```
  ?cityCode=PAR&checkInDate=2025-10-20&checkOutDate=2025-10-22&adults=2&radius=20&radiusUnit=KM
  ```
- Response:
  ```json
  {
    "success": true,
    "data": [ /* hotel offers with availability */ ],
    "meta": { "source": "amadeus-production-api" }
  }
  ```

### Hotel Destinations
- Method: `GET /api/hotels/destinations`
- File: `api/hotels.js` (handleDestinations function)
- Description: Returns popular hotel destinations
- Response:
  ```json
  {
    "success": true,
    "data": [ /* destination list */ ]
  }
  ```

### Hotel Booking
- Method: `POST /api/hotels/booking`
- File: `api/hotels.js` (bookHotel function)
- Description: Creates hotel booking with booking reference
- Request body:
  ```json
  {
    "hotelId": "RTPAR001",
    "offerId": "offer_123",
    "guestDetails": {
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "phone": "+1234567890"
    },
    "checkInDate": "2025-10-20",
    "checkOutDate": "2025-10-22",
    "totalPrice": 299.99,
    "currency": "USD"
  }
  ```
- Response:
  ```json
  {
    "success": true,
    "booking": {
      "bookingReference": "HTL1234567890ABCD",
      "status": "CONFIRMED",
      "hotelId": "RTPAR001",
      "offerId": "offer_123",
      "guestDetails": { /* guest info */ },
      "checkInDate": "2025-10-20",
      "checkOutDate": "2025-10-22",
      "totalPrice": 299.99,
      "currency": "USD",
      "createdAt": "2025-01-XX...",
      "paymentStatus": "PENDING"
    },
    "message": "Hotel booking created successfully"
  }
  ```

### Hotel Payment Processing
- Method: `POST /api/hotels/payment`
- File: `api/hotels.js` (createHotelPayment function)
- Description: Processes payment via ARC Pay gateway
- Request body:
  ```json
  {
    "bookingReference": "HTL1234567890ABCD",
    "amount": 299.99,
    "currency": "USD",
    "paymentMethod": "credit_card",
    "cardDetails": {
      "cardNumber": "4111111111111111",
      "expiryMonth": "12",
      "expiryYear": "2025",
      "cvv": "123",
      "cardholderName": "John Doe"
    },
    "billingAddress": {
      "street": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zipCode": "10001",
      "country": "US"
    }
  }
  ```
- Response:
  ```json
  {
    "success": true,
    "payment": {
      "transactionId": "TXN123456789",
      "status": "APPROVED",
      "amount": 299.99,
      "currency": "USD",
      "processedAt": "2025-01-XX..."
    },
    "message": "Payment processed successfully"
  }
  ```

---

## 3) Frontend Pages and Routing (already present)

- Routes in `resources/js/app.jsx`:
  - `/hotel-search` → `resources/js/Pages/Common/rentals/HotelSearch.jsx`
  - `/hotel-search-results` → `resources/js/Pages/Common/rentals/HotelSearchResults.jsx`
  - `/hotel-details` → hotel details page
  - `/hotel-booking-success` → booking confirmation page

- Search page file: `resources/js/Pages/Common/rentals/HotelSearch.jsx`
  - Contains the search form with destination, dates, travelers
  - On submit: call `GET /api/hotels/search` using `VITE_API_URL`
  - Navigate to results page with search results

- Results page file: `resources/js/Pages/Common/rentals/HotelSearchResults.jsx`
  - Displays hotel search results with filters and sorting
  - On hotel selection: navigate to details page with hotel data

Implementation checklist for the agent:
1. Wire the search form submit to `GET /api/hotels/search`.
2. Render the returned `data` (hotels) in the results section.
3. On hotel select, navigate to details page with hotel data.
4. On details page, collect guest information and room preferences.
5. Process payment via `POST /api/hotels/payment`.
6. After payment success, call `POST /api/hotels/booking`.
7. On success, navigate to confirmation page and display booking reference.

---

## 4) ARC Pay Integration (payment step)

- Payment should occur before calling `/api/hotels/booking`.
- Typical flow:
  1. User selects hotel and room.
  2. On booking page, collect guest details and show price summary.
  3. Initiate ARC Pay payment via `POST /api/hotels/payment`.
  4. On payment success, immediately call `POST /api/hotels/booking`.

Notes:
- Keep the exact total from the selected hotel offer.
- Store payment transaction ID and include it in booking payload.
- Handle payment failures gracefully with retry options.

---

## 5) Optional: Persist Bookings in Supabase

If you want to store bookings for My Trips, extend the booking handler to write to Supabase after successful booking:

Pseudo-code inside `POST /api/hotels/booking` success branch:
```js
// Example shape — adjust table/columns to your schema
await supabase
  .from('bookings')
  .insert({
    user_id: <authenticated_user_id_or_null>,
    booking_reference: bookingReference,
    travel_type: 'hotel',
    status: 'confirmed',
    total_amount: totalPrice,
    payment_status: 'paid',
    booking_details: {
      hotelId,
      offerId,
      guestDetails,
      checkInDate,
      checkOutDate,
      currency
    },
    passenger_details: guestDetails
  });
```

Requirements:
- Ensure `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set.
- Ensure RLS policies allow inserts from your backend (service role key preferred if writing sensitive fields).

---

## 6) Data Contracts (frontend ⇄ backend)

### Search Request (Query Parameters)
```
cityCode: "PAR" (IATA city code)
checkInDate: "YYYY-MM-DD"
checkOutDate: "YYYY-MM-DD"
adults: 2
radius: 20 (optional, default 20)
radiusUnit: "KM" (optional, default KM)
```

### Search Response
```json
{
  "success": true,
  "data": [
    {
      "hotelId": "RTPAR001",
      "name": "Hotel Example",
      "rating": 4.5,
      "address": "123 Example St, Paris",
      "amenities": ["wifi", "pool", "gym"],
      "offers": [
        {
          "offerId": "offer_123",
          "roomType": "Standard Room",
          "price": 299.99,
          "currency": "USD",
          "cancellationPolicy": "Free cancellation until 24h before"
        }
      ],
      "images": ["url1", "url2"],
      "location": {
        "latitude": 48.8566,
        "longitude": 2.3522
      }
    }
  ],
  "meta": { "source": "amadeus-production-api" }
}
```

### Booking Request
```json
{
  "hotelId": "RTPAR001",
  "offerId": "offer_123",
  "guestDetails": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "+1234567890"
  },
  "checkInDate": "2025-10-20",
  "checkOutDate": "2025-10-22",
  "totalPrice": 299.99,
  "currency": "USD"
}
```

### Booking Response
```json
{
  "success": true,
  "booking": {
    "bookingReference": "HTL1234567890ABCD",
    "status": "CONFIRMED",
    "hotelId": "RTPAR001",
    "offerId": "offer_123",
    "guestDetails": { /* guest info */ },
    "checkInDate": "2025-10-20",
    "checkOutDate": "2025-10-22",
    "totalPrice": 299.99,
    "currency": "USD",
    "createdAt": "2025-01-XX...",
    "paymentStatus": "PENDING"
  }
}
```

---

## 7) Example cURL tests

### Search Hotels
```bash
API_BASE="http://localhost:5005"
curl -s -X GET "$API_BASE/api/hotels/search?cityCode=PAR&checkInDate=2025-10-20&checkOutDate=2025-10-22&adults=2" | jq .
```

### Get Destinations
```bash
API_BASE="http://localhost:5005"
curl -s -X GET "$API_BASE/api/hotels/destinations" | jq .
```

### Book Hotel
```bash
API_BASE="http://localhost:5005"
curl -s -X POST "$API_BASE/api/hotels/booking" \
  -H "Content-Type: application/json" \
  -d '{
    "hotelId": "RTPAR001",
    "offerId": "offer_123",
    "guestDetails": {
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "phone": "+1234567890"
    },
    "checkInDate": "2025-10-20",
    "checkOutDate": "2025-10-22",
    "totalPrice": 299.99,
    "currency": "USD"
  }' | jq .
```

### Process Payment
```bash
API_BASE="http://localhost:5005"
curl -s -X POST "$API_BASE/api/hotels/payment" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingReference": "HTL1234567890ABCD",
    "amount": 299.99,
    "currency": "USD",
    "paymentMethod": "credit_card",
    "cardDetails": {
      "cardNumber": "4111111111111111",
      "expiryMonth": "12",
      "expiryYear": "2025",
      "cvv": "123",
      "cardholderName": "John Doe"
    },
    "billingAddress": {
      "street": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zipCode": "10001",
      "country": "US"
    }
  }' | jq .
```

---

## 8) Implementation Notes and Constraints

- No mock data: backend already uses real Amadeus via `backend/services/amadeusService.js`.
- Do not call Amadeus directly from the frontend. Always use `/api/hotels/...` endpoints.
- Keep the selected hotel offer object intact for booking; do not re-shape it on the client.
- Ensure `VITE_API_URL` matches the actual backend URL.
- For production deployments, secure environment variables and rotate API keys as needed.
- Hotel booking generates a unique booking reference (HTL prefix) for tracking.
- Payment processing is handled by ARC Pay gateway with proper error handling.

---

## 9) Success Criteria for the Agent

1. User can search hotels by destination and see real results with availability.
2. User can view hotel details and select room offers.
3. User can enter guest information and proceed to payment.
4. After successful payment, user receives a booking confirmation with booking reference.
5. (Optional) Booking is saved to Supabase and appears in My Trips.

If any API returns an error, surface a user-friendly message and log the `code`/`details` from the backend response for debugging.

---

## 10) Additional Features to Consider

- Hotel image galleries and virtual tours
- Guest reviews and ratings integration
- Hotel amenities filtering and search
- Price alerts and booking notifications
- Hotel comparison features
- Loyalty program integration
- Mobile-responsive design optimization
- Offline booking capabilities
- Multi-language support for international hotels
- Currency conversion and localization
