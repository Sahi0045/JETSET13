-- Auto-create a public.users row for every new auth user (email AND OAuth e.g. Google),
-- so social-login users are always persisted to the app's users table.
-- Standard Supabase pattern: trigger on auth.users.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
      coalesce(meta->>'role', 'user'),
      ''  -- OAuth/social users have no local password
    )
    on conflict (id) do nothing;
  exception when others then
    -- Never block auth signup if the profile row insert fails for any reason.
    raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: create rows for existing auth users (e.g. past Google logins) that
-- are missing from public.users.
insert into public.users (id, email, first_name, last_name, name, role, password)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'first_name',
           nullif(split_part(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''), ' ', 1), '')),
  coalesce(u.raw_user_meta_data->>'last_name',
           nullif(split_part(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''), ' ', 2), '')),
  nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), ''),
  coalesce(u.raw_user_meta_data->>'role', 'user'),
  ''
from auth.users u
left join public.users p on p.id = u.id
where p.id is null
  and u.email is not null
  and not exists (select 1 from public.users pe where lower(pe.email) = lower(u.email))
on conflict (id) do nothing;
