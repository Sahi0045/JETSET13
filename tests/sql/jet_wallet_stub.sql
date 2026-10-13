do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
create table if not exists public.users (id uuid primary key, email text);
insert into public.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'a@test.dev'),
  ('00000000-0000-4000-8000-000000000002', 'b@test.dev')
on conflict do nothing;
create table if not exists public.bookings (
  id bigserial primary key,
  booking_reference text unique,
  user_id uuid,
  travel_type text,
  status text,
  payment_status text,
  booking_details jsonb not null default '{}'::jsonb
);
