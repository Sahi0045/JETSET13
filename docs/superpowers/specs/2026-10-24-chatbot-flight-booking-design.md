# Chatbot flight search and booking: design

Status: approved by the owner in chat on 24 Oct 2026 ("approved"). Items marked "my call" were decided by Claude, not the owner, and the owner can change any of them.

## Why

The owner wants a customer to tell the chat bot where and when they want to fly, see real flights with real prices in the chat, and go from there to a paid ticket.

Today the bot cannot do any of that. It only answers questions. Asked on the live site for the cheapest New York to Los Angeles flight on 15 Nov, it said it has no live prices and sent the customer to the search page.

## What exists today (checked 24 Oct 2026)

**The bot**
- The chat bubble on the site is `frontend/src/Pages/Common/AIChatbot.jsx`. `PageWrapper.jsx` mounts it once the visitor scrolls, clicks, types or touches.
- Each message goes to `POST /api/chat/message`: `backend/api/chat/index.js`, then `backend/controllers/chat.controller.js`, then `backend/services/gemini.service.js`.
- The controller runs a security check and a keyword topic guess. For a logged-in user it loads their bookings, quotes and inquiries (read-only), plus FAQ snippets.
- All of that goes to Gemini as one block of text, in one call. Gemini is given no tools, and its instructions say it is read-only.
- The model is `gemini-2.5-flash` (`backend/config/chatbot.js`; the `GEMINI_MODEL` env var can change it). The SDK is `@google/genai` ^1.52, which supports function calling.
- `frontend/src/Components/ChatBot/ChatWidget.jsx` and `frontend/src/frontend-App.jsx` are old code that nothing loads. They are not part of this work.
- The bubble uses generic blue (`#0d99ff`, `#036cca` in `AIChatbot.css`), which is off the brand palette.
- The mobile app does not use the chat.

**The key**
- `GEMINI_API_KEY` is set on Vercel for Production, Preview and Development. The live `/api/chat/health` answers `ready: true`.
- The chat runs on Vercel (`backend/api/index.js`, and `server.js`). Vercel stops any request after 60 seconds; the chat's own timeout is 55 seconds.
- The local `.env` has no Gemini key, so the bot does not work on the local server.

**Flight search**
- `POST /api/flights/search` runs on Lightsail; Vercel rewrites `/api/flights/*` to `api.jetsetterss.com`.
- It takes city names as typed and resolves them itself. A name it can't place gets a 400 `UNKNOWN_PLACE` with a message the customer can act on.
- It already hides airlines we can't ticket.
- Results are cached in Redis for 5 minutes. A live JFK–LAX search on 24 Oct took 4.2 s the first time and 0.3 s from the cache, and returned 175 offers (580 KB).

**From search to ticket**
- The search page's BOOK button does not go straight to checkout. `FlightCard` calls `onViewPrices`, which opens `FlightFareOptions.jsx`. That step:
  - fetches the airline's branded fares from `/flights/upsell`;
  - lets the customer pick a fare;
  - checks it with `/flights/price` and stops on `FARE_UNAVAILABLE`;
  - only then calls `handleBookFlight`, which runs `navigate('/flights/booking-confirmation', { state: { flightData, searchData, attemptId, fareCheck } })`.
- `flightData` is one offer after the search page's own `transformFlightData`, a function defined inside the component in `flightsearchpage.jsx`.
- The search card shows the airline's fare, labelled "for N travellers + service fee" (`FlightCard.jsx`). The review page adds our service fee from the price settings.
- The review page prices the offer with its fare rules. It collects passengers and checks names, dates of birth and passports, including Secure Flight.
- Before the card is charged, checkout confirms the seats and the price (a fare the airline refuses is a 409 `FARE_UNAVAILABLE` before payment). The card is taken on ARC Pay's hosted page, and the booking process issues the ticket. Auto-ticketing is on in production.
- Guest booking is on, so a customer does not need to log in.
- All prices are in USD; ARC Pay takes USD only.

## Goals

1. A customer describes the trip in plain words (from, to, date, return date, passengers, cabin). The bot asks for anything missing, one thing at a time.
2. Once it knows enough to search (see "Before the first search" below), the bot shows **up to 5 real fares as cards** taken from our search. Each card shows airline, times, stops and duration. The price is shown the way the search page shows it. A link under the cards, "See all N flights", opens the full results page for the same search.
3. The customer can narrow the results in the chat: "only nonstop", "cheaper", "morning flights", "Air India only", "the day after".
4. **Book** on a card does exactly what the search page's BOOK button does: the same fare-options step, then our existing review and checkout page with that flight loaded. From there: passenger details, fare check, ARC Pay, ticket. Nothing in that path changes.
5. After booking, the bot keeps answering booking status as it does today.

## Non-goals

- No card or payment details in the chat, ever. Payment stays on ARC Pay's hosted page.
- No passenger names, dates of birth or passport numbers in the chat. Whatever is typed into the chat goes to Google's Gemini, and the checkout page already collects and checks these.
- No booking, cancelling or changing from the chat. Cancelling stays on Manage Booking.
- Flights only: no hotels (parked), packages or cruises. For a cruise question the bot points to the cruise enquiry, as today.
- No multi-city trips.
- No mobile app change in this project.
- No database schema change.

## Anti-goals (a failure even if everything technically works)

- **The bot states a price we can't sell.** Every price a customer sees in the chat comes from our search result in that conversation. The bot's own words must not contain a price figure that isn't on one of its cards.
- **The bot searches Amadeus on every message.** Searches count against the office's look-to-book ratio. The bot searches only once the route and date are known, within per-session limits.
- **Checkout shows a different flight from the card the customer clicked.** The review page may re-price, as it does for the search page, but the flight must be the same one.
- **The chat times out** on a search.

