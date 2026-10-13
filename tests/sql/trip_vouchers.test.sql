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
