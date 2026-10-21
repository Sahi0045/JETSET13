# Cruise section: design

Status: approved in chat by the owner on 2026-10-21 ("ok start building"). The look is the "B and C combined" mockup (dusk ocean, globe as the moon, night chart). This file writes down everything agreed in that conversation.

Three questions were put to the owner and not answered before "start building". These defaults hold until the owner says otherwise:
1. **The unsafe live parts come down first**, in their own small release, before the new section: the cruise checkout, and the invented ratings, testimonials and traveller count. The new section goes live once staff have published at least 10 sailings.
2. **The staff tools go in the admin panel** (admin and superadmin accounts). The `support` role in `/desk` gets no cruise price or quote powers.
3. **`Navbar.jsx` is not edited.** It holds the owner's uncommitted changes. `/request` becomes a redirect to `/cruises`, so the two Navbar links keep working, until the owner allows the link removal.

## Why

Jetsetters has no cruise booking API. Staff already have agent logins on most cruise lines' booking portals and book cruises there by hand. The website should:
- show real sailings beautifully;
- let a customer ask about one;
- let staff quote the exact price;
- take payment through our own ARC Pay;
- deliver the cruise line's confirmation and documents back to the customer.

A cruise API is coming later. Until then the sailing list is entered by hand, and the pages must not need redesigning when the API replaces the manual list.

What is live today is unsafe, and this project replaces it:
- The cruise pages run on hand-typed JSON.
- Prices start at "From $69" and sailing dates are in January 2025, already past.
- Ratings, three named testimonials and "25,000+ Happy Travelers" are invented.
- The **Book** button takes real card payment through ARC Pay (`CruiseBookingSummary.jsx`) for a cruise nobody books with the cruise line.

## Decisions (from the owner)