## How it works (decided)

1. **Gemini function calling**, on the existing key and model. One tool, `search_flights`, takes from, to, departure date, optional return date, adults, children, infants, cabin, nonstop-only and optional airline codes. These are the fields the search route already accepts.
2. **The search runs on our server.** The chat endpoint calls the same live search route the search page uses, server to server. City names go through as typed. `UNKNOWN_PLACE` and the route's other refusals become a question or an explanation in the chat. Timing fits well inside Vercel's 60 s: about 4 s for a fresh search and under 1 s from the cache.
3. **Our code picks the cards, not Gemini.** From the results it takes the cheapest, the fastest and the cheapest nonstop, plus whatever matches the customer's ask, up to 5 in all. Gemini gets a short summary of just those cards to write one or two sentences. The widget draws the cards from the data.
4. **Book uses the search page's own path** (my call). The search page's offer shaping (`transformFlightData`) moves into a shared module that both the search page and the chat use. Book in the chat opens the same `FlightFareOptions` step: branded fares, the customer's pick, the fare check, a stop on `FARE_UNAVAILABLE`. It then navigates to `/flights/booking-confirmation` with the same state the search page sends (`flightData`, `searchData` in the search page's shape, a fresh `attemptId`, `fareCheck`). That is one upsell and one price call per Book, the same as the search page. The review page cannot tell where the flight came from. The search page must behave exactly as before after the move.
5. **Card prices match the search page** (my call). Each card shows the airline's fare with the same "for N travellers + service fee" label. The bot's sentence says "plus service fee" too. The total with our fee appears on the review page, as it does after the search page today.
6. **"See all flights"** opens `/flights/search?<query>`, built with the existing `searchToQuery`, for the same route, dates, passengers and cabin (my call). Filters narrowed in the chat (nonstop, airline, time of day) are not carried over, because the results page can't take them from its address. The link shows the full count of the unnarrowed search ("See all 175 flights").
7. **Before the first search** (my call), the bot needs from, to, departure date, one way or return (with the return date), and how many are travelling. If the customer's message already has them, it searches at once. If not, it asks once, in one short question ("One way or return, and how many people?"). Cabin defaults to economy, and the cards say so. One complete question up front saves a second live search with the wrong prices.
8. **The conversation survives leaving the page** (my call). The widget is mounted again on every page, so its messages, cards included, are kept in `sessionStorage` for that tab and restored when it mounts. Back from the review page shows the same cards. No change to how pages mount the widget.
9. **The price guard** (my call) checks every reply, not just search replies. Any money figure in the bot's text must be one of these:
   - a price on a card in this conversation;
   - an amount from the customer's own bookings or quotes that the bot was given;
   - an amount the customer typed (a budget such as "under $300").

   Anything else, including a worked-out difference ("$40 cheaper") or an estimate ("usually around $200"), is removed from the reply. The prompt also tells Gemini not to estimate prices or do sums with them.
10. **Limits.** Search only once the details in item 7 are known. Cap searches per chat session and per visitor IP, about 10 an hour. An identical search reuses the cached result.
11. **Measuring it.** The existing chat analytics (`chatModel.logAnalytics`) record a search run, cards shown and Book clicked. Nothing new in the database.
12. **Brand palette.** The bubble and the new cards use the brand colours (primary teal `#055B75`, dark teal `#034457`, accent `#0890BC`, sky `#65B3CF`, light background `#F1FBFD`) in place of the generic blue.
13. **Guests and logged-in customers both work.** Checkout decides who owns the booking, as it does today.

## Edge cases

- Relative dates ("next Friday", "tomorrow") are resolved against the customer's own date, which the widget sends with each message. A date in the past gets a question, not a search.
- No flights found: say so, and offer the day before or after.
- Search busy or failing: a plain apology and the search page link. Never invented results.
- More infants than adults: pass on the search route's own message.
- A card left open for a long time can be stale. The review page re-prices anyway, and each card says the price is confirmed at checkout.

## Testing

- Unit tests with Gemini mocked:
  - the tool's arguments become the right search request;
  - the right cards are picked;
  - a reply containing a money figure outside the allowed set is caught, while booking amounts and the customer's own budget pass;
  - Book opens the same fare-options step and sends the same state the search page sends for the same offer;
  - the conversation and its cards are restored after a remount.
- A test that the shared `transformFlightData` gives the search page exactly what it got before the move. Run it against the old code first, to prove it passes there.
- Browser test on the local server (PDT, ARC Pay TEST merchant): chat, cards, Book, then the review page with the same flight and price. Stop before payment unless the owner OKs a test payment.
- After deploy (`scripts/deploy-frontend.sh origin/main` ships both the site and the Vercel function): the same check on the live site, stopping at the review page. The owner books a real ticket only if they choose to.

## Needed from the owner before building

- A Gemini key in the local `.env` for local testing. Vercel's stored value can't be read back.

## Left to the builder

- The prompt wording and tool schema details.
- The card layout, within the palette.
- The exact search limits, and how they are counted.
- How a refinement like "only nonstop" reuses the last results or runs a new search.
- The widget's timeout and retry (today 28 s with one automatic retry), so a search reply isn't cut off or sent twice.
- The server-to-server call to the search route (`flightCheckout.service.js` already shows how).
- What the reply says when the price guard removes something.
- File layout and names.
