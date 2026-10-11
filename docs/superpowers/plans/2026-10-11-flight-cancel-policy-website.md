# Flight Cancellation Policy (website + backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer who cancels a flight gets back what the industry rule says (free first 24 hours less our service fee, then the airline's fare rules), sees the amount before confirming, and the website says so everywhere.

**Architecture:** One dependency-free module, `shared/flightCancelPolicy.js`, holds the rule and its words. The cancel route feeds it server facts (the booking's `created_at`, `verified_charge`, the airline's fare rules read from the PNR before cancelling, the flight cancellation fee setting) through a new `customer` branch of `decideFlightRefund`. Staff and server cancels keep today's branch. A quote route returns the same terms before the cancel; the website renders them.

**Tech Stack:** Node/Express (ES modules), Supabase, Vitest (node + jsdom projects), React 18 + TanStack Query.

**Spec:** `docs/superpowers/specs/2026-10-11-flight-cancel-policy-design.md`

## Global Constraints

- Customer cancels only: `customer = !isStaff && req[SYSTEM_CANCEL] !== true`. Staff/server cancels keep today's decisions.
- The 24 hours run from the booking row's `created_at`, measured at the moment the cancel request arrived.
- Service fee kept = `verified_charge.serviceFee - verified_charge.discount`, never below 0; no `verified_charge` keeps 0.
- After 24 hours a ticketed customer cancel never refunds automatically: review.
- Flight cancellation fee = `flight_cancellation_fee ?? cancellation_fee ?? 50` from the stored settings.
- No new comments on routine code (user rule); comment only hidden constraints or money/security reasons.
- Never stage `CLAUDE.md` or `frontend/src/Pages/Common/Navbar.jsx` (the owner's uncommitted edits).
- Tests: `npm run test:unit` (never `npm test`: the integration project writes to the shared production DB).
- Brand colours only (`#055B75`, `#034457`, `#0890BC`, `#65B3CF`, `#F1FBFD`); no generic blues.

## Review Focus

1. A customer cancel that crosses the 24-hour mark while the airline call runs: the window is judged at the request, so the customer keeps the free window they pressed in.
2. A coupon larger than the service fee: nothing is kept and the refund never exceeds what the gateway holds.
3. The fare rules cannot be read (Amadeus down, timeout, no TST): the cancel still goes through and lands in review with `rules_unknown`; it is never blocked or refunded automatically.
4. A refund that kept a service fee and then went unanswered at ARC: the customer gets the generic "being reviewed" words, not the policy words (policy words only for a review the policy decided).
5. A guest (email-only) opening the quote: same access as the booking itself; a stranger gets 404.

---

### Task 1: The policy module

**Files:**
- Create: `shared/flightCancelPolicy.js`
- Test: `tests/utils/flightCancelPolicy.test.js`

**Interfaces:**
- Produces: `FREE_CANCEL_HOURS`, `serviceFeeKeptOf(charge) -> number|null`, `freeUntilOf(paidAt) -> string|null`, `isWithinFreeWindow(paidAt, now) -> boolean`, `fareRuleOf(penalties) -> { refundable: boolean|null, penalty: number|null, currency: string|null }`, `customerCancelTerms({ charge, paidAt, now, hasReservation, ticketed, fareRule, cancellationFee }) -> terms`, `cancelTermsLines(terms, { money, time }) -> string[]`, `cancelPolicyLines({ cancellationFee, money }) -> string[]`, `CUSTOMER_REVIEW_POLICIES`.
- terms: `{ policy, automatic, paid, serviceFeeKept, airlinePrice, refundAmount, penalty, penaltyCurrency, cancellationFee, freeUntil }`.

- [ ] **Step 1: Write the failing tests** covering: service fee less discount (12.5 - 0 = 12.5; 12.5 - 20 = 0; missing serviceFee -> null); `freeUntilOf('2026-10-11T10:00:00.000Z')` = `'2026-10-12T10:00:00.000Z'`, invalid -> null; window true at +23h59m, false at +24h, false for missing `paidAt`; `fareRuleOf` for allowed false / allowed true with amount 150 USD / allowed true with no amount / no table; terms for each policy (never_booked returns everything, not_ticketed and free_window return `paid - kept` and are automatic, not_ticketed wins over the window, after-window refundable/non_refundable/rules_unknown are not automatic and carry penalty and fee only when refundable); no `verified_charge` keeps 0; every exact sentence of `cancelTermsLines` and `cancelPolicyLines` from the spec, including the variants with no service fee kept, no penalty amount, a $0 cancellation fee, and `freeUntil` formatted by the given `time`.

- [ ] **Step 2: Run** `npx vitest run tests/utils/flightCancelPolicy.test.js` - Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `shared/flightCancelPolicy.js`:

```js
export const FREE_CANCEL_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;

export const CUSTOMER_REVIEW_POLICIES = Object.freeze(['not_voided', 'refundable', 'non_refundable', 'rules_unknown']);

const known = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const cents = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const timeOf = (value) => (value instanceof Date ? value.getTime() : Date.parse(value ?? ''));

const usd = (amount, currency = 'USD') => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
  } catch {
    return `${currency || ''} ${Number(amount).toFixed(2)}`.trim();
  }
};
const clock = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function serviceFeeKeptOf(charge) {
  if (!charge || !known(charge.serviceFee)) return null;
  const discount = known(charge.discount) ? Math.max(0, Number(charge.discount)) : 0;
  return cents(Math.max(0, Number(charge.serviceFee) - discount));
}

export function freeUntilOf(paidAt) {
  const start = timeOf(paidAt);
  return Number.isFinite(start) ? new Date(start + FREE_CANCEL_HOURS * HOUR_MS).toISOString() : null;
}

export function isWithinFreeWindow(paidAt, now = new Date()) {
  const until = freeUntilOf(paidAt);
  const at = timeOf(now);
  return until !== null && Number.isFinite(at) && at < Date.parse(until);
}

export function fareRuleOf(penalties) {
  const cell = penalties?.refund?.before;
  const refundable = cell?.allowed === true ? true : cell?.allowed === false ? false : null;
  const penalty = refundable === true && known(cell?.amount) ? cents(cell.amount) : null;
  return { refundable, penalty, currency: penalty === null ? null : (penalties?.currency || null) };
}

export function customerCancelTerms({ charge, paidAt, now = new Date(), hasReservation, ticketed, fareRule = null, cancellationFee = null } = {}) {
  const paid = known(charge?.total) ? cents(charge.total) : null;
  const serviceFeeKept = serviceFeeKeptOf(charge) ?? 0;
  const airlinePrice = paid === null ? null : cents(Math.max(0, paid - serviceFeeKept));
  const base = { paid, serviceFeeKept, airlinePrice, penalty: null, penaltyCurrency: null, cancellationFee: null, freeUntil: freeUntilOf(paidAt) };

  if (!hasReservation) return { ...base, policy: 'never_booked', automatic: true, serviceFeeKept: 0, airlinePrice: paid, refundAmount: paid };
  if (!ticketed) return { ...base, policy: 'not_ticketed', automatic: true, refundAmount: airlinePrice };
  if (isWithinFreeWindow(paidAt, now)) return { ...base, policy: 'free_window', automatic: true, refundAmount: airlinePrice };
  if (fareRule?.refundable === false) return { ...base, policy: 'non_refundable', automatic: false, refundAmount: null };
  if (fareRule?.refundable === true) {
    return {
      ...base,
      policy: 'refundable',
      automatic: false,
      refundAmount: null,
      penalty: fareRule.penalty ?? null,
      penaltyCurrency: fareRule.currency ?? null,
      cancellationFee: known(cancellationFee) ? cents(cancellationFee) : null,
    };
  }
  return { ...base, policy: 'rules_unknown', automatic: false, refundAmount: null };
}

export function cancelTermsLines(terms, { money = usd, time = clock } = {}) {
  if (!terms?.policy) return [];
  const back = known(terms.airlinePrice) ? money(terms.airlinePrice) : 'what you paid';
  const kept = Number(terms.serviceFeeKept) > 0 ? money(terms.serviceFeeKept) : null;
  const youGetBack = `You get back ${back}${kept ? `; the ${kept} service fee is not refundable.` : '.'}`;
  switch (terms.policy) {
    case 'never_booked':
      return ['This booking was never confirmed with the airline, so everything you paid is returned.'];
    case 'not_ticketed':
      return [`No ticket has been issued yet. ${youGetBack}`];
    case 'free_window':
      return [
        `You are within 24 hours of booking${terms.freeUntil ? ` (until ${time(terms.freeUntil)})` : ''}. ${youGetBack}`,
        `If the airline no longer lets us void the ticket, our team claims the refund from the airline and returns what it gives back${kept ? ', less the service fee' : ''}.`,
      ];
    case 'refundable': {
      const penalty = known(terms.penalty) ? ` of ${money(terms.penalty, terms.penaltyCurrency || 'USD')} per adult` : '';
      const fee = Number(terms.cancellationFee) > 0 ? ` and our ${money(terms.cancellationFee)} cancellation fee` : '';
      return [
        `This fare is refundable. You get back ${back} less the airline's cancellation penalty${penalty}${fee}.`,
        ...(kept ? [`The ${kept} service fee is not refundable.`] : []),
        'Our team confirms the amount with the airline and emails you within 2 business days.',
      ];
    }
    case 'non_refundable':
      return [
        'This fare is non-refundable, so the fare is not returned.',
        'Our team checks with the airline for any unused taxes and emails you within 2 business days.',
      ];
    default:
      return ["We could not read this fare's rules just now. Our team checks them with the airline and emails you within 2 business days to confirm what is returned."];
  }
}

