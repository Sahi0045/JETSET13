#!/usr/bin/env node
/**
 * Run the Amadeus certification test cases and record the evidence.
 *
 * Amadeus sent "Certification Test Cases Jetsetters Corporation.xlsx"
 * (Daniela Salas, 18 Sep 2026) after reviewing our kickoff logs: 24 scenarios,
 * of which we complete the ones our implementation covers - five is enough -
 * and return the sheet with, per case, the Session ID, the time in GMT, the
 * sequence number, the session type, the services used, and the XML evidence
 * in a folder per test case.
 *
 * So this is not the fixture recorder. That one proves an operation was
 * exercised; this one answers a named scenario and reports the identifiers
 * Amadeus needs to find the same calls in their own ALF logs.
 *
 *   AMADEUS_WS_RECORD=true node scripts/certification-testcases.mjs --case=2
 *   AMADEUS_WS_RECORD=true node scripts/certification-testcases.mjs --case=all
 *
 * The Session ID and sequence number are REAL in the summary, because they are
 * how Amadeus looks the session up. Only the security token, the password
 * digest and the nonce are masked, and the recorded XML is redacted the same
 * way the kickoff pack was.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import axios from 'axios';
import { refuseUnlessTestNode } from './lib/gdsGuard.mjs';

if (process.env.AMADEUS_WS_RECORD !== 'true') {
  console.error('Refusing to run: set AMADEUS_WS_RECORD=true. This calls the live GDS.');
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const which = String(flag('case', 'all'));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(ROOT, flag('out', 'certification-evidence'));

refuseUnlessTestNode('running the certification test cases');
process.env.AMADEUS_WS_BOOKING_ENABLED = 'true';
process.env.AMADEUS_WS_AUTO_TICKET = 'true';

const { default: FlightProvider } = await import('../backend/services/amadeusSoap/index.js');
const { getWsConfig } = await import('../backend/services/amadeusSoap/config.js');
const { OPERATIONS, STATELESS_OPERATIONS } = await import('../backend/services/amadeusSoap/codes.js');
const { createRedactor } = await import('./lib/redact-evidence.mjs');

const { redact } = createRedactor();
const config = getWsConfig();

/* ── Capture ────────────────────────────────────────────────────────────── */

