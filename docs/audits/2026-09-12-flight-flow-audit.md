# Flight booking flow — adversarial audit, 2026-09-12

**Verdict: not production-ready, independent of Amadeus certification.**

> **Status 2026-09-13 — PR #90 merged and deployed (Lightsail + Vercel), verified live.**
> Closed: Theme 1 blockers *`/order` never verifies payment* and *unauthenticated success endpoints*
> (all four now 404 in production); Theme 2 *HTTP 2xx as "money moved"* at all four sites and the
> *`partially_refunded` on a refused refund*; Theme 2 High *reversal amount from `req.body`*;
> Theme 5 *`readIssueTicketReply` issued on empty status*, *`buildBookingRow` literals*,
> *`needs_review` verdict discarded*, *alarm blind to the majority case* (fired for 6 rows on deploy).
> **PR #91 (2026-09-13, Vercel + Lightsail, verified in the served bundle)** closed the Theme 4
> blockers *mock booking on refresh* (fixture and `transformBookingData` deleted) and *ManageBooking
> inline PDF* (−299 lines, now renders `FlightETicket`; its `hidden` wrapper fixed — display:none is a
> blank PDF under html2canvas), and the Theme 6 blocker *`setBookingData`* (plus the failure branch
> that reported success on refusal, and the $0 amounts read from the wrong object).
> **PR #92 (2026-09-12, Vercel + Lightsail, verified in the served bundle and inside the container)**
> closed the Theme 2 blockers *cancellation email promises a failed refund* (branches on `paymentAction`)
> and *Manage Booking "Processing Refund — In Progress"* (list transform now sends `cancellation`,
> `tickets`, `needs_review`, `gds`, `payment_status` via exported `toClientBooking()`); the Theme 4
> blockers *`/booking-confirmation` unconditional* and *`FlightCreateOrders` fabrications*; the Theme 1
> High *`paymentVerified` constant*; the Theme 5 Highs *"Booking Confirmed!" for 202s* and *Manage
> Booking ticket state always `'none'`*; plus the ManageBooking sandbox-notice Lows.
> Still open from the first batch: *charge computed on the client* (server-side re-pricing — own PR).
> Everything not listed above remains open.

Three parallel read-only audits of the flight flow (search → pricing → payment → booking chain →
persistence → confirmation → email → My Trips → Manage Booking → cancellation), hunting one class of
defect: **anything a customer-facing surface asserts that the data does not prove** — fabricated
values, plausible fallbacks, mock branches, unconditional "confirmed"/"paid" copy, HTTP status
treated as business success, dead pages that look live.

Why this audit: the same day, `FlightETicket.jsx` was found printing `Math.random()` ticket numbers
on a PDF headed "E-Ticket", months after shipping, with green CI throughout. Tests and deploy
verification do not catch a UI that lies. This document is what a deliberate hunt found.

| Severity | Count | Meaning |
|---|---|---|
| Blocker | 23 | customer charged without a booking, booking without payment, false "refunded"/"ticketed", or fabricated data on a payment surface |
| High | 27 | wrong state persisted or shown |
| Medium | 25 | edge-case risk, misleading copy |
| Low | 22 | hygiene |

Production context at time of audit: `AMADEUS_WS_ENABLED=true`, `AMADEUS_WS_BOOKING_ENABLED=false`,
`AUTO_TICKET=false`, `MIN_PAYMENT_RATIO=0.8`, `MAX_CONCURRENCY=15`. **No ticket has ever been issued
on this system.** Every order today therefore takes the `refundOnFulfillmentFailure` path.

---

## Theme 1 — Payment can be bypassed (exploitable)

### BLOCKER · `/order` never verifies the payment was captured
`backend/routes/flight.routes.js:1493`
```js
paidAmount: existing?.total_amount != null ? Number(existing.total_amount) : undefined,
```
`total_amount` is written at **session-creation** (`checkout.handlers.js:485-491`) from `req.body.amount`
of the unauthenticated `?action=hosted-checkout`, on a row explicitly `payment_status: 'unpaid'`.
`/order` never reads `payment_status`. The payment-coverage guard compares the fare against a number
the client chose.

Browser-only exploit: abandon the ARC page → navigate to `/payment/callback?orderId=…&bookingType=flight`
→ `get-pending-booking` 403s (no `resultIndicator`) → falls back to `localStorage.pendingFlightBooking`
(`PaymentCallback.jsx:115-131`) → sets `paymentVerified: true` (`:182`) → `FlightCreateOrders` books.

