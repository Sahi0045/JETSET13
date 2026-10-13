# Trip-Reward Vouchers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer types a trip-reward voucher (e.g. `SHUBHAM`) in the flight review page's code box; the price does not change, the voucher is reserved when the booking is made, and its Jet Coins land in the Jet Wallet with an email once the trip is over, or are voided if the booking is cancelled, voided or reversed first.

**Architecture:**
- **Database:** an additive migration gives `vouchers` a `kind` and a `first_time_only` switch, gives `voucher_redemptions` a status lifecycle (`credited`, `pending`, `paid`, `void`) keyed by booking, and adds four `security definer` functions (`check_trip_voucher`, `reserve_trip_voucher`, `pay_trip_voucher`, `void_trip_voucher`). `redeem_voucher` learns to refuse trip vouchers.
- **Backend:** `wallet.service.js` wraps the functions. Checkout checks the voucher and keeps it on `verified_charge.voucher` (price untouched). The order route reserves it where it captures coins. Cancel, void and full reversal void it. The Lightsail wallet job pays due rewards on its 15-minute tick and emails the customer.
- **Frontend:** the flight review page's coupon box also takes trip vouchers; Profile → Jet Wallet lists rewards to come; Admin → Vouchers gains Kind and First-time; the confirmation page and email show the reward line.

**Tech Stack:** Supabase Postgres (plpgsql), Node/Express (ESM), React + Vite + Tailwind, Vitest. SQL tests run in throwaway `postgres:15-alpine` and `postgres:16-alpine` Docker containers.

**Spec:** `docs/superpowers/specs/2026-10-13-trip-reward-vouchers-design.md` (binding). It builds on `docs/superpowers/specs/2026-10-13-jet-wallet-design.md`, merged as 667d931.

## Global Constraints

**Product rules (from the spec)**
- Every voucher has a kind: `instant` (redeemed in Profile → Jet Wallet, coins at once, today's behaviour) or `trip` (typed at flight checkout, coins after the trip). Coupons are unchanged and still take money off now.
- A trip voucher changes no price: `verified_charge.total` and every charge figure are exactly what they would be without it.
- One trip reward per booking; each customer uses a voucher once. A voided reward frees the voucher for that customer. The total-uses limit and the start and end dates work as for instant vouchers.
- "First-time" means the customer has no other flight booking with status `confirmed` or `pending_ticketing`. Cancelled and guest bookings do not count, and the booking being rewarded never counts against itself.
- `due_at` = the last segment's local arrival **date** + 2 days, at 00:00 UTC. An itinerary that cannot be read gets `due_at = null`: reported, never paid automatically.
- The voucher is reserved when the booking is made (where `settleCoinsAfterBooking` runs: at commit and on success). A refused reservation never fails or blocks a booking: it writes `wallet_issue = { kind: 'voucher_refused', code, reason, at }` and a log line, and never overwrites an open Jet Coins problem the desk still has to fix.
- Before payout, a cancel, a void or a full reversal voids the pending reward. After payout the reward is kept.
- Payout runs only in the Lightsail wallet job (`walletEarn.job.js`), which runs only in production or with `WALLET_JOB=true`. At most 200 rewards per run; the booking is read again just before paying; the email is best effort and never retried.
- Wrong-kind pointers, word for word: at checkout `Redeem this code in Profile → Jet Wallet.`; in the wallet `Use this code at checkout when you book a flight.`
- One box on the **flight** review page only, placeholder `Coupon or voucher code`: Apply tries the coupon first, then the voucher. Cruise, hotel and package pages keep the plain coupon box.

**Database**
- The new migration is a NEW file, `supabase/migrations/20261013150000_trip_reward_vouchers.sql`. Never edit `20261013120000_jet_wallet.sql`: it is applied to production.
- The migration is wrapped in `begin;` / `commit;`, is safe to run twice, and is backwards compatible with the code on `main` (production may run it before this branch deploys).
- Every function is `security definer` with `set search_path = public`. Every new or changed function signature goes through the revoke/grant loop: EXECUTE revoked from `public, anon, authenticated`, granted to `service_role` only.
- The SQL suite runs on Postgres 15 and 16 through `scripts/db/test-jet-wallet.sh`, which applies both migrations in order, twice.
- Local and production share one Supabase database. The migration is applied only in Task 8.

**Routes and code**
- No new route file. The one new endpoint goes on the existing `backend/routes/wallet.routes.js`, already mounted in `server.js`, `backend/server.js` and `backend/api/index.js` (`/api/wallet` and `/wallet`). Any new route file would need all three, with both `/api/x` and `/x` in `backend/api/index.js`.
- Comments only for critical constraints (security, money, data integrity, hidden constraints). No narrating comments.
- Brand colours only: teal `#055B75`, dark teal `#034457`, accent `#0890BC`, sky `#65B3CF`, light `#F1FBFD`. Never generic blue or indigo (`#0066FF`, `#1e40af`, `#1976D2`, `#0EA5E9`, Tailwind `blue-*`/`indigo-*`).
- No sample or mock data in app code; mocks belong in tests only.
- Files the Android app copies verbatim gain NO imports: `shared/flightCharge.js`, `shared/flightCancelPolicy.js`, `shared/cancellationOutcome.js`, `shared/reviewQueue.js`, `shared/bookingItineraries.js`.

**Tests and git**
- Before every commit, run CI's unit command with the env blanked:
  `AMADEUS_WS_ENDPOINT= AMADEUS_WS_USERNAME= AMADEUS_WS_PASSWORD= AMADEUS_WS_OFFICE_ID= VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run test:unit`
- Never run integration tests (`npm run test:integration`) and never call real ARC Pay, Amadeus or Supabase from a test.
- Stage files by path only. Never stage `CLAUDE.md` or `frontend/src/Pages/Common/Navbar.jsx` (the owner's uncommitted edits).
- Work on branch `feat/trip-reward-vouchers`. Push only that branch. Never merge and never use `gh pr merge --auto`: the owner must write "merge".
- Every commit message ends with these two lines:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CnRin1ZGh44yizpdTBakw6
  ```

## Review Focus

1. **A coupon and a voucher on one flight booking.** The customer applies `SAVE20`, then `SHUBHAM`. Both show on their own lines with their own Remove; the total takes off only the coupon; removing the voucher leaves the coupon. Pinned by Task 6, "keeps a coupon and a voucher on one booking, each on its own line, the price taking only the coupon".
2. **Back from a cancelled ARC payment page with a voucher applied.** The voucher comes back after being checked again, as the coupon does. Pinned by Task 6, "puts a voucher back after a cancelled payment, once it has been checked again".
3. **Two customers taking the last use of a one-use trip voucher at the same moment.** Exactly one is reserved; the other booking still stands, marked `voucher_refused`. Pinned by the `RACETRIP` block in Task 1's runner and Task 4, "still books when the voucher is refused, and marks it".
4. **A booking cancelled while its reward is due, or whose void never landed.** It is never paid; the payout job reads the booking again and voids the reward. Pinned by Task 1, "a voided reward is never paid", and Task 5, "voids a reward whose booking was cancelled since it was reserved, and sends no email".
5. **The wrong kind of code in the wrong box.** An instant voucher at checkout and a trip voucher in the wallet get a pointer, never "not found". Pinned by Task 2, "points an instant voucher to the wallet" and "points a trip voucher to checkout", and Task 7, "points a trip voucher typed here to checkout".

---

## File structure

**Create**

| File | Responsibility |
|---|---|
| `supabase/migrations/20261013150000_trip_reward_vouchers.sql` | Columns, indexes, the four trip functions, the new `redeem_voucher`, grants |
| `tests/sql/trip_vouchers.test.sql` | SQL assertions for the trip functions |
| `frontend/src/utils/tripVoucher.js` | Browser call to `POST /api/wallet/voucher-check`, answers in customer words |
| `tests/backend/tripVoucherService.test.js` | Service wrappers, `voucherCheck`, wallet summary `pending`, route auth |
| `tests/backend/tripVoucherAdmin.test.js` | Admin voucher kind/first-time/locks/redemptions; coupon↔voucher code clashes |
| `tests/backend/tripVoucherCheckout.test.js` | `verifyFlightCharge({ voucherCode })` and `checkoutKey({ voucherCode })` |
| `tests/utils/tripRewardDueAt.test.js` | `tripRewardDueAt` |
| `tests/backend/tripRewardOrderRoute.test.js` | `reserveTripRewardAfterBooking`, `toClientBooking().tripReward` |
| `tests/backend/tripRewardPayout.test.js` | `payTripRewardsOnce`, `sendTripRewardEmail`, `tickOnce` |
| `tests/backend/tripRewardEmail.test.js` | Payout email and the confirmation-email reward line |
| `tests/utils/tripVoucher.test.js` | `checkTripVoucher` (browser util) |
| `tests/components/couponInputVoucher.test.jsx` | The box with and without vouchers; `ArcPayService` and `readCancelledCheckout` carry the code |
| `tests/components/reviewPageVoucher.test.jsx` | The flight review page with a voucher |
| `tests/components/jetWalletPanelRewards.test.jsx` | Wallet panel: rewards to come, payout wording, pointer |
| `tests/components/tripRewardReceipt.test.jsx` | Confirmation page line; order page hands the reward over |
| `tests/utils/tripReward.test.js` | `tripRewardOf`, `tripRewardLine` |

**Modify**

| File | Change |
|---|---|
| `tests/sql/jet_wallet_stub.sql` | A `bookings` table for the first-time check |
| `scripts/db/test-jet-wallet.sh` | Postgres 15 and 16; both migrations twice; trip suite; `RACETRIP` |
| `backend/services/wallet.service.js` | Trip wrappers, code helpers, `isVoucherCode`, `pending` in the summary, messages |
| `backend/controllers/wallet.controller.js` | `voucherCheck`; shared code pattern; statuses for new codes |
| `backend/routes/wallet.routes.js` | `POST /voucher-check` |
| `backend/controllers/vouchers.controller.js` | `kind`, `first_time_only`, kind lock, coupon clash, richer redemptions |
| `backend/services/coupon.service.js` | `isCouponCode` |
| `backend/routes/coupon.routes.js` | Refuse a coupon code a voucher uses |
| `backend/services/flightCheckout.service.js` | `voucherCode` → `voucher` |
| `backend/utils/tripMatch.js` | `checkoutKey` takes `voucherCode` |
| `backend/routes/payment/checkout.handlers.js` | Pass the voucher through; key the reusable page on it |
| `shared/bookingItineraries.js` | `tripRewardDueAt` (no imports) |
| `backend/routes/flight.routes.js` | Reserve on booking; void on reversal and duplicate; `tripReward` in the order answer and the client booking |
| `backend/routes/payment/operations.handlers.js` | Void on cancel and on payment void |
| `backend/jobs/walletEarn.job.js` | Payout on the tick, email |
| `backend/services/email/templates.js` | `generateTripRewardTemplate`; reward line in the confirmation email |
| `frontend/src/components/CouponInput.jsx` | Voucher mode (flight only); brand focus colour |
| `frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx` | One box, summary line, checkout field, refusals, restore |
| `frontend/src/Services/ArcPayService.js` | Send `voucherCode` |
| `frontend/src/utils/cancelledCheckout.js` | Carry `voucherCode` back |
| `frontend/src/Pages/Common/login/JetWalletPanel.jsx` | "Coming after your trip"; payout wording |
| `frontend/src/Pages/Admin/VoucherManagement.jsx` | Kind, First-time, Kind column, redemption status |
| `frontend/src/utils/bookingCharge.js` | `tripRewardOf`, `tripRewardLine` |
| `frontend/src/Pages/Common/BookingConfirmation.jsx` | Reward line in the payment summary |
| `frontend/src/Pages/Common/flights/FlightCreateOrders.jsx` | Hand `tripReward` to the confirmation page |
| `frontend/src/Pages/Support/SupportQueue.jsx` | Words for `voucher_refused` |
| Existing tests | `tests/backend/walletService.test.js`, `tests/backend/vouchersController.test.js`, `tests/backend/walletHostedCheckout.test.js`, `tests/backend/walletOrderRouteFlow.test.js`, `tests/backend/walletCancelFlow.test.js`, `tests/backend/walletVoid.test.js`, `tests/components/voucherManagement.test.jsx`, `tests/components/supportQueueJetCoins.test.jsx`, and the four flight-page tests that select the box by its placeholder |

---

### Task 1: Database: kinds, the reward lifecycle, functions, SQL tests

**Files:**
- Create: `supabase/migrations/20261013150000_trip_reward_vouchers.sql`
- Create: `tests/sql/trip_vouchers.test.sql`
- Modify: `tests/sql/jet_wallet_stub.sql`
- Modify: `scripts/db/test-jet-wallet.sh` (whole file replaced)

**Interfaces:**
- Consumes: from `20261013120000_jet_wallet.sql` (applied): tables `vouchers`, `voucher_redemptions`, `wallets`, `wallet_entries`; function `wallet_apply(p_user uuid, p_coins bigint, p_kind text, p_key text, p_ref text, p_voucher uuid, p_note text)`.
- Produces:
  - `vouchers.kind text not null default 'instant'` (`'instant' | 'trip'`), `vouchers.first_time_only boolean not null default false`.
  - `voucher_redemptions.booking_reference text`, `status text not null default 'credited'` (`'credited' | 'pending' | 'paid' | 'void'`), `due_at timestamptz`, `paid_at timestamptz`, `updated_at timestamptz`.
  - Indexes: unique `voucher_redemptions_live_once (voucher_id, user_id) where status <> 'void'`; unique `voucher_redemptions_booking_once (booking_reference) where booking_reference is not null`; `voucher_redemptions_pending_due (due_at) where status = 'pending'`. The old `unique (voucher_id, user_id)` constraint is gone.
  - `check_trip_voucher(p_user uuid, p_code text, p_ref text)` → `{ id, code, coins, kind }`, or raises `VOUCHER_NOT_FOUND | VOUCHER_INACTIVE | VOUCHER_WRONG_KIND | VOUCHER_NOT_STARTED | VOUCHER_EXPIRED | VOUCHER_ALREADY_REDEEMED | VOUCHER_USED_UP | VOUCHER_FIRST_TIME_ONLY`.
  - `reserve_trip_voucher(p_user uuid, p_code text, p_ref text, p_due_at timestamptz)` → `{ status, code, coins, due_at, created }`; a repeat for the same `p_ref` returns the existing row with `created: false`; raises `BAD_REFERENCE` or any check code.
  - `pay_trip_voucher(p_ref text)` → `{ status, coins, user_id, code, applied }`; `applied: true` only on the call that credited.
  - `void_trip_voucher(p_ref text)` → `{ status, voided }`; `status: 'none'` when the booking has no reward.
  - `redeem_voucher(p_user uuid, p_code text)` (same signature) now raises `VOUCHER_WRONG_KIND` for a trip voucher and ignores `void` rows in its already-redeemed check.

- [ ] **Step 1: Give the stub a bookings table**

Append to `tests/sql/jet_wallet_stub.sql`:

```sql
create table if not exists public.bookings (
  id bigserial primary key,
  booking_reference text unique,
  user_id uuid,
  travel_type text,
  status text,
  payment_status text,
  booking_details jsonb not null default '{}'::jsonb
);
```

(`bookings.user_id` is `uuid` in production: its RLS policy compares it to `auth.uid()` uncast. Task 8 checks this live.)

- [ ] **Step 2: Write the failing SQL test**

Create `tests/sql/trip_vouchers.test.sql`:

```sql
\set ON_ERROR_STOP 1
insert into public.users (id, email) values
  ('00000000-0000-4000-8000-000000000011', 'trip-a@test.dev'),
  ('00000000-0000-4000-8000-000000000012', 'trip-b@test.dev'),
  ('00000000-0000-4000-8000-000000000013', 'trip-c@test.dev'),
  ('00000000-0000-4000-8000-000000000014', 'trip-d@test.dev')
on conflict do nothing;

do $$
declare
  a uuid := '00000000-0000-4000-8000-000000000011';
  b uuid := '00000000-0000-4000-8000-000000000012';
  c uuid := '00000000-0000-4000-8000-000000000013';
  d uuid := '00000000-0000-4000-8000-000000000014';
  due timestamptz := '2026-11-18 00:00:00+00';
  trip50 uuid;
  r jsonb;
  failed boolean;
  sig text;
begin
  insert into public.vouchers (code, coins, kind) values ('TRIP50', 5000, 'trip');
  insert into public.vouchers (code, coins, kind, first_time_only) values ('FIRSTTRIP', 2000, 'trip', true);
  insert into public.vouchers (code, coins, kind, max_redemptions) values ('ONETRIP', 1000, 'trip', 1);
  insert into public.vouchers (code, coins, kind, is_active) values ('OFFTRIP', 1000, 'trip', false);
  insert into public.vouchers (code, coins, kind, valid_until) values ('OLDTRIP', 1000, 'trip', now() - interval '1 day');
  insert into public.vouchers (code, coins, kind, valid_from) values ('SOONTRIP', 1000, 'trip', now() + interval '1 day');
  insert into public.vouchers (code, coins) values ('INSTANT10', 1000);
  select id into trip50 from public.vouchers where code = 'TRIP50';

  assert (select kind from public.vouchers where code = 'INSTANT10') = 'instant', 'a voucher is instant unless made a trip reward';
  assert (select first_time_only from public.vouchers where code = 'INSTANT10') is false, 'a voucher is open to everyone unless ticked first-time only';

  failed := false;
  begin insert into public.vouchers (code, coins, kind) values ('BADKIND', 100, 'cash'); exception when check_violation then failed := true; end;
  assert failed, 'a voucher is instant or trip';

  r := public.check_trip_voucher(a, ' trip50 ', null);
  assert r->>'code' = 'TRIP50' and (r->>'coins')::bigint = 5000 and r->>'kind' = 'trip' and (r->>'id')::uuid = trip50, 'check names the voucher and its coins';
  assert (select redemptions_count from public.vouchers where id = trip50) = 0, 'check reserves nothing';

  failed := false;
  begin perform public.check_trip_voucher(a, 'INSTANT10', null); exception when others then failed := sqlerrm like '%VOUCHER_WRONG_KIND%'; end;
  assert failed, 'an instant voucher typed at checkout is pointed to the wallet';

  failed := false;
  begin perform public.redeem_voucher(a, 'TRIP50'); exception when others then failed := sqlerrm like '%VOUCHER_WRONG_KIND%'; end;
  assert failed, 'a trip voucher typed in the wallet is pointed to checkout';
  assert not exists (select 1 from public.voucher_redemptions where voucher_id = trip50), 'the refused redeem left nothing behind';

  failed := false;
  begin perform public.check_trip_voucher(a, 'NOPE', null); exception when others then failed := sqlerrm like '%VOUCHER_NOT_FOUND%'; end;
  assert failed, 'an unknown code is refused';
  failed := false;
  begin perform public.check_trip_voucher(a, 'OFFTRIP', null); exception when others then failed := sqlerrm like '%VOUCHER_INACTIVE%'; end;
  assert failed, 'an inactive voucher is refused';
  failed := false;
  begin perform public.check_trip_voucher(a, 'OLDTRIP', null); exception when others then failed := sqlerrm like '%VOUCHER_EXPIRED%'; end;
  assert failed, 'an expired voucher is refused';
  failed := false;
  begin perform public.check_trip_voucher(a, 'SOONTRIP', null); exception when others then failed := sqlerrm like '%VOUCHER_NOT_STARTED%'; end;
  assert failed, 'a voucher not started yet is refused';

  r := public.reserve_trip_voucher(a, 'trip50', 'FLTA1', due);
  assert r->>'status' = 'pending' and (r->>'created')::boolean and r->>'code' = 'TRIP50' and (r->>'coins')::bigint = 5000, 'reserve holds a pending reward';
  assert (r->>'due_at')::timestamptz = due, 'reserve keeps the payout date';
  assert (select redemptions_count from public.vouchers where id = trip50) = 1, 'reserve counts the use';
  assert coalesce((select balance from public.wallets where user_id = a), 0) = 0, 'reserve credits nothing yet';

  r := public.reserve_trip_voucher(a, 'TRIP50', 'FLTA1', due);
  assert r->>'status' = 'pending' and not (r->>'created')::boolean, 'reserving the same booking again changes nothing';
  assert (select redemptions_count from public.vouchers where id = trip50) = 1, 'a repeat is not counted twice';
  assert (select count(*) from public.voucher_redemptions where booking_reference = 'FLTA1') = 1, 'one reward per booking';

  failed := false;
  begin perform public.reserve_trip_voucher(a, 'TRIP50', 'FLTA2', due); exception when others then failed := sqlerrm like '%VOUCHER_ALREADY_REDEEMED%'; end;
  assert failed, 'a customer uses a voucher once';
  failed := false;
  begin perform public.check_trip_voucher(a, 'TRIP50', null); exception when others then failed := sqlerrm like '%VOUCHER_ALREADY_REDEEMED%'; end;
  assert failed, 'checkout says so before payment';

  failed := false;
  begin
    insert into public.voucher_redemptions (voucher_id, user_id, coins, status, booking_reference) values (trip50, a, 5000, 'pending', 'FLTA9');
  exception when unique_violation then failed := true; end;
  assert failed, 'the database itself refuses a second live use';

  r := public.void_trip_voucher('FLTA1');
  assert r->>'status' = 'void' and (r->>'voided')::boolean, 'void cancels a pending reward';
  assert (select redemptions_count from public.vouchers where id = trip50) = 0, 'void gives the use back';
  r := public.void_trip_voucher('FLTA1');
  assert r->>'status' = 'void' and not (r->>'voided')::boolean and (select redemptions_count from public.vouchers where id = trip50) = 0, 'void twice changes nothing more';

  r := public.reserve_trip_voucher(a, 'TRIP50', 'FLTA2', due);
  assert r->>'status' = 'pending' and (r->>'created')::boolean, 'a voided reward frees the voucher for that customer';
  r := public.reserve_trip_voucher(a, 'TRIP50', 'FLTA1', due);
  assert r->>'status' = 'void' and not (r->>'created')::boolean, 'a cancelled booking is not given a new reward';

  r := public.pay_trip_voucher('FLTA2');
  assert r->>'status' = 'paid' and (r->>'applied')::boolean and (r->>'coins')::bigint = 5000 and (r->>'user_id')::uuid = a and r->>'code' = 'TRIP50', 'pay credits the reward';
  assert (select balance from public.wallets where user_id = a) = 5000, 'the coins land in the wallet';
  assert (select booking_reference from public.wallet_entries where idempotency_key = 'voucher:' || trip50 || ':' || a) = 'FLTA2', 'the wallet entry names the trip';
  assert (select note from public.wallet_entries where idempotency_key = 'voucher:' || trip50 || ':' || a) = 'TRIP50', 'the wallet entry names the voucher';
  assert (select kind from public.wallet_entries where idempotency_key = 'voucher:' || trip50 || ':' || a) = 'voucher', 'a payout is a voucher entry';
  assert (select paid_at from public.voucher_redemptions where booking_reference = 'FLTA2') is not null, 'pay records when';

  r := public.pay_trip_voucher('FLTA2');
  assert r->>'status' = 'paid' and not (r->>'applied')::boolean and (select balance from public.wallets where user_id = a) = 5000, 'pay twice credits once';
  r := public.void_trip_voucher('FLTA2');
  assert r->>'status' = 'paid' and not (r->>'voided')::boolean, 'a reward already paid is kept';
  assert (select balance from public.wallets where user_id = a) = 5000 and (select redemptions_count from public.vouchers where id = trip50) = 1, 'keeping it changes nothing';
  r := public.pay_trip_voucher('FLTA1');
  assert r->>'status' = 'void' and not (r->>'applied')::boolean, 'a voided reward is never paid';
  r := public.pay_trip_voucher('FLTNONE');
  assert r->>'status' = 'none', 'paying a booking with no reward does nothing';
  r := public.void_trip_voucher('FLTNONE');
  assert r->>'status' = 'none', 'voiding a booking with no reward does nothing';

  insert into public.bookings (booking_reference, user_id, travel_type, status) values
    ('FLTB-OLD', b, 'flight', 'cancelled'),
    ('HTLB-OLD', b, 'hotel', 'confirmed'),
    ('FLTC-OLD', c, 'flight', 'pending_ticketing'),
    ('FLTD-NEW', d, 'flight', 'confirmed');
  r := public.check_trip_voucher(b, 'FIRSTTRIP', null);
  assert r->>'code' = 'FIRSTTRIP', 'cancelled flights and other kinds of booking leave a customer first-time';
  failed := false;
  begin perform public.check_trip_voucher(c, 'FIRSTTRIP', null); exception when others then failed := sqlerrm like '%VOUCHER_FIRST_TIME_ONLY%'; end;
  assert failed, 'a customer with a flight being ticketed is not first-time';
  r := public.reserve_trip_voucher(d, 'FIRSTTRIP', 'FLTD-NEW', due);
  assert r->>'status' = 'pending', 'the booking being rewarded does not count against itself';
  r := public.check_trip_voucher(c, 'TRIP50', null);
  assert r->>'code' = 'TRIP50', 'first-time only binds only the vouchers ticked for it';

  r := public.reserve_trip_voucher(b, 'ONETRIP', 'FLTB-1', due);
  failed := false;
  begin perform public.check_trip_voucher(c, 'ONETRIP', null); exception when others then failed := sqlerrm like '%VOUCHER_USED_UP%'; end;
  assert failed, 'a voucher stops at its limit';
  perform public.void_trip_voucher('FLTB-1');
  r := public.check_trip_voucher(c, 'ONETRIP', null);
  assert r->>'code' = 'ONETRIP', 'a voided reward gives its use back to everyone';

  r := public.reserve_trip_voucher(c, 'TRIP50', 'FLTC-1', null);
  assert r->>'status' = 'pending' and (select due_at from public.voucher_redemptions where booking_reference = 'FLTC-1') is null, 'a trip with no readable date is reserved with no payout date';

  failed := false;
  begin perform public.reserve_trip_voucher(c, 'TRIP50', null, due); exception when others then failed := sqlerrm like '%BAD_REFERENCE%'; end;
  assert failed, 'a reward needs a booking';

  r := public.redeem_voucher(d, 'INSTANT10');
  assert (select status from public.voucher_redemptions r2 join public.vouchers v on v.id = r2.voucher_id where v.code = 'INSTANT10' and r2.user_id = d) = 'credited', 'an instant redemption is recorded as credited';
  assert (select booking_reference from public.voucher_redemptions r2 join public.vouchers v on v.id = r2.voucher_id where v.code = 'INSTANT10' and r2.user_id = d) is null, 'an instant redemption names no booking';

  foreach sig in array array[
    'public.check_trip_voucher(uuid,text,text)',
    'public.reserve_trip_voucher(uuid,text,text,timestamptz)',
    'public.pay_trip_voucher(text)',
    'public.void_trip_voucher(text)',
    'public.redeem_voucher(uuid,text)'
  ] loop
    assert not has_function_privilege('anon', sig, 'execute'), format('anon cannot execute %s', sig);
    assert not has_function_privilege('authenticated', sig, 'execute'), format('signed-in clients cannot execute %s', sig);
    assert has_function_privilege('service_role', sig, 'execute'), format('the backend can execute %s', sig);
  end loop;

  assert not exists (select 1 from pg_constraint where conrelid = 'public.voucher_redemptions'::regclass and contype = 'u'), 'the old once-per-customer constraint is gone';
  assert exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'voucher_redemptions_live_once'), 'once per customer is now a partial index';
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'reserve_trip_voucher') = 1, 'applying the migration twice leaves one reserve_trip_voucher';
end $$;
```

- [ ] **Step 3: Replace the runner**

Replace the whole of `scripts/db/test-jet-wallet.sh` with:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
MIGRATIONS=(
  supabase/migrations/20261013120000_jet_wallet.sql
  supabase/migrations/20261013150000_trip_reward_vouchers.sql
)
NAME=""
trap 'if [ -n "$NAME" ]; then docker rm -f "$NAME" >/dev/null 2>&1 || true; fi' EXIT
run() { docker exec -i -e PGOPTIONS='-c client_min_messages=warning' "$NAME" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres; }
scalar() { docker exec "$NAME" psql -U postgres -tAc "$1"; }

for version in ${PG_VERSIONS:-15 16}; do
  NAME="jet-wallet-pg${version}-$$"
  docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=pw "postgres:${version}-alpine" >/dev/null
  for _ in $(seq 1 60); do
    scalar 'select 1' >/dev/null 2>&1 && break
    sleep 1
  done
  sleep 2
  run < tests/sql/jet_wallet_stub.sql
  for _ in 1 2; do
    for migration in "${MIGRATIONS[@]}"; do run < "$migration"; done
  done
  run < tests/sql/jet_wallet.test.sql
  run < tests/sql/trip_vouchers.test.sql
  run <<'SQL'
insert into public.users (id, email) values
  ('00000000-0000-4000-8000-000000000003', 'c@test.dev'),
  ('00000000-0000-4000-8000-000000000004', 'd@test.dev')
on conflict do nothing;
insert into public.vouchers (code, coins, max_redemptions) values ('RACE', 100, 1) on conflict do nothing;
insert into public.vouchers (code, coins, kind, max_redemptions) values ('RACETRIP', 100, 'trip', 1) on conflict do nothing;
SQL
  # Two customers redeem a one-use voucher at the same moment: exactly one gets it.
  {
    echo "select public.redeem_voucher('00000000-0000-4000-8000-000000000003', 'RACE');" | run >/dev/null 2>&1 &
    echo "select public.redeem_voucher('00000000-0000-4000-8000-000000000004', 'RACE');" | run >/dev/null 2>&1 &
    wait
  } || true
  count=$(scalar "select count(*) from public.voucher_redemptions r join public.vouchers v on v.id = r.voucher_id where v.code = 'RACE'")
  [ "$count" = "1" ] || { echo "Postgres ${version}: RACE voucher was redeemed $count times"; exit 1; }
  # Two customers reserve the last use of a trip voucher at the same moment: exactly one gets it.
  {
    echo "select public.reserve_trip_voucher('00000000-0000-4000-8000-000000000003', 'RACETRIP', 'FLTRACE3', now());" | run >/dev/null 2>&1 &
    echo "select public.reserve_trip_voucher('00000000-0000-4000-8000-000000000004', 'RACETRIP', 'FLTRACE4', now());" | run >/dev/null 2>&1 &
    wait
  } || true
  count=$(scalar "select count(*) from public.voucher_redemptions r join public.vouchers v on v.id = r.voucher_id where v.code = 'RACETRIP' and r.status = 'pending'")
  [ "$count" = "1" ] || { echo "Postgres ${version}: RACETRIP was reserved $count times"; exit 1; }
  used=$(scalar "select redemptions_count from public.vouchers where code = 'RACETRIP'")
  [ "$used" = "1" ] || { echo "Postgres ${version}: RACETRIP counts $used uses"; exit 1; }
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  NAME=""
  echo "Postgres ${version}: every check passed"
done
echo "Jet Wallet SQL: every check passed"
```

