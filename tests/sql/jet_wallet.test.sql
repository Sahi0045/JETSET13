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
  assert (r->>'created')::boolean is true, 'the hold that takes the coins says it created the hold';
  r := public.wallet_hold(a, 'REF1', 3000);
  assert (select balance from public.wallets where user_id = a) = 2000, 'holding the same checkout again changes nothing';
  assert r->>'status' = 'held' and (r->>'created')::boolean is false, 'a repeat of a live hold says it created nothing';

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
  assert (r->>'coins')::bigint = 1500 and (r->>'applied')::boolean and (select balance from public.wallets where user_id = a) = 2500, 'return gives back part';
  r := public.wallet_return('REF3', 1500, 'cancel');
  assert (r->>'coins')::bigint = 1500 and not (r->>'applied')::boolean, 'a replayed return reports the coins it gave the first time';
  assert (select balance from public.wallets where user_id = a) = 2500 and (select returned_coins from public.wallet_holds where booking_reference = 'REF3') = 1500, 'a replayed return moves nothing';
  r := public.wallet_return('REF3', 999999, 'desk-1', 'staff s1: customer called');
  assert (r->>'coins')::bigint = 2500 and (select balance from public.wallets where user_id = a) = 5000, 'return never gives back more than was used';
  assert (select note from public.wallet_entries where idempotency_key = 'return:REF3:desk-1') = 'staff s1: customer called', 'the note is stored on the return entry';
  assert (select note from public.wallet_entries where idempotency_key = 'return:REF3:cancel') is null, 'a return without a note stores none';
  r := public.wallet_return('REF3', 999999, 'desk-1');
  assert (r->>'coins')::bigint = 2500 and not (r->>'applied')::boolean and (select balance from public.wallets where user_id = a) = 5000, 'a replay after the hold is fully returned still reports the first answer';
  r := public.wallet_return('REF3', 1500, 'cancel');
  assert (r->>'coins')::bigint = 1500 and not (r->>'applied')::boolean, 'an older reason replays its own coins once the hold is fully returned';

  perform public.wallet_hold(a, 'REF4', 100);
  r := public.wallet_return('REF4', 999999, 'reversal', 'staff s1: unused');
  assert r->>'status' = 'released' and (r->>'coins')::bigint = 100, 'return on an unused hold releases it whole';
  assert (select note from public.wallet_entries where idempotency_key = 'release:REF4') = 'staff s1: unused', 'the note is stored on the release entry too';

  r := public.wallet_earn(b, 'REF9', 130);
  assert (r->>'balance')::bigint = 130, 'earning credits';
  r := public.wallet_earn(b, 'REF9', 130);
  assert (select balance from public.wallets where user_id = b) = 130, 'earning once per booking';
  r := public.wallet_reverse_earn('REF9');
  assert (r->>'coins')::bigint = 130 and (select balance from public.wallets where user_id = b) = 0, 'reversal takes the earned coins';
  r := public.wallet_reverse_earn('REF9');
  assert (r->>'coins')::bigint = 0, 'reversal once';

  assert (select sum(coins) from public.wallet_entries where user_id = a) = (select balance from public.wallets where user_id = a), 'the ledger adds up to the balance';
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'wallet_return') = 1, 'applying the migration twice leaves one wallet_return';
  assert not has_function_privilege('anon', 'public.wallet_return(text,bigint,text,text)', 'execute'), 'anon cannot return coins';
  assert not has_function_privilege('authenticated', 'public.wallet_return(text,bigint,text,text)', 'execute'), 'signed-in clients cannot return coins';
  assert has_function_privilege('service_role', 'public.wallet_return(text,bigint,text,text)', 'execute'), 'the backend can return coins';
  assert not has_function_privilege('anon', 'public.wallet_hold(uuid,text,bigint)', 'execute'), 'anon cannot call wallet functions';
  assert not has_function_privilege('authenticated', 'public.redeem_voucher(uuid,text)', 'execute'), 'signed-in clients cannot call wallet functions directly';
  assert has_function_privilege('service_role', 'public.redeem_voucher(uuid,text)', 'execute'), 'the backend can call them';
end $$;
