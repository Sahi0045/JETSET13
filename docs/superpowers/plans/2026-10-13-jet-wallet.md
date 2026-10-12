# Jet Wallet and Vouchers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every signed-in customer a Jet Wallet. Coins (1 coin = $0.01) come from admin-created vouchers and from flights the customer pays for, and are spent as money off later flights. Every refund path gives coins back first.

**Architecture:**
- **Database:** five Supabase tables and eight `security definer` Postgres functions. Each coin movement is one locked, idempotent call.
- **Backend:** a thin `wallet.service.js` wraps the functions. Checkout puts the coins into the verified charge (`verified_charge.wallet`) and holds them; the order route captures them; every refund path returns them.
- **Frontend:** a profile tab, a switch on the review page and an admin Vouchers page.

**Tech Stack:** Supabase Postgres (plpgsql), Node/Express (ESM), React + Vite + Tailwind, Vitest. The SQL tests run in a throwaway `postgres:16-alpine` Docker container.

**Spec:** `docs/superpowers/specs/2026-10-13-jet-wallet-design.md`

## Global Constraints

**Money**
- 1 coin = $0.01. Coins are whole numbers (`bigint` in SQL, integers in JS).
- At least **$1.00** (`MIN_CARD_CHARGE = 1`) always stays on the card. A coupon is taken off before coins.
- `verified_charge.total` stays the **card** amount. Coins live in `verified_charge.wallet = { coins, amount }`.
- Flights only. Only a signed-in customer (`resolveBookingUserId(req)`) can use coins.
- Earning is `floor(card total)` coins, credited after `freeUntilOf(created_at, officeTimeZoneOf())`, on ticketed, uncancelled bookings.

**Database**
- Every Postgres function is `security definer` with `set search_path = public`.
- EXECUTE is revoked from `public, anon, authenticated` and granted to `service_role` only.
- New tables have RLS enabled and **no policies**.

**Routes and code**
- A new route is mounted in all three entry points: `server.js`, `backend/server.js`, and `backend/api/index.js` (both the `/api/x` and `/x` forms).
- Comments only for critical constraints (security, money, data integrity). No narrating comments.
- Brand colours only: teal `#055B75`, dark teal `#034457`, accent `#0890BC`, sky `#65B3CF`, light `#F1FBFD`. Never generic blue or indigo.
- No sample or mock data in app code; mocks belong in tests only.

**Tests**
- Before every commit, run CI's unit command with the env blanked:
  `AMADEUS_WS_ENDPOINT= AMADEUS_WS_USERNAME= AMADEUS_WS_PASSWORD= AMADEUS_WS_OFFICE_ID= VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run test:unit`

**Git and production**
- Never stage `CLAUDE.md` or `frontend/src/Pages/Common/Navbar.jsx`; they are the owner's uncommitted edits.
- Work on branch `feat/jet-wallet`. Push only that branch. Merging needs the owner to write "merge".
- The migration is applied to Supabase **by hand, only after the owner says yes**. Local and production share one database.

## Review Focus

1. **Two tabs at once.** The same customer opens two checkouts that both use coins. The second gets the coins left over or `WALLET_CHANGED`, never a negative balance. Covered by the SQL test in Task 1 and by Task 5 Step 1, "a hold refused for coins spent in another tab".
2. **A coupon that leaves under $1.** Coins requested on a total a coupon has already taken below $1.00. No coins apply, no error, and the coupon still works. Covered by Task 2 Step 1, "applies no coins when a coupon leaves less than $1".
3. **A payment that lands after the release sweep.** Capture finds the hold `released`. The booking still succeeds, but the error is reported and nothing is silently given free. Covered by Task 6 Step 1, "reports a hold that was released before the payment landed".
4. **A one-use voucher redeemed by two customers at the same moment.** Only one gets the coins. Covered by the parallel "RACE" redemption in Task 1's `scripts/db/test-jet-wallet.sh`.
5. **A fee-covers cancel with coins larger than what is owed.** Only the owed part comes back as coins. Covered by Task 2 Step 1, "fee_covers returns only the coins still owed".

---

## File structure

**Create**

| File | What it is |
|---|---|
| `supabase/migrations/20261013120000_jet_wallet.sql` | Tables, functions, grants |
| `tests/sql/jet_wallet_stub.sql` | The Supabase roles and `public.users` that the migration expects, for a bare Postgres |
| `tests/sql/jet_wallet.test.sql` | SQL assertions |
| `scripts/db/test-jet-wallet.sh` | Runs the SQL tests in Docker |
| `shared/jetCoins.js` | Pure coin maths (browser and server) |
| `backend/services/wallet.service.js` | RPC wrappers, summary, error codes |
| `backend/controllers/wallet.controller.js` | Customer wallet and redeem; staff coin return |
| `backend/controllers/vouchers.controller.js` | Admin voucher CRUD and redemptions |
| `backend/routes/wallet.routes.js` | `/api/wallet` |
| `backend/routes/vouchers.routes.js` | `/api/vouchers` (admin) |
| `backend/jobs/walletEarn.job.js` | Earning job |
| `frontend/src/Pages/Common/login/JetWalletPanel.jsx` | Profile tab |
| `frontend/src/Pages/Admin/VoucherManagement.jsx` | Admin page |
| Tests | `tests/utils/jetCoins.test.js`, `tests/backend/walletService.test.js`, `tests/backend/walletRoutes.test.js`, `tests/backend/vouchersController.test.js`, `tests/backend/walletCheckout.test.js`, `tests/backend/walletOrderRoute.test.js`, `tests/backend/walletRefunds.test.js`, `tests/backend/walletEarnJob.test.js`, `tests/components/jetWalletPanel.test.jsx`, `tests/components/voucherManagement.test.jsx`, `tests/components/reviewPageCoins.test.jsx` |

**Modify**

| File | Change |
|---|---|
| `shared/flightCharge.js` | `walletAmount` input, `MIN_CARD_CHARGE` |
| `shared/flightCancelPolicy.js` | Terms on the gross amount; coin and card parts |
| `backend/middleware/security.js` | `voucherRedeemLimiter` |
| `backend/services/flightCheckout.service.js` | Wallet in `verifyFlightCharge` |
| `backend/utils/tripMatch.js` | `checkoutKey` takes `walletCoins` |
| `backend/routes/payment/checkout.handlers.js` | Hold coins; release them on any failed exit |
| `backend/routes/flight.routes.js` | Capture; full reversals return coins; breakdowns; desk row |
| `backend/routes/payment/operations.handlers.js` | Cancel returns coins; void returns coins |
| `backend/jobs/abandonedCheckout.job.js` | Release unpaid holds |
| `server.js`, `backend/server.js`, `backend/api/index.js` | Mount routes; start the earning job (`server.js` only) |
| `frontend/src/Services/ArcPayService.js` | Send `walletCoins` |
| `frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx` | Coins switch |
| `frontend/src/utils/bookingCharge.js` | Jet Coins line |
| `frontend/src/Pages/Common/login/profiledashboard.jsx` | Wallet tab |
| `frontend/src/Pages/Support/SupportQueue.jsx` | "Return Jet Coins" action |
| `frontend/src/Pages/Admin/AdminPanel.jsx`, `shell/AdminShell.jsx`, `shell/AdminSidebar.jsx` | Vouchers page |

---

### Task 1: Database: tables, functions, grants, SQL tests

**Files:**
- Create: `supabase/migrations/20261013120000_jet_wallet.sql`
- Create: `tests/sql/jet_wallet_stub.sql`
- Create: `tests/sql/jet_wallet.test.sql`
- Create: `scripts/db/test-jet-wallet.sh`

**Interfaces:**
- **Produces these SQL functions** (all return `jsonb`):
  - `wallet_apply(p_user uuid, p_coins bigint, p_kind text, p_key text, p_ref text, p_voucher uuid, p_note text)` → `{applied, balance}` (internal)
  - `wallet_hold(p_user uuid, p_ref text, p_coins bigint)` → `{status, coins, balance}`, or raises `INSUFFICIENT_COINS` / `HOLD_CONFLICT` / `BAD_COINS`
  - `wallet_capture(p_ref text)` → `{status}`, where status is `captured`, `released` or `none`
  - `wallet_release(p_ref text)` → `{status, coins}`
  - `wallet_return(p_ref text, p_coins bigint, p_reason text)` → `{status, coins}`; `coins` is the number given back now
  - `wallet_earn(p_user uuid, p_ref text, p_coins bigint)` → `{applied, balance}`
  - `wallet_reverse_earn(p_ref text)` → `{coins}`
  - `redeem_voucher(p_user uuid, p_code text)` → `{coins, balance, code}`, or raises a `VOUCHER_*` code
- **Produces these tables:** `wallets`, `wallet_entries`, `wallet_holds`, `vouchers`, `voucher_redemptions`. Column names are as in the spec.

- [ ] **Step 1: Write the stub and the failing SQL test**

`tests/sql/jet_wallet_stub.sql`:

```sql
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
create table if not exists public.users (id uuid primary key, email text);
insert into public.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'a@test.dev'),
  ('00000000-0000-4000-8000-000000000002', 'b@test.dev')
on conflict do nothing;
```

`tests/sql/jet_wallet.test.sql`:

```sql
\set ON_ERROR_STOP 1
do $$
declare
  a uuid := '00000000-0000-4000-8000-000000000001';
  b uuid := '00000000-0000-4000-8000-000000000002';
  r jsonb;
  failed boolean;
begin
  insert into public.vouchers (code, coins, max_redemptions) values ('WELCOME50', 5000, 1);
  insert into public.vouchers (code, coins, is_active) values ('OFFLINE', 100, false);
  insert into public.vouchers (code, coins, valid_until) values ('OLD', 100, now() - interval '1 day');

  r := public.redeem_voucher(a, ' welcome50 ');
  assert (r->>'coins')::bigint = 5000 and (r->>'balance')::bigint = 5000, 'voucher credits its coins';

  failed := false;
  begin perform public.redeem_voucher(a, 'WELCOME50'); exception when others then failed := sqlerrm like '%VOUCHER_ALREADY_REDEEMED%'; end;
  assert failed, 'a customer redeems a voucher once';

  failed := false;
  begin perform public.redeem_voucher(b, 'WELCOME50'); exception when others then failed := sqlerrm like '%VOUCHER_USED_UP%'; end;
  assert failed, 'a voucher stops at its limit';

  failed := false;
  begin perform public.redeem_voucher(b, 'OFFLINE'); exception when others then failed := sqlerrm like '%VOUCHER_INACTIVE%'; end;
  assert failed, 'an inactive voucher is refused';

  failed := false;
  begin perform public.redeem_voucher(b, 'OLD'); exception when others then failed := sqlerrm like '%VOUCHER_EXPIRED%'; end;
  assert failed, 'an expired voucher is refused';

  failed := false;
  begin perform public.redeem_voucher(b, 'NOPE'); exception when others then failed := sqlerrm like '%VOUCHER_NOT_FOUND%'; end;
  assert failed, 'an unknown code is refused';

  r := public.wallet_hold(a, 'REF1', 3000);
  assert r->>'status' = 'held' and (r->>'balance')::bigint = 2000, 'a hold takes the coins';
  r := public.wallet_hold(a, 'REF1', 3000);
  assert (select balance from public.wallets where user_id = a) = 2000, 'holding the same checkout again changes nothing';

  failed := false;
  begin perform public.wallet_hold(a, 'REF2', 2500); exception when others then failed := sqlerrm like '%INSUFFICIENT_COINS%'; end;
  assert failed, 'a hold refused for coins spent in another tab';
  assert (select balance from public.wallets where user_id = a) = 2000, 'a refused hold takes nothing';

  r := public.wallet_release('REF1');
  assert (r->>'coins')::bigint = 3000 and (select balance from public.wallets where user_id = a) = 5000, 'release gives the coins back';
  r := public.wallet_release('REF1');
  assert (r->>'coins')::bigint = 0 and (select balance from public.wallets where user_id = a) = 5000, 'release twice gives nothing more';

  perform public.wallet_hold(a, 'REF3', 4000);
  r := public.wallet_capture('REF3');
  assert r->>'status' = 'captured', 'capture marks the hold used';
  r := public.wallet_release('REF3');
  assert (r->>'coins')::bigint = 0, 'a captured hold is not released';
  r := public.wallet_return('REF3', 1500, 'cancel');
  assert (r->>'coins')::bigint = 1500 and (select balance from public.wallets where user_id = a) = 2500, 'return gives back part';
  r := public.wallet_return('REF3', 1500, 'cancel');
  assert (r->>'coins')::bigint = 0, 'the same return reason is applied once';
  r := public.wallet_return('REF3', 999999, 'desk-1');
  assert (r->>'coins')::bigint = 2500 and (select balance from public.wallets where user_id = a) = 5000, 'return never gives back more than was used';

  perform public.wallet_hold(a, 'REF4', 100);
  r := public.wallet_return('REF4', 999999, 'reversal');
  assert r->>'status' = 'released' and (r->>'coins')::bigint = 100, 'return on an unused hold releases it whole';

  r := public.wallet_earn(b, 'REF9', 130);
  assert (r->>'balance')::bigint = 130, 'earning credits';
  r := public.wallet_earn(b, 'REF9', 130);
  assert (select balance from public.wallets where user_id = b) = 130, 'earning once per booking';
  r := public.wallet_reverse_earn('REF9');
  assert (r->>'coins')::bigint = 130 and (select balance from public.wallets where user_id = b) = 0, 'reversal takes the earned coins';
  r := public.wallet_reverse_earn('REF9');
  assert (r->>'coins')::bigint = 0, 'reversal once';

  assert (select sum(coins) from public.wallet_entries where user_id = a) = (select balance from public.wallets where user_id = a), 'the ledger adds up to the balance';
  assert not has_function_privilege('anon', 'public.wallet_hold(uuid,text,bigint)', 'execute'), 'anon cannot call wallet functions';
  assert not has_function_privilege('authenticated', 'public.redeem_voucher(uuid,text)', 'execute'), 'signed-in clients cannot call wallet functions directly';
  assert has_function_privilege('service_role', 'public.redeem_voucher(uuid,text)', 'execute'), 'the backend can call them';
end $$;
```

`scripts/db/test-jet-wallet.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
NAME="jet-wallet-pg-$$"
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=pw postgres:16-alpine >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 60); do
  docker exec "$NAME" psql -U postgres -tAc 'select 1' >/dev/null 2>&1 && break
  sleep 1
done
sleep 2
run() { docker exec -i "$NAME" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres; }
run < tests/sql/jet_wallet_stub.sql
run < supabase/migrations/20261013120000_jet_wallet.sql
run < supabase/migrations/20261013120000_jet_wallet.sql
run < tests/sql/jet_wallet.test.sql
# Two customers redeem a one-use voucher at the same moment: exactly one gets it.
run <<'SQL'
insert into public.users (id, email) values
  ('00000000-0000-4000-8000-000000000003', 'c@test.dev'),
  ('00000000-0000-4000-8000-000000000004', 'd@test.dev')
on conflict do nothing;
insert into public.vouchers (code, coins, max_redemptions) values ('RACE', 100, 1) on conflict do nothing;
SQL
{
  echo "select public.redeem_voucher('00000000-0000-4000-8000-000000000003', 'RACE');" | run >/dev/null 2>&1 &
  echo "select public.redeem_voucher('00000000-0000-4000-8000-000000000004', 'RACE');" | run >/dev/null 2>&1 &
  wait
} || true
count=$(docker exec "$NAME" psql -U postgres -tAc "select count(*) from public.voucher_redemptions r join public.vouchers v on v.id = r.voucher_id where v.code = 'RACE'")
[ "$count" = "1" ] || { echo "RACE voucher was redeemed $count times"; exit 1; }
echo "Jet Wallet SQL: every check passed"
```

- [ ] **Step 2: Run it and watch it fail**

Run: `chmod +x scripts/db/test-jet-wallet.sh && scripts/db/test-jet-wallet.sh`
Expected: FAIL. psql exits non-zero because `supabase/migrations/20261013120000_jet_wallet.sql` does not exist yet.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261013120000_jet_wallet.sql`:

```sql
-- Jet Wallet: coins (1 coin = $0.01) a customer earns on flights or gets from
-- admin vouchers, and spends at flight checkout.
--
-- Apply by hand (migrations are not auto-applied in this project):
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/20261013120000_jet_wallet.sql
-- Safe to run twice.
--
-- Every coin movement goes through one of the functions below, which lock the
-- customer's wallet row and record the movement under a unique idempotency key:
-- a retried call never moves coins twice, and a balance never goes below zero.
-- Only the backend (service_role) may call them; RLS with no policies keeps the
-- tables away from the browser's anon and authenticated keys.

