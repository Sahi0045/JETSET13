/# Flight production readiness — the complete remaining list

**Owner's instruction (16 Sep 2026):** one plan, fixed one by one, no new items appearing
after each round.

## What this list is

The deduplicated output of **all five audits** run on 16 Sep 2026 (search/pricing, booking
chain, payment/refunds, customer-facing surfaces, data/config/tests), minus everything
already shipped in PRs #133, #134 and #135, and minus cruise/hotel (owner's call: flights
only).

**This list is closed.** It is not a sample or a first pass — the five agents covered every
flight surface and reported everything they found. If a new item ever appears below the
line, it is because I introduced it, and it will be labelled as mine.

## Already shipped

| PR | What | State |
|----|------|-------|
| #133 | Pricing "no fare found" returned as a confirmed price; post-commit claim window; admin refund calling a refused refund done | Merged, deployed, live |
| #134 | `bookings` rejecting `pending_ticketing` (+ migration, + monitoring alert, + code/schema cross-check test) | Merged, SQL applied |
| #135 | 7 booking-integrity defects: post-commit slot timeout, undated ticket cancelled over, `flagForReview` not recording the ticket, `patchBookingDetails` CAS, `unchangedSince` pin, `queueBookingForRetry` CAS, catch blind to a committed PNR | Open, awaiting merge |

## The plan — three PRs, in this order

### PR A — blockers: can lose data or money

| # | What | Where | Fix | Proof |
|---|------|-------|-----|-------|
| 1 | `archiveOldRecords` is a hard `.delete()` across 7 tables incl. `bookings`, with **no environment gate**, started under a bare `NODE_ENV !== 'test'` — so `npm run dev` on a laptop deletes from the shared production database. `ARCHIVE_STATUSES` is declared and never used. Two rules also filter `.in('status')` on tables with no `status` column, so they error every run; `performHardDelete` deletes `payments` rows the retention table says to keep 10 years. | `backend/jobs/dataRetention.job.js:13-49,95-112`; started `backend/server.js:283` | Gate on `queueEnvironment() === 'production'`, as `abandonedCheckout.job.js:234` and `bookingQueue.job.js` already do. Fix the two dead rules. Make the name honest or the behaviour match it. | Test: the job performs no delete outside production, and the rules address columns that exist. |
| 2 | `User.create` inserts into `public.users` with **no `id`**, so a provisioned user's id is not their `auth.users` uid — while `bookings.user_id` references `auth.users(id)`. Live path is `autoProvisionSupabaseUser`, which runs whenever a valid Supabase token has no `public.users` row. The mismatched id fails the checkout upsert's FK, which is caught as non-blocking → **customer pays at ARC, no booking row exists**, `/order` answers `PAYMENT_NOT_FOUND`, and the abandoned-checkout job can't see it because it reads `bookings`. | `backend/models/user.model.js:29-39`; `backend/middleware/auth.middleware.js:161-180` | Provision with the auth uid as the row id. | Test: a provisioned user's id equals the token's `sub`, and a booking saved for them keeps its `user_id`. |

### PR B — what the customer sees

| # | What | Where |
|---|------|-------|
| 3 | Review/checkout page shows departure **and** arrival a day early for every non-stop, for anyone west of UTC — `new Date("2026-11-15")` on a date-only value. The repo's own `parseCalendarDate` exists to prevent exactly this. | `FlightBookingConfirmation.jsx:819,1401,1423,1484` |
| 4 | A cancellation email Resend **refuses** is logged and returned as sent. The identical bug was fixed for the booking email in the same file (`:518-522`) and missed here. It is the only notification when a refund needs a human. | `emailService.js:608-633` |
| 5 | `numberOfBookableSeats` matched by booking class across **all** legs, so a scarce leg is overwritten — proven on the certification fixture: reports 9 where the supplier said 7. | `mappers/offer.js:356-358` |
| 6 | Priced baggage hardcodes `weightUnit: 'KG'` and **overrides** the search mapper's correct `LB`. A passenger told they may carry 50 KG when the fare says 50 LB. | `mappers/pricing.js:59-62,147` |
| 7 | "Baggage: Included" filter reads only `checked.weight`, so piece-based fares (`{quantity}`) are hidden — while the card advertises "1 Piece check-in". | `searchResults.js:184-186` |
| 10 | `nearest(anchor)` never stops at the next anchor, so a **change fee** can be printed as the cancellation fee; `Math.round` turns 75.50 into 76. | `flight.routes.js:1930,1936-1947` |
| 11 | Cancellation fee can render with **no currency at all** — `cur('')` returns a space. | `FlightCancellationPolicy.jsx:13,56` |
| 13 | A void reports a refund figure read from the row, and that number is told to the customer verbatim. | `operations.handlers.js:877,1397` |
| 23 | The downloadable e-ticket prints "$0.00" as Total Amount where ManageBooking's own screen says "Not recorded". | `FlightETicket.jsx:38-40,322` |
| 24 | Passport numbers and DOBs stay in `localStorage` when a customer abandons at ARC — `clearStoredBookings()` never runs on that path. | `FlightBookingConfirmation.jsx:1015` |

