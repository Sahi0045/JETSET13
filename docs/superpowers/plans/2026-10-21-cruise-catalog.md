# Cruise Catalog (data + admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff can enter real cruise sailings in the admin panel: lines, ships, ports, day-by-day itineraries, sailing dates, an all-in "from" price stamped with the date it was checked, and credited photos. The public API serves only published sailings.

**Architecture:**
- New Supabase tables, with RLS on and no policies. A save function replaces a sailing's days and dates atomically.
- The validation and the sea-route computing are pure modules under `backend/services/cruiseCatalog/`.
- One router at `/api/cruise-catalog`: admin routes behind `protect, admin`, and public read routes.
- Two admin pages: the catalog list and the sailing editor.
- Nothing customer-facing changes in this plan.

**Tech Stack:** Express, Supabase (Postgres + Storage), React 18, Vitest + supertest, `searoute-ts@2.3.0` (sea routes and the UN/LOCODE port dataset).

**Spec:** `docs/superpowers/specs/2026-10-21-cruise-section-design.md` (sections "Admin panel → Cruise catalog", "Data", "Constraints")

**Scope:** this is plan 1 of 3 for the cruise section.
- Plan 2: the public cruise pages (globe, night chart, timeline, SEO), and the old pages removed.
- Plan 3: the cruise request → quote → pay → book → documents flow, My Trips → Cruise, the /request and My Requests removal, and the quote-flow fixes.

## Global Constraints

- Admin API calls use `adminFetch` / `adminHeaders` (`frontend/src/utils/adminAuth.js`). Never send a multipart body through `adminFetch`.
- Every admin route is `protect, admin`. The router is mounted in all three entry points: `server.js`, `backend/server.js`, and `backend/api/index.js` (the latter at both `/api/cruise-catalog` and `/cruise-catalog`).
- New tables: RLS enabled, no policies. Any new function has `revoke execute … from public, anon, authenticated`.
- The migration is applied **only with the owner's OK**: `psql "$SUPABASE_DB_URL" -f supabase/migrations/20261021120000_cruise_catalog.sql`.
- The "from" price is all-in. The admin form shows this note exactly: **"All-in per person: fare plus port fees, taxes and every mandatory fee (California SB 478)."**
- A price is stamped with the office date, `America/Los_Angeles`, as `YYYY-MM-DD`.
- Brand palette only: `#055B75`, `#034457`, `#0890BC`, `#65B3CF`, `#F1FBFD`.
- Pin `searoute-ts` to exactly `2.3.0`. 2.3.1 is under two weeks old.
- Branch `feat/cruise-catalog` in a worktree. Never stage `CLAUDE.md` or `frontend/src/Pages/Common/Navbar.jsx`. Merge only when the owner says "merge".
- Run tests CI-style: `VITE_SUPABASE_URL= AMADEUS_WS_ENDPOINT= npx vitest run …`.

## Review Focus

1. **A day list that skips or repeats a day number.** Clear error, nothing saved. (Task 2: `refuses days that skip or repeat`)
2. **Publishing with no sailing date today or later.** Refused with a message; saving as a draft still works. (Task 2: `publishing needs a date from today on`)
3. **A draft read through a public route by slug.** Must be 404, never data. (Task 4: `never serves a draft, even by slug`)
4. **A leg the sea network can't route** (an inland port, or the router throws). That leg becomes a straight line and the save still succeeds. (Task 3: `falls back to a straight leg`)
5. **Re-saving with the price unchanged.** Keeps the old "checked" date, so staleness is never refreshed silently. Ticking "re-checked today" restamps it. (Task 2: `stampPrice`)

---

### Task 1: Tables, save function and photo bucket

**Files:**
- Create: `supabase/migrations/20261021120000_cruise_catalog.sql`
- Create: `shared/cruiseRegions.js`
- Test: `tests/backend/cruiseCatalogMigration.test.js`

**Interfaces:**
- Produces:
  - tables `cruise_lines`, `cruise_ships`, `cruise_ports`, `cruise_sailings`, `cruise_sailing_days`, `cruise_sailing_dates`;
  - function `public.cruise_save_sailing(p_sailing jsonb, p_days jsonb, p_dates jsonb) returns uuid`;
  - public bucket `cruise-photos`;
  - `CRUISE_REGIONS: Array<{ key, name, lat, lon }>` and `regionByKey(key)` from `shared/cruiseRegions.js`.

