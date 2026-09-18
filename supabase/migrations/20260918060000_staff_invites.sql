-- Invitations for back-office accounts (support desk).
--
-- Travel agents are onboarded with a link: the admin invites an email address,
-- the person opens the link, sets their own password, and the account becomes
-- active. Support accounts had no such path - a script set a password the owner
-- had chosen and then had to send it to them - so support gets the same flow,
-- and the columns the `agents` table already has.
--
-- Additive only: every column is nullable and nothing existing is touched. The
-- token is stored as a SHA-256 hash, so the link in the email is the only copy
-- of the secret (scripts/../staff.routes.js), and it expires in 48 hours.

alter table public.users
  add column if not exists invite_token_hash text,
  add column if not exists invite_expires_at timestamptz,
  add column if not exists invited_at timestamptz,
  add column if not exists invite_accepted_at timestamptz;

-- One index, for the only lookup: "which account does this link belong to?"
create index if not exists users_invite_token_hash_idx
  on public.users (invite_token_hash)
  where invite_token_hash is not null;

comment on column public.users.invite_token_hash is
  'SHA-256 of the staff invitation token; null once accepted, expired or never invited.';