- [ ] **Step 4: Run it to see it fail**

Run: `bash scripts/db/test-jet-wallet.sh`
Expected: FAIL on Postgres 15 with `supabase/migrations/20261013150000_trip_reward_vouchers.sql: No such file or directory`.

- [ ] **Step 5: Write the migration**

Create `supabase/migrations/20261013150000_trip_reward_vouchers.sql`:

```sql
-- Trip-reward vouchers: a voucher typed at flight checkout whose Jet Coins are
-- paid into the wallet after the trip, instead of when it is redeemed.
--
-- Additive, on top of 20261013120000_jet_wallet.sql (already applied). Apply by
-- hand, after it:
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/20261013150000_trip_reward_vouchers.sql
-- Safe to run twice.
--
-- One transaction: Supabase grants EXECUTE on new functions to anon and
-- authenticated, so a failure part-way must not leave them callable.

begin;

alter table public.vouchers add column if not exists kind text not null default 'instant';
alter table public.vouchers add column if not exists first_time_only boolean not null default false;

alter table public.voucher_redemptions add column if not exists booking_reference text;
alter table public.voucher_redemptions add column if not exists status text not null default 'credited';
alter table public.voucher_redemptions add column if not exists due_at timestamptz;
alter table public.voucher_redemptions add column if not exists paid_at timestamptz;
alter table public.voucher_redemptions add column if not exists updated_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vouchers'::regclass and conname = 'vouchers_kind_check') then
    alter table public.vouchers add constraint vouchers_kind_check check (kind in ('instant', 'trip'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.voucher_redemptions'::regclass and conname = 'voucher_redemptions_status_check') then
    alter table public.voucher_redemptions add constraint voucher_redemptions_status_check
      check (status in ('credited', 'pending', 'paid', 'void'));
  end if;
end $$;

-- A voided trip reward frees the voucher for that customer: "once per customer"
-- moves from a table constraint to an index that skips void rows.
do $$
declare
  c text;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.voucher_redemptions'::regclass
      and con.contype = 'u'
      and (select array_agg(att.attname::text order by att.attname::text)
           from unnest(con.conkey) as k(attnum)
           join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum) = array['user_id', 'voucher_id']
  loop
    execute format('alter table public.voucher_redemptions drop constraint %I', c);
  end loop;
end $$;

create unique index if not exists voucher_redemptions_live_once
  on public.voucher_redemptions (voucher_id, user_id) where status <> 'void';
create unique index if not exists voucher_redemptions_booking_once
  on public.voucher_redemptions (booking_reference) where booking_reference is not null;
create index if not exists voucher_redemptions_pending_due
  on public.voucher_redemptions (due_at) where status = 'pending';

create or replace function public.check_trip_voucher(p_user uuid, p_code text, p_ref text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.vouchers;
begin
  select * into v from public.vouchers where code = upper(btrim(coalesce(p_code, '')));
  if not found then raise exception 'VOUCHER_NOT_FOUND'; end if;
  if not v.is_active then raise exception 'VOUCHER_INACTIVE'; end if;
  if v.kind <> 'trip' then raise exception 'VOUCHER_WRONG_KIND'; end if;
  if v.valid_from is not null and now() < v.valid_from then raise exception 'VOUCHER_NOT_STARTED'; end if;
  if v.valid_until is not null and now() > v.valid_until then raise exception 'VOUCHER_EXPIRED'; end if;
  if exists (select 1 from public.voucher_redemptions
             where voucher_id = v.id and user_id = p_user and status <> 'void'
               and booking_reference is distinct from p_ref) then
    raise exception 'VOUCHER_ALREADY_REDEEMED';
  end if;
  if v.max_redemptions is not null and v.redemptions_count >= v.max_redemptions then
    raise exception 'VOUCHER_USED_UP';
  end if;
  if v.first_time_only and exists (select 1 from public.bookings b
             where b.user_id = p_user
               and coalesce(b.travel_type, 'flight') = 'flight'
               and b.status in ('confirmed', 'pending_ticketing')
               and b.booking_reference is distinct from p_ref) then
    raise exception 'VOUCHER_FIRST_TIME_ONLY';
  end if;
  return jsonb_build_object('id', v.id, 'code', v.code, 'coins', v.coins, 'kind', v.kind);
end;
$$;

create or replace function public.reserve_trip_voucher(p_user uuid, p_code text, p_ref text, p_due_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.vouchers;
  r public.voucher_redemptions;
begin
  if p_user is null or p_ref is null or btrim(p_ref) = '' then
    raise exception 'BAD_REFERENCE';
  end if;
  select * into v from public.vouchers where code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found then raise exception 'VOUCHER_NOT_FOUND'; end if;
  select * into r from public.voucher_redemptions where booking_reference = p_ref;
  if found then
    return jsonb_build_object('status', r.status, 'code', (select code from public.vouchers where id = r.voucher_id),
      'coins', r.coins, 'due_at', r.due_at, 'created', false);
  end if;
  perform public.check_trip_voucher(p_user, v.code, p_ref);
  insert into public.voucher_redemptions (voucher_id, user_id, coins, booking_reference, status, due_at, updated_at)
  values (v.id, p_user, v.coins, p_ref, 'pending', p_due_at, now());
  update public.vouchers set redemptions_count = redemptions_count + 1, updated_at = now() where id = v.id;
  return jsonb_build_object('status', 'pending', 'code', v.code, 'coins', v.coins, 'due_at', p_due_at, 'created', true);
end;
$$;

create or replace function public.pay_trip_voucher(p_ref text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.voucher_redemptions;
  v_code text;
begin
  select * into r from public.voucher_redemptions where booking_reference = p_ref for update;
  if not found then
    return jsonb_build_object('status', 'none', 'coins', 0, 'applied', false);
  end if;
  select code into v_code from public.vouchers where id = r.voucher_id;
  if r.status <> 'pending' then
    return jsonb_build_object('status', r.status, 'coins', r.coins, 'user_id', r.user_id, 'code', v_code, 'applied', false);
  end if;
  perform public.wallet_apply(r.user_id, r.coins, 'voucher', 'voucher:' || r.voucher_id || ':' || r.user_id, p_ref, r.voucher_id, v_code);
  update public.voucher_redemptions set status = 'paid', paid_at = now(), updated_at = now() where id = r.id;
  return jsonb_build_object('status', 'paid', 'coins', r.coins, 'user_id', r.user_id, 'code', v_code, 'applied', true);
end;
$$;

-- Locks the voucher before the reward, the same order reserve takes them, so a
-- void and a reserve of the same voucher cannot deadlock.
create or replace function public.void_trip_voucher(p_ref text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_voucher uuid;
  r public.voucher_redemptions;
begin
  select voucher_id into v_voucher from public.voucher_redemptions where booking_reference = p_ref;
  if not found then
    return jsonb_build_object('status', 'none', 'voided', false);
  end if;
  perform 1 from public.vouchers where id = v_voucher for update;
  select * into r from public.voucher_redemptions where booking_reference = p_ref for update;
  if r.status <> 'pending' then
    return jsonb_build_object('status', r.status, 'voided', false);
  end if;
  update public.voucher_redemptions set status = 'void', updated_at = now() where id = r.id;
  update public.vouchers set redemptions_count = greatest(redemptions_count - 1, 0), updated_at = now() where id = r.voucher_id;
  return jsonb_build_object('status', 'void', 'voided', true, 'coins', r.coins);
end;
$$;

create or replace function public.redeem_voucher(p_user uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.vouchers;
  v_result jsonb;
begin
  select * into v from public.vouchers where code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found then raise exception 'VOUCHER_NOT_FOUND'; end if;
  if not v.is_active then raise exception 'VOUCHER_INACTIVE'; end if;
  if v.kind <> 'instant' then raise exception 'VOUCHER_WRONG_KIND'; end if;
  if v.valid_from is not null and now() < v.valid_from then raise exception 'VOUCHER_NOT_STARTED'; end if;
  if v.valid_until is not null and now() > v.valid_until then raise exception 'VOUCHER_EXPIRED'; end if;
  if exists (select 1 from public.voucher_redemptions where voucher_id = v.id and user_id = p_user and status <> 'void') then
    raise exception 'VOUCHER_ALREADY_REDEEMED';
  end if;
  if v.max_redemptions is not null and v.redemptions_count >= v.max_redemptions then
    raise exception 'VOUCHER_USED_UP';
  end if;
  insert into public.voucher_redemptions (voucher_id, user_id, coins) values (v.id, p_user, v.coins);
  update public.vouchers set redemptions_count = redemptions_count + 1, updated_at = now() where id = v.id;
  v_result := public.wallet_apply(p_user, v.coins, 'voucher', 'voucher:' || v.id || ':' || p_user, null, v.id, v.code);
  return jsonb_build_object('coins', v.coins, 'balance', (v_result->>'balance')::bigint, 'code', v.code);
end;
$$;

-- Supabase grants EXECUTE on new public functions to anon and authenticated by
-- default. These move money: only the backend's service_role may call them.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.check_trip_voucher(uuid,text,text)',
    'public.reserve_trip_voucher(uuid,text,text,timestamptz)',
    'public.pay_trip_voucher(text)',
    'public.void_trip_voucher(text)',
    'public.redeem_voucher(uuid,text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;
```

- [ ] **Step 6: Run the SQL suite and see it pass**

Run: `bash scripts/db/test-jet-wallet.sh`
Expected (last three lines):
```
Postgres 15: every check passed
Postgres 16: every check passed
Jet Wallet SQL: every check passed
```

- [ ] **Step 7: Run CI's unit command**

Run: `AMADEUS_WS_ENDPOINT= AMADEUS_WS_USERNAME= AMADEUS_WS_PASSWORD= AMADEUS_WS_OFFICE_ID= VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run test:unit`
Expected: PASS (no JS changed yet).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20261013150000_trip_reward_vouchers.sql tests/sql/jet_wallet_stub.sql tests/sql/trip_vouchers.test.sql scripts/db/test-jet-wallet.sh
git commit -F - <<'EOF'
feat(wallet): trip-reward vouchers in the database

Vouchers gain a kind (instant or trip) and a first-time-only switch.
A trip voucher is reserved per booking (pending), paid into the wallet
after the trip (paid) or voided when the booking goes (void). Once per
customer is now a partial index that skips void rows, so a voided
reward frees the voucher. redeem_voucher refuses trip vouchers.

The SQL suite runs on Postgres 15 and 16 and applies both migrations
twice, with a race on the last use of a trip voucher.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CnRin1ZGh44yizpdTBakw6
EOF
```

---

### Task 2: Service, voucher-check API and the admin backend

**Files:**
- Modify: `backend/services/wallet.service.js` (whole file replaced)
- Modify: `backend/controllers/wallet.controller.js`
- Modify: `backend/routes/wallet.routes.js` (whole file replaced)
- Modify: `backend/controllers/vouchers.controller.js` (whole file replaced)
- Modify: `backend/services/coupon.service.js`
- Modify: `backend/routes/coupon.routes.js`
- Test: `tests/backend/tripVoucherService.test.js` (create), `tests/backend/tripVoucherAdmin.test.js` (create), `tests/backend/walletService.test.js` (helper), `tests/backend/vouchersController.test.js` (one expectation)

**Interfaces:**
- Consumes: Task 1's functions and columns.
- Produces (`backend/services/wallet.service.js`):
  - `VOUCHER_CODE_PATTERN = /^[A-Z0-9-]{3,32}$/`; `normalizeVoucherCode(code) → string` (trimmed, uppercase).
  - `checkTripVoucher(client, { userId, code, bookingReference = null }) → Promise<{ id, code, coins, kind }>`; throws `WalletError` with `.code` (`VOUCHER_*` or `WALLET_UNAVAILABLE`).
  - `reserveTripVoucher(client, { userId, code, bookingReference, dueAt = null }) → Promise<{ status, code, coins, due_at, created }>`; throws `WalletError`.
  - `payTripVoucher(client, bookingReference) → Promise<{ status, coins, user_id, code, applied }>`; throws `WalletError`.
  - `voidTripReward(client, bookingReference) → Promise<{ ok: boolean, status: string }>`; never throws.
  - `tripVoucherOf(verifiedCharge) → { id, code, coins } | null`.
  - `isVoucherCode(client, code) → Promise<boolean>`.
  - `walletSummary(...)` result gains `pending: Array<{ bookingReference, code, coins, dueAt }>`.
  - `VOUCHER_MESSAGES` (wallet words) gains `VOUCHER_WRONG_KIND: 'Use this code at checkout when you book a flight.'`, `VOUCHER_FIRST_TIME_ONLY: 'This voucher is for first-time customers only.'`.
  - `CHECKOUT_VOUCHER_MESSAGES` (checkout words): as above but `VOUCHER_NOT_FOUND: 'That code was not found. Please check it and try again.'`, `VOUCHER_USED_UP: 'This voucher has been fully used.'`, `VOUCHER_ALREADY_REDEEMED: 'You have already used this voucher.'`, `VOUCHER_WRONG_KIND: 'Redeem this code in Profile → Jet Wallet.'`.
- Produces (HTTP): `POST /api/wallet/voucher-check { code }` (`protect`, `voucherRedeemLimiter`) → `200 { success: true, data: { kind: 'trip', code, coins } }`, or `{ success: false, code, error }` with 404 (`VOUCHER_NOT_FOUND`), 409 (`VOUCHER_ALREADY_REDEEMED | VOUCHER_USED_UP | VOUCHER_WRONG_KIND | VOUCHER_FIRST_TIME_ONLY`), 400 (other `VOUCHER_*`), 503 (`WALLET_UNAVAILABLE`), 401 without a session.
- Produces (admin): `voucherInput(body)` row gains `kind` and `first_time_only` (`first_time_only` is only ever true for a trip voucher). Create/update accept `kind` and `firstTimeOnly`; a code a coupon uses answers 409 `CODE_TAKEN`, `A coupon already uses this code. Pick another code.`; a kind change after use answers 409 `VOUCHER_LOCKED`. `GET /api/vouchers/:id/redemptions` rows gain `status`, `bookingReference`, `dueAt`, `paidAt`.
- Produces (`backend/services/coupon.service.js`): `isCouponCode(client, code) → Promise<boolean>`. Coupon create/rename answers 409 `{ success: false, message: 'A voucher already uses this code. Pick another code.' }`.

- [ ] **Step 1: Write the failing service and API test**

Create `tests/backend/tripVoucherService.test.js`:

```js
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseMock } from './setup.js';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import {
  CHECKOUT_VOUCHER_MESSAGES, VOUCHER_MESSAGES, checkTripVoucher, isVoucherCode, payTripVoucher, reserveTripVoucher,
  tripVoucherOf, voidTripReward, walletSummary,
} from '../../backend/services/wallet.service.js';
import { redeem, voucherCheck } from '../../backend/controllers/wallet.controller.js';

const USER = { id: '0b7c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4', role: 'user' };
const rpcClient = (answer) => ({ rpc: vi.fn(async () => answer) });
const run = async (handler, body) => {
  const res = createResponse();
  await handler(createRequest({ user: USER, body }), res);
  return res;
};

describe('the trip-voucher service', () => {
  it('checks a code for the customer, uppercased, with no booking yet', async () => {
    const client = rpcClient({ data: { id: 'v1', code: 'SHUBHAM', coins: 5000, kind: 'trip' }, error: null });
    const voucher = await checkTripVoucher(client, { userId: 'u1', code: ' shubham ' });
    expect(client.rpc).toHaveBeenCalledWith('check_trip_voucher', { p_user: 'u1', p_code: 'SHUBHAM', p_ref: null });
    expect(voucher).toMatchObject({ code: 'SHUBHAM', coins: 5000 });
  });

  it('names the new refusals for what they are', async () => {
    for (const code of ['VOUCHER_WRONG_KIND', 'VOUCHER_FIRST_TIME_ONLY', 'BAD_REFERENCE']) {
      const client = rpcClient({ data: null, error: { message: code } });
      await expect(checkTripVoucher(client, { userId: 'u1', code: 'SHUBHAM' })).rejects.toMatchObject({ code });
    }
  });

  it('reserves under the booking with its payout date', async () => {
    const client = rpcClient({ data: { status: 'pending', coins: 5000 }, error: null });
    await reserveTripVoucher(client, { userId: 'u1', code: 'shubham', bookingReference: 'FLT1', dueAt: '2026-11-18T00:00:00.000Z' });
    expect(client.rpc).toHaveBeenCalledWith('reserve_trip_voucher', {
      p_user: 'u1', p_code: 'SHUBHAM', p_ref: 'FLT1', p_due_at: '2026-11-18T00:00:00.000Z',
    });
  });

  it('sends a missing payout date as null, never undefined', async () => {
    const client = rpcClient({ data: { status: 'pending' }, error: null });
    await reserveTripVoucher(client, { userId: 'u1', code: 'SHUBHAM', bookingReference: 'FLT1' });
    expect(client.rpc.mock.calls[0][1].p_due_at).toBeNull();
  });

  it('pays by booking', async () => {
    const client = rpcClient({ data: { status: 'paid', applied: true, coins: 5000 }, error: null });
    expect(await payTripVoucher(client, 'FLT1')).toMatchObject({ status: 'paid', applied: true });
    expect(client.rpc).toHaveBeenCalledWith('pay_trip_voucher', { p_ref: 'FLT1' });
  });

  it('voids by booking and never throws', async () => {
    const ok = rpcClient({ data: { status: 'void', voided: true }, error: null });
    expect(await voidTripReward(ok, 'FLT1')).toEqual({ ok: true, status: 'void' });
    expect(ok.rpc).toHaveBeenCalledWith('void_trip_voucher', { p_ref: 'FLT1' });
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await voidTripReward(rpcClient({ data: null, error: { message: 'connection reset' } }), 'FLT1')).toEqual({ ok: false, status: 'error' });
    silence.mockRestore();
  });

  it('asks nothing without a booking reference', async () => {
    const client = rpcClient({ data: {}, error: null });
    expect(await voidTripReward(client, '')).toEqual({ ok: true, status: 'none' });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('reads the voucher off a verified charge', () => {
    expect(tripVoucherOf({ voucher: { id: 'v1', code: 'SHUBHAM', coins: 5000 } })).toEqual({ id: 'v1', code: 'SHUBHAM', coins: 5000 });
    expect(tripVoucherOf({ voucher: null })).toBeNull();
    expect(tripVoucherOf({ voucher: { coins: 5 } })).toBeNull();
    expect(tripVoucherOf(null)).toBeNull();
  });

  it('tells whether a voucher already uses a code', async () => {
    const lookup = (row) => {
      const chain = {};
      for (const op of ['select', 'eq', 'limit']) chain[op] = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => ({ data: row, error: null }));
      return { from: vi.fn(() => chain), chain };
    };
    const taken = lookup({ id: 'v1' });
    expect(await isVoucherCode(taken, ' shubham ')).toBe(true);
    expect(taken.chain.eq).toHaveBeenCalledWith('code', 'SHUBHAM');
    expect(await isVoucherCode(lookup(null), 'SHUBHAM')).toBe(false);
  });

  it('lists the trip rewards still to come in the wallet summary', async () => {
    const tables = {
      wallets: { data: { balance: 0 }, error: null },
      wallet_holds: { data: [], error: null },
      wallet_entries: { data: [], error: null },
      voucher_redemptions: { data: [{ booking_reference: 'FLT1', coins: 5000, due_at: '2026-11-18T00:00:00+00:00', vouchers: { code: 'SHUBHAM' } }], error: null },
    };
    const client = {
      from: vi.fn((table) => {
        const chain = {};
        for (const op of ['select', 'eq', 'order', 'limit']) chain[op] = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(async () => tables[table]);
        chain.then = (resolve) => resolve(tables[table]);
        return chain;
      }),
    };
    const summary = await walletSummary(client, 'u1');
    expect(summary.pending).toEqual([{ bookingReference: 'FLT1', code: 'SHUBHAM', coins: 5000, dueAt: '2026-11-18T00:00:00+00:00' }]);
  });

  it('words the pointers exactly as the owner asked', () => {
    expect(CHECKOUT_VOUCHER_MESSAGES.VOUCHER_WRONG_KIND).toBe('Redeem this code in Profile → Jet Wallet.');
    expect(VOUCHER_MESSAGES.VOUCHER_WRONG_KIND).toBe('Use this code at checkout when you book a flight.');
  });
});

describe('POST /wallet/voucher-check', () => {
  beforeEach(() => { supabaseMock.rpc = vi.fn(); });

  it('checks a trip voucher for the signed-in customer, never one named in the body', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { id: 'v1', code: 'SHUBHAM', coins: 5000, kind: 'trip' }, error: null });
    const res = await run(voucherCheck, { code: ' shubham ', userId: 'someone-else' });
    expect(supabaseMock.rpc).toHaveBeenCalledWith('check_trip_voucher', { p_user: USER.id, p_code: 'SHUBHAM', p_ref: null });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, data: { kind: 'trip', code: 'SHUBHAM', coins: 5000 } });
  });

  it('points an instant voucher to the wallet', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'VOUCHER_WRONG_KIND' } });
    const res = await run(voucherCheck, { code: 'WELCOME50' });
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'VOUCHER_WRONG_KIND', error: 'Redeem this code in Profile → Jet Wallet.' });
  });

  it('says first-time only in words', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'VOUCHER_FIRST_TIME_ONLY' } });
    const res = await run(voucherCheck, { code: 'SHUBHAM' });
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'VOUCHER_FIRST_TIME_ONLY', error: 'This voucher is for first-time customers only.' });
  });

  it('refuses a malformed code without asking the database', async () => {
    const res = await run(voucherCheck, { code: 'a b' });
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ code: 'VOUCHER_NOT_FOUND', error: 'That code was not found. Please check it and try again.' });
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it('says the voucher could not be checked when the database cannot answer', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    const res = await run(voucherCheck, { code: 'SHUBHAM' });
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('WALLET_UNAVAILABLE');
    silence.mockRestore();
  });

  it('is only for a signed-in customer', async () => {
    const { default: walletRoutes } = await import('../../backend/routes/wallet.routes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/wallet', walletRoutes);
    const res = await request(app).post('/api/wallet/voucher-check').send({ code: 'SHUBHAM' });
    expect(res.status).toBe(401);
  });
});

describe('the wallet redeem box', () => {
  beforeEach(() => { supabaseMock.rpc = vi.fn(); });

  it('points a trip voucher to checkout', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'VOUCHER_WRONG_KIND' } });
    const res = await run(redeem, { code: 'SHUBHAM' });
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'VOUCHER_WRONG_KIND', error: 'Use this code at checkout when you book a flight.' });
  });
});
```

- [ ] **Step 2: Write the failing admin test**

Create `tests/backend/tripVoucherAdmin.test.js`:

```js
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseMock } from './setup.js';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { createVoucher, listRedemptions, updateVoucher, voucherInput } from '../../backend/controllers/vouchers.controller.js';

vi.mock('../../backend/middleware/auth.middleware.js', () => ({
  protect: (req, _res, next) => { req.user = { id: 'a1', role: 'admin' }; next(); },
  admin: (_req, _res, next) => next(),
}));

const ADMIN = { id: 'a1', role: 'admin' };
const run = async (handler, { body = {}, params = {} } = {}) => {
  const res = createResponse();
  await handler(createRequest({ user: ADMIN, body, params }), res);
  return res;
};

const tables = (rows) => {
  const writes = [];
  supabaseMock.from.mockImplementation((table) => {
    const chain = {};
    for (const op of ['select', 'eq', 'order', 'limit']) chain[op] = vi.fn(() => chain);
    chain.insert = vi.fn((row) => { writes.push(['insert', table, row]); return chain; });
    chain.update = vi.fn((row) => { writes.push(['update', table, row]); return chain; });
    chain.single = vi.fn(async () => rows[table] ?? { data: null, error: null });
    chain.maybeSingle = chain.single;
    chain.then = (resolve) => resolve(rows[table] ?? { data: [], error: null });
    return chain;
  });
  return writes;
};

describe('voucher kinds in the admin form', () => {
  beforeEach(() => supabaseMock.from.mockReset());

  it('reads the kind and the first-time tick box', () => {
    expect(voucherInput({ code: 'SHUBHAM', valueUsd: 50, kind: 'trip', firstTimeOnly: true }).row)
      .toMatchObject({ kind: 'trip', first_time_only: true });
    expect(voucherInput({ code: 'SHUBHAM', valueUsd: 50 }).row).toMatchObject({ kind: 'instant', first_time_only: false });
  });

  it('keeps first-time only to trip rewards', () => {
    expect(voucherInput({ code: 'SHUBHAM', valueUsd: 50, kind: 'instant', firstTimeOnly: true }).row.first_time_only).toBe(false);
  });

  it('refuses a kind it does not know', () => {
    expect(voucherInput({ code: 'SHUBHAM', valueUsd: 50, kind: 'cash' })).toEqual({ ok: false, error: 'The kind must be Instant or Trip reward.' });
  });

  it('creates a trip reward for first-time customers', async () => {
    const writes = tables({ vouchers: { data: { id: 'v1', code: 'SHUBHAM' }, error: null } });
    const res = await run(createVoucher, { body: { code: 'shubham', valueUsd: 50, kind: 'trip', firstTimeOnly: true } });
    expect(res.statusCode).toBe(201);
    expect(writes.find(([op]) => op === 'insert')[2]).toMatchObject({ code: 'SHUBHAM', coins: 5000, kind: 'trip', first_time_only: true });
  });

  it('refuses a code a coupon already uses, and saves nothing', async () => {
    const writes = tables({ coupons: { data: { id: 'c1' }, error: null } });
    const res = await run(createVoucher, { body: { code: 'SAVE20', valueUsd: 50 } });
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'CODE_TAKEN', error: 'A coupon already uses this code. Pick another code.' });
    expect(writes.filter(([op]) => op === 'insert')).toHaveLength(0);
  });

  it('will not change the kind of a voucher customers have used', async () => {
    tables({ vouchers: { data: { id: 'v1', code: 'SHUBHAM', coins: 5000, kind: 'instant', redemptions_count: 1 }, error: null } });
    const res = await run(updateVoucher, { params: { id: 'v1' }, body: { kind: 'trip' } });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('VOUCHER_LOCKED');
  });

  it('changes the kind of a voucher nobody has used yet', async () => {
    const writes = tables({ vouchers: { data: { id: 'v1', code: 'SHUBHAM', coins: 5000, kind: 'instant', redemptions_count: 0 }, error: null } });
    const res = await run(updateVoucher, { params: { id: 'v1' }, body: { kind: 'trip', firstTimeOnly: true } });
    expect(res.statusCode).toBe(200);
    expect(writes.find(([op]) => op === 'update')[2]).toMatchObject({ kind: 'trip', first_time_only: true });
  });

  it('refuses renaming a voucher to a coupon code', async () => {
    const writes = tables({
      vouchers: { data: { id: 'v1', code: 'SHUBHAM', coins: 5000, kind: 'trip', redemptions_count: 0 }, error: null },
      coupons: { data: { id: 'c1' }, error: null },
    });
    const res = await run(updateVoucher, { params: { id: 'v1' }, body: { code: 'SAVE20' } });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('CODE_TAKEN');
    expect(writes.filter(([op]) => op === 'update')).toHaveLength(0);
  });

  it('lists who used a voucher with the reward status, booking and payout date', async () => {
    tables({
      voucher_redemptions: {
        data: [{
          id: 7, coins: 5000, created_at: '2026-10-13T10:00:00Z', user_id: 'u1', status: 'pending',
          booking_reference: 'FLT1', due_at: '2026-11-18T00:00:00+00:00', paid_at: null, users: { email: 'ada@example.com' },
        }],
        error: null,
      },
    });
    const res = await run(listRedemptions, { params: { id: 'v1' } });
    expect(res.body.data).toEqual([{
      id: 7, coins: 5000, createdAt: '2026-10-13T10:00:00Z', userId: 'u1', email: 'ada@example.com',
      status: 'pending', bookingReference: 'FLT1', dueAt: '2026-11-18T00:00:00+00:00', paidAt: null,
    }]);
  });
});