**Fix:** require `existing.payment_status === 'paid'` (or run `handleReconcileBookingPayment` inline and
refuse on `paid:false`); pass the ARC-captured transaction amount as `paidAmount`, never `bookings.total_amount`.

### BLOCKER · Charge amount computed on the client, never re-derived
`frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx:754-756, 828-846` → `backend/routes/payment/checkout.handlers.js:185-206, 265-271`
```js
const { amount, ... } = req.body;   // server takes it verbatim
order: { id: orderId, amount: parseFloat(amount).toFixed(2), ... }
```
`originalOffer` is in the same payload and is never priced. Coupon path (`coupon.routes.js:90-127`)
computes `finalTotal` from a client-supplied `orderTotal`.
**Fix:** re-price `originalOffer` via `FlightProvider.priceFlightOffer` in the checkout handler, apply
server-side fee/coupon, reject if the client `amount` differs beyond a cent.

### BLOCKER · Three unauthenticated payment endpoints return success without calling ARC
`backend/routes/payment/rest.routes.js` — mounted via `router.use(restRoutes)` (`payment.routes.js:134`), live.
- `POST /payment/process` `:372-395` — `const isValidSecureTestCard = true; // always allow for testing`;
  returns `result:'SUCCESS'`, fabricated `AUTH-FALLBACK-…` code, for any card number on any non-400/401
  ARC error. Also accepts raw PAN+CVV in JSON (PCI scope). The "real" branch `:323` never inspects
  `arcPayResponse.data.result`.
- `GET /payment/verify/:orderId` `:424-446` — `status: 'VERIFIED'` for every input, no ARC call, no DB read.
  This is what `ArcPayService.verifyPayment()` (`FlightCreateOrders.jsx:137`) resolves against.
- `POST /payment/refund` `:471-490` — `status: 'PROCESSED'`, invented `REFUND-…` id, no ARC call.
- `POST /order/create` `:139-168` — `catch` returns `success: true, mode: 'SECURE-FALLBACK'` (Low).
**Fix:** delete all four; the real implementations are `handleReconcileBookingPayment` and `handlePaymentRefund`.

### BLOCKER · `complete-payment-link` marks any booking paid + confirmed on an unverified POST
`backend/routes/payment/links.handlers.js:358-367` — `resultIndicator` (`:342`) is stored, never compared to
`success_indicator`; no RETRIEVE_ORDER; dispatched with `optionalProtect` only. `PaymentCallback.jsx:53-61`
even sends `resultIndicator: resultIndicator || ''`.
**Fix:** verify `resultIndicator === success_indicator` AND RETRIEVE_ORDER before any write.

### HIGH · `paymentVerified` is a constant `true`
`frontend/src/Pages/Common/flights/FlightCreateOrders.jsx:88` — `orderData?.paymentVerified || true`.
The `arcPayPaymentId` verification block `:136-141` is unreachable (never set), and would hit the
always-VERIFIED endpoint anyway. **Fix:** delete; the server is the only place payment is verified.

### HIGH · Reversal amount comes from `req.body`
`flight.routes.js:1213-1216, 1273, 1595` → `operations.handlers.js:940` prefers `amount` (client) over
`captured.transaction.amount`. A client posting `totalAmount: 1.00` gets a $1 refund on a $900 charge, and
the row is written `refunded`. **Fix:** always refund `captured.transaction.amount`.

### MEDIUM · `resolveBookingUserId` accepts any UUID from the body
`backend/utils/bookingOwner.js:30-32` — a guest POST with someone else's user id files the booking, its PII,
and cancel/refund rights under that account. **Fix:** refuse when `req.user` is present and differs.

### MEDIUM · Reconciliation is browser-driven only; no ARC webhook
`PaymentCallback.jsx:140-152` fires `reconcile-booking-payment` best-effort and ignores the answer. A customer
who closes the tab after paying leaves `pending/unpaid` with money captured. `handleReconcileBookingPayment`
is correct code with no reliable trigger.

### MEDIUM · Reconcile marks `paid` without comparing captured amount
`checkout.handlers.js:1024-1046` — any SUCCESS PAYMENT/CAPTURE → `paid`, no amount check; also writes
`status: 'paid'`, outside the `pending|confirmed|cancelled` vocabulary.

