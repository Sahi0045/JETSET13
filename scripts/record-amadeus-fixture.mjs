#!/usr/bin/env node
/**
 * Record request/reply pairs from the live Amadeus WSAP.
 *
 * Certification is assessed on evidence that each entitled operation was
 * actually exercised, not on a claim that it was implemented — so what this
 * produces is a numbered pair per call, in the order the calls happened. The
 * ordering matters as much as the content: it is what shows a session opened
 * once, carried the same SessionId through the chain, and was signed out.
 *
 * It talks to the real GDS, so it is gated behind AMADEUS_WS_RECORD=true and
 * must never run in CI.
 *
 *   AMADEUS_WS_RECORD=true node scripts/record-amadeus-fixture.mjs --scenario=search
 *   AMADEUS_WS_RECORD=true node scripts/record-amadeus-fixture.mjs --scenario=booking
 *   AMADEUS_WS_RECORD=true node scripts/record-amadeus-fixture.mjs --scenario=all
 *   AMADEUS_WS_RECORD=true node scripts/record-amadeus-fixture.mjs --scenario=booking --keep
 *
 * Capture works by wrapping `axios.post` rather than by a hook inside
 * `transport.js`. Two reasons: it records the exact bytes on the wire, after
 * every layer of the client has had its say, which is what a reviewer is
 * comparing against the schema; and it keeps recording machinery out of the
 * production path entirely, where it could only ever be a liability.
 *
 * Redaction preserves structure and destroys values. Blanking a whole
 * `travellerInfo` block — which is what the runtime logger's `redactEnvelope`
 * does, correctly, for logs — would remove the very element a reviewer needs
 * to see the shape of. So names, contact details and dates of birth are
 * replaced with fixed stand-ins, credentials are blanked outright, and session
 * identifiers are pseudonymised consistently so the flow between calls stays
 * legible without a live token leaving the machine.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import axios from 'axios';

if (process.env.AMADEUS_WS_RECORD !== 'true') {
  console.error('Refusing to run: set AMADEUS_WS_RECORD=true. This calls the live GDS.');
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const has = (name) => args.includes(`--${name}`);

const scenario = flag('scenario', 'search');
const keep = has('keep');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(ROOT, flag('out', 'tests/fixtures/amadeus/certification'));

// The chain must be reachable regardless of how the environment is configured,
// and ticketing must stay off: PDT has no ticketing stock, so DocIssuance can
// only be recorded once Amadeus confirms it.
if (scenario === 'booking' || scenario === 'all') {
  process.env.AMADEUS_WS_BOOKING_ENABLED = 'true';
  if (!has('ticket')) process.env.AMADEUS_WS_AUTO_TICKET = 'false';
}

const { default: FlightProvider } = await import('../backend/services/amadeusSoap/index.js');
const { getWsConfig } = await import('../backend/services/amadeusSoap/config.js');
const { OPERATIONS } = await import('../backend/services/amadeusSoap/codes.js');
const { callStateless } = await import('../backend/services/amadeusSoap/session.js');
const { buildCalendarBody } = await import('../backend/services/amadeusSoap/operations/masterPricer.js');
const { buildCheckRulesBody } = await import('../backend/services/amadeusSoap/operations/fareRules.js');

/* ── Redaction ──────────────────────────────────────────────────────────── */

/** SessionId -> stable pseudonym, so the same session reads the same across files. */
const sessionAliases = new Map();
const aliasFor = (id) => {
  if (!sessionAliases.has(id)) sessionAliases.set(id, `SESSION-${sessionAliases.size + 1}`);
  return sessionAliases.get(id);
};

const blank = (xml, tag, value = '[REDACTED]') =>
  xml.replace(
    new RegExp(`(<(?:\\w+:)?${tag}(?:\\s[^>]*)?>)[\\s\\S]*?(</(?:\\w+:)?${tag}>)`, 'gi'),
    `$1${value}$2`,
  );

/** Replace an element's text while keeping the element itself intact. */
const substitute = (xml, tag, value) => blank(xml, tag, value);

