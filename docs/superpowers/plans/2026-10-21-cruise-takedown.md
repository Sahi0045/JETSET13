# Cruise takedown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop taking card payments for cruises nobody books, and remove every invented rating, review, testimonial, traveller count, price and offer from the live cruise pages. This is the first, small release before the new cruise section.

**Architecture:**
- The server refuses any new cruise hosted checkout, which covers the web and the Android app.
- The web cruise checkout pages are deleted. The itinerary's Book buttons become Call and Email actions.
- The invented content is deleted from the components, the JSON data, the backend catalog copy and the `/cruise` structured data.
- Source-reading Vitest tests pin each removal.

**Tech Stack:** React 18 + Vite, Express, Vitest (projects `frontend` / `backend`).

**Spec:** `docs/superpowers/specs/2026-10-21-cruise-section-design.md` (Status block, default 1: "The unsafe live parts come down first").

## Global Constraints

- Contact for cruise customers: phone **(877) 538-7380** (`tel:+18775387380`), email **support@jetsetterss.com**.
- Never stage `CLAUDE.md` or `frontend/src/Pages/Common/Navbar.jsx`; both hold the owner's uncommitted changes.
- Work on branch `fix/cruise-takedown`. Merge only when the owner says "merge".
- Brand palette only: teal `#055B75`, dark `#034457`, accent `#0890BC`, sky `#65B3CF`, light `#F1FBFD`. Never `#0066FF`, `#1e40af`, `#1976D2`, `#0EA5E9`.
- Run tests the way CI does, with blank env: `VITE_SUPABASE_URL= AMADEUS_WS_ENDPOINT= npx vitest run …`.
- Keep `POST /api/cruises/bookings`. A checkout page opened in the 15 minutes before the deploy must still be able to confirm. It is removed in the cruise-section plan.

## Review Focus

1. **A cruise page opened before the deploy and paid after it.** It must land on My Trips, not a removed route. Pinned in Task 2 (`PaymentCallback` maps cruise to `/my-trips`).
2. **Old bookmarks to `/cruise-booking-summary` or `/cruise-booking-success`.** They must redirect to `/cruises`, not render blank. Pinned in Task 2.
3. **The Android app starting a cruise checkout.** It must get a refusal with a message it can show that includes the phone number. Pinned in Task 1.
4. **Sections whose data fields were removed.** They must render no "undefined", "NaN" or empty "$". Pinned in Task 3 (render test of `DestinationSection` and `CruiseLineSection`).
5. **`GET /api/cruises`, used by the app and the pages.** It must still answer, with no price, rating or review fields. Pinned in Task 3.

---

### Task 1: The server refuses new cruise payments

**Files:**
- Modify: `backend/routes/payment/checkout.handlers.js:572-579` (just after the `HOSTED_CHECKOUT_TYPES` check)
- Test: `tests/backend/checkoutGuards.test.js:85-94`

**Interfaces:**
- Produces: hosted checkout answers `410 { success:false, code:'CRUISE_BOOKED_BY_TEAM', error }` for `bookingType === 'cruise'`, before any row lookup, row write or ARC call.

- [ ] **Step 1: Change the tests**

In `'still opens a page for the products the site sells'`, change the list to `['hotel', 'package']`. Add:

```js
it('refuses a cruise: our team books cruises, so no page and no row', async () => {
  db = fakeBookingsTable([]);
  axios.post.mockClear();
  const res = await checkout({ amount: '291.00', orderId: 'ORDcruise1', bookingType: 'cruise', customerEmail: 'x@example.com' });

  expect(res.statusCode).toBe(410);
  expect(res.body).toMatchObject({ success: false, code: 'CRUISE_BOOKED_BY_TEAM' });
  expect(res.body.error).toContain('(877) 538-7380');
  expect(res.body.error).toContain('support@jetsetterss.com');
  expect(res.body.error).toContain('Nothing has been charged');
  expect(openedSession()).toBe(false);
  expect(db.table).toEqual([]);
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `VITE_SUPABASE_URL= AMADEUS_WS_ENDPOINT= npx vitest run tests/backend/checkoutGuards.test.js`
Expected: the new test FAILS (status 200, page opened).

- [ ] **Step 3: Add the refusal**

Put it right after the unknown-type check. The message, exactly:

`Cruises are booked by our team. Call (877) 538-7380 or email support@jetsetterss.com and we will quote your sailing. Nothing has been charged.`

Log one `console.warn('⛔ Checkout refused: cruise', { orderId })`.

- [ ] **Step 4: Run, expect PASS**

Same command. Expected: all tests in the file pass.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/payment/checkout.handlers.js tests/backend/checkoutGuards.test.js
git commit -m "fix(cruise): the server refuses new cruise payments - our team books cruises"
```

### Task 2: No cruise checkout on the web

