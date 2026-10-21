# Cruise Pages (customer-facing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customers see every sailing staff publish in the Cruise Catalog, on two new pages built to the approved "B and C combined" mockup, as soon as it is published:
- `/cruises`: a dusk ocean, the globe as the moon, region chips and sailing cards;
- `/cruise/:slug`: a sunset-to-night sky, a night chart, a day timeline and a sticky price box.

The old static cruise pages and data are removed.

**Architecture:**
- Both pages read the public catalog API from Plan 1 (`/api/cruise-catalog/sailings`, `/sailings/:slug`, `/regions`).
- The globe is `cobe`, a ~5 KB WebGL library, lazy-loaded after first paint.
- The chart is an SVG drawn with `d3-geo` from Natural Earth coastlines (`world-atlas` land-50m, via `topojson-client`), lazy-loaded on the sailing page only.
- Everything shown on the chart is also plain HTML text.
- `/cruise` and `/itinerary` redirect to `/cruises`. A dynamic sitemap lists the published sailings.
- The mobile app's `/api/cruises` serves published sailings from the database instead of the static file.

**Tech Stack:** React 18, Vite, Tailwind 3, react-helmet-async, `cobe@2.0.1`, `d3-geo@3.1.1`, `topojson-client@3.1.0`, `world-atlas@2.0.2`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-21-cruise-section-design.md` (sections "The pages", "Removals", "Mobile app", "Constraints"). Approved mockup: `docs/superpowers/specs/assets/2026-10-21-cruise-mockup.html`.

**Owner decision (21 Oct, after the spec):** "if we list, they can see that". A sailing shows to customers as soon as it is published. **This replaces the spec's default of waiting for 10 published sailings.** With no published sailing, `/cruises` shows the hero and an empty state with the phone number and email.

**Scope:** plan 2 of 3. Plan 3 replaces "Call / Email" on the sailing page with the request form, and adds the quote → pay → book → documents flow.

## Global Constraints

- **Brand palette:** teal `#055B75`, dark `#034457`, accent `#0890BC`, sky `#65B3CF`, light `#F1FBFD`. Night tones are darker shades of the teals. One warm highlight, `#F3C58F`, marks the selected port, the selected region and the sunset line. Never `#0066FF`, `#1e40af`, `#1976D2` or `#0EA5E9`.
- **Type:** Fraunces (display), Manrope (body), IBM Plex Mono (times, days, labels). Load them from Google Fonts with `display=swap`, **on the cruise pages only**, via `<Helmet>`.
- **Price label:** `From $X per person, port fees included · price checked <D Mon>`.
  - When `price_checked_on` is more than 30 days before the office date, or the price is null, show **"Ask for today's price"** instead.
  - Office date: America/Los_Angeles.
- **Contact until Plan 3:** call `tel:+18775387380` "(877) 538-7380", or email `mailto:support@jetsetterss.com` with subject `Cruise inquiry: <title>`.
- **No invented content.** No ratings, review counts, traveller counts, "popular" or "most-booked" labels, or offers. The test `cruiseNoInventedClaims` keeps covering `frontend/src/Pages/Common/cruise/`.
- **Performance:**
  - The first paint is HTML plus a still image.
  - `cobe`, `d3-geo`, `topojson-client` and `world-atlas` load with `import()` after mount, in their own `cruise-map` chunk (`vite.config.js` `manualChunks`), never in `vendor-misc`.
  - `prefers-reduced-motion: reduce` or `navigator.connection.saveData` gives a still globe image and no animation.
- **Phones:** a 16px side gutter, no horizontal scroll, and the price plus "Call / Email" pinned to the bottom of the sailing page.
- **SEO and routing:** every sailing has its own path `/cruise/<slug>`, its own title and description, and its day-by-day ports and times as HTML text. `/cruise` and `/itinerary` redirect **permanently** to `/cruises` (vercel.json plus `LEGACY_REDIRECTS`).
- **Process:**
  - Branch `feat/cruise-pages` in a worktree.
  - Never stage `CLAUDE.md` or `frontend/src/Pages/Common/Navbar.jsx`.
  - Merge only when the owner says "merge".
  - Run tests CI-style: `VITE_SUPABASE_URL= AMADEUS_WS_ENDPOINT= npx vitest run …`.
  - After the deploy, check `/`, `/flights`, `/cruises` and one sailing page in a browser, with the console read.

## Review Focus

