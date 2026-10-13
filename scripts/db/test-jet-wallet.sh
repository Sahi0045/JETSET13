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
hold_open() { docker exec -i "$NAME" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres -c "begin; $1 select pg_sleep(3); commit;" >/dev/null 2>&1; }
await_hold() {
  for _ in $(seq 1 100); do
    [ "$(scalar "select count(*) from pg_stat_activity where wait_event = 'PgSleep'")" != "0" ] && return 0
    sleep 0.1
  done
  return 1
}

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
  run >/dev/null <<'SQL'
insert into public.vouchers (code, coins, kind) values ('RACEV1', 100, 'trip'), ('RACEV2', 100, 'trip'), ('RACEGONE', 100, 'trip') on conflict do nothing;
select public.reserve_trip_voucher('00000000-0000-4000-8000-000000000003', 'RACEGONE', 'FLTGONE', now());
SQL
  # One booking reserved with two different vouchers while the first is still open: the second is answered, never a unique-index error.
  hold_open "select public.reserve_trip_voucher('00000000-0000-4000-8000-000000000003', 'RACEV1', 'FLTSAME', now());" &
  await_hold || { echo "Postgres ${version}: the first reservation never opened"; exit 1; }
  reply=$(scalar "select public.reserve_trip_voucher('00000000-0000-4000-8000-000000000004', 'RACEV2', 'FLTSAME', now())" 2>&1) || true
  wait
  case "$reply" in *'"created": false'*) ;; *) echo "Postgres ${version}: a second voucher for one booking was answered: $reply"; exit 1 ;; esac
  count=$(scalar "select count(*) from public.voucher_redemptions where booking_reference = 'FLTSAME'")
  [ "$count" = "1" ] || { echo "Postgres ${version}: FLTSAME has $count rewards"; exit 1; }
  used=$(scalar "select redemptions_count from public.vouchers where code = 'RACEV2'")
  [ "$used" = "0" ] || { echo "Postgres ${version}: RACEV2 counts $used uses for a reward it did not give"; exit 1; }
  # A reward deleted while a void waits for its lock: the void changes nothing and says so.
  hold_open "delete from public.voucher_redemptions where booking_reference = 'FLTGONE';" &
  await_hold || { echo "Postgres ${version}: the delete never opened"; exit 1; }
  reply=$(scalar "select public.void_trip_voucher('FLTGONE')" 2>&1) || true
  wait
  case "$reply" in *'"status": "none"'*) ;; *) echo "Postgres ${version}: voiding a vanished reward was answered: $reply"; exit 1 ;; esac
  used=$(scalar "select redemptions_count from public.vouchers where code = 'RACEGONE'")
  [ "$used" = "1" ] || { echo "Postgres ${version}: RACEGONE counts $used uses after a void that found nothing"; exit 1; }
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  NAME=""
  echo "Postgres ${version}: every check passed"
done
echo "Jet Wallet SQL: every check passed"
