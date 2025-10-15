# Jetsetterss — Vacation Packages Search, Details, and Booking Implementation Guide

This document gives an AI agent everything needed to implement the complete vacation packages flow using the existing codebase:
- Package search and discovery (predefined packages with itineraries)
- Package details and itinerary viewing
- Package booking with traveler information
- ARC Pay payment handoff
- Optional Supabase persistence of bookings

All paths and contracts match the current repository. Packages are predefined travel itineraries with fixed pricing and inclusions.

---

## 1) Environment and Configuration

- Backend .env (already supported by the code):
```env
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

## 2) Backend Endpoints (to be implemented)

- Base: `/api/packages`

### Package Search
- Method: `GET /api/packages/search`
- Description: Returns available vacation packages with filtering options
- Query parameters:
  ```
  ?destination=dubai&packageType=All Inclusive&minPrice=500&maxPrice=3000&duration=5 Days
  ```
- Response:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": 1,
        "title": "Burj Khalifa Experience",
        "location": "Dubai",
        "destination": "dubai",
        "image": "https://images.unsplash.com/photo-1582672060674-bc2bd808a8b5",
        "rating": 4.9,
        "reviews": 128,
        "price": 1299,
        "duration": "5 Days",
        "discount": 15,
        "packageType": "All Inclusive",
        "features": ["5-Star Hotel", "Guided Tours", "Airport Transfer"],
        "highlights": ["At The Top Burj Khalifa", "Dubai Mall Shopping"],
        "included": ["Luxury Hotel Stay", "Daily Breakfast", "Airport Transfers"]
      }
    ],
    "meta": { "total": 50, "destinations": ["dubai", "europe", "kashmir", "northEast"] }
  }
  ```

### Package Details
- Method: `GET /api/packages/:id`
- Description: Returns detailed package information including full itinerary
- Response:
  ```json
  {
    "success": true,
    "data": {
      "id": 1,
      "title": "Burj Khalifa Experience",
      "location": "Dubai",
      "destination": "dubai",
      "image": "https://images.unsplash.com/photo-1582672060674-bc2bd808a8b5",
      "rating": 4.9,
      "reviews": 128,
      "price": 1299,
      "duration": "5 Days",
      "discount": 15,
      "packageType": "All Inclusive",
      "features": ["5-Star Hotel", "Guided Tours", "Airport Transfer"],
      "highlights": ["At The Top Burj Khalifa", "Dubai Mall Shopping"],
      "included": ["Luxury Hotel Stay", "Daily Breakfast", "Airport Transfers"],
      "itinerary": [
        {
          "day": 1,
          "title": "Arrival in Dubai",
          "activities": ["Airport pickup", "Hotel check-in", "Welcome dinner"],
          "meals": ["Dinner"],
          "accommodation": "5-Star Hotel"
        },
        {
          "day": 2,
          "title": "City Tour & Burj Khalifa",
          "activities": ["Dubai Mall", "At The Top Burj Khalifa", "Musical Fountains"],
          "meals": ["Breakfast", "Lunch"],
          "accommodation": "5-Star Hotel"
        }
      ],
      "terms": ["Free cancellation up to 7 days", "Travel insurance recommended"],
      "images": ["url1", "url2", "url3"]
    }
  }
  ```

### Package Booking
- Method: `POST /api/packages/booking`
- Description: Creates package booking with traveler details
- Request body:
  ```json
  {
    "packageId": 1,
    "travelDate": "2025-10-20",
    "travelers": [
      {
        "firstName": "John",
        "lastName": "Doe",
        "email": "john@example.com",
        "phone": "+1234567890",
        "dateOfBirth": "1990-01-01",
        "passportNumber": "A1234567",
        "passportExpiry": "2030-01-01",
        "nationality": "US"
      }
    ],
    "specialRequests": "Vegetarian meals",
    "totalPrice": 1299,
    "currency": "USD"
  }
  ```
- Response:
  ```json
  {
    "success": true,
    "booking": {
      "bookingReference": "PKG1234567890ABCD",
      "status": "CONFIRMED",
      "packageId": 1,
      "travelDate": "2025-10-20",
      "travelers": [ /* traveler details */ ],
      "totalPrice": 1299,
      "currency": "USD",
      "createdAt": "2025-01-XX...",
      "paymentStatus": "PENDING"
    },
    "message": "Package booking created successfully"
  }
  ```