1. **A published sailing with a null price or a price over 30 days old.** It shows "Ask for today's price" on the card and the sailing page, never "$0" or an old figure. (Task 1: `priceLabel`)
2. **A route that crosses the 180° line** (Honolulu → Yokohama), or **a sailing with no route.** The chart still draws without throwing, and the timeline still lists every day. (Task 2)
3. **No WebGL, reduced motion, or Save-Data.** The globe area shows a still image, and the region chips still work. (Task 3)
4. **An unknown or unpublished slug.** A clear "This cruise isn't available" page with a link to `/cruises`, and a noindex robots tag. (Task 5)
5. **Zero published sailings, or a region with none.** `/cruises` shows the empty state with the contact details, not a blank grid. (Task 4)

---

### Task 1: Catalog client and price label

**Files:**
- Create: `frontend/src/Pages/Common/cruise/catalog.js`
- Test: `tests/components/cruiseCatalogClient.test.js`

**Interfaces:**
- Produces:
  - `fetchSailings(region?) -> Promise<Sailing[]>`, `fetchSailing(slug) -> Promise<SailingDetail|null>` (null on 404), and `fetchRegions() -> Promise<Region[]>`. All three use `getApiUrl('cruise-catalog/…')` from `frontend/src/utils/apiHelper`.
  - `priceLabel({ from_price_usd, price_checked_on }, today) -> { kind: 'price', amount: 'From $1,299', note: 'per person, port fees included · price checked 20 Oct' } | { kind: 'ask', amount: "Ask for today's price", note: 'Our team checks it with the cruise line' }`
  - `officeToday(now = new Date()) -> 'YYYY-MM-DD'`
  - `shortDate('2026-12-05') -> '5 Dec 2026'` and `dayMonth('2026-10-20') -> '20 Oct'`
  - `inquiryMail(title) -> 'mailto:support@jetsetterss.com?subject=…'` and `CRUISE_PHONE = { href: 'tel:+18775387380', text: '(877) 538-7380' }`

- [ ] **Step 1: Write the failing tests**

```js
it('shows the price with the day it was checked', () => {
  expect(priceLabel({ from_price_usd: 1299, price_checked_on: '2026-10-20' }, '2026-10-21'))
    .toEqual({ kind: 'price', amount: 'From $1,299', note: 'per person, port fees included · price checked 20 Oct' });
});
it('keeps cents only when there are some', () => expect(priceLabel({ from_price_usd: 849.5, price_checked_on: '2026-10-20' }, '2026-10-21').amount).toBe('From $849.50'));
it('asks for today\'s price when the price is over 30 days old', () => {
  expect(priceLabel({ from_price_usd: 1299, price_checked_on: '2026-09-20' }, '2026-10-21').kind).toBe('ask');
  expect(priceLabel({ from_price_usd: 1299, price_checked_on: '2026-09-21' }, '2026-10-21').kind).toBe('price');
});
it('asks for today\'s price when there is none', () => expect(priceLabel({ from_price_usd: null, price_checked_on: null }, '2026-10-21').amount).toBe("Ask for today's price"));
it('returns null for a cruise that is not there', async () => { /* fetch stub → 404 */ expect(await fetchSailing('nope')).toBeNull(); });
it('writes dates the way people read them', () => { expect(shortDate('2026-12-05')).toBe('5 Dec 2026'); expect(dayMonth('2026-10-20')).toBe('20 Oct'); });
it('asks about the sailing by email with its title', () => expect(inquiryMail('Western Caribbean')).toBe('mailto:support@jetsetterss.com?subject=Cruise%20inquiry%3A%20Western%20Caribbean'));
```

- [ ] **Step 2: Run, expect FAIL.** `VITE_SUPABASE_URL= npx vitest run tests/components/cruiseCatalogClient.test.js`
- [ ] **Step 3: Implement.** Use `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })`, and use two decimals only when the cents aren't zero.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(cruise): public catalog client and the honest price label`

### Task 2: The night chart and route thumbnails

**Files:**
- Modify: `package.json` (exact `d3-geo@3.1.1`, `topojson-client@3.1.0`, `world-atlas@2.0.2`); `vite.config.js` (the `cruise-map` chunk for `d3-geo`, `topojson-client`, `world-atlas` and `cobe`)
- Create: `frontend/src/Pages/Common/cruise/map/geometry.js`, `frontend/src/Pages/Common/cruise/map/VoyageChart.jsx`, `frontend/src/Pages/Common/cruise/map/RouteThumb.jsx`
- Test: `tests/components/cruiseVoyageChart.test.jsx`