### PR C — search, infrastructure, and the tests that lie

| # | What | Where |
|---|------|-------|
| 8 | GDPR export **and** delete skip `bookings` — which is where `passportNumber` and the whole checkout body live. Matters for the Play Console questionnaire. | `gdpr.controller.js` |
| 9 | PDT-shaped defaults silently become production behaviour when unset: `unticketableCarriers` (19 carriers vanish from search), `queueNumber` 50, `officeTimeZone`, `fopCode` CASH, `marketIataCode` US. Also `getWsConfig` memoises while `describeWsConfig` reads fresh, so health and the booking gate can disagree. | `amadeusSoap/config.js:86,91,99,100,122,205-225` |
| 12 | Search cache key omits `includedAirlineCodes`/`excludedAirlineCodes` **and** the blocklist, so a filtered result set is served to an unfiltered search for 5 minutes; `maxPrice` is accepted and silently dropped. | `flight.routes.js:1662-1667`; `cache.service.js:223-224` |
| 14 | The chain can run ~190s post-commit; the queue replay aborts at 90s and retries while the chain keeps going; there is no server-side request timeout at all and `/api/flights/*` bypasses Vercel's cap. | `bookingQueue.job.js:297`; `config.js:184-199` |
| 15 | The admin panel is handed `booking_details` raw — including `success_indicator`, the secret `provesPayer` accepts as proof of payment, plus `pending_booking_data` (passports). | `flight.routes.js:4054,4103` |
| 16 | Queue worker selects 50 oldest then filters `queued_env` in JS, so 50+ foreign rows starve this environment's paid bookings. | `bookingQueue.job.js:39-67` |
| 17 | A `Fare_CheckRules` rejection is invisible (`errorInfo` missing from the container regex) and then discarded by its caller, so a refused request looks identical to "the airline filed no penalties". | `errors.js:45`; `index.js:223-228` |
| 18 | `/upsell` returns 200 `success:true, data:[]` when the account may not ask — "this flight has no other fares". `/seatmaps` spends a live pricing transaction on every call before returning the same empty map. | `flight.routes.js:1812-1824,2000-2011` |
| 19 | Calendar and date-strip drop dates by **UTC** "today" — the sibling of the `cancelBooking` timezone bug. | `index.js:424-425,512` |
| 20 | The shared bookings double ignores `.or()`, which is how `loadOwnedBooking`, `refundOnFulfillmentFailure` and the DELETE fallback find a booking. 17 test files use it; every "a different reference is refused" assertion is vacuous. | `tests/backend/helpers/fakeBookings.js:74` |
| 21 | `bookingSave.test.js` re-implements the FK/RLS logic inline and asserts the copy — the real function is never called in that block. | `tests/backend/bookingSave.test.js:147-174` |
| 22 | `bookingOwnerWiring.test.js` regex-matches source text, so it cannot see the database write and passes on a reintroduced bug. | `tests/backend/bookingOwnerWiring.test.js` |
| 25 | An unrecognised PNR reply yields `[]` air segments, and `[].some(...)` is false → read as "every locator present", taking the eager branch the fresh-session mechanism exists to avoid. | `bookingChain.js:81-102,292-298` |
| 26 | If qualifier 712 is absent the total silently falls back to the **base** fare, taxes excluded. | `mappers/pricing.js:110` |

## Rules for every fix

1. A test that **fails on the code before the change** and passes after. Stated in the PR with the before/after counts.
2. No test double weakened to make a fix pass; if a double is wrong, the double is fixed and that is called out.
3. After each PR: full backend suite, then merge, then confirm CI + Deploy API + live health.
4. Status tracked here, not re-derived in chat.

## Status

- [x] PR A — items 1, 2 (PR pending)
- [x] PR B — items 3, 4, 5, 6, 7, 10, 11, 13, 23, 24 (PR pending)
- [ ] PR C — items 8, 9, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 25, 26
