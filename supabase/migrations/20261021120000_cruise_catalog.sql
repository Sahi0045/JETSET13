-- Cruise catalog: the sailings staff enter by hand from the cruise lines' agent
-- portals, until a cruise API replaces the manual list.
--
-- Apply manually, with the owner's OK:
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/20261021120000_cruise_catalog.sql
-- Safe to run twice.
--
-- RLS on and no policies: anon and signed-in clients read nothing directly.
-- The backend reads with the service-role key and serves published sailings only.
--
-- One transaction: Supabase grants EXECUTE on new functions to anon and
-- authenticated, so a failure part-way must not leave cruise_save_sailing callable.

begin;

create table if not exists public.cruise_lines (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.cruise_ships (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.cruise_lines(id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  unique (line_id, name)
);

create table if not exists public.cruise_ports (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null,
  unlocode text,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  created_at timestamptz not null default now(),
  unique (name, country)
);

create table if not exists public.cruise_sailings (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  headline text,
  region text not null,
  line_id uuid not null references public.cruise_lines(id) on delete restrict,
  ship_id uuid references public.cruise_ships(id) on delete set null,
  nights integer not null check (nights between 1 and 60),
  -- All-in per person: fare plus port fees, taxes and every mandatory fee
  -- (California SB 478 requires the advertised price to include them).
  from_price_usd numeric(10, 2) check (from_price_usd > 0),
  price_checked_on date,
  inclusions text,
  photos jsonb not null default '[]'::jsonb,
  route jsonb,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cruise_sailings_status_region_idx on public.cruise_sailings (status, region);

create table if not exists public.cruise_sailing_days (
  sailing_id uuid not null references public.cruise_sailings(id) on delete cascade,
  day integer not null check (day >= 1),
  port_id uuid references public.cruise_ports(id) on delete restrict,
  arrive_time time,
  depart_time time,
  primary key (sailing_id, day)
);

create table if not exists public.cruise_sailing_dates (
  sailing_id uuid not null references public.cruise_sailings(id) on delete cascade,
  sail_date date not null,
  primary key (sailing_id, sail_date)
);

alter table public.cruise_lines enable row level security;
alter table public.cruise_ships enable row level security;
alter table public.cruise_ports enable row level security;
alter table public.cruise_sailings enable row level security;
alter table public.cruise_sailing_days enable row level security;
alter table public.cruise_sailing_dates enable row level security;

-- One sailing, its days and its dates replaced together, so a failed save never
-- leaves a sailing with half an itinerary.
create or replace function public.cruise_save_sailing(p_sailing jsonb, p_days jsonb, p_dates jsonb)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := nullif(p_sailing->>'id', '')::uuid;
begin
  if v_id is null then
    insert into public.cruise_sailings (
      slug, title, headline, region, line_id, ship_id, nights,
      from_price_usd, price_checked_on, inclusions, photos, route, status, created_by
    ) values (
      p_sailing->>'slug', p_sailing->>'title', p_sailing->>'headline', p_sailing->>'region',
      (p_sailing->>'line_id')::uuid, nullif(p_sailing->>'ship_id', '')::uuid, (p_sailing->>'nights')::integer,
      nullif(p_sailing->>'from_price_usd', '')::numeric, nullif(p_sailing->>'price_checked_on', '')::date,
      p_sailing->>'inclusions', coalesce(p_sailing->'photos', '[]'::jsonb), p_sailing->'route',
      p_sailing->>'status', nullif(p_sailing->>'created_by', '')::uuid
    )
    returning id into v_id;
  else
    update public.cruise_sailings set
      title = p_sailing->>'title',
      headline = p_sailing->>'headline',
      region = p_sailing->>'region',
      line_id = (p_sailing->>'line_id')::uuid,
      ship_id = nullif(p_sailing->>'ship_id', '')::uuid,
      nights = (p_sailing->>'nights')::integer,
      from_price_usd = nullif(p_sailing->>'from_price_usd', '')::numeric,
      price_checked_on = nullif(p_sailing->>'price_checked_on', '')::date,
      inclusions = p_sailing->>'inclusions',
      photos = coalesce(p_sailing->'photos', '[]'::jsonb),
      route = p_sailing->'route',
      status = p_sailing->>'status',
      updated_at = now()
    where id = v_id;
    if not found then
      raise exception 'cruise sailing % not found', v_id;
    end if;
  end if;

  delete from public.cruise_sailing_days where sailing_id = v_id;
  insert into public.cruise_sailing_days (sailing_id, day, port_id, arrive_time, depart_time)
  select v_id, (d->>'day')::integer, nullif(d->>'port_id', '')::uuid,
         nullif(d->>'arrive_time', '')::time, nullif(d->>'depart_time', '')::time
  from jsonb_array_elements(coalesce(p_days, '[]'::jsonb)) as d;

  delete from public.cruise_sailing_dates where sailing_id = v_id;
  insert into public.cruise_sailing_dates (sailing_id, sail_date)
  select v_id, (value #>> '{}')::date
  from jsonb_array_elements(coalesce(p_dates, '[]'::jsonb));

  return v_id;
end;
$$;

revoke execute on function public.cruise_save_sailing(jsonb, jsonb, jsonb) from public, anon, authenticated;

insert into storage.buckets (id, name, public)
values ('cruise-photos', 'cruise-photos', true)
on conflict (id) do nothing;

commit;