### MEDIUM · `gateway-status` is a constant
`payment.routes.js:52-56` — always `OPERATING`; `FlightPayment.jsx:365-370` treats it as a real check.

---

## Theme 2 — Failed refunds recorded as successful

### BLOCKER · HTTP 2xx treated as "money moved" at all four ARC reversal sites
`backend/routes/payment/operations.handlers.js:248, 320, 368, 944-951`
```js
if (refundResponse.status >= 200 && refundResponse.status < 300) {
    console.log('✅ ARC Pay REFUND successful:', refundData.result);   // logs "FAILURE", continues
    cancellationResult.paymentProcessed = true;
```
MPGS/ARC answers **HTTP 200 with `result:"FAILURE"`** for a declined refund. The VOID branch `:935` checks
`result === 'SUCCESS'`; the REFUND branches never did. `paymentProcessed = true` drives
`payment_status: 'refunded'|'partially_refunded'` (`:396-399`), the `payments` row flip (`:258`), and the
cancellation email's `refundAmount`. Site `:944` feeds `refundOnFulfillmentFailure` — **the path every
booking takes today** — and tells the customer "your payment has been reversed".
**Fix:** one helper `arcSucceeded(resp) => resp.status<300 && resp.data?.result === 'SUCCESS'` at all four
sites; drop the `|| !voidResp.data?.result` escape at `:935`.

### BLOCKER (known, unfixed) · A failed refund writes `partially_refunded`
`operations.handlers.js:404-406` — status chosen from whether a refund was *attempted*. `E2ETEST-MTNHB01H`:
`REFUND_FAILED`, `refundAmount: 0`, stored `cancelled/partially_refunded`.

### BLOCKER · Cancellation email promises a refund that failed, and quotes $0.00
`backend/services/email/templates.js:612-632` — no branch for `REFUND_FAILED` / `NO_REFUND_FEE_COVERS` /
`MANUAL_PROCESS_REQUIRED`. Sends "$0.00 refund due" + "reaches your bank in 5-10 business days". For
`MANUAL_PROCESS_REQUIRED` nobody will ever chase it. **Fix:** pass `paymentAction` and branch; never render
the 5-10 day box unless a refund went out.

### BLOCKER · Manage Booking shows "Processing Refund — In Progress" for a failed refund
`ManageBooking.jsx:199-207, 216-228, 341-343` — the `/flights/bookings` list transform
(`flight.routes.js:2088-2168`) emits no `cancellation`/`paymentAction`/`payment_status`, and My Trips
passes that object via router state, so `paymentAction` is always `undefined` → `isPending` true →
pulsing "In Progress", "Refund Status: Pending", and **emerald `$0.00` "Net Refund Total"**.
**Fix:** add `cancellation`, `needs_review`, `payment_status`, `tickets` to the list transform.

### HIGH · `refundOnFulfillmentFailure` writes `cancelled` even when the reversal failed
`flight.routes.js:70-77` — `status: 'cancelled'` unconditionally; `selectUnannounced` drops cancelled rows,
so charged-no-booking-refund-failed is **invisible to the money alarm**.
**Fix:** on `!reversal.reversed` write `needs_review: { reason: 'charge not reversed' }`.

### HIGH · My Trips cancel feedback hides a failed refund
`mytrips.jsx:999` — `result.cancellation?.refundAmount ? …` — `0` is falsy, so the customer sees a bare
`alert('Booking cancelled successfully')` on `REFUND_FAILED`.

### MEDIUM · `alreadyReversed` treats any prior partial refund as complete
`operations.handlers.js:911-915` — a prior (amount − $50) refund makes a later full reversal return
`reversed: true` having moved nothing. Compare summed refund amounts against captured, not presence.

### LOW · Net-refund fallback computes and displays the refund the customer did not get
`ManageBooking.jsx:342` — masked today by the list-transform bug above; goes live when that is fixed.

---

## Theme 3 — Wrong amounts charged

### BLOCKER · Multi-passenger bookings charged N×
`FlightBookingConfirmation.jsx:536-541` — `baseFare` is the Amadeus **offer total** (all passengers, per
`mappers/offer.js:230-238`) and is multiplied by `passengerCount` again. Two adults → four fares.
Per-passenger figures sit unused in `offer.travelerPricings[].price`.
**Fix:** sum `travelerPricings[].price` per PTC, or treat `price.total` as final.

