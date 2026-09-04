#!/usr/bin/env node
/**
 * Live smoke test against the Amadeus WSAP.
 *
 * Talks to the real GDS, so it is gated behind AMADEUS_WS_SMOKE=true and must
 * never run in CI. With --booking it runs the whole chain: it creates a real
 * PNR on the test environment, prints it, and cancels it again. Read the output
 * rather than the exit code if you care about which step failed.
 *
 *   AMADEUS_WS_SMOKE=true node scripts/smoke-amadeus-ws.mjs
 *   AMADEUS_WS_SMOKE=true node scripts/smoke-amadeus-ws.mjs --booking
 *   AMADEUS_WS_SMOKE=true node scripts/smoke-amadeus-ws.mjs --booking --keep
 */
import 'dotenv/config';

if (process.env.AMADEUS_WS_SMOKE !== 'true') {
  console.error('Refusing to run: set AMADEUS_WS_SMOKE=true. This calls the live GDS.');
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const wantBooking = args.has('--booking');
const keep = args.has('--keep');

// Booking must be on for the chain regardless of how the environment is set,
// and auto-ticketing must be off: PDT has no ticketing stock configured.
if (wantBooking) {
  process.env.AMADEUS_WS_BOOKING_ENABLED = 'true';
  if (!args.has('--ticket')) process.env.AMADEUS_WS_AUTO_TICKET = 'false';
}

const { default: FlightProvider } = await import('../backend/services/amadeusSoap/index.js');
const { getWsConfig } = await import('../backend/services/amadeusSoap/config.js');

const ok = (label, extra = '') => console.log(`  \x1b[32mPASS\x1b[0m ${label}${extra ? ` - ${extra}` : ''}`);
const bad = (label, detail) => console.log(`  \x1b[31mFAIL\x1b[0m ${label} - ${detail}`);
const step = (label) => console.log(`\n\x1b[1m${label}\x1b[0m`);

const config = getWsConfig();
console.log(`WSAP ${config.wsap}  office ${config.officeId}  endpoint ${config.endpoint}`);

const dateIn = (days) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

let failures = 0;
const run = async (label, fn) => {
  const started = Date.now();
  try {
    const value = await fn();
    ok(label, `${Date.now() - started}ms`);
    return value;
  } catch (error) {
    failures += 1;
    bad(label, error?.technicalError || error?.error || error?.message);
    if (error?.step) console.log(`       failed at step: ${error.step}, committed: ${error.committed}`);
    return null;
  }
};

// ---- search ---------------------------------------------------------------
step('Search');
const search = await run('Fare_MasterPricerTravelBoardSearch', () => FlightProvider.searchFlights({
  from: 'DEL', to: 'BOM', departDate: dateIn(21), adults: 1,
}));

const offer = search?.data?.[0];
if (offer) {
  console.log(`       ${search.data.length} offers, first ${offer.price.currency} ${offer.price.total}`
    + ` on ${offer._ama.segments.map((s) => `${s.marketingCarrier}${s.flightNumber}/${s.rbd}`).join(' ')}`);
}

// ---- pricing --------------------------------------------------------------
if (offer) {
  step('Pricing');
  const priced = await run('Fare_InformativePricingWithoutPNR', () => FlightProvider.priceFlightOffer(offer));
  const po = priced?.data?.flightOffers?.[0];
  if (po) console.log(`       priced ${po.price.currency} ${po.price.total} (base ${po.price.base})`);
}

// ---- booking chain --------------------------------------------------------
let pnr = null;
if (wantBooking && offer) {
  step('Booking chain (creates a real PNR on this WSAP)');

  const order = await run('createFlightOrder', () => FlightProvider.createFlightOrder({
    data: {
      type: 'flight-order',
      flightOffers: [offer],
      travelers: [{
        id: '1',
        dateOfBirth: '1990-01-01',
        gender: 'MALE',
        name: { firstName: 'SMOKE', lastName: 'TEST' },
      }],
      contacts: [{
        emailAddress: 'smoke@example.com',
        phones: [{ deviceType: 'MOBILE', countryCallingCode: '1', number: '5555550100' }],
      }],
    },
  }, {
    bookingReference: `SMOKE-${Date.now()}`,
    onCommitted: async ({ pnr: committed }) => console.log(`       committed PNR ${committed}`),
  }));

  if (order) {
    pnr = order.pnr;
    console.log(`       PNR ${order.pnr}  mode ${order.mode}  ticketed ${order.ticketed}`);
    console.log(`       TSTs ${JSON.stringify(order.gds.tst_refs)}  queued ${order.gds.queued}`);
    console.log(`       priced ${order.gds.priced_currency} ${order.gds.priced_total}`);
  }

  if (pnr) {
    step('Retrieve');
    await run('PNR_Retrieve', () => FlightProvider.getFlightOrderDetails(pnr));
  }

  if (pnr && !keep) {
    step('Cancel (cleaning up the PNR this run created)');
    // Amadeus holds a brief lock on a record just committed by another session
    // and answers an immediate cancel with a bare 8111. Real cancellations
    // happen minutes or days later, so this pause is an artefact of the test
    // running the two back to back, not something the chain has to handle.
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await run('PNR_Cancel', () => FlightProvider.cancelFlightOrder(pnr));
  } else if (pnr) {
    console.log(`\n  Keeping PNR ${pnr} - cancel it yourself.`);
  }
}

console.log(failures === 0 ? '\n\x1b[32mAll steps passed.\x1b[0m' : `\n\x1b[31m${failures} step(s) failed.\x1b[0m`);
process.exit(failures === 0 ? 0 : 1);
