-- Trip-reward vouchers: a voucher typed at flight checkout whose Jet Coins are
-- paid into the wallet after the trip, instead of when it is redeemed.
--
-- Additive, on top of 20261013120000_jet_wallet.sql (already applied). Apply by
-- hand, after it:
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/20261013150000_trip_reward_vouchers.sql
-- Safe to run twice.
--
-- Never re-apply 20261013120000_jet_wallet.sql on its own after this file: it
-- restores the old redeem_voucher. If that ever happens, re-apply this file
-- straight after.
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
  -- The same booking reserved with a different voucher at the same moment locks a
  -- different voucher row, so only the booking_once index stops the second one.
  begin
    insert into public.voucher_redemptions (voucher_id, user_id, coins, booking_reference, status, due_at, updated_at)
    values (v.id, p_user, v.coins, p_ref, 'pending', p_due_at, now());
    update public.vouchers set redemptions_count = redemptions_count + 1, updated_at = now() where id = v.id;
  exception when unique_violation then
    select * into r from public.voucher_redemptions where booking_reference = p_ref;
    if not found then raise exception 'BOOKING_HAS_REWARD'; end if;
    return jsonb_build_object('status', r.status, 'code', (select code from public.vouchers where id = r.voucher_id),
      'coins', r.coins, 'due_at', r.due_at, 'created', false);
  end;
  return jsonb_build_object('status', 'pending', 'code', v.code, 'coins', v.coins, 'due_at', p_due_at, 'created', true);
end;
$$;

create or replace function public.pay_trip_voucher(p_ref text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.voucher_redemptions;
  v_code text;
  v_result jsonb;
begin
  select * into r from public.voucher_redemptions where booking_reference = p_ref for update;
  if not found then
    return jsonb_build_object('status', 'none', 'coins', 0, 'applied', false);
  end if;
  select code into v_code from public.vouchers where id = r.voucher_id;
  if r.status <> 'pending' then
    return jsonb_build_object('status', r.status, 'coins', r.coins, 'user_id', r.user_id, 'code', v_code, 'applied', false);
  end if;
  v_result := public.wallet_apply(r.user_id, r.coins, 'voucher', 'voucher:' || r.voucher_id || ':' || r.user_id, p_ref, r.voucher_id, v_code);
  update public.voucher_redemptions set status = 'paid', paid_at = now(), updated_at = now() where id = r.id;
  return jsonb_build_object('status', 'paid', 'coins', r.coins, 'user_id', r.user_id, 'code', v_code,
    'applied', (v_result->>'applied')::boolean);
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
  if not found then
    return jsonb_build_object('status', 'none', 'voided', false);
  end if;
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
