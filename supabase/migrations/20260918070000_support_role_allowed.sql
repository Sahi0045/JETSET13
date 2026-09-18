-- `support` is a role the users table would not accept.
--
-- public.users has a CHECK constraint listing the roles it allows:
--   user, agent, admin, superadmin
-- so the first invitation from the support desk was refused by the database
-- ("new row for relation users violates check constraint users_role_check"),
-- and the desk could only say "Could not send the invitation".
--
-- The constraint is worth keeping - it is what stops a typo becoming a role
-- nothing checks for - so it gains the one role the desk uses.

alter table public.users drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check
  check (role = any (array['user'::text, 'agent'::text, 'admin'::text, 'superadmin'::text, 'support'::text]));