describe('one code, one meaning', () => {
  beforeEach(() => supabaseMock.from.mockReset());
  const couponApp = async () => {
    const { default: routes } = await import('../../backend/routes/coupon.routes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/coupons', routes);
    return app;
  };

  it('refuses a coupon whose code a voucher already uses', async () => {
    const writes = tables({ vouchers: { data: { id: 'v1' }, error: null } });
    const res = await request(await couponApp()).post('/api/coupons').send({ code: 'shubham', discountType: 'percentage', discountValue: 10 });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, message: 'A voucher already uses this code. Pick another code.' });
    expect(writes.filter(([op]) => op === 'insert')).toHaveLength(0);
  });

  it('still creates a coupon whose code no voucher uses', async () => {
    const writes = tables({ coupons: { data: { id: 'c9', code: 'SAVE10' }, error: null } });
    const res = await request(await couponApp()).post('/api/coupons').send({ code: 'save10', discountType: 'percentage', discountValue: 10 });
    expect(res.status).toBe(200);
    expect(writes.find(([op, table]) => op === 'insert' && table === 'coupons')[2][0]).toMatchObject({ code: 'SAVE10' });
  });

  it('refuses renaming a coupon to a voucher code', async () => {
    const writes = tables({ vouchers: { data: { id: 'v1' }, error: null } });
    const res = await request(await couponApp()).put('/api/coupons/c1').send({ code: 'shubham' });
    expect(res.status).toBe(409);
    expect(writes.filter(([op]) => op === 'update')).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run both to see them fail**

Run: `AMADEUS_WS_ENDPOINT= AMADEUS_WS_USERNAME= AMADEUS_WS_PASSWORD= AMADEUS_WS_OFFICE_ID= VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vitest run --project backend tests/backend/tripVoucherService.test.js tests/backend/tripVoucherAdmin.test.js`
Expected: FAIL (`checkTripVoucher` / `voucherCheck` are not exported; `kind` missing from rows).

- [ ] **Step 4: Replace the wallet service**

Replace the whole of `backend/services/wallet.service.js` with:

```js
import { coinsToUsd } from '../../shared/jetCoins.js';

export class WalletError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'WalletError';
    this.code = code;
  }
}

const KNOWN_CODES = [
  'INSUFFICIENT_COINS', 'HOLD_CONFLICT', 'BAD_COINS', 'BAD_REFERENCE',
  'VOUCHER_NOT_FOUND', 'VOUCHER_INACTIVE', 'VOUCHER_NOT_STARTED', 'VOUCHER_EXPIRED',
  'VOUCHER_USED_UP', 'VOUCHER_ALREADY_REDEEMED', 'VOUCHER_WRONG_KIND', 'VOUCHER_FIRST_TIME_ONLY',
];

export const VOUCHER_CODE_PATTERN = /^[A-Z0-9-]{3,32}$/;

export const normalizeVoucherCode = (code) => String(code ?? '').trim().toUpperCase();

// wallet_return never gives back more than a hold has left, so "everything" is
// asked for with a number larger than any hold.
const ALL_COINS = 1e15;

async function call(client, fn, args) {
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    const code = KNOWN_CODES.find((known) => String(error.message || '').includes(known));
    throw new WalletError(code || 'WALLET_UNAVAILABLE', error.message);
  }
  return data || {};
}

export async function readBalance(client, userId) {
  const { data, error } = await client.from('wallets').select('balance').eq('user_id', userId).maybeSingle();
  if (error) throw new WalletError('WALLET_UNAVAILABLE', error.message);
  return Number(data?.balance) || 0;
}

// Only a voucher entry's note (its code) is the customer's to read: staff returns store "staff <id>: <reason>" on the customer's own rows.
export async function walletSummary(client, userId) {
  const [wallet, holds, entries, rewards] = await Promise.all([
    client.from('wallets').select('balance').eq('user_id', userId).maybeSingle(),
    client.from('wallet_holds').select('coins').eq('user_id', userId).eq('status', 'held'),
    client.from('wallet_entries')
      .select('id, kind, coins, balance_after, booking_reference, note, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
    client.from('voucher_redemptions')
      .select('booking_reference, coins, due_at, vouchers(code)')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('due_at', { ascending: true }),
  ]);
  const error = wallet.error || holds.error || entries.error || rewards.error;
  if (error) throw new WalletError('WALLET_UNAVAILABLE', error.message);
  const balance = Number(wallet.data?.balance) || 0;
  const held = (holds.data || []).reduce((sum, hold) => sum + (Number(hold.coins) || 0), 0);
  const customerEntries = (entries.data || []).map((entry) => ({ ...entry, note: entry.kind === 'voucher' ? entry.note : null }));
  const pending = (rewards.data || []).map((row) => ({
    bookingReference: row.booking_reference,
    code: row.vouchers?.code || null,
    coins: Number(row.coins) || 0,
    dueAt: row.due_at || null,
  }));
  return { balance, balanceUsd: coinsToUsd(balance), held, entries: customerEntries, pending };
}

export const holdCoins = (client, { userId, bookingReference, coins }) =>
  call(client, 'wallet_hold', { p_user: userId, p_ref: bookingReference, p_coins: Math.floor(coins) });

export const captureCoins = (client, bookingReference) => call(client, 'wallet_capture', { p_ref: bookingReference });

export const releaseCoins = (client, bookingReference) => call(client, 'wallet_release', { p_ref: bookingReference });

export async function returnCoins(client, { bookingReference, coins, reason, note }) {
  const result = await call(client, 'wallet_return', {
    p_ref: bookingReference,
    p_coins: Math.floor(coins),
    p_reason: reason ?? null,
    p_note: note ?? null,
  });
  return Number(result.coins) || 0;
}

export async function returnAllCoins(client, bookingReference, reason) {
  try {
    return { ok: true, coins: await returnCoins(client, { bookingReference, coins: ALL_COINS, reason }) };
  } catch (error) {
    console.error('⚠️ Jet Coins could not be returned', { bookingReference, reason, code: error.code });
    return { ok: false, coins: 0, error };
  }
}

export const earnCoins = (client, { userId, bookingReference, coins }) =>
  call(client, 'wallet_earn', { p_user: userId, p_ref: bookingReference, p_coins: Math.floor(coins) });

export async function reverseEarnedCoins(client, bookingReference) {
  const result = await call(client, 'wallet_reverse_earn', { p_ref: bookingReference });
  return Number(result.coins) || 0;
}

export const redeemVoucher = (client, { userId, code }) =>
  call(client, 'redeem_voucher', { p_user: userId, p_code: String(code || '') });

export const checkTripVoucher = (client, { userId, code, bookingReference = null }) =>
  call(client, 'check_trip_voucher', { p_user: userId, p_code: normalizeVoucherCode(code), p_ref: bookingReference });

export const reserveTripVoucher = (client, { userId, code, bookingReference, dueAt = null }) =>
  call(client, 'reserve_trip_voucher', {
    p_user: userId, p_code: normalizeVoucherCode(code), p_ref: bookingReference, p_due_at: dueAt ?? null,
  });

export const payTripVoucher = (client, bookingReference) => call(client, 'pay_trip_voucher', { p_ref: bookingReference });

/** Never throws: a reward left pending on a cancelled booking is voided by the payout job instead. */
export async function voidTripReward(client, bookingReference) {
  if (!bookingReference) return { ok: true, status: 'none' };
  try {
    const result = await call(client, 'void_trip_voucher', { p_ref: bookingReference });
    return { ok: true, status: result.status || 'none' };
  } catch (error) {
    console.error('⚠️ A trip reward could not be voided', { bookingReference, code: error.code });
    return { ok: false, status: 'error' };
  }
}

export const tripVoucherOf = (verifiedCharge) => (verifiedCharge?.voucher?.code ? verifiedCharge.voucher : null);

export async function isVoucherCode(client, code) {
  const { data, error } = await client.from('vouchers').select('id').eq('code', normalizeVoucherCode(code)).limit(1).maybeSingle();
  if (error) throw new WalletError('WALLET_UNAVAILABLE', error.message);
  return Boolean(data);
}

export const VOUCHER_MESSAGES = {
  VOUCHER_NOT_FOUND: 'That voucher code was not found. Please check it and try again.',
  VOUCHER_INACTIVE: 'This voucher is no longer active.',
  VOUCHER_NOT_STARTED: 'This voucher cannot be used yet.',
  VOUCHER_EXPIRED: 'This voucher has expired.',
  VOUCHER_USED_UP: 'This voucher has been fully redeemed.',
  VOUCHER_ALREADY_REDEEMED: 'You have already redeemed this voucher.',
  VOUCHER_WRONG_KIND: 'Use this code at checkout when you book a flight.',
  VOUCHER_FIRST_TIME_ONLY: 'This voucher is for first-time customers only.',
};

export const CHECKOUT_VOUCHER_MESSAGES = {
  ...VOUCHER_MESSAGES,
  VOUCHER_NOT_FOUND: 'That code was not found. Please check it and try again.',
  VOUCHER_USED_UP: 'This voucher has been fully used.',
  VOUCHER_ALREADY_REDEEMED: 'You have already used this voucher.',
  VOUCHER_WRONG_KIND: 'Redeem this code in Profile → Jet Wallet.',
};
```

- [ ] **Step 5: Add the check to the wallet controller**

In `backend/controllers/wallet.controller.js`, replace:

```js
import {
  VOUCHER_MESSAGES, captureCoins, redeemVoucher, returnCoins, reverseEarnedCoins, walletSummary,
} from '../services/wallet.service.js';
import { patchBookingDetails } from '../routes/flight.routes.js';

const CODE_PATTERN = /^[A-Z0-9-]{3,32}$/;
const STATUS = { VOUCHER_NOT_FOUND: 404, VOUCHER_ALREADY_REDEEMED: 409, VOUCHER_USED_UP: 409 };
```

with:

```js
import {
  CHECKOUT_VOUCHER_MESSAGES, VOUCHER_CODE_PATTERN, VOUCHER_MESSAGES, captureCoins, checkTripVoucher, normalizeVoucherCode,
  redeemVoucher, returnCoins, reverseEarnedCoins, walletSummary,
} from '../services/wallet.service.js';
import { patchBookingDetails } from '../routes/flight.routes.js';

const STATUS = {
  VOUCHER_NOT_FOUND: 404,
  VOUCHER_ALREADY_REDEEMED: 409,
  VOUCHER_USED_UP: 409,
  VOUCHER_WRONG_KIND: 409,
  VOUCHER_FIRST_TIME_ONLY: 409,
};
```

Replace, inside `redeem`:

```js
  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) {
```

with:

```js
  const code = normalizeVoucherCode(req.body?.code);
  if (!VOUCHER_CODE_PATTERN.test(code)) {
```

Then replace the end of `redeem`:

```js
    console.error('⚠️ Voucher could not be redeemed:', error.message);
    return res.status(503).json({ success: false, code: 'WALLET_UNAVAILABLE', error: 'The voucher could not be redeemed just now. Please try again.' });
  }
}
```

with:

```js
    console.error('⚠️ Voucher could not be redeemed:', error.message);
    return res.status(503).json({ success: false, code: 'WALLET_UNAVAILABLE', error: 'The voucher could not be redeemed just now. Please try again.' });
  }
}

export async function voucherCheck(req, res) {
  const code = normalizeVoucherCode(req.body?.code);
  if (!VOUCHER_CODE_PATTERN.test(code)) {
    return res.status(404).json({ success: false, code: 'VOUCHER_NOT_FOUND', error: CHECKOUT_VOUCHER_MESSAGES.VOUCHER_NOT_FOUND });
  }
  try {
    const voucher = await checkTripVoucher(supabase, { userId: req.user.id, code });
    return res.json({ success: true, data: { kind: 'trip', code: voucher.code, coins: Number(voucher.coins) } });
  } catch (error) {
    if (CHECKOUT_VOUCHER_MESSAGES[error.code]) {
      return res.status(STATUS[error.code] || 400).json({ success: false, code: error.code, error: CHECKOUT_VOUCHER_MESSAGES[error.code] });
    }
    console.error('⚠️ Voucher could not be checked:', error.message);
    return res.status(503).json({ success: false, code: 'WALLET_UNAVAILABLE', error: 'The voucher could not be checked just now. Please try again.' });
  }
}
```

- [ ] **Step 6: Route it**

Replace the whole of `backend/routes/wallet.routes.js` with:

```js
import express from 'express';
import { bookingStaff, protect } from '../middleware/auth.middleware.js';
import { voucherRedeemLimiter } from '../middleware/security.js';
import { getWallet, redeem, staffReturn, voucherCheck } from '../controllers/wallet.controller.js';

const router = express.Router();

router.get('/', protect, getWallet);
router.post('/redeem', protect, voucherRedeemLimiter, redeem);
router.post('/voucher-check', protect, voucherRedeemLimiter, voucherCheck);
router.post('/staff-return', protect, bookingStaff, staffReturn);

export default router;
```

- [ ] **Step 7: Add `isCouponCode`**

Append to `backend/services/coupon.service.js`:

```js
/** Whether a coupon, live or switched off, already uses this code. */
export async function isCouponCode(client, code) {
  const { data, error } = await client
    .from('coupons')
    .select('id')
    .eq('code', String(code ?? '').trim().toUpperCase())
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
```

- [ ] **Step 8: Replace the admin vouchers controller**

Replace the whole of `backend/controllers/vouchers.controller.js` with:

```js
import supabase from '../config/supabase.js';
import { isCouponCode } from '../services/coupon.service.js';

const CODE_PATTERN = /^[A-Z0-9-]{3,32}$/;
const MAX_VALUE_USD = 10000;
const KINDS = ['instant', 'trip'];

const dateOrNull = (value, endOfDay = false) => {
  if (!value) return null;
  const text = String(value);
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z` : text;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
};

/** The admin form, as a vouchers row, or why not. */
export function voucherInput(body = {}) {
  const code = String(body.code || '').trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) return { ok: false, error: 'Use 3 to 32 letters, digits or hyphens for the code.' };
  const value = Number(body.valueUsd);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_VALUE_USD) return { ok: false, error: `The value must be between $0.01 and $${MAX_VALUE_USD}.` };
  const limit = body.maxRedemptions === '' || body.maxRedemptions == null ? null : Math.floor(Number(body.maxRedemptions));
  if (limit !== null && !(limit > 0)) return { ok: false, error: 'The limit must be a whole number above 0, or empty for no limit.' };
  const validFrom = dateOrNull(body.validFrom);
  const validUntil = dateOrNull(body.validUntil, true);
  if (validFrom === undefined || validUntil === undefined) return { ok: false, error: 'A date could not be read.' };
  if (validFrom && validUntil && validFrom > validUntil) return { ok: false, error: 'The end date is before the start date.' };
  const kind = body.kind === undefined || body.kind === null || body.kind === '' ? 'instant' : String(body.kind);
  if (!KINDS.includes(kind)) return { ok: false, error: 'The kind must be Instant or Trip reward.' };
  return {
    ok: true,
    row: {
      code,
      coins: Math.round(value * 100),
      max_redemptions: limit,
      valid_from: validFrom,
      valid_until: validUntil,
      note: body.note ? String(body.note).slice(0, 200) : null,
      kind,
      first_time_only: kind === 'trip' && body.firstTimeOnly === true,
    },
  };
}

/** True when it has answered: a coupon uses the code, or that could not be checked. */
async function answeredCodeClash(res, code) {
  try {
    if (!(await isCouponCode(supabase, code))) return false;
    res.status(409).json({ success: false, code: 'CODE_TAKEN', error: 'A coupon already uses this code. Pick another code.' });
  } catch {
    res.status(503).json({ success: false, error: 'The voucher could not be saved.' });
  }
  return true;
}

export async function listVouchers(req, res) {
  const { data, error } = await supabase.from('vouchers').select('*').order('created_at', { ascending: false });
  if (error) return res.status(503).json({ success: false, error: 'Vouchers could not be loaded.' });
  return res.json({ success: true, data: data || [] });
}

export async function createVoucher(req, res) {
  const input = voucherInput(req.body);
  if (!input.ok) return res.status(400).json({ success: false, error: input.error });
  if (await answeredCodeClash(res, input.row.code)) return res;
  const { data, error } = await supabase.from('vouchers')
    .insert({ ...input.row, created_by: req.user?.id || null })
    .select()
    .single();
  if (error?.code === '23505') return res.status(409).json({ success: false, code: 'CODE_TAKEN', error: 'A voucher with this code already exists.' });
  if (error) return res.status(503).json({ success: false, error: 'The voucher could not be saved.' });
  return res.status(201).json({ success: true, data });
}

export async function updateVoucher(req, res) {
  const { data: current, error: readError } = await supabase.from('vouchers').select('*').eq('id', req.params.id).single();
  if (readError || !current) return res.status(404).json({ success: false, error: 'Voucher not found.' });
  const body = req.body || {};
  const changesValue = body.valueUsd !== undefined && Math.round(Number(body.valueUsd) * 100) !== Number(current.coins);
  const changesCode = body.code !== undefined && String(body.code).trim().toUpperCase() !== current.code;
  const changesKind = body.kind !== undefined && String(body.kind) !== (current.kind || 'instant');
  if ((changesValue || changesCode || changesKind) && Number(current.redemptions_count) > 0) {
    return res.status(409).json({ success: false, code: 'VOUCHER_LOCKED', error: 'Customers have used this voucher, so its code, value and kind cannot change.' });
  }
  const input = voucherInput({
    code: body.code ?? current.code,
    valueUsd: body.valueUsd ?? Number(current.coins) / 100,
    maxRedemptions: body.maxRedemptions !== undefined ? body.maxRedemptions : current.max_redemptions,
    validFrom: body.validFrom !== undefined ? body.validFrom : current.valid_from,
    validUntil: body.validUntil !== undefined ? body.validUntil : current.valid_until,
    note: body.note !== undefined ? body.note : current.note,
    kind: body.kind !== undefined ? body.kind : current.kind,
    firstTimeOnly: body.firstTimeOnly !== undefined ? body.firstTimeOnly === true : current.first_time_only === true,
  });
  if (!input.ok) return res.status(400).json({ success: false, error: input.error });
  if (changesCode && await answeredCodeClash(res, input.row.code)) return res;
  const update = { ...input.row, updated_at: new Date().toISOString() };
  if (typeof body.isActive === 'boolean') update.is_active = body.isActive;
  const { data, error } = await supabase.from('vouchers').update(update).eq('id', current.id).select().single();
  if (error?.code === '23505') return res.status(409).json({ success: false, code: 'CODE_TAKEN', error: 'A voucher with this code already exists.' });
  if (error) return res.status(503).json({ success: false, error: 'The voucher could not be saved.' });
  return res.json({ success: true, data });
}

export async function listRedemptions(req, res) {
  const { data, error } = await supabase.from('voucher_redemptions')
    .select('id, coins, created_at, user_id, status, booking_reference, due_at, paid_at, users(email)')
    .eq('voucher_id', req.params.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(503).json({ success: false, error: 'Redemptions could not be loaded.' });
  return res.json({
    success: true,
    data: (data || []).map((row) => ({
      id: row.id,
      coins: row.coins,
      createdAt: row.created_at,
      userId: row.user_id,
      email: row.users?.email || null,
      status: row.status || 'credited',
      bookingReference: row.booking_reference || null,
      dueAt: row.due_at || null,
      paidAt: row.paid_at || null,
    })),
  });
}
```

- [ ] **Step 9: Refuse coupon codes that vouchers use**

In `backend/routes/coupon.routes.js`, replace:

```js
import { evaluateCoupon } from '../services/coupon.service.js';
```

with:

```js
import { evaluateCoupon } from '../services/coupon.service.js';
import { isVoucherCode } from '../services/wallet.service.js';
```

Replace (in `POST /`):

```js
        if (!code || !discountType || !discountValue) {
            return res.status(400).json({ success: false, message: 'code, discountType, discountValue are required.' });
        }
```

with:

```js
        if (!code || !discountType || !discountValue) {
            return res.status(400).json({ success: false, message: 'code, discountType, discountValue are required.' });
        }
        if (await isVoucherCode(supabase, code)) {
            return res.status(409).json({ success: false, message: 'A voucher already uses this code. Pick another code.' });
        }
```

Replace (in `PUT /:id`):

```js
        if (typeof b.is_active === 'boolean') updates.is_active = b.is_active;
```

with:

```js
        if (typeof b.is_active === 'boolean') updates.is_active = b.is_active;
        if (updates.code && await isVoucherCode(supabase, updates.code)) {
            return res.status(409).json({ success: false, message: 'A voucher already uses this code. Pick another code.' });
        }
```

- [ ] **Step 10: Keep the two existing test files true to the new shapes**

In `tests/backend/walletService.test.js`, replace:

```js
const tableClient = (tables) => ({
  from: vi.fn((table) => {
    const chain = {};
    for (const op of ['select', 'eq', 'order', 'limit']) chain[op] = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => tables[table]);
    chain.then = (resolve) => resolve(tables[table]);
    return chain;
  }),
});
```

with:

```js
const tableClient = (tables) => ({
  from: vi.fn((table) => {
    const answer = tables[table] ?? { data: [], error: null };
    const chain = {};
    for (const op of ['select', 'eq', 'order', 'limit']) chain[op] = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => answer);
    chain.then = (resolve) => resolve(answer);
    return chain;
  }),
});
```

In `tests/backend/vouchersController.test.js`, replace:

```js
      row: { code: 'SHUBHAM', coins: 5000, max_redemptions: null, valid_from: null, valid_until: '2026-12-31T23:59:59.999Z', note: null },
```

with:

```js
      row: {
        code: 'SHUBHAM', coins: 5000, max_redemptions: null, valid_from: null, valid_until: '2026-12-31T23:59:59.999Z', note: null,
        kind: 'instant', first_time_only: false,
      },
```

- [ ] **Step 11: Run the new tests and the wallet suites**

Run: `AMADEUS_WS_ENDPOINT= AMADEUS_WS_USERNAME= AMADEUS_WS_PASSWORD= AMADEUS_WS_OFFICE_ID= VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vitest run --project backend tests/backend/tripVoucherService.test.js tests/backend/tripVoucherAdmin.test.js tests/backend/walletService.test.js tests/backend/vouchersController.test.js tests/backend/walletRoutes.test.js tests/backend/adminAuthGating.test.js tests/backend/couponCap.test.js tests/backend/couponInFlight.test.js`
Expected: PASS.

- [ ] **Step 12: Run CI's unit command**

Run: `AMADEUS_WS_ENDPOINT= AMADEUS_WS_USERNAME= AMADEUS_WS_PASSWORD= AMADEUS_WS_OFFICE_ID= VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run test:unit`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add backend/services/wallet.service.js backend/controllers/wallet.controller.js backend/routes/wallet.routes.js backend/controllers/vouchers.controller.js backend/services/coupon.service.js backend/routes/coupon.routes.js tests/backend/tripVoucherService.test.js tests/backend/tripVoucherAdmin.test.js tests/backend/walletService.test.js tests/backend/vouchersController.test.js
git commit -F - <<'EOF'
feat(wallet): trip-voucher service, voucher check and admin kinds

wallet.service wraps check/reserve/pay/void for trip vouchers, and the
wallet summary lists rewards still to come. POST /api/wallet/voucher-check
answers a trip voucher or a worded refusal (an instant voucher is pointed
to the wallet). Admin vouchers gain a kind and a first-time-only switch;
the kind locks after the first use, and one code can no longer be both a
coupon and a voucher.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CnRin1ZGh44yizpdTBakw6
EOF
```

---

### Task 3: Checkout checks the voucher and keys the payment page on it

**Files:**
- Modify: `backend/services/flightCheckout.service.js`
- Modify: `backend/utils/tripMatch.js`
- Modify: `backend/routes/payment/checkout.handlers.js`
- Test: `tests/backend/tripVoucherCheckout.test.js` (create), `tests/backend/walletHostedCheckout.test.js` (append)

**Interfaces:**
- Consumes (Task 2): `checkTripVoucher`, `CHECKOUT_VOUCHER_MESSAGES`, `VOUCHER_CODE_PATTERN`, `normalizeVoucherCode`.
- Produces:
  - `verifyFlightCharge({ ..., voucherCode })` → on success `{ ok: true, charge, coupon, wallet, voucher: { id, code, coins } | null, pricedFare }`. Refusals, all before the fare is priced: `401 LOGIN_REQUIRED` (`Please log in to use a voucher. Nothing has been charged.`), `409 <VOUCHER_* code>` with `CHECKOUT_VOUCHER_MESSAGES[code]`, `503 VOUCHER_UNAVAILABLE`. `charge` is unchanged by a voucher.
  - Hosted checkout body field `voucherCode`; `verified_charge.voucher = { id, code, coins }` on the booking row (`null` when none).
  - `checkoutKey({ ..., voucherCode })`: unchanged when no voucher; `voucher:<CODE>` appended when one is used.

- [ ] **Step 1: Write the failing checkout test**