**Columns:**
- `cruise_lines`: id uuid pk default gen_random_uuid(), name text not null unique, created_at timestamptz default now().
- `cruise_ships`: id, line_id → cruise_lines (on delete restrict), name text not null, unique(line_id, name).
- `cruise_ports`:
  - id, name text not null, country text not null, unlocode text null;
  - lat double precision not null, check -90..90; lon double precision not null, check -180..180;
  - unique(name, country).
- `cruise_sailings`:
  - id, slug text not null unique, title text not null, headline text;
  - region text not null; line_id → cruise_lines not null; ship_id → cruise_ships null;
  - nights int not null, check 1..60;
  - from_price_usd numeric(10,2) null, check > 0; price_checked_on date null;
  - inclusions text; photos jsonb not null default '[]';
  - route jsonb null;
  - status text not null default 'draft', check in ('draft','published');
  - created_by uuid null; created_at and updated_at timestamptz default now().
- `cruise_sailing_days`: sailing_id → cruise_sailings on delete cascade, day int not null check ≥ 1, port_id → cruise_ports null (null = at sea), arrive_time time null, depart_time time null, primary key(sailing_id, day).
- `cruise_sailing_dates`: sailing_id → cruise_sailings on delete cascade, sail_date date not null, primary key(sailing_id, sail_date).

**Regions** (`shared/cruiseRegions.js`, exact keys; the globe pins use lat/lon):

| key | name | lat | lon |
|---|---|---|---|
| caribbean | Caribbean | 17 | -72 |
| bahamas | Bahamas | 25 | -77.5 |
| bermuda | Bermuda | 32.3 | -64.8 |
| mexican-riviera | Mexican Riviera | 21 | -106 |
| alaska | Alaska | 58 | -136 |
| hawaii | Hawaii | 20.8 | -157 |
| canada-new-england | Canada & New England | 44 | -65 |
| panama-canal | Panama Canal | 9.1 | -79.7 |
| mediterranean | Mediterranean | 38 | 15 |
| northern-europe | Northern Europe | 58 | 10 |
| transatlantic | Transatlantic | 35 | -40 |
| middle-east | Middle East | 25 | 55 |
| asia | Asia | 15 | 115 |
| australia-new-zealand | Australia & New Zealand | -35 | 160 |
| south-america | South America | -30 | -55 |

- [ ] **Step 1: Write the failing test**

It reads the migration's SQL text and checks:

```js
it.each(TABLES)('%s has RLS on and no policies', (t) => {
  expect(sql).toMatch(new RegExp(`alter table public\\.${t} enable row level security`, 'i'));
});
it('creates no policies', () => expect(sql).not.toMatch(/create policy/i));
it('keeps the save function from anon and signed-in callers', () =>
  expect(sql).toMatch(/revoke execute on function public\.cruise_save_sailing\(jsonb, jsonb, jsonb\) from public, anon, authenticated/i));
it('makes a public photo bucket', () => expect(sql).toMatch(/'cruise-photos'[\s\S]*true/));
it('lists 15 regions with coordinates', () => {
  expect(CRUISE_REGIONS).toHaveLength(15);
  for (const r of CRUISE_REGIONS) { expect(Math.abs(r.lat)).toBeLessThanOrEqual(90); expect(Math.abs(r.lon)).toBeLessThanOrEqual(180); }
  expect(regionByKey('alaska').name).toBe('Alaska');
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `VITE_SUPABASE_URL= npx vitest run tests/backend/cruiseCatalogMigration.test.js`
Expected: FAIL (file not found).

- [ ] **Step 3: Write the migration and `shared/cruiseRegions.js`**
  - **Header comment:** "Apply manually: psql … -f". It is safe to run twice (`if not exists`, `on conflict do nothing`), all in one `begin; … commit;`.
  - **`cruise_save_sailing`:** upsert the sailing from `p_sailing` (insert when there is no `id`, else update every column and set `updated_at = now()`). Delete that sailing's days and dates. Insert from `p_days` (`[{day, port_id, arrive_time, depart_time}]`) and `p_dates` (`["YYYY-MM-DD"]`). Return the id.
  - **Photo bucket:** `insert into storage.buckets (id, name, public) values ('cruise-photos', 'cruise-photos', true) on conflict (id) do nothing;`

- [ ] **Step 4: Run, expect PASS.** Same command.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261021120000_cruise_catalog.sql shared/cruiseRegions.js tests/backend/cruiseCatalogMigration.test.js
git commit -m "feat(cruise): catalog tables, atomic sailing save and the photo bucket"
```