### BLOCKER · $90 of phantom ancillaries, including insurance that does not exist
`FlightBookingConfirmation.jsx:369-399, 252, 400, 541, 808-818` — hardcoded "Travel Insurance $25 …
Medical emergency coverage", "Airport Transfer $35", `vipServiceFee: 30`; folded into `totalAmount`;
`selectedAddons`/`vipService` **not in the payload**; no SSR/insurance record anywhere.
**Fix:** remove until each is a real, transmitted, fulfilled product.

### HIGH · The offer *id* is sent as the flight number to the card network
`FlightBookingConfirmation.jsx:759` — `` `${airline.code || 'XX'} ${rawFlightData?.id || '000'}` `` →
statement description "Flight AI 1 - DEL to BOM". The display path was fixed (`:286-288`); this one was not.

### LOW · A fabricated ticket number is sent to the card network on every checkout
`checkout.handlers.js:412` — `${depCode}${Date.now()…}${arrCode}` into `airline.ticket.ticketNumber`.

### HIGH · Currency defaulted to the viewer's, and the UI assumes USD
`flightsearchpage.jsx:643` (`|| currencyService.getCurrency()`), `flight.routes.js:794`,
`FlightBookingConfirmation.jsx:85` (`|| 'EUR'`), `:358`, `:836` (hardcoded `'USD'` on checkout),
`Price.jsx:57-59` ("Assume amount is in USD"). Masked only by `AMADEUS_WS_CURRENCY=USD`.

### MEDIUM · Seats with no price data are free
`FlightSeatMap.jsx:40` — `tp?.price ? … : 0`.

---

## Theme 4 — Fabricated or mock data on live pages

### BLOCKER · Review page loads a hardcoded mock booking on refresh — and lets the customer pay for it
`FlightBookingConfirmation.jsx:203-209, 437-452` — no router state (refresh, back, bookmark, restored
tab) → `fetchBookingFromMockData` → `flightBookingData.bookings[0]` from `data-mock-booking.js`:
**Air India AI101, Mumbai→Delhi, ₹12,500, "John Smith" and "Emma Smith"**. Unlabelled;
`handleProceedToPayment` creates a real ARC session against it.
**Fix:** delete `fetchBookingFromMockData`, `data-mock-booking.js`, and the branch; show the existing
"No flight data available" error.

### BLOCKER · Manage Booking's download uses its own inline PDF with fabricated ticket numbers
`ManageBooking.jsx:11, 94, 799-1095, 961, 970, 977` — `FlightETicket` is imported and **never rendered**;
`ticketRef` points at an inline template printing `328{pnr}{i+45}` under **"E-Ticket No"**, a CSS barcode
(`:824-828`), green "Your … flight is booked… pleasant journey" (`:843-851`) with no status check,
`'CONFIRMED'` in the PNR chip (`:925`), `'Jetsetters Air'`/`'JS-001'` (`:815, 885-886`), "Total Paid"
(`:1076`), "Booked on {today}" (`:806`). A **cancelled** booking downloads this.
**The 2026-09-12 FlightETicket fix reaches nothing on this page.**
**Fix:** delete `:797-1095`; render `<FlightETicket ref={ticketRef} bookingData={bookingData} />`.

### BLOCKER · `/booking-confirmation` — the live post-payment page — is 100% unconditional
`frontend/src/Pages/Common/BookingConfirmation.jsx:124-129, 159-161, 431-434, 458-460` — "Booking
Confirmed! 🎉", hardcoded green "Confirmed" badge, "Payment Successful", "email has been sent"; reads
`status` nowhere. Identical for: queued 202 (`pnr: null`, no reservation), `LIVE_GDS_BOOKING_UNTICKETED`,
and a cancelled booking reopened from My Trips. `mode`/`ticketed`/`tickets` from the order response are
**never read anywhere in the frontend**.
**Fix:** derive from `status` + `ticketState()`; for `PENDING_CONFIRMATION` show the backend's own message.

### BLOCKER · `FlightCreateOrders` fabricates transaction id, amount and status
`FlightCreateOrders.jsx:85, 188, 235, 253-254, 265, 268, 487` — `TXN-${Date.now()}` (shown as the
Transaction ID a customer quotes to their bank), `amount || "100.00"` (rendered "Total Paid: USD 100.00"),
`status || 'CONFIRMED'`, `'Guest'`/`'Traveler'` names, and **"PNR Number: Generated"** when `pnr` is null.