**Interfaces:**
- Produces:
  - `geometry.js`:
    - `chartFrame({ route, ports, width, height, padding }) -> { projection, path }`. It is a `geoMercator().fitExtent(...)` over the route (or the ports when there's no route).
    - `loadLand() -> Promise<GeoJSON>`, which runs `import('world-atlas/land-50m.json')` then `topojson.feature(...)` and is cached.
    - `nearestRouteIndex(route, port) -> number`.
  - `<VoyageChart route days activeDay onPickDay />`:
    - `days` are `[{ day, port: { name, country, lat, lon } | null, arrive, depart }]`.
    - It draws the land (dark teal), the route (a glowing sky line), a dot per distinct port (labelled), and the active port in `#F3C58F`.
    - A ship marker sits on the route at the active day's port. On sea days it sits midway between the previous and next ports.
    - Clicking a port calls `onPickDay(day)`.
    - The land loads lazily. Until it arrives, the route and ports draw on the night background.
  - `<RouteThumb route ports width height />`: a small SVG of the route and ports for the cards, with no land.

- [ ] **Step 1: Write the failing tests.** Mock `world-atlas/land-50m.json` with a tiny topology.
  - `draws a labelled dot per port and marks the active one`: days Miami / sea / Nassau / Miami, activeDay 3 → labels "Miami" and "Nassau", and one element with `data-active="true"` whose label is Nassau.
  - `crosses the 180° line without throwing`: route `[[-157.86,21.3],[179.5,30],[-179.5,31],[139.64,35.45]]`.
  - `draws ports alone when there is no route`: `route: null` gives no `[data-route]` path, but the port dots are there.
  - `picks a day from a port`: clicking Nassau's dot calls `onPickDay(3)`.
  - `RouteThumb draws one path`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Install the three packages exactly. Add the `cruise-map` chunk. Use `geoPath(projection)` for both land and route (d3 handles the antimeridian on the sphere). Animate the ship marker with a CSS `transform` transition; with reduced motion there's no transition.
- [ ] **Step 4: Run, expect PASS**, then `npm run build && node scripts/check-chunk-cycles.mjs`.
- [ ] **Step 5: Commit** `feat(cruise): night voyage chart and route thumbnails`

### Task 3: The globe

**Files:**
- Modify: `package.json` (exact `cobe@2.0.1`)
- Create: `frontend/src/Pages/Common/cruise/map/CruiseGlobe.jsx`, `public/images/cruise/globe-still.webp` (a still render of the globe in the brand teals, made with the mockup's CSS, about 600×600)
- Test: `tests/components/cruiseGlobe.test.jsx`

**Interfaces:**
- Produces: `<CruiseGlobe regions selectedKey onSelect />`.
  - `regions` are `[{ key, name, lat, lon, count }]`.
  - It turns slowly, and dragging turns it. Selecting a region (`selectedKey`) eases the globe to face it. Markers sit at the regions; the selected one uses the warm highlight.
  - A list of buttons, one per region (`name · count`), is always rendered below or beside the globe. It is the accessible control, and the only control without WebGL.
  - Without WebGL, with `prefers-reduced-motion`, or with Save-Data, it renders `<img src="/images/cruise/globe-still.webp" alt="">` instead of the canvas.

- [ ] **Step 1: Write the failing tests**
  - `lists every region as a button with its sailing count`.
  - `selects a region from its button`: `onSelect('alaska')`.
  - `shows the still globe without WebGL`: jsdom has no WebGL, so an `img[src="/images/cruise/globe-still.webp"]` is present and no canvas is created.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Use `import('cobe')` in an effect. Detect WebGL with `canvas.getContext('webgl')`. Colours: `baseColor [0.02,0.36,0.46]`, `markerColor [0.95,0.77,0.56]`, `glowColor [0.4,0.7,0.81]`. Pause rendering when the globe is off-screen (IntersectionObserver).
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(cruise): the globe - regions with sailings, still image when motion is off`

### Task 4: `/cruises`

**Files:**
- Create: `frontend/src/Pages/Common/cruise/CruisesPage.jsx`, `frontend/src/Pages/Common/cruise/cruisePages.css` (sky, stars, waves, fonts), `public/images/cruise/dusk-sea.webp` (from the mockup's Unsplash photo 1559827260, 1600px wide, about 150 KB; the Unsplash licence allows commercial use)
- Test: `tests/components/cruisesPage.test.jsx`

**Interfaces:**
- Consumes: Task 1 (`fetchSailings`, `fetchRegions`, `priceLabel`, `officeToday`), Task 2 (`RouteThumb`), Task 3 (`CruiseGlobe`).
- Page content:
  - **Hero:** sky, stars, the dusk-sea photo with two CSS wave layers, the globe as the moon, a kicker reading "CRUISES · BOOKED BY OUR TEAM, PAID ON JETSETTERS", the headline "Pick a sea. We'll *plot* the voyage.", the lede from the mockup, and region chips.
  - **Selected region:** in `?region=<key>`. It defaults to the region with the most sailings. "All regions" is the first chip.
  - **Cards:** route thumbnail, title, `<nights> nights · <round trip|one way> <home port> · <n> ports`, next date as `Next sailing 5 Dec 2026`, and the price label. Each card links to `/cruise/<slug>`. "Round trip" means the first port equals the last.
  - **Empty state** (no published sailings, or none in the region): "Our cruise team is adding sailings. Call (877) 538-7380 or email support@jetsetterss.com and we'll find yours."
  - **Head:** `<Helmet>` sets the title "Cruises | Jetsetters", a description, a canonical `/cruises`, and the fonts link.

- [ ] **Step 1: Write the failing tests** (stub `fetch`)
  - `shows a card per published sailing, linked to its page`.
  - `filters by the region chip`.
  - `shows "Ask for today's price" for an old price`.
  - `shows the contact empty state when nothing is published`.
  - `says round trip when it starts and ends in the same port`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Follow the mockup's screen 1 for layout and colours; layout and type are the builder's call within it. Lazy-load the globe after first paint.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(cruise): /cruises - dusk ocean, globe of regions, sailing cards`

### Task 5: `/cruise/:slug`

**Files:**
- Create: `frontend/src/Pages/Common/cruise/CruiseSailingPage.jsx`
- Test: `tests/components/cruiseSailingPage.test.jsx`

**Interfaces:**
- Consumes: Task 1 and Task 2.
- Page content:
  - **Header:** a kicker (`<REGION> · <N> NIGHTS · <ROUND TRIP FROM X | FROM X TO Y>`) and the headline (falling back to the title).
  - **Chart:** the active day's port card sits over the chart.
  - **Timeline:** one `<li>` per day, with day number, port name (or "At sea"), and times as "Arrive 8:00 AM" / "Depart 5:00 PM" (12-hour, from `HH:MM`).
    - An IntersectionObserver on the timeline items sets the active day as the reader scrolls.
    - Clicking a day sets it too, and so does clicking a port on the chart.
  - **Sticky price box:** the price label and two actions, **Call (877) 538-7380** and **Email us about this cruise**.
  - **Below the chart:** sailing dates (`shortDate`), ship and line, "What's included" (if any), and photos with their credits as `<figcaption>`.
  - **Phones:** the chart above, then the timeline as horizontally scrollable day chips, with the price and actions pinned to the bottom.
  - **Unknown or unpublished slug:** "This cruise isn't available" with a link to `/cruises`, plus `<meta name="robots" content="noindex">`.
  - **Head:**
    - the title `<title> | <N>-night cruise | Jetsetters`;
    - a description built from the ports ("7 nights from Miami calling at Roatán, Costa Maya and Cozumel.");
    - a canonical `/cruise/<slug>`;
    - JSON-LD `@type: Trip` with `itinerary` as an `ItemList` of `Place` names, and `offers` only when the price is shown (not stale).

- [ ] **Step 1: Write the failing tests** (stub `fetch`)
  - `lists every day as text with 12-hour times`: "Arrive 8:00 AM", "Depart 5:00 PM", and "At sea".
  - `calls and emails about this cruise`: tel and mailto with the title.
  - `says the cruise isn't available for an unknown slug` (fetch 404), plus noindex.
  - `leaves offers out of the structured data when the price is old`.
  - `lists the sailing dates and photo credits`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**, following the mockup's screens 2 and 3.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(cruise): /cruise/:slug - night chart, day timeline, sticky price and contact`

### Task 6: Routes, redirects, sitemap, old pages out, app endpoint from the database

**Files:**
- Modify:
  - `frontend/src/app.jsx`:
    - `/cruises` renders `CruisesPage` and `/cruise/:slug` renders `CruiseSailingPage`, both lazy with the repo's `.catch` fallback;
    - `/cruise` and `/itinerary` become `<Navigate to="/cruises" replace />`;
    - the old cruise imports go.
  - `frontend/src/utils/routePrefetch.js` (drop the old entries).
  - `shared/spaRoutes.js`:
    - `LEGACY_REDIRECTS` gets `['/cruise', '/cruises']` and `['/itinerary', '/cruises']`;
    - the SPA list replaces `/cruise` with the `/cruise/:slug` pattern.
  - `vercel.json`:
    - permanent redirects `/cruise` → `/cruises` and `/itinerary` → `/cruises`;
    - `/cruise/:slug` rewrites to `spa-shell.html`;
    - `/sitemap-cruise-sailings.xml` rewrites to `/api/cruise-catalog/sitemap.xml`.
  - `frontend/src/seo/routeSeo.js`: remove `'/cruise'`, and move its FAQ JSON-LD onto `'/cruises'`.
  - `scripts/generate-route-seo-pages.js`: add `sitemap-cruise-sailings.xml` to the sitemap index, and drop `/cruise` from the crawl nav.
  - `backend/controllers/cruiseCatalog.controller.js` and `backend/routes/cruiseCatalog.routes.js`: add a public `GET /sitemap.xml`, the published sailings with `<lastmod>` = `updated_at`.
  - `backend/routes/cruise.routes.js`:
    - `GET /`, `/search` and `/details/:id` read published sailings through a new `backend/services/cruiseCatalog/appFeed.js`. It returns `{ id: slug, name: title, cruise_line, ship, duration: nights, departure_port, destinations: port names, image: first photo url, departure_date: next date }`, with no price fields;
    - delete `POST /bookings`.
- Delete:
  - `frontend/src/Pages/Common/cruise/Homepage.jsx`, `cruise-cards.jsx`, `Itinerary.jsx`, and every section only they use: HeroSection(.css), DestinationSection(.css), CruiseLineSection(.css), CruiseFeatureBanner, CruiseFAQ, WhyChooseUsSection, ContactSection, PartnerSection.css, newsletter-styles.css, adData.js, `data/`;
  - `backend/data/cruiselines.data.js` and the cruise part of `backend/data/catalog.js`;
  - the POST `/bookings` cruise save, with its test `tests/backend/cruiseHotelSaveCannotTakeBooking.test.js` cruise cases (keep the hotel ones);
  - the PaymentCallback cruise branch.
- Tests:
  - Update: `tests/components/cruiseTakedown.test.js` (now asserts the redirects and the new pages), `tests/components/cruiseNoInventedClaims.test.js` (same patterns, new files), `tests/backend/generateRouteSeoPages.test.js` (26 indexable routes, the /cruises page carries the FAQ JSON-LD, the sitemap index lists the sailing sitemap), `tests/backend/spaRoutes.test.js`, and `tests/components/flightLanding.test.js` (slice the home section up to the next route key).
  - Remove: `tests/components/cruiseSectionsRender.test.jsx`, `tests/backend/cruiseCatalogNoInventedFields.test.js`, `tests/backend/cruiseSearchNoPriceFilter.test.js`.
  - New: `tests/backend/cruiseAppFeed.test.js` (the shape, published only, no price fields) and `tests/backend/cruiseSitemap.test.js` (lists published slugs only, valid XML).

- [ ] **Step 1: Write and update the tests listed.** Run them and watch the new and updated ones fail.
- [ ] **Step 2: Implement and delete.** Search for every import of a deleted file (`grep -rn` across frontend, backend, shared, scripts and tests) until there are none.
- [ ] **Step 3: Run the full suite CI-style, `npm run build`, and `node scripts/check-chunk-cycles.mjs`.** All pass.
- [ ] **Step 4: Commit** `feat(cruise): new pages live at /cruises and /cruise/:slug - old pages and static data removed, app feed and sitemap from the catalog`

### Task 7: Release

- [ ] **Step 1: Final whole-branch review**, then the fix pass.
- [ ] **Step 2: Push, open the PR, and wait for CI in the background.**
- [ ] **Step 3: Merge when the owner says "merge"**, then run `bash scripts/deploy-frontend.sh origin/main`. The Lightsail API is untouched; `/api/cruises` and `/api/cruise-catalog` are on Vercel.
- [ ] **Step 4: Browser check.**
  1. Publish a test sailing ("ZZ Test sailing (delete me)") with a photo, 3 ports and a date.
  2. Check `/cruises`: the card is there, the region chip filters and the globe renders.
  3. Open the sailing page: the chart draws, scrolling moves the active day, and Call/Email are correct.
  4. Check the phone width (390px) and the console. Check that `/cruise` and `/itinerary?x` redirect, that `/sitemap-cruise-sailings.xml` lists it, and that `/api/cruises` returns it.
  5. Delete the test rows and the photo.
  6. Load `/` and `/flights` and check the console.