### Task 2: Validating a sailing

**Files:**
- Create: `backend/services/cruiseCatalog/sailingInput.js`
- Test: `tests/backend/cruiseSailingInput.test.js`

**Interfaces:**
- Consumes: `regionByKey` (Task 1).
- Produces:
  - `sailingInput(body, { today }) -> { ok: true, sailing, days, dates } | { ok: false, error }`. Here `sailing` uses DB column names, without slug and without price stamping.
  - `stampPrice({ previousPrice, previousCheckedOn, price, recheckedToday, today }) -> { from_price_usd, price_checked_on }`.
  - `makeSlug(title, nights, idSuffix) -> string`, for example `makeSlug('Western Caribbean', 7, 'a1b2')` → `'western-caribbean-7-nights-a1b2'`.
  - `todayInOffice(now = new Date()) -> 'YYYY-MM-DD'` (America/Los_Angeles).

**Body fields:**
- `title`, `headline`, `region`, `lineId`, `shipId`, `nights`, `inclusions`, `status`
- `days: [{ day, portId|null, arrive:'HH:MM'|null, depart:'HH:MM'|null }]`
- `dates: ['YYYY-MM-DD']`
- `fromPriceUsd: number|null`, `recheckedToday: boolean`
- `photos: [{ url, credit }]`

**Rules and their exact error messages:**

| Rule | Error |
|---|---|
| title 3–120 chars | `The title must be 3 to 120 characters.` |
| region one of the 15 keys | `Pick a region from the list.` |
| lineId present | `Pick the cruise line.` |
| nights an integer 1–60 | `Nights must be a whole number from 1 to 60.` |
| days are exactly 1…nights+1, once each | `The itinerary must list every day from 1 to ${nights + 1}, once each.` |
| first and last day are ports | `The first and last day must be a port, not a day at sea.` |
| times match `^([01]\d|2[0-3]):[0-5]\d$` or are empty | `Times must look like 16:00.` |
| price null or > 0 with at most 2 decimals | `The price must be a positive amount in dollars, like 849 or 849.50.` |
| photos ≤ 12; each url starts with `${process.env.SUPABASE_URL}/storage/v1/object/public/cruise-photos/` and has a credit of 1–120 chars | `Each photo needs a credit, and must be uploaded here.` |
| dates valid `YYYY-MM-DD`, unique, ≤ 52 | `Sailing dates must be real dates, each listed once (52 at most).` |
| publishing: at least one date ≥ today | `To publish, add at least one sailing date from today on.` |
| publishing: at least two port days | `To publish, the itinerary needs at least two ports.` |

`stampPrice` rules:
- the price changed, or `recheckedToday` → `price_checked_on = today`;
- the price is the same and not rechecked → the previous date is kept;
- the price is null → `{ from_price_usd: null, price_checked_on: null }`.

- [ ] **Step 1: Write the failing tests**

There is one test per rule row (body valid except the field under test), plus:

```js
it('refuses days that skip or repeat', () => {
  expect(sailingInput(valid({ nights: 3, days: days([1, 2, 2, 4]) }), { today }).error)
    .toBe('The itinerary must list every day from 1 to 4, once each.');
});
it('publishing needs a date from today on', () => {
  expect(sailingInput(valid({ status: 'published', dates: ['2026-10-20'] }), { today: '2026-10-21' }).error)
    .toBe('To publish, add at least one sailing date from today on.');
  expect(sailingInput(valid({ status: 'draft', dates: ['2026-10-20'] }), { today: '2026-10-21' }).ok).toBe(true);
});
describe('stampPrice', () => {
  it('keeps the old date when the price is unchanged', () =>
    expect(stampPrice({ previousPrice: 849, previousCheckedOn: '2026-09-01', price: 849, recheckedToday: false, today: '2026-10-21' }))
      .toEqual({ from_price_usd: 849, price_checked_on: '2026-09-01' }));
  it('restamps when re-checked or changed', () => {
    expect(stampPrice({ previousPrice: 849, previousCheckedOn: '2026-09-01', price: 849, recheckedToday: true, today: '2026-10-21' }).price_checked_on).toBe('2026-10-21');
    expect(stampPrice({ previousPrice: 849, previousCheckedOn: '2026-09-01', price: 899, recheckedToday: false, today: '2026-10-21' }).price_checked_on).toBe('2026-10-21');
  });
});
it('slugs the title', () => expect(makeSlug('Western Caribbean!', 7, 'a1b2')).toBe('western-caribbean-7-nights-a1b2'));
it('dates in the office time zone', () => expect(todayInOffice(new Date('2026-10-22T05:00:00Z'))).toBe('2026-10-21'));
```

