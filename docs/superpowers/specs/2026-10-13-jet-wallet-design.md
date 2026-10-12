# Jet Wallet and vouchers: design

Status: approved in chat by the owner on 2026-10-13 ("yes go with built it"). This file writes down that design.

## Goal

Every signed-in customer has a **Jet Wallet** holding **Jet Coins**.
- They earn coins on flights they pay for.
- They get coins from **vouchers** the owner creates in the admin panel.
- They spend coins as money off a later flight at checkout.

## Decisions (from the owner)

| Topic | Decision |
|---|---|
| Value | 1 coin = $0.01, so 100 coins = $1. Coins are whole numbers. |
| Products | Flights only, web only. The Android app uses the same server and gets a UI later. |
| Earning | 1 coin per whole $1 of the **card** amount on a flight. Coins land when the free-cancellation window closes, and only if the booking is still ticketed and not cancelled. |
| Vouchers | Created in **Admin → Vouchers**. Each has a code, a dollar value (stored as coins), a total-use limit (optional), start and end dates (optional) and an on/off switch. A customer can redeem each voucher once. |
| Redeeming | The customer types the code on the **Jet Wallet** tab of their profile. The coins are credited at once. |
| Spending | A "Use my Jet Coins" switch on the flight review page. Coins can pay up to the whole price, but **at least $1.00 is always left for the card**, because ARC Pay cannot take $0.00. Coins work alongside a coupon; the coupon is taken off first. |
| Two tabs | Coins are **held** when the hosted checkout is created. They are **captured** when the booking is made, and **released** when the checkout is never paid or the payment is reversed before a booking. |
| Refunds | Whatever a refund rule says is owed is paid from the coins first, up to the coins used; any remainder goes back to the card. |
| Expiry | Coins do not expire, for now. |
| Integrity | Every coin movement is one Postgres function call that locks the wallet row. A balance can never go below 0 and nothing is applied twice. |

### Worked example

Fare $120.00. Service fee $1 + 1% = $2.20. Coupon none. Wallet holds 5,000 coins ($50).
- Gross price: $122.20. Coins applied: 5,000 ($50.00). Card pays $72.20.
- Customer cancels inside the free window. The rule owes the airline price, $122.20 − $2.20 = $120.00.
  - First $50.00 goes back to the wallet as 5,000 coins.
  - The remaining $70.00 is refunded to the card.
  - The $2.20 fee is kept: $72.20 paid by card − $70.00 back.
- Earning: the booking was cancelled before its window closed, so it earns nothing.

## Data model (Supabase, new migration)

Five tables. Each has RLS on and no policies (deny-by-default; the backend uses the service-role key). This matches `20260915120000_saved_travellers.sql`.

### `wallets`

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid, primary key | `public.users.id` (= `req.user.id`) |
| `balance` | bigint, not null, default 0, `check (balance >= 0)` | Coins available to spend |
| `updated_at` | timestamptz | |

### `wallet_entries` (the ledger, append-only)

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial, primary key | |
| `user_id` | uuid, not null | |
| `kind` | text, not null | `voucher`, `earn`, `earn_reversal`, `hold`, `release`, `return` |
| `coins` | bigint, not null | Signed: + adds to the balance, − takes from it |
| `balance_after` | bigint, not null | |
| `booking_reference` | text | For `earn`, `earn_reversal`, `hold`, `release`, `return` |
| `voucher_id` | uuid | For `voucher` |
| `idempotency_key` | text, not null, **unique** | e.g. `hold:<ref>`, `release:<ref>`, `return:<ref>:<reason>`, `earn:<ref>`, `voucher:<voucherId>:<userId>` |
| `note` | text | |
| `created_at` | timestamptz | |

The unique `idempotency_key` is what makes a retried call a no-op.

### `wallet_holds` (one row per checkout that uses coins)

| Column | Type | Notes |
|---|---|---|
| `booking_reference` | text, primary key | |
| `user_id` | uuid, not null | |
| `coins` | bigint, not null, > 0 | |
| `status` | text, not null | `held`, then `captured`, or `released`. A captured hold can later have coins returned. |
| `returned_coins` | bigint, not null, default 0 | Coins already given back by refunds; never more than `coins` |
| `created_at`, `updated_at` | timestamptz | |