const redact = (xml) => {
  let out = String(xml ?? '');

  // Credentials. These are the only things blanked outright.
  out = blank(out, 'Password');
  out = blank(out, 'Nonce');
  out = blank(out, 'SecurityToken');

  // Session identifiers are evidence, not secrets, once pseudonymised: a
  // reviewer needs to see the same id echoed from Start through to End.
  out = out.replace(
    /(<(?:\w+:)?SessionId>)([\s\S]*?)(<\/(?:\w+:)?SessionId>)/gi,
    (_m, open, id, close) => `${open}${aliasFor(id.trim())}${close}`,
  );

  // Traveller data: structure kept, values replaced. A reviewer is checking
  // that the name element is built correctly, not who flew.
  out = substitute(out, 'surname', 'TESTSURNAME');
  out = substitute(out, 'firstName', 'TESTGIVEN MR');
  out = substitute(out, 'dateOfBirth', '01011990');
  out = substitute(out, 'documentNumber', 'X0000000');
  out = substitute(out, 'birthDate', '01011990');

  // Contact details travel as free text, in the same elements as the RF and RM
  // entries we want to keep. So mask inside free text only, and by pattern
  // rather than by element — a blanket digit rule applied to the whole
  // envelope would eat fare amounts and ticket dates, which are the evidence.
  out = out.replace(
    /(<(?:\w+:)?(?:freeText|longFreetext|freeTextData)(?:\s[^>]*)?>)([\s\S]*?)(<\/(?:\w+:)?(?:freeText|longFreetext|freeTextData)>)/gi,
    (_m, open, text, close) => {
      const masked = text
        .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, 'traveller@example.com')
        .replace(/\+?\d[\d\s-]{6,}\d/g, '5555550100');
      return `${open}${masked}${close}`;
    },
  );

  return out;
};

/**
 * Whether the WSAP accepted the call.
 *
 * Amadeus answers a rejected request with HTTP 200 and an application error in
 * the body, so status alone says nothing. A reviewer reading the index needs
 * to see at a glance which calls were refused and why - a refusal is often the
 * finding, as with Fare_MasterPricerCalendar's 1006 on this office.
 */
const readOutcome = (xml) => {
  const fault = xml.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i);
  if (fault) return { ok: false, code: 'SOAP fault', text: fault[1].trim() };

  const code = xml.match(/<error>([^<]+)<\/error>/i)
    || xml.match(/<errorCode>([^<]+)<\/errorCode>/i);
  if (!code) return { ok: true, code: null, text: null };

  const text = xml.match(/<description>([^<]+)<\/description>/i)
    || xml.match(/<freeText>([^<]+)<\/freeText>/i);
  return { ok: false, code: code[1].trim(), text: text ? text[1].trim() : null };
};

/* ── Capture ────────────────────────────────────────────────────────────── */

const actionToName = new Map(Object.values(OPERATIONS).map((op) => [op.action, op]));
const captured = [];

const realPost = axios.post.bind(axios);
axios.post = async (url, data, cfg) => {
  const started = Date.now();
  const response = await realPost(url, data, cfg);
  const op = actionToName.get(cfg?.headers?.SOAPAction);
  captured.push({
    seq: captured.length + 1,
    operation: op?.name ?? 'Unknown',
    version: op ? op.suffix.replace(/^[A-Z]+_/, '').replace(/_1?[A-Z]$/, '').replace('_', '.') : null,
    suffix: op?.suffix ?? null,
    httpStatus: response.status,
    durationMs: Date.now() - started,
    outcome: readOutcome(String(response.data ?? '')),
    request: String(data ?? ''),
    reply: String(response.data ?? ''),
  });
  return response;
};

/* ── Scenarios ──────────────────────────────────────────────────────────── */

const config = getWsConfig();
const dateIn = (days) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const step = (label) => console.log(`\n\x1b[1m${label}\x1b[0m`);
const note = (msg) => console.log(`  ${msg}`);
const failed = (label, err) => console.log(`  \x1b[31m${label} failed\x1b[0m — ${err?.technicalError || err?.error || err?.message}`);

/**
 * A failed call is still evidence. Amadeus asks how an implementation behaves
 * on rejection as well as on success, so nothing here aborts the run.
 */
const attempt = async (label, fn) => {
  try {
    const value = await fn();
    note(`${label} ok`);
    return value;
  } catch (error) {
    failed(label, error);
    return null;
  }
};

let offer = null;