export function cancelPolicyLines({ cancellationFee = null, money = usd } = {}) {
  const fee = Number(cancellationFee) > 0 ? ` and our ${money(cancellationFee)} cancellation fee` : '';
  return [
    'Cancel within 24 hours of booking and you get back the airline price. The service fee is not refundable.',
    `After 24 hours the airline's fare rules apply: a refundable fare returns the airline price less the airline's penalty${fee}; a non-refundable fare returns only unused taxes.`,
    'If the airline cancels or changes your flight, you get back everything you paid.',
  ];
}
```

- [ ] **Step 4: Run** the test file - Expected: PASS.
- [ ] **Step 5: Commit** `feat(flights): the customer cancellation rule, in one shared module`.

### Task 2: The flight cancellation fee setting

**Files:**
- Modify: `backend/config/priceDefaults.js` (add `flight_cancellation_fee: 50.00`, export `flightCancellationFeeFrom`)
- Modify: `backend/routes/admin.routes.js` (GET merge sets the resolved value; `getServiceDefaults('flights')` adds `cancellation_fee`)
- Modify: `backend/routes/payment/operations.handlers.js` (export `readFlightCancellationFee`; flight cancels read it)
- Modify: `frontend/src/Pages/Admin/PriceSettings.jsx` (Flights tab field), `frontend/src/Pages/Admin/BookingsList.jsx` (reads `price-config/flights`)
- Test: `tests/backend/flightCancellationFeeSetting.test.js`

**Interfaces:**
- Produces: `flightCancellationFeeFrom(storedSettings) -> number`, `readFlightCancellationFee() -> Promise<number>`.

- [ ] **Step 1: Failing tests:** `flightCancellationFeeFrom({})` = 50; `({ cancellation_fee: 30 })` = 30; `({ cancellation_fee: 30, flight_cancellation_fee: 0 })` = 0; `({ flight_cancellation_fee: -5, cancellation_fee: 30 })` = 30; GET `/api/admin/price-settings` with stored `{ cancellation_fee: 30 }` answers `flight_cancellation_fee: 30`; GET `/api/admin/price-config/flights` answers `cancellation_fee: 30`; PUT accepts `flight_cancellation_fee`; a staff flight cancel of voided tickets with stored `{ cancellation_fee: 50, flight_cancellation_fee: 20 }` refunds less 20 (harness of `tests/backend/cancelFlightRefund.test.js`, caller staff via the `getCaller` path that file's staff tests use).
- [ ] **Step 2: Run** - Expected: FAIL.
- [ ] **Step 3: Implement**

```js
// backend/config/priceDefaults.js
const usableFee = (raw) => {
  if (raw === null || raw === undefined || raw === '') return null;
  const fee = Number(raw);
  return Number.isFinite(fee) && fee >= 0 ? fee : null;
};

