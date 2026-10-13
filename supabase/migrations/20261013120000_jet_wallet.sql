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
--
-- One transaction: Supabase grants EXECUTE on new functions to anon and
-- authenticated, so a failure part-way must not leave them callable.

begin;

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
  v_key text := 'return:' || p_ref || ':' || coalesce(p_reason, 'refund');
  v_prior bigint;
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
  -- A replay must report the coins it gave the first time: the caller sizes the
  -- card refund from this number, and 0 here would make a retry over-refund.
  select coins into v_prior from public.wallet_entries where idempotency_key = v_key;
  if found then
    return jsonb_build_object('status', 'captured', 'coins', v_prior, 'applied', false,
      'balance', (select balance from public.wallets where user_id = v_hold.user_id));
  end if;
  v_give := least(greatest(coalesce(p_coins, 0), 0), v_hold.coins - v_hold.returned_coins);
  if v_give <= 0 then
    return jsonb_build_object('status', 'captured', 'coins', 0);
  end if;
  v_result := public.wallet_apply(v_hold.user_id, v_give, 'return', v_key, p_ref, null, null);
  update public.wallet_holds set returned_coins = returned_coins + v_give, updated_at = now() where booking_reference = p_ref;
  return jsonb_build_object('status', 'captured', 'coins', v_give, 'applied', true, 'balance', (v_result->>'balance')::bigint);
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

commit;
