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

-- A starter list of common cruise ports, so most itineraries need no typing.
-- Positions are the cruise pier or port area, to about 0.05 degrees; staff can
-- correct any of them on the catalog's Ports tab, and a re-run never overwrites
-- a port staff have already changed.
insert into public.cruise_ports (name, country, lat, lon) values
  ('Miami', 'United States', 25.7781, -80.1794),
  ('Fort Lauderdale', 'United States', 26.0920, -80.1226),
  ('Port Canaveral', 'United States', 28.4101, -80.6188),
  ('Tampa', 'United States', 27.9425, -82.4466),
  ('Galveston', 'United States', 29.3105, -94.7930),
  ('New Orleans', 'United States', 29.9363, -90.0587),
  ('Key West', 'United States', 24.5590, -81.8070),
  ('San Juan', 'Puerto Rico', 18.4655, -66.1057),
  ('Nassau', 'Bahamas', 25.0786, -77.3431),
  ('Freeport', 'Bahamas', 26.5180, -78.7790),
  ('CocoCay', 'Bahamas', 25.8179, -77.9409),
  ('Half Moon Cay', 'Bahamas', 24.5789, -75.9330),
  ('Bimini', 'Bahamas', 25.7280, -79.2950),
  ('Cozumel', 'Mexico', 20.4880, -86.9690),
  ('Costa Maya', 'Mexico', 18.7166, -87.7090),
  ('Progreso', 'Mexico', 21.2830, -89.6650),
  ('Roatán', 'Honduras', 16.3170, -86.5370),
  ('Belize City', 'Belize', 17.4920, -88.1880),
  ('Grand Cayman', 'Cayman Islands', 19.2950, -81.3830),
  ('Ocho Rios', 'Jamaica', 18.4100, -77.1030),
  ('Falmouth', 'Jamaica', 18.4930, -77.6560),
  ('Montego Bay', 'Jamaica', 18.4670, -77.9400),
  ('Labadee', 'Haiti', 19.7830, -72.2440),
  ('Amber Cove', 'Dominican Republic', 19.8150, -70.7330),
  ('La Romana', 'Dominican Republic', 18.4170, -68.9600),
  ('St. Thomas', 'U.S. Virgin Islands', 18.3360, -64.9280),
  ('St. Croix', 'U.S. Virgin Islands', 17.7110, -64.8850),
  ('Tortola', 'British Virgin Islands', 18.4220, -64.6170),
  ('St. Maarten', 'Sint Maarten', 18.0180, -63.0470),
  ('St. Kitts', 'Saint Kitts and Nevis', 17.2950, -62.7230),
  ('Antigua', 'Antigua and Barbuda', 17.1270, -61.8510),
  ('St. Lucia', 'Saint Lucia', 14.0140, -60.9920),
  ('Barbados', 'Barbados', 13.1060, -59.6320),
  ('Martinique', 'Martinique', 14.6040, -61.0680),
  ('Guadeloupe', 'Guadeloupe', 16.2330, -61.5340),
  ('Dominica', 'Dominica', 15.2960, -61.3880),
  ('Grenada', 'Grenada', 12.0500, -61.7520),
  ('St. Vincent', 'Saint Vincent and the Grenadines', 13.1550, -61.2270),
  ('Bonaire', 'Bonaire', 12.1500, -68.2770),
  ('Aruba', 'Aruba', 12.5180, -70.0380),
  ('Curaçao', 'Curaçao', 12.1070, -68.9350),
  ('Cartagena', 'Colombia', 10.4020, -75.5280),
  ('Colón', 'Panama', 9.3600, -79.9000),
  ('Puerto Limón', 'Costa Rica', 9.9900, -83.0300),
  ('Bermuda', 'Bermuda', 32.3270, -64.8340),
  ('Seattle', 'United States', 47.6290, -122.3810),
  ('Vancouver', 'Canada', 49.2880, -123.1110),
  ('Victoria', 'Canada', 48.4140, -123.3870),
  ('Juneau', 'United States', 58.2990, -134.4060),
  ('Ketchikan', 'United States', 55.3420, -131.6460),
  ('Skagway', 'United States', 59.4500, -135.3240),
  ('Sitka', 'United States', 57.0530, -135.3350),
  ('Icy Strait Point', 'United States', 58.1290, -135.4430),
  ('Seward', 'United States', 60.1040, -149.4420),
  ('Whittier', 'United States', 60.7730, -148.6830),
  ('Los Angeles', 'United States', 33.7420, -118.2770),
  ('Long Beach', 'United States', 33.7550, -118.1890),
  ('San Diego', 'United States', 32.7130, -117.1750),
  ('San Francisco', 'United States', 37.8010, -122.3980),
  ('Ensenada', 'Mexico', 31.8580, -116.6260),
  ('Cabo San Lucas', 'Mexico', 22.8800, -109.9100),
  ('Puerto Vallarta', 'Mexico', 20.6530, -105.2420),
  ('Mazatlán', 'Mexico', 23.1920, -106.4200),
  ('Honolulu', 'United States', 21.3070, -157.8660),
  ('Kahului', 'United States', 20.8950, -156.4710),
  ('Hilo', 'United States', 19.7290, -155.0670),
  ('Kailua-Kona', 'United States', 19.6400, -155.9990),
  ('Nawiliwili', 'United States', 21.9550, -159.3550),
  ('New York', 'United States', 40.7680, -73.9970),
  ('Cape Liberty', 'United States', 40.6670, -74.0830),
  ('Boston', 'United States', 42.3450, -71.0340),
  ('Bar Harbor', 'United States', 44.3920, -68.2040),
  ('Halifax', 'Canada', 44.6420, -63.5680),
  ('Saint John', 'Canada', 45.2700, -66.0610),
  ('Quebec City', 'Canada', 46.8150, -71.2030),
  ('Charlottetown', 'Canada', 46.2310, -63.1270),
  ('Barcelona', 'Spain', 41.3720, 2.1780),
  ('Palma de Mallorca', 'Spain', 39.5550, 2.6340),
  ('Valencia', 'Spain', 39.4460, -0.3180),
  ('Málaga', 'Spain', 36.7140, -4.4160),
  ('Gibraltar', 'Gibraltar', 36.1430, -5.3600),
  ('Lisbon', 'Portugal', 38.7110, -9.1250),
  ('Marseille', 'France', 43.3310, 5.3470),
  ('Nice', 'France', 43.6950, 7.2850),
  ('Ajaccio', 'France', 41.9200, 8.7410),
  ('Monte Carlo', 'Monaco', 43.7350, 7.4230),
  ('Genoa', 'Italy', 44.4080, 8.9200),
  ('Livorno', 'Italy', 43.5530, 10.3010),
  ('Civitavecchia', 'Italy', 42.0940, 11.7920),
  ('Naples', 'Italy', 40.8390, 14.2560),
  ('Messina', 'Italy', 38.1940, 15.5600),
  ('Palermo', 'Italy', 38.1240, 13.3680),
  ('Venice', 'Italy', 45.4370, 12.3200),
  ('Valletta', 'Malta', 35.8960, 14.5140),
  ('Piraeus', 'Greece', 37.9420, 23.6280),
  ('Santorini', 'Greece', 36.4200, 25.4310),
  ('Mykonos', 'Greece', 37.4590, 25.3220),
  ('Corfu', 'Greece', 39.6290, 19.9150),
  ('Rhodes', 'Greece', 36.4500, 28.2270),
  ('Dubrovnik', 'Croatia', 42.6590, 18.0850),
  ('Split', 'Croatia', 43.5040, 16.4410),
  ('Kotor', 'Montenegro', 42.4250, 18.7690),
  ('Istanbul', 'Turkey', 41.0260, 28.9830),
  ('Kuşadası', 'Turkey', 37.8640, 27.2580),
  ('Southampton', 'United Kingdom', 50.8960, -1.4000),
  ('Dover', 'United Kingdom', 51.1180, 1.3240),
  ('Amsterdam', 'Netherlands', 52.3780, 4.9080),
  ('Copenhagen', 'Denmark', 55.7050, 12.6080),
  ('Stockholm', 'Sweden', 59.3170, 18.0900),
  ('Helsinki', 'Finland', 60.1570, 24.9550),
  ('Tallinn', 'Estonia', 59.4450, 24.7610),
  ('Oslo', 'Norway', 59.9040, 10.7380),
  ('Bergen', 'Norway', 60.3970, 5.3140),
  ('Geiranger', 'Norway', 62.1010, 7.2060),
  ('Flåm', 'Norway', 60.8630, 7.1150),
  ('Stavanger', 'Norway', 58.9740, 5.7300),
  ('Reykjavik', 'Iceland', 64.1570, -21.8660),
  ('Kiel', 'Germany', 54.3240, 10.1450),
  ('Warnemünde', 'Germany', 54.1800, 12.0830),
  ('Hamburg', 'Germany', 53.5450, 9.9330),
  ('Le Havre', 'France', 49.4840, 0.1110),
  ('Zeebrugge', 'Belgium', 51.3330, 3.2000),
  ('Dubai', 'United Arab Emirates', 25.2700, 55.2830),
  ('Abu Dhabi', 'United Arab Emirates', 24.5210, 54.3730),
  ('Singapore', 'Singapore', 1.2650, 103.8210),
  ('Hong Kong', 'China', 22.3050, 114.2140),
  ('Yokohama', 'Japan', 35.4540, 139.6450),
  ('Sydney', 'Australia', -33.8580, 151.2100),
  ('Melbourne', 'Australia', -37.8440, 144.9310),
  ('Brisbane', 'Australia', -27.3880, 153.1590),
  ('Auckland', 'New Zealand', -36.8420, 174.7700),
  ('Buenos Aires', 'Argentina', -34.5860, -58.3700),
  ('Montevideo', 'Uruguay', -34.9050, -56.2120),
  ('Rio de Janeiro', 'Brazil', -22.8950, -43.1830),
  ('Valparaíso', 'Chile', -33.0360, -71.6270),
  ('Ushuaia', 'Argentina', -54.8070, -68.3020)
on conflict (name, country) do nothing;

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