Create `tests/backend/tripVoucherCheckout.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyFlightCharge } from '../../backend/services/flightCheckout.service.js';
import { checkoutKey } from '../../backend/utils/tripMatch.js';
import { CHECKOUT_VOUCHER_MESSAGES } from '../../backend/services/wallet.service.js';

const offer = {
  id: '1',
  itineraries: [{ segments: [{ carrierCode: 'DL', number: '713', departure: { iataCode: 'JFK', at: '2026-11-03T08:00:00' }, arrival: { iataCode: 'LAX', at: '2026-11-03T11:05:00' } }] }],
  price: { total: '120.00', currency: 'USD' },
  travelerPricings: [{ travelerId: '1', travelerType: 'ADULT' }],
};
const traveller = { firstName: 'Asha', lastName: 'Rao', gender: 'female', dateOfBirth: '1990-01-01', type: 'ADULT' };
const bookingData = { originalOffer: offer, passengerData: [traveller] };
const VOUCHER = { id: 'v1', code: 'SHUBHAM', coins: 5000, kind: 'trip' };

let rpc;
const clientFor = () => ({
  rpc,
  from: vi.fn((table) => {
    const chain = {};
    for (const op of ['select', 'eq', 'order', 'limit']) chain[op] = vi.fn(() => chain);
    chain.single = vi.fn(async () => ({
      data: table === 'price_settings' ? { settings: { flight_taxes_fees: 1, flight_taxes_fees_percentage: 1 } } : null,
      error: null,
    }));
    chain.maybeSingle = vi.fn(async () => ({ data: table === 'wallets' ? { balance: 5000 } : null, error: null }));
    return chain;
  }),
});
const priceOffer = vi.fn(async () => ({
  price: { total: '120.00', grandTotal: '120.00', currency: 'USD', base: '100.00' },
  _ama: { bookingEnabled: true, international: false },
}));
const verify = (over = {}) => verifyFlightCharge({ client: clientFor(), amount: 122.2, bookingData, userId: 'u1', priceOffer, ...over });

beforeEach(() => {
  rpc = vi.fn(async () => ({ data: VOUCHER, error: null }));
  priceOffer.mockClear();
});

describe('a trip-reward voucher at checkout', () => {
  it('checks the voucher for the signed-in customer and leaves the price alone', async () => {
    const verdict = await verify({ voucherCode: ' shubham ' });

    expect(verdict.ok).toBe(true);
    expect(verdict.voucher).toEqual({ id: 'v1', code: 'SHUBHAM', coins: 5000 });
    expect(verdict.charge.total).toBe(122.2);
    expect(rpc).toHaveBeenCalledWith('check_trip_voucher', { p_user: 'u1', p_code: 'SHUBHAM', p_ref: null });
  });

  it('carries no voucher when none was typed', async () => {
    const verdict = await verify();
    expect(verdict.voucher).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('asks a guest to log in, before the fare is priced', async () => {
    const verdict = await verify({ voucherCode: 'SHUBHAM', userId: null });
    expect(verdict).toMatchObject({ ok: false, status: 401, code: 'LOGIN_REQUIRED', message: 'Please log in to use a voucher. Nothing has been charged.' });
    expect(priceOffer).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('answers each refusal with its code and the customer message, before the fare is priced', async () => {
    for (const code of ['VOUCHER_NOT_FOUND', 'VOUCHER_INACTIVE', 'VOUCHER_NOT_STARTED', 'VOUCHER_EXPIRED', 'VOUCHER_USED_UP', 'VOUCHER_ALREADY_REDEEMED', 'VOUCHER_FIRST_TIME_ONLY', 'VOUCHER_WRONG_KIND']) {
      rpc = vi.fn(async () => ({ data: null, error: { message: code } }));
      const verdict = await verify({ voucherCode: 'SHUBHAM' });
      expect(verdict).toMatchObject({ ok: false, status: 409, code, message: CHECKOUT_VOUCHER_MESSAGES[code] });
    }
    expect(priceOffer).not.toHaveBeenCalled();
  });

  it('points an instant voucher to the wallet', async () => {
    rpc = vi.fn(async () => ({ data: null, error: { message: 'VOUCHER_WRONG_KIND' } }));
    expect((await verify({ voucherCode: 'WELCOME50' })).message).toBe('Redeem this code in Profile → Jet Wallet.');
  });

  it('refuses a malformed code without asking the database', async () => {
    const verdict = await verify({ voucherCode: 'a b' });
    expect(verdict).toMatchObject({ ok: false, status: 409, code: 'VOUCHER_NOT_FOUND' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('says the voucher could not be checked when the database cannot answer', async () => {
    const silence = vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpc = vi.fn(async () => ({ data: null, error: { message: 'connection reset' } }));
    const verdict = await verify({ voucherCode: 'SHUBHAM' });
    expect(verdict).toMatchObject({ ok: false, status: 503, code: 'VOUCHER_UNAVAILABLE' });
    expect(verdict.message).toMatch(/Nothing has been charged/);
    silence.mockRestore();
  });

  it('works beside Jet Coins', async () => {
    const verdict = await verify({ amount: 72.2, walletCoins: 5000, voucherCode: 'SHUBHAM' });
    expect(verdict.ok).toBe(true);
    expect(verdict.wallet).toEqual({ coins: 5000, amount: 50 });
    expect(verdict.voucher.code).toBe('SHUBHAM');
    expect(verdict.charge.total).toBe(72.2);
  });
});

describe('the payment page key and the voucher', () => {
  const base = {
    bookingData: { ...bookingData, bookingDetails: { contact: { email: 'asha@example.com', phone: '5550100' } } },
    customerEmail: 'asha@example.com',
    total: 122.2,
  };

  it('keeps the key it had for a checkout without a voucher', () => {
    expect(checkoutKey({ ...base, voucherCode: '' })).toBe(checkoutKey(base));
    expect(checkoutKey({ ...base, voucherCode: null })).toBe(checkoutKey(base));
  });

  it('makes a page with a voucher a different page', () => {
    expect(checkoutKey({ ...base, voucherCode: 'SHUBHAM' })).not.toBe(checkoutKey(base));
    expect(checkoutKey({ ...base, voucherCode: 'SHUBHAM' })).not.toBe(checkoutKey({ ...base, voucherCode: 'OTHER1' }));
  });

  it('treats the same voucher typed in any case as the same page', () => {
    expect(checkoutKey({ ...base, voucherCode: ' shubham ' })).toBe(checkoutKey({ ...base, voucherCode: 'SHUBHAM' }));
  });

  it('tells a voucher with coins from coins alone', () => {
    expect(checkoutKey({ ...base, walletCoins: 500, voucherCode: 'SHUBHAM' })).not.toBe(checkoutKey({ ...base, walletCoins: 500 }));
  });
});
```

- [ ] **Step 2: Append the failing hosted-checkout tests**

Append to `tests/backend/walletHostedCheckout.test.js`:

```js
describe('a trip-reward voucher on the hosted checkout', () => {
  const voucher = { id: 'v1', code: 'SHUBHAM', coins: 5000 };

  it('checks the voucher and keeps it on the booking row, without touching the price', async () => {
    arcOpens();
    const { post, table, verifyFlightCharge } = await harness();
    verifyFlightCharge.mockImplementation(async () => ({ ...verdictFor(0), voucher }));

    const res = await post({ walletCoins: 0, voucherCode: 'shubham' });

    expect(res.statusCode).toBe(200);
    expect(verifyFlightCharge).toHaveBeenCalledWith(expect.objectContaining({ voucherCode: 'shubham', userId: CUSTOMER.id }));
    expect(arcPages()[0][1].order.amount).toBe('122.20');
    expect(table.row('FLTCOINS1').booking_details.verified_charge.voucher).toEqual(voucher);
  });

  it('answers a refused voucher with its code before any payment page opens', async () => {
    const { post, verifyFlightCharge } = await harness();
    verifyFlightCharge.mockResolvedValue({ ok: false, status: 409, code: 'VOUCHER_FIRST_TIME_ONLY', message: 'This voucher is for first-time customers only.' });

    const res = await post({ walletCoins: 0, voucherCode: 'SHUBHAM' });

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'VOUCHER_FIRST_TIME_ONLY', error: 'This voucher is for first-time customers only.' });
    expect(openedAPage()).toBe(false);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `AMADEUS_WS_ENDPOINT= AMADEUS_WS_USERNAME= AMADEUS_WS_PASSWORD= AMADEUS_WS_OFFICE_ID= VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vitest run --project backend tests/backend/tripVoucherCheckout.test.js tests/backend/walletHostedCheckout.test.js`
Expected: FAIL (`verdict.voucher` undefined; keys equal with and without a voucher; `voucherCode` not passed to `verifyFlightCharge`).

- [ ] **Step 4: Check the voucher in `verifyFlightCharge`**

In `backend/services/flightCheckout.service.js`, replace:

```js
import { readBalance } from './wallet.service.js';
```

with:

```js
import {
  CHECKOUT_VOUCHER_MESSAGES, VOUCHER_CODE_PATTERN, checkTripVoucher, normalizeVoucherCode, readBalance,
} from './wallet.service.js';
```

Replace:

```js
 *   {ok: true, charge, coupon, wallet: {coins, amount} | null, pricedFare} |
```

with:

```js
 *   {ok: true, charge, coupon, wallet: {coins, amount} | null, voucher: {id, code, coins} | null, pricedFare} |
```

Replace:

```js
  walletCoins = 0,
  settlementCurrency = 'USD',
```

with:

```js
  walletCoins = 0,
  voucherCode,
  settlementCurrency = 'USD',
```

Replace:

```js
  // The fee settings, read before the fare is priced. Pricing is where the
```

with:

```js
  let voucher = null;
  const askedVoucher = normalizeVoucherCode(voucherCode);
  if (askedVoucher) {
    if (!userId) {
      return refuse(401, 'LOGIN_REQUIRED', 'Please log in to use a voucher. Nothing has been charged.');
    }
    if (!VOUCHER_CODE_PATTERN.test(askedVoucher)) {
      return refuse(409, 'VOUCHER_NOT_FOUND', CHECKOUT_VOUCHER_MESSAGES.VOUCHER_NOT_FOUND);
    }
    try {
      const found = await checkTripVoucher(client, { userId, code: askedVoucher });
      voucher = { id: found.id, code: found.code, coins: Math.floor(Number(found.coins) || 0) };
    } catch (error) {
      if (CHECKOUT_VOUCHER_MESSAGES[error.code]) return refuse(409, error.code, CHECKOUT_VOUCHER_MESSAGES[error.code]);
      console.warn('Checkout could not check the voucher:', error?.message || error);
      return refuse(503, 'VOUCHER_UNAVAILABLE', 'We could not check your voucher just now. Please try again in a moment. Nothing has been charged.');
    }
  }

  // The fee settings, read before the fare is priced. Pricing is where the
```

Replace:

```js
  return { ok: true, charge, coupon, wallet, pricedFare };
```

with:

```js
  return { ok: true, charge, coupon, wallet, voucher, pricedFare };
```

- [ ] **Step 5: Key the payment page on the voucher**

In `backend/utils/tripMatch.js`, replace:

```js
/**
 * What a flight checkout would book and charge, as one string: the flights,
 * every traveller detail, the contact details, the coupon, the verified
 * total in cents and, when any are used, the Jet Coins. Null when any of the
 * parts that identify a trip is missing.
 *
 * @param {{ bookingData?: object, customerEmail?: string, total?: number, couponCode?: string, walletCoins?: number }} checkout
 */
export function checkoutKey({ bookingData, customerEmail, total, couponCode, walletCoins = 0 } = {}) {
```

with:

```js
/**
 * What a flight checkout would book and charge, as one string: the flights,
 * every traveller detail, the contact details, the coupon, the verified
 * total in cents and, when used, the Jet Coins and the trip-reward voucher.
 * Null when any of the parts that identify a trip is missing.
 *
 * @param {{ bookingData?: object, customerEmail?: string, total?: number, couponCode?: string, walletCoins?: number, voucherCode?: string }} checkout
 */
export function checkoutKey({ bookingData, customerEmail, total, couponCode, walletCoins = 0, voucherCode } = {}) {
```

and replace:

```js
    ...(Math.floor(Number(walletCoins) || 0) > 0 ? [Math.floor(Number(walletCoins))] : []),
  ]);
}
```

with:

```js
    ...(Math.floor(Number(walletCoins) || 0) > 0 ? [Math.floor(Number(walletCoins))] : []),
    ...(upper(voucherCode) ? [`voucher:${upper(voucherCode)}`] : []),
  ]);
}
```

- [ ] **Step 6: Pass the voucher through the hosted checkout**

In `backend/routes/payment/checkout.handlers.js`, make five replacements.

(1) In `findReusableCheckout`, replace:

```js
                couponCode: details.verified_charge?.coupon?.code,
                walletCoins: details.verified_charge?.wallet?.coins,
            });
```

with:

```js
                couponCode: details.verified_charge?.coupon?.code,
                walletCoins: details.verified_charge?.wallet?.coins,
                voucherCode: details.verified_charge?.voucher?.code,
            });
```

(2) Replace:

```js
                key: checkoutKey({ bookingData, customerEmail, total: amount, couponCode: req.body.couponCode, walletCoins: req.body.walletCoins }),
```

with:

```js
                key: checkoutKey({ bookingData, customerEmail, total: amount, couponCode: req.body.couponCode, walletCoins: req.body.walletCoins, voucherCode: req.body.voucherCode }),
```

(3) Replace:

```js
                couponCode: req.body.couponCode,
                walletCoins: req.body.walletCoins,
                userId: signedInUserId,
```

with:

```js
                couponCode: req.body.couponCode,
                walletCoins: req.body.walletCoins,
                voucherCode: req.body.voucherCode,
                userId: signedInUserId,
```

(4) Replace:

```js
                wallet: verdict.wallet,
                pricedFare: verdict.pricedFare,
```

with:

```js
                wallet: verdict.wallet,
                voucher: verdict.voucher,
                pricedFare: verdict.pricedFare,
```

(5) Replace:

```js
                key: checkoutKey({ bookingData, customerEmail, total: chargeAmount, couponCode: verifiedCharge?.coupon?.code, walletCoins: verifiedCharge?.wallet?.coins }),
```

with:

```js
                key: checkoutKey({ bookingData, customerEmail, total: chargeAmount, couponCode: verifiedCharge?.coupon?.code, walletCoins: verifiedCharge?.wallet?.coins, voucherCode: verifiedCharge?.voucher?.code }),
```

- [ ] **Step 7: Run the checkout suites**

Run: `AMADEUS_WS_ENDPOINT= AMADEUS_WS_USERNAME= AMADEUS_WS_PASSWORD= AMADEUS_WS_OFFICE_ID= VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vitest run --project backend tests/backend/tripVoucherCheckout.test.js tests/backend/walletHostedCheckout.test.js tests/backend/walletCheckout.test.js tests/backend/flightCheckout.test.js tests/backend/checkoutReuse.test.js tests/backend/checkoutTripLock.test.js tests/backend/tripMatch.test.js`
Expected: PASS.

- [ ] **Step 8: Run CI's unit command**

Run: `AMADEUS_WS_ENDPOINT= AMADEUS_WS_USERNAME= AMADEUS_WS_PASSWORD= AMADEUS_WS_OFFICE_ID= VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run test:unit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/services/flightCheckout.service.js backend/utils/tripMatch.js backend/routes/payment/checkout.handlers.js tests/backend/tripVoucherCheckout.test.js tests/backend/walletHostedCheckout.test.js
git commit -F - <<'EOF'
feat(checkout): check a trip-reward voucher before the payment page

verifyFlightCharge takes voucherCode: a signed-in customer is required,
the voucher is checked before the fare is priced, and a refusal is a 409
with the voucher's code and words. The voucher rides on
verified_charge.voucher and never changes the price. The reusable payment
page is keyed on it, so a page made with a voucher is not handed to a
checkout without one.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CnRin1ZGh44yizpdTBakw6
EOF
```

---

### Task 4: Reserve on booking; void on cancel, void and reversal

**Files:**
- Modify: `shared/bookingItineraries.js` (append; no imports)
- Modify: `backend/routes/flight.routes.js`
- Modify: `backend/routes/payment/operations.handlers.js`
- Test: `tests/utils/tripRewardDueAt.test.js` (create), `tests/backend/tripRewardOrderRoute.test.js` (create), `tests/backend/walletOrderRouteFlow.test.js` (append), `tests/backend/walletCancelFlow.test.js` (append), `tests/backend/walletVoid.test.js` (append)

**Interfaces:**
- Consumes (Task 2): `reserveTripVoucher`, `voidTripReward`, `tripVoucherOf`. (Task 3): `verified_charge.voucher = { id, code, coins }`.
- Produces:
  - `tripRewardDueAt(legs) → string | null` in `shared/bookingItineraries.js` (ISO, 00:00 UTC two days after the last segment's arrival date).
  - `reserveTripRewardAfterBooking({ bookingReference, userId, verifiedCharge, offer }, { report }) → Promise<{ code, coins, dueAt } | null>` (exported from `flight.routes.js`); never throws; on refusal writes `wallet_issue: { kind: 'voucher_refused', code, reason, at }` unless an open money issue is already there.
  - The order route's success answer gains `tripReward: { code, coins, dueAt }` when a reward was reserved.
  - `tripRewardOfRow(booking) → { code, coins } | null` (exported); `toClientBooking(booking).tripReward` uses it.
  - `refundOnFulfillmentFailure`, `refundDuplicatePayment`, `cancelFlightBooking`, `handlePaymentVoid` call `voidTripReward` when the booking's `verified_charge` carries a voucher.

- [ ] **Step 1: Write the failing due-date test**

Create `tests/utils/tripRewardDueAt.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { itinerariesFromOffer, tripRewardDueAt } from '../../shared/bookingItineraries.js';

const leg = (...arrivals) => ({ segments: arrivals.map((arrivalDate) => ({ arrivalDate })) });

describe('when a trip reward pays out', () => {
  it('is 00:00 UTC two days after the last flight lands', () => {
    expect(tripRewardDueAt([leg('2026-11-16')])).toBe('2026-11-18T00:00:00.000Z');
  });

  it('reads the last flight of the last leg on a round trip', () => {
    expect(tripRewardDueAt([leg('2026-11-15', '2026-11-16'), leg('2026-11-24', '2026-11-25')])).toBe('2026-11-27T00:00:00.000Z');
  });

  it('rolls over the end of a month and of a year', () => {
    expect(tripRewardDueAt([leg('2026-11-30')])).toBe('2026-12-02T00:00:00.000Z');
    expect(tripRewardDueAt([leg('2026-12-31')])).toBe('2027-01-02T00:00:00.000Z');
  });

  it('reads an offer as the order route does', () => {
    const offer = { itineraries: [{ segments: [{ departure: { iataCode: 'JFK', at: '2026-11-15T19:25:00' }, arrival: { iataCode: 'LHR', at: '2026-11-16T06:10:00' }, carrierCode: 'FI', number: '614' }] }] };
    expect(tripRewardDueAt(itinerariesFromOffer(offer))).toBe('2026-11-18T00:00:00.000Z');
  });

  it('gives no date for an itinerary it cannot read', () => {
    expect(tripRewardDueAt([])).toBeNull();
    expect(tripRewardDueAt(null)).toBeNull();
    expect(tripRewardDueAt([{ segments: [] }])).toBeNull();
    expect(tripRewardDueAt([leg('')])).toBeNull();
    expect(tripRewardDueAt([leg('2026-02-30')])).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing reservation test**

Create `tests/backend/tripRewardOrderRoute.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseMock } from './setup.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { reserveTripRewardAfterBooking, toClientBooking } from '../../backend/routes/flight.routes.js';

const REF = 'FLTTRIP1';
const offer = {
  itineraries: [{ segments: [{ departure: { iataCode: 'JFK', at: '2026-11-15T19:25:00' }, arrival: { iataCode: 'LHR', at: '2026-11-16T06:10:00' }, carrierCode: 'FI', number: '614' }] }],
};
const voucher = { id: 'v1', code: 'SHUBHAM', coins: 5000 };
const row = (details = {}, over = {}) => ({
  id: 'b1', booking_reference: REF, travel_type: 'flight', status: 'pending', payment_status: 'paid', user_id: 'user-1',
  booking_details: { order_id: REF, ...details },
  ...over,
});

let table;
const issueOnRow = () => table.row(REF).booking_details.wallet_issue;
const reserve = (over = {}, report = vi.fn()) => reserveTripRewardAfterBooking({
  bookingReference: REF, userId: 'user-1', verifiedCharge: { total: 291, voucher }, offer, ...over,
}, { report });

beforeEach(() => {
  supabaseMock.rpc = vi.fn();
  table = fakeBookingsTable([row()]);
  supabaseMock.from.mockImplementation(table.from);
});

describe('reserving a trip reward once the booking exists', () => {
  it('reserves the voucher under the booking, due two days after the last arrival', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { status: 'pending', code: 'SHUBHAM', coins: 5000, due_at: '2026-11-18T00:00:00+00:00', created: true }, error: null });

    const reward = await reserve();

    expect(supabaseMock.rpc).toHaveBeenCalledWith('reserve_trip_voucher', { p_user: 'user-1', p_code: 'SHUBHAM', p_ref: REF, p_due_at: '2026-11-18T00:00:00.000Z' });
    expect(reward).toEqual({ code: 'SHUBHAM', coins: 5000, dueAt: '2026-11-18T00:00:00.000Z' });
    expect(issueOnRow()).toBeUndefined();
  });

  it('marks a refused voucher on the booking and never throws', async () => {
    const silence = vi.spyOn(console, 'warn').mockImplementation(() => {});
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'VOUCHER_USED_UP' } });

    const reward = await reserve();

    expect(reward).toBeNull();
    expect(issueOnRow()).toMatchObject({ kind: 'voucher_refused', code: 'SHUBHAM', reason: 'VOUCHER_USED_UP' });
    expect(Number.isNaN(Date.parse(issueOnRow().at))).toBe(false);
    silence.mockRestore();
  });

  it('leaves an open Jet Coins problem on the booking in place', async () => {
    const silence = vi.spyOn(console, 'warn').mockImplementation(() => {});
    table = fakeBookingsTable([row({ wallet_issue: { kind: 'capture_failed', coins: 500, status: 'released', at: '2026-10-13T10:00:00.000Z' } })]);
    supabaseMock.from.mockImplementation(table.from);
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'VOUCHER_USED_UP' } });

    await reserve();

    expect(issueOnRow()).toMatchObject({ kind: 'capture_failed', coins: 500 });
    silence.mockRestore();
  });

  it('reserves nothing for a booking without a voucher', async () => {
    expect(await reserve({ verifiedCharge: { total: 291 } })).toBeNull();
    expect(await reserve({ verifiedCharge: null })).toBeNull();
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it('marks a voucher on a booking with no owner as refused, without asking the database', async () => {
    const silence = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await reserve({ userId: null })).toBeNull();
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
    expect(issueOnRow()).toMatchObject({ kind: 'voucher_refused', code: 'SHUBHAM', reason: 'LOGIN_REQUIRED' });
    silence.mockRestore();
  });

  it('reserves with no payout date when the itinerary cannot be read, and reports it', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { status: 'pending', code: 'SHUBHAM', coins: 5000, due_at: null, created: true }, error: null });
    const report = vi.fn();

    const reward = await reserve({ offer: { itineraries: [] } }, report);

    expect(supabaseMock.rpc.mock.calls[0][1].p_due_at).toBeNull();
    expect(reward).toEqual({ code: 'SHUBHAM', coins: 5000, dueAt: null });
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/no payout date/) }), expect.objectContaining({ bookingReference: REF }));
  });

  it('gives nothing back for a booking whose reward was already voided', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { status: 'void', code: 'SHUBHAM', coins: 5000, created: false }, error: null });
    expect(await reserve()).toBeNull();
  });
});

describe('the trip reward on a booking the customer reads', () => {
  const confirmed = (details = {}, over = {}) => row({ verified_charge: { total: 291, voucher }, ...details }, { status: 'confirmed', ...over });

  it('names the voucher and its coins', () => {
    expect(toClientBooking(confirmed()).tripReward).toEqual({ code: 'SHUBHAM', coins: 5000 });
  });

  it('has none for a cancelled booking, a refused voucher, or no voucher', () => {
    expect(toClientBooking(confirmed({}, { status: 'cancelled' })).tripReward).toBeNull();
    expect(toClientBooking(confirmed({ wallet_issue: { kind: 'voucher_refused', code: 'SHUBHAM' } })).tripReward).toBeNull();
    expect(toClientBooking(row({ verified_charge: { total: 291 } }, { status: 'confirmed' })).tripReward).toBeNull();
  });
});
```

- [ ] **Step 3: Append the failing route-flow tests**

Append to `tests/backend/walletOrderRouteFlow.test.js`:

```js
describe('a booking with a trip-reward voucher', () => {
  const voucher = { id: 'v1', code: 'SHUBHAM', coins: 5000 };
  const withVoucher = (ref) => checkout(ref, { coins: false, booking_details: { verified_charge: { ...withoutCoins, voucher } } });
  const reserved = { status: 'pending', code: 'SHUBHAM', coins: 5000, due_at: '2026-11-18T00:00:00+00:00', created: true };

  it('reserves the reward once the airline has booked it, due two days after the last arrival', async () => {
    supabaseMock.rpc.mockImplementation(async (fn) => ({ data: fn === 'reserve_trip_voucher' ? reserved : {}, error: null }));
    bookingProvider(booked);
    const { place, table } = await appWith([withVoucher(REF)]);

    const res = await place(REF);

    expect(res.body.success).toBe(true);
    expect(calls('reserve_trip_voucher')).toEqual([['reserve_trip_voucher', { p_user: 'user-1', p_code: 'SHUBHAM', p_ref: REF, p_due_at: '2026-11-18T00:00:00.000Z' }]]);
    expect(res.body.tripReward).toEqual({ code: 'SHUBHAM', coins: 5000, dueAt: '2026-11-18T00:00:00.000Z' });
    expect(table.row(REF).booking_details.wallet_issue).toBeUndefined();
  });

  it('still books when the voucher is refused, and marks it', async () => {
    const silence = vi.spyOn(console, 'warn').mockImplementation(() => {});
    supabaseMock.rpc.mockImplementation(async (fn) => (fn === 'reserve_trip_voucher'
      ? { data: null, error: { message: 'VOUCHER_USED_UP' } }
      : { data: {}, error: null }));
    bookingProvider(booked);
    const { place, table } = await appWith([withVoucher(REF)]);

    const res = await place(REF);

    expect(res.body.success).toBe(true);
    expect(res.body.tripReward).toBeUndefined();
    expect(table.row(REF).booking_details.pnr).toBe('NEW999');
    expect(table.row(REF).booking_details.wallet_issue).toMatchObject({ kind: 'voucher_refused', code: 'SHUBHAM', reason: 'VOUCHER_USED_UP' });
    silence.mockRestore();
  });

  it('voids the reward when the payment is reversed after a failed booking', async () => {
    bookingProvider(booked, { bookingEnabled: false });
    const { place } = await appWith([withVoucher(REF)]);

    await place(REF);

    expect(calls('void_trip_voucher')).toEqual([['void_trip_voucher', { p_ref: REF }]]);
    expect(calls('reserve_trip_voucher')).toHaveLength(0);
  });

  it('voids the reward of a second payment', async () => {
    bookingProvider(booked);
    const { place } = await appWith([bookedFirst(), withVoucher(REF)]);

    const res = await place(REF);

    expect(res.body.code).toBe('DUPLICATE_PAYMENT');
    expect(calls('void_trip_voucher')).toEqual([['void_trip_voucher', { p_ref: REF }]]);
  });
});
```

- [ ] **Step 4: Append the failing cancel and void tests**

Append to `tests/backend/walletCancelFlow.test.js`:

```js
describe('a cancel of a booking with a trip-reward voucher', () => {
  const withVoucher = { ...cardOnly, voucher: { id: 'v1', code: 'SHUBHAM', coins: 5000 } };

  it('voids the pending reward', async () => {
    axios.get.mockResolvedValue(arcOrder([pay(300)]));
    rpcAnswers.void_trip_voucher = { data: { status: 'void', voided: true }, error: null };

    const res = await cancel(flight({ charge: withVoucher }));

    expect(res.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith('void_trip_voucher', { p_ref: 'FLT300' });
  });

  it('leaves trip rewards alone for a booking without a voucher', async () => {
    axios.get.mockResolvedValue(arcOrder([pay(300)]));

    await cancel(flight({ charge: cardOnly }));

    expect(rpcNames()).not.toContain('void_trip_voucher');
  });

  it('still cancels when the reward could not be voided', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    axios.get.mockResolvedValue(arcOrder([pay(300)]));
    rpcAnswers.void_trip_voucher = { data: null, error: { message: 'connection reset' } };

    const res = await cancel(flight({ charge: withVoucher }));

    expect(res.statusCode).toBe(200);
    expect(closing().status).toBe('cancelled');
    silence.mockRestore();
  });
});
```

Append to `tests/backend/walletVoid.test.js`:

```js
describe('voiding the payment of a booking with a trip-reward voucher', () => {
  it('voids the pending reward after ARC voids', async () => {
    const res = await voidWith([flight({ verified_charge: { total: 72.2, voucher: { id: 'v1', code: 'SHUBHAM', coins: 5000 } } })]);

    expect(res.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith('void_trip_voucher', { p_ref: REF });
  });

  it('asks for nothing when the void fails at ARC', async () => {
    axios.put.mockResolvedValue({ status: 200, data: { result: 'FAILURE' } });

    await voidWith([flight({ verified_charge: { total: 72.2, voucher: { id: 'v1', code: 'SHUBHAM', coins: 5000 } } })]);

    expect(rpc).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run them to see them fail**

Run: `AMADEUS_WS_ENDPOINT= AMADEUS_WS_USERNAME= AMADEUS_WS_PASSWORD= AMADEUS_WS_OFFICE_ID= VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vitest run tests/utils/tripRewardDueAt.test.js tests/backend/tripRewardOrderRoute.test.js tests/backend/walletOrderRouteFlow.test.js tests/backend/walletCancelFlow.test.js tests/backend/walletVoid.test.js`
Expected: FAIL (`tripRewardDueAt` and `reserveTripRewardAfterBooking` are not exported; no `void_trip_voucher` calls).

- [ ] **Step 6: Add `tripRewardDueAt`**

Append to `shared/bookingItineraries.js` (no import is added to this file):

```js
/**
 * When a trip-reward voucher pays out: 00:00 UTC two days after the last
 * flight's arrival date, or null when that date cannot be read. Arrival times
 * carry no zone, so only the date is used: by then the day after landing has
 * ended in UTC wherever the airport is.
 */
export function tripRewardDueAt(legs) {
  const list = Array.isArray(legs) ? legs : [];
  const lastLeg = list[list.length - 1];
  const segments = Array.isArray(lastLeg?.segments) ? lastLeg.segments : [];
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(segments[segments.length - 1]?.arrivalDate));
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const landed = new Date(Date.UTC(year, month, day));
  if (landed.getUTCFullYear() !== year || landed.getUTCMonth() !== month || landed.getUTCDate() !== day) return null;
  return new Date(Date.UTC(year, month, day + 2)).toISOString();
}
```

- [ ] **Step 7: Reserve, void and expose the reward in the order route**

In `backend/routes/flight.routes.js`:

(1) Replace:

```js
import { captureCoins, returnAllCoins } from '../services/wallet.service.js';
```

with:

```js
import { captureCoins, reserveTripVoucher, returnAllCoins, tripVoucherOf, voidTripReward } from '../services/wallet.service.js';
```

(2) Replace:

```js
import { clockTime, itinerariesFromOffer, returnDateOf, splitLocalDateTime } from '../../shared/bookingItineraries.js';
```

with:

```js
import { clockTime, itinerariesFromOffer, returnDateOf, splitLocalDateTime, tripRewardDueAt } from '../../shared/bookingItineraries.js';
```

(3) Replace the end of `giveBackAllCoins`:

```js
    await markWalletIssue(bookingReference, { kind: 'return_failed', ...(coins > 0 ? { coins } : {}), reason }, report);
  }
  return result;
}
```

with:

```js
    await markWalletIssue(bookingReference, { kind: 'return_failed', ...(coins > 0 ? { coins } : {}), reason }, report);
  }
  return result;
}