### BLOCKER · Cancellation penalty timeline invents its numbers
`FlightCancellationPolicy.jsx:50-56` — `tier2 = (cancelFee || changeFee) * 1.6`; `cutoffHours || 4`
rendered as a precise "Cancel Between (IST)" time; currency `|| 'INR'`. Server half
`flight.routes.js:1146-1156` regex-scrapes free text, `charges[0]` as catch-all, change fee substituted
for cancel fee. **Fix:** render only matched fields; drop `tier2` and `|| 4`; show raw rule text otherwise.

### HIGH · Hardcoded promotional offers presented as live deals
`flightsearchpage.jsx:1294-1298` — "Price Drop Protection", "VISA Exclusive 10% off", "Flat 10% Instant
Discount" — no product, no logic, non-interactive. **Fix:** delete or drive from `coupons`.

### MEDIUM · Stale localStorage prices under "Live prices from Amadeus" / "Best Price"
`cheapest-flight.jsx:200-215, 266, 335, 371` — 6h cache painted as live; hardcoded destination list.

### MEDIUM · `BookingConfirmation.jsx` reads localStorage as a booking source
`:43-57` — opening `/booking-confirmation` directly shows whichever booking was last touched, with the
unconditional "Confirmed / Payment Successful" chrome. `mytrips.jsx:243-245` documents why this is forbidden.

### MEDIUM · `FlightBookingSuccess.jsx` — unreachable, but live and imported
`:146, 170, 205-207, 380, 81` — "tickets successfully booked", unconditional "E-Ticket" title, green
status chip, `alert('Share dialog would open in a real application')`. Route `app.jsx:703` + SEO entry
exist; nothing navigates there. **Fix:** delete file and route.

### MEDIUM · Residual invented values on `FlightETicket.jsx`
`:57, 60, 68, 222, 226, 230` — `'23KG'`, `new Date()` for missing departure/arrival dates, seat `'ANY'`,
`'Economy'`. **Fix:** `'—'` / "Not assigned" / "As per fare rules".

---

## Theme 5 — No passenger types; unticketed is "confirmed" everywhere

### BLOCKER · No adult/child/infant selector; PTC assigned positionally
`FlightBookingConfirmation.jsx:489, 671, 1747` — every passenger is `type: "Adult"`; `searchData`
(adults/children/infants) is passed in router state and **never read**; validation checks name/mobile/DOB
only. `bookingChain.js:85-91` — `ptc: traveler.ptc ?? types[index] ?? 'ADULT'` — whoever is typed second in
a 1A+1C search becomes the child. **Fix:** seed passengers from `searchData`, lock type per passenger,
validate DOB against PTC bands, send explicit `ptc`.

### BLOCKER · `readIssueTicketReply` returns `issued: true` on an absent status
`backend/services/amadeusSoap/operations/ticketing.js:224-229`
```js
return { issued: /^(O|OK|P)$/i.test(status) || status === '', status };
```
An unparsed/unknown reply → `ticketed` → `mode:'LIVE_GDS_BOOKING'`, "Flight booked and ticketed",
`gds.ticketed:true` persisted — which then **excludes the row from the paid-but-not-ticketed alarm**
(`needsReviewAlert.job.js:49`). `'P'` (pending) also counts as issued.
**Fix:** default `issued:false`; `P` = not yet; require ≥1 ticket number before `ticketed` can be true.

### HIGH · `bookings.status`/`payment_status` are literals
`flight.routes.js:477-483` — `status: 'confirmed', payment_status: 'paid'` regardless of
`gds.ticketed`, `tickets.length`, or gateway state. **The database cannot distinguish ticketed from
PNR-only.** Root cause of the My Trips / email / Manage Booking claims below.
**Fix:** `status: gds.ticketed ? 'confirmed' : 'pending_ticketing'`; `payment_status` from reconciled ARC state.

### HIGH · `needs_review: ticket_numbers_not_retrieved` is computed then thrown away
`bookingChain.js:435-438` sets `order.needsReview`; `saveBookingToDatabase` copies only `gds` and `tickets`
(`flight.routes.js:1698-1701`); no reader anywhere. **Fix:** persist into `booking_details.needs_review`.

### HIGH · The money alarm cannot see the majority case
`needsReviewAlert.job.js:44-45, 109-112` — keyed on `needs_review` only; the ordinary `AUTO_TICKET=false`
success (PNR, `gds.ticketed:false`, `confirmed/paid`, "Confirmed" email) sets no flag.
**Fix:** also select `gds->>ticketed = 'false'` with a PNR and `payment_status='paid'`.