const actionToName = new Map(Object.values(OPERATIONS).map((op) => [op.action, op]));
const text = (xml, tag) => {
  const m = String(xml ?? '').match(new RegExp(`<(?:\\w+:)?${tag}>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'i'));
  return m ? m[1].trim() : null;
};
/** Start | InSeries | End, as Amadeus labels the session on each reply. */
const sessionStatus = (xml) => {
  const m = String(xml ?? '').match(/TransactionStatusCode="([^"]+)"/i);
  return m ? m[1] : null;
};

let current = null; // the test case being recorded

const realPost = axios.post.bind(axios);
axios.post = async (url, data, cfg) => {
  const started = new Date();
  const response = await realPost(url, data, cfg);
  const op = actionToName.get(cfg?.headers?.SOAPAction);
  const reply = String(response.data ?? '');
  const call = {
    seq: (current?.calls.length ?? 0) + 1,
    operation: op?.name ?? 'Unknown',
    version: op ? op.suffix.replace(/^[A-Z]+_/, '').replace(/_1?[A-Z]$/, '').replace('_', '.') : null,
    at: started.toISOString(),
    durationMs: Date.now() - started.getTime(),
    // Real, and the point of the exercise: Amadeus finds the session by these.
    sessionId: text(reply, 'SessionId') || text(String(data ?? ''), 'SessionId'),
    sequenceNumber: text(reply, 'SequenceNumber') || text(String(data ?? ''), 'SequenceNumber'),
    sessionStatus: sessionStatus(reply),
    error: text(reply, 'error') || text(reply, 'errorCode') || null,
    request: String(data ?? ''),
    reply,
  };
  if (current) current.calls.push(call);
  return response;
};

/* ── Helpers ────────────────────────────────────────────────────────────── */

const dateIn = (days) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const note = (msg) => console.log(`  ${msg}`);
const attempt = async (label, fn) => {
  try {
    const value = await fn();
    note(`${label} ok`);
    return value;
  } catch (error) {
    note(`${label} refused — ${error?.technicalError || error?.error || error?.message}`);
    return { refused: error?.technicalError || error?.error || error?.message, code: error?.code ?? null };
  }
};

/** A traveller as the order payload wants them. */
const traveller = (id, first, last, dob, ptc, gender = 'MALE') => ({
  id: String(id),
  ptc,
  gender,
  dateOfBirth: dob,
  name: { firstName: first, lastName: last },
  documents: [{
    documentType: 'PASSPORT', number: 'X1234567', nationality: 'GB',
    issuanceCountry: 'GB', expiryDate: '2030-12-25', holder: true,
  }],
});

/**
 * The booking options a certification run needs.
 *
 * The chain refuses to sell a seat it cannot see a captured payment for - the
 * guard that stops a tampered "$1" charge buying a full-price ticket. There is
 * no ARC payment behind a certification run, so the fare itself is passed as
 * the amount paid. Nothing here reaches the live office: the script refuses to
 * run anywhere but the test node.
 */
const bookingOptions = (offer, reference) => ({
  bookingReference: reference,
  expectedTotal: Number(offer.price?.total) || undefined,
  paidAmount: Number(offer.price?.total) || undefined,
  verifiedChargeTotal: Number(offer.price?.total) || undefined,
});

const contacts = [{
  emailAddress: 'certification@jetsetterss.com',
  phones: [{ deviceType: 'MOBILE', countryCallingCode: '1', number: '5555550100' }],
}];

/** The Lufthansa offer on a route this office may plate and ticket. */
const ticketableOffer = (result) => (result?.data ?? [])
  .find((o) => o.validatingAirlineCodes?.[0] === 'LH') ?? result?.data?.[0] ?? null;

/* ── The test cases ─────────────────────────────────────────────────────── */

const CASES = {
  2: {
    title: 'Search 2 ADT',
    slug: '2-Search-2ADT',
    scenario: 'Search a round trip for 2 adults (Fare_MasterPricerTravelBoardSearch).',
    comment: 'Stateless search. JFK-LHR round trip, 2 adults, economy. One Master Pricer query, 50 recommendations requested.',
    run: async () => {
      const search = await attempt('search 2 ADT', () => FlightProvider.searchFlights({
        from: 'JFK', to: 'LHR', departDate: dateIn(35), returnDate: dateIn(42), adults: 2,
      }));
      return { offers: search?.data?.length ?? 0 };
    },
  },

  7: {
    title: 'Book a round trip for 1 ADT in business class',
    slug: '7-Book-RoundTrip-1ADT-Business',
    scenario: 'Book a Master Pricer recommendation for 1 adult in business class, round trip.',
    comment: 'Search in business class. Review page: the price and the fare rules from ONE stateful session (Fare_InformativePricingWithoutPNR, then Fare_CheckRules on that pricing). Checkout, before the card is charged: a stateless price check, then the seats confirmed (Air_SellFromRecommendation + Fare_PricePNRWithBookingClass) in a session signed out without committing. After payment: a final stateless price check, then the booking chain: sell, PNR elements, FOP, price with booking class, TST, commit, queue, ticket, retrieve.',
    run: async () => {
      const search = await attempt('search business 1 ADT', () => FlightProvider.searchFlights({
        from: 'JFK', to: 'LHR', departDate: dateIn(35), returnDate: dateIn(42), adults: 1, travelClass: 'BUSINESS',
      }));
      const offer = ticketableOffer(search);
      if (!offer) return { skipped: 'no offer' };
      // The review page, as /flights/price with withFareRules answers it. It
      // used to price statelessly beside this session too - the duplicate
      // Amadeus's review of this case (24 Sep 2026) pointed out.
      await attempt('review page: price and fare rules in one session', () => FlightProvider.getFiledFareRules(offer, { refuseUnbookable: true }));
      // Checkout, as flightCheckout.service asks /flights/price with confirmSeats.
      const checkedOut = await attempt('checkout: price check', () => FlightProvider.priceFlightOffer(offer));
      await attempt('checkout: seat check', () => FlightProvider.confirmSeats(checkedOut?.data?.flightOffers?.[0] ?? offer));
      // The order route prices once more and books the offer it priced.
      const repriced = await attempt('order: price check', () => FlightProvider.priceFlightOffer(offer));
      const booked = repriced?.data?.flightOffers?.[0] ?? offer;
      const order = await attempt('book', () => FlightProvider.createFlightOrder({
        data: {
          type: 'flight-order',
          flightOffers: [booked],
          travelers: [traveller(1, 'JOHN', 'CERTONE', '1990-01-01', 'ADULT')],
          contacts,
        },
      }, bookingOptions(booked, `CERT7-${Date.now()}`)));
      if (order?.pnr) await attempt('retrieve', () => FlightProvider.getFlightOrderDetails(order.pnr));
      return { pnr: order?.pnr ?? null, ticketed: order?.ticketed ?? false, tickets: (order?.tickets ?? []).map((t) => t.number) };
    },
  },

  9: {
    title: 'Issue tickets for a multi-passenger PNR (2ADT, 1CH, 1INF)',
    slug: '9-Ticket-2ADT-1CH-1INF',
    scenario: 'Book and issue tickets for 2 adults, 1 child and 1 infant.',
    comment: 'One PNR for four passengers: the infant is held on an adult. DocIssuance_IssueTicket issues for every passenger, then PNR_Retrieve reads the ticket numbers back.',
    run: async () => {
      const search = await attempt('search 2ADT 1CH 1INF', () => FlightProvider.searchFlights({
        from: 'JFK', to: 'LHR', departDate: dateIn(35), adults: 2, children: 1, infants: 1,
      }));
      const offer = ticketableOffer(search);
      if (!offer) return { skipped: 'no offer' };
      const order = await attempt('book and ticket', () => FlightProvider.createFlightOrder({
        data: {
          type: 'flight-order',
          flightOffers: [offer],
          travelers: [
            traveller(1, 'JOHN', 'CERTTWO', '1988-04-12', 'ADULT'),
            traveller(2, 'MARY', 'CERTTWO', '1990-07-09', 'ADULT', 'FEMALE'),
            traveller(3, 'LUCY', 'CERTTWO', '2018-03-15', 'CHILD', 'FEMALE'),
            traveller(4, 'SAM', 'CERTTWO', '2025-06-01', 'HELD_INFANT'),
          ],
          contacts,
        },
      }, bookingOptions(offer, `CERT9-${Date.now()}`)));
      if (order?.pnr) await attempt('retrieve', () => FlightProvider.getFlightOrderDetails(order.pnr));
      return { pnr: order?.pnr ?? null, ticketed: order?.ticketed ?? false, tickets: (order?.tickets ?? []).map((t) => t.number) };
    },
  },

  16: {
    title: 'Book in a class that is not available',
    slug: '16-Book-Unavailable-Class',
    scenario: 'Behaviour 6: the application must detect that the requested class cannot be sold, and must not take the booking further.',
    comment: 'Before any payment is taken, the application confirms the seats with the airline (Air_SellFromRecommendation) and signs the session out again. Asking for a booking class the airline has closed is answered UNS/NO, the application stops there - no PNR, no payment - and the customer is told the fare is no longer on sale. Each class letter tried is recorded; the run stops at the first refusal.',
    run: async () => {
      const search = await attempt('search 2 ADT', () => FlightProvider.searchFlights({
        from: 'JFK', to: 'LHR', departDate: dateIn(35), adults: 2,
      }));
      const offer = ticketableOffer(search);
      if (!offer) return { skipped: 'no offer' };
      const sold = offer.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.class ?? null;
      // Which letters a carrier keeps closed is not ours to know in advance,
      // so the closed one is found by asking: each attempt is a seat check
      // that signs its session out, and nothing is ever committed.
      const attempts = [];
      for (const letter of ['R', 'Z', 'F', 'P', 'O', 'I'].filter((c) => c !== sold)) {
        const wanted = JSON.parse(JSON.stringify(offer));
        for (const pricing of wanted.travelerPricings ?? []) {
          for (const segment of pricing.fareDetailsBySegment ?? []) segment.class = letter;
        }
        // The sell reads the class from the offer's own `_ama` segments (rbd).
        for (const segment of wanted._ama?.segments ?? []) segment.rbd = letter;
        const seats = await attempt(`seat check in class ${letter}`, () => FlightProvider.confirmSeats(wanted));
        attempts.push({ class: letter, refused: seats?.refused ?? null, code: seats?.code ?? null });
        if (seats?.refused) return { soldClass: sold, refusedClass: letter, refused: seats.refused, attempts };
      }
      return { soldClass: sold, refusedClass: null, attempts };
    },
  },

  24: {
    title: 'Free scenario: cancel a ticketed booking (void + cancel)',
    slug: '24-Cancel-Ticketed-Booking',
    scenario: 'Our own scenario: a customer cancels a ticketed booking. The tickets are voided and the PNR is cancelled.',
    comment: 'Book and ticket a one-way for 1 adult, then cancel: PNR_Retrieve, Ticket_CancelDocument for each ticket, PNR_Cancel, and PNR_Retrieve again to show the record is cancelled. The money is returned to the customer by ARC Pay outside the GDS.',
    run: async () => {
      const search = await attempt('search 1 ADT', () => FlightProvider.searchFlights({
        from: 'JFK', to: 'LHR', departDate: dateIn(35), adults: 1,
      }));
      const offer = ticketableOffer(search);
      if (!offer) return { skipped: 'no offer' };
      const order = await attempt('book and ticket', () => FlightProvider.createFlightOrder({
        data: {
          type: 'flight-order',
          flightOffers: [offer],
          travelers: [traveller(1, 'JOHN', 'CERTFOUR', '1990-01-01', 'ADULT')],
          contacts,
        },
      }, bookingOptions(offer, `CERT24-${Date.now()}`)));
      if (!order?.pnr) return { pnr: null };
      // Amadeus holds a brief lock on a record just committed by another
      // session; a back-to-back cancel is answered 8111, and on PDT a cancel
      // seconds after issuance has also come back `727 INTERNAL ERROR` (it
      // succeeds on the next attempt), so the record is left to settle first.
      await new Promise((resolve) => setTimeout(resolve, 30000));
      const cancelled = await attempt('cancel', () => FlightProvider.cancelFlightOrder(order.pnr));
      await attempt('retrieve after cancel', () => FlightProvider.getFlightOrderDetails(order.pnr));
      return {
        pnr: order.pnr,
        tickets: (order.tickets ?? []).map((t) => t.number),
        cancelled: cancelled?.success ?? false,
      };
    },
  },
};

/* ── Run ────────────────────────────────────────────────────────────────── */

const chosen = which === 'all' ? Object.keys(CASES) : which.split(',').map((s) => s.trim());
for (const key of chosen) {
  if (!CASES[key]) {
    console.error(`Unknown case "${key}". Choose from: ${Object.keys(CASES).join(', ')} or all.`);
    process.exit(1);
  }
}

console.log(`WSAP ${config.wsap}   office ${config.officeId}   endpoint ${config.endpoint}`);
fs.mkdirSync(outDir, { recursive: true });

const pad = (n) => String(n).padStart(2, '0');
const summaries = [];

for (const key of chosen) {
  const testCase = CASES[key];
  console.log(`\n\x1b[1mTest case ${key} — ${testCase.title}\x1b[0m`);
  current = { calls: [] };
  const startedAt = new Date().toISOString();
  const result = await testCase.run();
  const calls = current.calls;
  current = null;

  const caseDir = path.join(outDir, testCase.slug);
  fs.mkdirSync(caseDir, { recursive: true });
  // The redactor pseudonymises SessionId, which is right for a fixture and
  // wrong here: the sheet reports the real session id so Amadeus can pull the
  // same session from their ALF logs, and evidence that disagreed with the
  // sheet would be unusable. The security token stays masked.
  const withRealSession = (xml, sessionId) => (sessionId
    ? xml.replace(/(<(?:\w+:)?SessionId>)([\s\S]*?)(<\/(?:\w+:)?SessionId>)/gi, `$1${sessionId}$3`)
    : xml);
  for (const call of calls) {
    const base = `${pad(call.seq)}-${call.operation}`;
    fs.writeFileSync(path.join(caseDir, `${base}.request.xml`), withRealSession(redact(call.request), call.sessionId));
    fs.writeFileSync(path.join(caseDir, `${base}.reply.xml`), withRealSession(redact(call.reply), call.sessionId));
  }

  const sessionIds = [...new Set(calls.map((c) => c.sessionId).filter(Boolean))];
  const sequences = calls.map((c) => c.sequenceNumber).filter(Boolean);
  const services = [...new Set(calls.map((c) => c.operation))];
  const summary = {
    case: Number(key),
    title: testCase.title,
    slug: testCase.slug,
    scenario: testCase.scenario,
    comment: testCase.comment,
    startedAt,
    finishedAt: new Date().toISOString(),
    // A stateless call still comes back with a SessionId; what makes a run
    // stateful is a session carried between calls, which only the mutating
    // operations do (STATELESS_OPERATIONS is the set that never does).
    sessionType: services.every((name) => STATELESS_OPERATIONS.has(name)) ? 'Stateless' : 'Stateful',
    sessionIds,
    sequenceNumbers: sequences.length ? `${sequences[0]}-${sequences[sequences.length - 1]}` : null,
    services,
    result,
    calls: calls.map(({ seq, operation, version, at, durationMs, sessionId, sequenceNumber, sessionStatus: status, error }) =>
      ({ seq, operation, version, at, durationMs, sessionId, sequenceNumber, sessionStatus: status, error })),
  };
  summaries.push(summary);
  fs.writeFileSync(path.join(caseDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

  console.log(`  ${calls.length} calls · session ${sessionIds.join(', ') || 'stateless'} · ${JSON.stringify(result)}`);
}

// Cases are usually run one at a time, so the run summary carries every case
// recorded into this folder, not only the ones this invocation ran.
const everyCase = fs.readdirSync(outDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(outDir, entry.name, 'summary.json'))
  .filter((file) => fs.existsSync(file))
  .map((file) => JSON.parse(fs.readFileSync(file, 'utf8')))
  .sort((a, b) => a.case - b.case);

fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify({
  wsap: config.wsap, officeId: config.officeId, endpoint: config.endpoint,
  recordedAt: new Date().toISOString(), cases: everyCase,
}, null, 2)}\n`);

console.log(`\n\x1b[1mWrote evidence for ${summaries.length} test case(s) to ${path.relative(ROOT, outDir)}\x1b[0m`);