const recordSearch = async () => {
  step('Search — Fare_MasterPricerTravelBoardSearch, Fare_MasterPricerCalendar');
  const search = await attempt('one-way DEL-BOM', () => FlightProvider.searchFlights({
    from: 'DEL', to: 'BOM', departDate: dateIn(21), adults: 1,
  }));
  offer = search?.data?.[0] ?? offer;

  await attempt('round trip JFK-LHR', () => FlightProvider.searchFlights({
    from: 'JFK', to: 'LHR', departDate: dateIn(30), returnDate: dateIn(37), adults: 1,
  }));

  // A route with no fares is a documented outcome, not an error, and the
  // reviewer wants to see it answered cleanly rather than as a fault.
  await attempt('no availability', () => FlightProvider.searchFlights({
    from: 'DEL', to: 'BOM', departDate: dateIn(320), adults: 9,
  }));

  await attempt('calendar (date strip)', () => FlightProvider.getCalendarPrices({
    from: 'DEL', to: 'BOM', dates: [dateIn(21), dateIn(22), dateIn(23)], adults: 1,
  }));

  // Fare_MasterPricerCalendar is entitled on the WSAP but answers
  // "OPTION NOT PERMITTED" (1006) on this office, which is why the date strip
  // above prices each date with an ordinary search instead. The provider no
  // longer calls it at all, so the operation is probed directly here: the
  // rejection is the evidence, and it is what turns "we did not implement it"
  // into "Amadeus has not enabled it on office SCK1S2400".
  step('Fare_MasterPricerCalendar — probing a known rejection');
  await attempt('calendar operation (expected 1006)', () => callStateless(
    'Fare_MasterPricerCalendar',
    buildCalendarBody({ from: 'DEL', to: 'BOM', departDate: dateIn(21), adults: 1, dayInterval: 3 }),
  ));
};

const recordPricing = async () => {
  step('Pricing — Fare_InformativePricingWithoutPNR, Fare_CheckRules');
  if (!offer) {
    note('no offer from search; skipping');
    return;
  }
  await attempt('informative pricing', () => FlightProvider.priceFlightOffer(offer));

  // `/fare-rules` is served from informative pricing's rule text, because
  // Fare_CheckRules needs a TST inside an active PNR session and refuses a
  // standalone request with CHECK FORMAT. There is no facade method to call,
  // so the operation is probed directly: the refusal is the evidence, and it
  // shows the operation was implemented and tested rather than skipped.
  const seg = offer._ama?.segments?.[0];
  if (seg) {
    await attempt('fare rules (expected CHECK FORMAT)', () => callStateless(
      'Fare_CheckRules',
      buildCheckRulesBody({
        carrier: seg.marketingCarrier,
        flightNumber: seg.flightNumber,
        bookingClass: seg.rbd,
        origin: seg.boardPoint,
        destination: seg.offPoint,
        departDate: seg.departureDate,
      }),
    ));
  }
};

const recordStatus = async () => {
  step('Status — Air_FlightInfo');
  await attempt('flight status', () => FlightProvider.getFlightStatus('AI', '9486', dateIn(21)));
};

const recordBooking = async () => {
  step('Booking chain — Air_Sell through Security_SignOut (creates a real PNR)');
  if (!offer) {
    note('no offer from search; skipping');
    return;
  }

  const order = await attempt('create order', () => FlightProvider.createFlightOrder({
    data: {
      type: 'flight-order',
      flightOffers: [offer],
      travelers: [{
        id: '1',
        dateOfBirth: '1990-01-01',
        gender: 'MALE',
        name: { firstName: 'RECORD', lastName: 'TEST' },
      }],
      contacts: [{
        emailAddress: 'record@example.com',
        phones: [{ deviceType: 'MOBILE', countryCallingCode: '1', number: '5555550100' }],
      }],
    },
  }, {
    bookingReference: `REC-${Date.now()}`,
    onCommitted: async ({ pnr }) => note(`committed PNR ${pnr}`),
  }));

  const pnr = order?.pnr;
  if (!pnr) return;
  note(`PNR ${pnr}, mode ${order.mode}, ticketed ${order.ticketed}`);

  await attempt('retrieve', () => FlightProvider.getFlightOrderDetails(pnr));

  if (keep) {
    note(`keeping PNR ${pnr} — cancel it yourself`);
    return;
  }
  // Amadeus holds a brief lock on a record another session has just
  // committed, so a back-to-back cancel is answered 8111. That is an artefact
  // of recording both in one run, not behaviour the chain has to handle.
  await new Promise((resolve) => setTimeout(resolve, 5000));
  await attempt('cancel', () => FlightProvider.cancelFlightOrder(pnr));
};

