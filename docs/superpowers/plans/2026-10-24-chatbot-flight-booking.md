# Chatbot Flight Search and Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The chat bot finds real flights with Gemini function calling, shows up to 5 of them as cards, and Book on a card goes through the search page's own fare-options step and checkout.

**Architecture:**
- Gemini gets one tool, `search_flights`. The chat controller runs that tool against the live search route, server to server.
- Our code, not Gemini, picks the cards. Gemini writes one or two sentences about them, and a price guard removes any money figure it did not see.
- The widget draws the cards from the raw offers, using the search page's own transform (moved to a shared module), and hands the chosen flight to checkout with the search page's own handoff (also shared).

**Tech Stack:** Node/Express (ESM), `@google/genai` (installed 1.50.1, `response.functionCalls`), axios, React 18 + react-router, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-24-chatbot-flight-booking-design.md`

## Global Constraints

- Work in a worktree on branch `feat/chat-flight-search` (`../JETSET13-chat-flights`, with `node_modules` symlinked from the main tree). Never stage `CLAUDE.md` or `frontend/src/Pages/Common/Navbar.jsx`.
- Brand palette only: primary teal `#055B75`, dark teal `#034457`, accent `#0890BC`, sky `#65B3CF`, light background `#F1FBFD`. Never `#0066FF`, `#1e40af`, `#1976D2`, `#0EA5E9`, `#0d99ff` or `#036cca`.
- No card details, passenger names, dates of birth or passport numbers in the chat, in prompts, or in tool arguments.
- Prices in USD only. Card prices use the search page's label: "for N travellers + service fee".
- No database schema change. No mobile app change.
- The search page behaves exactly as before.
- The chat's search body equals `buildSearchPayload` for the same criteria, so the chat and the search page share one Redis cache entry.
- No comments in routine code. Comment only a hidden constraint or a money/security reason.
- Don't run `npm run test:integration`. Run backend tests with blank `VITE_SUPABASE_URL` and blank `AMADEUS_WS_*`, as CI does.
- Merge only on the owner's explicit word "merge".

## Review Focus

1. **A city the search can't place** ("Springfield") must give a question back, not an error or a guess. Pinned in Task 4: `asks which airport when the search answers UNKNOWN_PLACE`.
2. **A slow or busy search** (Lightsail 503, a timeout) must give a plain apology and the search page link, with no cards and no invented flights. Pinned in Task 4: `apologises and shows no cards when the search fails`.
3. **Pressing Enter twice while a search is running** must not start two searches. Pinned in Task 5: `cannot send while a reply is pending`.
4. **Cards restored hours later from the tab** must say when their prices were found. Pinned in Task 5: `restored cards show the time their prices were found`.
5. **Gemini returns no text after the tool, or the guard removes every sentence**: the customer still gets a sentence with the cards. Pinned in Task 4: `falls back to a fixed sentence when Gemini says nothing usable`.

---

### Task 1: Share the search page's offer transform and booking handoff

The search page's `transformFlightData` (`flightsearchpage.jsx:300-692`) and `handleBookFlight` state (`flightsearchpage.jsx:922-936`) move out unchanged, so the chat can use both.

**Files:**
- Create: `frontend/src/Pages/Common/flights/flightOffers.js`
- Create: `frontend/src/Pages/Common/flights/bookingHandoff.js`
- Modify: `frontend/src/Pages/Common/flights/flightsearchpage.jsx` (remove the inner `transformFlightData`; `handleBookFlight` calls `bookingHandoffState`)
- Create: `tests/fixtures/flights/searchOffers.json`
- Test: `tests/components/flightSearchHandoff.test.jsx`, `tests/utils/flightOffers.test.js`

**Interfaces:**
- Produces: `toDisplayFlights(data: object[], { cityMap = {}, airlineNames = {}, aircraftNames = {} } = {}) => object[]`. It is the old function body, with `cityMap`, `dynamicAirlineMap` and `dynamicAircraftMap` read from the options.
- Produces: `bookingHandoffState(flight: object, searchData: object, fareCheck: object|null) => { flightData, searchData, attemptId, fareCheck? }`, where `attemptId` comes from `crypto.randomUUID()`, falling back to `String(Date.now() + Math.random())`.

