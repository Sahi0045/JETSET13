# Multi-city Flights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer searches, picks, pays for and books a trip of 2 to 6 flights on different routes and dates (multi-city), on the website, as one booking with one ARC Pay charge.

**Architecture:**
- Search accepts `legs: [{from, to, departDate}]`. The Master Pricer builder sends one `<itinerary>` per leg. The pricing, seat check, booking chain and ticketing already work over every itinerary and segment (audit of 25 Oct 2026).
- The backend transform adds a `legs` array to every offer.
- The frontend reads `legs` everywhere it read `returnLeg`.
- The trip type is worked out from the booked flights' geography, so labels stop guessing "Return" from a count of 2.

**Tech Stack:** Node/Express (ESM), Amadeus Enterprise SOAP, React 18, Vitest.

**Spec:** the owner's request in chat on 25 Oct 2026 ("build it bro", website first). The owner opted out of a design round. The decisions Claude made are listed under Global Constraints and reported to the owner.

## Global Constraints

- Branch `feat/multi-city` in worktree `../JETSET13-multi-city`, from `origin/main` 4a0247db. Never stage `CLAUDE.md` or `frontend/src/Pages/Common/Navbar.jsx`.
- 2 to 6 legs. The Master Pricer XSD (`Fare_MasterPricerTravelBoardSearch_24_6_1A.xsd`) allows 18 itineraries.
- Each leg date is today or later, and not before the previous leg's date. On each leg, from ≠ to.
- One-way and round-trip behaviour and URLs stay exactly as they are.
- The chat branch (`feat/chat-flight-search`) is out of scope. Its moved transform is reconciled when either branch merges second.
- Android is out of scope (later).
- No SQL migration. `booking_details` is JSONB.
- Brand palette only. No comments in routine code.
- Don't run integration tests. Run backend tests with blank `VITE_SUPABASE_URL` and `AMADEUS_WS_*`.
- Merge only on the owner's explicit "merge".

## Review Focus

1. **A multi-city URL pasted into a new tab** (refresh or bookmark) must reload the same legs, not fall back to one-way.
2. **A 2-leg open-jaw trip** (DEL→DXB, LHR→DEL) must never be labelled "Return" anywhere: card, review page, confirmation, My Trips, email.
3. **A search where one leg's city can't be placed** must name that leg's text in the error.
4. **Trips of 5 or more flights with connections** may produce conjunction tickets and 8 or more payment legs. They must book and pay on PDT and the TEST merchant before they are trusted.
5. **The date strip and fare calendar** (one-way price sampling) must not appear on multi-city results, where their prices would be for a different trip.

---

### Task 1: Search accepts legs (backend)

**Files:**
- `backend/services/amadeusSoap/operations/masterPricer.js` (`buildLegs`, `normalize`)
- `backend/services/amadeusSoap/index.js` (`searchFlights` request: resolve each leg)
- `backend/routes/flight.routes.js` (`flightSearchSchema`, `searchDateProblem`, `/search` resolve + UNKNOWN_PLACE per leg, `searchParams.legs`, cache key, `transformAmadeusFlightData` adds `legs`)
- Tests: `tests/backend/multiCitySearch.test.js`

**Produces:**
- The `POST /api/flights/search` body accepts `legs: [{from, to, departDate}]` (2..6). It must not be sent together with `returnDate`. The top-level `from`/`to`/`departDate` are optional when `legs` is present.
- Each offer in the response gains `legs: [{ departure, arrival, duration, durationMinutes, stops, stopDetails, segments }]`, one entry per itinerary.
- `meta.searchParams.legs` echoes the resolved legs.

### Task 2: Trip type from geography (shared)

**Files:**
- `shared/bookingItineraries.js`: new `tripTypeOf(legs)` returns `'oneWay'`, `'roundTrip'` or `'multiCity'`. `directionOf`, `legLabel` and `returnDateOf` use it in place of `count === 2`.
- `backend/routes/flight.routes.js` `buildBookingRow` and the `/order` save: write `booking_details.trip_type`.
- Tests: `tests/utils/tripTypeOf.test.js`

**Rule:** 2 legs where leg 2 ends where leg 1 started (same airport, or same city per the airport index or the city code) is a round trip. Anything else with 2 or more legs is multi-city.

### Task 3: Search URL and payload contract (frontend)

**Files:**
- `frontend/src/Pages/Common/flights/searchQuery.js`: `buildSearchPayload` sends `legs`; `searchKeyOf`; `searchToQuery` and `searchFromQuery` use `tripType=multiCity&legs=DEL.DXB.2026-11-01_DXB.LHR.2026-11-05`; `normalizeTripType` recognises `multiCity`.
- `frontend/src/Pages/Common/flights/data.js` `defaultSearchData.legs`.
- Tests: `tests/utils/searchQueryMultiCity.test.js` (round trip through the URL, payload shape, one-way and round-trip unchanged)

### Task 4: Search form (frontend)

**Files:**
- `frontend/src/Pages/Common/flights/flight-search-form.jsx`: enable the Multi-city option. The rows are from/to/date, from 2 to 6, with "Add another flight" and remove. A new row's "from" is the previous row's "to". Validation: every field filled; dates ascending and not in the past. Calendars show no prices.
- Test: `tests/components/flightSearchFormMultiCity.test.jsx`

### Task 5: Results (frontend)

**Files:**
- `flightsearchpage.jsx` transform: `legs` from every itinerary; `isRoundTrip`/`returnLeg` only for a round trip. Date strip, date prices and fare calendar hidden for multi-city. Header shows the leg chain.
- `FlightCard.jsx` (one block per leg)
- `flightSort.js` / `searchResults.js` (`legsOf` uses `legs`; return-time filter only for round trip)
- `FlightModifyBar.jsx` (summary shows the leg chain)
- `useCityNames.airportCodesOf` (all legs)
- `FlightFareOptions.jsx` header
- Tests: `tests/components/flightResultsMultiCity.test.jsx`

### Task 6: Review page and after (frontend)

**Files:**
- `utils/reviewTrip.js` (`legsOf`)
- `utils/reviewFlightFromSearch.js`
- `FlightBookingConfirmation.jsx` (one block per leg)
- `utils/travellerGroupChange.js` (`searchForGroup` keeps `legs`)
- `BookingConfirmation.jsx` header
- `mytrips.jsx` arrow and return date
- `ManageBooking.jsx` header
- Emails inherit the shared labels from Task 2.
- Tests: `tests/components/reviewMultiCity.test.jsx` plus the existing suites.

### Task 7: Prove it on PDT and the TEST merchant

- Local backend on PDT. Search a 3-leg trip and a 2-leg open-jaw trip through the API. Then, with the owner's OK, book one through the local site with the TEST card and void it.
- Check the PNR, the ticket number(s) (conjunction?), the ARC Pay payload's leg count, and the confirmation page, email and My Trips labels.
- Run in the browser: search form → results → fare options → review page.
