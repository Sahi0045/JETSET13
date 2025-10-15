## Jetsetterss — Flight Search, Pricing, and Booking Implementation Guide

This document gives an AI agent everything needed to implement the complete flight flow using the existing codebase:
- Real Amadeus flight search and booking (no mocks)
- Frontend integration (search → results → payment → booking confirmation)
- Optional price check step
- ARC Pay payment handoff
- Optional Supabase persistence of bookings

All paths and contracts match the current repository. Use only the backend endpoints provided; do not call Amadeus directly from the frontend.

---

### 1) Environment and Configuration

- Backend .env (already supported by the code):
```env
AMADEUS_API_KEY=YOUR_KEY
AMADEUS_API_SECRET=YOUR_SECRET
SUPABASE_URL=YOUR_SUPABASE_URL
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
PORT=5005
```

- Frontend .env (Vite):
```env
VITE_API_URL=http://localhost:5005/api
```

- Ensure the backend is started with PORT 5005 (or update `VITE_API_URL` accordingly).

---

### 2) Backend Endpoints (already implemented)

- Base: `/api/flights`

- Search flights
  - Method: `POST /api/flights/search`
  - File: `backend/routes/flight.routes.js`
  - Description: Calls real Amadeus API via `backend/services/amadeusService.js`, then transforms results for the frontend.
  - Request body:
    ```json
    {
      "from": "DEL",
      "to": "HYD",
      "departDate": "2025-10-20",
      "returnDate": "",
      "tripType": "one-way",
      "travelers": 1
    }
    ```
  - Response:
    ```json
    {
      "success": true,
      "data": [ /* transformed flight offers */ ],
      "meta": { "searchParams": { ... }, "resultCount": 10, "source": "amadeus-production-api" }
    }
    ```

- Price check (optional)
  - Method: `POST /api/flights/price`
  - File: `backend/routes/flight.routes.js`
  - Description: Re-price a selected flight offer before booking.

- Create order (booking)
  - Method: `POST /api/flights/order`
  - File: `backend/routes/flight.routes.js`
  - Description: Creates a real Amadeus booking (returns PNR and orderId).
  - Request body:
    ```json
    {
      "flightOffers": [ { /* full selected offer from search response */ } ],
      "travelers": [
        {
          "id": "1",
          "dateOfBirth": "1990-01-01",
          "name": { "firstName": "John", "lastName": "Doe" },
          "gender": "MALE",
          "contact": {
            "emailAddress": "john@example.com",
            "phones": [{ "deviceType": "MOBILE", "countryCallingCode": "1", "number": "5551234567" }]
          }
        }
      ],
      "contactEmail": "john@example.com",
      "contactPhone": "5551234567"
    }
    ```
  - Response:
    ```json
    {
      "success": true,
      "data": { /* Amadeus order data */ },
      "pnr": "AB12CD",
      "orderId": "eJz5...",
      "mode": "LIVE_AMADEUS_BOOKING",
      "message": "Flight order created successfully"
    }
    ```

---

### 3) Frontend Pages and Routing (already present)

- Routes in `resources/js/app.jsx`:
  - `/flights` → `resources/js/Pages/Common/flights/flightlanding.jsx`
  - `/flights/search` → `resources/js/Pages/Common/flights/flightsearchpage.jsx`
  - `/flight-payment` → payment/checkout page
  - `/flight-booking-success` → booking confirmation page

- Search page file: `resources/js/Pages/Common/flights/flightsearchpage.jsx`
  - Contains the search form and results rendering
  - On submit: call `POST /api/flights/search` using `VITE_API_URL`
  - When user selects an offer: navigate to payment page with the selected offer object (unmodified)

Implementation checklist for the agent:
1. Wire the search form submit to `POST /api/flights/search`.
2. Render the returned `data` (offers) in the results section.
3. On select, persist the chosen offer (e.g., in route state or local state management) and navigate to `/flight-payment`.
4. On the payment page, collect traveler details and contact info.
5. After ARC Pay success, call `POST /api/flights/order` with `{ flightOffers, travelers, contactEmail, contactPhone }`.
6. On success, navigate to `/flight-booking-success` and display `{ pnr, orderId }`.

---

### 4) ARC Pay Integration (payment step)