### HIGH · `flagForReview` writes `confirmed`, leaves `payment_status`, saves no itinerary
`flight.routes.js:196-211` — post-commit ticketing failure → `status:'confirmed'`; row keeps only
`pending_booking_data`; customer told "confirmed and our team is finalising the ticket".

### HIGH · `handleDuplicateBookingMerge` re-confirms on every retry
`flight.routes.js:563-572` — `...rowTemplate` forces `confirmed/paid` and drops `needs_review`,
`fulfillment_failed`, `cancellation`, `gds_chain`, `arc_transaction_id`. A `refunded` row is re-confirmed.
**Fix:** merge `booking_details` wholesale; never regress status from a template literal.

### HIGH · Confirmation email says "Confirmed / Paid / Total paid" for an unticketed PNR
`emailService.js:481` (`paymentStatus: 'Paid'` hardcoded), `templates.js:542-567`, subject
"✅ Booking Confirmed". Never claims a ticket number (good). Sent for `LIVE_GDS_BOOKING_UNTICKETED` identically
to ticketed; no branch. **Fix:** pass `ticketed`; when false, "reservation held — ticket to follow" + deadline.

### HIGH · "Booking Confirmed!" shown for queued and needs-review 202s
`FlightCreateOrders.jsx:227-237` — both 202s return `success:true`; UI shows green tick regardless;
`queued`/`needsReview`/`ticketed` never read.

### HIGH · PNR-only identical to ticketed in My Trips; `needs_review` never surfaced
`mytrips.jsx:739-746` + list transform — badge derived from `status` alone, which is always `confirmed`.

### HIGH · Any unmapped status shows "Confirmed"
`mytrips.jsx:745` (`|| 'Confirmed'`), `:297`, `:380` — minted from nothing.

### HIGH · "Failed" tab can never match
`mytrips.jsx:604` — nothing ever writes `failed` to `bookings.status`.

### HIGH · Manage Booking's ticket state is always `'none'` on the live path
`ManageBooking.jsx:389` + list transform — `tickets` never reaches router-state data, so genuinely ticketed
customers will be told "Ticket not yet issued". Mirror image of the fixed bug.

### MEDIUM · `ALREADY_BOOKED` asserts `CONFIRMED` / `savedToDatabase:true` on PNR presence alone
`flight.routes.js:1341-1358` — a retry after partial failure *upgrades* the customer's view.

### MEDIUM · Response `bookingReference` is the PNR
`flight.routes.js:1778-1783` — customer is shown a reference the database is not keyed by;
`ALREADY_BOOKED` returns the right one — the two paths disagree.

### MEDIUM · `transactionId` invented when absent; otherwise stores ARC's `successIndicator`
`flight.routes.js:1653` — the secret used as the auth token by `get-pending-booking` lands in a column
admin views read.

### LOW · `buildBookingRow` root cause noted above; `queued_order` stores passports indefinitely on
un-cleared retries (`flight.routes.js:406-418`).

---

## Theme 6 — Broken flows

### BLOCKER · Every cancellation shows "Failed to cancel — contact support", even when it succeeded
`ManageBooking.jsx:59, 73` — `setBookingData(updatedBooking)` — **no such setter exists** (`bookingData` is a
derived const at `:27`). Throws inside the `try` *after* `ArcPayService.cancelBooking` succeeded, lands in the
generic error. The success banner `:686-718` is unreachable. **Fix:** remove; invalidate the
`['flights','booking',bookingId]` query.

### BLOCKER · Order route's outer `catch` keeps the money, writes nothing; queue then promises a refund
`flight.routes.js:1795-1804` — no `refundOnFulfillmentFailure`, no `needs_review`, claim left `in_progress`
120s. `bookingQueue.job.js:126-129` reads the 500 as "already refunded" and `notifyFailure` emails
"our team will contact you about your refund shortly". **Fix:** route through `refundOnFulfillmentFailure`;
make queue copy conditional on `body.refunded === true`.

### BLOCKER · Nothing re-prices before payment; staleness fires after the card is charged
No frontend call site for `/flights/price` / `priceFlightOffer`. `bookingChain.js:160-168` (30-min gate)
runs post-callback: customer pays, then "this fare has expired". `flight.routes.js:1197-1210` re-prices
for seat maps and discards the price. **Fix:** price on entering review and immediately before checkout;
show a diff dialogue; surface expiry pre-payment.

