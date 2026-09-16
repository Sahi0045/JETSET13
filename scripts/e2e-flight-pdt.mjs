/**
 * End-to-end flight test against the Amadeus PDT test node.
 *
 * Search -> price -> pre-payment seat & fare check -> sell -> commit -> ticket
 * -> void -> cancel. Creates a REAL PNR and a REAL ticket on the test office
 * and always cleans both up.
 *
 * Run it with:  node scripts/e2e-flight-pdt.mjs
 *
 * REAL side effects. It sells seats, commits a PNR and issues a ticket on the
 * PDT office, then voids and cancels them in a `finally`. If the void ever
 * fails the summary prints the PNR and says LEFT ACTIVE - deal with that PNR
 * by hand, do not just re-run.
 *
 * It needs AMADEUS_WS_BOOKING_ENABLED and AMADEUS_WS_AUTO_TICKET true, which
 * they are locally and are NOT in production. Never point this at a production
 * WSAP: it would sell and ticket a real seat.
 *
 * What each case is for is in the comment above it; several exist because the
 * defect they name shipped once already (see
 * docs/audits/2026-09-16-flight-production-readiness-plan.md).
 */
import 'dotenv/config';

if (/prod/i.test(process.env.AMADEUS_WS_ENDPOINT || '') || !/test/i.test(process.env.AMADEUS_WS_ENDPOINT || '')) {
  console.error('Refusing to run: AMADEUS_WS_ENDPOINT is not the Amadeus test node.');
  process.exit(2);
}

const started = Date.now();
const at = () => `${String((Date.now() - started) / 1000).padStart(6)}s`;
const step = (n, msg, extra) => console.log(`${at()}  [${n}] ${msg}`, extra ? JSON.stringify(extra) : '');
const fail = (n, msg, extra) => console.log(`${at()}  [${n}] ✗ ${msg}`, extra ? JSON.stringify(extra) : '');

const results = [];
const record = (name, ok, detail) => { results.push({ name, ok, detail }); (ok ? step : fail)(name, ok ? 'PASS' : 'FAIL', detail); };

const provider = (await import('../backend/services/flightProvider.js')).default;
const { runBookingChain, cancelBooking, confirmSeats } = await import('../backend/services/amadeusSoap/bookingChain.js');

// Two months out, midweek: far enough that PDT reliably has fares.
const depart = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);

let pnr = null;

