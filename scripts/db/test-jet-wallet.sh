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
run() { docker exec -i -e PGOPTIONS='-c client_min_messages=warning' "$NAME" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres; }
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