- [ ] **Step 1: Build the fixture.** Run a local search (`POST http://localhost:5004/api/flights/search`, `{"from":"DEL","to":"BOM","departDate":"<30 days out>","adults":2}`) and save into `tests/fixtures/flights/searchOffers.json` the `data` items for one nonstop offer and one 1-stop offer, kept whole with `originalOffer`. The file holds no passenger data.

- [ ] **Step 2: Write the characterization test on the OLD code.** In `tests/components/flightSearchHandoff.test.jsx`, render the page using the harness pattern from `tests/components/flightSearchPage.test.jsx`, with these differences:
  - Search answers the fixture.
  - `FlightCard` is mocked to a button calling `onViewPrices(flight)`.
  - `FlightFareOptions` is mocked to a button calling `onSelect(flight, null)`.
  - A `/flights/booking-confirmation` route renders a probe that records `useLocation().state`.

  Test `BOOK hands checkout the search page's flight` clicks through for the 1-stop offer. It asserts `expect({ ...state, attemptId: 'x' }).toMatchInlineSnapshot()` and `expect(state.attemptId).toMatch(/\S/)`.

- [ ] **Step 3: Run it on the old code to write the snapshot.**
  Run: `npx vitest run tests/components/flightSearchHandoff.test.jsx`
  Expected: PASS. Vitest writes the inline snapshot into the file. Commit the test with its snapshot before touching the page.

- [ ] **Step 4: Write `tests/utils/flightOffers.test.js`.**
  - `keeps the original offer and names cities from the map`: `toDisplayFlights(fixture, { cityMap: { DEL: 'Delhi', BOM: 'Mumbai' } })[0]` has `originalOffer` deep-equal to the fixture's, and `departure.cityName === 'Delhi'`.
  - `falls back to codes without maps`: with no options, `departure.cityName === 'DEL'`.
  - `bookingHandoffState matches the search page`: `bookingHandoffState(f, sd, null)` has keys `flightData`, `searchData`, `attemptId` and no `fareCheck`. With `fareCheck: {a: 1}` it carries it.

- [ ] **Step 5: Run it to confirm it fails.**
  Run: `npx vitest run tests/utils/flightOffers.test.js`
  Expected: FAIL, `Failed to resolve import ".../flightOffers"`.

- [ ] **Step 6: Move the code.**
  - Cut the function body verbatim into `toDisplayFlights` and the state object into `bookingHandoffState`. Any helpers it uses (`airportClockLabel`, `legDateLabel` from `./searchResults`, `parseCheckedBagLabel` from `../../../utils/baggage`) are imported in the new file.
  - The page calls `toDisplayFlights(body.data || [], { cityMap, airlineNames: dynamicAirlineMap, aircraftNames: dynamicAircraftMap })`, and `handleBookFlight` returns `navigate('/flights/booking-confirmation', { state: bookingHandoffState(flight, searchParams, fareCheck) })`.
  - Check the move with `git diff --word-diff`: the only body changes should be the three renamed maps.

- [ ] **Step 7: Run all search page tests.**
  Run: `npx vitest run tests/components/flightSearchHandoff.test.jsx tests/utils/flightOffers.test.js tests/components/flightSearchPage.test.jsx tests/components/searchPageCityNames.test.jsx tests/components/fareFamilyOptions.test.jsx`
  Expected: all PASS, inline snapshot unchanged.

- [ ] **Step 8: Commit** the spec, this plan, the fixture, both tests and the three source files: `refactor(flights): the search page's offer transform and booking handoff are shared modules`.

### Task 2: The search tool

**Files:**
- Create: `backend/services/chat/flightSearchTool.js`
- Test: `tests/backend/chatFlightSearchTool.test.js`

**Interfaces:**
- Produces: `SEARCH_FLIGHTS_DECLARATION`, a Gemini function declaration named `search_flights`.
  - Parameters: `from` and `to` (city or airport, as the customer said it), `departDate` (YYYY-MM-DD), `tripType` (`oneWay` | `roundTrip`), `returnDate`, `adults`, `children`, `infants`, `cabin` (`ECONOMY` | `PREMIUM_ECONOMY` | `BUSINESS` | `FIRST`), `nonStop` (boolean), `airlines` (array of 2-letter codes), `timeOfDay` (`morning` | `afternoon` | `evening` | `night`), `maxPrice` (number, USD).
  - Required: `from`, `to`, `departDate`, `tripType`, `adults`.