export function flightCancellationFeeFrom(settings) {
  return usableFee(settings?.flight_cancellation_fee) ?? usableFee(settings?.cancellation_fee) ?? DEFAULT_PRICE_SETTINGS.cancellation_fee;
}
```

GET `/price-settings`: after `mergedSettings`, set `mergedSettings.flight_cancellation_fee = flightCancellationFeeFrom(settings.settings)` (the stored row, so a general fee someone saved is not hidden by the default). `getServiceDefaults('flights', all)`: add `cancellation_fee: flightCancellationFeeFrom(all)`.

`operations.handlers.js`: `readFlightCancellationFee()` mirrors `readCancellationFee()` with `flightCancellationFeeFrom`; the flight cancel's `fee: await readCancellationFee()` becomes `fee: flightFee` read once at the top of the decision step. `cancelOtherBooking` keeps `readCancellationFee`.

Admin Flights tab: an `InputField` "Cancellation Fee", suffix USD, description "Kept when a customer cancels a flight after the first 24 hours, on top of the airline's own penalty", bound to `flight_cancellation_fee`; add the key (50) to both local default objects. BookingsList fetches `admin/price-config/flights`.
- [ ] **Step 4: Run** the new file and `tests/backend/cancelFlightRefund.test.js` - Expected: PASS.
- [ ] **Step 5: Commit** `feat(flights): a cancellation fee for flights, set in the admin panel`.

### Task 3: The refundable flag comes from the server's pricing

**Files:**
- Modify: `backend/services/flightCheckout.service.js` (`pricedFare.refundable`)
- Modify: `backend/routes/flight.routes.js:~4000`
- Test: `tests/backend/orderRecordsPricedFare.test.js`, `tests/backend/flightCheckout.test.js`

- [ ] **Step 1: Failing tests:** checkout records `pricedFare.refundable` from the priced offer's `_ama.refundable` (true / false / missing -> null); the order route, re-pricing failed, browser offer `_ama.refundable: true`, checkout recorded `false` -> stored `false`; recorded nothing -> stored `null`; re-pricing succeeded with `_ama.refundable: true` -> stored `true`.
- [ ] **Step 2: Run** - Expected: FAIL on the browser value being stored.
- [ ] **Step 3: Implement**

```js
// flightCheckout.service.js, in pricedFare
refundable: typeof priced?._ama?.refundable === 'boolean' ? priced._ama.refundable : null,

