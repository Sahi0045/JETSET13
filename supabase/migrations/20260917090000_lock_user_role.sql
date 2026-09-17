-- A customer could make themselves an admin.
--
-- The backend decides admin access from public.users.role alone
-- (auth.middleware.js), and two things let the customer write that column:
--
--   1. handle_new_user() copied `role` from signup metadata, which the person
--      signing up chooses: supabase.auth.signUp({ options: { data: { role: 'admin' } } })
--      with the public anon key.
--   2. The "update their own data" policies let an authenticated user update
--      any column of their own row, role included, and the insert policy let
--      them insert a row for themselves with any role after deleting their own.
--
-- Proven on the live database on 2026-09-17 with
-- scripts/maintenance/verify-user-role-guard.sql (rolled back): a customer's
-- update of their own role and an insert with role 'admin' both succeeded.
--
-- Role changes belong to the backend, which uses the service role. Column
-- privileges cannot close this - a table-level UPDATE grant covers every
-- column - so a trigger does it: for the anon and authenticated roles, an
-- insert always gets 'user' and an update may not change the role.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  full_name text := coalesce(meta->>'full_name', meta->>'name', '');
  fname text := coalesce(meta->>'first_name', nullif(split_part(full_name, ' ', 1), ''));
  lname text := coalesce(meta->>'last_name', nullif(split_part(full_name, ' ', 2), ''));
begin
  begin
    insert into public.users (id, email, first_name, last_name, name, role, password)
    values (
      new.id,
      new.email,
      fname,
      lname,
      nullif(trim(coalesce(full_name, '')), '') ,
      -- Never from metadata: whoever signs up writes it.
      'user',
      ''  -- OAuth/social users have no local password
    )
    on conflict (id) do nothing;
  exception when others then
    -- Never block auth signup if the profile row insert fails for any reason.
    raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$function$;

-- Not SECURITY DEFINER: current_user has to be the caller's role.
create or replace function public.guard_user_role()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.role := 'user';
    elsif new.role is distinct from old.role then
      raise exception 'a user role can only be changed by staff'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_user_role on public.users;
create trigger guard_user_role
  before insert or update on public.users
  for each row execute function public.guard_user_role();