- [ ] **Step 2: Run, expect FAIL.** `VITE_SUPABASE_URL= npx vitest run tests/backend/cruiseSailingInput.test.js`
- [ ] **Step 3: Implement** the four exports. Use `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' })` for `todayInOffice`.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(cruise): sailing validation, price stamping and slugs`

### Task 3: Sea routes

**Files:**
- Modify: `package.json` (`"searoute-ts": "2.3.0"`, exact)
- Create: `backend/services/cruiseCatalog/seaRoute.js`
- Test: `tests/backend/cruiseSeaRoute.test.js`

**Interfaces:**
- Produces:
  - `routeForPorts(ports: Array<{ lat, lon }>, { router = seaRoute } = {}) -> { type: 'LineString', coordinates: [[lon, lat], …] } | null`. It returns null when there are fewer than two distinct consecutive ports.
  - `searchPorts(query: string, limit = 20) -> Array<{ name, country, unlocode, lat, lon }>`, from `searoute-ts/ports` (name contains the query, case-insensitive). If that subpath isn't in 2.3.0, rule and ledger, then fall back to `dist/ports.json`.

**Approach:** route each consecutive leg with `seaRoute([lon, lat], [lon, lat])` and join the coordinates. A leg that throws, or returns no coordinates, becomes a straight line between its two ports. Consecutive identical ports are skipped.

- [ ] **Step 1: Write the failing tests**
  - `routes Miami to Cozumel by sea`: starts within 0.5° of Miami (25.77, -80.17), ends within 0.5° of Cozumel (20.51, -86.95), and has more than 2 points.
  - `falls back to a straight leg`: `router` throws, so the result is exactly the two endpoints.
  - `skips a repeated port`, and returns `null` for one port.
  - `finds Barcelona`: `searchPorts('barcelona')[0]` has `country` 'Spain' or the code 'ES', with lat about 41.3.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Install and implement.** Run `npm install searoute-ts@2.3.0 --save-exact`.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(cruise): sea routes between ports, and a port finder`

### Task 4: The catalog API

**Files:**
- Create: `backend/controllers/cruiseCatalog.controller.js`, `backend/routes/cruiseCatalog.routes.js`
- Modify: `server.js`, `backend/server.js`, `backend/api/index.js` (mount it, following the `voucherRoutes` lines)
- Test: `tests/backend/cruiseCatalogRoutes.test.js` (supertest, with Supabase mocked as in `tests/backend/tripVoucherAdmin.test.js`)

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces (all JSON `{ success, data | error }`):
  - Admin (`protect, admin`):
    - `GET /admin/sailings`: every sailing, as `{ id, slug, title, region, line_name, nights, status, from_price_usd, price_checked_on, next_date }`, newest first.
    - `GET /admin/sailings/:id`: full, with `days`, `dates` and `photos`.
    - `POST /admin/sailings` and `PUT /admin/sailings/:id`:
      1. validate with `sailingInput`, giving 400 and `error` on failure;
      2. stamp the price, comparing against the stored row on PUT;
      3. resolve the port coordinates and compute `route` with `routeForPorts`;
      4. make the slug on POST only (`idSuffix` = 4 random hex characters);
      5. call `rpc('cruise_save_sailing')` and return `{ id, slug }`.
    - `GET/POST /admin/lines`; `GET /admin/ships?lineId=`; `POST /admin/ships`; `GET/POST /admin/ports`; `PUT /admin/ports/:id`.
    - `GET /admin/port-search?q=` → `searchPorts`.
    - `POST /admin/photo-upload-url` with `{ filename }` → `{ path, token, publicUrl }`. Use `storage.from('cruise-photos').createSignedUploadUrl(path)` with `path = sailings/<uuid>.<ext>`, and allow only `jpg`, `jpeg`, `png` or `webp`.
  - Public:
    - `GET /sailings?region=` → published summaries, each with the next date ≥ today.
    - `GET /sailings/:slug` → published only, with days (port name, country, lat, lon, times), dates ≥ today, photos, route, line and ship names. 404 otherwise.
    - `GET /regions` → each region with its `count` of published sailings, only where `count > 0`.