// flight.routes.js, the booking row
refundable: [repriced ? pricedOffer?._ama?.refundable : undefined, verifiedCharge?.pricedFare?.refundable]
  .find((value) => typeof value === 'boolean') ?? null,
```

with a comment that the browser's offer is never trusted for this (money: it decided automatic refunds).
- [ ] **Step 4: Run** both files - Expected: PASS.
- [ ] **Step 5: Commit** `fix(flights): record whether a fare is refundable from our pricing, never the browser's offer`.

### Task 4: The booked fee table read, shared

**Files:**
- Create: `backend/services/bookedFeeTable.service.js`
- Modify: `backend/routes/flight.routes.js` (fee-rules route uses it)
- Test: `tests/backend/bookedFeeTableService.test.js`; existing `tests/backend/bookedFeeRulesRoute.test.js` stays green

**Interfaces:**
- Produces: `readBookedFeeTable(booking) -> Promise<penalties|null>` (never throws), `bookedFeeTableKey(ref)`, `BOOKED_FEE_TABLE_TTL_SECONDS`.

- [ ] **Step 1: Failing tests:** no PNR -> null without calling the provider; cached -> cached, no provider call; provider answer cached 6 h; provider throws -> null; null answer not cached.
- [ ] **Step 2: Run** - Expected: FAIL.
- [ ] **Step 3: Implement** with the route's current logic moved verbatim; the route calls `readBookedFeeTable(booking)`.
- [ ] **Step 4: Run** both files - Expected: PASS.
- [ ] **Step 5: Commit** `refactor(flights): one reader for a booked trip's fee table`.

### Task 5: The customer branch of the refund decision

**Files:**
- Modify: `backend/routes/payment/operations.handlers.js` (`decideFlightRefund`)
- Test: `tests/backend/customerCancelDecision.test.js`

**Interfaces:**
- Consumes: Task 1's policy names.
- Produces: `decideFlightRefund({ ..., customer })` with `customer: { freeWindow, serviceFeeKept, fareRule, cancellationFee }`; results gain `policy` and `serviceFeeKept` on the customer branch.

- [ ] **Step 1: Failing tests** (pure): no reservation -> `refund_all`, `never_booked`; reservation not ticketed, kept 12.5, held 300 -> `refund_less_fee` fee 12.5 refund 287.5 `not_ticketed`; kept 0 -> `refund_all`; voided in window -> `refund_less_fee` `free_window`; unvoided in window -> review `not_voided`; after window voided non-refundable -> review `non_refundable`; refundable -> review `refundable` with the airline price, penalty and fee in the reason; unknown -> review `rules_unknown`; the safety reviews (part refunded, airline did not say, row ticketed but airline shows none) still win and carry no `policy`; without `customer` every existing case is unchanged (voided -> `refund_less_fee` with the fee; refundable unvoided -> `refund_less_fee`).
- [ ] **Step 2: Run** - Expected: FAIL.
- [ ] **Step 3: Implement**: in the not-ticketed branch, `customer && hasReservation` -> `keepServiceFee(...)`, `customer && !hasReservation` -> today's `refund_all` plus `policy: 'never_booked'`; after the "no void and no claim" review, `if (customer) return customerTicketedDecision(...)`. Helpers:

```js
function keepServiceFee(heldCents, customer, policy, basis) {
    const keptCents = Math.round((Number(customer.serviceFeeKept) || 0) * 100);
    if (keptCents <= 0) return { action: 'refund_all', fee: 0, refundAmount: heldCents / 100, reason: basis, policy, serviceFeeKept: 0 };
    if (keptCents >= heldCents) return { action: 'fee_covers', fee: heldCents / 100, refundAmount: 0, reason: `${basis}; the service fee covers the payment`, policy, serviceFeeKept: heldCents / 100 };
    return { action: 'refund_less_fee', fee: keptCents / 100, refundAmount: (heldCents - keptCents) / 100, reason: `${basis}; the service fee is kept`, policy, serviceFeeKept: keptCents / 100 };
}
```

`customerTicketedDecision` returns the reviews with reasons naming: the airline price (held less kept), the penalty per adult (or "not stated"), the flight cancellation fee, the kept service fee, and whether the tickets were voided ("nothing is owed to the airline") or must be claimed.
- [ ] **Step 4: Run** the new file and `tests/backend/cancelFlightRefund.test.js` - Expected: PASS.
- [ ] **Step 5: Commit** `feat(flights): a customer's cancel follows the 24-hour and fare-rule policy`.

### Task 6: The cancel route applies it

**Files:**
- Modify: `backend/routes/payment/operations.handlers.js` (`handleCancelBookingAction`, `cancelFlightBooking`, `sendCancellationEmail`)
- Test: `tests/backend/customerCancelPolicy.test.js` (harness copied from `cancelFlightRefund.test.js`), then every existing cancel test that changes

- [ ] **Step 1: Failing tests** through the handler: guest customer (email match) of a held PNR created now with `verified_charge { total: 300, serviceFee: 12.5, discount: 0 }` -> ARC REFUND of 287.50, record `policy: 'not_ticketed'`, `terms.serviceFeeKept: 12.5`; voided tickets created 2 h ago -> REFUND 287.50 `free_window`; voided created 30 h ago with a fee table saying non-refundable -> no ARC write, `REFUND_UNDER_REVIEW`, `policy: 'non_refundable'`, the fare rules read BEFORE `cancelFlightOrder` (call order); fee table unreadable -> `rules_unknown`, cancel still completes; a staff caller on the same 30 h voided booking -> today's refund less the flight fee, no `policy`; a `SYSTEM_CANCEL` caller likewise; the window judged at the request (fake timers: created 23h59m50s ago, airline cancel takes 20 s -> still `free_window`).
- [ ] **Step 2: Run** - Expected: FAIL.
- [ ] **Step 3: Implement**: `customer: !isStaff && req[SYSTEM_CANCEL] !== true` into `cancelFlightBooking`; `requestedAt = new Date()` at its entry; after the gateway check and before releasing the seats, for a customer: `freeWindow`, `fareRule` (read only with a PNR outside the window), `serviceFeeKept`; `decideFlightRefund({ ..., fee: flightFee, customer: customerTerms })`; `cancellationResult` and the stored `cancellation` gain `policy` and `terms: { serviceFeeKept, airlinePrice, cancellationFee, penalty, penaltyCurrency }` when the customer branch decided; the email data passes `policy` and `terms`.
- [ ] **Step 4: Run** `npm run test:unit > $WS/t6.log 2>&1; tail -40 $WS/t6.log`. Every failure in an existing cancel test gets one of two rulings, ledgered per file: the test is about the refund mechanics (ARC writes, races, alarms) -> its caller becomes staff so it keeps testing them; the test is about what a customer is owed -> its expectation moves to the new rule. Never delete an assertion.
- [ ] **Step 5: Commit** `feat(flights): customer cancels refund by the policy; staff cancels unchanged`.

### Task 7: The quote

**Files:**
- Modify: `backend/routes/payment/operations.handlers.js` (export `quoteCustomerCancel`), `backend/routes/flight.routes.js` (route)
- Test: `tests/backend/cancelQuoteRoute.test.js` (harness of `bookedFeeRulesRoute.test.js`)