- Produces: `normalizeSearchArgs(args, { today: 'YYYY-MM-DD' }) => { ok: true, search, refine } | { ok: false, missing: string[] , reason?: string }`.
  - `search` = `{ from, to, departDate, returnDate?, adults, children, infants, travelClass }`.
  - `refine` = `{ nonStop, airlines, timeOfDay, maxPrice }`.
- Produces: `searchBody(search) => object`. It is byte-for-byte what `buildSearchPayload` (frontend `searchQuery.js`) sends for the same criteria, including `max: 50`.
- Produces: `runFlightSearch(search, { visitorIp }) => Promise<{ ok: true, offers: object[], total: number, resolved: object } | { ok: false, status: number, code?: string, message: string }>`.
  - It calls `POST ${flightsApiBase()}/api/flights/search` with axios (timeout 20000, `validateStatus: () => true`), header `x-forwarded-for: visitorIp`.
  - `resolved` is the response's `meta.searchParams`.
- Produces: `flightsApiBase() => string`: `FLIGHTS_API_BASE`, else `https://api.jetsetterss.com` when `VERCEL` is set, else `http://127.0.0.1:${PORT || 5004}`.
- Produces: `pickCards(offers, refine) => object[]`, at most 5, in this order:
  1. Apply `refine` as filters: nonstop is `stops === 0`; airlines match `airlineCode`; `timeOfDay` uses the departure hour (morning 05–11, afternoon 12–16, evening 17–20, night 21–04); `maxPrice` compares against `Number(price.total)`.
  2. Take the cheapest, then the fastest by `durationMinutes`, then the cheapest nonstop.
  3. Fill the rest by price. No offer appears twice (by `id`).
- Produces: `cardSummary(cards, search) => string`, one line per card: `airline, departure time–arrival time, stops, duration, USD <price.total> for <N> travellers + service fee`.

The refinement filters are applied here, never sent to the search route. A refinement within 5 minutes is then a Redis cache hit, not a new Amadeus search.

- [ ] **Step 1: Write the failing tests.**
  - `normalizes a complete one-way request`: `{from:'New York',to:'LA',departDate:'2026-11-15',tripType:'oneWay',adults:2}` with today `2026-10-24` gives `ok:true`, `search.travelClass === 'ECONOMY'`, `children === 0`.
  - `asks for what is missing`: no `tripType` and no `adults` gives `ok:false`, `missing` equal to `['tripType','adults']`.
  - `refuses a past date`: `departDate: '2026-10-23'` gives `ok:false`, `reason: 'PAST_DATE'`.
  - `round trip needs a return date on or after departure`: gives `missing: ['returnDate']`; a return date before departure gives `reason: 'RETURN_BEFORE_DEPARTURE'`.
  - `more infants than adults is refused`: gives `reason: 'INFANTS_EXCEED_ADULTS'`.
  - `the body matches the search page`: `searchBody(search)` deep-equals `buildSearchPayload({from, to, departDate, adults, children, infants, travelClass})` imported from `frontend/src/Pages/Common/flights/searchQuery.js`.
  - `refinements never reach the search route`: with axios mocked, `runFlightSearch` posts a body without `nonStop` or `includedAirlineCodes`, and sends the `x-forwarded-for` header.
  - `passes the route's refusal through`: a 400 `{code:'UNKNOWN_PLACE', error:'We could not find "Springfield"...'}` gives `{ok:false, status:400, code:'UNKNOWN_PLACE', message: <that error>}`.
  - `picks cheapest, fastest and cheapest nonstop first, at most 5, no repeats`: run on a 9-offer array built inline.
  - `applies nonstop, airline, time of day and max price`: one case each.
  - `summary lines carry the card total and the service fee words`.

- [ ] **Step 2: Run them to confirm they fail.**
  Run: `VITE_SUPABASE_URL= npx vitest run tests/backend/chatFlightSearchTool.test.js`
  Expected: FAIL, the module is missing.

- [ ] **Step 3: Implement `backend/services/chat/flightSearchTool.js`** to the interfaces above. Build the declaration with `Type` from `@google/genai`.

- [ ] **Step 4: Run the tests.** Expected: PASS.

- [ ] **Step 5: Commit**: `feat(chat): a flight search tool that runs the live search and picks the cards`.

### Task 3: The price guard

**Files:**
- Create: `backend/services/chat/priceGuard.js`
- Test: `tests/backend/chatPriceGuard.test.js`