/**
 * The trip-reward voucher checkout verified, reserved now the booking exists.
 * It changes no price, so a refusal never fails the booking: it is marked on
 * the booking, without covering a Jet Coins problem the desk still has to fix.
 */
export async function reserveTripRewardAfterBooking({ bookingReference, userId, verifiedCharge, offer }, { report = reportError } = {}) {
  const voucher = tripVoucherOf(verifiedCharge);
  if (!voucher || !bookingReference) return null;
  const refused = async (reason) => {
    console.warn('⚠️ Trip-reward voucher not reserved', { bookingReference, code: voucher.code, reason });
    try {
      const at = new Date().toISOString();
      const written = await patchBookingDetails(bookingReference, (details) => (
        details.wallet_issue && !details.wallet_issue.resolved_at && details.wallet_issue.kind !== 'voucher_refused'
          ? {}
          : { wallet_issue: { kind: 'voucher_refused', code: voucher.code, reason, at } }));
      if (!written) {
        report(new Error('a refused trip-reward voucher could not be recorded on the booking'), { where: 'reserveTripRewardAfterBooking', bookingReference });
      }
    } catch (error) {
      report(error, { where: 'reserveTripRewardAfterBooking', bookingReference });
    }
    return null;
  };
  if (!userId) return refused('LOGIN_REQUIRED');
  const dueAt = tripRewardDueAt(itinerariesFromOffer(offer));
  if (!dueAt) {
    report(new Error('a trip reward has no payout date: the itinerary could not be read'), {
      where: 'reserveTripRewardAfterBooking', bookingReference, code: voucher.code,
    });
  }
  let reward;
  try {
    reward = await reserveTripVoucher(supabase, { userId, code: voucher.code, bookingReference, dueAt });
  } catch (error) {
    return refused(error.code || 'WALLET_UNAVAILABLE');
  }
  if (!['pending', 'paid'].includes(reward.status)) return null;
  return {
    code: reward.code || voucher.code,
    coins: Math.floor(Number(reward.coins) || 0),
    dueAt: reward.due_at ? new Date(reward.due_at).toISOString() : null,
  };
}
```

(4) In `refundOnFulfillmentFailure`, replace:

```js
  let prior = null;
  let walletCoins;
```

with:

```js
  let prior = null;
  let walletCoins;
  let voucherOnBooking = false;
```

replace:

```js
        walletCoins = coinsUsedOf(failing.booking_details?.verified_charge);
```

with:

```js
        walletCoins = coinsUsedOf(failing.booking_details?.verified_charge);
        voucherOnBooking = Boolean(tripVoucherOf(failing.booking_details?.verified_charge));
```

replace:

```js
    await giveBackAllCoins(failingRef, 'reversal', { coins: walletCoins });
    return res.status(status).json(reversalAnswer(reversalOf(prior), { amount, errorMsg, code, customerMessage, reason }));
```

with:

```js
    await giveBackAllCoins(failingRef, 'reversal', { coins: walletCoins });
    if (voucherOnBooking) await voidTripReward(supabase, failingRef);
    return res.status(status).json(reversalAnswer(reversalOf(prior), { amount, errorMsg, code, customerMessage, reason }));
```

and replace:

```js
  console.log('💸 Payment reversal result:', reversal.action, '| reversed:', reversal.reversed);
  await giveBackAllCoins(failingRef, 'reversal', { coins: walletCoins });
```

with:

```js
  console.log('💸 Payment reversal result:', reversal.action, '| reversed:', reversal.reversed);
  await giveBackAllCoins(failingRef, 'reversal', { coins: walletCoins });
  if (voucherOnBooking) await voidTripReward(supabase, failingRef);
```

(5) In `refundDuplicatePayment`, replace:

```js
async function refundDuplicatePayment(bookingReference, { orderId, duplicateOf, walletCoins }) {
```

with:

```js
async function refundDuplicatePayment(bookingReference, { orderId, duplicateOf, walletCoins, hasVoucher = false }) {
```

and replace:

```js
  await giveBackAllCoins(bookingReference, 'duplicate', { coins: walletCoins });
```

with:

```js
  await giveBackAllCoins(bookingReference, 'duplicate', { coins: walletCoins });
  if (hasVoucher) await voidTripReward(supabase, bookingReference);
```

(6) At its caller, replace:

```js
          walletCoins: coinsUsedOf(verifiedCharge),
        });
```

with:

```js
          walletCoins: coinsUsedOf(verifiedCharge),
          hasVoucher: Boolean(tripVoucherOf(verifiedCharge)),
        });
```

(7) Replace:

```js
    const noteCoinsUsed = () => settleCoinsAfterBooking({ bookingReference: existing.booking_reference, verifiedCharge });
```

with:

```js
    const noteCoinsUsed = async () => {
      await settleCoinsAfterBooking({ bookingReference: existing.booking_reference, verifiedCharge });
      return reserveTripRewardAfterBooking({
        bookingReference: existing.booking_reference,
        userId: existing.user_id || null,
        verifiedCharge,
        offer: firstOffer,
      });
    };
```

(8) On the success path (four-space indent, after the "could be used any number of times." comment), replace:

```js
    // could be used any number of times.
    await noteCouponUse();
    await noteCoinsUsed();
```

with:

```js
    // could be used any number of times.
    await noteCouponUse();
    const tripReward = await noteCoinsUsed();
```

(9) In the success answer, replace:

```js
      savedToDatabase: !!dbBooking,
```

with:

```js
      savedToDatabase: !!dbBooking,
      ...(tripReward ? { tripReward } : {}),
```

(10) Replace the end of `chargeBreakdownOf`:

```js
    couponCode: charge.coupon?.code || null,
  };
}
```

with:

```js
    couponCode: charge.coupon?.code || null,
  };
}

/** The voucher a booking will pay Jet Coins for after the trip, as the receipt shows it, or null. */
export function tripRewardOfRow(booking) {
  const voucher = tripVoucherOf(booking?.booking_details?.verified_charge);
  const coins = Math.floor(Number(voucher?.coins) || 0);
  if (!voucher || coins <= 0) return null;
  if (booking.status === 'cancelled' || booking.booking_details?.wallet_issue?.kind === 'voucher_refused') return null;
  return { code: voucher.code, coins };
}
```

(11) In `toClientBooking`, replace:

```js
    chargeBreakdown: chargeBreakdownOf(booking.booking_details?.verified_charge),
```

with:

```js
    chargeBreakdown: chargeBreakdownOf(booking.booking_details?.verified_charge),
    tripReward: booking.travel_type === 'flight' ? tripRewardOfRow(booking) : null,
```

- [ ] **Step 8: Void on cancel and on payment void**

In `backend/routes/payment/operations.handlers.js`:

(1) Replace:

```js
import { captureCoins, releaseCoins, returnAllCoins, returnCoins, reverseEarnedCoins } from '../../services/wallet.service.js';
```

with:

```js
import {
    captureCoins, releaseCoins, returnAllCoins, returnCoins, reverseEarnedCoins, tripVoucherOf, voidTripReward,
} from '../../services/wallet.service.js';
```

(2) In `cancelFlightBooking`, replace:

```js
    const coins = await settleCoinsOnCancel(supabase, {
        bookingReference, decision, heldAmount: payment.heldAmount, kept: keptForCoins, coins: coinsUsed,
    });
```

with:

```js
    const coins = await settleCoinsOnCancel(supabase, {
        bookingReference, decision, heldAmount: payment.heldAmount, kept: keptForCoins, coins: coinsUsed,
    });
    if (tripVoucherOf(details.verified_charge)) await voidTripReward(supabase, bookingReference);
```

(3) In `handlePaymentVoid`, replace:

```js
        const coinsBack = coinsUsed > 0 ? await returnAllCoins(supabase, booking.booking_reference, 'void') : { ok: true, coins: 0 };
```

with:

```js
        const coinsBack = coinsUsed > 0 ? await returnAllCoins(supabase, booking.booking_reference, 'void') : { ok: true, coins: 0 };
        if (tripVoucherOf(booking?.booking_details?.verified_charge)) await voidTripReward(supabase, booking.booking_reference);
```

- [ ] **Step 9: Run the suites this task touches**

Run: `AMADEUS_WS_ENDPOINT= AMADEUS_WS_USERNAME= AMADEUS_WS_PASSWORD= AMADEUS_WS_OFFICE_ID= VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vitest run tests/utils/tripRewardDueAt.test.js tests/utils/bookingItineraries.test.js tests/backend/bookingItineraries.test.js tests/backend/tripRewardOrderRoute.test.js tests/backend/walletOrderRouteFlow.test.js tests/backend/walletOrderRoute.test.js tests/backend/walletCancelFlow.test.js tests/backend/walletVoid.test.js tests/backend/walletRefunds.test.js tests/backend/chargeBreakdown.test.js`
Expected: PASS.

- [ ] **Step 10: Run CI's unit command**

Run: `AMADEUS_WS_ENDPOINT= AMADEUS_WS_USERNAME= AMADEUS_WS_PASSWORD= AMADEUS_WS_OFFICE_ID= VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run test:unit`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add shared/bookingItineraries.js backend/routes/flight.routes.js backend/routes/payment/operations.handlers.js tests/utils/tripRewardDueAt.test.js tests/backend/tripRewardOrderRoute.test.js tests/backend/walletOrderRouteFlow.test.js tests/backend/walletCancelFlow.test.js tests/backend/walletVoid.test.js
git commit -F - <<'EOF'
feat(flights): reserve a trip reward when the booking is made

Where the order route captures Jet Coins (commit and success) it now
reserves the trip-reward voucher, due 00:00 UTC two days after the last
flight's arrival date. A refusal never fails the booking: it is marked
voucher_refused, without covering an open Jet Coins problem. A reversed,
duplicate, cancelled or voided payment voids the pending reward. The order
answer and the client booking carry tripReward for the receipt.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CnRin1ZGh44yizpdTBakw6
EOF
```

---

### Task 5: Payout on the wallet job's tick, and the emails

**Files:**
- Modify: `backend/jobs/walletEarn.job.js`
- Modify: `backend/services/email/templates.js`
- Test: `tests/backend/tripRewardPayout.test.js` (create), `tests/backend/tripRewardEmail.test.js` (create)

**Interfaces:**
- Consumes (Task 2): `payTripVoucher(client, ref)`, `voidTripReward(client, ref)`. (Task 1): `pay_trip_voucher` answers `{ status, coins, user_id, code, applied }`.
- Produces (`backend/jobs/walletEarn.job.js`):
  - `tripRewardVerdict(booking, now) → 'pay' | 'void' | 'wait'`.
  - `sendTripRewardEmail({ client, reward, booking, send }) → Promise<boolean>`; never throws.
  - `payTripRewardsOnce({ client, now, pay, voidReward, notify, limit = 200, pageSize }) → Promise<{ paid, voided, waiting, failed }>`.
  - `tickOnce(options)` also takes `pay`, `voidReward`, `notify` and returns `{ earn, sweep, rewards }`.
- Produces (`backend/services/email/templates.js`): `generateTripRewardTemplate({ customerName, coins, code, bookingReference, origin, destination }) → html`; the booking confirmation email shows `Voucher <CODE>: <coins> Jet Coins after your trip.` when `verified_charge.voucher` is set and `wallet_issue.kind !== 'voucher_refused'`.

- [ ] **Step 1: Write the failing payout test**

Create `tests/backend/tripRewardPayout.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { payTripRewardsOnce, sendTripRewardEmail, tickOnce } from '../../backend/jobs/walletEarn.job.js';

const HOUR = 3600 * 1000;
const NOW = Date.parse('2026-11-20T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();

const reward = (over = {}) => ({ booking_reference: 'FLT1', user_id: 'u1', coins: 5000, status: 'pending', due_at: iso(NOW - HOUR), ...over });
const flown = (over = {}) => ({
  booking_reference: 'FLT1',
  user_id: 'u1',
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  booking_details: { gds: { ticketed: true }, customer_email: 'booker@example.com', origin: 'JFK', destination: 'LHR' },
  ...over,
});
const paid = (over = {}) => ({ status: 'paid', applied: true, coins: 5000, user_id: 'u1', code: 'SHUBHAM', ...over });

/** The slice of the query builder the jobs use, over arrays. */
function fakeClient({ voucher_redemptions = [], bookings = [], users = [] } = {}) {
  const tables = { voucher_redemptions, bookings, users, wallet_entries: [], wallet_holds: [] };
  return {
    from(table) {
      const filters = [];
      const orders = [];
      let window = null;
      let max = Infinity;
      const run = () => {
        let rows = (tables[table] || []).filter((row) => filters.every((keep) => keep(row)));
        for (const { column, ascending } of [...orders].reverse()) {
          rows = [...rows].sort((a, b) => (a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : 0) * (ascending ? 1 : -1));
        }
        if (window) rows = rows.slice(window[0], window[1] + 1);
        return { data: rows.slice(0, max), error: null };
      };
      const query = {
        select: () => query,
        eq: (column, value) => { filters.push((row) => row[column] === value); return query; },
        in: (column, values) => { filters.push((row) => values.includes(row[column])); return query; },
        gte: (column, value) => { filters.push((row) => row[column] != null && row[column] >= value); return query; },
        lte: (column, value) => { filters.push((row) => row[column] != null && row[column] <= value); return query; },
        not: (column, operator, value) => {
          if (operator === 'is' && value === null) filters.push((row) => row[column] != null);
          return query;
        },
        order: (column, { ascending = true } = {}) => { orders.push({ column, ascending }); return query; },
        range: (from, to) => { window = [from, to]; return query; },
        limit: (count) => { max = count; return query; },
        maybeSingle: async () => { const result = run(); return { data: result.data?.[0] ?? null, error: result.error }; },
        then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
      };
      return query;
    },
  };
}

const deps = (extra = {}) => ({
  pay: vi.fn(async () => paid()),
  voidReward: vi.fn(async () => ({ ok: true, status: 'void' })),
  notify: vi.fn(async () => true),
  ...extra,
});
const runWith = (client, extra = {}) => {
  const used = deps(extra);
  return { used, result: payTripRewardsOnce({ client, now: NOW, ...used }) };
};

describe('paying trip rewards', () => {
  it('pays a due reward once its booking is ticketed, and tells the customer', async () => {
    const client = fakeClient({ voucher_redemptions: [reward()], bookings: [flown()] });
    const { used, result } = runWith(client);

    expect(await result).toEqual({ paid: 1, voided: 0, waiting: 0, failed: 0 });
    expect(used.pay).toHaveBeenCalledWith(client, 'FLT1');
    expect(used.notify).toHaveBeenCalledWith(expect.objectContaining({ reward: paid(), booking: expect.objectContaining({ booking_reference: 'FLT1' }) }));
  });

  it('waits for a reward not yet due, and never pays one with no payout date', async () => {
    const client = fakeClient({
      voucher_redemptions: [reward({ due_at: iso(NOW + HOUR) }), reward({ booking_reference: 'FLT2', due_at: null })],
      bookings: [flown(), flown({ booking_reference: 'FLT2' })],
    });
    const { used, result } = runWith(client);

    expect(await result).toEqual({ paid: 0, voided: 0, waiting: 0, failed: 0 });
    expect(used.pay).not.toHaveBeenCalled();
  });

  it('voids a reward whose booking was cancelled since it was reserved, and sends no email', async () => {
    const client = fakeClient({ voucher_redemptions: [reward()], bookings: [flown({ status: 'cancelled' })] });
    const { used, result } = runWith(client);

    expect((await result).voided).toBe(1);
    expect(used.voidReward).toHaveBeenCalledWith(client, 'FLT1');
    expect(used.pay).not.toHaveBeenCalled();
    expect(used.notify).not.toHaveBeenCalled();
  });

  it('voids a reward whose payment went back in full', async () => {
    const client = fakeClient({ voucher_redemptions: [reward()], bookings: [flown({ payment_status: 'refunded' })] });
    const { used, result } = runWith(client);

    expect((await result).voided).toBe(1);
    expect(used.pay).not.toHaveBeenCalled();
  });

  it('waits while the booking is not ticketed, is being cancelled, or cannot be read', async () => {
    const silence = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = fakeClient({
      voucher_redemptions: [reward(), reward({ booking_reference: 'FLT2' }), reward({ booking_reference: 'FLT3' })],
      bookings: [
        flown({ booking_details: { gds: { ticketed: false } } }),
        flown({ booking_reference: 'FLT2', booking_details: { gds: { ticketed: true }, gds_chain: { state: 'cancelling', startedAt: iso(NOW - 1000) } } }),
      ],
    });
    const { used, result } = runWith(client);

    expect(await result).toEqual({ paid: 0, voided: 0, waiting: 3, failed: 0 });
    expect(used.pay).not.toHaveBeenCalled();
    expect(used.voidReward).not.toHaveBeenCalled();
    silence.mockRestore();
  });

  it('leaves a payout that failed for the next run, and sends no email', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = fakeClient({ voucher_redemptions: [reward()], bookings: [flown()] });
    const { used, result } = runWith(client, { pay: vi.fn().mockRejectedValue(Object.assign(new Error('down'), { code: 'WALLET_UNAVAILABLE' })) });

    expect((await result).failed).toBe(1);
    expect(used.notify).not.toHaveBeenCalled();
    silence.mockRestore();
  });

  it('sends no second email for a reward another run already paid', async () => {
    const client = fakeClient({ voucher_redemptions: [reward()], bookings: [flown()] });
    const { used, result } = runWith(client, { pay: vi.fn(async () => paid({ applied: false })) });

    expect((await result).paid).toBe(0);
    expect(used.notify).not.toHaveBeenCalled();
  });

  it('pays at most the run limit', async () => {
    const refs = ['FLT1', 'FLT2', 'FLT3'];
    const client = fakeClient({
      voucher_redemptions: refs.map((ref) => reward({ booking_reference: ref })),
      bookings: refs.map((ref) => flown({ booking_reference: ref })),
    });
    const pay = vi.fn(async () => paid());

    await payTripRewardsOnce({ client, now: NOW, pay, voidReward: vi.fn(), notify: vi.fn(async () => true), limit: 2 });

    expect(pay).toHaveBeenCalledTimes(2);
  });
});

describe('the "Your Jet Coins have arrived" email', () => {
  it('goes to the account address once the coins have landed', async () => {
    const client = fakeClient({ users: [{ id: 'u1', email: 'jane@example.com', first_name: 'Jane' }] });
    const send = vi.fn(async () => ({ id: 'e1' }));

    const sent = await sendTripRewardEmail({ client, reward: paid(), booking: flown(), send });

    expect(sent).toBe(true);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'jane@example.com', subject: 'Your Jet Coins have arrived' }));
    const { html } = send.mock.calls[0][0];
    expect(html).toContain('5,000 Jet Coins');
    expect(html).toContain('SHUBHAM');
    expect(html).toContain('FLT1 · JFK → LHR');
  });

  it("goes to the booking's contact when the account has no address", async () => {
    const send = vi.fn(async () => ({ id: 'e1' }));
    await sendTripRewardEmail({ client: fakeClient(), reward: paid(), booking: flown(), send });
    expect(send.mock.calls[0][0].to).toBe('booker@example.com');
  });

  it('counts the payout even when the email fails, and never sends it again', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    const send = vi.fn().mockRejectedValue(new Error('email refused by Resend'));
    const client = fakeClient({ voucher_redemptions: [reward()], bookings: [flown()], users: [{ id: 'u1', email: 'jane@example.com' }] });

    const result = await payTripRewardsOnce({
      client, now: NOW, pay: vi.fn(async () => paid()), voidReward: vi.fn(), notify: (args) => sendTripRewardEmail({ ...args, send }),
    });

    expect(result.paid).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    silence.mockRestore();
  });
});

describe('the periodic run', () => {
  it('pays due trip rewards on the same tick as earning and the hold sweep', async () => {
    const client = fakeClient({ voucher_redemptions: [reward()], bookings: [flown()] });
    const pay = vi.fn(async () => paid());

    const tick = await tickOnce({ client, now: NOW, timeZone: 'America/Los_Angeles', site: 'site', earn: vi.fn(), pay, notify: vi.fn(async () => true) });

    expect(tick.rewards).toMatchObject({ paid: 1 });
    expect(pay).toHaveBeenCalledWith(client, 'FLT1');
  });
});
```

- [ ] **Step 2: Write the failing email test**

Create `tests/backend/tripRewardEmail.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { generateBookingConfirmationTemplate, generateTripRewardTemplate } from '../../backend/services/email/templates.js';

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

describe('the "Your Jet Coins have arrived" email', () => {
  const html = generateTripRewardTemplate({ customerName: 'Jane Doe', coins: 5000, code: 'SHUBHAM', bookingReference: 'FLT1', origin: 'JFK', destination: 'LHR' });

  it('leads with the coins and what they are worth', () => {
    expect(text(html)).toContain('Your Jet Coins have arrived');
    expect(text(html)).toContain('5,000 Jet Coins');
    expect(text(html)).toContain('Worth $50.00');
  });

  it('names the voucher and the trip', () => {
    expect(text(html)).toContain('voucher SHUBHAM has paid out for your trip FLT1 · JFK → LHR');
  });

  it('links to the wallet', () => {
    expect(html).toContain('https://www.jetsetterss.com/profiledashboard?tab=wallet');
  });

  it('uses the brand colours, never a generic blue', () => {
    expect(html).toContain('#055B75');
    for (const blue of ['#0066ff', '#1e40af', '#1976d2', '#0ea5e9']) expect(html.toLowerCase()).not.toContain(blue);
  });

  it('still reads as a sentence with only the coins known', () => {
    const bare = text(generateTripRewardTemplate({ coins: 100 }));
    expect(bare).toContain('100 Jet Coins');
    expect(bare).toContain('Your trip reward has paid out.');
    expect(bare).not.toMatch(/undefined|null|NaN/);
  });
});

describe('the booking confirmation email with a trip-reward voucher', () => {
  const base = { customerName: 'Jane Doe', bookingReference: 'FLT1', bookingType: 'flight', paymentAmount: 122.2, currency: 'USD', passengers: 1, travelDate: '2026-11-15' };
  const charge = { fare: 120, serviceFee: 2.2, discount: 0, total: 122.2, voucher: { id: 'v1', code: 'SHUBHAM', coins: 5000 } };

  it('says the coins come after the trip, not as money off', () => {
    const words = text(generateBookingConfirmationTemplate({ ...base, bookingDetails: { verified_charge: charge } }));
    expect(words).toContain('Voucher SHUBHAM: 5,000 Jet Coins after your trip');
    expect(words).toContain('Total paid $122.20');
    expect(words).not.toContain('−$50.00');
  });

  it('says nothing about it when the voucher was refused at booking', () => {
    const words = text(generateBookingConfirmationTemplate({ ...base, bookingDetails: { verified_charge: charge, wallet_issue: { kind: 'voucher_refused', code: 'SHUBHAM' } } }));
    expect(words).not.toContain('Voucher SHUBHAM');
  });

  it('says nothing for a booking without a voucher', () => {
    const words = text(generateBookingConfirmationTemplate({ ...base, bookingDetails: { verified_charge: { ...charge, voucher: null } } }));
    expect(words).not.toContain('after your trip');
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `AMADEUS_WS_ENDPOINT= AMADEUS_WS_USERNAME= AMADEUS_WS_PASSWORD= AMADEUS_WS_OFFICE_ID= VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vitest run --project backend tests/backend/tripRewardPayout.test.js tests/backend/tripRewardEmail.test.js`
Expected: FAIL (`payTripRewardsOnce`, `sendTripRewardEmail`, `generateTripRewardTemplate` are not exported).

- [ ] **Step 4: Add the payout email template and the confirmation line**

In `backend/services/email/templates.js`, replace:

```js
/** A payment link. The amount and the button are the entire email. */
```

with:

```js
/** A trip-reward voucher paid out. The coins lead: they are the news. */
export function generateTripRewardTemplate({ customerName, coins, code, bookingReference, origin, destination } = {}) {
  const count = Math.max(0, Math.floor(Number(coins) || 0));
  const coinsText = new Intl.NumberFormat('en-US').format(count);
  const named = code ? `voucher <strong>${code}</strong>` : 'trip reward';
  const trip = line([bookingReference, origin && destination ? `${origin} → ${destination}` : null]);
  const paidOut = trip ? `Your ${named} has paid out for your trip <strong>${trip}</strong>.` : `Your ${named} has paid out.`;
  return renderBrandedEmail({
    preheader: `${coinsText} Jet Coins are in your Jet Wallet`,
    headerLabel: 'Jet Wallet',
    heading: 'Your Jet Coins have arrived',
    subheading: 'Thank you for flying with Jetsetters',
    contentHtml: `
      ${paragraph(`Hi <strong>${firstNameOf(customerName)}</strong>,`)}
      ${figureBlock([{ label: 'Added to your Jet Wallet', value: `${coinsText} Jet Coins`, note: `Worth ${money(count / 100)}` }])}
      ${paragraph(paidOut)}
      ${highlightBox('Use them on your next flight: switch on <strong>Use my Jet Coins</strong> at checkout. 100 Jet Coins = $1.', { bg: '#F1FBFD', border: '#0890BC', color: '#034457' })}
    `,
    cta: { text: 'Open my Jet Wallet', url: `${BRAND.site}/profiledashboard?tab=wallet` },
  });
}

/** A payment link. The amount and the button are the entire email. */
```

Replace:

```js
  const coinsPaidLabel = coinCount > 0 ? `Jet Coins (${new Intl.NumberFormat('en-US').format(coinCount)})` : 'Jet Coins';
```

with:

```js
  const coinsPaidLabel = coinCount > 0 ? `Jet Coins (${new Intl.NumberFormat('en-US').format(coinCount)})` : 'Jet Coins';
  const rewardVoucher = recordedCharge.voucher;
  const rewardCoins = Math.floor(Number(rewardVoucher?.coins) || 0);
  const tripRewardNote = rewardVoucher?.code && rewardCoins > 0 && d.walletIssue?.kind !== 'voucher_refused'
    ? highlightBox(
      `<strong>Voucher ${rewardVoucher.code}:</strong> ${new Intl.NumberFormat('en-US').format(rewardCoins)} Jet Coins after your trip. They land in your Jet Wallet once you have flown.`,
      { bg: '#F1FBFD', border: '#0890BC', color: '#034457' },
    )
    : '';
