# Flight cancellation policy - design

Approved by the owner in chat on 2026-10-11 ("for now we are only using flight
cancellation fee is fine for now implement the cancellation one to website
first then app"). Website and backend first (plan A, JETSET13), then the app
(plan B, jetsetter-mobile).

## Why

A customer who cancels today gets everything back on a booking with no ticket,
and everything less the $50 cancellation fee on a ticket voided the same day,
whatever the fare's rules. A refundable ticket past its void window is refunded
less $50 with the airline's own penalty ignored. The cancel dialog says only
"a cancellation fee may apply". The owner asked for the rule other travel
companies use (Expedia, Priceline, MakeMyTrip, Paytm were compared): a free
first 24 hours, then the airline's fare rules, with our service fee kept.

## The rule (customer cancels only)

The 24 hours run from the booking row's `created_at` (checkout writes it when
the payment page opens, minutes before the payment). The moment that counts is
when the customer pressed Cancel (the request), not when the airline answered.

| Customer cancels | Gets back | We keep | How |
|---|---|---|---|
| No airline reservation was ever made | Everything | Nothing | automatic (unchanged) |
| Reservation, no ticket issued (any time; takes priority over the 24 h row) | Airline price | Service fee | automatic |
| Ticketed, within 24 h, tickets voided | Airline price | Service fee | automatic |
| Ticketed, within 24 h, a ticket could not be voided | What the airline refunds, less the service fee | Service fee | our team (review) |
| Ticketed, after 24 h, refundable fare | Airline price less the airline's penalty and the flight cancellation fee | Service fee, penalty, fee | our team (review) |
| Ticketed, after 24 h, non-refundable fare | No fare; any unused taxes | Service fee, fare | our team (review) |
| Ticketed, after 24 h, fare rules unreadable | Decided by our team | - | our team (review) |

- **Service fee kept** = `verified_charge.serviceFee` less `verified_charge.discount`,
  never below 0. A coupon comes off the service fee first, so nobody gets back
  more than they paid. No `verified_charge` (bookings made before checkout
  recorded it, September 2026) means the fee is not known, and nothing is kept:
  those refunds stay what they are today.
- **Airline price** = what the gateway holds less the service fee kept.
- Automatic refunds never use the fare's refundable flag. Only the review
  reason and the customer's wording depend on it.
- **Airline cancels or changes the flight**: everything back. That arrives
  through staff (the desk); staff cancels are unchanged by this design.
- Staff cancels (`isStaff`) and server cancels (`SYSTEM_CANCEL`) keep today's
  rules, except that a flight now reads the flight cancellation fee (below).

### Fare rules at cancel time