- [ ] **Step 1: Write the failing tests**
  - `rejects anonymous admin calls`: use the real `protect` (don't mock it here) and `GET /api/cruise-catalog/admin/sailings` with no cookie → 401.
  - `never serves a draft, even by slug`: the mock returns a draft row → 404.
  - `lists only published sailings` (assert that the `eq('status','published')` filter was used).
  - `saves a sailing through the save function with a computed route`: assert `rpc` was called with `cruise_save_sailing` and `p_sailing.route.type === 'LineString'`.
  - `refuses a bad body with the validation message` → 400 plus the exact message from Task 2.
  - `keeps the checked date when the price is unchanged on PUT`.
  - `refuses a photo that is not an image` → 400 for `.pdf`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** and mount it in the three entry points.
- [ ] **Step 4: Run, expect PASS.** Also run `tests/backend/publicDataExposure.test.js`.
- [ ] **Step 5: Commit** `feat(cruise): catalog API - admin editing behind admin auth, public reads of published sailings only`

### Task 5: Admin pages

**Files:**
- Create: `frontend/src/Pages/Admin/CruiseCatalog.jsx`, which has three tabs:
  - **Sailings:** a table with title, region, line, nights, status, price, checked date, and a "Price over 30 days old" badge.
  - **Lines & ships:** a list plus add forms.
  - **Ports:** a list, plus add by search (`port-search`, which fills in lat/lon) or by hand.
- Create: `frontend/src/Pages/Admin/CruiseSailingEdit.jsx`, a form with:
  - line and ship selects;
  - region, title, headline and nights;
  - a day editor (one row per day: port select or "At sea", arrive, depart);
  - a date list;
  - the price, with the exact SB 478 note and a "Price re-checked today" tick box;
  - inclusions;
  - photos (upload plus a credit for each);
  - Draft/Published;
  - Save. On a server error it shows the server's `error` text.
- Modify:
  - `frontend/src/Pages/Admin/AdminPanel.jsx`: add routes `cruises`, `cruises/new`, `cruises/:id`.
  - `frontend/src/Pages/Admin/shell/AdminSidebar.jsx`: add `{ to: '/admin/cruises', icon: LuShip, label: 'Cruise Catalog', roles: ADMINS }` after Bookings. Use the `LuShip` icon from `react-icons/lu`.
- Test: `tests/components/adminCruiseCatalog.test.jsx`, which stubs `fetch` and `lib/supabase`.

**Interfaces:**
- Consumes: Task 4's routes.
- Photo upload, in two steps:
  1. `adminFetch('/api/cruise-catalog/admin/photo-upload-url', { method: 'POST', body: JSON.stringify({ filename }) })`;
  2. `supabase.storage.from('cruise-photos').uploadToSignedUrl(path, token, file)`, then add `{ url: publicUrl, credit: '' }`.
- The day editor keeps one row per day from 1 to nights+1, resizing when nights changes.

- [ ] **Step 1: Write the failing tests**
  - `shows the all-in price note`: the editor contains the exact note text.
  - `has one day row per day`: nights = 7 gives 8 rows, and changing it to 3 gives 4.
  - `shows the server's message when a save is refused`: stub a 400 `{ error: 'To publish, add at least one sailing date from today on.' }` → the text is visible.
  - `flags an old price in the list`: a row with `price_checked_on` 31 days before today shows "Price over 30 days old".
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Use the brand colours and the admin shell's existing styles. No new UI library.
- [ ] **Step 4: Run, expect PASS.** Then run `npm run build`.
- [ ] **Step 5: Commit** `feat(cruise): admin cruise catalog - sailings, lines, ships, ports and photos`

### Task 6: Release

- [ ] **Step 1: Full suite, CI-style.** All tests pass.
- [ ] **Step 2: Push and open the PR**, then wait for CI in the background.
- [ ] **Step 3: Ask the owner to OK the migration.** Apply it after the OK, then check: `select count(*) from cruise_sailings;` returns 0, and the bucket `cruise-photos` exists and is public.
- [ ] **Step 4: Merge on "merge"**, then run `bash scripts/deploy-frontend.sh origin/main`.
- [ ] **Step 5: Browser check:**
  - `/admin/cruises` loads;
  - create a draft sailing (2 ports, 1 date) and upload a photo;
  - publish it, and check that `GET /api/cruise-catalog/sailings` lists it;
  - set it back to draft, and check that the public route answers 404;
  - check the console has no errors.
  Leave the test sailing as a draft. There is no delete in this plan.