```

Replace:

```js
    { total: formatCurrency(paymentAmount), currency, label: 'Total paid' },
  )}
    ${actionRow([
```

with:

```js
    { total: formatCurrency(paymentAmount), currency, label: 'Total paid' },
  )}
    ${tripRewardNote}
    ${actionRow([
```

- [ ] **Step 5: Pay rewards on the wallet job's tick**

In `backend/jobs/walletEarn.job.js`:

(1) Replace:

```js
 * Jet Coins on flights, two chores on one tick.
```

with:

```js
 * Jet Coins on flights, three chores on one tick.
```

and replace the end of that header comment:

```js
 * the gateway has said nothing was paid - by the abandoned-checkout job where it
 * covers the row, by this sweep where it does not.
 */
```

with:

```js
 * the gateway has said nothing was paid - by the abandoned-checkout job where it
 * covers the row, by this sweep where it does not.
 *
 * Trip rewards: a trip-reward voucher reserved on a booking is paid into the
 * wallet once its payout date has passed and the booking, read again just
 * before paying, is still ticketed and not cancelled. One whose booking was
 * cancelled without the reward being voided is voided here.
 */
```

(2) Replace:

```js
import { captureCoins, earnCoins, releaseCoins, reverseEarnedCoins } from '../services/wallet.service.js';
```

with:

```js
import { captureCoins, earnCoins, payTripVoucher, releaseCoins, reverseEarnedCoins, voidTripReward } from '../services/wallet.service.js';
import { sendEmail } from '../services/emailService.js';
import { generateTripRewardTemplate } from '../services/email/templates.js';
```

(3) Replace:

```js
const EARN_LIMIT = 200;
```

with:

```js
const EARN_LIMIT = 200;
const REWARD_LIMIT = 200;
```

(4) Replace:

```js
export async function tickOnce(options = {}) {
  const { client, now, timeZone, site, earn, reverse, release, capture, reconcile } = options;
  const tick = { earn: null, sweep: null };
  try {
    tick.earn = await earnOnce({ client, now, timeZone, earn, reverse });
  } catch (error) {
    console.error('⚠️ Wallet earn run failed:', error.message);
  }
  try {
    tick.sweep = await sweepStaleHolds({ client, now, site, release, capture, reconcile });
  } catch (error) {
    console.error('⚠️ Wallet hold sweep failed:', error.message);
  }
  return tick;
}
```

with:

```js
/** What the payout does with a due trip reward, from a fresh read of its booking. Pure. */
export function tripRewardVerdict(row, now = Date.now()) {
  if (!row) return 'wait';
  if (row.status === 'cancelled' || row.payment_status === 'refunded') return 'void';
  if (row.travel_type !== 'flight' || !EARNING_STATUSES.includes(row.status)) return 'wait';
  const details = row.booking_details || {};
  if (!isTicketed(details) || liveChainState(details.gds_chain, now) === 'cancelling') return 'wait';
  return 'pay';
}

/** Best effort: a failed email is logged and never retried, so nobody is emailed twice. */
export async function sendTripRewardEmail({ client = supabase, reward, booking, send = sendEmail }) {
  try {
    const { data: user } = await client.from('users').select('email, first_name, name').eq('id', reward.user_id).maybeSingle();
    const details = booking?.booking_details || {};
    const to = user?.email || details.customer_email;
    if (!to) {
      warn('a trip reward was paid but nobody can be emailed', { bookingReference: booking?.booking_reference });
      return false;
    }
    await send({
      to,
      subject: 'Your Jet Coins have arrived',
      html: generateTripRewardTemplate({
        customerName: user?.first_name || user?.name || '',
        coins: reward.coins,
        code: reward.code,
        bookingReference: booking?.booking_reference,
        origin: details.origin,
        destination: details.destination,
      }),
    });
    return true;
  } catch (error) {
    console.error('⚠️ Wallet: the Jet Coins email could not be sent', { bookingReference: booking?.booking_reference, error: error.message });
    return false;
  }
}

export async function payTripRewardsOnce({
  client = supabase,
  now = Date.now(),
  pay = payTripVoucher,
  voidReward = voidTripReward,
  notify = sendTripRewardEmail,
  limit = REWARD_LIMIT,
  pageSize = PAGE_SIZE,
} = {}) {
  const result = { paid: 0, voided: 0, waiting: 0, failed: 0 };
  let due;
  try {
    due = await readAll(() => client.from('voucher_redemptions')
      .select('booking_reference, user_id, coins, due_at')
      .eq('status', 'pending')
      .lte('due_at', new Date(now).toISOString())
      .order('due_at', { ascending: true })
      .order('booking_reference', { ascending: true }), pageSize);
  } catch (error) {
    warn('trip rewards could not be read', { error: error.message });
    return result;
  }

  let attempts = 0;
  for (const { booking_reference: bookingReference } of due) {
    if (attempts >= limit) break;
    if (!bookingReference) continue;
    const { data: booking, error } = await client.from('bookings')
      .select('booking_reference, user_id, travel_type, status, payment_status, booking_details')
      .eq('booking_reference', bookingReference)
      .maybeSingle();
    if (error || !booking) {
      result.waiting += 1;
      warn('the booking behind a due trip reward could not be read', { bookingReference });
      continue;
    }
    const verdict = tripRewardVerdict(booking, now);
    if (verdict === 'wait') {
      result.waiting += 1;
      continue;
    }
    attempts += 1;
    if (verdict === 'void') {
      const outcome = await voidReward(client, bookingReference);
      if (outcome?.status === 'void') result.voided += 1;
      else if (!outcome?.ok) result.failed += 1;
      continue;
    }
    let outcome;
    try {
      outcome = await pay(client, bookingReference);
    } catch (payError) {
      result.failed += 1;
      console.error('⚠️ Wallet: a trip reward could not be paid; the next run tries again', { bookingReference, code: payError.code });
      continue;
    }
    if (outcome?.status !== 'paid' || outcome.applied !== true) continue;
    result.paid += 1;
    await notify({ client, reward: outcome, booking });
  }
  if (result.paid || result.voided || result.failed) {
    console.log(`🪙 Trip rewards: ${result.paid} paid, ${result.voided} voided, ${result.failed} failed, ${result.waiting} waiting`);
  }
  return result;
}

export async function tickOnce(options = {}) {
  const { client, now, timeZone, site, earn, reverse, release, capture, reconcile, pay, voidReward, notify } = options;
  const tick = { earn: null, sweep: null, rewards: null };
  try {
    tick.earn = await earnOnce({ client, now, timeZone, earn, reverse });
  } catch (error) {
    console.error('⚠️ Wallet earn run failed:', error.message);
  }
  try {
    tick.sweep = await sweepStaleHolds({ client, now, site, release, capture, reconcile });
  } catch (error) {
    console.error('⚠️ Wallet hold sweep failed:', error.message);
  }
  try {
    tick.rewards = await payTripRewardsOnce({ client, now, pay, voidReward, notify });
  } catch (error) {
    console.error('⚠️ Trip reward payout failed:', error.message);
  }
  return tick;
}
```

- [ ] **Step 6: Run the job and email suites**

Run: `AMADEUS_WS_ENDPOINT= AMADEUS_WS_USERNAME= AMADEUS_WS_PASSWORD= AMADEUS_WS_OFFICE_ID= VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vitest run --project backend tests/backend/tripRewardPayout.test.js tests/backend/tripRewardEmail.test.js tests/backend/walletEarnJob.test.js tests/backend/emailTemplates.test.js tests/backend/emailTemplateJetCoins.test.js tests/backend/emailDates.test.js tests/backend/bookingItineraries.test.js`
Expected: PASS.

- [ ] **Step 7: Run CI's unit command**

Run: `AMADEUS_WS_ENDPOINT= AMADEUS_WS_USERNAME= AMADEUS_WS_PASSWORD= AMADEUS_WS_OFFICE_ID= VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run test:unit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/jobs/walletEarn.job.js backend/services/email/templates.js tests/backend/tripRewardPayout.test.js tests/backend/tripRewardEmail.test.js
git commit -F - <<'EOF'
feat(wallet): pay trip rewards after the trip, with an email

The Lightsail wallet job pays due trip rewards on its 15-minute tick: at
most 200 a run, each booking read again just before paying, and a reward
whose booking was cancelled is voided instead. Only the call that credits
sends "Your Jet Coins have arrived"; a failed email is logged and never
retried. The booking confirmation email says the voucher's coins come
after the trip.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CnRin1ZGh44yizpdTBakw6
EOF
```

---

### Task 6: One "Coupon or voucher code" box on the flight review page

**Files:**
- Create: `frontend/src/utils/tripVoucher.js`
- Modify: `frontend/src/components/CouponInput.jsx` (whole file replaced)
- Modify: `frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx`
- Modify: `frontend/src/Services/ArcPayService.js`
- Modify: `frontend/src/utils/cancelledCheckout.js`
- Test: `tests/utils/tripVoucher.test.js` (create), `tests/components/couponInputVoucher.test.jsx` (create), `tests/components/reviewPageVoucher.test.jsx` (create); placeholder selector in `tests/components/cancelledPaymentCoupon.test.jsx`, `tests/components/couponRemovedByCheckout.test.jsx`, `tests/components/reviewPageCoinsCheckout.test.jsx`, `tests/components/priceChangedWithCoupon.test.jsx`

**Interfaces:**
- Consumes (Task 2): `POST /api/wallet/voucher-check`. (Task 3): hosted checkout `voucherCode`; refusals `VOUCHER_*` (409), `VOUCHER_UNAVAILABLE` (503).
- Produces:
  - `checkTripVoucher(code) → Promise<{ ok: true, voucher: { code, coins } } | { ok: false, code: string | null, message: string }>` in `frontend/src/utils/tripVoucher.js`.
  - `CouponInput` props `checkVoucher` (fn; when given, the box takes vouchers), `voucher` (`{ code, coins } | null`), `onVoucherApply(voucher)`, `onVoucherRemove()`. Without `checkVoucher` it renders exactly the plain coupon box (placeholder `Enter coupon code`).
  - `ArcPayService.createHostedCheckout({ ..., voucherCode })` sends `voucherCode`.
  - The review page's ARC draft (`sessionStorage.pendingFlightBooking`) carries `voucherCode`; `readCancelledCheckout()` returns it.

- [ ] **Step 1: Write the failing util test**

Create `tests/utils/tripVoucher.test.js`:

```js
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkTripVoucher } from '../../frontend/src/utils/tripVoucher.js';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());

describe('checking a trip voucher from the browser', () => {
  it('asks the wallet with the code uppercased and gives back the voucher', async () => {
    const fetch = vi.fn(async () => json(200, { success: true, data: { kind: 'trip', code: 'SHUBHAM', coins: 5000 } }));
    vi.stubGlobal('fetch', fetch);

    expect(await checkTripVoucher(' shubham ')).toEqual({ ok: true, voucher: { code: 'SHUBHAM', coins: 5000 } });
    expect(String(fetch.mock.calls[0][0])).toMatch(/\/wallet\/voucher-check$/);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ code: 'SHUBHAM' });
  });

  it("passes on the server's words for a refusal", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(409, { success: false, code: 'VOUCHER_WRONG_KIND', error: 'Redeem this code in Profile → Jet Wallet.' })));
    expect(await checkTripVoucher('WELCOME50')).toEqual({ ok: false, code: 'VOUCHER_WRONG_KIND', message: 'Redeem this code in Profile → Jet Wallet.' });
  });

  it('asks a signed-out customer to log in', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(401, { success: false, message: 'Not authorized' })));
    expect(await checkTripVoucher('SHUBHAM')).toEqual({ ok: false, code: 'LOGIN_REQUIRED', message: 'Please log in to use a voucher.' });
  });

  it('never shows raw server text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(500, { success: false, error: 'jwt expired' })));
    expect((await checkTripVoucher('SHUBHAM')).message).toBe('The voucher could not be checked just now. Please try again.');
  });

  it('says so when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await checkTripVoucher('SHUBHAM')).toEqual({ ok: false, code: 'WALLET_UNAVAILABLE', message: 'The voucher could not be checked just now. Please try again.' });
  });
});
```

- [ ] **Step 2: Write the failing component test**

Create `tests/components/couponInputVoucher.test.jsx`:

```jsx
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ user: { id: 'user-1' }, loading: false }) }));
vi.mock('../../frontend/src/Components/Price', () => ({ default: ({ amount }) => <span>{`$${amount}`}</span> }));

const { default: CouponInput } = await import('../../frontend/src/components/CouponInput.jsx');
const { default: ArcPayService } = await import('../../frontend/src/Services/ArcPayService.js');
const { readCancelledCheckout } = await import('../../frontend/src/utils/cancelledCheckout.js');

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const coupons = { requests: [] };

beforeEach(() => {
  coupons.requests = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    const body = JSON.parse(init?.body || '{}');
    coupons.requests.push(body);
    return body.code === 'SAVE20'
      ? json(200, { success: true, coupon: { id: 'c-1', code: 'SAVE20' }, discountAmount: 20, finalTotal: 190 })
      : json(404, { success: false, message: 'Invalid or expired coupon code.' });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const apply = (code) => {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
};

describe('the plain coupon box, on every page but flights', () => {
  it('asks for a coupon and never tries a voucher', async () => {
    render(<CouponInput orderTotal={100} bookingType="cruises" />);
    expect(screen.getByPlaceholderText('Enter coupon code')).toBeTruthy();

    apply('SHUBHAM');

    expect(await screen.findByText('Invalid or expired coupon code.')).toBeTruthy();
    expect(coupons.requests).toHaveLength(1);
  });
});

describe('the flight box for coupons and vouchers', () => {
  const voucherBox = (props = {}) => {
    const checkVoucher = props.checkVoucher || vi.fn(async () => ({ ok: true, voucher: { code: 'SHUBHAM', coins: 5000 } }));
    const onVoucherApply = vi.fn();
    const onVoucherRemove = vi.fn();
    const onApply = vi.fn();
    render(<CouponInput orderTotal={210} bookingType="flights" checkVoucher={checkVoucher} onVoucherApply={onVoucherApply} onVoucherRemove={onVoucherRemove} onApply={onApply} {...props} />);
    return { checkVoucher, onVoucherApply, onVoucherRemove, onApply };
  };

  it('tries the code as a coupon first, then as a trip voucher', async () => {
    const { checkVoucher, onVoucherApply } = voucherBox();
    expect(screen.getByPlaceholderText('Coupon or voucher code')).toBeTruthy();

    apply('shubham');

    await waitFor(() => expect(onVoucherApply).toHaveBeenCalledWith({ code: 'SHUBHAM', coins: 5000 }));
    expect(coupons.requests[0]).toMatchObject({ code: 'SHUBHAM', bookingType: 'flights' });
    expect(checkVoucher).toHaveBeenCalledWith('SHUBHAM');
  });

  it('applies a coupon without asking about vouchers', async () => {
    const { checkVoucher, onApply } = voucherBox();

    apply('SAVE20');

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ code: 'SAVE20', discountAmount: 20 })));
    expect(checkVoucher).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Coupon or voucher code').value).toBe('');
  });

  it('shows a coupon and a voucher on their own lines, each with Remove', async () => {
    const { onVoucherRemove } = voucherBox({ voucher: { code: 'SHUBHAM', coins: 5000 } });
    apply('SAVE20');
    await waitFor(() => expect(document.body.textContent).toMatch(/Coupon\s*SAVE20\s*applied/));

    expect(document.body.textContent).toMatch(/Voucher SHUBHAM: 5,000 Jet Coins after your trip/);
    expect(screen.queryByPlaceholderText('Coupon or voucher code')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove voucher SHUBHAM' }));
    expect(onVoucherRemove).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
  });

  it('says why a voucher was refused', async () => {
    const { onVoucherApply } = voucherBox({ checkVoucher: vi.fn(async () => ({ ok: false, code: 'VOUCHER_WRONG_KIND', message: 'Redeem this code in Profile → Jet Wallet.' })) });

    apply('WELCOME50');

    expect(await screen.findByText('Redeem this code in Profile → Jet Wallet.')).toBeTruthy();
    expect(onVoucherApply).not.toHaveBeenCalled();
  });

  it('refuses a second voucher while one is applied', async () => {
    const { checkVoucher } = voucherBox({ voucher: { code: 'SHUBHAM', coins: 5000 } });

    apply('OTHER1');

    expect(await screen.findByText('This booking already has a voucher. Remove it to use a different one.')).toBeTruthy();
    expect(checkVoucher).not.toHaveBeenCalled();
  });
});

describe('the voucher on its way to the payment page and back', () => {
  it('is sent to checkout when there is one', async () => {
    const fetch = vi.fn(async () => json(200, { success: true, checkoutUrl: 'https://arc.test/pay', sessionId: 'S1' }));
    vi.stubGlobal('fetch', fetch);

    await ArcPayService.createHostedCheckout({ amount: 210, orderId: 'FLT1', bookingType: 'flight', voucherCode: 'SHUBHAM' });
    await ArcPayService.createHostedCheckout({ amount: 210, orderId: 'FLT2', bookingType: 'flight' });

    expect(JSON.parse(fetch.mock.calls[0][1].body).voucherCode).toBe('SHUBHAM');
    expect(JSON.parse(fetch.mock.calls[1][1].body)).not.toHaveProperty('voucherCode');
  });

  it('comes back from a cancelled payment page', () => {
    const storage = { getItem: () => JSON.stringify({ selectedFlight: { originalOffer: { id: '1' } }, voucherCode: 'SHUBHAM' }) };
    expect(readCancelledCheckout(storage).voucherCode).toBe('SHUBHAM');
  });
});
```

- [ ] **Step 3: Write the failing review-page test**

Create `tests/components/reviewPageVoucher.test.jsx`:

```jsx
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { airline, offer, renderReviewPage, reviewFlight, segment } from './reviewPageHarness.jsx';

const harness = async (name) => (await import('./reviewPageHarness.jsx')).pageMocks[name];
vi.mock('../../frontend/src/Pages/Common/Navbar', () => harness('navbar'));
vi.mock('../../frontend/src/Pages/Common/Footer', () => harness('footer'));
vi.mock('../../frontend/src/Pages/Common/PageWrapper', () => harness('pageWrapper'));
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => harness('auth'));
vi.mock('../../frontend/src/hooks/queries', () => harness('queries'));
vi.mock('../../frontend/src/hooks/queries/useSavedTravellers', () => harness('savedTravellers'));
vi.mock('../../frontend/src/Context/LocationContext', () => harness('location'));
vi.mock('../../frontend/src/Pages/Common/flights/FlightFareRules', () => harness('nothing'));
vi.mock('../../frontend/src/Pages/Common/flights/FlightCancellationPolicy', () => harness('nothing'));

const checkout = vi.hoisted(() => ({ calls: [], answer: null }));
vi.mock('../../frontend/src/Services/ArcPayService', () => ({
  default: {
    createHostedCheckout: async (request) => {
      checkout.calls.push(request);
      return { success: false, error: checkout.answer };
    },
  },
}));

const { default: FlightBookingConfirmation } = await import('../../frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx');

const fare = offer({ id: '1', itineraries: [{ segments: [segment('DEL', 'BOM', '2026-11-15T08:00:00', '2026-11-15T10:00:00')] }] });
const searchData = { from: 'DEL', to: 'BOM', departDate: '2026-11-15' };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const voucherOk = () => json(200, { success: true, data: { kind: 'trip', code: 'SHUBHAM', coins: 5000 } });
const server = { voucher: voucherOk, voucherRequests: [], couponRequests: [] };

beforeEach(() => {
  sessionStorage.clear();
  localStorage.setItem('userCurrency', 'USD');
  window.scrollTo = vi.fn();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  checkout.calls = [];
  checkout.answer = { error: 'Declined in test.' };
  server.voucher = voucherOk;
  server.voucherRequests = [];
  server.couponRequests = [];
  const flights = airline();
  vi.stubGlobal('fetch', vi.fn((url, init) => {
    const target = String(url);
    if (target.endsWith('/wallet')) {
      return Promise.resolve(json(200, { success: true, data: { balance: 0, balanceUsd: 0, held: 0, entries: [], pending: [] } }));
    }
    if (target.includes('/wallet/voucher-check')) {
      server.voucherRequests.push(JSON.parse(init?.body || '{}'));
      return Promise.resolve(server.voucher());
    }
    if (target.includes('/coupons/validate')) {
      const body = JSON.parse(init?.body || '{}');
      server.couponRequests.push(body);
      return Promise.resolve(body.code === 'SAVE20'
        ? json(200, { success: true, coupon: { id: 'c-1', code: 'SAVE20' }, discountAmount: 20, finalTotal: 190 })
        : json(404, { success: false, message: 'Invalid or expired coupon code.' }));
    }
    return flights(url, init);
  }));
});
afterEach(() => vi.unstubAllGlobals());

async function openPage() {
  renderReviewPage(FlightBookingConfirmation, { state: { flightData: reviewFlight(fare), searchData } });
  fireEvent.change(await screen.findByLabelText(/First Name/), { target: { value: 'Jane' } });
  fireEvent.change(screen.getByLabelText(/Last Name/), { target: { value: 'Doe' } });
  fireEvent.click(screen.getByRole('button', { name: 'Female' }));
  fireEvent.change(screen.getByLabelText(/^Mobile No/), { target: { value: '5550100' } });
}

const typeCode = (code) => {
  fireEvent.change(screen.getByPlaceholderText('Coupon or voucher code'), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
};
const page = () => document.body.textContent;
const payButton = async (amount) => (await screen.findAllByRole('button', { name: new RegExp(`^Pay US\\$${amount.replace('.', '\\.')}`) }))[0];

describe('a trip-reward voucher on the review page', () => {
  it('takes a voucher in the coupon box, shows it, and sends it to checkout at the same price', async () => {
    await openPage();
    typeCode('shubham');

    await waitFor(() => expect(page()).toMatch(/Voucher SHUBHAM: 5,000 Jet Coins after your trip/));
    expect(page()).toMatch(/You'll get 5,000 Jet Coins after your trip/);
    expect(server.couponRequests[0]).toMatchObject({ code: 'SHUBHAM', bookingType: 'flights' });
    expect(server.voucherRequests).toEqual([{ code: 'SHUBHAM' }]);

    fireEvent.click(await payButton('210.00'));
    await waitFor(() => expect(checkout.calls).toHaveLength(1));
    expect(checkout.calls[0]).toMatchObject({ amount: 210, voucherCode: 'SHUBHAM' });
    expect(checkout.calls[0].couponCode).toBeUndefined();
  });

  it('says why a voucher was refused, and sends none to checkout', async () => {
    server.voucher = () => json(409, { success: false, code: 'VOUCHER_FIRST_TIME_ONLY', error: 'This voucher is for first-time customers only.' });
    await openPage();
    typeCode('SHUBHAM');

    expect(await screen.findByText('This voucher is for first-time customers only.')).toBeTruthy();
    fireEvent.click(await payButton('210.00'));
    await waitFor(() => expect(checkout.calls).toHaveLength(1));
    expect(checkout.calls[0].voucherCode).toBeUndefined();
  });

  it('takes the voucher off when checkout refuses it, and says why', async () => {
    checkout.answer = { code: 'VOUCHER_USED_UP', error: 'This voucher has been fully used.' };
    await openPage();
    typeCode('SHUBHAM');
    await waitFor(() => expect(page()).toMatch(/Voucher SHUBHAM: 5,000 Jet Coins after your trip/));

    fireEvent.click(await payButton('210.00'));

    await waitFor(() => expect(page()).toMatch(/This voucher has been fully used\. The voucher has been removed\. Nothing has been charged\./));
    expect(page()).not.toMatch(/Voucher SHUBHAM: 5,000/);
  });

  it('keeps a coupon and a voucher on one booking, each on its own line, the price taking only the coupon', async () => {
    await openPage();
    typeCode('SAVE20');
    await payButton('190.00');
    typeCode('SHUBHAM');

    await waitFor(() => expect(page()).toMatch(/Voucher SHUBHAM: 5,000 Jet Coins after your trip/));
    expect(page()).toMatch(/Coupon\s*SAVE20\s*applied/);
    expect(screen.getAllByRole('button', { name: /^Pay US\$190\.00/ }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Remove voucher SHUBHAM' }));

    expect(page()).not.toMatch(/Voucher SHUBHAM: 5,000/);
    expect(page()).toMatch(/Coupon\s*SAVE20\s*applied/);
  });

  it('puts a voucher back after a cancelled payment, once it has been checked again', async () => {
    sessionStorage.setItem('pendingFlightBooking', JSON.stringify({
      selectedFlight: reviewFlight(fare),
      searchData,
      passengerData: [{ id: 1, type: 'ADULT', firstName: 'Jane', lastName: 'Doe', gender: 'female', mobile: '5550100', countryCode: '+1' }],
      bookingDetails: { contact: { email: 'traveller@example.com', phone: '5550100', countryCode: '1' } },
      amount: 210,
      voucherCode: 'SHUBHAM',
    }));

    renderReviewPage(FlightBookingConfirmation, { search: '?payment=cancelled' });

    await waitFor(() => expect(page()).toMatch(/Voucher SHUBHAM: 5,000 Jet Coins after your trip/));
    expect(server.voucherRequests).toEqual([{ code: 'SHUBHAM' }]);
  });
});
```

- [ ] **Step 4: Point the four flight-page tests at the new placeholder**

Run:

```bash
sed -i "s/'Enter coupon code'/'Coupon or voucher code'/g" tests/components/cancelledPaymentCoupon.test.jsx tests/components/couponRemovedByCheckout.test.jsx tests/components/reviewPageCoinsCheckout.test.jsx tests/components/priceChangedWithCoupon.test.jsx
grep -c "Coupon or voucher code" tests/components/cancelledPaymentCoupon.test.jsx tests/components/couponRemovedByCheckout.test.jsx tests/components/reviewPageCoinsCheckout.test.jsx tests/components/priceChangedWithCoupon.test.jsx
```

Expected counts: 1, 3, 1, 1. (`tests/components/couponInputStrictMode.test.jsx` renders the plain box and keeps `Enter coupon code`.)

- [ ] **Step 5: Run them to see them fail**

Run: `npx vitest run --project frontend tests/utils/tripVoucher.test.js tests/components/couponInputVoucher.test.jsx tests/components/reviewPageVoucher.test.jsx`
Expected: FAIL (`frontend/src/utils/tripVoucher.js` does not exist; no `Coupon or voucher code` placeholder).

- [ ] **Step 6: Add the browser util**

Create `frontend/src/utils/tripVoucher.js`:

```js
import { apiPost } from './apiHelper';

const UNAVAILABLE = 'The voucher could not be checked just now. Please try again.';

/** The trip-reward voucher for this code, or why not, in words for the customer. */
export async function checkTripVoucher(code) {
  let response;
  try {
    response = await apiPost('wallet/voucher-check', { code: String(code ?? '').trim().toUpperCase() });
  } catch {
    return { ok: false, code: 'WALLET_UNAVAILABLE', message: UNAVAILABLE };
  }
  if (response.status === 401) return { ok: false, code: 'LOGIN_REQUIRED', message: 'Please log in to use a voucher.' };
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (response.ok && body?.success && body.data?.kind === 'trip') {
    return { ok: true, voucher: { code: String(body.data.code), coins: Math.floor(Number(body.data.coins) || 0) } };
  }
  const worded = typeof body?.error === 'string'
    && (String(body.code).startsWith('VOUCHER_') || body.code === 'RATE_LIMITED' || body.code === 'WALLET_UNAVAILABLE');
  return { ok: false, code: body?.code || null, message: worded ? body.error : UNAVAILABLE };
}
```

- [ ] **Step 7: Replace the coupon box**

Replace the whole of `frontend/src/components/CouponInput.jsx` with:

```jsx
import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import Price from '../Components/Price';

/**
 * CouponInput - A reusable coupon input component
 * Props:
 *   orderTotal (number) - the current order total
 *   bookingType (string) - 'flights', 'hotels', 'cruises', 'packages', 'all'
 *   onApply (fn) - callback({ couponId, code, discountAmount, finalTotal })
 *   onRemove (fn) - callback when coupon is removed
 *   formatAmount (fn, optional) - renders an amount. Defaults to <Price>, the
 *     visitor's display currency; the flight review page passes US dollars,
 *     the currency its card is charged in.
 *   initialCode (string, optional) - a code to apply on mount, exactly as if it
 *     had been typed and Apply pressed. The flight review page passes the one
 *     the customer had applied before cancelling on the payment page.
 *   onRefused (fn, optional) - callback(message) when a code is not accepted.
 *   checkVoucher (fn, optional) - the flight review page's trip-voucher check,
 *     (code) => Promise<{ ok, voucher } | { ok: false, message }>. Given, the
 *     box takes coupons and vouchers: a code that is not a coupon is tried as
 *     a voucher. Every other page leaves it out and keeps the plain box.
 *   voucher ({ code, coins } | null, optional) - the voucher the page holds.
 *   onVoucherApply (fn, optional) - callback({ code, coins }).
 *   onVoucherRemove (fn, optional) - callback when the voucher is removed.
 */
const coinsText = (coins) => new Intl.NumberFormat('en-US').format(Math.floor(Number(coins) || 0));

const CouponInput = ({
    orderTotal, bookingType = 'all', onApply, onRemove, onRefused, formatAmount, initialCode = '',
    checkVoucher, voucher = null, onVoucherApply, onVoucherRemove,
}) => {
    const acceptsVouchers = typeof checkVoucher === 'function';
    const showAmount = (amount) => (formatAmount ? formatAmount(amount) : <Price amount={amount} />);
    const [code, setCode] = useState(() => String(initialCode || '').toUpperCase());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [applied, setApplied] = useState(null);
    const { user, loading: authLoading } = useSupabaseAuth();
    // An answer that arrives after this box was replaced - the page remounts it
    // when the total changes - is for a total no longer on the page, and is
    // dropped: applied, it set a discount worked out on the old total. Set back
    // to true on every mount: in development StrictMode mounts, unmounts and
    // mounts again, and a ref only ever set to false dropped every answer.
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    const getApiBase = () => {
        if (import.meta.env.PROD && import.meta.env.VITE_API_BASE_URL) {
            return `${import.meta.env.VITE_API_BASE_URL}/api/coupons`;
        }
        return '/api/coupons';
    };

    const refuse = (message) => {
        setError(message);
        onRefused && onRefused(message);
    };

    const applyVoucher = async (typed) => {
        if (voucher) {
            setError('This booking already has a voucher. Remove it to use a different one.');
            return;
        }
        const result = await checkVoucher(typed);
        if (!mounted.current) return;
        if (!result?.ok) {
            refuse(result?.message || 'The voucher could not be checked just now. Please try again.');
            return;
        }
        setCode('');
        onVoucherApply && onVoucherApply(result.voucher);
    };

    const handleApply = async () => {
        const typed = code.trim();
        if (!typed) {
            setError(acceptsVouchers ? 'Please enter a coupon or voucher code.' : 'Please enter a coupon code.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const resp = await axios.post(`${getApiBase()}/validate`, {
                code: typed,
                orderTotal,
                bookingType,
                userId: user?.id
            });
            if (!mounted.current) return;

            if (resp.data.success) {
                if (applied) {
                    setError('This booking already has a coupon. Remove it to use a different one.');
                    return;
                }
                const result = resp.data;
                setApplied(result);
                if (acceptsVouchers) setCode('');
                onApply && onApply({
                    couponId: result.coupon.id,
                    code: result.coupon.code,
                    discountAmount: result.discountAmount,
                    finalTotal: result.finalTotal
                });
            } else {
                refuse(resp.data.message || 'Invalid coupon.');
            }
        } catch (err) {
            if (!mounted.current) return;
            if (acceptsVouchers && err.response?.status === 404) {
                await applyVoucher(typed);
                return;
            }
            refuse(err.response?.data?.message || 'Failed to validate coupon.');
        } finally {
            if (mounted.current) setLoading(false);
        }
    };

    // The code given to start with is checked the way Apply checks it - it may
    // have expired or been used up since - once, as soon as the signed-in
    // account is known (the check counts that account's own uses).
    const restoring = useRef(Boolean(initialCode));
    useEffect(() => {
        if (!restoring.current || authLoading) return;
        restoring.current = false;
        handleApply();
    }, [authLoading]);

    const handleRemove = () => {
        setApplied(null);
        setCode('');
        setError(null);
        onRemove && onRemove();
    };

    const appliedBlock = applied && (
        <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-xl">
            <div>
                <p className="text-sm font-bold text-green-800">
                    🎉 Coupon <span className="font-mono">{applied.coupon.code}</span> applied!
                </p>
                <p className="text-xs text-green-600 mt-0.5">
                    {/* In the same form as every other figure in the fare
                        summary; a bare "$" disagreed with the total beside it. */}
                    You save <span className="font-semibold">{showAmount(applied.discountAmount)}</span>. New total: <span className="font-semibold">{showAmount(applied.finalTotal)}</span>
                </p>
            </div>
            <button
                onClick={handleRemove}
                className="text-xs text-red-600 hover:text-red-800 font-semibold ml-4 underline"
            >
                Remove
            </button>
        </div>
    );

    if (!acceptsVouchers && appliedBlock) return appliedBlock;

    const inputBlock = (
        <div>
            <div className="flex gap-2">
                <input
                    type="text"
                    value={code}
                    onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleApply()}
                    placeholder={acceptsVouchers ? 'Coupon or voucher code' : 'Enter coupon code'}
                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0890BC] focus:border-[#0890BC] uppercase"
                />
                <button
                    onClick={handleApply}
                    disabled={loading}
                    className="px-5 py-2.5 bg-[#055B75] text-white text-sm font-semibold rounded-lg hover:bg-[#034457] transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                    {loading ? '...' : 'Apply'}
                </button>
            </div>
            {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
        </div>
    );

    if (!acceptsVouchers) return inputBlock;

    return (
        <div className="space-y-2">
            {appliedBlock}
            {voucher && (
                <div className="flex items-center justify-between p-3 bg-[#F1FBFD] border border-[#65B3CF] rounded-xl">
                    <p className="text-sm font-bold text-[#034457]">
                        Voucher <span className="font-mono">{voucher.code}</span>: {coinsText(voucher.coins)} Jet Coins after your trip
                    </p>
                    <button
                        type="button"
                        aria-label={`Remove voucher ${voucher.code}`}
                        onClick={() => { setError(null); onVoucherRemove && onVoucherRemove(); }}
                        className="text-xs text-red-600 hover:text-red-800 font-semibold ml-4 underline"
                    >
                        Remove
                    </button>
                </div>
            )}
            {!(applied && voucher) && inputBlock}
        </div>
    );
};

export default CouponInput;
```

- [ ] **Step 8: Wire the review page**

In `frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx`:

(1) Replace:

```js
import CouponInput from '../../../components/CouponInput';
```

with:

```js
import CouponInput from '../../../components/CouponInput';
import { checkTripVoucher } from '../../../utils/tripVoucher';
```

and replace:

```js
import { maxWalletCoinsFor } from '../../../../../shared/jetCoins';
```

with:

```js
import { formatCoins, maxWalletCoinsFor } from '../../../../../shared/jetCoins';
```

(2) Replace:

```js
  const [couponToRestore, setCouponToRestore] = useState(() => cancelledCheckout?.couponCode ?? null);
```

with:

```js
  const [couponToRestore, setCouponToRestore] = useState(() => cancelledCheckout?.couponCode ?? null);
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  const voucherToRestore = React.useRef(cancelledCheckout?.voucherCode ?? null);
  const pageMounted = React.useRef(true);
  useEffect(() => {
    pageMounted.current = true;
    return () => { pageMounted.current = false; };
  }, []);
```

(3) Replace:

```js
    setWallet({ balance: 0, held: 0 });
    setUseCoins(false);
  }, [signedInUserId, loadWallet]);
```

with:

```js
    setWallet({ balance: 0, held: 0 });
    setUseCoins(false);
    setAppliedVoucher(null);
  }, [signedInUserId, loadWallet]);
  // Back from a cancelled payment: the voucher is checked again before it is
  // put back, as the coupon is - it may have been used up meanwhile.
  useEffect(() => {
    const code = voucherToRestore.current;
    if (!code || authLoading || !signedInUserId) return;
    voucherToRestore.current = null;
    checkTripVoucher(code).then((result) => {
      if (!pageMounted.current) return;
      if (result.ok) setAppliedVoucher(result.voucher);
      else setCouponProblem(`Voucher ${code} was not applied: ${result.message}`);
    });
  }, [authLoading, signedInUserId]);
