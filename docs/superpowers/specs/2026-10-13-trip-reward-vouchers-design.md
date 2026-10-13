# Trip-reward vouchers: design

Status: the owner approved this in chat on 2026-10-13 and said "build and apply db". He is asleep, so he asked for the build and the migration overnight. Nothing is merged without his word.

Builds on the Jet Wallet (PR #215, merged as 667d931): `docs/superpowers/specs/2026-10-13-jet-wallet-design.md`.

## Goal

The owner's marketing line is: "Book with my code SHUBHAM and get $50 in Jet Coins for your next trip."

- A customer types a **voucher** code at checkout. The price does not change.
- After the trip is **completed**, the voucher's coins land in their Jet Wallet automatically, and they get an email.
- They spend the coins on a later booking.
- If they cancel before flying, they get no coins.

## Decisions (from the owner)

| Topic | Decision |
|---|---|
| Kinds of voucher | Every voucher has a **kind**, chosen in Admin → Vouchers. **Instant**: redeemed in Profile → Jet Wallet, coins at once (today's behaviour). **Trip reward**: used at checkout, coins after the trip. |
| Who can use it | A per-voucher tick box, **"First-time customers only"**. Each customer can use a voucher once. The total-uses limit and the start and end dates work as today. |
| When the coins land | After the trip is completed, if the booking is still ticketed and not cancelled. |
| How they land | Added automatically, plus a "Your Jet Coins have arrived" email. No code is emailed. |
| Cancel before the trip | No coins. The voucher is freed, so that customer can use it again on another booking. |
| Checkout box | **One** box for coupons and vouchers. Placeholder: "Coupon or voucher code". A booking can carry one coupon and one voucher. Each is shown on its own line with Remove. |
| Coupons | Unchanged. A coupon still takes money off now. |

## Rulings made while writing this (the owner can change them)

- **The code box checks for a coupon first.** If the code is not a coupon, it checks the trip-reward vouchers.
  - Creating a voucher whose code is already a coupon is refused, and the other way round. This keeps one code from meaning two things.
- **A code of the wrong kind gets a pointer, not "not found".**
  - An instant voucher typed at checkout answers "Redeem this code in Profile → Jet Wallet".
  - A trip-reward voucher typed in the wallet answers "Use this code at checkout when you book a flight".
- **"First-time" means** the customer has no other flight booking with status `confirmed`, `pending_ticketing` or `completed`. Cancelled bookings and guest bookings do not count.
- **"Trip completed" means** the day after the last flight's arrival **date** has fully passed in UTC: `due_at` = the last segment's local arrival date + 2 days, at 00:00 UTC.
  - This is a date, not a time, because stored arrival times carry no timezone. It is always after landing anywhere in the world.
  - Never earlier than that segment's departure date + 2 days: the arrival is the client's copy and is never compared with the flights sold, the departure date is. Checkout refuses a shown flight landing two or more calendar days before it leaves (one day earlier is genuine across the date line).
  - A booking whose itinerary cannot be read gets no `due_at`. It is logged and left for the desk, never paid blindly.
- **The voucher is reserved when the booking is made,** not at checkout: it is reserved where coins are captured today.
  - It changes no price, so checkout only checks it (and tells the customer early). No hold is needed, and an abandoned checkout leaves nothing to release.
  - If the reservation is refused in the moment between checkout and booking (the limit was just reached, or the customer used it on another booking a second earlier), the booking stands. It gets `wallet_issue = { kind: 'voucher_refused', code }` and a log line. No money is involved.
- **Refunds:**
  - **Before payout:** a cancel, a void or a full reversal of a booking voids its pending reward.
  - **After payout:** the reward is kept, because the trip was flown.
  - Like earned coins, a refund after payout does not take the reward back. The desk can still use Return Jet Coins the other way if needed.
- **The payout email** goes through the existing `sendEmail` (Resend), best effort. A failed email never blocks or repeats the credit.
- **The Profile → Jet Wallet panel** shows pending trip rewards ("5,000 coins arrive after your trip FLT…, due 5 Nov"), so the customer knows they are coming.
- **The review page and the booking confirmation** say "You'll get 5,000 Jet Coins after your trip". The receipt shows the voucher code with "Jet Coins after your trip", not as money off.

## Data model (new migration, additive)

**`vouchers` gains:**
- `kind text not null default 'instant'`, with a check: `kind in ('instant','trip')`.
- `first_time_only boolean not null default false`.

**`voucher_redemptions` gains:**
- `booking_reference text`: null for instant redemptions.
- `status text not null default 'credited'`, with a check: `'credited','pending','paid','void'`.
- `due_at timestamptz`.
- `paid_at timestamptz`.
- `updated_at timestamptz`.

The existing `unique (voucher_id, user_id)` becomes a **partial unique index** where `status <> 'void'`. A voided reward then frees the voucher for that customer.

There is also a unique index on `booking_reference` where it is not null: one trip reward per booking.

### Functions

All are `security definer` and `set search_path = public`. EXECUTE is revoked from `public`, `anon` and `authenticated`, and granted to `service_role` only.

- **`check_trip_voucher(p_user uuid, p_code text, p_ref text)`** is read-only and returns `{ id, code, coins, kind }`. It raises:
  - `VOUCHER_NOT_FOUND`, `VOUCHER_INACTIVE`, `VOUCHER_NOT_STARTED`, `VOUCHER_EXPIRED`, `VOUCHER_USED_UP`, `VOUCHER_ALREADY_REDEEMED`;
  - `VOUCHER_FIRST_TIME_ONLY`: an other `confirmed`, `pending_ticketing` or `completed` flight exists for `p_user`, excluding `p_ref`;
  - `VOUCHER_WRONG_KIND`: an instant voucher.
- **`reserve_trip_voucher(p_user, p_code, p_ref, p_due_at)`** locks the voucher row and runs the same checks.
  - It inserts a `pending` redemption with `booking_reference = p_ref` and increments `redemptions_count`.
  - It is idempotent per `p_ref`: a second call for the same booking returns the existing row.
- **`pay_trip_voucher(p_ref)`** takes `pending` to `paid`. It credits the coins through `wallet_apply(kind 'voucher', key 'voucher:<voucherId>:<userId>')` and sets `paid_at`.
  - It is idempotent: `paid` or `void` returns as is.
  - It returns `{ status, coins, user_id }`.
- **`void_trip_voucher(p_ref)`** takes `pending` to `void` and decrements `redemptions_count`. Any other status returns as is.
- **`redeem_voucher`** (instant) now refuses a trip voucher with `VOUCHER_WRONG_KIND`. Its already-redeemed check ignores `void` rows.

## Server

- **Code lookup at checkout:** `POST /api/wallet/voucher-check { code }` uses `protect` and the voucher rate limiter. It answers:
  - success: `{ kind: 'trip', code, coins }`;
  - a refusal: the `VOUCHER_*` codes with customer messages (whitelisted, as the redeem box does).
- The review page calls the coupon validation first, then this.
- **`verifyFlightCharge`** takes `voucherCode`.
  - A signed-in customer is required.
  - It calls `check_trip_voucher`. A refusal is a 409 with that code and message, before any payment page opens.
  - On success it adds `verified_charge.voucher = { id, code, coins }`. The price is untouched.
- **`checkoutKey`** includes the voucher code, so a page made with a voucher is not reused for one without it, and the other way round.
- **Order route:** where `settleCoinsAfterBooking` runs (commit and success), it also calls `reserve_trip_voucher`. `due_at` comes from the booking's itineraries (`bookingItineraries`).
  - It never fails the booking. A refusal writes `wallet_issue: { kind: 'voucher_refused' }`.
- **Cancel, void, and full reversal** (`refundOnFulfillmentFailure`, `refundDuplicatePayment`, `cancelFlightBooking`, `handlePaymentVoid`) call `void_trip_voucher(ref)`, best effort.
- **Payout:** the earning job (`walletEarn.job.js`, Lightsail only, production only) also pays rewards on each tick. It pays `pending` rewards with `due_at <= now` whose booking is `confirmed`, `pending_ticketing` or `completed`, paid (or partly refunded), ticketed and not cancelled (re-read just before paying). It pays at most 200 per run.
  - A reward whose booking was cancelled without the void landing is voided there.
  - After a payout it sends the email.
- **Admin:**
  - The voucher create and edit forms gain `kind` and `firstTimeOnly`.
  - Kind cannot change after the first redemption.
  - A code already used by a coupon is refused, and coupon create refuses a code already used by a voucher.
  - The redemptions list shows status, booking reference and due date.
- **The wallet summary** also returns `pending: [{ bookingReference, code, coins, dueAt }]`.

## Web pages

- **Flight review page:** the coupon box becomes one "Coupon or voucher code" box.
  - **Apply** tries the coupon first, then the voucher.
  - An applied voucher shows "Voucher SHUBHAM: 5,000 Jet Coins after your trip", with Remove.
  - The voucher code is sent as `voucherCode`. The page handles the `VOUCHER_*` refusals.
  - The other booking types (cruise, hotel, package) keep the plain coupon box.
- **Profile → Jet Wallet:**
  - a "Coming after your trip" list;
  - a trip voucher typed in the redeem box answers with the pointer to checkout;
  - history wording for a trip payout: "Voucher SHUBHAM: trip FLT…".
- **Admin → Vouchers:**
  - a Kind select (Instant / Trip reward) and a "First-time customers only" tick box;
  - a Kind column;
  - the redemptions drawer shows status and booking.
- **Booking confirmation and receipt:** a "Voucher SHUBHAM: 5,000 Jet Coins after your trip" line when the booking carries one.
- **Email:** "Your Jet Coins have arrived". It shows the coins, the voucher, the trip, a link to the wallet, and the brand colours.

## Error handling

- Voucher problems never fail or block a booking once payment is taken. They are logged and marked on the booking.
- A payout that fails is retried on the next tick, because `pay_trip_voucher` is idempotent.
- An email that fails is logged and never retried, so there are no duplicate emails.

## Testing

- **SQL:** run in the Docker runner on Postgres 15 and 16. It covers:
  - check and reserve, including first-time, limits, the void that frees a voucher, idempotent reserve, pay and void;
  - a concurrent reserve on a one-use voucher;
  - the partial unique index;
  - grants.
- **Unit:**
  - the code box tries coupon then voucher;
  - `verifyFlightCharge` with `voucherCode`;
  - reserve and void in the order and cancel paths;
  - payout eligibility, its re-read and the email;
  - the admin form;
  - the wallet panel's pending list;
  - `due_at` from itineraries.
- **CI:** `npm run test:unit` with the env blanked.
- **Browser** (with the owner, in the morning): create SHUBHAM as Trip reward and first-time only, then book with it at checkout. The confirmation shows the line and the wallet shows it pending. Run the payout step with the clock moved forward; the coins and the email arrive. Cancel another booking, and its reward is voided.

## Out of scope

- Referral codes where the person who shared the code also earns.
- Taking a reward back after the trip.
- Hotels, cruises, packages and the Android app UI.