**Interfaces:**
- Produces: `moneyAmounts(text) => number[]`. It reads `$12`, `$1,234.50`, `US$ 99`, `USD 99`, `99 USD`, `99 dollars`, `₹6,228`, `INR 6228`, `€50`, `£50`.
- Produces: `allowedAmounts({ cards = [], context = {}, customerTexts = [] }) => Set<number>`. Values are rounded to cents, taken from:
  - each card's `price.total` and `price.amount`;
  - `context.bookings[].totalAmount`, `context.upcomingBookings[].totalAmount` and `context.quotes[].amount`;
  - every amount in `customerTexts`.
- Produces: `guardPrices(text, allowed) => { text: string, removed: number }`. It removes each sentence that holds an amount not in `allowed` and leaves the rest of the text as it was.

- [ ] **Step 1: Write the failing tests.**
  - `keeps card prices`: `"The cheapest is $189.40 on Delta."` with 189.40 allowed is unchanged.
  - `keeps booking amounts and the customer's budget`: a booking `totalAmount: 512` and customer text `"under $300"` allow both.
  - `removes an estimate`: `"Flights to LA are usually around $200. Here are three options."` keeps only `"Here are three options."`, with `removed: 1`.
  - `removes a worked-out difference`: `"$40 cheaper than the nonstop."` is removed when 40 is not allowed.
  - `reads rupees and other currencies`: `"₹6,228"` gives `[6228]`.
  - `text with no money is untouched`.

- [ ] **Step 2: Run them to confirm they fail.** Run: `npx vitest run tests/backend/chatPriceGuard.test.js`. Expected: FAIL, the module is missing.

- [ ] **Step 3: Implement it.** Split sentences on `.`, `!` or `?` followed by a space, or on a newline. A number inside a sentence that follows a currency mark or is followed by a currency word counts as money. Bare numbers ("2 adults", "AI 423", times) don't.

- [ ] **Step 4: Run the tests.** Expected: PASS.

- [ ] **Step 5: Commit**: `feat(chat): replies carry no price the customer was not shown`.

### Task 4: Gemini tools in the chat reply

**Files:**
- Modify: `backend/services/gemini.service.js` (add `generateWithTools`)
- Modify: `backend/config/chatbot.js` (system prompt section)
- Create: `backend/services/chat/chatSearchLimit.js`
- Modify: `backend/controllers/chat.controller.js` (`processMessage` only; the stream route stays as it is)
- Modify: `backend/api/chat/index.js` (add `POST /event`)
- Modify: `backend/server.js` (mount the chat router at `/api/chat`). The dev backend that `npm run dev` starts never mounted it, so the chat 404s locally. CLAUDE.md's three-entry rule asks for it.
- Test: `tests/backend/chatFlightReply.test.js`

**Interfaces:**
- Consumes: everything Task 2 and Task 3 produce.
- Produces: `geminiService.generateWithTools(prompt, context, history, { tools, onCall }) => Promise<{ text, tokensUsed, metadata, toolResult: any|null }>`.
  - It makes one `generateContent` with `config.tools = [{ functionDeclarations: tools }]`.
  - If `response.functionCalls?.length`, it awaits `onCall(call.name, call.args)` for the first call only, then makes a second `generateContent`. The contents are the original turns, `response.candidates[0].content` kept whole (Gemini 2.5 thought signatures ride in it), and `{ role: 'user', parts: [{ functionResponse: { name, response: { result: <onCall's modelResult> } } }] }`.
  - `onCall` returns `{ modelResult, toolResult }`. `modelResult` goes to Gemini; `toolResult` is returned to the caller.
  - No tools on the second call, so there is at most one search per message.
- Produces: `takeSearchSlot({ sessionId, ip }) => Promise<boolean>`, 10 per hour per session and 10 per hour per IP.
  - The count is kept with `cache.service` `get`/`set` under keys `chat:fs:s:<sessionId>` and `chat:fs:ip:<ip>`, as `{count, resetAt}` with TTL 3600.
  - Without Redis it falls back to an in-process `Map`.