### `vouchers`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, primary key | |
| `code` | text, unique | Stored uppercase and trimmed |
| `coins` | bigint, not null, > 0 | |
| `max_redemptions` | int | Null = no limit |
| `redemptions_count` | int, not null, default 0 | |
| `valid_from`, `valid_until` | timestamptz | Null = no limit |
| `is_active` | boolean, default true | |
| `note` | text | |
| `created_by` | uuid | |
| `created_at`, `updated_at` | timestamptz | |

### `voucher_redemptions`

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial | |
| `voucher_id` | uuid | |
| `user_id` | uuid | |
| `coins` | bigint | |
| `created_at` | timestamptz | |

`unique (voucher_id, user_id)`.

### Postgres functions

All are `security definer`, with `set search_path = public`. Each locks the user's `wallets` row (`select … for update`; the row is created if missing) and writes one ledger entry with an idempotency key. If that key already exists, the function returns the current state without changing anything.

- **`wallet_credit(user_id, coins, kind, idempotency_key, booking_reference, voucher_id, note)`**: adds coins. Used for `earn`.
- **`wallet_hold(user_id, booking_reference, coins)`**: refuses with `INSUFFICIENT_COINS` if the balance is short. Otherwise it takes the coins, writes a `hold` entry and inserts a `wallet_holds` row with status `held`. Calling it again for the same reference with the same coins is a no-op.
- **`wallet_capture(booking_reference)`**: `held` → `captured`. No balance change.
- **`wallet_release(booking_reference)`**: only from `held`. Puts the coins back, writes a `release` entry and sets status `released`. On a captured or released hold it does nothing.
- **`wallet_return(booking_reference, coins, reason)`**: only from `captured`. Gives back `min(coins, coins_held − returned_coins)`, writes a `return` entry with key `return:<ref>:<reason>`, increases `returned_coins` and returns the number of coins given back. Called on an uncaptured hold, it behaves as a release.
- **`wallet_reverse_earn(booking_reference)`**: takes back the coins earned on that booking, but never more than the current balance. Writes `earn_reversal`.
- **`redeem_voucher(user_id, code)`**: locks the voucher row, then checks it is active, inside its dates and under its limit, and that this user has not redeemed it. It then inserts the redemption, increments the count and credits the coins (`kind = 'voucher'`). Failures:
  - `VOUCHER_NOT_FOUND`
  - `VOUCHER_INACTIVE`
  - `VOUCHER_NOT_STARTED`
  - `VOUCHER_EXPIRED`
  - `VOUCHER_USED_UP`
  - `VOUCHER_ALREADY_REDEEMED`

The backend calls these with `supabase.rpc(...)`. This is the codebase's first money RPC, chosen because PostgREST cannot lock a row.

## Money maths (`shared/flightCharge.js`)

`computeFlightCharge` gets a new input, `walletAmount` (dollars, default 0):

```
subtotal     = fare + serviceFee
discount     = coupon, clamped to [0, subtotal]
afterCoupon  = subtotal − discount
walletAmount = clamped to [0, max(0, afterCoupon − 1.00)]   // at least $1.00 stays on the card
total        = afterCoupon − walletAmount                    // the CARD amount
```

The result gains `walletAmount` and `walletCoins = round(walletAmount × 100)`.

New pure helpers:
- `maxWalletCoinsFor(afterCoupon, balance)`
- `grossPaidOf(charge)`: `total + walletAmount`, the whole price the customer paid
- `splitRefund(owed, charge, alreadyReturnedCoins)`: returns `{ coins, card }`; coins first

The rules for the fee kept are unchanged. `serviceFeeKeptOf` subtracts only the coupon `discount`, so coins never reduce the fee that is kept.

## Server

### Checkout

In `verifyFlightCharge` (`flightCheckout.service.js`) and `handleHostedCheckout` (`checkout.handlers.js`):