/* ── Run ────────────────────────────────────────────────────────────────── */

console.log(`WSAP ${config.wsap}   office ${config.officeId}`);
console.log(`endpoint ${config.endpoint}`);
console.log(`scenario ${scenario}   out ${path.relative(ROOT, outDir)}`);

const scenarios = {
  search: [recordSearch],
  pricing: [recordSearch, recordPricing],
  status: [recordStatus],
  booking: [recordSearch, recordBooking],
  all: [recordSearch, recordPricing, recordStatus, recordBooking],
};

if (!scenarios[scenario]) {
  console.error(`Unknown scenario "${scenario}". Choose one of: ${Object.keys(scenarios).join(', ')}`);
  process.exit(1);
}

for (const fn of scenarios[scenario]) await fn();

/* ── Write ──────────────────────────────────────────────────────────────── */

if (!captured.length) {
  console.error('\nNothing was captured. Every call failed before reaching the WSAP.');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const pad = (n) => String(n).padStart(2, '0');
for (const call of captured) {
  const base = `${pad(call.seq)}-${call.operation}`;
  fs.writeFileSync(path.join(outDir, `${base}.request.xml`), redact(call.request));
  fs.writeFileSync(path.join(outDir, `${base}.reply.xml`), redact(call.reply));
}

const exercised = new Set(captured.map((c) => c.operation));
const missing = Object.keys(OPERATIONS).filter((op) => !exercised.has(op));

const manifest = {
  wsap: config.wsap,
  officeId: config.officeId,
  endpoint: config.endpoint,
  scenario,
  recordedAt: new Date().toISOString(),
  calls: captured.map(({ seq, operation, version, suffix, httpStatus, durationMs, outcome }) =>
    ({ seq, operation, version, suffix, httpStatus, durationMs, outcome })),
  operationsExercised: [...exercised].sort(),
  operationsNotExercised: missing,
};
fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const index = [
  `# Amadeus certification evidence — ${config.wsap}`,
  '',
  `Office ${config.officeId} · recorded ${manifest.recordedAt} · scenario \`${scenario}\``,
  '',
  'Request and reply pairs exactly as sent and received, in call order.',
  'Credentials are blanked; session identifiers are pseudonymised consistently',
  'so the flow between calls stays readable; traveller values are replaced with',
  'stand-ins while every element is left in place.',
  '',
  '| # | Operation | Version | Outcome | ms | Files |',
  '|---|---|---|---|---|---|',
  ...captured.map((c) => {
    const base = `${pad(c.seq)}-${c.operation}`;
    const outcome = c.outcome.ok
      ? 'accepted'
      : `**rejected ${c.outcome.code}**${c.outcome.text ? ` — ${c.outcome.text}` : ''}`;
    return `| ${c.seq} | ${c.operation} | ${c.version ?? '—'} | ${outcome} | ${c.durationMs} | \`${base}.request.xml\` · \`${base}.reply.xml\` |`;
  }),
  '',
  `**Exercised:** ${exercised.size} of ${Object.keys(OPERATIONS).length} entitled operations.`,
  '',
  ...(missing.length
    ? ['**Not yet exercised:**', '', ...missing.map((m) => `- ${m}`), '']
    : ['All entitled operations are covered.', '']),
].join('\n');
fs.writeFileSync(path.join(outDir, 'INDEX.md'), `${index}\n`);

console.log(`\n\x1b[1mWrote ${captured.length * 2} files to ${path.relative(ROOT, outDir)}\x1b[0m`);
for (const c of captured) {
  const outcome = c.outcome.ok ? '\x1b[32maccepted\x1b[0m' : `\x1b[33mrejected ${c.outcome.code}\x1b[0m${c.outcome.text ? ` (${c.outcome.text})` : ''}`;
  console.log(`  ${pad(c.seq)}  ${c.operation.padEnd(38)} ${outcome}  ${c.durationMs}ms`);
}
console.log(`\nCovered ${exercised.size}/${Object.keys(OPERATIONS).length} entitled operations.`);
if (missing.length) console.log(`Still to record: ${missing.join(', ')}`);