- Produces: the `POST /api/chat/message` body, which now also accepts `clientDate` (YYYY-MM-DD). The server uses it only when it is within one day of its own UTC date; otherwise it uses its own.
- Produces: the response JSON, which gains `flightResults` when a search ran and returned offers: `{ offers: object[] (raw search items, ≤5), total: number, search: <resolved search>, searchedAt: ISO string }`.
- Produces: `POST /api/chat/event` with `{ sessionId, event, offerId? }`, where `event ∈ ['flight_book_clicked','flight_see_all_clicked']`. It logs `chatModel.logAnalytics(sessionId, event, { offerId })` and answers 204. Anything else gets a 400. It uses `messageLimiter` and `optionalProtect`.

**System prompt section** (append to `chatbotConfig.context.systemPrompt`; this wording is the contract the tests rely on):

```
Flight search:
- You can search real flights with the search_flights tool. Today is {today}.
- Before searching you need: from, to, departure date, one way or return (with the return date), and how many adults, children and infants. If any is missing, ask for all the missing ones in ONE short question. Never assume the trip type or the number of travellers. Cabin is economy unless the customer says otherwise.
- Never state, estimate or calculate a price yourself. Prices appear on the flight cards under your reply. Do not repeat them, and never do sums with them.
- Prices are the airline fare plus our service fee, in US dollars, confirmed at checkout.
- Never ask for card details, passport numbers, dates of birth or passenger names. Those are entered on the checkout page.
- After a search, write one or two short sentences. Point the customer to the cards and the Book button.
- If the search finds no flights, say so and offer to search the day before or the day after.
```

`{today}` is replaced with the request's date. The prompt's "You have READ-ONLY access" rules stay as they are: searching is reading.

**Controller flow in `processMessage`**, after the context is built:
1. `onCall('search_flights', args)`:
   1. Run `normalizeSearchArgs`. If it fails, `modelResult = { needs: missing, reason }`.
   2. Otherwise take a slot with `takeSearchSlot`. If none is left, `modelResult = { limited: true }`.
   3. Otherwise run `runFlightSearch(search, { visitorIp: req.ip })`.
   4. If the search fails, `modelResult = { failed: code || status, message }`.
   5. Otherwise `cards = pickCards(offers, refine)`, `modelResult = { summary: cardSummary(cards, search), total }`, and `toolResult = { offers: cards, total, search: resolved, searchedAt }`.
   6. Log `logAnalytics(session.id, 'flight_search', { ok, total, cards: cards.length })`.
2. Apply `guardPrices` to the text, with `allowedAmounts({ cards: toolResult?.offers, context, customerTexts: [message, ...history user turns] })`.
3. Empty text, after Gemini or after the guard:
   - when cards exist: `Here are the best flights I found. Prices are the airline fare plus our service fee, confirmed at checkout.`
   - when the search failed: `I couldn't search flights just now. You can search on our flights page: /flights`
4. Respond with `flightResults: toolResult` when there are cards.

- [ ] **Step 1: Write the failing tests** in `tests/backend/chatFlightReply.test.js`. Mock `@google/genai` (a `GoogleGenAI` class whose `models.generateContent` is a `vi.fn` queue), `axios`, `../../backend/models/chat.model.js` and `../../backend/services/booking-data.service.js`. Call `chatController.processMessage(req, res)` with a fake `req` (`body`, `ip`, `user: undefined`) and `res` (`json`, `status`).
  - `searches and returns cards`: Gemini queue is a functionCall `search_flights` with complete args, then text `"Here are some good options."`. Axios answers 200 with the fixture from Task 1. `res.json` gets `flightResults.offers.length >= 1`, `flightResults.total === fixture.length`, and `message === 'Here are some good options.'`.
  - `the second Gemini call carries the function response`: the second `generateContent` contents end with a part holding `functionResponse.name === 'search_flights'`, and contain the first reply's `candidates[0].content` unchanged.
  - `asks for what is missing without searching`: args lack `adults`. Axios is not called, and the function response has `needs: ['adults']`.
  - `asks which airport when the search answers UNKNOWN_PLACE`: axios answers 400 UNKNOWN_PLACE. No `flightResults`; the function response has `failed: 'UNKNOWN_PLACE'`.
  - `apologises and shows no cards when the search fails`: axios answers 503 and Gemini returns empty text. The message is the fixed failure sentence and there is no `flightResults`.
  - `falls back to a fixed sentence when Gemini says nothing usable`: Gemini returns `"Usually about $999."` after a good search. The guard removes it, and the message is the fixed card sentence.
  - `says so when no flights are found`: axios answers 200 with `data: []`. The function response has `total: 0` and no summary lines, and there is no `flightResults`.
  - `stops searching after the session's limit`: the eleventh search in one session has `limited: true` in the function response, and axios was called 10 times.
  - `uses the customer's date only when it is close to the server's`: `clientDate` two days off is ignored, and `{today}` in the prompt is the server date.
  - `event route logs known events and refuses others`: tested through the router with supertest, mocking `optionalProtect` the way `tests/backend` suites already do.