- [ ] **Step 1: Failing tests:** stranger -> 404; cancelled -> `quote: null`; hotel -> `quote: null`; held PNR created now -> `not_ticketed` with `refundAmount: 287.5`; ticketed 30 h ago with a non-refundable table -> `non_refundable`; ticketed in window -> `free_window` without reading the fee table; guest with `x-booking-email` -> the quote.
- [ ] **Step 2: Run** - Expected: FAIL (404 route missing).
- [ ] **Step 3: Implement** `quoteCustomerCancel(booking, { now })` from the row (ticketed = recorded ticket or voided tickets on the row) and the route beside fee-rules with the same guards.
- [ ] **Step 4: Run** - Expected: PASS.
- [ ] **Step 5: Commit** `feat(flights): what a cancel would return, before the customer confirms`.

### Task 8: The words after a cancel

**Files:**
- Modify: `shared/cancellationOutcome.js`, `backend/services/email/templates.js`
- Test: `tests/backend/cancellationOutcome.test.js`, `tests/backend/emailTemplates.test.js`

- [ ] **Step 1: Failing tests:** refunded with `policy` `not_ticketed`/`free_window` and `terms.serviceFeeKept: 12.5` -> "(the $12.50 service fee is not refundable)" and no "cancellation fee"; review with each customer policy -> its sentence; review with `free_window` (an unanswered reversal) -> today's generic sentence; email: refunded row "Service fee (not refundable)", review body the policy sentence; everything without `policy` unchanged.
- [ ] **Step 2: Run** - Expected: FAIL.
- [ ] **Step 3: Implement** with `CUSTOMER_REVIEW_POLICIES` and `cancelTermsLines` from Task 1 for the review sentences (`terms` carries what they need).
- [ ] **Step 4: Run** - Expected: PASS.
- [ ] **Step 5: Commit** `feat(flights): the cancellation message and email say which rule applied`.

### Task 9: Manage Booking shows the quote

**Files:**
- Modify: `frontend/src/hooks/queries/useFlights.js` (`fetchCancelQuote`, `useCancelQuote`), `shared/ifYouCancel.js` (takes the quote), `frontend/src/Pages/Common/flights/BookingCancelRules.jsx`, `frontend/src/Pages/Common/flights/ManageBooking.jsx`
- Create: `frontend/src/Pages/Common/flights/CancelQuote.jsx`
- Test: `tests/utils/ifYouCancel.test.js`, `tests/components/bookingCancelRules.test.jsx`, `tests/components/cancelQuote.test.jsx`; add `useCancelQuote: () => ({ isLoading: false, data: null })` to the 14 Manage Booking test mocks

- [ ] **Step 1: Failing tests:** `ifYouCancel({ quote, penalties, airline, fee })` = `cancelTermsLines(quote)` then "{Airline}'s rules for this fare: ..." (ticketed policies) or "Once the ticket is issued, {airline}'s rules apply: ..." (`not_ticketed`), none for `never_booked`; no quote -> "We could not work out your refund just now. You will see what happens to your payment as soon as the cancellation completes."; `CancelQuote` renders a loading line, the lines, or the fallback; the tab shows the quote's lines.
- [ ] **Step 2: Run** - Expected: FAIL.
- [ ] **Step 3: Implement**: `useCancelQuote(bookingId, { email, enabled })` (staleTime 0, `retry: false`); Manage Booking enables it when the dialog is open or the Cancel & change tab is, and `canCancelOnline`; the dialog's ticket-state bullets become `<CancelQuote query={cancelQuote} />`; `BookingCancelRules` takes `quote` and passes it to `ifYouCancel`.
- [ ] **Step 4: Run** `npm run test:unit` - Expected: PASS.
- [ ] **Step 5: Commit** `feat(flights): Manage Booking shows what a cancel returns before you confirm`.

### Task 10: The review page states the policy

**Files:**
- Create: `frontend/src/Pages/Common/flights/CancellationPolicyNote.jsx`
- Modify: `frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx` (under the Service Fee line, and in the Baggage & Fare Rules card)
- Test: `tests/components/cancellationPolicyNote.test.jsx`

- [ ] **Step 1: Failing tests:** the note renders the three `cancelPolicyLines` with the fee from the price settings ($50, $0 drops the fee words); the Service Fee line reads "Not refundable".
- [ ] **Step 2: Run** - Expected: FAIL.
- [ ] **Step 3: Implement** with `priceConfig?.flight_cancellation_fee`.
- [ ] **Step 4: Run** `npm run test:unit` and `npm run build` - Expected: PASS, build OK.
- [ ] **Step 5: Commit** `feat(flights): the review page states the cancellation policy before payment`.