### HIGH · Email "Manage booking" button lands on an error page for everyone
`templates.js:561` — `/manage-booking` with no reference → `ManageBooking.jsx:29` "No booking ID provided".
**Fix:** `${BRAND.site}/manage-booking/${bookingReference}`.

### HIGH · Guests can never reach their booking
`flight.routes.js:1994, 2042` — both `protect`-only; `/bookings` filters on `req.user.id`; guest rows have
`user_id: null`. Email links to two dead ends. **Fix:** reference+email lookup endpoint.

### HIGH · `/manage-booking` navigated without the reference; refresh loses the booking
`mytrips.jsx:958` — the `:bookingId` route exists and is unused; page always runs on stale router state.

### HIGH · `sendBookingNotificationEmails` reports success when the customer email failed
`emailService.js:506-536` — `customerResult.success` never consulted; `guest@jetsetterss.com` substituted
as recipient when none found (`flight.routes.js:1742`).

### MEDIUM · Queue replay can re-sell seats after the 120s claim TTL
`bookingQueue.job.js:110` (90s abort) vs `CHAIN_CLAIM_TTL_MS=120_000` — a chain past sell but before commit
at t=120s gets a second `Air_SellFromRecommendation`. **Fix:** claim heartbeat, or check for an existing PNR
carrying the reference remark before re-selling.

### MEDIUM · `modifyBooking` is an `alert('will be implemented soon')`
`ManageBooking.jsx:136-139` — prominent green "Modify Booking" button.

---

## Theme 7 — Data shown as definite when unknown (High unless noted)