```

(4) Replace:

```js
        couponCode: appliedCoupon?.code || null,
        flightData: flightDataForArcPay,
```

with:

```js
        couponCode: appliedCoupon?.code || null,
        voucherCode: appliedVoucher?.code || null,
        flightData: flightDataForArcPay,
```

(5) Replace:

```js
        walletCoins: coinsToUse || undefined,
```

with:

```js
        walletCoins: coinsToUse || undefined,
        voucherCode: appliedVoucher?.code || undefined,
```

(6) Replace:

```js
      if (refusal.code === 'COUPON_INVALID') {
        dropCoupon();
        setFareNotice(`${refusal.error} The coupon has been removed, so please check the total. Nothing has been charged.`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
```

with:

```js
      if (refusal.code === 'COUPON_INVALID') {
        dropCoupon();
        setFareNotice(`${refusal.error} The coupon has been removed, so please check the total. Nothing has been charged.`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (refusal.code === 'VOUCHER_UNAVAILABLE') {
        setCouponProblem(refusal.error);
        return;
      }
      if (String(refusal.code || '').startsWith('VOUCHER_')) {
        setAppliedVoucher(null);
        setFareNotice(`${refusal.error} The voucher has been removed. Nothing has been charged.`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
```

(7) Replace:

```jsx
                {/* Coupon Input */}
                <div className="mt-4 mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Have a coupon?</p>
```

with:

```jsx
                {appliedVoucher && (
                  <div className="flex items-start gap-3 py-3 border-b border-gray-100" data-trip-reward="">
                    <PlusCircle className="h-5 w-5 text-[#0890BC] mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-gray-800">Voucher {appliedVoucher.code}</div>
                      <div className="text-xs text-gray-500 mt-0.5">You'll get {formatCoins(appliedVoucher.coins)} Jet Coins after your trip</div>
                    </div>
                  </div>
                )}

                {/* Coupon Input */}
                <div className="mt-4 mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Have a coupon or voucher?</p>
```

(8) Replace:

```jsx
                    onRemove={() => { couponBase.current = null; setAppliedCoupon(null); setCouponToRestore(null); }}
                  />
```

with:

```jsx
                    onRemove={() => { couponBase.current = null; setAppliedCoupon(null); setCouponToRestore(null); }}
                    checkVoucher={checkTripVoucher}
                    voucher={appliedVoucher}
                    onVoucherApply={(voucher) => { setCouponProblem(null); setAppliedVoucher(voucher); }}
                    onVoucherRemove={() => setAppliedVoucher(null)}
                  />
```

- [ ] **Step 9: Send the code to checkout and bring it back**

In `frontend/src/Services/ArcPayService.js`, replace:

```js
                walletCoins: checkoutData.walletCoins || undefined,
```

with:

```js
                walletCoins: checkoutData.walletCoins || undefined,
                voucherCode: checkoutData.voucherCode || undefined,
```

In `frontend/src/utils/cancelledCheckout.js`, replace:

```js
 * @returns {{ reviewState: { flightData: object, searchData: object|null, attemptId: string|null }, travellers: object[], contact: object|null, couponCode?: string }|null}
```

with:

```js
 * @returns {{ reviewState: { flightData: object, searchData: object|null, attemptId: string|null }, travellers: object[], contact: object|null, couponCode?: string, voucherCode?: string }|null}
```

and replace:

```js
      ...(saved.couponCode ? { couponCode: String(saved.couponCode) } : {}),
```

with:

```js
      ...(saved.couponCode ? { couponCode: String(saved.couponCode) } : {}),
      ...(saved.voucherCode ? { voucherCode: String(saved.voucherCode) } : {}),
```

- [ ] **Step 10: Run the page suites**

Run: `npx vitest run --project frontend tests/utils/tripVoucher.test.js tests/components/couponInputVoucher.test.jsx tests/components/reviewPageVoucher.test.jsx tests/components/cancelledPaymentCoupon.test.jsx tests/components/couponRemovedByCheckout.test.jsx tests/components/reviewPageCoinsCheckout.test.jsx tests/components/priceChangedWithCoupon.test.jsx tests/components/couponInputStrictMode.test.jsx tests/components/reviewPageCoins.test.jsx tests/components/reviewPageFlow.test.jsx`
Expected: PASS.

- [ ] **Step 11: Run CI's unit command**

Run: `AMADEUS_WS_ENDPOINT= AMADEUS_WS_USERNAME= AMADEUS_WS_PASSWORD= AMADEUS_WS_OFFICE_ID= VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run test:unit`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/utils/tripVoucher.js frontend/src/components/CouponInput.jsx frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx frontend/src/Services/ArcPayService.js frontend/src/utils/cancelledCheckout.js tests/utils/tripVoucher.test.js tests/components/couponInputVoucher.test.jsx tests/components/reviewPageVoucher.test.jsx tests/components/cancelledPaymentCoupon.test.jsx tests/components/couponRemovedByCheckout.test.jsx tests/components/reviewPageCoinsCheckout.test.jsx tests/components/priceChangedWithCoupon.test.jsx
git commit -F - <<'EOF'
feat(flights): one box for coupons and trip-reward vouchers

The flight review page's box takes "Coupon or voucher code": Apply tries
the coupon first, then the trip voucher. An applied voucher shows "Voucher
SHUBHAM: 5,000 Jet Coins after your trip" on its own line with Remove, the
summary says the coins come after the trip, and the price is unchanged.
The code goes to checkout as voucherCode, a refusal takes it off with the
reason, and it comes back after a cancelled payment once checked again.
Cruise, hotel and package pages keep the plain coupon box.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CnRin1ZGh44yizpdTBakw6
EOF
```

---

### Task 7: Wallet panel, admin page, receipt line and desk wording

**Files:**
- Modify: `frontend/src/Pages/Common/login/JetWalletPanel.jsx` (whole file replaced)
- Modify: `frontend/src/Pages/Admin/VoucherManagement.jsx` (whole file replaced)
- Modify: `frontend/src/utils/bookingCharge.js`
- Modify: `frontend/src/Pages/Common/BookingConfirmation.jsx`
- Modify: `frontend/src/Pages/Common/flights/FlightCreateOrders.jsx`
- Modify: `frontend/src/Pages/Support/SupportQueue.jsx`
- Test: `tests/components/jetWalletPanelRewards.test.jsx` (create), `tests/components/tripRewardReceipt.test.jsx` (create), `tests/utils/tripReward.test.js` (create), `tests/components/voucherManagement.test.jsx` (append + one expectation), `tests/components/supportQueueJetCoins.test.jsx` (append)

**Interfaces:**
- Consumes (Task 2): wallet summary `pending: [{ bookingReference, code, coins, dueAt }]`; wallet entries with `kind: 'voucher'` and `booking_reference` for a payout; voucher rows with `kind`, `first_time_only`; redemption rows with `status`, `bookingReference`, `dueAt`, `paidAt`; redeem refusal `VOUCHER_WRONG_KIND`. (Task 4): order answer and client booking `tripReward: { code, coins, dueAt? }`; `wallet_issue.kind === 'voucher_refused'` with `code`, `reason`.
- Produces: `tripRewardOf(booking) → { code, coins } | null` and `tripRewardLine(booking) → string | null` (`Voucher SHUBHAM: 5,000 Jet Coins after your trip`) in `frontend/src/utils/bookingCharge.js`; `completedFlightBooking.tripReward` handed to `/booking-confirmation`.

- [ ] **Step 1: Write the failing panel test**

Create `tests/components/jetWalletPanelRewards.test.jsx`:

```jsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock('../../frontend/src/utils/apiHelper', () => ({ apiGet: (...a) => apiGet(...a), apiPost: (...a) => apiPost(...a) }));

import JetWalletPanel from '../../frontend/src/Pages/Common/login/JetWalletPanel.jsx';

const answer = (body, ok = true) => ({ ok, json: async () => body });
const wallet = (data) => answer({ success: true, data: { balance: 0, balanceUsd: 0, held: 0, entries: [], pending: [], ...data } });

describe('trip rewards in the Jet Wallet tab', () => {
  beforeEach(() => { apiGet.mockReset(); apiPost.mockReset(); });

  it('lists the rewards still to come, with when they arrive', async () => {
    apiGet.mockResolvedValue(wallet({ pending: [{ bookingReference: 'FLT1', code: 'SHUBHAM', coins: 5000, dueAt: '2026-11-05T00:00:00.000Z' }] }));
    render(<JetWalletPanel />);

    expect(await screen.findByText('Coming after your trip')).toBeTruthy();
    expect(screen.getByText('5,000 coins arrive after your trip FLT1, due 5 Nov')).toBeTruthy();
    expect(screen.getByText('Voucher SHUBHAM')).toBeTruthy();
  });

  it('gives no date for a reward whose payout date is not known yet', async () => {
    apiGet.mockResolvedValue(wallet({ pending: [{ bookingReference: 'FLT2', code: 'SHUBHAM', coins: 5000, dueAt: null }] }));
    render(<JetWalletPanel />);
    expect(await screen.findByText('5,000 coins arrive after your trip FLT2')).toBeTruthy();
  });

  it('shows nothing to come when nothing is coming', async () => {
    apiGet.mockResolvedValue(wallet({ balance: 100 }));
    render(<JetWalletPanel />);
    await screen.findByText('100');
    expect(screen.queryByText('Coming after your trip')).toBeNull();
  });

  it('words a trip payout in the history with its trip', async () => {
    apiGet.mockResolvedValue(wallet({ balance: 5000, entries: [
      { id: 9, kind: 'voucher', coins: 5000, note: 'SHUBHAM', booking_reference: 'FLT1', created_at: '2026-11-18T00:15:00Z' },
      { id: 8, kind: 'voucher', coins: 1000, note: 'WELCOME', booking_reference: null, created_at: '2026-11-01T10:00:00Z' },
    ] }));
    render(<JetWalletPanel />);
    expect(await screen.findByText('Voucher SHUBHAM: trip FLT1')).toBeTruthy();
    expect(screen.getByText('Voucher WELCOME')).toBeTruthy();
  });

  it('points a trip voucher typed here to checkout', async () => {
    apiGet.mockResolvedValue(wallet({}));
    apiPost.mockResolvedValue(answer({ success: false, code: 'VOUCHER_WRONG_KIND', error: 'Use this code at checkout when you book a flight.' }, false));
    render(<JetWalletPanel />);
    fireEvent.change(await screen.findByLabelText('Voucher code'), { target: { value: 'SHUBHAM' } });
    fireEvent.click(screen.getByRole('button', { name: 'Redeem' }));
    expect(await screen.findByText('Use this code at checkout when you book a flight.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Write the failing receipt tests**

Create `tests/utils/tripReward.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { tripRewardLine, tripRewardOf } from '../../frontend/src/utils/bookingCharge.js';

describe('the trip reward on a receipt', () => {
  it('reads the reward a booking carries', () => {
    expect(tripRewardOf({ tripReward: { code: 'SHUBHAM', coins: 5000, dueAt: '2026-11-18T00:00:00.000Z' } })).toEqual({ code: 'SHUBHAM', coins: 5000 });
  });

  it('words it as coins after the trip, not money off', () => {
    expect(tripRewardLine({ tripReward: { code: 'SHUBHAM', coins: 5000 } })).toBe('Voucher SHUBHAM: 5,000 Jet Coins after your trip');
  });

  it('has nothing to say without one', () => {
    expect(tripRewardLine({})).toBeNull();
    expect(tripRewardLine({ tripReward: null })).toBeNull();
    expect(tripRewardLine({ tripReward: { code: 'SHUBHAM', coins: 0 } })).toBeNull();
    expect(tripRewardOf(null)).toBeNull();
  });
});
```

Create `tests/components/tripRewardReceipt.test.jsx`:

```jsx
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/PageWrapper', () => ({ default: (Page) => Page }));
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ user: null }) }));

const { default: BookingConfirmation } = await import('../../frontend/src/Pages/Common/BookingConfirmation.jsx');
const { default: FlightCreateOrders } = await import('../../frontend/src/Pages/Common/flights/FlightCreateOrders.jsx');

afterEach(() => vi.unstubAllGlobals());

const booked = (over = {}) => ({
  type: 'flight', bookingReference: 'FLT1', status: 'confirmed', pnr: 'ABC123', payment_status: 'paid', amount: 122.2,
  origin: 'JFK', destination: 'LHR', departureDate: '2099-01-15', tickets: [], gds: { ticketed: true }, source: 'database',
  chargeBreakdown: { fare: 120, serviceFee: 2.2, discount: 0, total: 122.2, currency: 'USD' },
  ...over,
});
const confirmationText = (bookingData) => render(
  <MemoryRouter initialEntries={[{ pathname: '/booking-confirmation', state: { bookingData } }]}>
    <BookingConfirmation />
  </MemoryRouter>,
).container.textContent;

describe('the booking confirmation with a trip-reward voucher', () => {
  it('says the coins come after the trip, and takes nothing off the price', () => {
    const text = confirmationText(booked({ tripReward: { code: 'SHUBHAM', coins: 5000 } }));
    expect(text).toMatch(/Voucher SHUBHAM: 5,000 Jet Coins after your trip/);
    expect(text).toMatch(/USD 122\.20/);
    expect(text).not.toMatch(/- \$50\.00/);
  });

  it('says nothing about a voucher the booking does not carry', () => {
    expect(confirmationText(booked())).not.toMatch(/after your trip/);
  });
});

describe('the order page', () => {
  const offer = {
    itineraries: [{ segments: [{ id: '1', departure: { iataCode: 'JFK', at: '2026-11-15T19:25:00' }, arrival: { iataCode: 'LHR', at: '2026-11-16T06:10:00' }, carrierCode: 'FI', number: '614' }] }],
    price: { total: '291.00', currency: 'USD' },
    travelerPricings: [{ travelerType: 'ADULT' }],
  };
  const orderData = {
    orderId: 'FLT1',
    transactionId: 'SI-1',
    amount: 291,
    originalOffer: offer,
    selectedFlight: { originalOffer: offer, itineraries: offer.itineraries },
    passengerData: [{ firstName: 'Jane', lastName: 'Doe', gender: 'FEMALE', dateOfBirth: '1990-01-01', email: 'jane@example.com', type: 'ADULT' }],
    bookingDetails: { contact: { email: 'jane@example.com' }, isInternational: true },
  };
  const reply = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null), forEach: (fn) => fn('application/json', 'content-type') },
    text: async () => JSON.stringify(body),
  });

  it('hands the reward the server reserved to the confirmation page', async () => {
    const tripReward = { code: 'SHUBHAM', coins: 5000, dueAt: '2026-11-18T00:00:00.000Z' };
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, { success: true, pnr: 'ABC123', bookingReference: 'FLT1', ticketed: true, tripReward })));
    const seen = { state: null };
    const Probe = () => { seen.state = useLocation().state; return null; };

    render(
      <MemoryRouter initialEntries={[{ pathname: '/flight-create-orders', state: orderData }]}>
        <Routes>
          <Route path="/flight-create-orders" element={<FlightCreateOrders />} />
          <Route path="/booking-confirmation" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(seen.state?.bookingData?.tripReward).toEqual(tripReward), { timeout: 5000 });
  });
});
```

- [ ] **Step 3: Append the failing admin and desk tests**

In `tests/components/voucherManagement.test.jsx`, replace:

```js
    expect(JSON.parse(adminFetch.mock.calls[1][1].body)).toEqual({
      code: 'SHUBHAM', valueUsd: 75.5, maxRedemptions: '', validFrom: '', validUntil: '2027-01-31', note: 'launch',
    });
```

with:

```js
    expect(JSON.parse(adminFetch.mock.calls[1][1].body)).toEqual({
      code: 'SHUBHAM', valueUsd: 75.5, maxRedemptions: '', validFrom: '', validUntil: '2027-01-31', note: 'launch',
      kind: 'instant', firstTimeOnly: false,
    });
