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
