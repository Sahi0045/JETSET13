# Flights landing page redesign

**Date:** 2026-09-19
**Surface:** `frontend/src/Pages/Common/flights/flightlanding.jsx` and the two components it renders
**Approved from:** the clickable mockup at https://claude.ai/artifact/XK82wyQ4fPRXG1DK5xqu7E (v19)

## The rule that governs this work

**Visual only. No behaviour changes.** Same components, same props, same handlers, same
requests, same routes. Anything that searches, fetches, navigates or books is left alone; only
markup and classes change. If a change cannot be made without touching behaviour, it is out of
scope and gets raised instead.

## Out of scope

- **The navbar and the logo.** The header is a shared component (`Common/Navbar`) and stays
  exactly as it is, logo file included.
- **`/` serving this page.** The route still belongs to `Welcome`. Switching it is a one-line
  change we can make separately once the redesign is live.
- **The search form's internals** (`flight-search-form.jsx`). Its fields, validation and
  submission are untouched.
- **Fare data.** Prices keep coming from the cached feed: Redis `flightBrowse` for 12h on the
  server, `cheapestFares_${origin}` in the browser for 6h. No new job, no new endpoint.

## Page order

Header (unchanged) → ink info strip → hero with the search card → **lowest fares** →
**incredible savings** → **festival band** → **popular destinations** → partner line → footer.

The fares move above the destination gallery: someone who lands here is shopping for a price,
so the prices come first and the pictures follow.

## What changes, section by section

**One ground.** The sand band is dropped. Every section sits on ivory so no section starts with
a hard colour edge. Depth comes from cards and photographs, not from alternating backgrounds.

**Hero.** Unchanged in structure: the wing photograph, the kicker between hairlines, "Find Your
*Perfect Flight* Today", the lede, then `FlightSearchForm` with its existing `onSearch` and
`initialData`. The single "Secure checkout" line under it becomes a three-item trust row
(secure checkout, seat confirmed before the card is charged, e-ticket emailed in minutes).
`ScrollFlightProgress` — the curved dashed flight path down the left — stays.

**Lowest fares (`cheapest-flight.jsx`).** The glass panel wrapper goes; the cards sit directly
on the page under a centred heading — kicker, "Cheapest fares from *City (CODE)*", and the live
/ as-of line. Three large cards in one row instead of six small ones: photo 256px tall, city
name and price scaled up with it, teal Book button. A "See every route" link carries the rest.
All fetching, caching, image fallback and `onBookFlight` logic is untouched.

**Incredible savings.** The existing block, kept as it is written today — framed photo, kicker,
"Our lowest fares to the world's *most-loved* places" with the italic teal phrase, and the three
teal checks. It moves below the fares.

**Festival band (new).** Full-bleed airport photograph, copy parked left over a horizontal dark
wash that fades to clear on the right, a soft ivory fade at the top edge. It carries no discount
claim — the copy is "Flying home for the festival?" and the promise is the seat hold, which is
real. Two actions: scroll back to the search, and call the desk.

**Popular destinations.** Already the mosaic the owner asked for (feature tile + 2×2 grid, with
the swipe row at phone width). Unchanged.

**Partner line (new).** A quiet strip above the footer: Amadeus and ARC Pay marks from
`public/images/logos/`, plus SSL. Facts only.

## Copy guard

Nothing on this page may promise a discount that no rule fulfils. `noUnfulfilledDiscounts.test.js`
already guards "$50 OFF" and "today only"; the festival band deliberately names no percentage.
"Price match guarantee" and "Service fee shown before you pay" stay as they are today — the owner
still owes a decision on whether the price-match line is defensible.

## Typography

Headings on this page use Bricolage Grotesque, added as a `font-grotesk` family alongside Lato
rather than replacing it, so no other page changes. Body text, buttons and the search card stay
on Lato.

## Testing

- `tests/components/flightLanding.test.js` and `noUnfulfilledDiscounts.test.js` must stay green —
  they read this file's source for the single-search navigate, the service-fee line, and the
  absence of fake discounts.
- A new test asserts the page renders the fares section before the destinations, and that the
  festival band carries no percentage claim.
- Browser check on the built app before any deploy: load the page, click through a search, read
  the console.

## Images (added 2026-09-19)

The flight pages hotlinked 59 photographs from the Unsplash CDN. They are now
served by us:

- `scripts/media/localise-unsplash.mjs` downloads each photograph once as WebP
  into `public/images/destinations/` and rewrites the source files to the local
  path. Re-running it repairs anything missing from disk.
- `public/images/destinations/credits.json` records, per photograph, the source
  page, the licence and its URL, the date retrieved, the size and dimensions.
  The Unsplash licence permits commercial use without attribution; the record
  exists so the provenance can be answered years later.
- Six of the hotlinked photographs were already 404 on the CDN — the live site
  was falling back for them. They are replaced with working ones.
- The festival band's photograph was a recognisable face. Unsplash does not
  guarantee model releases, and a face in a promotional banner is the one place
  that matters, so it is now an aircraft at sunset with nobody in frame.
- Destination cards hold up to three views of the same city and cross-fade
  between them every five seconds, pausing for `prefers-reduced-motion`. A view
  joins the rotation only once it has loaded, so a card never fades to blank.

Total weight: 6.4 MB for 75 photographs, ~85 KB each for a card, ~400 KB for
the two that run the full width of the page.