### Package Payment Processing
- Method: `POST /api/packages/payment`
- Description: Processes payment via ARC Pay gateway
- Request body:
  ```json
  {
    "bookingReference": "PKG1234567890ABCD",
    "amount": 1299,
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
      "amount": 1299,
      "currency": "USD",
      "processedAt": "2025-01-XX..."
    },
    "message": "Payment processed successfully"
  }
  ```

---

## 3) Frontend Pages and Routing (already present)

- Routes in `resources/js/app.jsx`:
  - `/packages` → `resources/js/Pages/Common/packages/planding.jsx`
  - `/packages/itinerary` → `resources/js/Pages/Common/packages/itp.jsx`
  - `/packages/booking-summary` → `resources/js/Pages/Common/packages/PackageBookingSummary.jsx`

- Landing page file: `resources/js/Pages/Common/packages/planding.jsx`
  - Displays all available packages with search and filtering
  - Package cards with images, pricing, ratings, and features
  - Search by destination, package type, price range
  - On package select: navigate to itinerary page

- Itinerary page file: `resources/js/Pages/Common/packages/itp.jsx`
  - Shows detailed package information and day-by-day itinerary
  - Package highlights, inclusions, and terms
  - Quote request form and booking button
  - On book: navigate to booking summary page

- Booking summary file: `resources/js/Pages/Common/packages/PackageBookingSummary.jsx`
  - Collects traveler information and special requests
  - Payment processing via ARC Pay
  - Booking confirmation with reference number

Implementation checklist for the agent:
1. Wire the package search to `GET /api/packages/search`.
2. Display packages in grid layout with filtering options.
3. On package select, navigate to itinerary page with package details.
4. On itinerary page, show full package information and day-by-day itinerary.
5. On booking, collect traveler details and process payment.
6. After payment success, call `POST /api/packages/booking`.
7. On success, show booking confirmation with reference number.

---

## 4) Package Data Structure

Packages are stored in `resources/js/data/packages.json` with the following structure:

```json
{
  "dubai": {
    "title": "Luxury Escapes",
    "subtitle": "Discover Luxury and Adventure",
    "packages": [
      {
        "id": 1,
        "title": "Burj Khalifa Experience",
        "location": "Dubai",
        "destination": "dubai",
        "image": "https://images.unsplash.com/photo-1582672060674-bc2bd808a8b5",
        "rating": 4.9,
        "reviews": 128,
        "price": 1299,
        "duration": "5 Days",
        "discount": 15,
        "packageType": "All Inclusive",
        "features": ["5-Star Hotel", "Guided Tours", "Airport Transfer"],
        "highlights": ["At The Top Burj Khalifa", "Dubai Mall Shopping"],
        "included": ["Luxury Hotel Stay", "Daily Breakfast", "Airport Transfers"]
      }
    ]
  }
}
```

---

## 5) ARC Pay Integration (payment step)

- Payment should occur before calling `/api/packages/booking`.
- Typical flow:
  1. User selects package and views itinerary.
  2. On booking page, collect traveler details and show price summary.
  3. Initiate ARC Pay payment via `POST /api/packages/payment`.
  4. On payment success, immediately call `POST /api/packages/booking`.

Notes:
- Keep the exact total from the selected package.
- Store payment transaction ID and include it in booking payload.
- Handle payment failures gracefully with retry options.

---

## 6) Optional: Persist Bookings in Supabase

If you want to store bookings for My Trips, extend the booking handler to write to Supabase after successful booking:

Pseudo-code inside `POST /api/packages/booking` success branch:
```js
// Example shape — adjust table/columns to your schema
await supabase
  .from('bookings')
  .insert({
    user_id: <authenticated_user_id_or_null>,
    booking_reference: bookingReference,
    travel_type: 'package',
    status: 'confirmed',
    total_amount: totalPrice,
    payment_status: 'paid',
    booking_details: {
      packageId,
      travelDate,
      travelers,
      specialRequests,
      currency
    },
    passenger_details: travelers
  });
```