| Topic | Decision |
|---|---|
| Booking model | Manual. Staff book in the cruise line's agent portal. The cruise API replaces manual entry later. |
| Data | **No scraping.** Sailings are entered by staff in the admin panel, using the agent portals. (The research behind this: the lines' terms of use forbid scraping and reuse, their sites sit behind bot protection, and photos are copyrighted.) |
| Payment | The customer pays **through our website with ARC Pay**, and only **after staff confirm the exact price**. They never pay from the sailing page. |
| Where the customer pays | **My Trips → Cruise** shows the quote with a **Pay** button. |
| After payment | Staff book in the cruise line's portal, then send the confirmation and documents **by email and in My Trips → Cruise**. |
| Stages the customer sees | Request sent → Quote ready → Paid → Booked → Documents ready. |
| General requests | The general "Submit a request" page and the **My Requests** panel in My Trips are **removed completely**, code included. The request flow stays **for cruise only**. |
| Look | The "B and C combined" mockup. Details under "The pages". |

## Goals

- Cruise pages that look art-directed and nothing like a generic template.
- Every price, date, port and time shown is real and entered by staff, with the date it was checked.
- One path from interest to booked cabin: ask → quote → pay → booked → documents. The customer can follow every step in My Trips.
- Staff can run the whole flow from the admin panel, with no developer involved.
- The data layer is shaped so the cruise API can fill the same pages later.

## Non-goals

- Live prices or live availability (that comes with the API).
- Online booking without staff.
- A redesign of the Android app's cruise screens. The app keeps working against the same endpoint; see "Mobile app".
- Cruise cancellation and refund automation. Staff handle cancellations by hand under the line's penalty schedule.

## Anti-goals (a failure even if it works)

- Any invented number or person: ratings, review counts, testimonials, traveller counts, "only 3 cabins left".
- Taking money for a price staff have not confirmed.
- Purple or indigo gradients, glassy card grids, three-icon-box sections, emoji icons, generic stock-photo heroes.
- A page that is slow or drains batteries on a mid-range phone.
- Copy-pasted cruise line text or photos the line hasn't allowed agents to use.

## Customer journey

1. **Cruises page `/cruises`.** The customer turns the globe or picks a region and sees sailing cards for that region.
2. **Sailing page `/cruise/:slug`.** They read the voyage day by day on the night chart and tap **Ask about this sailing**.
3. **Inquiry form.** It is already filled in with the sailing; the steps are under "Inquiry form". Sending needs an account. If they aren't signed in, they sign in or create an account inside the form flow and don't lose what they typed.
4. **My Trips → Cruise** shows the request as *Request sent*.
5. **Staff** check the live price and cabin in the line's portal. They create a **quote** in the admin panel: exact all-in total in USD, cabin category, sailing date, what's included, and **valid until**.
6. The customer is emailed. **My Trips → Cruise** shows *Quote ready* with the total, the expiry and a **Pay** button.
7. **Pay.** The customer gives each traveller's details as on their passport (the existing quote booking form), then pays through ARC Pay hosted checkout (the existing quote payment).
8. The customer sees *Paid*. The email says **"payment received, we're booking your cabin"**, not "booking confirmed". Staff are alerted.
9. **Staff** book in the cruise line's portal. In the admin panel they enter the line's **confirmation number** and **upload the documents** (PDF confirmation; e-documents later, nearer sailing).
10. The customer is emailed. **My Trips → Cruise** shows *Booked*, then *Documents ready*, with the confirmation number and the documents to download.

If the quote expires before payment, its Pay button disappears and the trip shows *Quote expired*. Staff can send a new quote. If staff cannot book after payment (cabin gone, price changed), they offer another cabin or refund in full; that refund is by hand through the existing admin refund tools.

## The pages

The approved mockup is the reference: `docs/superpowers/specs/assets/2026-10-21-cruise-mockup.html` (open it in a browser).

**Palette and type.** Brand palette only: teal `#055B75`, dark `#034457`, accent `#0890BC`, sky `#65B3CF`, light `#F1FBFD`. Night tones are darker shades of the teals. One warm highlight (`#F3C58F`) marks the selected port, the selected region and the sunset line. Type: Fraunces (display serif), Manrope (body), IBM Plex Mono (times, days, small labels).

### Cruises page `/cruises`
- **Hero.**
  - Night sky with faint stars over a dusk horizon. The sea in the lower third is a real photo with two slow CSS wave layers over it.
  - On the right, a **3D globe** sits like a moon, turning slowly, with a glowing pin for each region that has published sailings. Dragging it turns it.
  - Headline "Pick a sea. We'll plot the voyage." and region chips.
  - Picking a pin or a chip selects a region.
- **Sailing cards** for the selected region:
  - a small glowing route thumbnail;
  - title, nights, round-trip or one-way and home port, number of ports;
  - "From $X" with "checked <date>".
- The region list comes from published sailings; empty regions are not shown.

### Sailing page `/cruise/:slug`
- **Background.** A sunset band at the top fades into night as you scroll.
- **Header.** Kicker (region · nights · route) and a headline in plain, specific words. Staff write the headline; it falls back to the title.
- **Night chart.**
  - Coastlines in dark teal, a glowing route along real sea lanes, and port dots. The port of the current day glows in the warm highlight.
  - A ship dot moves along the route.
  - A day card shows the port, country, arrival and departure.
- **Day timeline** on the right: Day 1…N with port and hours, and sea days. Scrolling (or tapping a day) moves the ship and the camera to that day's leg.
- **Price box**, sticky beside the timeline:
  - "From $X per person, port fees included, price checked <date>".
  - If the price is older than 30 days, show "Ask for today's price" instead. *(my call)*
  - The **Ask about this sailing** button.
- **Below the chart:**
  - sailing dates offered;
  - ship and cruise line;
  - what's included, if staff entered it;
  - photos, with credits.

### Phones
- Same content, stacked: dusk header with a small globe, the chart, swipeable day chips, port detail.
- Price and **Ask about this sailing** are pinned to the bottom.
- No live 3D ocean anywhere. The ocean is a photo with CSS motion.

### Motion and fallbacks
- The first paint is the HTML and a still image. The globe and chart load after it, and never block it.
- `prefers-reduced-motion`, Save-Data, and phones that can't keep the frame rate get still images and a static chart with the same information.

### Search engines
- Every sailing has its own path URL and title. Its day-by-day text (ports, times) is in the HTML, not only drawn on the chart.
- Published sailings are added to the sitemap.
- Old URLs redirect: `/cruise` → `/cruises`, `/itinerary?…` → `/cruises`.

## Inquiry form

It opens over the page, already filled in with the sailing. There are four short steps:
1. Sailing date (from the offered dates, or "flexible") and how flexible.
2. Adults, children and their ages; any accessibility needs.
3. Cabin type (inside / ocean view / balcony / suite), a fallback cabin type, and a budget band.
4. Phone, preferred callback time, and call or email.

Name and email come from the account. It is saved as an inquiry of type `cruise`, linked to the sailing. Staff see it in the admin panel's existing Inquiries list.

## My Trips → Cruise

- The existing "Cruise" category in My Trips shows cruise requests and bookings as cards, with the stage line (*Request sent → Quote ready → Paid → Booked → Documents ready*).
- A quote card shows the total, cabin, sailing date, expiry and **Pay**.
- A booked card shows the line's confirmation number and the documents to download.
- **My Requests** is removed. Cruise is the only place requests appear.

## Admin panel

- **Cruise catalog** (new). Staff create and edit:
  - cruise lines and ships;
  - ports (name, country, latitude, longitude; a starter list of common cruise ports is seeded);
  - sailings: title, headline, region, line, ship, nights, the day-by-day list (day, port or "at sea", arrive, depart), offered sailing dates, "from" price, photos with a credit line each, and a draft/published switch.
  - The **"from" price must be all-in**: fare plus port fees, taxes and every mandatory fee. California's SB 478 requires advertised prices to include mandatory fees. The form says so next to the field.
  - Saving a price stamps "checked" with today's date.
  - The sea route between ports is computed on the server when the sailing is saved, and stored with it. The page never computes routes.
- **Inquiries** (existing). Cruise inquiries show the sailing, the date choice, guests, cabin, budget and callback preference.
- **Quotes** (existing). Creating a cruise quote takes the exact total, cabin category, sailing date, inclusions and valid-until. The valid-until default is 48 hours *(my call)*; staff can change it.
- **Cruise booking** (new, on the paid quote or inquiry). Staff enter the line's confirmation number and upload PDFs. Saving emails the customer and updates My Trips.
- **Staff alert on payment.** Staff learn within minutes that a cruise quote was paid, and the inquiry shows *Paid, book now* at the top of the list.

## Data

- **Tables:** new tables for lines, ships, ports, sailings, sailing days and sailing dates.
- **Inquiry link:** the inquiry ↔ sailing link and the cruise booking record (confirmation number, document files) are attached to the existing inquiry/quote records or a booking row of travel type `cruise`. The builder decides which.
- **Documents:** stored in Supabase Storage in a private bucket. The customer downloads them through a signed link after sign-in.
- **Security:** RLS on every new table with no public policies, matching the other recent migrations. The backend uses the service-role key. Public sailing reads go through backend endpoints that return only published sailings.
- **Migration:** a new migration, applied **only with the owner's OK**.
- **API later:** the page components read sailings through one backend module. The cruise API will plug in there.

## Removals (deleted, not hidden)

**Frontend:**
- `Pages/Request/RequestPage.jsx` and the `/request` route.
- Links to `/request` in `ContactUs.jsx`, `Footer.jsx`, `cruise/WhyChooseUsSection.jsx`, the My Trips empty state, and `Navbar.jsx` (desktop and mobile).
- The **My Requests** panel in `login/mytrips.jsx`, and the request-loading code that only it used.
- The old cruise pages and data:
  - `cruise/Homepage.jsx`, `cruise-cards.jsx`, `Itinerary.jsx`, `CruiseBookingSummary.jsx`, `CruiseBookingSuccess.jsx`;
  - the sections only they use;
  - `cruise/data/*.json`;
  - their routes.
- The invented ratings, testimonials and traveller counts go with them.

**Backend:**
- The cruise checkout save (`POST /cruise/bookings`).
- The static cruise catalog (`backend/data/catalog.js` cruise part, `cruiselines.data.js`), replaced by database-backed endpoints.

**Inquiry types:** customers can no longer create flight, hotel, package or visa inquiries. Existing rows stay readable in the admin panel.

## Rows already in the database (checked 2026-10-21)

- **Cruise bookings from the old checkout: 5 in total. None is paid and waiting.**
  - 3 from 26 Jun 2026 were cancelled with partial refunds.
  - 2 (14 Jul and 23 Sep) are pending and unpaid.
  - They stay in the database, and My Trips doesn't show the unpaid ones as active trips. *(my call)*
- **Quotes: 1 in total.** It's an unpaid hotel quote sent on 2 Jul 2026. Staff contact that customer directly; nothing is migrated. *(my call)*
- **Inquiries: 1 in total**, the hotel inquiry behind that quote. It stays readable in the admin panel.

## Mobile app

The Android app reads the static catalog through the backend (`/cruises`). Keep that endpoint working and return published sailings in a shape the app can show. A proper app cruise screen is a later project. The app is not on Play at the moment.

## Constraints

- Brand palette only; never `#0066FF`, `#1e40af`, `#1976D2`, `#0EA5E9`.
- No paid map service or map API key. Coastlines from public-domain data (Natural Earth). *(my call)*
- Photos only from the lines' agent photo libraries or our own, with a credit on each.
- Web is React 18.3; no React upgrade in this project.
- Heavy libraries go in their own build chunk, not `vendor-misc`. The cruise pages are lazy-loaded like every other route.
- Every web deploy is checked in a browser: `/`, `/cruises`, one sailing page, and the console.

## Left to the builder

- Libraries for the globe, the chart and route computing (the research suggested `cobe` for the globe and `searoute-ts` server-side for routes).
- Exact table and column names, and whether the cruise booking lives on the inquiry/quote or a `bookings` row.
- Copy, beyond the rules above.
- How the staff payment alert is sent.
- The starter port list.

## My calls (for the owner to check)

1. A price older than 30 days shows "Ask for today's price" instead of the number.
2. Quotes are valid for 48 hours by default.
3. Coastlines from Natural Earth, with no paid map service.
4. The mockup's fonts: Fraunces, Manrope, IBM Plex Mono.
5. Sending an inquiry needs an account, created inside the form if needed.
6. Old `/cruise` and `/itinerary` links redirect to `/cruises`.
7. **Several quotes per request.** Staff may quote, say, a balcony and an ocean view side by side. Paying one withdraws the others, and the server refuses a second payment on the same request.
   - If staff can't book after payment and the replacement cabin costs more, they send a new quote for the difference.
   - If it costs less, they refund the difference with the existing admin refund tools.
8. **New customers who haven't verified their email.** The request is saved on the server at once, but held. It reaches staff and My Trips when the email is verified, from any device. Google sign-in comes back to the form with the request kept.