**Files:**
- Delete: `frontend/src/Pages/Common/cruise/CruiseBookingSummary.jsx`, `frontend/src/Pages/Common/cruise/CruiseBookingSuccess.jsx`
- Modify: `frontend/src/app.jsx` (lazy imports near :327 and :337; routes :723-724)
- Modify: `frontend/src/Pages/Common/PaymentCallback.jsx:267` (`cruise: '/cruise-booking-success'`)
- Modify: `frontend/src/Pages/Common/cruise/Itinerary.jsx:189` (`bookingUrl`), `:267` (Book now), `:389` (Continue to book)
- Test: `tests/components/cruiseTakedown.test.js` (new)

**Interfaces:**
- Produces: `/cruise-booking-summary` and `/cruise-booking-success` are `<Navigate to="/cruises" replace />` routes. The itinerary has no booking URL.

- [ ] **Step 1: Write the failing test** (source reading, in the style of `tests/components/companyPage.test.js`)

```js
describe('the cruise checkout is gone from the web', () => {
  it('has no checkout pages', () => {
    expect(existsSync(root('frontend/src/Pages/Common/cruise/CruiseBookingSummary.jsx'))).toBe(false);
    expect(existsSync(root('frontend/src/Pages/Common/cruise/CruiseBookingSuccess.jsx'))).toBe(false);
  });
  it('sends old checkout links to the cruise list', () => {
    const app = read('frontend/src/app.jsx');
    expect(app).not.toMatch(/CruiseBookingSummary|CruiseBookingSuccess/);
    expect(app).toMatch(/<Route path="\/cruise-booking-summary" element={<Navigate to="\/cruises" replace \/>} \/>/);
    expect(app).toMatch(/<Route path="\/cruise-booking-success" element={<Navigate to="\/cruises" replace \/>} \/>/);
  });
  it('lands a cruise paid on an older page in My Trips', () => {
    expect(read('frontend/src/Pages/Common/PaymentCallback.jsx')).toMatch(/cruise: '\/my-trips'/);
  });
  it('asks the customer to call or email instead of booking', () => {
    const itinerary = read('frontend/src/Pages/Common/cruise/Itinerary.jsx');
    expect(itinerary).not.toMatch(/cruise-booking-summary|bookingUrl/);
    expect(itinerary).toContain('tel:+18775387380');
    expect(itinerary).toContain('mailto:support@jetsetterss.com');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `VITE_SUPABASE_URL= npx vitest run tests/components/cruiseTakedown.test.js`
Expected: 4 failures.

- [ ] **Step 3: Make the changes**
  - Delete the two files, their lazy imports and their routes. Add the two `Navigate` routes.
  - In `PaymentCallback.jsx`, map cruise to `/my-trips`.
  - In `Itinerary.jsx`, replace both booking buttons with two actions in the existing button styles:
    - "Call (877) 538-7380" → `tel:+18775387380`
    - "Email us about this cruise" → `mailto:support@jetsetterss.com?subject=${encodeURIComponent(`Cruise inquiry: ${view.name}`)}`
  - Remove `bookingUrl`.

- [ ] **Step 4: Run, expect PASS**

Run the test, then build once: `npm run build`. Expected: PASS, and the build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src/Pages/Common/cruise frontend/src/app.jsx frontend/src/Pages/Common/PaymentCallback.jsx tests/components/cruiseTakedown.test.js
git commit -m "fix(cruise): no cruise checkout on the web - call or email our team instead"
```

### Task 3: No invented claims on the cruise pages

**Files:**
- Modify:
  - `frontend/src/Pages/Common/cruise/HeroSection.jsx:436-442`: remove the stat row (rating, traveller count, price guarantee).
  - `frontend/src/Pages/Common/cruise/Homepage.jsx`: delete `TestimonialBanner` (:88-479, including its contact form that only `console.log`s but claims success); delete `PromoSection` (:509-512 area); delete the voucher popup (:635-710) and the "$50 OFF" banner (:912); delete their render sites (:924-958).
  - `frontend/src/Pages/Common/cruise/DestinationSection.jsx:70-76`: remove the rating and "Starting from" price.
  - `frontend/src/Pages/Common/cruise/CruiseLineSection.jsx:59-67`: remove the "5.0" and "Starting from".
  - `frontend/src/Pages/Common/cruise/cruise-cards.jsx`:
    - remove `CABIN_TYPES` (:18-23) and the rate table (:404-411);
    - remove the "From" price (:417-419) and "Buy One Get One Offer" (:429);
    - the card says "Ask for today's price".
  - `frontend/src/Pages/Common/cruise/Itinerary.jsx`:
    - remove rating and review count (:184-185, :237-238), "Verified cruise partner" (:233), the "Verified traveler" quote (:353-362), "Authorized cruise seller" (:393);
    - the price shows "Ask for today's price".
  - `frontend/src/Pages/Common/cruise/data/cruiselines.json` and `destinations.json`: drop the `price`, `priceValue`, `rating` and `reviews` keys.
  - `backend/data/cruiselines.data.js`: drop the same keys. Check `backend/data/catalog.js:44-45` passes none of them.
  - `frontend/src/seo/routeSeo.js:96-114`: remove the `Product` object (AggregateOffer, `aggregateRating` 4.8 / 1850) from the `/cruise` JSON-LD and keep the FAQ object, so the page still has one ld+json script.