try {
  // ---- 1. Search ---------------------------------------------------------
  const search = await provider.searchFlights({
    originLocationCode: 'FRA',
    destinationLocationCode: 'JFK',
    departureDate: depart,
    adults: 1,
    travelClass: 'ECONOMY',
    currencyCode: 'USD',
    max: 40,
  });
  const offers = search?.data ?? [];
  record('search', offers.length > 0, { date: depart, offers: offers.length, meta: search?.meta ?? null });
  if (!offers.length) throw new Error('no offers');

  // Lufthansa tickets reliably on this office; prefer it, else take the first.
  const offer = offers.find((o) => o.validatingAirlineCodes?.[0] === 'LH') ?? offers[0];
  const carrier = offer.validatingAirlineCodes?.[0];
  const segs = offer.itineraries.flatMap((i) => i.segments);
  step('search', 'chose offer', {
    carrier,
    total: offer.price?.total,
    currency: offer.price?.currency,
    seats: offer.numberOfBookableSeats,
    segments: segs.map((s) => `${s.carrierCode}${s.number} ${s.departure.iataCode}-${s.arrival.iataCode}`),
  });

  // Seat count must never exceed 9 or be zero (the per-leg fix).
  const seats = Number(offer.numberOfBookableSeats);
  record('seat-count-sane', !Number.isFinite(seats) || (seats > 0 && seats <= 9), { seats });

  const searchedBag = offer.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.includedCheckedBags ?? null;

  // ---- 2. Price ----------------------------------------------------------
  const priced = await provider.priceFlightOffer(offer);
  const pricedOffer = priced?.data?.flightOffers?.[0];
  const total = Number(pricedOffer?.price?.total);
  record('price', Boolean(priced?.success) && Number.isFinite(total) && total > 0, {
    total: pricedOffer?.price?.total, currency: pricedOffer?.price?.currency,
  });

  // The fix from #140: pricing must not restamp the searched unit.
  const pricedBag = pricedOffer?.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.includedCheckedBags ?? null;
  const unitKept = !searchedBag?.weightUnit || !pricedBag?.weight || pricedBag.weightUnit === searchedBag.weightUnit;
  record('baggage-unit-survives-pricing', unitKept, { searched: searchedBag, priced: pricedBag });

  // Per-traveller prices must add up to the offer total (the #139 fix).
  const perPax = (pricedOffer?.travelerPricings ?? []).reduce((s, t) => s + Number(t.price?.total || 0), 0);
  record('traveller-prices-sum-to-total', Math.abs(perPax - total) < 0.51, { perPax: perPax.toFixed(2), total: total.toFixed(2) });

  // ---- 3. Pre-payment seat + fare check ----------------------------------
  const check = await confirmSeats(pricedOffer);
  const sold = check?.available === true && (check.statuses ?? []).every((s) => ['OK', 'KK', 'HK', 'SS'].includes(s));
  record('seat-check-confirms-availability', sold, { available: check?.available, statuses: check?.statuses });
  // The fare half: the airline must price the seats at what we are quoting.
  const quoted = Number(pricedOffer.price.total);
  const confirmedFare = Number(check?.fare?.adultTotal);
  record('fare-check-matches-quote', Number.isFinite(confirmedFare) && Math.abs(confirmedFare - quoted) < 0.51, {
    quoted: quoted.toFixed(2), airline: check?.fare?.adultTotal, currency: check?.fare?.currency,
  });

  // ---- 4. Book -----------------------------------------------------------
  const travelers = [{
    firstName: 'ENDTOEND', lastName: 'TESTER', gender: 'MALE',
    dateOfBirth: '1988-04-12', ptc: 'ADT',
  }];
  const bookingReference = `E2E${Date.now().toString().slice(-8)}`;

  const booked = await runBookingChain({
    offer: pricedOffer,
    travelers,
    contact: { email: 'e2e@example.com', phone: '12125550100', phoneCountryCode: '1' },
    bookingReference,
    expectedTotal: Number(pricedOffer.price.total),
    paidAmount: Number(pricedOffer.price.total) * 1.2,
    verifiedChargeTotal: Number(pricedOffer.price.total) * 1.2,
  });
  pnr = booked?.pnr ?? null;
  record('book', Boolean(pnr), { pnr, queued: booked?.queued, ticketed: booked?.ticketed });
  record('ticket', booked?.ticketed === true && (booked?.tickets?.length ?? 0) > 0, { tickets: booked?.tickets ?? [] });
  record('queued-to-90', booked?.queued === true, { queued: booked?.queued });

  // ---- 5b. A family, where a per-group price failure would hide ----------
  // The regression in #139 lived here: a reply whose CHILD group carried no
  // total priced at the adult's fare alone, and every "is there a price" gate
  // passed because the number was non-zero.
  const familySearch = await provider.searchFlights({
    originLocationCode: 'FRA', destinationLocationCode: 'JFK', departureDate: depart,
    adults: 1, children: 1, travelClass: 'ECONOMY', currencyCode: 'USD', max: 20,
  });
  const familyOffer = (familySearch?.data ?? []).find((o) => o.travelerPricings?.length === 2);
  if (!familyOffer) {
    step('family', 'skipped: no 2-traveller offer');
  } else {
    const familyPriced = (await provider.priceFlightOffer(familyOffer))?.data?.flightOffers?.[0];
    const famTotal = Number(familyPriced?.price?.total);
    const famPax = (familyPriced?.travelerPricings ?? []);
    const famSum = famPax.reduce((s, t) => s + Number(t.price?.total || 0), 0);
    record('family-prices-every-passenger', famPax.length === 2 && famPax.every((t) => Number(t.price?.total) > 0), {
      travellers: famPax.map((t) => `${t.travelerType}:${t.price?.total}`),
    });
    record('family-total-is-the-sum', Math.abs(famSum - famTotal) < 1.01, {
      total: famTotal.toFixed(2), sum: famSum.toFixed(2),
    });
  }

  // ---- 6. The refusal path -----------------------------------------------
  // A carrier this office may not ticket must never reach a customer: absent
  // from search, and refused by pricing if an old offer is replayed.
  const blocked = (await import('../backend/services/amadeusSoap/config.js')).getWsConfig().unticketableCarriers;
  const leaked = offers.filter((o) => blocked.includes(o.validatingAirlineCodes?.[0]));
  record('blocked-carriers-absent-from-search', leaked.length === 0, {
    blockedCount: blocked.length, hidden: search?.meta?.unticketableHidden ?? 0, leaked: leaked.length,
  });

  // And a fare the airline will not price must be refused, not sold.
  const jfk = await provider.searchFlights({
    originLocationCode: 'JFK', destinationLocationCode: 'LAX',
    departureDate: depart, adults: 1, travelClass: 'ECONOMY', currencyCode: 'USD', max: 40,
  });
  const b6 = (jfk?.data ?? []).find((o) => o.validatingAirlineCodes?.[0] === 'B6'
    && o.itineraries[0].segments.some((s) => /^3\d{3}$/.test(String(s.number))));
  if (!b6) {
    step('fare-refusal', 'skipped: no B6 3xxx offer in this search');
  } else {
    let refused = null;
    try {
      await confirmSeats(await provider.priceFlightOffer(b6).then((r) => r.data.flightOffers[0]));
    } catch (error) {
      refused = { code: error?.code, reason: (error?.technicalError || error?.message || '').slice(0, 90) };
    }
    record('unpriceable-fare-refused-before-payment', refused?.code === 409, refused ?? { refused: false });
  }
} catch (error) {
  fail('run', error?.technicalError || error?.message || String(error), {
    step: error?.step ?? null, code: error?.code ?? null, committed: error?.committed ?? null,
  });
  results.push({ name: 'run', ok: false, detail: error?.message });
  if (error?.pnr) pnr = error.pnr;
} finally {
  // ---- 5. Clean up: void the ticket and cancel the itinerary -------------
  if (pnr) {
    try {
      const cancelled = await cancelBooking(pnr);
      record('void-and-cancel', cancelled?.cancelled === true, {
        pnr, voided: cancelled?.voided, refundOwed: cancelled?.requiresAirlineRefund ?? [],
      });
    } catch (error) {
      fail('void-and-cancel', error?.technicalError || error?.message, { pnr, step: error?.step });
      results.push({ name: 'void-and-cancel', ok: false, detail: `${pnr} LEFT ACTIVE` });
    }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${'='.repeat(60)}\nE2E: ${passed}/${results.length} passed  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`);
  if (pnr) console.log(`  PNR used: ${pnr}`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
