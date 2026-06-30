-- ─────────────────────────────────────────────────────────────────────────────
-- Commission payouts — the super admin records when an agent has been paid their
-- earned commission. Outstanding = (commission earned from paid sales) − (sum of
-- payouts). This is the ledger behind the agent performance panel.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.commission_payouts (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references public.agents(id) on delete cascade,
  amount      numeric(12, 2) not null check (amount > 0),
  note        text,
  paid_by     uuid,                       -- super admin user id who recorded it
  created_at  timestamptz not null default now()
);

create index if not exists idx_commission_payouts_agent on public.commission_payouts(agent_id);
create index if not exists idx_commission_payouts_created on public.commission_payouts(created_at desc);