- Payment should occur before calling `/api/flights/order`.
- Typical flow:
  1. User selects flight offer.
  2. On payment page, collect passenger details and show price summary.
  3. Initiate ARC Pay payment (use existing payment integration in the repo under `api/payments` or backend `api/payments.js`).
  4. On payment success, immediately call `POST /api/flights/order`.

Notes:
- Keep the exact total from the chosen flight offer.
- Store a payment reference/transaction id. If needed, include it in the order payload or persist it alongside the booking.

---

### 5) Optional: Persist Bookings in Supabase

If you want to store bookings for My Trips, extend the order handler to write to Supabase after successful booking:

Pseudo-code inside `POST /api/flights/order` success branch:
```js
// Example shape — adjust table/columns to your schema
await supabase
  .from('bookings')
  .insert({
    user_id: <authenticated_user_id_or_null>,
    booking_reference: orderId,
    travel_type: 'flight',
    status: 'confirmed',
    total_amount: <derived_total_amount>,
    payment_status: 'paid',
    booking_details: orderResponse.data, // full order from Amadeus
    passenger_details: travelers
  });
```

Requirements:
- Ensure `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set.
- Ensure RLS policies allow inserts from your backend (service role key preferred if writing sensitive fields).

---

### 6) Data Contracts (frontend ⇄ backend)

- Search Request
```json
{
  "from": "IATA_ORIGIN",
  "to": "IATA_DEST",
  "departDate": "YYYY-MM-DD",
  "returnDate": "YYYY-MM-DD or empty",
  "tripType": "one-way|round-trip",
  "travelers": 1
}
```

- Search Response
```json
{
  "success": true,
  "data": [ { /* transformed flight offer */ } ],
  "meta": { "source": "amadeus-production-api", "resultCount": 10 }
}
```

- Order Request
```json
{
  "flightOffers": [ { /* exact offer selected from search */ } ],
  "travelers": [
    {
      "id": "1",
      "dateOfBirth": "1990-01-01",
      "name": { "firstName": "John", "lastName": "Doe" },
      "gender": "MALE",
      "contact": {
        "emailAddress": "john@example.com",
        "phones": [{ "deviceType": "MOBILE", "countryCallingCode": "1", "number": "5551234567" }]
      }
    }
  ],
  "contactEmail": "john@example.com",
  "contactPhone": "5551234567"
}
```

- Order Response
```json
{
  "success": true,
  "pnr": "AB12CD",
  "orderId": "eJz5...",
  "data": { /* Amadeus order payload */ }
}
```

---

### 7) Example cURL tests

- Search
```bash
API_BASE="http://localhost:5005"
curl -s -X POST "$API_BASE/api/flights/search" \
  -H "Content-Type: application/json" \
  -d '{
    "from":"DEL",
    "to":"HYD",
    "departDate":"2025-10-20",
    "travelers":1,
    "tripType":"one-way"
  }' | jq .
```

- Order (replace offer with a full offer object from search):
```bash
API_BASE="http://localhost:5005"
curl -s -X POST "$API_BASE/api/flights/order" \
  -H "Content-Type: application/json" \
  -d '{
    "flightOffers":[{ /* ...full selected offer... */ }],
    "travelers":[{
      "id":"1",
      "dateOfBirth":"1990-01-01",
      "name":{"firstName":"John","lastName":"Doe"},
      "gender":"MALE",
      "contact":{
        "emailAddress":"john@example.com",
        "phones":[{"deviceType":"MOBILE","countryCallingCode":"1","number":"5551234567"}]
      }
    }],
    "contactEmail":"john@example.com",
    "contactPhone":"5551234567"
  }' | jq .
```

---

### 8) Implementation Notes and Constraints

- No mock data: backend already uses real Amadeus via `backend/services/amadeusService.js`.
- Do not call Amadeus directly from the frontend. Always use `/api/flights/...` endpoints.
- Keep the selected offer object intact for booking; do not re-shape it on the client.
- Ensure `VITE_API_URL` matches the actual backend URL.
- For production deployments, secure environment variables and rotate API keys as needed.

---

### 9) Success Criteria for the Agent

1. User can search flights and see real results.
2. User can select an offer and proceed to payment.
3. After successful payment, user receives a real booking with `pnr` and `orderId`.
4. (Optional) Booking is saved to Supabase and appears in My Trips.

If any API returns an error, surface a user-friendly message and log the `code`/`details` from the backend response for debugging.