- [ ] **Step 2: Run them to confirm they fail.**
  Run: `VITE_SUPABASE_URL= npx vitest run tests/backend/chatFlightReply.test.js`
  Expected: FAIL (`generateWithTools is not a function`).

- [ ] **Step 3: Implement** `generateWithTools`, the prompt section, `takeSearchSlot`, the controller flow and the event route. `processMessage` calls `generateWithTools` in place of `generateResponse`, with `tools: [SEARCH_FLIGHTS_DECLARATION]`.

- [ ] **Step 4: Run the tests, then the whole backend project.**
  Run: `VITE_SUPABASE_URL= AMADEUS_WS_USER_ID= AMADEUS_WS_PASSWORD= npx vitest run --project backend`
  Expected: PASS. If `searoute-ts` is missing locally, only those 4 suites fail, as on main.

- [ ] **Step 5: Commit**: `feat(chat): the bot searches real flights with Gemini function calling`.

### Task 5: Cards in the chat, Book through the fare options, and the chat survives navigation

**Files:**
- Create: `frontend/src/Pages/Common/chat/ChatFlightCards.jsx`
- Modify: `frontend/src/Pages/Common/AIChatbot.jsx`
- Modify: `frontend/src/Pages/Common/AIChatbot.css` (brand palette)
- Test: `tests/components/chatFlightCards.test.jsx`, `tests/components/aiChatbotFlights.test.jsx`

**Interfaces:**
- Consumes: `toDisplayFlights` and `bookingHandoffState` (Task 1), `searchToQuery` and `searchFromQuery` (`searchQuery.js`), `FlightFareOptions` (`flight`, `onClose`, `onSelect(chosenFlight, fareCheck)`), `useCityNames` and `airportCodesOf` (`hooks/useCityNames`), `Price` (`Components/Price`), and the response's `flightResults` (Task 4).
- Produces: `<ChatFlightCards results={flightResults} sessionId={string|null} />`.
  - `searchData = searchFromQuery(searchToQuery(results.search))`.
  - `flights = toDisplayFlights(results.offers, { cityMap })`.
  - Each card shows the airline name, departure–arrival times, stops ("Nonstop" / "1 stop"), the duration, `<Price>` of the fare, the label "for N travellers + service fee" (N = `originalOffer.travelerPricings.length`, as `FlightCard.jsx` `pricedForLabel` does), the cabin, and a **Book** button.
  - Under the cards: `Prices found at <h:mm a> · confirmed at checkout`, then a link `See all <results.total> flights` to `/flights/search?${searchToQuery(searchData)}`, navigated with `state: { searchData }`.
  - Book opens `FlightFareOptions`, through `createPortal` into `document.body`, inside a `position: fixed; inset: 0; z-index: 1000` wrapper (the chat window is `z-index: 999`).
  - Its `onSelect(chosen, fareCheck)` runs `navigate('/flights/booking-confirmation', { state: bookingHandoffState(chosen, searchData, fareCheck) })`.
  - Book and See all post `/api/chat/event` without waiting for the answer and ignore its failure.