The refundable/non-refundable answer comes from the airline's own record of the
booking (MiniRule_GetFromRec on the PNR, `getBookedFeeTable`), cache first (the
fee-rules route's Redis key, 6 h), read **before** the airline cancel because
cancelling removes the TST. Read only for a customer cancel with a PNR outside
the 24 hours. `penalties.refund.before`: `allowed === false` is non-refundable,
`allowed === true` refundable (with `amount` as the per-adult penalty when it is
a number, in `penalties.currency`), anything else unknown.

### Trust gap closed at the source

`booking_details.refundable` is copied from the offer the order route booked;
when the airline's re-price at booking fails, that offer is the one the browser
sent, so a tampered `_ama.refundable` was stored. Checkout already prices the
offer on the server: it now records `pricedFare.refundable` from that priced
offer, and the order route stores the re-priced offer's flag when re-pricing
succeeded, otherwise checkout's, otherwise null. Never the browser's.

## Flight cancellation fee setting

- New key `flight_cancellation_fee` in `DEFAULT_PRICE_SETTINGS` (50, today's
  value), so the admin save accepts it.
- Read as `stored.flight_cancellation_fee ?? stored.cancellation_fee ?? 50`
  (`flightCancellationFeeFrom`), so nothing changes until someone saves it. GET
  /admin/price-settings returns that resolved value under `flight_cancellation_fee`.
- Admin > Price Settings > Flights tab gets a "Cancellation fee (USD)" field.
- Flight cancels (customer and staff) read it; hotel/cruise/other cancels keep
  `cancellation_fee`. The admin bookings list text about flight cancels shows it.

## Shared module `shared/flightCancelPolicy.js`

Dependency-free (browser, Vercel, Lightsail, app all load it).

- `FREE_CANCEL_HOURS = 24`
- `serviceFeeKeptOf(charge)` -> number | null
- `freeUntilOf(paidAt)` -> ISO string | null; `isWithinFreeWindow(paidAt, now)`
- `fareRuleOf(penalties)` -> `{ refundable: true|false|null, penalty: number|null, currency: string|null }`
- `customerCancelTerms({ charge, paidAt, now, hasReservation, ticketed, fareRule, cancellationFee })`
  -> `{ policy, automatic, paid, serviceFeeKept, airlinePrice, refundAmount, penalty, penaltyCurrency, cancellationFee, freeUntil }`
  - `policy`: `never_booked | not_ticketed | free_window | refundable | non_refundable | rules_unknown`
  - `automatic`: refunded the moment the cancel goes through (the first three
    policies)
  - `refundAmount`: exact for automatic policies, null otherwise (a penalty per
    adult across mixed travellers is not guessed)
- `cancelTermsLines(terms, { money, time })` -> the sentences for the cancel
  dialog, the "Cancel & change" tab and the app (`time` formats `freeUntil` in
  the viewer's own clock).
- `cancelPolicyLines({ cancellationFee, money })` -> the sentences for the review page.

Wording (exact):

- never_booked: "This booking was never confirmed with the airline, so everything you paid is returned."
- not_ticketed: "No ticket has been issued yet. You get back {airlinePrice}; the {serviceFeeKept} service fee is not refundable."
- free_window: "You are within 24 hours of booking (until {freeUntil}). You get back {airlinePrice}; the {serviceFeeKept} service fee is not refundable."
  plus "If the airline no longer lets us void the ticket, our team claims the refund from the airline and returns what it gives back, less the service fee."
- refundable: "This fare is refundable. You get back {airlinePrice} less the airline's cancellation penalty{ of {penalty} per adult} and our {cancellationFee} cancellation fee. The {serviceFeeKept} service fee is not refundable. Our team confirms the amount with the airline and emails you within 2 business days."
- non_refundable: "This fare is non-refundable, so the fare is not returned. Our team checks with the airline for any unused taxes and emails you within 2 business days."
- rules_unknown: "We could not read this fare's rules just now. Our team checks them with the airline and emails you within 2 business days to confirm what is returned."
- no service fee kept (0, or not recorded): the not_ticketed/free_window sentence ends at "You get back {airlinePrice}."

Review page (`cancelPolicyLines`):

- "Cancel within 24 hours of booking and you get back the airline price. The service fee is not refundable."
- "After 24 hours the airline's fare rules apply: a refundable fare returns the airline price less the airline's penalty and our {cancellationFee} cancellation fee; a non-refundable fare returns only unused taxes."
- "If the airline cancels or changes your flight, you get back everything you paid."

## Backend

- `decideFlightRefund(..., customer)`: optional `customer: { freeWindow, serviceFeeKept, fareRule, cancellationFee }`.
  Absent -> today's rules exactly. Present -> after the existing safety reviews
  (nothing held, part refunded, ticket disagreements, no void and no claim):
  - not ticketed, no reservation -> `refund_all`, policy `never_booked`
  - not ticketed, reservation -> keep service fee, policy `not_ticketed`
  - ticketed, all voided, free window -> keep service fee, policy `free_window`
  - ticketed, unvoided, free window -> review, policy `not_voided`
  - ticketed, outside -> review, policy `refundable | non_refundable | rules_unknown`
  - keep service fee: null or 0 -> `refund_all`; otherwise `refund_less_fee`
    with `fee` = service fee kept.
  - Returns `policy` and `serviceFeeKept` beside today's fields. Review reasons
    name the amounts for the desk (airline price, penalty, fee, whether the
    tickets were voided or must be claimed).
- `cancelFlightBooking(res, booking, { reason, email, customer })`: the handler
  passes `customer: !isStaff && req[SYSTEM_CANCEL] !== true`. Customer cancels
  compute the window at entry and read fare rules before the airline cancel.
  The cancellation record and the cancel response add `policy`,
  `serviceFeeKept` and (customer only) `terms`.
- `GET /api/flights/bookings/:bookingRef/cancel-quote` (flight.routes.js, beside
  fee-rules, same guards: `optionalProtect`, `guestBookingLimiter`,
  `loadOwnedBooking`, 404 when not owned). Returns `{ success, quote }`:
  `customerCancelTerms` from the row, the resolved flight fee and the fare rules
  (cache first). `quote: null` for a cancelled or non-flight booking. Registered
  only in flight.routes.js (Lightsail serves `/api/flights/*`).
- The fare-rules read (cache + provider) moves into
  `backend/services/bookedFeeTable.service.js` so the route, the quote and the
  cancel share it.
- `cancellationMessage` and the cancellation email: a refund that kept a service
  fee says "the {x} service fee is not refundable" (email row "Service fee (not
  refundable)"), not "cancellation fee". A review with a customer `policy`
  (`not_voided`, `refundable`, `non_refundable`, `rules_unknown`) uses the
  policy's sentence; any other review keeps today's generic wording.

## Website

- Review page (`FlightBookingConfirmation.jsx`): "Not refundable" under the
  Service Fee line; a "Cancellation policy" list (`cancelPolicyLines`) in the
  Baggage & Fare Rules card.
- Manage Booking cancel dialog: the quote replaces the ticket-state bullets
  (loading line while it loads; if it fails, "We could not work out your refund
  just now. You will see what happens to your payment as soon as the
  cancellation completes." and Cancel stays available).
- "Cancel & change" tab (`BookingCancelRules`): "If you cancel now" from the
  quote, then the airline fee table. `ifYouCancel` takes the quote.
- My Trips, Manage Booking result, booking confirmation: `cancellationMessage`.

## App (plan B)

Sync `flightCancelPolicy.js` (and the updated `cancellationOutcome.js`,
`ifYouCancel.js`); `getCancelQuote` + `useCancelQuote`; the cancel sheet shows
the quote; the booking detail Rules section uses the quote; the review screen
shows `cancelPolicyLines` with the flight fee from the price settings it loads.

## Testing

Pure tests for every row of the table and the wording; `decideFlightRefund`
customer branch and staff branch unchanged; the handler passes `customer`
correctly (staff/system/customer) and reads fare rules before cancelling; the
quote route (404 not owned, null for cancelled, terms for a held and a ticketed
booking); price settings resolution and save; component tests for the dialog
quote, the tab and the review page lines. `npm run test:unit` green and the
build passing. No integration tests (they write to the shared production DB).

## Out of scope

Automatic refunds after 24 hours (the desk decides), airline-initiated changes
(staff), hotel and cruise fees, a paid "free cancellation" add-on.