- Delete: `frontend/src/Pages/Common/cruise/data/itineraries.json` (nothing imports it).
- Test:
  - `tests/components/cruiseNoInventedClaims.test.js` (new)
  - `tests/components/cruiseSectionsRender.test.jsx` (new)
  - `tests/backend/cruiseCatalogNoInventedFields.test.js` (new)

**Interfaces:**
- Consumes: nothing from Tasks 1–2.
- Produces: every cruise-line and destination object, front and back, has no `price`, `priceValue`, `rating` or `reviews` key.

- [ ] **Step 1: Write the failing tests**

`tests/components/cruiseNoInventedClaims.test.js` reads every `.js`, `.jsx` and `.json` file under `frontend/src/Pages/Common/cruise/` (recursively), plus `backend/data/cruiselines.data.js`, and checks:

```js
it.each([
  ['traveller counts', /25,000\+|Happy Travelers/i],
  ['star ratings', /\d(\.\d)?\/5\b|Guest Rating|from over [\d,]+ reviews/i],
  ['rating and review fields', /"rating"\s*:|"reviews"\s*:|\brating:\s*[\d.]|\breviews:\s*\d/],
  ['invented people', /Sarah Johnson|Michael Chen|Emily Rodriguez|James Wilson/],
  ['endorsement badges', /Verified (traveler|cruise partner|customers)|Authorized (cruise|Worldwide) seller/i],
  ['made-up prices', /From \$\d|Starting from|priceValue|"price"\s*:\s*"|CABIN_TYPES/],
  ['made-up offers', /Buy One Get One|\$50 OFF|Kids sail free|up to 30% off|Best Price Guarantee/i],
  ['past sailing dates', /\b2025\b/],
])('no %s', (_, claim) => { for (const [file, text] of sources) expect(text, file).not.toMatch(claim); });
```

Also add: `routeSeo.js` from `'/cruise': {` to `'/cruises': {` contains neither `aggregateRating` nor `AggregateOffer`.

`tests/components/cruiseSectionsRender.test.jsx` renders `DestinationSection` and `CruiseLineSection` inside `MemoryRouter`, with their real data. It expects `container.textContent` not to match `/undefined|NaN|\$\s*(?!\d)/`.

`tests/backend/cruiseCatalogNoInventedFields.test.js` imports `cruises` from `backend/data/catalog.js` and expects every item to have none of the keys `price`, `priceValue`, `rating`, `reviews`.

- [ ] **Step 2: Run, expect FAIL**

Run: `VITE_SUPABASE_URL= AMADEUS_WS_ENDPOINT= npx vitest run tests/components/cruiseNoInventedClaims.test.js tests/components/cruiseSectionsRender.test.jsx tests/backend/cruiseCatalogNoInventedFields.test.js`
Expected: failures on every pattern that is present today. The render test may pass already; it guards the removal.

- [ ] **Step 3: Remove the content as listed under Files**

Where a removed price leaves an empty spot, show "Ask for today's price". Where a removed section leaves a gap, close it up; don't add new content.

- [ ] **Step 4: Run, expect PASS**

Run the three tests, plus `tests/backend/generateRouteSeoPages.test.js`, `tests/components/flightLanding.test.js` and `tests/backend/publicDataExposure.test.js`.
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src/Pages/Common/cruise backend/data frontend/src/seo/routeSeo.js tests/components/cruiseNoInventedClaims.test.js tests/components/cruiseSectionsRender.test.jsx tests/backend/cruiseCatalogNoInventedFields.test.js
git commit -m "fix(cruise): no invented ratings, reviews, testimonials, prices or offers on the cruise pages"
```

### Task 4: Release

- [ ] **Step 1: Run the full suite CI-style.**
  Run: `VITE_SUPABASE_URL= AMADEUS_WS_ENDPOINT= npm test`
  Expected: the same pass/fail count as `main`, plus the new tests passing.
- [ ] **Step 2: Open the PR.** Push `fix/cruise-takedown` and open a PR (body via `gh api`, since `gh pr edit` is broken). Wait for CI in the background (`gh run watch <id> --exit-status`, `run_in_background`).
- [ ] **Step 3: Merge only when the owner says "merge".** Use `gh api -X PUT repos/Sahi0045/JETSET13/pulls/<n>/merge -f merge_method=squash -f sha=<head>`.
- [ ] **Step 4: Deploy.** Run `bash scripts/deploy-frontend.sh origin/main`. This deploys the SPA and the Vercel API, where `/api/payments` lives.
- [ ] **Step 5: Check it in a browser.**
  - Load `/`, `/cruise`, `/cruises` and one `/itinerary?…`, and read the console. Expected: no errors, no invented figures, and Call/Email in place of Book.
  - `curl -s -X POST https://www.jetsetterss.com/api/payments?action=hosted-checkout -H 'Content-Type: application/json' -d '{"amount":"1.00","orderId":"ORDcruise1","bookingType":"cruise","customerEmail":"x@example.com"}'`
    Expected: `410` with `CRUISE_BOOKED_BY_TEAM`.
