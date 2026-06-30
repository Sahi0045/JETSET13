-- ─────────────────────────────────────────────────────────────────────────────
-- Travel (sales) agents — invite-based onboarding, mirroring the visa agent flow.
--
-- Travel agents live in public.agents (their sales link via payment_links.agent_id).
-- This adds the invite/onboarding state so a super admin can create an agent who then
-- sets their own password via an emailed link, exactly like visa agents — without
-- disturbing the existing agents or their payment-link history.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.agents add column if not exists invite_token_hash text;
alter table public.agents add column if not exists invite_expires_at timestamptz;
alter table public.agents add column if not exists invited_at        timestamptz;
alter table public.agents add column if not exists accepted_at       timestamptz;
alter table public.agents add column if not exists created_by        uuid;

-- Existing agents already have passwords and are active → treat them as accepted.
update public.agents set accepted_at = coalesce(accepted_at, created_at, now())
  where status = 'active' and accepted_at is null;

-- Widen the status check to add 'invited' (created, awaiting password) and 'disabled'
-- (revoked), keeping the legacy values so existing rows stay valid.
do $$
declare cname text;
begin
  select conname into cname
    from pg_constraint
   where conrelid = 'public.agents'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%status%';
  if cname is not null then
    execute format('alter table public.agents drop constraint %I', cname);
  end if;
end $$;

alter table public.agents add constraint agents_status_check
  check (status in ('invited', 'active', 'disabled', 'inactive', 'suspended'));