- **`refundable` derived from the wrong field** in four places — `flight.routes.js:852, 1162, 1682`,
  `flightsearchpage.jsx:398`: `refundableTaxes ? true : false` (that's a tax *amount*). The correct
  `_ama.refundable` (with honest `null`) is mapped at `offer.js:142, 357` and read by nobody. Rendered as
  hard "Refundable"/"Non-refundable"/"Partially Refundable" (`FlightCard.jsx:363`, `FlightFareOptions.jsx:187`,
  `FlightBookingConfirmation.jsx:1176`).
- **Cabin fabricated as Economy** — `flight.routes.js:812-814` (`reduce(…, 'ECONOMY')`), `offer.js:317`,
  `flightsearchpage.jsx:390, 654`, `FlightBookingConfirmation.jsx:1082`.
- **Missing baggage shown as "Cabin only"** — `flightsearchpage.jsx:386-388, 650-652` substitute
  `{weight:0}`; `formatCheckedBag` then asserts no checked bag. `utils/baggage.js` itself is correct.
- **`seats: … || 'Available'`** — `flight.routes.js:853`, `flightsearchpage.jsx:485`.
- **Multi-stop collapsed to one fabricated non-stop segment** — `flightsearchpage.jsx:667-691`, fed to ARC
  airline-interchange data.
- **"Instant Confirmation" / "e-ticket" copy pre-payment** — `FlightBookingConfirmation.jsx:1480, 1702, 1719-1724` (Medium).
- **Backend errors dressed as "no data"** — fare-rules/seatmaps/upsell `catch` → 200 `{success:false, data:[]}`
  (`flight.routes.js:1035, 1181, 1215`); `ArcPayService.initializePayment` returns hardcoded `success:true`
  (`ArcPayService.js:108-113`) (Medium).
- **Flights that fail to transform silently dropped** — `flight.routes.js:720-723, 862-866`; `resultCount` vs
  `totalResults` discrepancy never surfaced (Medium).
- **`isInternational` always true** — `FlightBookingConfirmation.jsx:401` (Medium).
- **Passport optional on international routes; names unsanitised; `|| 'TEST'` / `|| 'TRAVELER'` name
  fallbacks server-side** — `:1417-1437, 739-741`, `checkout.handlers.js:306-307` (Medium).
- **Upsell can mix one fare's price with another's offer** — `FlightFareOptions.jsx:97-110` (Medium, latent).
- **Dead UI**: visa-documents card can never render (`FlightBookingConfirmation.jsx:1650-1687`); `/flight-payment`
  (1,249 lines) bypassed by design; `PricingService.getDefaultSettings()` zero callers (Medium).

---

## Low (hygiene) — file:line only

`FlightFareOptions.jsx:8` `|| 'Standard'` brand · `FlightCard.jsx:52` `|| 'Included'` · `FlightBookingConfirmation.jsx:283`
`BOOK-${Date.now()}` · `CouponInput.jsx:76` hardcoded `$` · `flight.routes.js:804-806` traveler-pricing dump to prod
logs · `FlightBookingConfirmation.jsx:820` full passenger PII to browser console · `.env.example:151-153`
`ENABLE_MOCK_FLIGHTS` documented, **no code reads it** · `ManageBooking.jsx:129` PDF named `Jetsetters_Ticket_…` regardless
of state · `:308-310` "Test Environment Notice … Sandbox … no refund relies" shown to customers · `:224` `'Failed (Sandbox)'`
· `:514` arrival date renders departure date · `:649` `Invalid Date` on fetched path · `:855-863` visual-only buttons printed
on PDF · `:1084-1085` placeholder support phone `+1 (555) 123-4567` vs real `(877) 538-7380` · `:832, 974` `'Guest Traveler'`
as passenger name · `:602-606` passport shown unmasked post-booking · `rest.routes.js:139-168` `order/create` SECURE-FALLBACK
success · `flight.routes.js:1583-1591` unreachable `throw` · `flight.routes.js:406-418` passports in `queued_order`.

---

## Checked and genuinely clean

- `bookingChain.js:99-121, 140-186, 265-278, 395-409, 500-540` — pre/post-commit split, offer/WSAP guards,
  max-pax guard, fare-drift guard (zero tolerance, fails closed), PNR persisted before queue/ticket, void
  requires `responseType === 'X'`.
- `flight.routes.js:226-244, 283-295, 296-380, 389-400, 1809-1860, 1994-2005, 2058-2070` — PostgREST injection
  closed, ownership on reads (404 to non-owners), CAS claim with TTL, bounded queue, cancel ownership, JWT-sourced user.
- `checkout.handlers.js:548-576` — `get-pending-booking` requires `success_indicator`, returns no passenger PII.
- `operations.handlers.js:511, 540-550` — admin refund requires admin; ceiling capped at captured-minus-refunded.
- `bookingQueue.job.js:45, 63-69` — env fencing; `queued_order` cleared on completion.
- `templates.js:458-570` — confirmation email never claims a ticket number; labels PNR "Airline reference"; no PII.
- `flight.routes.js:1765` — email gated on `if (dbBooking)`, sent after the chain result.
- `utils/eTicket.js`, `FlightETicket.jsx` (the component itself) — correct three-state model, real `issuedOn`.
- `mytrips.jsx:35-56, 243-245` — inquiries cache keyed on owner; bookings never from localStorage.
- `flight-search-form.jsx:595-600`, `searchQuery.js` — PTC counters enforce 9-seat cap and infant ≤ adults at
  the UI; full search round-trips through the URL.
- `coupon.routes.js:24-88` — validity/expiry/uses/applicability server-checked (flaw is client `orderTotal`).
- `getCalendarPrices`, `/date-prices`, `PricingService.getPriceConfig`, search cache (successful non-empty only).

---

## Suggested fix order

1. **Payment integrity** (Theme 1 + Theme 2 blockers) — these are exploitable and run on every booking today.
   Delete the dead `rest.routes.js` endpoints; `arcSucceeded()` helper at all four reversal sites; `/order`
   requires reconciled `paid`; server re-prices and derives the charge; refund amount from captured txn.
2. **The two fabrication surfaces where money is taken or documents are issued** — delete the mock booking
   fallback; delete ManageBooking's inline PDF and render `FlightETicket`; fix `setBookingData`.
3. **Honest state** — `buildBookingRow` status from `ticketed`; persist `needsReview`; alarm sees
   `ticketed:false`; `readIssueTicketReply` defaults false; email/UI branch on `ticketed`/`queued`.
4. **Correct amounts** — remove N× multiplication; remove phantom add-ons (business decision); real flight
   number to ARC.
5. **PTC selector** (needs UI design — business decision on scope).
6. **Re-price before payment**; guest lookup; email link; My Trips truthfulness; cancellation-policy honesty.
7. Everything Medium/Low.

Decisions needed from the owner: whether add-ons/insurance/VIP become real products or are removed;
scope of the PTC selector; whether guests are supported (requires a lookup endpoint) or bookings require login.