```

and append:

```js
describe('voucher kinds on the admin page', () => {
  beforeEach(() => adminFetch.mockReset());

  it('shows each voucher kind, and first-time only', async () => {
    adminFetch.mockResolvedValue(answer({ success: true, data: [
      { id: 'v1', code: 'SHUBHAM', coins: 5000, redemptions_count: 0, max_redemptions: null, is_active: true, kind: 'trip', first_time_only: true },
      { id: 'v2', code: 'WELCOME', coins: 1000, redemptions_count: 0, max_redemptions: null, is_active: true, kind: 'instant', first_time_only: false },
    ] }));
    render(<VoucherManagement />);
    expect(await screen.findByText('Trip reward · first-time only')).toBeTruthy();
    expect(screen.getByText('Instant')).toBeTruthy();
  });

  it('creates a trip reward for first-time customers', async () => {
    adminFetch.mockResolvedValueOnce(answer({ success: true, data: [] }))
      .mockResolvedValueOnce(answer({ success: true, data: { id: 'v3', code: 'SHUBHAM' } }, 201))
      .mockResolvedValueOnce(answer({ success: true, data: [] }));
    render(<VoucherManagement />);
    fireEvent.click(await screen.findByRole('button', { name: 'New voucher' }));
    expect(screen.queryByLabelText('First-time customers only')).toBeNull();
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'shubham' } });
    fireEvent.change(screen.getByLabelText('Value (USD)'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'trip' } });
    fireEvent.click(screen.getByLabelText('First-time customers only'));
    fireEvent.click(screen.getByRole('button', { name: 'Create voucher' }));
    await waitFor(() => expect(adminFetch.mock.calls[1][1].method).toBe('POST'));
    expect(JSON.parse(adminFetch.mock.calls[1][1].body)).toMatchObject({ code: 'SHUBHAM', valueUsd: 50, kind: 'trip', firstTimeOnly: true });
  });

  it('locks the kind once customers have used the voucher', async () => {
    adminFetch.mockResolvedValue(answer({ success: true, data: [
      { id: 'v1', code: 'SHUBHAM', coins: 5000, redemptions_count: 2, max_redemptions: null, is_active: true, kind: 'trip' },
    ] }));
    render(<VoucherManagement />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit SHUBHAM' }));
    expect(screen.getByLabelText('Kind').disabled).toBe(true);
    expect(screen.getByLabelText('Kind').value).toBe('trip');
  });

  it('shows each trip reward with its status, booking and payout date', async () => {
    const voucher = { id: 'v1', code: 'SHUBHAM', coins: 5000, redemptions_count: 1, max_redemptions: null, is_active: true, kind: 'trip' };
    adminFetch.mockResolvedValueOnce(answer({ success: true, data: [voucher] }))
      .mockResolvedValueOnce(answer({ success: true, data: [
        { id: 'r1', coins: 5000, createdAt: '2026-10-13T10:00:00.000Z', userId: 'u1', email: 'ada@example.com', status: 'pending', bookingReference: 'FLT1', dueAt: '2026-11-18T00:00:00.000Z', paidAt: null },
        { id: 'r2', coins: 5000, createdAt: '2026-10-12T10:00:00.000Z', userId: 'u2', email: 'bo@example.com', status: 'void', bookingReference: 'FLT2', dueAt: '2026-11-10T00:00:00.000Z', paidAt: null },
        { id: 'r3', coins: 5000, createdAt: '2026-10-11T10:00:00.000Z', userId: 'u3', email: 'cy@example.com', status: 'pending', bookingReference: 'FLT3', dueAt: null, paidAt: null },
      ] }));
    render(<VoucherManagement />);
    fireEvent.click(await screen.findByRole('button', { name: 'Who used SHUBHAM' }));
    expect(await screen.findByText('5,000 coins · Pending · FLT1 · due 2026-11-18')).toBeTruthy();
    expect(screen.getByText('5,000 coins · Void · FLT2')).toBeTruthy();
    expect(screen.getByText('5,000 coins · Pending · FLT3 · no payout date')).toBeTruthy();
  });
});
```

Append to `tests/components/supportQueueJetCoins.test.jsx`:

```js
describe('a trip-reward voucher the booking could not reserve', () => {
  it('says so in words, not as a Jet Coins check', async () => {
    vi.stubGlobal('fetch', deskServing([booking({
      walletCoins: 0, walletCoinsOffer: 0,
      walletIssue: { kind: 'voucher_refused', code: 'SHUBHAM', reason: 'VOUCHER_USED_UP', at: '2026-10-13T10:00:00Z' },
    })]));
    const { container } = renderQueue();

    await waitFor(() => expect(container.textContent).toMatch(/FLTCOIN1/));
    expect(container.textContent).toMatch(/Voucher SHUBHAM was not reserved \(VOUCHER_USED_UP\): no trip reward will be paid for this booking/);
    expect(container.textContent).not.toMatch(/Jet Coins: need a check/);
  });
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `npx vitest run --project frontend tests/components/jetWalletPanelRewards.test.jsx tests/components/tripRewardReceipt.test.jsx tests/utils/tripReward.test.js tests/components/voucherManagement.test.jsx tests/components/supportQueueJetCoins.test.jsx`
Expected: FAIL (no "Coming after your trip"; `tripRewardOf` not exported; no Kind field; no voucher wording on the desk).

- [ ] **Step 5: Replace the wallet panel**

Replace the whole of `frontend/src/Pages/Common/login/JetWalletPanel.jsx` with:

```jsx
import React, { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../../utils/apiHelper';
import { coinsToUsd, formatCoins } from '../../../../../shared/jetCoins.js';

const usd = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const DESCRIBE = {
  voucher: (entry) => {
    const named = `Voucher ${entry.note || ''}`.trim();
    return entry.booking_reference ? `${named}: trip ${entry.booking_reference}` : named;
  },
  earn: (entry) => `Earned on booking ${entry.booking_reference}`,
  earn_reversal: (entry) => `Earned coins taken back, booking ${entry.booking_reference} refunded`,
  hold: (entry) => `Used on booking ${entry.booking_reference}`,
  release: (entry) => `Returned, payment not completed for ${entry.booking_reference}`,
  return: (entry) => `Returned from booking ${entry.booking_reference}`,
};

// A server `error` is the customer's to read only when the wallet routes worded it; `protect` and unexpected failures put raw text there (e.g. "jwt expired").
const isCustomerMessage = (body) => typeof body?.error === 'string'
  && (String(body.code).startsWith('VOUCHER_') || body.code === 'RATE_LIMITED' || body.code === 'WALLET_UNAVAILABLE');

const describeEntry = (entry) => (DESCRIBE[entry.kind] || (() => 'Wallet activity'))(entry);

const dueDay = (iso) => {
  const time = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(time) ? new Date(time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
};

const pendingLine = (reward) => {
  const due = dueDay(reward.dueAt);
  return `${formatCoins(reward.coins)} coins arrive after your trip ${reward.bookingReference}${due ? `, due ${due}` : ''}`;
};

export default function JetWalletPanel() {
  const [wallet, setWallet] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    try {
      const response = await apiGet('wallet');
      const body = await response.json();
      if (!response.ok || !body?.success) throw new Error(body?.error || 'unavailable');
      setWallet(body.data);
      setLoadError(null);
    } catch {
      setLoadError('Your Jet Wallet could not be loaded just now. Please try again.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const redeem = async (event) => {
    event.preventDefault();
    const cleaned = code.trim().toUpperCase();
    if (!cleaned || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await apiPost('wallet/redeem', { code: cleaned });
      if (response.status === 401) {
        setNotice({ tone: 'error', text: 'Please sign in again to redeem a voucher.' });
        return;
      }
      const body = await response.json();
      if (!response.ok || !body?.success) {
        setNotice({ tone: 'error', text: isCustomerMessage(body) ? body.error : 'The voucher could not be redeemed.' });
      } else {
        setNotice({ tone: 'success', text: `${formatCoins(body.data.coins)} Jet Coins added to your wallet.` });
        setCode('');
        const balance = Number(body.data.balance);
        if (Number.isFinite(balance)) setWallet((current) => (current ? { ...current, balance } : current));
        await load();
      }
    } catch {
      setNotice({ tone: 'error', text: 'The voucher could not be redeemed just now. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="content-section">
      <div className="section-header">
        <div className="section-title-group">
          <h2>Jet Wallet</h2>
          <p>Your Jet Coins, voucher codes and coin history</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-2xl bg-gradient-to-br from-[#055B75] to-[#034457] p-6 text-white">
          <div className="text-sm opacity-80">Jet Wallet balance</div>
          {wallet ? (
            <>
              <div className="mt-1 text-4xl font-bold">{formatCoins(wallet.balance)}</div>
              <div className="text-sm opacity-90">Jet Coins · worth <span>{usd(coinsToUsd(wallet.balance))}</span></div>
              {wallet.held > 0 && (
                <div className="mt-2 text-xs opacity-80">
                  {formatCoins(wallet.held)} coins set aside for a checkout in progress. They come back if it is not completed.
                </div>
              )}
            </>
          ) : (
            <div className="mt-2 text-sm opacity-80">{loadError || 'Loading…'}</div>
          )}
          <p className="mt-3 text-xs opacity-80">100 Jet Coins = $1. Earn 1 coin for every $1 you pay for flights, and use them at checkout.</p>
        </div>

        {wallet?.pending?.length > 0 && (
          <div className="rounded-2xl border border-[#65B3CF] bg-[#F1FBFD]">
            <div className="border-b border-[#65B3CF] px-5 py-3 text-sm font-semibold text-[#034457]">Coming after your trip</div>
            <ul className="divide-y divide-[#65B3CF]">
              {wallet.pending.map((reward) => (
                <li key={reward.bookingReference} className="px-5 py-3">
                  <div className="text-sm text-[#034457]">{pendingLine(reward)}</div>
                  {reward.code && <div className="text-xs text-gray-500">{`Voucher ${reward.code}`}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={redeem} className="rounded-2xl border border-gray-200 bg-white p-5">
          <label htmlFor="voucher-code" className="block text-sm font-semibold text-gray-900">Voucher code</label>
          <div className="mt-2 flex gap-2">
            <input
              id="voucher-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              maxLength={32}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase placeholder:normal-case focus:border-[#055B75] focus:outline-none focus:ring-1 focus:ring-[#055B75]"
              placeholder="Enter voucher code"
            />
            <button type="submit" disabled={busy || !code.trim()} className="rounded-lg bg-[#055B75] px-4 py-2 text-sm font-semibold text-white hover:bg-[#034457] disabled:opacity-50">
              Redeem
            </button>
          </div>
          {notice && (
            <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`mt-2 text-sm ${notice.tone === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>
              {notice.text}
            </p>
          )}
        </form>

        <div className="rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-3 text-sm font-semibold text-gray-900">History</div>
          {wallet?.entries?.length ? (
            <ul className="divide-y divide-gray-100">
              {wallet.entries.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="text-sm text-gray-900">{describeEntry(entry)}</div>
                    <div className="text-xs text-gray-500">{new Date(entry.created_at).toLocaleString()}</div>
                  </div>
                  <div className={`flex-shrink-0 text-sm font-semibold ${entry.coins >= 0 ? 'text-emerald-700' : 'text-gray-700'}`}>
                    {entry.coins >= 0 ? '+' : '−'}{formatCoins(Math.abs(entry.coins))}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-4 text-sm text-gray-500">No coins yet. Redeem a voucher or book a flight to start earning.</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Replace the admin page**

Replace the whole of `frontend/src/Pages/Admin/VoucherManagement.jsx` with:

```jsx
import React, { useCallback, useEffect, useState } from 'react';
import { adminFetch, readAdminResponse } from '../../utils/adminAuth';
import { getApiUrl } from '../../utils/apiHelper';
import { useRegisterRefresh } from './shell/RefreshContext';

const usd = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
const coinsText = (coins) => new Intl.NumberFormat('en-US').format(coins);
const day = (iso) => {
  const time = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : '';
};
const dates = (voucher) => {
  const from = day(voucher.valid_from);
  const until = day(voucher.valid_until);
  if (from && until) return `${from} → ${until}`;
  if (from) return `From ${from}`;
  if (until) return `Until ${until}`;
  return 'Any time';
};
const KIND_LABEL = { instant: 'Instant', trip: 'Trip reward' };
const STATUS_LABEL = { credited: 'Credited', pending: 'Pending', paid: 'Paid', void: 'Void' };
const kindOf = (voucher) => (voucher.kind === 'trip' ? 'trip' : 'instant');
const kindText = (voucher) => `${KIND_LABEL[kindOf(voucher)]}${kindOf(voucher) === 'trip' && voucher.first_time_only ? ' · first-time only' : ''}`;
const redemptionText = (row) => {
  if (!row.bookingReference) return `${coinsText(row.coins)} coins · ${new Date(row.createdAt).toLocaleString()}`;
  const parts = [`${coinsText(row.coins)} coins`, STATUS_LABEL[row.status] || row.status, row.bookingReference];
  if (row.status === 'pending') parts.push(row.dueAt ? `due ${day(row.dueAt)}` : 'no payout date');
  if (row.status === 'paid' && row.paidAt) parts.push(`paid ${day(row.paidAt)}`);
  return parts.join(' · ');
};
const EMPTY = { code: '', valueUsd: '', maxRedemptions: '', validFrom: '', validUntil: '', note: '', kind: 'instant', firstTimeOnly: false };
const UNREACHABLE = 'The server could not be reached. Try again.';
const UNREADABLE = 'The server sent an answer that could not be read.';
const FIELD = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#055B75] focus:outline-none focus:ring-1 focus:ring-[#055B75] disabled:bg-gray-50 disabled:text-gray-500';

async function send(path, options) {
  let response;
  try {
    response = await adminFetch(getApiUrl(path), options);
  } catch {
    return { error: UNREACHABLE };
  }
  try {
    const body = await readAdminResponse(response);
    if (body?.success !== true) return { error: body?.error || UNREADABLE };
    return { body };
  } catch (error) {
    // A hard navigation: clearing the flags makes ProtectedRoute bounce a soft one to the site login first.
    if (error?.sessionExpired) window.location.replace('/admin/login?expired=1');
    return { error: error?.message || UNREADABLE };
  }
}

export default function VoucherManagement() {
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [redemptions, setRedemptions] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { body, error } = await send('vouchers');
    setLoadError(error || null);
    if (body) setVouchers(Array.isArray(body.data) ? body.data : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useRegisterRefresh(load);

  const openForm = (next) => {
    setFormError(null);
    setForm(next);
  };

  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError(null);
    const code = form.code.trim().toUpperCase();
    const editing = Boolean(form.id);
    const { error } = await send(editing ? `vouchers/${form.id}` : 'vouchers', {
      method: editing ? 'PUT' : 'POST',
      body: JSON.stringify({
        code,
        valueUsd: Number(form.valueUsd),
        maxRedemptions: form.maxRedemptions,
        validFrom: form.validFrom,
        validUntil: form.validUntil,
        note: form.note,
        kind: form.kind,
        firstTimeOnly: form.kind === 'trip' && form.firstTimeOnly === true,
      }),
    });
    setSaving(false);
    if (error) {
      setFormError(error);
      return;
    }
    setNotice({ tone: 'ok', text: `Voucher ${code} ${editing ? 'saved' : 'created'}.` });
    setForm(null);
    load();
  };

  const toggle = async (voucher) => {
    if (busyId) return;
    setBusyId(voucher.id);
    setNotice(null);
    const turningOn = !voucher.is_active;
    const { error } = await send(`vouchers/${voucher.id}`, { method: 'PUT', body: JSON.stringify({ isActive: turningOn }) });
    setNotice(error ? { tone: 'error', text: error } : { tone: 'ok', text: `${voucher.code} is ${turningOn ? 'on' : 'off'}.` });
    await load();
    setBusyId(null);
  };

  const showRedemptions = async (voucher) => {
    const { body, error } = await send(`vouchers/${voucher.id}/redemptions`);
    setRedemptions({ voucher, rows: Array.isArray(body?.data) ? body.data : [], error });
  };

  const input = (name, label, props = {}) => (
    <label className="block text-sm">
      <span className="font-medium text-gray-700">{label}</span>
      <input
        value={form[name]}
        onChange={(event) => setForm({ ...form, [name]: event.target.value })}
        className={FIELD}
        {...props}
      />
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          A voucher gives Jet Coins once to each customer. Instant vouchers are redeemed in Profile → Jet Wallet; trip rewards are typed at flight checkout and pay out after the trip. 100 coins = $1.
        </p>
        <button type="button" onClick={() => openForm({ ...EMPTY })} className="shrink-0 rounded-lg bg-[#055B75] px-4 py-2 text-sm font-semibold text-white hover:bg-[#034457]">
          New voucher
        </button>
      </div>

      {notice && (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`rounded-lg border px-3 py-2 text-sm ${notice.tone === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-[#65B3CF] bg-[#F1FBFD] text-[#034457]'}`}
        >
          {notice.text}
        </p>
      )}

      {form && (
        <form onSubmit={save} className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-2">
          {input('code', 'Code', { required: true, maxLength: 32, autoComplete: 'off', autoCapitalize: 'characters', spellCheck: false, disabled: form.locked })}
          <div>
            {input('valueUsd', 'Value (USD)', { required: true, type: 'number', min: '0.01', step: '0.01', disabled: form.locked })}
            {Number(form.valueUsd) > 0 && <p className="mt-1 text-xs text-gray-500">{`= ${coinsText(Math.round(Number(form.valueUsd) * 100))} Jet Coins`}</p>}
          </div>
          <div className="text-sm">
            <label htmlFor="voucher-kind" className="font-medium text-gray-700">Kind</label>
            <select
              id="voucher-kind"
              value={form.kind}
              disabled={form.locked}
              onChange={(event) => setForm({ ...form, kind: event.target.value })}
              className={FIELD}
            >
              <option value="instant">Instant: redeemed in Profile → Jet Wallet</option>
              <option value="trip">Trip reward: used at checkout, coins after the trip</option>
            </select>
          </div>
          {form.kind === 'trip' ? (
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.firstTimeOnly}
                onChange={(event) => setForm({ ...form, firstTimeOnly: event.target.checked })}
                className="h-4 w-4 accent-[#055B75]"
              />
              First-time customers only
            </label>
          ) : <div className="hidden sm:block" />}
          {form.locked && <p className="text-xs text-gray-500 sm:col-span-2">Customers have used this voucher, so its code, value and kind cannot be changed.</p>}
          {input('maxRedemptions', 'Total uses (empty = no limit)', { type: 'number', min: '1', step: '1' })}
          {input('note', 'Note (admin only)', { maxLength: 200 })}
          {input('validFrom', 'Starts', { type: 'date' })}
          {input('validUntil', 'Ends', { type: 'date' })}
          <p className="text-xs text-gray-500 sm:col-span-2">Pick a code that is hard to guess (for example SHUBHAM-7K2Q): anyone signed in can try codes. A code a coupon already uses is refused.</p>
          {formError && <p role="alert" className="text-sm text-red-600 sm:col-span-2">{formError}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" disabled={saving} className="rounded-lg bg-[#055B75] px-4 py-2 text-sm font-semibold text-white hover:bg-[#034457] disabled:opacity-50">
              {form.id ? 'Save voucher' : 'Create voucher'}
            </button>
            <button type="button" onClick={() => setForm(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Cancel</button>
          </div>
        </form>
      )}

      {loadError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Kind</th>
              <th className="px-4 py-2">Value</th>
              <th className="px-4 py-2">Used</th>
              <th className="px-4 py-2">Dates</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {vouchers.map((voucher) => (
              <tr key={voucher.id}>
                <td className="px-4 py-2 font-semibold text-gray-900">{voucher.code}</td>
                <td className="px-4 py-2 text-gray-600">{kindText(voucher)}</td>
                <td className="px-4 py-2">{usd(voucher.coins / 100)}</td>
                <td className="px-4 py-2">{`${voucher.redemptions_count} / ${voucher.max_redemptions ?? '∞'}`}</td>
                <td className="px-4 py-2 text-gray-600">{dates(voucher)}</td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    disabled={busyId !== null}
                    aria-label={`${voucher.is_active ? 'Switch off' : 'Switch on'} ${voucher.code}`}
                    onClick={() => toggle(voucher)}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold disabled:opacity-50 ${voucher.is_active ? 'bg-[#F1FBFD] text-[#055B75]' : 'bg-gray-100 text-gray-500'}`}
                  >
                    {voucher.is_active ? 'Active' : 'Off'}
                  </button>
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  <button type="button" aria-label={`Who used ${voucher.code}`} onClick={() => showRedemptions(voucher)} className="text-xs font-semibold text-[#055B75] hover:underline">Who used it</button>
                  <button
                    type="button"
                    aria-label={`Edit ${voucher.code}`}
                    onClick={() => openForm({
                      id: voucher.id,
                      locked: Number(voucher.redemptions_count) > 0,
                      code: voucher.code,
                      valueUsd: String(voucher.coins / 100),
                      maxRedemptions: voucher.max_redemptions ?? '',
                      validFrom: day(voucher.valid_from),
                      validUntil: day(voucher.valid_until),
                      note: voucher.note || '',
                      kind: kindOf(voucher),
                      firstTimeOnly: Boolean(voucher.first_time_only),
                    })}
                    className="ml-3 text-xs font-semibold text-[#055B75] hover:underline"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {!loading && !loadError && vouchers.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">No vouchers yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {redemptions && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">{`Redeemed ${redemptions.voucher.code}`}</span>
            <button type="button" onClick={() => setRedemptions(null)} className="text-xs text-gray-500 hover:underline">Close</button>
          </div>
          {redemptions.error && <p role="alert" className="text-sm text-red-600">{redemptions.error}</p>}
          {!redemptions.error && redemptions.rows.length > 0 && (
            <ul className="divide-y divide-gray-100 text-sm">
              {redemptions.rows.map((row) => (
                <li key={row.id} className="flex justify-between gap-3 py-2">
                  <span>{row.email || row.userId}</span>
                  <span className="text-gray-500">{redemptionText(row)}</span>
                </li>
              ))}
            </ul>
          )}
          {!redemptions.error && redemptions.rows.length === 0 && <p className="text-sm text-gray-500">Nobody has redeemed it yet.</p>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Add the receipt helpers**

Append to `frontend/src/utils/bookingCharge.js`:

```js
/** The trip-reward voucher a booking carries: Jet Coins after the trip, never money off. */
export function tripRewardOf(booking) {
  const reward = booking?.tripReward;
  const code = String(reward?.code ?? '').trim();
  const coins = Math.floor(Number(reward?.coins) || 0);
  return code && coins > 0 ? { code, coins } : null;
}

/** "Voucher SHUBHAM: 5,000 Jet Coins after your trip", or null. */
export function tripRewardLine(booking) {
  const reward = tripRewardOf(booking);
  return reward ? `Voucher ${reward.code}: ${new Intl.NumberFormat('en-US').format(reward.coins)} Jet Coins after your trip` : null;
}
```

- [ ] **Step 8: Show the line on the confirmation page and hand it over from the order page**

In `frontend/src/Pages/Common/BookingConfirmation.jsx`, replace:

```js
import { bookingChargeLines, formatUsd } from '../../utils/bookingCharge';
```

with:

```js
import { bookingChargeLines, formatUsd, tripRewardLine } from '../../utils/bookingCharge';
```

replace:

```js
  const charge = isFlight ? bookingChargeLines(bookingData) : null;
```

with:

```js
  const charge = isFlight ? bookingChargeLines(bookingData) : null;
  const rewardLine = isFlight ? tripRewardLine(bookingData) : null;
```

and replace:

```jsx
                      <div className="border-t border-gray-300 my-2"></div>
                    </div>
                  )}
                </div>
```

with:

```jsx
                      <div className="border-t border-gray-300 my-2"></div>
                    </div>
                  )}
                  {rewardLine && (
                    <p data-trip-reward="" className="mb-4 rounded-xl border border-[#65B3CF] bg-[#F1FBFD] px-4 py-3 text-sm font-semibold text-[#034457]">
                      {rewardLine}
                    </p>
                  )}
                </div>
```

In `frontend/src/Pages/Common/flights/FlightCreateOrders.jsx`, replace:

```js
          itineraries: legs,
          returnDate: returnDateOf(legs)
        };
```

with:

```js
          itineraries: legs,
          returnDate: returnDateOf(legs),
          tripReward: body.tripReward || null
        };
```

- [ ] **Step 9: Word a refused voucher on the desk**

In `frontend/src/Pages/Support/SupportQueue.jsx`, replace:

```js
  if (issue?.kind === 'return_failed') return `Jet Coins: could not be returned${coins}${issue.resolved_at ? ' - handled' : ''}`;
```

with:

```js
  if (issue?.kind === 'return_failed') return `Jet Coins: could not be returned${coins}${issue.resolved_at ? ' - handled' : ''}`;
  if (issue?.kind === 'voucher_refused') return `Voucher ${issue.code || ''} was not reserved${issue.reason ? ` (${issue.reason})` : ''}: no trip reward will be paid for this booking`;
```

- [ ] **Step 10: Run the page suites**

Run: `npx vitest run --project frontend tests/components/jetWalletPanelRewards.test.jsx tests/components/jetWalletPanel.test.jsx tests/components/profileWalletTab.test.jsx tests/components/tripRewardReceipt.test.jsx tests/utils/tripReward.test.js tests/utils/bookingCharge.test.js tests/utils/bookingChargeCoins.test.js tests/components/bookingChargeSummary.test.jsx tests/components/voucherManagement.test.jsx tests/components/supportQueueJetCoins.test.jsx tests/components/flightCreateOrdersOutcomes.test.jsx tests/components/confirmationTicketPending.test.jsx`
Expected: PASS.

- [ ] **Step 11: Run CI's unit command**

Run: `AMADEUS_WS_ENDPOINT= AMADEUS_WS_USERNAME= AMADEUS_WS_PASSWORD= AMADEUS_WS_OFFICE_ID= VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run test:unit`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/Pages/Common/login/JetWalletPanel.jsx frontend/src/Pages/Admin/VoucherManagement.jsx frontend/src/utils/bookingCharge.js frontend/src/Pages/Common/BookingConfirmation.jsx frontend/src/Pages/Common/flights/FlightCreateOrders.jsx frontend/src/Pages/Support/SupportQueue.jsx tests/components/jetWalletPanelRewards.test.jsx tests/components/tripRewardReceipt.test.jsx tests/utils/tripReward.test.js tests/components/voucherManagement.test.jsx tests/components/supportQueueJetCoins.test.jsx
git commit -F - <<'EOF'
feat(wallet): trip rewards in the wallet, admin, receipt and desk

Profile → Jet Wallet lists "Coming after your trip" with each payout
date, and words a payout "Voucher SHUBHAM: trip FLT...". Admin → Vouchers
gains Kind (Instant / Trip reward), "First-time customers only", a Kind
column and each reward's status, booking and payout date. The booking
confirmation shows "Voucher SHUBHAM: 5,000 Jet Coins after your trip",
never as money off, and the desk words a voucher the booking could not
reserve.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CnRin1ZGh44yizpdTBakw6
EOF
```

---

### Task 8: Verification, migration, push and PR (no new code)

**Files:** none changed in the repo. A scratch script for the Management API lives in the session scratchpad only, is never committed, and is deleted after use.

**Interfaces:**
- Consumes: everything above; `.env` keys `SUPABASE_URL` (project ref = the host's first label) and `SUPABASE_ACCESS_TOKEN`.
- Produces: the migration applied to the shared Supabase project; branch `feat/trip-reward-vouchers` pushed; an open PR against `main`, not merged.

- [ ] **Step 1: Full unit suite, env blanked**

Run: `AMADEUS_WS_ENDPOINT= AMADEUS_WS_USERNAME= AMADEUS_WS_PASSWORD= AMADEUS_WS_OFFICE_ID= VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run test:unit`
Expected: every test file passes, 0 failed.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: Vite build succeeds, `check-chunk-cycles` reports no cycle, the asset copy and route SEO pages finish.

- [ ] **Step 3: SQL suite**

Run: `bash scripts/db/test-jet-wallet.sh`
Expected: `Postgres 15: every check passed`, `Postgres 16: every check passed`, `Jet Wallet SQL: every check passed`.

- [ ] **Step 4: Apply the migration to Supabase (owner pre-approved for tonight)**

The controller does this with a scratch Node script in the session scratchpad that reads `SUPABASE_ACCESS_TOKEN` and `SUPABASE_URL` from `.env` and sends the file's contents as `{ "query": "<file>" }` to `POST https://api.supabase.com/v1/projects/<ref>/database/query` with `Authorization: Bearer <token>`. Never print the token. Expected: HTTP 201/200 with no error body. The migration is idempotent; if a network error leaves the outcome unknown, run the live checks below before sending it again.

- [ ] **Step 5: Live checks (same endpoint, read-only)**

Each must hold; stop and report if any does not.

1. Columns exist:
   ```sql
   select table_name, column_name from information_schema.columns
   where table_schema = 'public'
     and ((table_name = 'vouchers' and column_name in ('kind', 'first_time_only'))
       or (table_name = 'voucher_redemptions' and column_name in ('booking_reference', 'status', 'due_at', 'paid_at', 'updated_at')))
   order by 1, 2;
   ```
   Expected: 7 rows.
2. Kinds and statuses are constrained and existing rows defaulted:
   ```sql
   select (select count(*) from pg_constraint where conname in ('vouchers_kind_check', 'voucher_redemptions_status_check')) as checks,
          (select count(*) from public.vouchers where kind <> 'instant') as non_instant,
          (select count(*) from public.voucher_redemptions where status <> 'credited') as non_credited;
   ```
   Expected: `checks = 2`, `non_instant = 0`, `non_credited = 0` (nothing has used trip vouchers yet).
3. The once-per-customer rule is the partial index:
   ```sql
   select (select count(*) from pg_constraint where conrelid = 'public.voucher_redemptions'::regclass and contype = 'u') as unique_constraints,
          (select count(*) from pg_indexes where schemaname = 'public' and indexname in ('voucher_redemptions_live_once', 'voucher_redemptions_booking_once', 'voucher_redemptions_pending_due')) as indexes;
   ```
   Expected: `unique_constraints = 0`, `indexes = 3`.
4. Anon and signed-in clients cannot execute any new or changed function; the backend can:
   ```sql
   select fn,
          has_function_privilege('anon', fn, 'execute') as anon,
          has_function_privilege('authenticated', fn, 'execute') as authenticated,
          has_function_privilege('service_role', fn, 'execute') as service_role
   from unnest(array['public.check_trip_voucher(uuid,text,text)', 'public.reserve_trip_voucher(uuid,text,text,timestamptz)',
                     'public.pay_trip_voucher(text)', 'public.void_trip_voucher(text)', 'public.redeem_voucher(uuid,text)']) as fn;
   ```
   Expected: 5 rows, `anon = false`, `authenticated = false`, `service_role = true` on each.
5. Through the public API too: `POST <SUPABASE_URL>/rest/v1/rpc/check_trip_voucher` with only the anon key (`apikey` and `Authorization: Bearer <anon key>`) and body `{"p_user":"00000000-0000-4000-8000-000000000000","p_code":"X","p_ref":null}`. Expected: HTTP 401 or 403 (permission denied), never 200.
6. The first-time check compiles against the real `bookings` table:
   ```sql
   select data_type from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'user_id';
   ```
   Expected: `uuid`. Then one probe that writes nothing (it is rolled back):
   ```sql
   begin;
   insert into public.vouchers (code, coins, kind, first_time_only) values ('ZZPLANPROBE', 100, 'trip', true);
   select public.check_trip_voucher(gen_random_uuid(), 'ZZPLANPROBE', null);
   rollback;
   ```
   Expected: no error. Afterwards `select count(*) from public.vouchers where code = 'ZZPLANPROBE'` returns 0.

Delete the scratch script once the checks pass.

- [ ] **Step 6: Push the branch**

```bash
git status --short
git push -u origin feat/trip-reward-vouchers
```

Expected: `git status` shows only ` M CLAUDE.md` and ` M frontend/src/Pages/Common/Navbar.jsx` (never staged); the push succeeds.

- [ ] **Step 7: Open the PR (do not merge, no auto-merge)**

Write the body to a file in the session scratchpad, then:

```bash
gh pr create --base main --head feat/trip-reward-vouchers --title "feat(wallet): trip-reward vouchers - Jet Coins after the trip" --body-file <scratchpad>/pr-body.md
```

Body:

```markdown
## What this does

"Book with my code SHUBHAM and get $50 in Jet Coins for your next trip."

- Admin → Vouchers: every voucher has a **Kind** (Instant or Trip reward) and an optional **First-time customers only** switch. One code can no longer be both a coupon and a voucher.
- Flight review page: one **Coupon or voucher code** box. Apply tries the coupon first, then the trip voucher. The price does not change; the page says "You'll get 5,000 Jet Coins after your trip".
- The voucher is checked before the payment page opens and reserved when the booking is made. A refusal at that moment never fails the booking; it is marked `voucher_refused`.
- After the trip (00:00 UTC two days after the last arrival date) the Lightsail wallet job pays the coins and emails "Your Jet Coins have arrived". A cancel, void or reversal before then voids the reward and frees the voucher.
- Profile → Jet Wallet shows "Coming after your trip"; the confirmation page and email show "Voucher SHUBHAM: 5,000 Jet Coins after your trip".

## Database

`supabase/migrations/20261013150000_trip_reward_vouchers.sql` (additive, idempotent, one transaction) is **already applied** to Supabase with the owner's go-ahead. Live checks passed: the new columns, constraints and indexes exist; anon and authenticated cannot execute any new function (checked in SQL and through the REST API); a rolled-back probe of `check_trip_voucher` ran against the real `bookings` table. It is backwards compatible with `main`.

## Tests

- `npm run test:unit` with CI's blank env: all pass.
- `npm run build`: passes, no chunk cycle.
- `scripts/db/test-jet-wallet.sh`: Postgres 15 and 16, both migrations applied twice, including a race on the last use of a trip voucher.

## Not done (needs the owner)

- Browser run: create SHUBHAM as Trip reward + first-time only, book with it, see the line on the confirmation and the reward pending in the wallet, run the payout with the clock moved forward, cancel another booking and see its reward voided.
- Merge: waiting for the owner's word.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01CnRin1ZGh44yizpdTBakw6
```

Expected: the PR URL is printed. Do not run `gh pr merge` in any form.

---

## Self-review

**Spec coverage**

| Spec item | Task |
|---|---|
| Kinds, first-time switch, columns, partial unique index, booking unique index | 1 |
| `check_trip_voucher`, `reserve_trip_voucher`, `pay_trip_voucher`, `void_trip_voucher`; `redeem_voucher` refuses trip vouchers and ignores void rows; grants | 1 |
| SQL tests on Postgres 15 and 16: check/reserve, first-time, limits, freeing void, idempotent reserve, pay, void, concurrent reserve, partial index, grants | 1 |
| `POST /api/wallet/voucher-check` (protect + voucher limiter), whitelisted refusals | 2 |
| Wrong-kind pointers in both boxes | 2 (server), 6 and 7 (pages) |
| Admin kind / first-time, kind lock, code clashes both ways, redemptions status/booking/due | 2 (server), 7 (page) |
| Wallet summary `pending` | 2 (server), 7 (panel) |
| `verifyFlightCharge` with `voucherCode`, signed-in only, 409 before the payment page, `verified_charge.voucher`, price untouched | 3 |
| `checkoutKey` includes the voucher | 3 |
| Reserve at commit and success, `due_at` from itineraries, refusal never fails the booking | 4 |
| Void on `refundOnFulfillmentFailure`, `refundDuplicatePayment`, `cancelFlightBooking`, `handlePaymentVoid` | 4 |
| Payout on the wallet job tick, production/`WALLET_JOB` only, 200 per run, re-read, void cancelled, email after payout, failed email not retried | 5 |
| Email: coins, voucher, trip, wallet link, brand colours | 5 |
| One "Coupon or voucher code" box on the flight page only; other booking types keep the plain box; Remove per line; refusals handled | 6 |
| Profile → Jet Wallet: "Coming after your trip", payout wording, pointer | 7 |
| Booking confirmation and receipt line | 5 (email), 7 (page) |
| Apply the migration, live checks, suite, build, push, PR, no merge | 8 |

**Placeholder scan:** no TBD/TODO; every code step carries its code; the only unspecified content is the Task 8 scratch script, which the caller runs itself by design.

**Type consistency:** `tripVoucherOf` returns `{ id, code, coins }` in Tasks 2, 4 and the email; `reserveTripRewardAfterBooking` returns `{ code, coins, dueAt }`, which the order answer, `FlightCreateOrders` and `tripRewardOf` read; `pay_trip_voucher`'s `{ status, applied, coins, user_id, code }` is what `payTripRewardsOnce` checks and `sendTripRewardEmail` reads; `wallet_issue.kind === 'voucher_refused'` is written in Task 4 and read by `tripRewardOfRow`, the confirmation email and the desk.