- **Request:** the hosted-checkout body gets `walletCoins` (the coins the customer asks to use). Only a signed-in customer can use coins.
- **Verification:**
  - Read the wallet balance.
  - Clamp `walletCoins` to `maxWalletCoinsFor`.
  - Compute the charge with `walletAmount`.
  - The client's `amount` must equal the new `total` (the same `PRICE_CHANGED` rule as today).
  - A request for more coins than allowed is clamped, not refused. The page shows what was applied.
- **Stored charge:** `verified_charge` gains `wallet: { coins, amount }`. `verified_charge.total` stays the **card** amount, so the payment-coverage guard in `bookingChain.js` is unchanged and still correct.
- **`checkoutKey`:** now includes the wallet coins, so two checkouts that use different coins are not the same page.
- **Hold:** after the booking row is written, `wallet_hold(user, booking_reference, coins)`.
  - If the hold is refused (the balance changed in another tab), the checkout answers 409 `WALLET_CHANGED` and the page refreshes the balance.
  - A reused checkout (`findReusableCheckout`) already holds its coins, and `wallet_hold` is idempotent.

### Capture and release

- **Capture:** the order route calls `wallet_capture(ref)` wherever it calls `noteCouponUse()` today: when the PNR is committed, and on success.
- **Release:** `wallet_release(ref)` is called when:
  - the customer cancels at ARC (the cancelled-checkout path, `cancelledWithNothingTaken`);
  - a checkout is never paid: the abandoned-checkout job sweeps `held` holds whose booking row is still unpaid 60 minutes after checkout and has no payment at ARC;
  - order-route refund path (a), `refundOnFulfillmentFailure`, or path (b), `refundDuplicatePayment`, reverses the whole card amount before capture. Release does nothing if the hold was captured; in that case `wallet_return` is used with the full coins.

### Every refund path returns coins first

One helper, `returnCoinsForRefund({ bookingReference, owedGross, reason })`, works out:

```
coinsBack = min(coinsHeld − returnedCoins, owedGross × 100)
cardBack  = owedGross − coinsBack / 100
```

It calls `wallet_return` and gives back the card part for the ARC refund. Each path changes as follows:

| Path | Where | Change |
|---|---|---|
| (a) Order failure | `refundOnFulfillmentFailure` | Whole payment back: release or return all coins; the card refund is unchanged (full capture). |
| (b) Duplicate | `refundDuplicatePayment` | Same as (a), for the duplicate's own reference. |
| (c) Customer cancel | `cancelFlightBooking` / `customerCancelTerms` | Terms are computed on `grossPaidOf(charge)`. `refundAmount` (gross) is split; the card part goes to `returnFlightPayment`. |
| (d) Desk/admin cancel | Same orchestration as (c) | Same split. |
| (e) Desk "Finish refund" | `settleManualFlightRefund` | Staff enter the gross amount owed. Coins first; ARC refunds the rest, capped at what ARC holds. The desk prefill (`refundOwedOf`) shows both parts. |
| (f) Void | `handlePaymentVoid` | Whole payment: return all coins. |
| (i) Payment after cancel | `recordPaymentAfterCancel` | No money moves; flagged for (e), which handles coins. |
| (h) Abandoned checkout | Job | Refunds happen through (a)/(b); releases unpaid holds (above). |

Path (g), the payments table (quotes and payment links), never uses coins.

### Earning job (`backend/jobs/walletEarn.job.js`, Lightsail only)

Every 15 minutes, started from `server.js` beside the other jobs. It selects flight bookings that:
- have a signed-in owner;
- are `confirmed` / ticketed and have `verified_charge.total > 0`;
- have passed `freeUntilOf(created_at, officeTimeZone)`;
- have no `earn:<ref>` entry yet.

For each, it credits `floor(verified_charge.total)` coins with `wallet_credit(kind = 'earn', key = 'earn:<ref>')`. It processes at most 200 per run and logs what it skipped.

A later cancel or refund of an earned booking calls `wallet_reverse_earn(ref)`, which never takes more than the balance holds.

