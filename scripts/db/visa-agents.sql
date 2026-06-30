-- ─────────────────────────────────────────────────────────────────────────────
-- Visa processing agents
--
-- A "visa agent" is a staff member who reviews and processes visa applications.
-- Their IDENTITY + login live in public.users (role = 'agent'), so they sign in
-- through the normal /api/auth/login and the visa panel's existing JWT/role guard
-- works unchanged. This table holds only the visa-specific profile + invite state,
-- so the shared users table is left untouched.
--
-- Role hierarchy: superadmin ⊃ admin ⊃ agent ⊃ user.
--   • superadmin  — manages agents (this is shubhamkush012@gmail.com)
--   • admin       — full visa operations, but cannot manage agents
--   • agent       — processes ONLY the applications assigned to them
--
-- Note: there is a separate public.agents table for payment/sales agents — that is
-- a different concept (commission, payment links) and is intentionally NOT reused.
-- ─────────────────────────────────────────────────────────────────────────────

-- The users_role_check constraint originally allowed only ('user','admin'), so the 'agent'
-- role in the panel code was never actually creatable. Widen it to add 'agent' (and
-- 'superadmin', reserved for future use). This only ADDS allowed values — no rows affected.
--
-- NOTE: the super admin is NOT a DB role. shubhamkush012@gmail.com stays role='admin' so the
-- many existing `role === 'admin'` checks across the platform keep working; the extra
-- "manage agents" capability is granted by an email allowlist (VISA_SUPERADMIN_EMAILS,
-- default shubhamkush012@gmail.com) checked in auth.middleware.js.
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role = any (array['user'::text, 'agent'::text, 'admin'::text, 'superadmin'::text]));

create table if not exists public.visa_agents (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null unique references public.users(id) on delete cascade,
  status             text not null default 'invited'
                       check (status in ('invited', 'active', 'disabled')),
  specialization     text,                 -- e.g. "India, UAE eVisa" (free text for now)
  created_user       boolean not null default false,  -- true = we created this account (safe to
                                            -- hard-delete on removal); false = promoted an existing
                                            -- user (demote to 'user' on removal, never delete)
  invite_token_hash  text,                 -- sha256 of the one-time invite token (null once accepted)
  invite_expires_at  timestamptz,
  invited_at         timestamptz default now(),
  accepted_at        timestamptz,
  created_by         uuid references public.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_visa_agents_user   on public.visa_agents(user_id);
create index if not exists idx_visa_agents_status on public.visa_agents(status);

-- (Super admin is granted via the VISA_SUPERADMIN_EMAILS allowlist, not a DB role —
-- see the note above. shubhamkush012@gmail.com remains role='admin'.)