- Produces: in `AIChatbot.jsx`:
  - It sends `clientDate` (the browser's local `YYYY-MM-DD`).
  - A bot message is `{ type: 'bot', content, flightResults? }`, and it renders `<ChatFlightCards>` under the text when `flightResults` is set.
  - Messages are saved to `sessionStorage['jetsetters.chat.v1']` (last 30, wrapped in try/catch) and restored on mount. With a restore, no new welcome message is added.
  - The send button and Enter are disabled while `isTyping`.
  - `fetchWithRetry` for `/api/chat/message` uses `{ timeout: 55000, retries: 0 }`. A retry could run a second search.
- Produces: `AIChatbot.css` uses only the brand palette. `#0d99ff` becomes `#055B75`, `#036cca` becomes `#034457`, `#f0f8ff` becomes `#F1FBFD`, and any hover/accent becomes `#0890BC`.

- [ ] **Step 1: Write the failing tests.**
  - `chatFlightCards.test.jsx`, using the Task 1 fixture as `results.offers` inside a `MemoryRouter` with a probe route at `/flights/booking-confirmation`. `FlightFareOptions` is mocked to a button calling `onSelect(flight, {checked: true})`.
    - `shows each card's airline, times and price with the service fee label`: the text includes `for 2 travellers + service fee`.
    - `Book goes through the fare options and hands checkout the search page's state`: the probe's state deep-equals `bookingHandoffState(toDisplayFlights(offers)[i], searchFromQuery(searchToQuery(results.search)), {checked: true})`, with `attemptId` set aside.
    - `See all links to the full results for the same search`: href is `/flights/search?from=DEL&to=BOM&date=<D>&adults=2`, and the text is `See all <total> flights`.
    - `restored cards show the time their prices were found`: `searchedAt` 3 hours ago renders `Prices found at <that time>`.
  - `aiChatbotFlights.test.jsx`, with `fetch` mocked and the auth context mocked to a guest.
    - `sends the customer's date`: the posted body has `clientDate` matching `/^\d{4}-\d{2}-\d{2}$/`.
    - `draws cards under a reply that has flight results`.
    - `cannot send while a reply is pending`: while the first fetch is unresolved, pressing Enter again does not call `fetch` a second time.
    - `keeps the conversation after a remount`: unmount and render again; the earlier user text and cards are there and no second welcome message appears.
    - `does not retry a message request`: a fetch that rejects once gives the error message, after one `fetch` call.

- [ ] **Step 2: Run them to confirm they fail.**
  Run: `npx vitest run tests/components/chatFlightCards.test.jsx tests/components/aiChatbotFlights.test.jsx`
  Expected: FAIL, `ChatFlightCards` is missing.

- [ ] **Step 3: Implement** `ChatFlightCards.jsx`, the `AIChatbot.jsx` changes and the CSS palette. Cards use Tailwind classes in the brand colours, matching `FlightCard.jsx`'s look at chat width (the window is about 360 px).

- [ ] **Step 4: Run the tests and the frontend project.**
  Run: `npx vitest run --project frontend`
  Expected: PASS.

- [ ] **Step 5: Check the palette.**
  Run: `grep -niE "#0d99ff|#036cca|#0066ff|#1e40af|#1976d2|#0ea5e9" frontend/src/Pages/Common/AIChatbot.css frontend/src/Pages/Common/chat/ChatFlightCards.jsx`
  Expected: no output.

- [ ] **Step 6: Commit**: `feat(chat): flight cards in the chat, booked through the search page's fare options`.

### Task 6: See it work, then the PR

- [ ] **Step 1: Local key.** Confirm that `GEMINI_API_KEY` is present in the main tree's `.env`, checking the name only. If it is missing, stop and ask the owner to add one. Vercel's stored value can't be read back.
- [ ] **Step 2: Run locally.**
  - Build the worktree and serve it with `vite preview`, with the backend on PDT (`NODE_ENV=test` for a job-free backend). Symlink `.env` into the worktree and remove the symlink afterwards.
  - In the owner's Brave, open the chat and type `flights from Delhi to Mumbai`. Expected: one question asking one way or return and how many.
  - Answer `one way on <date 30 days out>, 2 adults`. Expected: up to 5 cards with "for 2 travellers + service fee".
  - Then `only nonstop`. Expected: nonstop cards only, and the backend log shows a cache hit, not a new Amadeus search.
  - Press Book. Expected: the fare options, then the review page with the same flight. Press Back: the same cards are still in the chat.
  - Stop before payment. Read the console for errors.
- [ ] **Step 3: Clean up.** Stop the servers started, close the tabs opened, and remove the `.env` symlink.
- [ ] **Step 4: Push the branch and open the PR.** The body lists the browser checks and the Review Focus tests. End it with the session attribution lines.
- [ ] **Step 5: Wait for the owner's "merge".** After the merge, deploy with `scripts/deploy-frontend.sh origin/main`; this ships the site and the Vercel chat function. Then in the browser:
  - `/api/chat/health` is `ok`;
  - a chat search on www.jetsetterss.com shows cards;
  - Book reaches the review page;
  - stop there unless the owner chooses to book.