create table if not exists public.wallets (
  user_id uuid primary key references public.users(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_entries (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('voucher', 'earn', 'earn_reversal', 'hold', 'release', 'return')),
  coins bigint not null,
  balance_after bigint not null,
  booking_reference text,
  voucher_id uuid,
  idempotency_key text not null unique,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists wallet_entries_user_created on public.wallet_entries (user_id, created_at desc);

create table if not exists public.wallet_holds (
  booking_reference text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  coins bigint not null check (coins > 0),
  status text not null check (status in ('held', 'captured', 'released')),
  returned_coins bigint not null default 0 check (returned_coins >= 0 and returned_coins <= coins),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wallet_holds_user_status on public.wallet_holds (user_id, status);

create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(btrim(code)) and length(code) between 3 and 32),
  coins bigint not null check (coins > 0),
  max_redemptions int check (max_redemptions is null or max_redemptions > 0),
  redemptions_count int not null default 0,
  valid_from timestamptz,
  valid_until timestamptz,
  is_active boolean not null default true,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.voucher_redemptions (
  id bigserial primary key,
  voucher_id uuid not null references public.vouchers(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  coins bigint not null,
  created_at timestamptz not null default now(),
  unique (voucher_id, user_id)
);

alter table public.wallets enable row level security;
alter table public.wallet_entries enable row level security;
alter table public.wallet_holds enable row level security;
alter table public.vouchers enable row level security;
alter table public.voucher_redemptions enable row level security;

create or replace function public.wallet_apply(p_user uuid, p_coins bigint, p_kind text, p_key text, p_ref text, p_voucher uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_balance bigint;
begin
  insert into public.wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select balance into v_balance from public.wallets where user_id = p_user for update;
  if exists (select 1 from public.wallet_entries where idempotency_key = p_key) then
    return jsonb_build_object('applied', false, 'balance', v_balance);
  end if;
  if v_balance + p_coins < 0 then
    raise exception 'INSUFFICIENT_COINS';
  end if;
  update public.wallets set balance = v_balance + p_coins, updated_at = now() where user_id = p_user;
  insert into public.wallet_entries (user_id, kind, coins, balance_after, booking_reference, voucher_id, idempotency_key, note)
  values (p_user, p_kind, p_coins, v_balance + p_coins, p_ref, p_voucher, p_key, p_note);
  return jsonb_build_object('applied', true, 'balance', v_balance + p_coins);
end;
$$;

create or replace function public.wallet_hold(p_user uuid, p_ref text, p_coins bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hold public.wallet_holds;
  v_result jsonb;
begin
  if p_coins is null or p_coins <= 0 or p_ref is null then
    raise exception 'BAD_COINS';
  end if;
  perform pg_advisory_xact_lock(hashtext('wallet_hold:' || p_ref));
  select * into v_hold from public.wallet_holds where booking_reference = p_ref;
  if found then
    if v_hold.user_id = p_user and v_hold.coins = p_coins and v_hold.status in ('held', 'captured') then
      return jsonb_build_object('status', v_hold.status, 'coins', v_hold.coins,
        'balance', (select balance from public.wallets where user_id = p_user));
    end if;
    raise exception 'HOLD_CONFLICT';
  end if;
  v_result := public.wallet_apply(p_user, -p_coins, 'hold', 'hold:' || p_ref, p_ref, null, null);
  insert into public.wallet_holds (booking_reference, user_id, coins, status) values (p_ref, p_user, p_coins, 'held');
  return jsonb_build_object('status', 'held', 'coins', p_coins, 'balance', (v_result->>'balance')::bigint);
end;
$$;

create or replace function public.wallet_capture(p_ref text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  update public.wallet_holds set status = 'captured', updated_at = now()
  where booking_reference = p_ref and status = 'held'
  returning status into v_status;
  if v_status is null then
    select status into v_status from public.wallet_holds where booking_reference = p_ref;
  end if;
  return jsonb_build_object('status', coalesce(v_status, 'none'));
end;
$$;

create or replace function public.wallet_release(p_ref text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hold public.wallet_holds;
  v_result jsonb;
begin
  select * into v_hold from public.wallet_holds where booking_reference = p_ref for update;
  if not found then
    return jsonb_build_object('status', 'none', 'coins', 0);
  end if;
  if v_hold.status <> 'held' then
    return jsonb_build_object('status', v_hold.status, 'coins', 0);
  end if;
  v_result := public.wallet_apply(v_hold.user_id, v_hold.coins, 'release', 'release:' || p_ref, p_ref, null, null);
  update public.wallet_holds set status = 'released', updated_at = now() where booking_reference = p_ref;
  return jsonb_build_object('status', 'released', 'coins', v_hold.coins, 'balance', (v_result->>'balance')::bigint);
end;
$$;

create or replace function public.wallet_return(p_ref text, p_coins bigint, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hold public.wallet_holds;
  v_give bigint;
  v_result jsonb;
begin
  select * into v_hold from public.wallet_holds where booking_reference = p_ref for update;
  if not found then
    return jsonb_build_object('status', 'none', 'coins', 0);
  end if;
  if v_hold.status = 'held' then
    perform public.wallet_apply(v_hold.user_id, v_hold.coins, 'release', 'release:' || p_ref, p_ref, null, null);
    update public.wallet_holds set status = 'released', updated_at = now() where booking_reference = p_ref;
    return jsonb_build_object('status', 'released', 'coins', v_hold.coins);
  end if;
  if v_hold.status = 'released' then
    return jsonb_build_object('status', 'released', 'coins', 0);
  end if;
  v_give := least(greatest(coalesce(p_coins, 0), 0), v_hold.coins - v_hold.returned_coins);
  if v_give <= 0 then
    return jsonb_build_object('status', 'captured', 'coins', 0);
  end if;
  v_result := public.wallet_apply(v_hold.user_id, v_give, 'return', 'return:' || p_ref || ':' || coalesce(p_reason, 'refund'), p_ref, null, null);
  if not (v_result->>'applied')::boolean then
    return jsonb_build_object('status', 'captured', 'coins', 0);
  end if;
  update public.wallet_holds set returned_coins = returned_coins + v_give, updated_at = now() where booking_reference = p_ref;
  return jsonb_build_object('status', 'captured', 'coins', v_give, 'balance', (v_result->>'balance')::bigint);
end;
$$;

create or replace function public.wallet_earn(p_user uuid, p_ref text, p_coins bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_coins is null or p_coins <= 0 or p_ref is null then
    raise exception 'BAD_COINS';
  end if;
  return public.wallet_apply(p_user, p_coins, 'earn', 'earn:' || p_ref, p_ref, null, null);
end;
$$;

create or replace function public.wallet_reverse_earn(p_ref text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_entry public.wallet_entries;
  v_balance bigint;
  v_take bigint;
  v_result jsonb;
begin
  select * into v_entry from public.wallet_entries where idempotency_key = 'earn:' || p_ref;
  if not found then
    return jsonb_build_object('coins', 0);
  end if;
  select balance into v_balance from public.wallets where user_id = v_entry.user_id for update;
  if exists (select 1 from public.wallet_entries where idempotency_key = 'earn_reversal:' || p_ref) then
    return jsonb_build_object('coins', 0);
  end if;
  v_take := least(v_entry.coins, coalesce(v_balance, 0));
  if v_take <= 0 then
    return jsonb_build_object('coins', 0);
  end if;
  v_result := public.wallet_apply(v_entry.user_id, -v_take, 'earn_reversal', 'earn_reversal:' || p_ref, p_ref, null, null);
  return jsonb_build_object('coins', v_take, 'balance', (v_result->>'balance')::bigint);
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
  if v.valid_from is not null and now() < v.valid_from then raise exception 'VOUCHER_NOT_STARTED'; end if;
  if v.valid_until is not null and now() > v.valid_until then raise exception 'VOUCHER_EXPIRED'; end if;
  if exists (select 1 from public.voucher_redemptions where voucher_id = v.id and user_id = p_user) then
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
    'public.wallet_apply(uuid,bigint,text,text,text,uuid,text)',
    'public.wallet_hold(uuid,text,bigint)',
    'public.wallet_capture(text)',
    'public.wallet_release(text)',
    'public.wallet_return(text,bigint,text)',
    'public.wallet_earn(uuid,text,bigint)',
    'public.wallet_reverse_earn(text)',
    'public.redeem_voucher(uuid,text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
```

- [ ] **Step 4: Run the SQL tests and watch them pass**

Run: `scripts/db/test-jet-wallet.sh`
Expected: PASS, printing `Jet Wallet SQL: every check passed`. Applying the migration twice must not error.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261013120000_jet_wallet.sql tests/sql/jet_wallet_stub.sql tests/sql/jet_wallet.test.sql scripts/db/test-jet-wallet.sh
git commit -m "feat(wallet): tables and locked, idempotent coin functions"
```

---

### Task 2: Shared coin maths

**Files:**
- Modify: `shared/flightCharge.js` (`computeFlightCharge`, lines 50-84)
- Create: `shared/jetCoins.js`
- Modify: `shared/flightCancelPolicy.js` (`customerCancelTerms`, `cancelTermsLines`)
- Test: `tests/utils/jetCoins.test.js`

**Interfaces:**
- **Produces from `shared/flightCharge.js`:**
  - `MIN_CARD_CHARGE = 1`
  - `computeFlightCharge({ ..., walletAmount = 0 })`, which now also returns `walletAmount` (dollars) and `walletCoins` (integer). `total` is the card amount.
- **Produces from `shared/jetCoins.js`:**
  - `coinsToUsd(coins): number`
  - `maxWalletCoinsFor(afterCoupon: number, balance: number): number`
  - `grossPaidOf(charge): number`
  - `earnedCoinsFor(cardTotal: number): number`
  - `coinsBackOnCancel({ action, heldAmount, kept, coins }): number`
  - `formatCoins(coins): string`
- **Produces from `shared/flightCancelPolicy.js`:** `customerCancelTerms(...)` terms gain `coinsBack` (coins) and `cardBack` (dollars). `paid` is now `grossPaidOf(charge)`.

- [ ] **Step 1: Write the failing tests**

`tests/utils/jetCoins.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { computeFlightCharge, MIN_CARD_CHARGE } from '../../shared/flightCharge.js';
import {
  coinsBackOnCancel, coinsToUsd, earnedCoinsFor, formatCoins, grossPaidOf, maxWalletCoinsFor,
} from '../../shared/jetCoins.js';
import { customerCancelTerms } from '../../shared/flightCancelPolicy.js';

const config = { flight_taxes_fees: 1, flight_taxes_fees_percentage: 1 };

describe('Jet Coins in the charge', () => {
  it('takes coins off after the fee and leaves the card the rest', () => {
    const charge = computeFlightCharge({ fareTotal: 120, travellerTypes: ['ADULT'], config, walletAmount: 50 });
    expect(charge.subtotal).toBe(122.2);
    expect(charge.walletAmount).toBe(50);
    expect(charge.walletCoins).toBe(5000);
    expect(charge.total).toBe(72.2);
  });

  it('always leaves at least $1 on the card', () => {
    const charge = computeFlightCharge({ fareTotal: 120, travellerTypes: ['ADULT'], config, walletAmount: 500 });
    expect(MIN_CARD_CHARGE).toBe(1);
    expect(charge.total).toBe(1);
    expect(charge.walletAmount).toBe(121.2);
  });

  it('takes the coupon first', () => {
    const charge = computeFlightCharge({ fareTotal: 120, travellerTypes: ['ADULT'], config, discount: 20, walletAmount: 50 });
    expect(charge.total).toBe(52.2);
  });

  it('applies no coins when a coupon leaves less than $1', () => {
    const charge = computeFlightCharge({ fareTotal: 120, travellerTypes: ['ADULT'], config, discount: 121.5, walletAmount: 50 });
    expect(charge.walletAmount).toBe(0);
    expect(charge.total).toBe(0.7);
  });

  it('charges exactly as before with no coins', () => {
    const before = computeFlightCharge({ fareTotal: 128.1, travellerTypes: ['ADULT'], config });
    expect(before.walletAmount).toBe(0);
    expect(before.total).toBe(130.38);
  });
});

describe('coin helpers', () => {
  it('converts and caps', () => {
    expect(coinsToUsd(5000)).toBe(50);
    expect(maxWalletCoinsFor(122.2, 5000)).toBe(5000);
    expect(maxWalletCoinsFor(30, 5000)).toBe(2900);
    expect(maxWalletCoinsFor(0.7, 5000)).toBe(0);
    expect(maxWalletCoinsFor(30, -5)).toBe(0);
  });

  it('knows the whole price paid', () => {
    expect(grossPaidOf({ total: 72.2, walletAmount: 50 })).toBe(122.2);
    expect(grossPaidOf({ total: 130.38 })).toBe(130.38);
  });

  it('earns a coin per whole card dollar', () => {
    expect(earnedCoinsFor(130.38)).toBe(130);
    expect(earnedCoinsFor(0.99)).toBe(0);
  });

  it('formats coins', () => {
    expect(formatCoins(5000)).toBe('5,000');
  });
});

describe('coins back on a cancel', () => {
  it('gives every coin back on a whole or fee-kept refund', () => {
    expect(coinsBackOnCancel({ action: 'refund_all', heldAmount: 72.2, kept: 0, coins: 5000 })).toBe(5000);
    expect(coinsBackOnCancel({ action: 'refund_less_fee', heldAmount: 72.2, kept: 2.2, coins: 5000 })).toBe(5000);
  });

  it('fee_covers returns only the coins still owed', () => {
    expect(coinsBackOnCancel({ action: 'fee_covers', heldAmount: 1, kept: 2.2, coins: 12120 })).toBe(12000);
    expect(coinsBackOnCancel({ action: 'fee_covers', heldAmount: 1, kept: 300, coins: 5000 })).toBe(0);
  });

  it('gives nothing back automatically on a review', () => {
    expect(coinsBackOnCancel({ action: 'review', heldAmount: 72.2, kept: 2.2, coins: 5000 })).toBe(0);
  });
});

describe('cancel terms with coins', () => {
  it('works the airline price from the whole price paid, coins first', () => {
    const terms = customerCancelTerms({
      charge: { total: 72.2, walletAmount: 50, walletCoins: 5000, serviceFee: 2.2, discount: 0 },
      paidAt: new Date().toISOString(),
      timeZone: 'America/Los_Angeles',
      hasReservation: true,
      ticketed: false,
    });
    expect(terms.paid).toBe(122.2);
    expect(terms.airlinePrice).toBe(120);
    expect(terms.coinsBack).toBe(5000);
    expect(terms.cardBack).toBe(70);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/utils/jetCoins.test.js`
Expected: FAIL with `Failed to resolve import "../../shared/jetCoins.js"`.

- [ ] **Step 3: Implement**

In `shared/flightCharge.js`:

**3a.** Add this above `computeFlightCharge`:

```js
/** ARC Pay cannot take $0.00: coins never take the card below this. */
export const MIN_CARD_CHARGE = 1;
```

**3b.** Change the signature to:

```js
export function computeFlightCharge({ fareTotal, passengers, travellerTypes, config, discount = 0, walletAmount = 0 } = {}) {
```

and add `@param {number} [p.walletAmount]  Jet Coins in dollars, taken off after the coupon` to its JSDoc.

**3c.** Replace the `return { ... }` block with:

```js
  const afterCoupon = roundMoney(subtotal - appliedDiscount);
  const appliedWallet = roundMoney(Math.min(Math.max(Number(walletAmount) || 0, 0), Math.max(0, afterCoupon - MIN_CARD_CHARGE)));

  return {
    fare,
    passengers: count,
    seatedPassengers: seated,
    fixedFee,
    fixedFeeByType: types ? fixedFeeByType(types, fixedPerPassenger, fixedFee) : null,
    percentage,
    percentageFee,
    serviceFee,
    subtotal,
    discount: appliedDiscount,
    walletAmount: appliedWallet,
    walletCoins: Math.round(appliedWallet * 100),
    total: roundMoney(afterCoupon - appliedWallet),
  };
```

Create `shared/jetCoins.js`:

```js
/**
 * Jet Coins: 1 coin = $0.01. Pure, dependency-free: the browser, the Vercel
 * function and the Lightsail server all load this file.
 */
import { MIN_CARD_CHARGE, roundMoney } from './flightCharge.js';

export const coinsToUsd = (coins) => roundMoney(Math.floor(Number(coins) || 0) / 100);

/** The most coins a checkout can use: never below $1 left on the card. */
export function maxWalletCoinsFor(afterCoupon, balance) {
  const room = Math.round((roundMoney(afterCoupon) - MIN_CARD_CHARGE) * 100);
  const have = Math.floor(Number(balance) || 0);
  return Math.max(0, Math.min(have, room));
}

/** The whole price the customer paid: the card amount plus the coins. */
export const grossPaidOf = (charge) => roundMoney((Number(charge?.total) || 0) + (Number(charge?.walletAmount) || 0));

export const earnedCoinsFor = (cardTotal) => Math.max(0, Math.floor(Number(cardTotal) || 0));

/**
 * Coins a cancel gives back. The card part is decided by decideFlightRefund on
 * what ARC holds; coins cover the rest of what is owed, never more than used.
 */
export function coinsBackOnCancel({ action, heldAmount, kept, coins }) {
  const all = Math.max(0, Math.floor(Number(coins) || 0));
  if (action === 'refund_all' || action === 'refund_less_fee') return all;
  if (action === 'fee_covers') {
    const owedCents = Math.round(((Number(heldAmount) || 0) - (Number(kept) || 0)) * 100) + all;
    return Math.max(0, Math.min(all, owedCents));
  }
  return 0;
}

export const formatCoins = (coins) => new Intl.NumberFormat('en-US').format(Math.floor(Number(coins) || 0));
```

In `shared/flightCancelPolicy.js`:

**3d.** Add this import at the top:

```js
import { grossPaidOf } from './jetCoins.js';
```

**3e.** In `customerCancelTerms`, replace the first three lines of the body with:

```js
  const paid = known(charge?.total) ? cents(grossPaidOf(charge)) : null;
  const serviceFeeKept = Math.min(serviceFeeKeptOf(charge) ?? 0, paid ?? Infinity);
  const airlinePrice = paid === null ? null : cents(Math.max(0, paid - serviceFeeKept));
  const walletCoins = Math.max(0, Math.floor(Number(charge?.walletCoins) || 0));
  const coinsBack = airlinePrice === null ? 0 : Math.min(walletCoins, Math.round(airlinePrice * 100));
  const cardBack = airlinePrice === null ? null : cents(airlinePrice - coinsBack / 100);
```

**3f.** Add `coinsBack, cardBack,` to the `base` object.

**3g.** In `cancelTermsLines(terms, …)`, push this line before the function's final `return lines`, when `terms.coinsBack > 0`:

```js
  if (terms.coinsBack > 0) {
    lines.push(`${money(terms.coinsBack / 100)} goes back to your Jet Wallet as ${terms.coinsBack.toLocaleString('en-US')} Jet Coins, and the rest to your card.`);
  }
```

Read `cancelTermsLines` first. If it does not end with `return lines`, add the push where its other lines are pushed.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/utils/jetCoins.test.js tests/utils/flightCharge.test.js tests/backend/flightCharge.test.js tests/utils/flightCancelPolicy.test.js`
Expected: PASS. Any of those existing files that is missing is reported as "No test files found" and can be ignored. Every test in the files that exist passes.

- [ ] **Step 5: Run the full suite with CI's empty env**

Run the Global Constraints command.
Expected: every file passes.

- [ ] **Step 6: Commit**

```bash
git add shared/flightCharge.js shared/jetCoins.js shared/flightCancelPolicy.js tests/utils/jetCoins.test.js
git commit -m "feat(wallet): coin maths - \$1 floor, coupon first, coins back first on a cancel"
```

---

### Task 3: Wallet service and redeem rate limit

**Files:**
- Create: `backend/services/wallet.service.js`
- Modify: `backend/middleware/security.js` (add `voucherRedeemLimiter` after `guestBookingLimiter`)
- Test: `tests/backend/walletService.test.js`

**Interfaces:**
- **Consumes:** the SQL functions from Task 1; `coinsToUsd` from Task 2.
- **Produces from `backend/services/wallet.service.js`:**
  - `WalletError` (`.code`)
  - `readBalance(client, userId): Promise<number>`
  - `walletSummary(client, userId): Promise<{balance, balanceUsd, held, entries}>`
  - `holdCoins(client, {userId, bookingReference, coins})`
  - `captureCoins(client, bookingReference): Promise<{status}>`
  - `releaseCoins(client, bookingReference)`
  - `returnCoins(client, {bookingReference, coins, reason}): Promise<number>`
  - `returnAllCoins(client, bookingReference, reason): Promise<{ok, coins, error?}>` (never throws)
  - `earnCoins(client, {userId, bookingReference, coins})`
  - `reverseEarnedCoins(client, bookingReference): Promise<number>`
  - `redeemVoucher(client, {userId, code})`
  - `VOUCHER_MESSAGES`
- **Produces from `backend/middleware/security.js`:** `voucherRedeemLimiter`.

- [ ] **Step 1: Write the failing test**

`tests/backend/walletService.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import {
  WalletError, captureCoins, holdCoins, readBalance, redeemVoucher, returnAllCoins, returnCoins, walletSummary,
} from '../../backend/services/wallet.service.js';

const rpcClient = (answer) => ({ rpc: vi.fn(async () => answer) });

const tableClient = (tables) => ({
  from: vi.fn((table) => {
    const chain = {};
    for (const op of ['select', 'eq', 'order', 'limit']) chain[op] = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => tables[table]);
    chain.then = (resolve) => resolve(tables[table]);
    return chain;
  }),
});

describe('the wallet service', () => {
  it('calls the hold function with the customer, the checkout and the coins', async () => {
    const client = rpcClient({ data: { status: 'held', coins: 500, balance: 4500 }, error: null });
    const result = await holdCoins(client, { userId: 'u1', bookingReference: 'FLT1', coins: 500 });
    expect(client.rpc).toHaveBeenCalledWith('wallet_hold', { p_user: 'u1', p_ref: 'FLT1', p_coins: 500 });
    expect(result.status).toBe('held');
  });

  it('names a refused hold for what it is', async () => {
    const client = rpcClient({ data: null, error: { message: 'INSUFFICIENT_COINS' } });
    await expect(holdCoins(client, { userId: 'u1', bookingReference: 'FLT1', coins: 500 }))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_COINS' });
  });

  it('calls any other database failure WALLET_UNAVAILABLE, a missing customer row included', async () => {
    const client = rpcClient({ data: null, error: { message: 'insert or update on table "wallets" violates foreign key constraint' } });
    await expect(holdCoins(client, { userId: 'u1', bookingReference: 'FLT1', coins: 5 }))
      .rejects.toBeInstanceOf(WalletError);
    await expect(holdCoins(client, { userId: 'u1', bookingReference: 'FLT1', coins: 5 }))
      .rejects.toMatchObject({ code: 'WALLET_UNAVAILABLE' });
  });

  it('returns the coins given back', async () => {
    const client = rpcClient({ data: { status: 'captured', coins: 1500 }, error: null });
    expect(await returnCoins(client, { bookingReference: 'FLT1', coins: 1500, reason: 'cancel' })).toBe(1500);
  });

  it('never throws when giving every coin back, and says when it could not', async () => {
    const client = rpcClient({ data: null, error: { message: 'connection reset' } });
    const result = await returnAllCoins(client, 'FLT1', 'reversal');
    expect(result.ok).toBe(false);
    expect(result.coins).toBe(0);
  });

  it('reads captures', async () => {
    const client = rpcClient({ data: { status: 'captured' }, error: null });
    expect((await captureCoins(client, 'FLT1')).status).toBe('captured');
  });

  it('maps voucher refusals', async () => {
    const client = rpcClient({ data: null, error: { message: 'VOUCHER_ALREADY_REDEEMED' } });
    await expect(redeemVoucher(client, { userId: 'u1', code: 'X' })).rejects.toMatchObject({ code: 'VOUCHER_ALREADY_REDEEMED' });
  });

  it('sums the balance, what is held and the history', async () => {
    const client = tableClient({
      wallets: { data: { balance: 4500 }, error: null },
      wallet_holds: { data: [{ coins: 500 }, { coins: 250 }], error: null },
      wallet_entries: { data: [{ id: 1, kind: 'voucher', coins: 5000 }], error: null },
    });
    const summary = await walletSummary(client, 'u1');
    expect(summary).toMatchObject({ balance: 4500, balanceUsd: 45, held: 750 });
    expect(summary.entries).toHaveLength(1);
  });

  it('reads no wallet as zero coins', async () => {
    const client = tableClient({ wallets: { data: null, error: null } });
    expect(await readBalance(client, 'u1')).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/backend/walletService.test.js`
Expected: FAIL with `Failed to resolve import "../../backend/services/wallet.service.js"`.

- [ ] **Step 3: Implement**

`backend/services/wallet.service.js`:

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
  'INSUFFICIENT_COINS', 'HOLD_CONFLICT', 'BAD_COINS',
  'VOUCHER_NOT_FOUND', 'VOUCHER_INACTIVE', 'VOUCHER_NOT_STARTED', 'VOUCHER_EXPIRED',
  'VOUCHER_USED_UP', 'VOUCHER_ALREADY_REDEEMED',
];

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

export async function walletSummary(client, userId) {
  const [wallet, holds, entries] = await Promise.all([
    client.from('wallets').select('balance').eq('user_id', userId).maybeSingle(),
    client.from('wallet_holds').select('coins').eq('user_id', userId).eq('status', 'held'),
    client.from('wallet_entries')
      .select('id, kind, coins, balance_after, booking_reference, note, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  const error = wallet.error || holds.error || entries.error;
  if (error) throw new WalletError('WALLET_UNAVAILABLE', error.message);
  const balance = Number(wallet.data?.balance) || 0;
  const held = (holds.data || []).reduce((sum, hold) => sum + (Number(hold.coins) || 0), 0);
  return { balance, balanceUsd: coinsToUsd(balance), held, entries: entries.data || [] };
}

export const holdCoins = (client, { userId, bookingReference, coins }) =>
  call(client, 'wallet_hold', { p_user: userId, p_ref: bookingReference, p_coins: Math.floor(coins) });

export const captureCoins = (client, bookingReference) => call(client, 'wallet_capture', { p_ref: bookingReference });

export const releaseCoins = (client, bookingReference) => call(client, 'wallet_release', { p_ref: bookingReference });

export async function returnCoins(client, { bookingReference, coins, reason }) {
  const result = await call(client, 'wallet_return', { p_ref: bookingReference, p_coins: Math.floor(coins), p_reason: reason });
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

export const VOUCHER_MESSAGES = {
  VOUCHER_NOT_FOUND: 'That voucher code was not found. Please check it and try again.',
  VOUCHER_INACTIVE: 'This voucher is no longer active.',
  VOUCHER_NOT_STARTED: 'This voucher cannot be used yet.',
  VOUCHER_EXPIRED: 'This voucher has expired.',
  VOUCHER_USED_UP: 'This voucher has been fully redeemed.',
  VOUCHER_ALREADY_REDEEMED: 'You have already redeemed this voucher.',
};
```

In `backend/middleware/security.js`, after `guestBookingLimiter`, add:

```js
/**
 * Voucher codes are words an admin chose, so they can be guessed: ten wrong
 * tries per customer per 15 minutes. In-memory, per instance, like the others.
 */
export const voucherRedeemLimiter = rateLimit({
  windowMs: minutes(15),
  max: Number(process.env.RATE_LIMIT_VOUCHER_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req.ip || '')),
  message: {
    success: false,
    code: 'RATE_LIMITED',
    error: 'Too many voucher attempts. Please wait 15 minutes and try again.',
  },
});
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/backend/walletService.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/services/wallet.service.js backend/middleware/security.js tests/backend/walletService.test.js
git commit -m "feat(wallet): wallet service over the coin functions, and a limit on voucher guesses"
```

---

### Task 4: API: customer wallet, voucher redeem, admin vouchers, staff coin return

**Files:**
- Create: `backend/controllers/wallet.controller.js`
- Create: `backend/controllers/vouchers.controller.js`
- Create: `backend/routes/wallet.routes.js`
- Create: `backend/routes/vouchers.routes.js`
- Modify: `server.js` (after line 139, the `/api/users/me/travellers` mount)
- Modify: `backend/server.js` (after line 192)
- Modify: `backend/api/index.js` (after line 82, and next to line 126 for the bare forms)
- Test: `tests/backend/walletRoutes.test.js`, `tests/backend/vouchersController.test.js`

**Interfaces:**
- **Consumes:** Task 3's service.
- **Produces (customer):**
  - `GET /api/wallet` → `{success, data: {balance, balanceUsd, held, entries}}`
  - `POST /api/wallet/redeem {code}` → `{success, data: {coins, balance, code}}`
- **Produces (staff):** `POST /api/wallet/staff-return {bookingReference, coins, reason}` (protect + bookingStaff) → `{success, data: {coins}}`
- **Produces (admin):**
  - `GET /api/vouchers`
  - `POST /api/vouchers {code, valueUsd, maxRedemptions?, validFrom?, validUntil?, note?}`
  - `PUT /api/vouchers/:id`
  - `GET /api/vouchers/:id/redemptions`

- [ ] **Step 1: Write the failing tests**

`tests/backend/walletRoutes.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseMock } from './setup.js';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { getWallet, redeem, staffReturn } from '../../backend/controllers/wallet.controller.js';

const USER = { id: '0b7c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4', role: 'user' };

const run = async (handler, { body = {}, user = USER } = {}) => {
  const res = createResponse();
  await handler(createRequest({ user, body }), res);
  return res;
};

describe('the customer wallet routes', () => {
  beforeEach(() => { supabaseMock.rpc = vi.fn(); });

  it('redeems a voucher for the signed-in customer, never one named in the body', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { coins: 5000, balance: 5000, code: 'SHUBHAM' }, error: null });
    const res = await run(redeem, { body: { code: ' shubham ', userId: 'someone-else' } });
    expect(supabaseMock.rpc).toHaveBeenCalledWith('redeem_voucher', { p_user: USER.id, p_code: 'SHUBHAM' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({ coins: 5000, balance: 5000, code: 'SHUBHAM' });
  });

  it('answers a used voucher in words, with its code', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'VOUCHER_ALREADY_REDEEMED' } });
    const res = await run(redeem, { body: { code: 'SHUBHAM' } });
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'VOUCHER_ALREADY_REDEEMED', error: 'You have already redeemed this voucher.' });
  });

  it('refuses a malformed code without asking the database', async () => {
    const res = await run(redeem, { body: { code: 'a b' } });
    expect(res.statusCode).toBe(404);
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it('says the wallet is unavailable rather than failing bare', async () => {
    supabaseMock.from.mockImplementationOnce(() => { throw new Error('down'); });
    const res = await run(getWallet);
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('WALLET_UNAVAILABLE');
  });

  it('lets staff return coins on a booking, once per press', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: { status: 'captured', coins: 2000 }, error: null })
      .mockResolvedValueOnce({ data: { coins: 0 }, error: null });
    const res = await run(staffReturn, { body: { bookingReference: 'FLT1', coins: 2000, reason: 'refund' }, user: { id: 's1', role: 'support' } });
    expect(supabaseMock.rpc.mock.calls[0][0]).toBe('wallet_return');
    expect(supabaseMock.rpc.mock.calls[0][1]).toMatchObject({ p_ref: 'FLT1', p_coins: 2000 });
    expect(supabaseMock.rpc.mock.calls[0][1].p_reason).toMatch(/^desk-/);
    expect(supabaseMock.rpc.mock.calls[1][0]).toBe('wallet_reverse_earn');
    expect(res.body.data.coins).toBe(2000);
  });
});
```

`tests/backend/vouchersController.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseMock } from './setup.js';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { createVoucher, updateVoucher, voucherInput } from '../../backend/controllers/vouchers.controller.js';

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
    return chain;
  });
  return writes;
};

describe('admin vouchers', () => {
  beforeEach(() => supabaseMock.from.mockReset());

  it('reads the form into coins, an uppercase code and dates', () => {
    expect(voucherInput({ code: ' shubham ', valueUsd: '50', maxRedemptions: '', validUntil: '2026-12-31' })).toEqual({
      ok: true,
      row: { code: 'SHUBHAM', coins: 5000, max_redemptions: null, valid_from: null, valid_until: '2026-12-31T23:59:59.999Z', note: null },
    });
  });

  it('refuses a bad code or value in words', () => {
    expect(voucherInput({ code: 'a b', valueUsd: 50 }).ok).toBe(false);
    expect(voucherInput({ code: 'GOOD', valueUsd: 0 }).ok).toBe(false);
    expect(voucherInput({ code: 'GOOD', valueUsd: 20000 }).ok).toBe(false);
  });

  it('creates a voucher and records who made it', async () => {
    const writes = tables({ vouchers: { data: { id: 'v1', code: 'SHUBHAM', coins: 5000 }, error: null } });
    const res = await run(createVoucher, { body: { code: 'shubham', valueUsd: 50 } });
    expect(res.statusCode).toBe(201);
    expect(writes[0][2]).toMatchObject({ code: 'SHUBHAM', coins: 5000, created_by: 'a1' });
  });

  it('says a taken code is taken', async () => {
    tables({ vouchers: { data: null, error: { code: '23505', message: 'duplicate key' } } });
    const res = await run(createVoucher, { body: { code: 'TAKEN', valueUsd: 10 } });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('CODE_TAKEN');
  });

  it('will not change the code or the value of a voucher already redeemed', async () => {
    tables({ vouchers: { data: { id: 'v1', code: 'SHUBHAM', coins: 5000, redemptions_count: 1 }, error: null } });
    const res = await run(updateVoucher, { params: { id: 'v1' }, body: { valueUsd: 80 } });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('VOUCHER_LOCKED');
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/backend/walletRoutes.test.js tests/backend/vouchersController.test.js`
Expected: FAIL on the unresolved imports of the two controllers.

- [ ] **Step 3: Implement**

`backend/controllers/wallet.controller.js`:

```js
import supabase from '../config/supabase.js';
import {
  VOUCHER_MESSAGES, redeemVoucher, returnCoins, reverseEarnedCoins, walletSummary,
} from '../services/wallet.service.js';

const CODE_PATTERN = /^[A-Z0-9-]{3,32}$/;
const STATUS = { VOUCHER_NOT_FOUND: 404, VOUCHER_ALREADY_REDEEMED: 409, VOUCHER_USED_UP: 409 };

export async function getWallet(req, res) {
  try {
    return res.json({ success: true, data: await walletSummary(supabase, req.user.id) });
  } catch (error) {
    console.error('⚠️ Wallet could not be read:', error.message);
    return res.status(503).json({ success: false, code: 'WALLET_UNAVAILABLE', error: 'Your Jet Wallet could not be loaded just now. Please try again.' });
  }
}

export async function redeem(req, res) {
  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) {
    return res.status(404).json({ success: false, code: 'VOUCHER_NOT_FOUND', error: VOUCHER_MESSAGES.VOUCHER_NOT_FOUND });
  }
  try {
    const result = await redeemVoucher(supabase, { userId: req.user.id, code });
    return res.json({ success: true, data: { coins: Number(result.coins), balance: Number(result.balance), code: result.code } });
  } catch (error) {
    if (VOUCHER_MESSAGES[error.code]) {
      return res.status(STATUS[error.code] || 400).json({ success: false, code: error.code, error: VOUCHER_MESSAGES[error.code] });
    }
    console.error('⚠️ Voucher could not be redeemed:', error.message);
    return res.status(503).json({ success: false, code: 'WALLET_UNAVAILABLE', error: 'The voucher could not be redeemed just now. Please try again.' });
  }
}

export async function staffReturn(req, res) {
  const bookingReference = String(req.body?.bookingReference || '').trim();
  const coins = Math.floor(Number(req.body?.coins));
  if (!bookingReference || !Number.isFinite(coins) || coins <= 0) {
    return res.status(400).json({ success: false, error: 'A booking reference and a number of coins are needed.' });
  }
  try {
    const given = await returnCoins(supabase, { bookingReference, coins, reason: `desk-${Date.now()}` });
    if (given > 0) await reverseEarnedCoins(supabase, bookingReference);
    return res.json({ success: true, data: { coins: given }, message: `${given.toLocaleString('en-US')} Jet Coins returned` });
  } catch (error) {
    console.error('⚠️ Staff coin return failed:', error.message);
    return res.status(503).json({ success: false, error: 'The coins could not be returned just now. Nothing changed; try again.' });
  }
}
```

`backend/controllers/vouchers.controller.js`:

```js
import supabase from '../config/supabase.js';

const CODE_PATTERN = /^[A-Z0-9-]{3,32}$/;
const MAX_VALUE_USD = 10000;

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
  return {
    ok: true,
    row: {
      code,
      coins: Math.round(value * 100),
      max_redemptions: limit,
      valid_from: validFrom,
      valid_until: validUntil,
      note: body.note ? String(body.note).slice(0, 200) : null,
    },
  };
}

export async function listVouchers(req, res) {
  const { data, error } = await supabase.from('vouchers').select('*').order('created_at', { ascending: false });
  if (error) return res.status(503).json({ success: false, error: 'Vouchers could not be loaded.' });
  return res.json({ success: true, data: data || [] });
}

export async function createVoucher(req, res) {
  const input = voucherInput(req.body);
  if (!input.ok) return res.status(400).json({ success: false, error: input.error });
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
  if ((changesValue || changesCode) && Number(current.redemptions_count) > 0) {
    return res.status(409).json({ success: false, code: 'VOUCHER_LOCKED', error: 'Customers have redeemed this voucher, so its code and value cannot change.' });
  }
  const input = voucherInput({
    code: body.code ?? current.code,
    valueUsd: body.valueUsd ?? Number(current.coins) / 100,
    maxRedemptions: body.maxRedemptions !== undefined ? body.maxRedemptions : current.max_redemptions,
    validFrom: body.validFrom !== undefined ? body.validFrom : current.valid_from,
    validUntil: body.validUntil !== undefined ? body.validUntil : current.valid_until,
    note: body.note !== undefined ? body.note : current.note,
  });
  if (!input.ok) return res.status(400).json({ success: false, error: input.error });
  const update = { ...input.row, updated_at: new Date().toISOString() };
  if (typeof body.isActive === 'boolean') update.is_active = body.isActive;
  const { data, error } = await supabase.from('vouchers').update(update).eq('id', current.id).select().single();
  if (error?.code === '23505') return res.status(409).json({ success: false, code: 'CODE_TAKEN', error: 'A voucher with this code already exists.' });
  if (error) return res.status(503).json({ success: false, error: 'The voucher could not be saved.' });
  return res.json({ success: true, data });
}

export async function listRedemptions(req, res) {
  const { data, error } = await supabase.from('voucher_redemptions')
    .select('id, coins, created_at, user_id, users(email)')
    .eq('voucher_id', req.params.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(503).json({ success: false, error: 'Redemptions could not be loaded.' });
  return res.json({
    success: true,
    data: (data || []).map((row) => ({ id: row.id, coins: row.coins, createdAt: row.created_at, userId: row.user_id, email: row.users?.email || null })),
  });
}
```

`backend/routes/wallet.routes.js`:

```js
import express from 'express';
import { bookingStaff, protect } from '../middleware/auth.middleware.js';
import { voucherRedeemLimiter } from '../middleware/security.js';
import { getWallet, redeem, staffReturn } from '../controllers/wallet.controller.js';

const router = express.Router();

router.get('/', protect, getWallet);
router.post('/redeem', protect, voucherRedeemLimiter, redeem);
router.post('/staff-return', protect, bookingStaff, staffReturn);

export default router;
```

`backend/routes/vouchers.routes.js`:

```js
import express from 'express';
import { admin, protect } from '../middleware/auth.middleware.js';
import { createVoucher, listRedemptions, listVouchers, updateVoucher } from '../controllers/vouchers.controller.js';

const router = express.Router();

router.get('/', protect, admin, listVouchers);
router.post('/', protect, admin, createVoucher);
router.put('/:id', protect, admin, updateVoucher);
router.get('/:id/redemptions', protect, admin, listRedemptions);

export default router;
```

Mount the routes in all three entry points.

In `server.js`: next to the `savedTravellersRoutes` import, add:

```js
import walletRoutes from "./backend/routes/wallet.routes.js";
import voucherRoutes from "./backend/routes/vouchers.routes.js";
```

and after `app.use("/api/users/me/travellers", savedTravellersRoutes);` add:

```js
app.use("/api/wallet", walletRoutes);
app.use("/api/vouchers", voucherRoutes);
```

In `backend/server.js`, the same with `./routes/...` import paths and single-quoted strings:

```js
app.use('/api/wallet', walletRoutes);
app.use('/api/vouchers', voucherRoutes);
```

In `backend/api/index.js`, imports with `../routes/...` paths. After line 82 add:

```js
app.use("/api/wallet", walletRoutes);
app.use("/api/vouchers", voucherRoutes);
```

and next to line 126 (`app.use("/coupons", couponRoutes);`) add:

```js
app.use("/wallet", walletRoutes);
app.use("/vouchers", voucherRoutes);
```

`supabaseMock` has no `rpc` by default; the tests set `supabaseMock.rpc = vi.fn()` in `beforeEach`.

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run tests/backend/walletRoutes.test.js tests/backend/vouchersController.test.js`
Expected: PASS (5 + 5 tests).

- [ ] **Step 5: Check that the routes load in all three entry points**

Run: `node -e "import('./backend/api/index.js').then(()=>console.log('vercel ok'))" && node --check server.js && node --check backend/server.js`
Expected: `vercel ok`, then no syntax errors. If importing `backend/api/index.js` needs env vars and throws on a missing Supabase key, rely on `node --check backend/api/index.js` and the unit suite instead.

- [ ] **Step 6: Commit**

```bash
git add backend/controllers/wallet.controller.js backend/controllers/vouchers.controller.js backend/routes/wallet.routes.js backend/routes/vouchers.routes.js server.js backend/server.js backend/api/index.js tests/backend/walletRoutes.test.js tests/backend/vouchersController.test.js
git commit -m "feat(wallet): wallet and voucher API, admin voucher CRUD, staff coin return"
```

---

### Task 5: Checkout: price coins in, hold them, release on any failed exit

**Files:**
- Modify: `backend/services/flightCheckout.service.js` (`verifyFlightCharge`, lines 184-396)
- Modify: `backend/utils/tripMatch.js` (`checkoutKey`, lines 84-104)
- Modify: `backend/routes/payment/checkout.handlers.js` (`handleHostedCheckout`, lines 640-1180)
- Test: `tests/backend/walletCheckout.test.js`, `tests/backend/walletHostedCheckout.test.js`

**Interfaces:**
- **Consumes:**
  - `computeFlightCharge({ walletAmount })` and `maxWalletCoinsFor` (Task 2)
  - `readBalance`, `holdCoins`, `releaseCoins` (Task 3)
- **Produces:**
  - `verifyFlightCharge({ ..., walletCoins = 0 })` → `{ ok, charge, coupon, wallet: {coins, amount} | null, pricedFare }`
  - `verified_charge.wallet` on the booking row
  - the hosted-checkout body field `walletCoins`
  - the 409 code `WALLET_CHANGED`
  - `checkoutKey({ ..., walletCoins })`

- [ ] **Step 1: Write the failing test**

`tests/backend/walletCheckout.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { verifyFlightCharge } from '../../backend/services/flightCheckout.service.js';
import { checkoutKey } from '../../backend/utils/tripMatch.js';

const offer = {
  itineraries: [{ segments: [{ carrierCode: 'DL', number: '713', departure: { iataCode: 'JFK', at: '2026-11-03T08:00:00' }, arrival: { iataCode: 'LAX', at: '2026-11-03T11:05:00' } }] }],
  travelerPricings: [{ travelerType: 'ADULT' }],
};
const traveller = { firstName: 'ASHA', lastName: 'RAO', gender: 'FEMALE', dateOfBirth: '1990-01-01', type: 'ADULT' };
const bookingData = { originalOffer: offer, passengerData: [traveller] };

const clientWith = ({ balance = 5000, balanceError = null } = {}) => ({
  from: vi.fn((table) => {
    const chain = {};
    for (const op of ['select', 'eq', 'order', 'limit']) chain[op] = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => (table === 'wallets'
      ? { data: balanceError ? null : { balance }, error: balanceError }
      : { data: null, error: null }));
    chain.single = chain.maybeSingle;
    return chain;
  }),
});

const priceOffer = async () => ({
  price: { total: '120.00', grandTotal: '120.00', currency: 'USD', base: '100.00' },
  segments: [{ marketingCarrier: 'DL', flightNumber: '713', boardPoint: 'JFK', offPoint: 'LAX' }],
  _ama: { bookingEnabled: true, international: false },
});

vi.mock('../../backend/services/priceSettings.service.js', () => ({
  readPriceSettings: async () => ({ flight_taxes_fees: 1, flight_taxes_fees_percentage: 1 }),
}));

describe('coins at checkout', () => {
  it('prices coins in and leaves the card the rest', async () => {
    const verdict = await verifyFlightCharge({
      client: clientWith(), amount: 72.2, bookingData, userId: 'u1', walletCoins: 5000, priceOffer,
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.wallet).toEqual({ coins: 5000, amount: 50 });
    expect(verdict.charge.total).toBe(72.2);
  });

  it('uses no more coins than the customer holds', async () => {
    const verdict = await verifyFlightCharge({
      client: clientWith({ balance: 1000 }), amount: 112.2, bookingData, userId: 'u1', walletCoins: 5000, priceOffer,
    });
    expect(verdict.wallet).toEqual({ coins: 1000, amount: 10 });
  });

  it('refuses coins without an account', async () => {
    const verdict = await verifyFlightCharge({
      client: clientWith(), amount: 72.2, bookingData, userId: null, walletCoins: 5000, priceOffer,
    });
    expect(verdict).toMatchObject({ ok: false, status: 401, code: 'LOGIN_REQUIRED' });
  });

  it('says so when the wallet cannot be read, and charges nothing', async () => {
    const verdict = await verifyFlightCharge({
      client: clientWith({ balanceError: { message: 'down' } }), amount: 72.2, bookingData, userId: 'u1', walletCoins: 5000, priceOffer,
    });
    expect(verdict).toMatchObject({ ok: false, status: 503, code: 'WALLET_UNAVAILABLE' });
  });

  it('checks out with no coins exactly as before', async () => {
    const verdict = await verifyFlightCharge({ client: clientWith(), amount: 122.2, bookingData, userId: 'u1', priceOffer });
    expect(verdict.ok).toBe(true);
    expect(verdict.wallet).toBeNull();
  });

  it('keys a checkout by its coins, so different coins are a different page', () => {
    const base = { bookingData: { ...bookingData, bookingDetails: { contact: { email: 'a@b.c' } } }, customerEmail: 'a@b.c', total: 72.2 };
    expect(checkoutKey({ ...base, walletCoins: 5000 })).not.toBe(checkoutKey({ ...base, walletCoins: 1000 }));
    expect(checkoutKey({ ...base })).toBe(checkoutKey({ ...base, walletCoins: 0 }));
  });
});
```

Adapt the mock path to `readPriceSettings`'s real module. Find it with `grep -n "readPriceSettings" backend/services/flightCheckout.service.js` and mock that import path. If the existing `tests/backend/flightCheckout.test.js` already builds a valid offer, traveller and pricing stub, copy its fixtures instead of the ones above, so `bookingTravellerProblems` passes. The assertions are what matter.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/backend/walletCheckout.test.js`
Expected: FAIL, because `verdict.wallet` is `undefined` (the field does not exist yet).

- [ ] **Step 3: Implement `verifyFlightCharge`**

**3a.** In `backend/services/flightCheckout.service.js`, add these imports:

```js
import { maxWalletCoinsFor } from '../../shared/jetCoins.js';
import { readBalance } from './wallet.service.js';
```

**3b.** Add `walletCoins = 0,` to the destructured parameters (after `email,`).

**3c.** Replace the block from `const charge = computeFlightCharge({ fareTotal, travellerTypes, config, discount });` up to (not including) `const requested = roundMoney(amount);` with:

```js
  const afterCoupon = computeFlightCharge({ fareTotal, travellerTypes, config, discount });

  // A coupon worth the whole booking leaves nothing to charge, and a payment
  // page cannot be opened for $0.00. The page sent 0, and checkout answered
  // with its own internal "Missing required fields" message.
  if (coupon && afterCoupon.total <= 0) {
    return refuse(409, 'COUPON_INVALID',
      'This coupon covers the whole fare, and a booking cannot be paid for at $0.00 online. Please call (877) 538-7380 to use it.',
      { pricedFare });
  }

  let wallet = null;
  const askedCoins = Math.floor(Number(walletCoins) || 0);
  if (askedCoins > 0) {
    if (!userId) {
      return refuse(401, 'LOGIN_REQUIRED', 'Please log in to use your Jet Coins. Nothing has been charged.', { pricedFare });
    }
    let balance;
    try {
      balance = await readBalance(client, userId);
    } catch (error) {
      console.warn('Checkout could not read the Jet Wallet:', error?.message || error);
      return refuse(503, 'WALLET_UNAVAILABLE', 'We could not check your Jet Coins just now. Please try again in a moment.', { pricedFare });
    }
    const coins = maxWalletCoinsFor(afterCoupon.total, Math.min(askedCoins, balance));
    if (coins > 0) wallet = { coins, amount: roundMoney(coins / 100) };
  }

  const charge = computeFlightCharge({ fareTotal, travellerTypes, config, discount, walletAmount: wallet ? wallet.amount : 0 });
```

**3d.** Change the final return to:

```js
  return { ok: true, charge, coupon, wallet, pricedFare };
```

and add `wallet` to the JSDoc `@returns`.

In `backend/utils/tripMatch.js`:

**3e.** Change the `checkoutKey` signature to:

```js
export function checkoutKey({ bookingData, customerEmail, total, couponCode, walletCoins = 0 } = {}) {
```

and add `walletCoins` to its JSDoc param.

**3f.** Replace the last two array entries (`upper(couponCode),` then `cents,`) with:

```js
    upper(couponCode),
    cents,
    ...(Math.floor(Number(walletCoins) || 0) > 0 ? [Math.floor(Number(walletCoins))] : []),
```

so that keys for checkouts without coins are unchanged.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/backend/walletCheckout.test.js tests/backend/flightCheckout.test.js`
Expected: PASS for every test in both files.

- [ ] **Step 5: Hold and release coins in `handleHostedCheckout`**

In `backend/routes/payment/checkout.handlers.js`:

**5a.** Add this import:

```js
import { holdCoins, releaseCoins } from '../../services/wallet.service.js';
```

**5b.** Next to `let tripLock` (declared before the `try`), declare:

```js
    let heldCoinsRef = null;
    let checkoutDone = false;
```

**5c.** In the first `findReusableCheckout` call, change the key to:

```js
                key: checkoutKey({ bookingData, customerEmail, total: amount, couponCode: req.body.couponCode, walletCoins: req.body.walletCoins }),
```

**5d.** Pass `walletCoins: req.body.walletCoins,` into `verifyFlightCharge({...})`.

**5e.** Set `verifiedCharge` to:

```js
            verifiedCharge = {
                ...verdict.charge,
                coupon: verdict.coupon,
                wallet: verdict.wallet,
                pricedFare: verdict.pricedFare,
                verifiedAt: new Date().toISOString(),
            };
```

**5f.** In the second `findReusableCheckout` call, change the key to:

```js
                key: checkoutKey({ bookingData, customerEmail, total: chargeAmount, couponCode: verifiedCharge?.coupon?.code, walletCoins: verifiedCharge?.wallet?.coins }),
```

**5g.** Immediately after that `if (reusable) return handBack(reusable);` (still inside `if (bookingType === 'flight') { ... }`), add:

```js
            // The coins are taken now, before a payment page exists, so a second
            // tab cannot spend them too. Any way out below that does not hand
            // the customer a page gives them back (finally).
            if (verifiedCharge?.wallet?.coins > 0) {
                try {
                    await holdCoins(supabase, { userId: resolveBookingUserId(req), bookingReference: orderId, coins: verifiedCharge.wallet.coins });
                    heldCoinsRef = orderId;
                } catch (walletError) {
                    const changed = walletError.code === 'INSUFFICIENT_COINS' || walletError.code === 'HOLD_CONFLICT';
                    return res.status(changed ? 409 : 503).json({
                        success: false,
                        code: changed ? 'WALLET_CHANGED' : 'WALLET_UNAVAILABLE',
                        error: changed
                            ? 'Your Jet Coins changed while you were checking out. Please review the total and try again. Nothing has been charged.'
                            : 'We could not use your Jet Coins just now. Please try again in a moment. Nothing has been charged.',
                    });
                }
            }
```

**5h.** Immediately before the final `return res.status(200).json({ success: true, sessionId, ... })`, add:

```js
        checkoutDone = true;
```

**5i.** In the `finally` block, before the lock release, add:

```js
        if (heldCoinsRef && !checkoutDone) {
            try {
                await releaseCoins(supabase, heldCoinsRef);
            } catch (releaseError) {
                console.error('⚠️ Coins held for a checkout that never opened could not be released', { orderId: heldCoinsRef, code: releaseError.code });
            }
        }
```

- [ ] **Step 6: Add the handler test for the hold**

Create `tests/backend/walletHostedCheckout.test.js`. It uses the harness from `tests/backend/checkoutReuse.test.js`: `fakeBookingsTable`, axios mocked by the test setup, `vi.doMock` of the checkout service and the ARC config.

```js
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

const CUSTOMER = { id: '0b7c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4' };
const SITE = 'https://www.jetsetterss.com';
const offer = {
  id: '1',
  itineraries: [{ segments: [{ carrierCode: 'DL', number: '713', departure: { iataCode: 'JFK', at: '2026-11-03T08:00:00' }, arrival: { iataCode: 'LAX' } }] }],
  price: { total: '120.00', currency: 'USD' },
  travelerPricings: [{ travelerId: '1', travelerType: 'ADULT' }],
};
const bookingData = {
  originalOffer: offer,
  passengerData: [{ firstName: 'Jane', lastName: 'Doe', gender: 'female', dateOfBirth: '1990-01-01', type: 'ADULT' }],
  bookingDetails: { contact: { email: 'jane@example.com', phone: '5550100' } },
};
const verdict = { ok: true, charge: { total: 72.2, walletAmount: 50, walletCoins: 5000 }, coupon: null, wallet: { coins: 5000, amount: 50 }, pricedFare: { total: 120, currency: 'USD' } };

const checkout = async ({ holdCoins, releaseCoins }) => {
  const table = fakeBookingsTable([]);
  vi.doMock('../../backend/services/flightCheckout.service.js', () => ({ verifyFlightCharge: vi.fn().mockResolvedValue(verdict) }));
  vi.doMock('../../backend/services/wallet.service.js', () => ({ holdCoins, releaseCoins }));
  vi.doMock('../../backend/routes/payment/arcpay.config.js', async () => {
    const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
    return { ...actual, supabase: { from: table.from }, ARC_PAY_CONFIG: { MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw', BASE_URL: 'https://arc.test/api/rest/version/77' } };
  });
  const { handleHostedCheckout } = await import('../../backend/routes/payment/checkout.handlers.js');
  const req = createRequest({
    method: 'POST',
    user: CUSTOMER,
    body: {
      amount: '72.20', orderId: 'FLTCOINS1', bookingType: 'flight', walletCoins: 5000,
      customerEmail: 'jane@example.com', returnUrl: `${SITE}/payment/callback?orderId=FLTCOINS1&bookingType=flight`, bookingData,
    },
  });
  const res = createResponse();
  await handleHostedCheckout(req, res);
  return res;
};

const openedAPage = () => axios.post.mock.calls.some(([, sent]) => sent?.apiOperation === 'INITIATE_CHECKOUT');

beforeEach(() => {
  vi.resetModules();
  axios.post.mockReset();
});

afterEach(() => {
  vi.doUnmock('../../backend/services/flightCheckout.service.js');
  vi.doUnmock('../../backend/services/wallet.service.js');
  vi.doUnmock('../../backend/routes/payment/arcpay.config.js');
});

describe('the hosted checkout holds coins', () => {
  it('a hold refused for coins spent in another tab answers WALLET_CHANGED and opens no page', async () => {
    const refused = Object.assign(new Error('INSUFFICIENT_COINS'), { code: 'INSUFFICIENT_COINS' });
    const holdCoins = vi.fn().mockRejectedValue(refused);
    const releaseCoins = vi.fn();
    const res = await checkout({ holdCoins, releaseCoins });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('WALLET_CHANGED');
    expect(openedAPage()).toBe(false);
    expect(releaseCoins).not.toHaveBeenCalled();
  });

  it('holds the coins under the checkout reference and keeps them when the page opens', async () => {
    axios.post.mockResolvedValue({ status: 201, data: { result: 'SUCCESS', session: { id: 'S1' }, successIndicator: 'I1' } });
    const holdCoins = vi.fn().mockResolvedValue({ status: 'held' });
    const releaseCoins = vi.fn();
    const res = await checkout({ holdCoins, releaseCoins });
    expect(res.statusCode).toBe(200);
    expect(holdCoins).toHaveBeenCalledWith(expect.anything(), { userId: CUSTOMER.id, bookingReference: 'FLTCOINS1', coins: 5000 });
    expect(releaseCoins).not.toHaveBeenCalled();
  });

  it('gives the coins back when the payment page could not be opened', async () => {
    axios.post.mockRejectedValue(new Error('ARC down'));
    const holdCoins = vi.fn().mockResolvedValue({ status: 'held' });
    const releaseCoins = vi.fn().mockResolvedValue({ status: 'released', coins: 5000 });
    const res = await checkout({ holdCoins, releaseCoins });
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    expect(releaseCoins).toHaveBeenCalledWith(expect.anything(), 'FLTCOINS1');
  });
});
```

Run: `npx vitest run tests/backend/walletHostedCheckout.test.js`
Expected: PASS (3 tests). If `fakeBookingsTable` needs extra tables for the guest-booking flag or price settings, pass them as `fakeBookingsTable([], { tables: {...} })`, as `checkoutReuse.test.js` does. Add `tests/backend/walletHostedCheckout.test.js` to this task's commit.

- [ ] **Step 7: Run the checkout tests and the full suite**

Run: `npx vitest run tests/backend/walletCheckout.test.js`, then the Global Constraints suite command.
Expected: PASS everywhere.

- [ ] **Step 8: Commit**

```bash
git add backend/services/flightCheckout.service.js backend/utils/tripMatch.js backend/routes/payment/checkout.handlers.js tests/backend/walletCheckout.test.js tests/backend/walletHostedCheckout.test.js
git commit -m "feat(wallet): checkout prices coins in, holds them, and gives them back if no page opens"
```

---

### Task 6: Order route: capture coins; full reversals and duplicates return them

**Files:**
- Modify: `backend/routes/flight.routes.js`:
  - the imports
  - `refundOnFulfillmentFailure` (lines 159-260)
  - `refundDuplicatePayment` (lines 1649-1690)
  - the `noteCouponUse` block (lines 3268-3282) and its two call sites (3775, 3915)
  - `chargeBreakdownOf` / `fareBreakdownOf` (4756-4795)
- Test: `tests/backend/walletOrderRoute.test.js`

**Interfaces:**
- **Consumes:** `captureCoins`, `returnAllCoins` (Task 3).
- **Produces:**
  - capture on booking success and on a commit;
  - full coin return on every fulfilment-failure and duplicate refund;
  - `chargeBreakdownOf()` gains `walletAmount` and `walletCoins`;
  - `fareBreakdownOf()` gains `walletAmount`, and its serviceFee fallback counts coins.

- [ ] **Step 1: Write the failing test**

`tests/backend/walletOrderRoute.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseMock } from './setup.js';
import { fareBreakdownOf, settleCoinsAfterBooking } from '../../backend/routes/flight.routes.js';

describe('coins and the order route', () => {
  beforeEach(() => { supabaseMock.rpc = vi.fn(); });

  it('captures the held coins once the booking exists', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { status: 'captured' }, error: null });
    const reported = vi.fn();
    await settleCoinsAfterBooking({ bookingReference: 'FLT1', verifiedCharge: { wallet: { coins: 5000 } } }, { report: reported });
    expect(supabaseMock.rpc).toHaveBeenCalledWith('wallet_capture', { p_ref: 'FLT1' });
    expect(reported).not.toHaveBeenCalled();
  });

  it('reports a hold that was released before the payment landed', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { status: 'released' }, error: null });
    const reported = vi.fn();
    await settleCoinsAfterBooking({ bookingReference: 'FLT1', verifiedCharge: { wallet: { coins: 5000 } } }, { report: reported });
    expect(reported).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ bookingReference: 'FLT1', status: 'released', coins: 5000 }));
  });

  it('does nothing for a booking paid without coins', async () => {
    await settleCoinsAfterBooking({ bookingReference: 'FLT1', verifiedCharge: { total: 100 } });
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it('keeps the receipt adding up with coins', () => {
    expect(fareBreakdownOf({ fare: 120, serviceFee: 2.2, discount: 0, walletAmount: 50, total: 72.2, pricedFare: { base: 100 } }))
      .toMatchObject({ serviceFee: 2.2, walletAmount: 50, totalAmount: 122.2 });
    expect(fareBreakdownOf({ fare: 120, discount: 0, walletAmount: 50, total: 72.2, pricedFare: { base: 100 } }).serviceFee).toBe(2.2);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/backend/walletOrderRoute.test.js`
Expected: FAIL, because `settleCoinsAfterBooking` is not exported.

- [ ] **Step 3: Implement**

In `backend/routes/flight.routes.js`:

**3a.** Add this import:

```js
import { captureCoins, returnAllCoins } from '../services/wallet.service.js';
```

**3b.** Add this exported function, next to `refundOnFulfillmentFailure`:

```js
/**
 * The coins a checkout held, used now that the booking exists. A hold already
 * released means the coins went back to the customer before this payment
 * landed: the booking stands, and someone must take the coins back by hand.
 */
export async function settleCoinsAfterBooking({ bookingReference, verifiedCharge }, { report = reportError } = {}) {
  const coins = Number(verifiedCharge?.wallet?.coins) || 0;
  if (coins <= 0) return;
  try {
    const { status } = await captureCoins(supabase, bookingReference);
    if (status !== 'captured') {
      report(new Error('Jet Coins for a completed booking were not held'), { bookingReference, status, coins });
    }
  } catch (error) {
    report(error, { where: 'settleCoinsAfterBooking', bookingReference, coins });
  }
}
```

**3c.** Add this exported helper next to `settleCoinsAfterBooking`:

```js
/** Every coin a failed or duplicate payment used goes back; a failure is reported, never swallowed. */
export async function giveBackAllCoins(bookingReference, reason, { report = reportError } = {}) {
  const result = await returnAllCoins(supabase, bookingReference, reason);
  if (!result.ok) report(result.error || new Error('Jet Coins were not returned'), { where: 'giveBackAllCoins', bookingReference, reason });
  return result;
}
```

In `refundOnFulfillmentFailure`, add this as the first line of the `if (prior) { ... }` block:

```js
    await giveBackAllCoins(bookingReference || orderId, 'reversal');
```

and right after the line `console.log('💸 Payment reversal result:', reversal.action, '| reversed:', reversal.reversed);` add:

```js
  // The booking failed: every coin it used goes back, whatever the card refund did.
  await giveBackAllCoins(bookingReference || orderId, 'reversal');
```

Add this case to `tests/backend/walletOrderRoute.test.js` (and `giveBackAllCoins` to its import):

```js
  it('reports coins a failed booking could not give back', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    const reported = vi.fn();
    const result = await giveBackAllCoins('FLT1', 'reversal', { report: reported });
    expect(result.ok).toBe(false);
    expect(reported).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ bookingReference: 'FLT1', reason: 'reversal' }));
  });
```

**3d.** In `refundDuplicatePayment`, after its `console.log('💸 Second payment refund: ...')`, add:

```js
  await giveBackAllCoins(bookingReference, 'duplicate');
```

**3e.** Below the `noteCouponUse` definition, add:

```js
    const noteCoinsUsed = () => settleCoinsAfterBooking({ bookingReference: existing.booking_reference, verifiedCharge });
```

and change both `await noteCouponUse();` call sites (around 3775 and 3915) to:

```js
        await noteCouponUse();
        await noteCoinsUsed();
```

keeping each call site's existing indentation.

**3f.** In `chargeBreakdownOf`, add these to the returned object:

```js
    walletAmount: figure(charge.walletAmount),
    walletCoins: figure(charge.walletCoins),
```

**3g.** In `fareBreakdownOf`:
- after the `discount` line add:

```js
  const walletAmount = Number.isFinite(Number(charge.walletAmount)) ? cents(charge.walletAmount) : 0;
```

- change the serviceFee fallback to `cents(total + discount + walletAmount - fare)`;
- add `walletAmount,` to the returned object.

- [ ] **Step 4: Run it and watch it pass, then run the order-route suites**

Run: `npx vitest run tests/backend/walletOrderRoute.test.js tests/backend/chargeBreakdown.test.js tests/backend/couponInFlight.test.js`
Expected: PASS.

Then run the Global Constraints suite command.
Expected: every file passes. The order-route tests use `supabaseMock`, which has no `rpc`. If one now fails with `client.rpc is not a function`, the coins code ran for a booking with no `wallet`. That is a bug: fix the guard (`coins <= 0` returns first) rather than the test.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/flight.routes.js tests/backend/walletOrderRoute.test.js
git commit -m "feat(wallet): bookings capture their coins; failed and duplicate payments give them back"
```

---

### Task 7: Cancels, voids and the desk give coins back; earned coins reversed on refund

**Files:**
- Modify: `backend/routes/payment/operations.handlers.js`:
  - `cancelFlightBooking`, after `const returned = await returnFlightPayment(...)` (around line 926)
  - the `cancellation` record write (around 990)
  - `handlePaymentVoid`, after `console.log('✅ ARC Pay VOID successful'...)` (around line 2238)
- Modify: `backend/routes/flight.routes.js`, the desk row shaper (lines 5534-5559): add `walletCoins` and `walletCoinsReturned`
- Modify: `frontend/src/Pages/Support/SupportQueue.jsx`: a "Return Jet Coins" action
- Test: `tests/backend/walletRefunds.test.js`

**Interfaces:**
- **Consumes:**
  - `coinsBackOnCancel` (Task 2)
  - `returnCoins`, `returnAllCoins`, `releaseCoins`, `reverseEarnedCoins` (Task 3)
  - `POST /api/wallet/staff-return` (Task 4)
- **Produces:**
  - `cancellation.coinsReturned` on the booking row;
  - `coinsReturned` in the cancel response;
  - desk rows with `walletCoins` and `walletCoinsReturned`;
  - the exported pure-ish helper `settleCoinsOnCancel(client, { bookingReference, decision, heldAmount, kept, coins })` → `{ coins, ok }`.

- [ ] **Step 1: Write the failing test**

`tests/backend/walletRefunds.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { settleCoinsOnCancel } from '../../backend/routes/payment/operations.handlers.js';

const clientAnswering = (...answers) => {
  const rpc = vi.fn();
  answers.forEach((answer) => rpc.mockResolvedValueOnce(answer));
  return { rpc };
};

describe('coins on a cancel', () => {
  it('gives every coin back on a free cancel, and takes back nothing earned it never had', async () => {
    const client = clientAnswering({ data: { status: 'captured', coins: 5000 }, error: null }, { data: { coins: 0 }, error: null });
    const result = await settleCoinsOnCancel(client, {
      bookingReference: 'FLT1', decision: { action: 'refund_less_fee' }, heldAmount: 72.2, kept: 2.2, coins: 5000,
    });
    expect(client.rpc).toHaveBeenNthCalledWith(1, 'wallet_return', { p_ref: 'FLT1', p_coins: 5000, p_reason: 'cancel' });
    expect(client.rpc).toHaveBeenNthCalledWith(2, 'wallet_reverse_earn', { p_ref: 'FLT1' });
    expect(result).toEqual({ ok: true, coins: 5000 });
  });

  it('gives back only what is owed when the fee covers the card', async () => {
    const client = clientAnswering({ data: { status: 'captured', coins: 12000 }, error: null }, { data: { coins: 0 }, error: null });
    await settleCoinsOnCancel(client, {
      bookingReference: 'FLT1', decision: { action: 'fee_covers' }, heldAmount: 1, kept: 2.2, coins: 12120,
    });
    expect(client.rpc.mock.calls[0][1].p_coins).toBe(12000);
  });

  it('releases the hold of a checkout that was never paid', async () => {
    const client = clientAnswering({ data: { status: 'released', coins: 5000 }, error: null });
    const result = await settleCoinsOnCancel(client, {
      bookingReference: 'FLT1', decision: { action: 'nothing_held' }, heldAmount: 0, kept: 0, coins: 5000,
    });
    expect(client.rpc).toHaveBeenCalledWith('wallet_release', { p_ref: 'FLT1' });
    expect(result.coins).toBe(5000);
  });

  it('leaves coins to the desk when the cancel goes to review', async () => {
    const client = clientAnswering();
    const result = await settleCoinsOnCancel(client, {
      bookingReference: 'FLT1', decision: { action: 'review' }, heldAmount: 72.2, kept: 2.2, coins: 5000,
    });
    expect(client.rpc).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, coins: 0 });
  });

  it('says so when the coins could not go back, without failing the cancel', async () => {
    const client = clientAnswering({ data: null, error: { message: 'connection reset' } });
    const result = await settleCoinsOnCancel(client, {
      bookingReference: 'FLT1', decision: { action: 'refund_all' }, heldAmount: 72.2, kept: 0, coins: 5000,
    });
    expect(result).toEqual({ ok: false, coins: 0 });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/backend/walletRefunds.test.js`
Expected: FAIL, because `settleCoinsOnCancel` is not exported.

- [ ] **Step 3: Implement**

In `backend/routes/payment/operations.handlers.js`:

**3a.** Add these imports:

```js
import { coinsBackOnCancel } from '../../../shared/jetCoins.js';
import { releaseCoins, returnAllCoins, returnCoins, reverseEarnedCoins } from '../../services/wallet.service.js';
```

**3b.** Add this exported helper above `cancelFlightBooking`:

```js
/**
 * The coins a cancelled booking used. ARC gives back the card part the refund
 * decision chose; coins cover the rest of what is owed, and never more than
 * were used. A booking that earned coins and is now refunded gives them back.
 * Never throws: a failed return is said, and the desk is asked to finish it.
 */
export async function settleCoinsOnCancel(client, { bookingReference, decision, heldAmount, kept, coins }) {
  const used = Math.floor(Number(coins) || 0);
  if (used <= 0) return { ok: true, coins: 0 };
  try {
    if (decision.action === 'nothing_held') {
      const released = await releaseCoins(client, bookingReference);
      return { ok: true, coins: Number(released.coins) || 0 };
    }
    const owed = coinsBackOnCancel({ action: decision.action, heldAmount, kept, coins: used });
    if (owed <= 0) return { ok: true, coins: 0 };
    const given = await returnCoins(client, { bookingReference, coins: owed, reason: 'cancel' });
    await reverseEarnedCoins(client, bookingReference);
    return { ok: true, coins: given };
  } catch (error) {
    console.error('⚠️ Jet Coins were not returned on a cancel', { bookingReference, code: error.code });
    return { ok: false, coins: 0 };
  }
}
```

**3c.** In `cancelFlightBooking`, right after the `console.log('💰 Cancellation refund:', ...)` line, add:

```js
    const coinsUsed = Number(details.verified_charge?.wallet?.coins) || 0;
    const keptForCoins = customerTerms ? (customerTerms.serviceFeeKept ?? 0) : (decision.action === 'fee_covers' ? flightFee : decision.fee);
    const coins = coinsUsed > 0
        ? await settleCoinsOnCancel(supabase, { bookingReference, decision, heldAmount: payment.heldAmount, kept: keptForCoins, coins: coinsUsed })
        : { ok: true, coins: 0 };
```

**3d.** In the `reviewReasons` array, add:

```js
        coins.ok ? null : `Jet Coins (${coinsUsed.toLocaleString('en-US')}) could not be returned automatically: return them with Return Jet Coins`,
```

**3e.** Add `coinsReturned: coins.coins,` to `cancellationResult`, and `coinsReturned: cancellationResult.coinsReturned,` to the `cancellation: { ... }` object written on the row.

**3f.** In `handlePaymentVoid`, right after `console.log('✅ ARC Pay VOID successful:', ...)`, add:

```js
        if (booking?.booking_reference) await returnAllCoins(supabase, booking.booking_reference, 'void');
```

`booking` is the row looked up at the top of the handler (around line 2081). If its variable name differs, use that name.

In `backend/routes/flight.routes.js`, in the desk row object that sets `arcOrderId: d.arc_order_id || d.order_id || b.booking_reference,` (around line 5542), add:

```js
    walletCoins: Number(d.verified_charge?.wallet?.coins) || 0,
    walletCoinsReturned: Number(d.cancellation?.coinsReturned) || 0,
```

In `frontend/src/Pages/Support/SupportQueue.jsx`:

- **(i)** In `runAction`, add a branch before the final `else`:

```js
      } else if (type === 'coins') {
        response = await adminFetch(getApiUrl('wallet/staff-return'), {
          method: 'POST',
          body: JSON.stringify({ bookingReference: booking.bookingReference, coins: Number(current.coins), reason: current.reason?.trim() || 'Returned by the support desk' }),
        });
```

- **(ii)** Where the other action buttons for a booking are rendered (search for the button that sets `type: 'void'`), add a button shown only when `booking.walletCoins > booking.walletCoinsReturned`:

```jsx
{booking.walletCoins > booking.walletCoinsReturned && (
  <button
    type="button"
    onClick={() => setAction({ type: 'coins', booking, coins: booking.walletCoins - booking.walletCoinsReturned })}
    className="rounded-lg border border-[#055B75] px-3 py-1.5 text-xs font-semibold text-[#055B75] hover:bg-[#F1FBFD]"
  >
    Return Jet Coins
  </button>
)}
```

- **(iii)** In the action dialog, where `action.type === 'refund'` renders its amount input, add a branch for `action.type === 'coins'`. It renders `<label>Jet Coins to return</label><input type="number" min="1" step="1" value={action.coins} onChange={(e) => setAction({ ...action, coins: e.target.value })} />`, using the same input classes as the refund amount input, and the line `{Number(action.coins || 0) / 100} USD`.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/backend/walletRefunds.test.js tests/backend/cancelClaim.test.js tests/backend/cancelAuthorization.test.js`
Expected: PASS.

Then run the Global Constraints suite command.
Expected: every file passes.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/payment/operations.handlers.js backend/routes/flight.routes.js frontend/src/Pages/Support/SupportQueue.jsx tests/backend/walletRefunds.test.js
git commit -m "feat(wallet): cancels and voids give coins back first; the desk can return the rest"
```

---

### Task 8: Jobs: release unpaid holds; earn coins after the free window

**Files:**
- Modify: `backend/jobs/abandonedCheckout.job.js` (`settle`, lines 263-276)
- Create: `backend/jobs/walletEarn.job.js`
- Modify: `server.js` (import beside line 50, start beside line 348)
- Test: `tests/backend/walletEarnJob.test.js`

**Interfaces:**
- **Consumes:**
  - `releaseCoins`, `earnCoins` (Task 3)
  - `earnedCoinsFor` (Task 2)
  - `freeUntilOf` from `shared/flightCancelPolicy.js`
  - `officeTimeZoneOf` from `backend/services/amadeusSoap/config.js`
  - `isTicketed` from `shared/reviewQueue.js`
- **Produces:**
  - `settle(row, { release })`, which releases a dead checkout's coins;
  - from `walletEarn.job.js`: `earnOnce({ client, now, timeZone, earn, limit })` → `{ credited, skipped }`, and `startWalletEarnJob({ intervalMs })`.

- [ ] **Step 1: Write the failing test**

`tests/backend/walletEarnJob.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { earnOnce } from '../../backend/jobs/walletEarn.job.js';
import { settle } from '../../backend/jobs/abandonedCheckout.job.js';

const HOUR = 3600 * 1000;
const NOW = Date.parse('2026-10-20T20:00:00Z');

const booking = (overrides = {}) => ({
  booking_reference: 'FLT1',
  user_id: 'u1',
  status: 'confirmed',
  payment_status: 'paid',
  travel_type: 'flight',
  created_at: new Date(NOW - 30 * HOUR).toISOString(),
  booking_details: { verified_charge: { total: 130.38 }, gds: { ticketed: true } },
  ...overrides,
});

const clientWith = ({ bookings, earned = [] }) => ({
  from: vi.fn((table) => {
    const chain = {};
    for (const op of ['select', 'eq', 'is', 'not', 'gte', 'lte', 'in', 'order', 'limit']) chain[op] = vi.fn(() => chain);
    chain.then = (resolve) => resolve(table === 'bookings'
      ? { data: bookings, error: null }
      : { data: earned.map((ref) => ({ idempotency_key: `earn:${ref}` })), error: null });
    return chain;
  }),
});

describe('earning Jet Coins', () => {
  it('credits a coin per whole card dollar once the free window has closed', async () => {
    const earn = vi.fn(async () => ({ applied: true }));
    const result = await earnOnce({ client: clientWith({ bookings: [booking()] }), now: NOW, timeZone: 'America/Los_Angeles', earn });
    expect(earn).toHaveBeenCalledWith(expect.anything(), { userId: 'u1', bookingReference: 'FLT1', coins: 130 });
    expect(result.credited).toBe(1);
  });

  it('waits while the booking can still be cancelled for free', async () => {
    const earn = vi.fn();
    await earnOnce({ client: clientWith({ bookings: [booking({ created_at: new Date(NOW - 1 * HOUR).toISOString() })] }), now: NOW, timeZone: 'America/Los_Angeles', earn });
    expect(earn).not.toHaveBeenCalled();
  });

  it('skips a booking not ticketed, already earned, or without an owner', async () => {
    const earn = vi.fn();
    const bookings = [
      booking({ booking_reference: 'A', booking_details: { verified_charge: { total: 50 } } }),
      booking({ booking_reference: 'B' }),
      booking({ booking_reference: 'C', user_id: null }),
    ];
    await earnOnce({ client: clientWith({ bookings, earned: ['B'] }), now: NOW, timeZone: 'America/Los_Angeles', earn });
    expect(earn).not.toHaveBeenCalled();
  });
});

describe('a checkout never paid', () => {
  const row = {
    booking_reference: 'FLT9',
    created_at: new Date(NOW - 4 * HOUR).toISOString(),
    booking_details: { verified_charge: { wallet: { coins: 5000 } } },
  };

  it('gives its coins back once it can no longer be paid', async () => {
    const release = vi.fn(async () => ({ status: 'released', coins: 5000 }));
    const outcome = await settle(row, { now: NOW, reconcile: async () => ({ paid: false }), release });
    expect(outcome).toEqual({ outcome: 'not-paid', final: true });
    expect(release).toHaveBeenCalledWith('FLT9');
  });

  it('keeps them while the payment page could still be paid', async () => {
    const release = vi.fn();
    await settle({ ...row, created_at: new Date(NOW - 1 * HOUR).toISOString() }, { now: NOW, reconcile: async () => ({ paid: false }), release });
    expect(release).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/backend/walletEarnJob.test.js`
Expected: FAIL, because `walletEarn.job.js` does not exist yet and `settle` has no `release` option.

- [ ] **Step 3: Implement**

In `backend/jobs/abandonedCheckout.job.js`:

**3a.** Add these imports:

```js
import { releaseCoins } from '../services/wallet.service.js';
```

and, if `supabase` is not already imported in this file, keep the existing `import supabase from '../config/supabase.js';`.

**3b.** Add above `settle`:

```js
const releaseCheckoutCoins = async (bookingReference) => {
  try {
    return await releaseCoins(supabase, bookingReference);
  } catch (error) {
    log('coins held for an unpaid checkout could not be released', { bookingReference, code: error.code });
    return null;
  }
};
```

**3c.** Change the `settle` signature to:

```js
export async function settle(row, { now = Date.now(), reconcile = reconcileBookingPayment, send, flag = flagForReview, release = releaseCheckoutCoins } = {}) {
```

**3d.** Replace the two `not-paid` returns with:

```js
  if (noSuchOrder || !payment.paid) {
    const final = age > PAYABLE_MS;
    // The payment page can no longer be paid: the coins it held go back.
    if (final && Number(row?.booking_details?.verified_charge?.wallet?.coins) > 0) await release(row.booking_reference);
    return { outcome: 'not-paid', final };
  }
```

Create `backend/jobs/walletEarn.job.js`:

```js
/**
 * Jet Coins earned on flights: one coin per whole dollar charged to the card,
 * credited once the booking's free-cancellation window has closed, and only
 * while it is still ticketed and not cancelled. A booking cancelled inside the
 * window never earns; one refunded later gives its coins back (wallet.service
 * reverseEarnedCoins, called from the refund paths).
 */
import supabase from '../config/supabase.js';
import { earnCoins } from '../services/wallet.service.js';
import { earnedCoinsFor } from '../../shared/jetCoins.js';
import { freeUntilOf } from '../../shared/flightCancelPolicy.js';
import { isTicketed } from '../../shared/reviewQueue.js';
import { officeTimeZoneOf } from '../services/amadeusSoap/config.js';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const LOOKBACK_MS = 30 * DAY;

export async function earnOnce({
  client = supabase,
  now = Date.now(),
  timeZone = officeTimeZoneOf(),
  earn = earnCoins,
  limit = 200,
} = {}) {
  const { data: bookings, error } = await client.from('bookings')
    .select('booking_reference, user_id, status, payment_status, travel_type, created_at, booking_details')
    .eq('travel_type', 'flight')
    .eq('status', 'confirmed')
    .eq('payment_status', 'paid')
    .not('user_id', 'is', null)
    .gte('created_at', new Date(now - LOOKBACK_MS).toISOString())
    .lte('created_at', new Date(now - 60 * MINUTE).toISOString())
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) {
    console.warn('⚠️ Wallet earn: bookings could not be read', error.message);
    return { credited: 0, skipped: 0 };
  }

  const refs = (bookings || []).map((row) => row.booking_reference);
  const { data: earnedRows } = refs.length
    ? await client.from('wallet_entries').select('idempotency_key').in('idempotency_key', refs.map((ref) => `earn:${ref}`))
    : { data: [] };
  const earned = new Set((earnedRows || []).map((row) => String(row.idempotency_key).slice('earn:'.length)));

  let credited = 0;
  let skipped = 0;
  for (const row of bookings || []) {
    const details = row.booking_details || {};
    const until = freeUntilOf(row.created_at, timeZone);
    const coins = earnedCoinsFor(details.verified_charge?.total);
    const ready = row.user_id && until && Date.parse(until) <= now && isTicketed(details) && coins > 0 && !earned.has(row.booking_reference);
    if (!ready) { skipped += 1; continue; }
    try {
      await earn(client, { userId: row.user_id, bookingReference: row.booking_reference, coins });
      credited += 1;
    } catch (earnError) {
      skipped += 1;
      console.warn('⚠️ Wallet earn: could not credit', { bookingReference: row.booking_reference, code: earnError.code });
    }
  }
  if (credited || skipped) console.log(`🪙 Wallet earn: ${credited} credited, ${skipped} skipped`);
  return { credited, skipped };
}

export function startWalletEarnJob({ intervalMs = 15 * MINUTE } = {}) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await earnOnce();
    } catch (error) {
      console.error('⚠️ Wallet earn run failed:', error.message);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  setTimeout(tick, MINUTE).unref?.();
  return () => clearInterval(timer);
}
```

In `server.js`:
- add `import { startWalletEarnJob } from "./backend/jobs/walletEarn.job.js";` next to the `startTicketSyncJob` import (line 47);
- right after `startTicketSyncJob();` (line 348) add:

```js
    // Credits Jet Coins on flights whose free-cancellation window has closed.
    startWalletEarnJob();
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/backend/walletEarnJob.test.js tests/backend/abandonedCheckout.test.js tests/backend/abandonedCheckoutWindow.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/jobs/abandonedCheckout.job.js backend/jobs/walletEarn.job.js server.js tests/backend/walletEarnJob.test.js
git commit -m "feat(wallet): unpaid checkouts give coins back; flights earn coins after the free window"
```

---

### Task 9: Review page: the "Use my Jet Coins" switch; receipts show coins

**Files:**
- Modify: `frontend/src/Services/ArcPayService.js` (`createHostedCheckout`, lines 110-135)
- Modify: `frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx`:
  - state, around line 133
  - `amountDue`, line 1561
  - the checkout call, lines 1255-1260 and 1350-1368
  - the summary, lines 2419-2470
- Modify: `frontend/src/utils/bookingCharge.js` (`chargeLines`, `bookingChargeLines`)
- Test: `tests/components/reviewPageCoins.test.jsx`, `tests/utils/bookingChargeCoins.test.js`

**Interfaces:**
- **Consumes:** `GET /api/wallet` (Task 4); `maxWalletCoinsFor`, `formatCoins`, `coinsToUsd` (Task 2); `WALLET_CHANGED` (Task 5).
- **Produces:**
  - `createHostedCheckout({ walletCoins })`;
  - a review page that sends coins;
  - `bookingChargeLines` with a "Jet Coins" line.
  - New exported component `JetCoinsToggle({ balance, held, afterCoupon, useCoins, onChange })` in `frontend/src/components/JetCoinsToggle.jsx`.

- [ ] **Step 1: Write the failing tests**

`tests/utils/bookingChargeCoins.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { bookingChargeLines } from '../../frontend/src/utils/bookingCharge.js';

describe('a receipt with Jet Coins', () => {
  it('shows the coins line and still adds up', () => {
    const result = bookingChargeLines({ chargeBreakdown: { fare: 120, serviceFee: 2.2, discount: 0, walletAmount: 50, walletCoins: 5000, total: 72.2 } });
    expect(result.total).toBe(72.2);
    expect(result.lines.map((line) => line.label)).toEqual(['Airline fare (incl. taxes)', 'Service fee', 'Jet Coins (5,000)']);
    expect(result.lines[2].amount).toBe(-50);
  });
});
```

`tests/components/reviewPageCoins.test.jsx`:

```jsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import JetCoinsToggle from '../../frontend/src/components/JetCoinsToggle.jsx';

describe('the Jet Coins switch', () => {
  it('offers the coins the total can take, and says what they take off', () => {
    const onChange = vi.fn();
    render(<JetCoinsToggle balance={5000} held={0} afterCoupon={122.2} useCoins={false} onChange={onChange} />);
    expect(screen.getByText(/5,000 Jet Coins available/)).toBeTruthy();
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('caps at $1 left on the card', () => {
    render(<JetCoinsToggle balance={50000} held={0} afterCoupon={30} useCoins onChange={() => {}} />);
    expect(screen.getByText(/−\$29\.00/)).toBeTruthy();
  });

  it('says coins are held for an open payment page', () => {
    render(<JetCoinsToggle balance={0} held={2000} afterCoupon={30} useCoins={false} onChange={() => {}} />);
    expect(screen.getByText(/2,000 coins are held for a payment page you opened/)).toBeTruthy();
  });

  it('shows nothing to someone with no coins and none held', () => {
    const { container } = render(<JetCoinsToggle balance={0} held={0} afterCoupon={30} useCoins={false} onChange={() => {}} />);
    expect(container.innerHTML).toBe('');
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/utils/bookingChargeCoins.test.js tests/components/reviewPageCoins.test.jsx`
Expected: FAIL. The receipt lines have no Jet Coins line, and `JetCoinsToggle.jsx` does not resolve.

- [ ] **Step 3: Implement**

`frontend/src/components/JetCoinsToggle.jsx`:

```jsx
import React from 'react';
import { coinsToUsd, formatCoins, maxWalletCoinsFor } from '../../../shared/jetCoins.js';

const usd = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

export default function JetCoinsToggle({ balance = 0, held = 0, afterCoupon, useCoins, onChange }) {
  if (!(balance > 0) && !(held > 0)) return null;
  const usable = maxWalletCoinsFor(afterCoupon, balance);
  return (
    <div className="mt-4 rounded-xl border border-[#B9D0DC] bg-[#F1FBFD] p-3">
      {balance > 0 && (
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-gray-900">Use my Jet Coins</span>
            <span className="block text-xs text-gray-600">
              {formatCoins(balance)} Jet Coins available ({usd(coinsToUsd(balance))})
              {useCoins && usable > 0 ? ` · −${usd(coinsToUsd(usable))}` : ''}
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="peer sr-only"
            checked={Boolean(useCoins) && usable > 0}
            disabled={usable <= 0}
            onChange={() => onChange(!useCoins)}
          />
          <span className="relative h-6 w-11 flex-shrink-0 rounded-full bg-gray-300 transition-colors peer-checked:bg-[#055B75] peer-disabled:opacity-50 after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
        </label>
      )}
      {balance > 0 && usable <= 0 && (
        <p className="mt-1 text-xs text-gray-500">At least $1.00 has to be paid by card, so coins cannot be used on this total.</p>
      )}
      {held > 0 && (
        <p className="mt-1 text-xs text-gray-500">
          {formatCoins(held)} coins are held for a payment page you opened. They come back within 3 hours if that payment is not completed.
        </p>
      )}
    </div>
  );
}
```

Check the relative path depth of `frontend/src/components` → repo root `shared/`. It is `../../../shared/jetCoins.js`; confirm against an existing import such as `computeFlightCharge` in `FlightBookingConfirmation.jsx` and adjust.

In `frontend/src/utils/bookingCharge.js`:

**3a.** Replace `chargeLines` with:

```js
function chargeLines({ fare, serviceFee = 0, discount = 0, walletAmount = 0, walletCoins = 0, total, couponCode }) {
  const [f, s, d, w, t] = [fare, serviceFee, discount, walletAmount, total].map((value) => cents(value || 0));
  // A cent either way for rounding; anything more and the lines are not shown.
  if (![f, s, d, w, t].every(Number.isFinite) || f <= 0 || t <= 0 || Math.abs(f + s - d - w - t) > 1) return null;
  const coins = Math.round(Number(walletCoins) || w);
  return {
    total: t / 100,
    lines: [
      { label: 'Airline fare (incl. taxes)', amount: f / 100 },
      ...(s > 0 ? [{ label: 'Service fee', amount: s / 100 }] : []),
      ...(d > 0 ? [{ label: couponCode ? `Discount (${couponCode})` : 'Discount', amount: -d / 100 }] : []),
      ...(w > 0 ? [{ label: `Jet Coins (${new Intl.NumberFormat('en-US').format(coins)})`, amount: -w / 100 }] : []),
    ],
  };
}
```

**3b.** In `bookingChargeLines`'s fallback branch, pass `walletAmount: Number(fare.walletAmount || 0)` and change `discount:` to `Math.max(0, beforeDiscount - paid - Number(fare.walletAmount || 0))`.

In `frontend/src/Services/ArcPayService.js` `createHostedCheckout`, add after `couponCode`:

```js
                walletCoins: checkoutData.walletCoins || undefined,
```

In `FlightBookingConfirmation.jsx`:

**3c.** Add these imports:

```js
import JetCoinsToggle from '../../../components/JetCoinsToggle';
import { maxWalletCoinsFor } from '../../../../../shared/jetCoins.js';
import { apiGet } from '../../../utils/apiHelper';
```

Match the relative depth to how this file already imports `shared/flightCharge.js`.

**3d.** Add state near `appliedCoupon`:

```js
  const [wallet, setWallet] = useState({ balance: 0, held: 0 });
  const [useCoins, setUseCoins] = useState(false);
  const [walletProblem, setWalletProblem] = useState(null);
```

**3e.** Add an effect that loads the wallet for a signed-in customer:

```js
  const loadWallet = useCallback(async () => {
    try {
      const response = await apiGet('wallet');
      if (!response.ok) return;
      const body = await response.json();
      if (body?.success) setWallet({ balance: Number(body.data.balance) || 0, held: Number(body.data.held) || 0 });
    } catch {
      setWallet({ balance: 0, held: 0 });
    }
  }, []);
  useEffect(() => { if (user) loadWallet(); }, [user, loadWallet]);
```

Use whatever this component calls the signed-in user from `useSupabaseAuth()`; grep for `useSupabaseAuth` in the file.

**3f.** Replace `const amountDue = appliedCoupon ? appliedCoupon.finalTotal : calculatedFare.totalAmount;` (line 1561) with:

```js
  const afterCoupon = appliedCoupon ? appliedCoupon.finalTotal : calculatedFare.totalAmount;
  const coinsToUse = useCoins ? maxWalletCoinsFor(afterCoupon, wallet.balance) : 0;
  const amountDue = Math.round((afterCoupon - coinsToUse / 100) * 100) / 100;
```

**3g.** In `handleProceedToPayment`, change line 1260 to `const amount = amountDue;`. Make sure `amountDue` is defined above the handler; move the three lines from 3f above it if needed. Then pass `walletCoins: coinsToUse || undefined,` to `ArcPayService.createHostedCheckout({...})`.

**3h.** Where the checkout refusals are handled (next to `PRICE_CHANGED` at ~1396 and `COUPON_INVALID` at ~1416), add:

```js
        if (code === 'WALLET_CHANGED' || code === 'WALLET_UNAVAILABLE') {
          setWalletProblem(message);
          setUseCoins(false);
          loadWallet();
          return;
        }
```

using the same `code` and `message` variables those branches use.

**3i.** In the summary, after the coupon `{appliedCoupon && (...)}` block, add a Jet Coins line:

```jsx
                {coinsToUse > 0 && (
                  <div className="flex items-start gap-3 py-3 border-b border-gray-100">
                    <PlusCircle className="h-5 w-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-gray-800">Jet Coins</div>
                      <div className="text-xs text-gray-400 mt-0.5">{coinsToUse.toLocaleString('en-US')} coins</div>
                    </div>
                    <div className="text-sm font-semibold text-emerald-600 whitespace-nowrap">- <ChargeAmount amount={coinsToUse / 100} /></div>
                  </div>
                )}
```

**3j.** After the coupon input block's closing `</div>`, add:

```jsx
                <JetCoinsToggle balance={wallet.balance} held={wallet.held} afterCoupon={afterCoupon} useCoins={useCoins} onChange={(next) => { setWalletProblem(null); setUseCoins(next); }} />
                {walletProblem && <p className="mt-1.5 text-xs text-red-600" role="alert">{walletProblem}</p>}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run tests/utils/bookingChargeCoins.test.js tests/components/reviewPageCoins.test.jsx`
Expected: PASS.

Then run the Global Constraints suite command.
Expected: every file passes, including the existing review-page and receipt tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/JetCoinsToggle.jsx frontend/src/utils/bookingCharge.js frontend/src/Services/ArcPayService.js frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx tests/utils/bookingChargeCoins.test.js tests/components/reviewPageCoins.test.jsx
git commit -m "feat(wallet): pay part of a flight with Jet Coins; receipts show them"
```

---

### Task 10: Profile → Jet Wallet tab

**Files:**
- Create: `frontend/src/Pages/Common/login/JetWalletPanel.jsx`
- Modify: `frontend/src/Pages/Common/login/profiledashboard.jsx` (`sidebarItems` at line 615, section render near line 1014)
- Test: `tests/components/jetWalletPanel.test.jsx`

**Interfaces:**
- **Consumes:** `GET /api/wallet` and `POST /api/wallet/redeem` (Task 4); `formatCoins`, `coinsToUsd` (Task 2).
- **Produces:** the default export `JetWalletPanel`.

- [ ] **Step 1: Write the failing test**

`tests/components/jetWalletPanel.test.jsx`:

```jsx
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock('../../frontend/src/utils/apiHelper', () => ({ apiGet: (...a) => apiGet(...a), apiPost: (...a) => apiPost(...a) }));

import JetWalletPanel from '../../frontend/src/Pages/Common/login/JetWalletPanel.jsx';

const answer = (body, ok = true) => ({ ok, json: async () => body });

describe('the Jet Wallet tab', () => {
  beforeEach(() => { apiGet.mockReset(); apiPost.mockReset(); });

  it('shows the balance in coins and dollars, and the history', async () => {
    apiGet.mockResolvedValue(answer({ success: true, data: { balance: 5000, balanceUsd: 50, held: 0, entries: [
      { id: 1, kind: 'voucher', coins: 5000, note: 'SHUBHAM', created_at: '2026-10-13T10:00:00Z' },
    ] } }));
    render(<JetWalletPanel />);
    expect(await screen.findByText('5,000')).toBeTruthy();
    expect(screen.getByText('$50.00')).toBeTruthy();
    expect(screen.getByText('Voucher SHUBHAM')).toBeTruthy();
    expect(screen.getByText('+5,000')).toBeTruthy();
  });

  it('redeems a voucher and shows the new balance', async () => {
    apiGet.mockResolvedValueOnce(answer({ success: true, data: { balance: 0, balanceUsd: 0, held: 0, entries: [] } }))
      .mockResolvedValueOnce(answer({ success: true, data: { balance: 5000, balanceUsd: 50, held: 0, entries: [] } }));
    apiPost.mockResolvedValue(answer({ success: true, data: { coins: 5000, balance: 5000, code: 'SHUBHAM' } }));
    render(<JetWalletPanel />);
    fireEvent.change(await screen.findByLabelText('Voucher code'), { target: { value: 'shubham' } });
    fireEvent.click(screen.getByRole('button', { name: 'Redeem' }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('wallet/redeem', { code: 'SHUBHAM' }));
    expect(await screen.findByText(/5,000 Jet Coins added/)).toBeTruthy();
  });

  it('says why a voucher was refused', async () => {
    apiGet.mockResolvedValue(answer({ success: true, data: { balance: 0, balanceUsd: 0, held: 0, entries: [] } }));
    apiPost.mockResolvedValue(answer({ success: false, error: 'You have already redeemed this voucher.' }, false));
    render(<JetWalletPanel />);
    fireEvent.change(await screen.findByLabelText('Voucher code'), { target: { value: 'SHUBHAM' } });
    fireEvent.click(screen.getByRole('button', { name: 'Redeem' }));
    expect(await screen.findByText('You have already redeemed this voucher.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/components/jetWalletPanel.test.jsx`
Expected: FAIL, because `JetWalletPanel.jsx` does not resolve.

- [ ] **Step 3: Implement**

`frontend/src/Pages/Common/login/JetWalletPanel.jsx`:

```jsx
import React, { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../../utils/apiHelper';
import { coinsToUsd, formatCoins } from '../../../../../shared/jetCoins.js';

const usd = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const DESCRIBE = {
  voucher: (entry) => `Voucher ${entry.note || ''}`.trim(),
  earn: (entry) => `Earned on booking ${entry.booking_reference}`,
  earn_reversal: (entry) => `Earned coins taken back, booking ${entry.booking_reference} refunded`,
  hold: (entry) => `Used on booking ${entry.booking_reference}`,
  release: (entry) => `Returned, payment not completed for ${entry.booking_reference}`,
  return: (entry) => `Returned from booking ${entry.booking_reference}`,
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
    if (!cleaned) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await apiPost('wallet/redeem', { code: cleaned });
      const body = await response.json();
      if (!response.ok || !body?.success) {
        setNotice({ tone: 'error', text: body?.error || 'The voucher could not be redeemed.' });
      } else {
        setNotice({ tone: 'success', text: `${formatCoins(body.data.coins)} Jet Coins added to your wallet.` });
        setCode('');
        await load();
      }
    } catch {
      setNotice({ tone: 'error', text: 'The voucher could not be redeemed just now. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#055B75] to-[#034457] p-6 text-white">
        <div className="text-sm opacity-80">Jet Wallet balance</div>
        {wallet ? (
          <>
            <div className="mt-1 text-4xl font-bold">{formatCoins(wallet.balance)}</div>
            <div className="text-sm opacity-90">Jet Coins · worth <span>{usd(coinsToUsd(wallet.balance))}</span></div>
            {wallet.held > 0 && (
              <div className="mt-2 text-xs opacity-80">{formatCoins(wallet.held)} coins held for a payment in progress</div>
            )}
          </>
        ) : (
          <div className="mt-2 text-sm opacity-80">{loadError || 'Loading…'}</div>
        )}
        <p className="mt-3 text-xs opacity-80">100 Jet Coins = $1. Earn 1 coin for every $1 you pay for flights, and use them at checkout.</p>
      </div>

      <form onSubmit={redeem} className="rounded-2xl border border-gray-200 bg-white p-5">
        <label htmlFor="voucher-code" className="block text-sm font-semibold text-gray-900">Voucher code</label>
        <div className="mt-2 flex gap-2">
          <input
            id="voucher-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            maxLength={32}
            autoComplete="off"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase focus:border-[#055B75] focus:outline-none focus:ring-1 focus:ring-[#055B75]"
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
                  <div className="text-sm text-gray-900">{(DESCRIBE[entry.kind] || (() => entry.kind))(entry)}</div>
                  <div className="text-xs text-gray-500">{new Date(entry.created_at).toLocaleString()}</div>
                </div>
                <div className={`text-sm font-semibold ${entry.coins >= 0 ? 'text-emerald-700' : 'text-gray-700'}`}>
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
  );
}
```

In `profiledashboard.jsx`:

**3a.** Add `import JetWalletPanel from './JetWalletPanel';`.

**3b.** Append this to `sidebarItems`:

```js
    { id: 'wallet', label: 'Jet Wallet', icon: 'M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z' },
```

**3c.** After the `{activeSection === 'preferences' && (...)}` block, add:

```jsx
          {activeSection === 'wallet' && <JetWalletPanel />}
```

**3d.** Read `?tab=wallet` from the URL on mount, so links can open the tab:

```js
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tab') === 'wallet') setActiveSection('wallet');
  }, []);
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/components/jetWalletPanel.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/Pages/Common/login/JetWalletPanel.jsx frontend/src/Pages/Common/login/profiledashboard.jsx tests/components/jetWalletPanel.test.jsx
git commit -m "feat(wallet): Jet Wallet tab - balance, voucher redeem, history"
```

---

### Task 11: Admin → Vouchers page

**Files:**
- Create: `frontend/src/Pages/Admin/VoucherManagement.jsx`
- Modify: `frontend/src/Pages/Admin/AdminPanel.jsx` (import plus a route after `coupons`, line 46)
- Modify: `frontend/src/Pages/Admin/shell/AdminShell.jsx` (`ROUTE_META`)
- Modify: `frontend/src/Pages/Admin/shell/AdminSidebar.jsx` (the Sales group)
- Test: `tests/components/voucherManagement.test.jsx`

**Interfaces:**
- **Consumes:** `/api/vouchers` (Task 4); `adminFetch` and `readAdminResponse` from `frontend/src/utils/adminAuth.js`; `getApiUrl` from `frontend/src/utils/apiHelper.js`.
- **Produces:** the `/admin/vouchers` page.

- [ ] **Step 1: Write the failing test**

`tests/components/voucherManagement.test.jsx`:

```jsx
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const adminFetch = vi.fn();
vi.mock('../../frontend/src/utils/adminAuth', () => ({
  adminFetch: (...a) => adminFetch(...a),
  readAdminResponse: async (response) => response.json(),
}));
vi.mock('../../frontend/src/Pages/Admin/shell/RefreshContext', () => ({ useRegisterRefresh: () => {} }));

import VoucherManagement from '../../frontend/src/Pages/Admin/VoucherManagement.jsx';

const answer = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

describe('admin vouchers page', () => {
  beforeEach(() => adminFetch.mockReset());

  it('lists vouchers with their value and use', async () => {
    adminFetch.mockResolvedValue(answer({ success: true, data: [
      { id: 'v1', code: 'SHUBHAM', coins: 5000, redemptions_count: 3, max_redemptions: 100, is_active: true, valid_from: null, valid_until: null },
    ] }));
    render(<VoucherManagement />);
    expect(await screen.findByText('SHUBHAM')).toBeTruthy();
    expect(screen.getByText('$50.00')).toBeTruthy();
    expect(screen.getByText('3 / 100')).toBeTruthy();
  });

  it('creates a voucher from the form, showing the coins it gives', async () => {
    adminFetch.mockResolvedValueOnce(answer({ success: true, data: [] }))
      .mockResolvedValueOnce(answer({ success: true, data: { id: 'v2', code: 'WELCOME' } }, 201))
      .mockResolvedValueOnce(answer({ success: true, data: [] }));
    render(<VoucherManagement />);
    fireEvent.click(await screen.findByRole('button', { name: 'New voucher' }));
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'welcome' } });
    fireEvent.change(screen.getByLabelText('Value (USD)'), { target: { value: '50' } });
    expect(screen.getByText('= 5,000 Jet Coins')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create voucher' }));
    await waitFor(() => expect(adminFetch.mock.calls[1][1].method).toBe('POST'));
    expect(JSON.parse(adminFetch.mock.calls[1][1].body)).toMatchObject({ code: 'WELCOME', valueUsd: 50 });
  });

  it('shows the server refusal', async () => {
    adminFetch.mockResolvedValueOnce(answer({ success: true, data: [] }))
      .mockResolvedValueOnce(answer({ success: false, error: 'A voucher with this code already exists.' }, 409));
    render(<VoucherManagement />);
    fireEvent.click(await screen.findByRole('button', { name: 'New voucher' }));
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'TAKEN' } });
    fireEvent.change(screen.getByLabelText('Value (USD)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create voucher' }));
    expect(await screen.findByText('A voucher with this code already exists.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/components/voucherManagement.test.jsx`
Expected: FAIL, because `VoucherManagement.jsx` does not resolve.

- [ ] **Step 3: Implement**

`frontend/src/Pages/Admin/VoucherManagement.jsx`:

```jsx
import React, { useCallback, useEffect, useState } from 'react';
import { adminFetch, readAdminResponse } from '../../utils/adminAuth';
import { getApiUrl } from '../../utils/apiHelper';
import { useRegisterRefresh } from './shell/RefreshContext';

const usd = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
const coinsText = (coins) => new Intl.NumberFormat('en-US').format(coins);
const day = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
const EMPTY = { code: '', valueUsd: '', maxRedemptions: '', validFrom: '', validUntil: '', note: '' };

export default function VoucherManagement() {
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [redemptions, setRedemptions] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await readAdminResponse(await adminFetch(getApiUrl('vouchers')));
      setVouchers(body?.success ? body.data : []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useRegisterRefresh(load);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const payload = { ...form, code: form.code.trim().toUpperCase(), valueUsd: Number(form.valueUsd) };
    const editing = Boolean(form.id);
    const response = await adminFetch(getApiUrl(editing ? `vouchers/${form.id}` : 'vouchers'), {
      method: editing ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok || !body.success) {
      setError(body.error || 'The voucher could not be saved.');
      return;
    }
    setForm(null);
    load();
  };

  const toggle = async (voucher) => {
    await adminFetch(getApiUrl(`vouchers/${voucher.id}`), { method: 'PUT', body: JSON.stringify({ isActive: !voucher.is_active }) });
    load();
  };

  const showRedemptions = async (voucher) => {
    const body = await readAdminResponse(await adminFetch(getApiUrl(`vouchers/${voucher.id}/redemptions`)));
    setRedemptions({ voucher, rows: body?.success ? body.data : [] });
  };

  const input = (name, label, props = {}) => (
    <label className="block text-sm">
      <span className="font-medium text-gray-700">{label}</span>
      <input
        aria-label={label}
        value={form[name]}
        onChange={(event) => setForm({ ...form, [name]: event.target.value })}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#055B75] focus:outline-none focus:ring-1 focus:ring-[#055B75]"
        {...props}
      />
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">A voucher adds Jet Coins to the wallet of each customer who redeems it (once each). 100 coins = $1.</p>
        <button type="button" onClick={() => { setError(null); setForm({ ...EMPTY }); }} className="rounded-lg bg-[#055B75] px-4 py-2 text-sm font-semibold text-white hover:bg-[#034457]">
          New voucher
        </button>
      </div>

      {form && (
        <form onSubmit={save} className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-2">
          {input('code', 'Code', { maxLength: 32, disabled: Boolean(form.id && form.redemptions_count > 0) })}
          <div>
            {input('valueUsd', 'Value (USD)', { type: 'number', min: '0.01', step: '0.01', disabled: Boolean(form.id && form.redemptions_count > 0) })}
            {Number(form.valueUsd) > 0 && <p className="mt-1 text-xs text-gray-500">= {coinsText(Math.round(Number(form.valueUsd) * 100))} Jet Coins</p>}
          </div>
          {input('maxRedemptions', 'Total uses (empty = no limit)', { type: 'number', min: '1', step: '1' })}
          {input('note', 'Note (admin only)', { maxLength: 200 })}
          {input('validFrom', 'Starts', { type: 'date' })}
          {input('validUntil', 'Ends', { type: 'date' })}
          <p className="text-xs text-gray-500 sm:col-span-2">Pick a code that is hard to guess (for example SHUBHAM-7K2Q): anyone signed in can try codes.</p>
          {error && <p role="alert" className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" disabled={saving} className="rounded-lg bg-[#055B75] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {form.id ? 'Save voucher' : 'Create voucher'}
            </button>
            <button type="button" onClick={() => setForm(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Cancel</button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr><th className="px-4 py-2">Code</th><th className="px-4 py-2">Value</th><th className="px-4 py-2">Used</th><th className="px-4 py-2">Dates</th><th className="px-4 py-2">Status</th><th className="px-4 py-2" /></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {vouchers.map((voucher) => (
              <tr key={voucher.id}>
                <td className="px-4 py-2 font-semibold text-gray-900">{voucher.code}</td>
                <td className="px-4 py-2">{usd(voucher.coins / 100)}</td>
                <td className="px-4 py-2">{voucher.redemptions_count} / {voucher.max_redemptions ?? '∞'}</td>
                <td className="px-4 py-2 text-gray-600">{[day(voucher.valid_from), day(voucher.valid_until)].filter(Boolean).join(' → ') || 'Any time'}</td>
                <td className="px-4 py-2">
                  <button type="button" onClick={() => toggle(voucher)} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${voucher.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {voucher.is_active ? 'Active' : 'Off'}
                  </button>
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button type="button" onClick={() => showRedemptions(voucher)} className="text-xs font-semibold text-[#055B75] hover:underline">Who used it</button>
                  <button
                    type="button"
                    onClick={() => setForm({ id: voucher.id, redemptions_count: voucher.redemptions_count, code: voucher.code, valueUsd: String(voucher.coins / 100), maxRedemptions: voucher.max_redemptions ?? '', validFrom: day(voucher.valid_from), validUntil: day(voucher.valid_until), note: voucher.note || '' })}
                    className="ml-3 text-xs font-semibold text-[#055B75] hover:underline"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {!loading && vouchers.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">No vouchers yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {redemptions && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">Redeemed {redemptions.voucher.code}</span>
            <button type="button" onClick={() => setRedemptions(null)} className="text-xs text-gray-500 hover:underline">Close</button>
          </div>
          {redemptions.rows.length ? (
            <ul className="divide-y divide-gray-100 text-sm">
              {redemptions.rows.map((row) => (
                <li key={row.id} className="flex justify-between py-2"><span>{row.email || row.userId}</span><span className="text-gray-500">{new Date(row.createdAt).toLocaleString()}</span></li>
              ))}
            </ul>
          ) : <p className="text-sm text-gray-500">Nobody has redeemed it yet.</p>}
        </div>
      )}
    </div>
  );
}
```

**3a.** `AdminPanel.jsx`: add `import VoucherManagement from './VoucherManagement';` and `<Route path="vouchers" element={<VoucherManagement />} />` after the coupons route.

**3b.** `AdminShell.jsx` `ROUTE_META`: add `'/admin/vouchers': { title: 'Vouchers', crumb: 'Sales' },`.

**3c.** `AdminSidebar.jsx`: import `LuWallet` from `react-icons/lu` (if this version does not have it, use `LuTicket`), and add `{ to: '/admin/vouchers', icon: LuWallet, label: 'Vouchers', roles: ADMINS },` after the Coupons item.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/components/voucherManagement.test.jsx`
Expected: PASS (3 tests).

Then run `npm run build`.
Expected: the build succeeds. A missing icon export fails here.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/Pages/Admin/VoucherManagement.jsx frontend/src/Pages/Admin/AdminPanel.jsx frontend/src/Pages/Admin/shell/AdminShell.jsx frontend/src/Pages/Admin/shell/AdminSidebar.jsx tests/components/voucherManagement.test.jsx
git commit -m "feat(wallet): Admin > Vouchers - create, limit, switch off, see who redeemed"
```

---

### Task 12: Apply the migration (owner's OK), end-to-end browser test, PR

**Files:** none new. This task verifies.

**Interfaces:**
- **Consumes:** everything above.
- **Produces:** PR `feat/jet-wallet` → `main`.

- [ ] **Step 1: Stop and ask the owner before touching the database**

Say: "The wallet needs 5 new tables and 8 functions in Supabase. They are additive only and touch no existing table. Local and live share that database. OK to apply?" Wait for a yes.

- [ ] **Step 2: Apply it**

Run: `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261013120000_jet_wallet.sql`
Expected: no errors.

If `SUPABASE_DB_URL` is not set locally, the owner pastes the file into the Supabase SQL editor. Never ask for or type a database password.

- [ ] **Step 3: Verify the grants live**

Run: `curl -s -X POST "$VITE_SUPABASE_URL/rest/v1/rpc/wallet_hold" -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d '{"p_user":"00000000-0000-4000-8000-000000000001","p_ref":"X","p_coins":1}'`
Expected: a `permission denied` error. The anon key must not be able to call the function.

- [ ] **Step 4: Browser end-to-end test on localhost (PDT, ARC TEST merchant)**

1. Start the backend with `NODE_ENV=test PORT=5004 AMADEUS_WS_MAX_CONCURRENCY=15 node backend/server.js`, then `npx vite --port 5173`.
2. As an admin, create the voucher `TESTWALLET-` plus 4 random letters, worth $50, in Admin → Vouchers.
3. As a customer, open Profile → Jet Wallet, redeem it, and see 5,000 coins.
4. Search JFK→LAX, pick B6 123, and turn on "Use my Jet Coins". The total drops by $50.
5. Pay with the ARC TEST card from the project's fixtures.
6. Check that the booking is confirmed, the receipt shows the "Jet Coins (5,000)" line, and the wallet shows 0 coins with "Used on booking …".
7. Cancel from My Trips inside the free window. The wallet shows 5,000 coins back, and the cancel says the card gets the rest.
8. Open a second checkout with coins in another tab while the first is open. The second either uses only the coins left or says `WALLET_CHANGED`.
9. Close every tab you opened, and stop both servers.

Write down each result. Take screenshots of the wallet tab, the review page with coins, and the admin page.

- [ ] **Step 5: Full suite, build, push, PR**

Run, in order:
1. The Global Constraints suite command
2. `npm run build`
3. `scripts/db/test-jet-wallet.sh`
4. `git push -u origin feat/jet-wallet`

Then open the PR with `gh pr create`. Its body covers:
- what ships;
- the rulings from the ledger;
- the migration status;
- the browser test results.

Ask the owner to say "merge #N".

---

## Rulings already made against the spec (tell the owner)

- **Unpaid holds** come back after the checkout can no longer be paid: about **3 hours** (`PAYABLE_MS`), not 60 minutes. Releasing sooner could free coins for a payment ARC still takes. *Cost if wrong:* coins stay unavailable longer after an abandoned checkout; the review page says so.
- **Desk "Finish refund" (path e)** is unchanged. The desk gets a separate **Return Jet Coins** action, instead of one gross amount split automatically. A human decides how much a non-refundable or penalty case owes, and one figure for two kinds of money was error-prone. *Cost if wrong:* the desk takes two steps.
- **Admin routes** live at `/api/vouchers`, not `/api/admin/vouchers`, so they cannot be shadowed by the existing `/api/admin` router.
- **Voucher redeem** gets a rate limit (10 wrong tries per 15 minutes per customer), because admin-chosen codes can be guessed. The admin form says to pick hard-to-guess codes.