### API

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/wallet` | `protect` | `{ balance, balanceUsd, entries: [latest 50] }` |
| `POST /api/wallet/redeem` | `protect` + CSRF | `{ code }` → `{ coins, balance }` or a `VOUCHER_*` error with a customer-facing message |
| `GET /api/admin/vouchers` | `protect, admin` | List with counts |
| `POST /api/admin/vouchers` | `protect, admin` | Create: `{ code, valueUsd, maxRedemptions?, validFrom?, validUntil?, note? }` |
| `PUT /api/admin/vouchers/:id` | `protect, admin` | Update the active flag, dates, limit and note. The value and the code cannot change after the first redemption. |
| `GET /api/admin/vouchers/:id/redemptions` | `protect, admin` | Who redeemed it and when, with each customer's email |

All are mounted in the three entry points: `server.js`, `backend/server.js` and `backend/api/index.js` (both the `/api/` and bare forms). The wallet and voucher routes are served by Vercel, as payments are.

## Web pages

- **Profile → Jet Wallet** (a new section of `profiledashboard.jsx`):
  - the balance as coins and dollars ("5,000 coins = $50.00");
  - a voucher box ("Enter voucher code", Redeem);
  - the history list: date, what happened ("Voucher SHUBHAM", "Used on booking JS-…", "Returned from booking …", "Earned on booking …"), and ± coins.
- **Flight review page** (`FlightBookingConfirmation.jsx`):
  - below the coupon box, when the signed-in customer has coins: the switch "Use my Jet Coins — 5,000 available ($50.00)";
  - the price breakdown gains "Jet Coins −$50.00", and the button shows the card amount;
  - the page sends `walletCoins`, and handles `WALLET_CHANGED` by reloading the balance.
- **Booking confirmation, My Trips detail and the receipt email:** a "Jet Coins −$X" line wherever the coupon line appears today (`bookingCharge.js`).
- **Admin → Vouchers** (new page, next to Coupons, `roles: ADMINS`):
  - a table of code, value, used/limit, dates, status;
  - "New voucher" with the code, value in $ (coins shown live), limit, dates and note;
  - an on/off switch;
  - a redemptions drawer.
  - It uses `adminFetch` (cookies + CSRF), the shared admin helper.
- Brand colours only (teal `#055B75`). No sample data in app code.

## Error handling

- The wallet tables cannot be read at checkout: the checkout answers 503 `WALLET_UNAVAILABLE` if coins were requested, and works as today when none were.
- A failed capture after a booking is logged and flagged on the booking (`wallet_capture_failed`). It never fails the booking, as `noteCouponUse` does today.
- A failed release or return is logged and flagged for the desk (`needs_review`) with the coins owed. Money is never lost silently.

## Testing

- **Unit tests:**
  - `computeFlightCharge` with `walletAmount`: the $1 floor, coupon first, rounding;
  - `maxWalletCoinsFor`;
  - `splitRefund`;
  - `customerCancelTerms` on the gross amount.
- **Service tests (mocked Supabase RPC):**
  - checkout clamps and holds;
  - `WALLET_CHANGED`;
  - capture on success;
  - release on ARC cancel and on unpaid expiry;
  - each refund path (a)–(f) returns coins first and refunds only the card part;
  - the earning job credits once, skips bookings that are cancelled or not ticketed, and respects the window;
  - voucher redemption error codes.
- **SQL:** the migration applies twice cleanly. The functions are checked against a scratch Supabase branch, or by a local `psql` script for the double-spend and idempotency cases.
- **Browser (localhost, ARC TEST merchant):**
  1. create voucher TESTWALLET ($50) in the admin panel;
  2. redeem it on the profile;
  3. book a PDT flight paying partly with coins;
  4. confirm the card charge is reduced;
  5. cancel inside the free window;
  6. confirm the coins come back and the card refund is the remainder.
- **CI:** run `npm run test:unit` with empty Supabase and Amadeus env.

## Out of scope (for now)

- Coin expiry.
- Manual wallet adjustments by staff.
- An Android app UI.
- Hotels, cruises and packages.
- Transferring coins between customers.
- Showing coins on invoices to the airline.