Requirements:
- Ensure `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set.
- Ensure RLS policies allow inserts from your backend (service role key preferred if writing sensitive fields).

---

## 7) Data Contracts (frontend ⇄ backend)

### Search Request (Query Parameters)
```
destination: "dubai" (optional)
packageType: "All Inclusive" (optional)
minPrice: 500 (optional)
maxPrice: 3000 (optional)
duration: "5 Days" (optional)
```

### Search Response
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "Burj Khalifa Experience",
      "location": "Dubai",
      "destination": "dubai",
      "image": "https://images.unsplash.com/photo-1582672060674-bc2bd808a8b5",
      "rating": 4.9,
      "reviews": 128,
      "price": 1299,
      "duration": "5 Days",
      "discount": 15,
      "packageType": "All Inclusive",
      "features": ["5-Star Hotel", "Guided Tours", "Airport Transfer"],
      "highlights": ["At The Top Burj Khalifa", "Dubai Mall Shopping"],
      "included": ["Luxury Hotel Stay", "Daily Breakfast", "Airport Transfers"]
    }
  ],
  "meta": { "total": 50, "destinations": ["dubai", "europe", "kashmir", "northEast"] }
}
```

### Booking Request
```json
{
  "packageId": 1,
  "travelDate": "2025-10-20",
  "travelers": [
    {
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "phone": "+1234567890",
      "dateOfBirth": "1990-01-01",
      "passportNumber": "A1234567",
      "passportExpiry": "2030-01-01",
      "nationality": "US"
    }
  ],
  "specialRequests": "Vegetarian meals",
  "totalPrice": 1299,
  "currency": "USD"
}
```

### Booking Response
```json
{
  "success": true,
  "booking": {
    "bookingReference": "PKG1234567890ABCD",
    "status": "CONFIRMED",
    "packageId": 1,
    "travelDate": "2025-10-20",
    "travelers": [ /* traveler details */ ],
    "totalPrice": 1299,
    "currency": "USD",
    "createdAt": "2025-01-XX...",
    "paymentStatus": "PENDING"
  }
}
```

---

## 8) Example cURL tests

### Search Packages
```bash
API_BASE="http://localhost:5005"
curl -s -X GET "$API_BASE/api/packages/search?destination=dubai&packageType=All Inclusive" | jq .
```

### Get Package Details
```bash
API_BASE="http://localhost:5005"
curl -s -X GET "$API_BASE/api/packages/1" | jq .
```

### Book Package
```bash
API_BASE="http://localhost:5005"
curl -s -X POST "$API_BASE/api/packages/booking" \
  -H "Content-Type: application/json" \
  -d '{
    "packageId": 1,
    "travelDate": "2025-10-20",
    "travelers": [
      {
        "firstName": "John",
        "lastName": "Doe",
        "email": "john@example.com",
        "phone": "+1234567890",
        "dateOfBirth": "1990-01-01",
        "passportNumber": "A1234567",
        "passportExpiry": "2030-01-01",
        "nationality": "US"
      }
    ],
    "specialRequests": "Vegetarian meals",
    "totalPrice": 1299,
    "currency": "USD"
  }' | jq .
```

### Process Payment
```bash
API_BASE="http://localhost:5005"
curl -s -X POST "$API_BASE/api/packages/payment" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingReference": "PKG1234567890ABCD",
    "amount": 1299,
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

## 9) Implementation Notes and Constraints

- Packages are predefined travel itineraries with fixed pricing and inclusions.
- No real-time pricing or availability checks needed (unlike flights/hotels).
- Package data is stored in JSON files and can be managed through admin interface.
- Ensure `VITE_API_URL` matches the actual backend URL.
- For production deployments, secure environment variables and rotate API keys as needed.
- Package booking generates a unique booking reference (PKG prefix) for tracking.
- Payment processing is handled by ARC Pay gateway with proper error handling.

---

## 10) Success Criteria for the Agent

1. User can search and filter vacation packages by destination, type, and price.
2. User can view detailed package information including day-by-day itinerary.
3. User can enter traveler information and special requests.
4. User can process payment and receive booking confirmation with reference number.
5. (Optional) Booking is saved to Supabase and appears in My Trips.

If any API returns an error, surface a user-friendly message and log the `code`/`details` from the backend response for debugging.

---

## 11) Additional Features to Consider

- Package comparison functionality
- Wishlist/favorites for packages
- Package reviews and ratings system
- Seasonal pricing and promotions
- Group booking discounts
- Package customization options
- Travel insurance integration
- Mobile-responsive design optimization
- Offline package browsing capabilities
- Multi-language support for international packages
- Currency conversion and localization
- Package recommendation engine based on user preferences
