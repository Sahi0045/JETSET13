import axios from 'axios';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

// As heldForReviewEmail.test.js: the payment handlers take their Supabase
// client from arcpay.config.js.
vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  const chain = {};
  for (const m of ['select', 'update', 'insert', 'upsert', 'eq', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.maybeSingle = chain.single;
  return { ...actual, supabase: { from: vi.fn(() => chain) } };
});

/**
 * DocIssuance_IssueTicket sent after commit and never answered.
 *
 * Our side gave up after AMADEUS_WS_TIMEOUT_MS, or got a reply that was not a
 * SOAP envelope (transport.js: "the outcome is unknown"). Nobody saw the
 * answer, so whether a ticket was issued is not known. The chain threw its
 * error with `ticketed` at the default, false, and the order route wrote that
 * as the review flag: needs_review.ticketed false over gds.ticketed false. The
 * Slack alarm, reading the row before ticket sync did, then said as fact that
 * no ticket was issued and told staff to ticket it or refund it - a second
 * ticket, or a refund of a live one - and that post is never corrected.
 *
 * Now the chain says the issuance went unanswered, the route records it
 * beside `ticketed: false` (not in place of it: the flag's `ticketed` is read
 * as "the ticket WAS issued" by openTicketedFlagOf), and the alarm gives the
 * booking its own section. A refusal Amadeus did send (2161) is an answer and
 * keeps today's flag and wording. issuanceUnansweredCancelHeldForReview.test.js
 * follows the same flag into a cancel.
 */

// ---- the real booking chain -------------------------------------------------

const S = '<awsse:Session TransactionStatusCode="InSeries"><awsse:SessionId>SESS1</awsse:SessionId><awsse:SequenceNumber>1</awsse:SequenceNumber><awsse:SecurityToken>TOK</awsse:SecurityToken></awsse:Session>';
const env = (name, inner) => `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3">
  <soap:Header>${S}</soap:Header>
  <soap:Body><${name}>${inner}</${name}></soap:Body>
</soap:Envelope>`;
const reply = (xml) => ({ status: 200, data: xml, headers: {} });
const sellOk = env('Air_SellFromRecommendationReply',
  '<itineraryDetails><segmentInformation><actionDetails><quantity>1</quantity><statusCode>OK</statusCode></actionDetails></segmentInformation></itineraryDetails>');
const addOk = env('PNR_Reply', '<dummy/>');
const fopOk = env('FOP_CreateFormOfPaymentReply', '<dummy/>');
const priceOk = env('Fare_PricePNRWithBookingClassReply',
  '<fareList><fareReference><uniqueReference>1</uniqueReference></fareReference><fareDataInformation><fareDataSupInformation><fareDataQualifier>712</fareDataQualifier><fareAmount>76.00</fareAmount><fareCurrency>USD</fareCurrency></fareDataSupInformation></fareDataInformation></fareList>');
const tstOk = env('Ticket_CreateTSTFromPricingReply', '<tstList><tstReference><uniqueReference>1</uniqueReference></tstReference></tstList>');
const pnrWith = (airlineLocator) => env('PNR_Reply',
  '<pnrHeader><reservationInfo><reservation><controlNumber>HELD42</controlNumber><date>040926</date></reservation></reservationInfo></pnrHeader>'
  + '<originDestinationDetails><itineraryInfo>'
  + '<elementManagementItinerary><segmentName>AIR</segmentName></elementManagementItinerary>'
  + (airlineLocator ? `<itineraryReservationInfo><reservation><controlNumber>${airlineLocator}</controlNumber></reservation></itineraryReservationInfo>` : '')
  + '</itineraryInfo></originDestinationDetails>');
const queueOk = env('Queue_PlacePNRReply', '<dummy/>');
// The refusal the PDT office gave Air India (issueTicketReply.test.js).
const issueRefused2161 = env('DocIssuance_IssueTicketReply',
  '<processingStatus><statusCode>X</statusCode></processingStatus><errorGroup><errorOrWarningCodeDetails><errorDetails><errorCode>2161</errorCode></errorDetails></errorOrWarningCodeDetails>'
  + '<errorWarningDescription><freeText>PROHIBITED TICKETING CARRIER - RE-ENTER TICKETING CARRIER</freeText></errorWarningDescription></errorGroup>');
const signOutOk = env('Security_SignOutReply', '<dummy/>');

const timedOut = () => Object.assign(new Error('timeout of 25000ms exceeded'), { code: 'ECONNABORTED' });
const gatewayPage = { status: 502, data: '<html><body><h1>502 Bad Gateway</h1></body></html>', headers: {} };

const chainOffer = () => ({
  id: '1',
  source: 'GDS',
  price: { total: '76.00', currency: 'USD' },
  validatingAirlineCodes: ['LH'],
  travelerPricings: [{ travelerId: '1', travelerType: 'ADULT' }],
  itineraries: [{ segments: [{ id: '1' }] }],
  _ama: {
    wsap: '1ASIWJETJEC',
    officeId: 'SCK1S2400',
    searchedAt: new Date().toISOString(),
    paxRefs: [{ ref: '1', ptc: 'ADT' }],
    segments: [{
      legIndex: 0, boardPoint: 'FRA', offPoint: 'JFK', departureDate: '251126',
      arrivalDate: '251126', marketingCarrier: 'LH', flightNumber: '400', rbd: 'S',
    }],
  },
});
const actionsSent = () => axios.post.mock.calls.map(([, , cfg]) => cfg?.headers?.SOAPAction ?? '');

/**
 * Answers by SOAP action, each in the order given: [action fragment, reply,
 * an Error to throw, or a raw HTTP answer]. Anything not scripted - the
 * sign-outs - is answered OK.
 */
const converse = (script) => {
  const left = [...script];
  axios.post.mockImplementation(async (_url, _body, cfg) => {
    const action = cfg?.headers?.SOAPAction ?? '';
    const index = left.findIndex(([fragment]) => action.includes(fragment));
    if (index === -1) return reply(signOutOk);
    const [[, answer]] = left.splice(index, 1);
    if (answer instanceof Error) throw answer;
    return typeof answer === 'string' ? reply(answer) : answer;
  });
};

const upToCommit = (commitReply) => [
  ['ITAREQ', sellOk], ['PNRADD', addOk], ['TFOPCQ', fopOk], ['TPCBRQ', priceOk], ['TAUTCQ', tstOk],
  ['PNRADD', commitReply], ['QUQPCQ', queueOk],
];
// The airline's locator on the PNR at commit: issued in the booking session.
const issuedInSession = (issueAnswer) => [...upToCommit(pnrWith('LH7XY2')), ['TTKTIQ', issueAnswer]];
// No locator yet: issued in a new session, after a retrieve (issueInFreshSessions).
const issuedInFreshSession = (issueAnswer) => [...upToCommit(pnrWith(null)), ['PNRRET', pnrWith('LH7XY2')], ['TTKTIQ', issueAnswer]];

/** What the chain throws for a scripted conversation. */
const chainFailure = async (script) => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_AUTO_TICKET', 'true');
  vi.stubEnv('AMADEUS_WS_MIN_PAYMENT_RATIO', '0');
  vi.stubEnv('AMADEUS_WS_AIRLINE_LOCATOR_WAIT_MS', '0');
  vi.stubEnv('AMADEUS_WS_AIRLINE_LOCATOR_POLL_MS', '0');
  vi.stubEnv('AMADEUS_WS_ISSUE_RETRY_DELAY_MS', '0');
  vi.resetModules();
  axios.post.mockReset();
  converse(script);
  const { runBookingChain } = await import('../../backend/services/amadeusSoap/bookingChain.js');
  return runBookingChain({ offer: chainOffer(), travelers: [{ firstName: 'Jane', lastName: 'Doe', gender: 'FEMALE' }] })
    .then(() => null, (error) => error);
};

// ---- the real order route --------------------------------------------------

const REF = 'FLTUNANSWERED1';
const INDICATOR = 'SI-UNANSWERED-1';
const at = '2026-09-23T09:00:00.000Z';

const routeOffer = {
  type: 'flight-offer',
  id: '1',
  source: 'GDS',
  itineraries: [{
    duration: 'PT8H45M',
    segments: [{
      id: '1',
      departure: { iataCode: 'FRA', at: '2026-11-25T10:00:00' },
      arrival: { iataCode: 'JFK', at: '2026-11-25T12:45:00' },
      carrierCode: 'LH', number: '400', aircraft: { code: '74H' }, numberOfStops: 0,
    }],
  }],
  price: { currency: 'USD', total: '291.00', base: '110.00' },
  travelerPricings: [{
    travelerId: '1', fareOption: 'STANDARD', travelerType: 'ADULT',
    price: { currency: 'USD', total: '291.00', base: '110.00' },
    fareDetailsBySegment: [{ segmentId: '1', cabin: 'ECONOMY', fareBasis: 'SNCOWUS', class: 'S' }],
  }],
  _ama: { wsap: '1ASIWTEST', searchedAt: new Date().toISOString(), segments: [] },
};

const checkoutRow = () => ({
  id: 1,
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  created_at: at,
  passenger_details: [{ id: '1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' }],
  booking_details: {
    order_id: REF,
    success_indicator: INDICATOR,
    customer_email: 'jane@example.com',
    arc_captured_amount: 291,
    arc_captured_currency: 'USD',
    pending_booking_data: { bookingData: { originalOffer: routeOffer, passengerData: [{ firstName: 'Jane', lastName: 'Doe', gender: 'FEMALE', dateOfBirth: '1990-01-01' }] } },
    verified_charge: { total: 291, pricedFare: { total: 291, currency: 'USD' }, verifiedAt: new Date().toISOString() },
  },
});

const order = {
  bookingReference: REF,
  orderId: REF,
  transactionId: INDICATOR,
  contactInfo: { email: 'jane@example.com', countryCode: '1', phoneNumber: '5551234567' },
  travelers: [{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', gender: 'FEMALE' }],
};

const send = vi.fn();

/**
 * The chain's real error for `script`, thrown through the real order route
 * after onCommitted - as FlightProvider.createFlightOrder does. Returns the
 * answer and the row the route left.
 */
const heldBy = async (script) => {
  const failure = await chainFailure(script);

  vi.unstubAllEnvs();
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWTEST');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
  vi.resetModules();
  const mailer = { sendBookingNotificationEmails: send, sendEmail: vi.fn(), sendCancellationNotificationEmails: vi.fn(), sendTicketIssuedEmail: vi.fn() };
  vi.doMock('../../backend/services/emailService.js', () => ({ ...mailer, default: mailer }));
  vi.doMock('../../backend/services/flightProvider.js', () => ({
    default: {
      priceFlightOffer: vi.fn(async (priced) => ({
        success: true,
        data: { flightOffers: [{ ...priced, price: { currency: 'USD', total: '291.00', grandTotal: '291.00', base: '110.00' } }] },
      })),
      createFlightOrder: vi.fn(async (_orderData, options) => {
        await options.onCommitted({ pnr: failure.pnr, tstRefs: ['1'], priced: { total: 291, currency: 'USD' } });
        throw failure;
      }),
    },
    providerStatus: () => ({ bookingEnabled: true, enabled: true, wsap: '1ASIWTEST' }),
  }));

  const table = fakeBookingsTable([checkoutRow()]);
  // Ticket sync reads `.in('payment_status', PAID)` and
  // `.not('status', 'in', '(cancelled,...)')`; the double implements neither
  // (an unknown op inside `not` excludes every row). The one row here is paid
  // and pending_ticketing, which both clauses keep, so they pass through.
  const from = (name) => {
    const query = table.from(name);
    const not = query.not;
    if (!query.in) query.in = () => query;
    query.not = (column, op, value) => (op === 'in' ? query : not(column, op, value));
    return query;
  };
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);

  const res = await request(app).post('/api/flights/order').send(order);
  return { failure, res, table, row: table.row(REF) };
};

const alarmText = async (row) => {
  const alarm = await import('../../backend/jobs/needsReviewAlert.job.js');
  const picked = alarm.selectUnannounced([row]);
  expect(picked).toHaveLength(1);
  return alarm.buildMessage(picked);
};

const UNANSWERED_ADVICE = 'DocIssuance did not answer; a ticket may have been issued. Read the PNR\'s FA lines first. '
  + 'If a ticket is there, do NOT reissue or refund - ticket sync will record it and send the e-ticket. '
  + 'If none, ticket it, or cancel the PNR and then refund.';

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.doUnmock('../../backend/services/emailService.js');
  vi.doUnmock('../../backend/services/flightProvider.js');
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('the chain says the issuance went unanswered', () => {
  it('a DocIssuance that timed out in the booking session', async () => {
    const failure = await chainFailure(issuedInSession(timedOut()));
    expect(failure).toMatchObject({
      name: 'BookingChainError',
      step: 'issueTicket',
      committed: true,
      pnr: 'HELD42',
      ticketed: false,
      issuance: 'unknown',
      code: 504,
      operation: 'DocIssuance_IssueTicket',
      technicalError: 'timeout of 25000ms exceeded',
    });
    // Sent once, and never again: nobody knows it did not issue.
    expect(actionsSent().filter((a) => a.includes('TTKTIQ'))).toHaveLength(1);
  });

  it('a DocIssuance answered with a page that is not a SOAP envelope', async () => {
    const failure = await chainFailure(issuedInSession(gatewayPage));
    expect(failure).toMatchObject({ step: 'issueTicket', committed: true, ticketed: false, issuance: 'unknown', code: 504 });
    expect(failure.technicalError).toMatch(/not a SOAP envelope/);
  });

  it('a DocIssuance that timed out in a new session, after the airline\'s locator arrived', async () => {
    const failure = await chainFailure(issuedInFreshSession(timedOut()));
    expect(failure).toMatchObject({ step: 'issueTicket', committed: true, pnr: 'HELD42', ticketed: false, issuance: 'unknown', code: 504 });
    expect(actionsSent().filter((a) => a.includes('TTKTIQ'))).toHaveLength(1);
  });

  // ---- not these: an answer, or no DocIssuance at all ----

  it('not a refusal Amadeus did send: 2161 stays a plain "not ticketed"', async () => {
    for (const script of [issuedInSession(issueRefused2161), issuedInFreshSession(issueRefused2161)]) {
      const failure = await chainFailure(script);
      expect(failure).toMatchObject({ step: 'issueTicket', committed: true, ticketed: false, amadeusCode: '2161' });
      expect(failure.issuance).toBeFalsy();
    }
  });

  it('not a new session whose retrieve timed out: DocIssuance was never sent', async () => {
    const failure = await chainFailure([...upToCommit(pnrWith(null)), ['PNRRET', timedOut()]]);
    expect(failure).toMatchObject({ step: 'retrieve', committed: true, ticketed: false, code: 504 });
    expect(failure.issuance).toBeFalsy();
    expect(actionsSent().some((a) => a.includes('TTKTIQ'))).toBe(false);
  });
});

describe('the order route records it beside "not ticketed"', () => {
  it('holds the booking (202) and writes issuance: unknown on the flag, with ticketed still false', async () => {
    const { res, row } = await heldBy(issuedInSession(timedOut()));
    expect(res.status).toBe(202);
    expect(row.status).toBe('pending_ticketing');
    // Not "ticketed": the flag's ticketed means the ticket WAS issued
    // (openTicketedFlagOf), and it may not have been.
    expect(row.booking_details.gds.ticketed).toBe(false);
    expect(row.booking_details.needs_review).toEqual({
      reason: 'chain failed after commit at issueTicket',
      ticketed: false,
      issuance: 'unknown',
      at: expect.any(String),
      amadeus: { operation: 'DocIssuance_IssueTicket', code: null, message: 'timeout of 25000ms exceeded' },
    });
    // The held email ("our team is finishing your ticket") still goes out.
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].heldForReview).toBe(true);
  });

  it('a 2161 refusal writes the flag exactly as before: no issuance on it', async () => {
    const { res, row } = await heldBy(issuedInSession(issueRefused2161));
    expect(res.status).toBe(202);
    expect(row.status).toBe('pending_ticketing');
    expect(row.booking_details.gds.ticketed).toBe(false);
    expect(row.booking_details.needs_review).toEqual({
      reason: 'chain failed after commit at issueTicket',
      ticketed: false,
      at: expect.any(String),
      amadeus: {
        operation: 'DocIssuance_IssueTicket',
        code: '2161',
        message: expect.stringContaining('PROHIBITED TICKETING CARRIER'),
      },
    });
  });
});

describe('what staff are told in Slack before ticket sync reads the PNR', () => {
  it('its own section: read the FA lines first, and "ticketed: unknown" - not "no ticket was issued"', async () => {
    const { row } = await heldBy(issuedInSession(timedOut()));
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.parse(row.booking_details.needs_review.at) + 2 * 36e5));
    const text = await alarmText(row);
    expect(text).toBe([
      ':grey_question: *1 booking paid, ticket issuance not answered*',
      UNANSWERED_ADVICE,
      '',
      `*${REF}* — pending_ticketing/paid, 291 USD\n`
        + 'PNR HELD42 · ticketed: unknown\n'
        + 'reason: chain failed after commit at issueTicket · flagged 2h ago\n'
        + 'Amadeus DocIssuance_IssueTicket: timeout of 25000ms exceeded',
    ].join('\n\n'));
    expect(text).not.toMatch(/no ticket was issued/);
    expect(text).not.toMatch(/ticket it, or refund it/);
    expect(text).not.toMatch(/ticketed: NO/);
  });

  it('a 2161 refusal keeps "paid but not ticketed" and its wording', async () => {
    const { row } = await heldBy(issuedInSession(issueRefused2161));
    const text = await alarmText(row);
    expect(text).toMatch(/^:rotating_light: \*1 booking paid but not ticketed\*/);
    expect(text).toContain('The customer has paid and no ticket was issued. Each one needs a human: ticket it, or refund it.');
    expect(text).toContain('PNR HELD42 · ticketed: NO');
    expect(text).not.toMatch(/ticket issuance not answered|ticketed: unknown/);
  });

  it('both in one post: each under its own heading', async () => {
    const unanswered = (await heldBy(issuedInSession(timedOut()))).row;
    const refused = { ...(await heldBy(issuedInSession(issueRefused2161))).row, booking_reference: 'FLTREFUSED1' };
    const alarm = await import('../../backend/jobs/needsReviewAlert.job.js');
    const text = alarm.buildMessage(alarm.selectUnannounced([unanswered, refused]));
    const [unansweredSection, refusedSection] = [text.indexOf('ticket issuance not answered'), text.indexOf('paid but not ticketed')];
    expect(unansweredSection).toBeGreaterThan(-1);
    expect(refusedSection).toBeGreaterThan(-1);
    expect(text.match(/\*1 booking/g)).toHaveLength(2);
    const refusedLine = text.slice(text.indexOf('*FLTREFUSED1*'));
    expect(refusedLine).toMatch(/^\*FLTREFUSED1\* — pending_ticketing\/paid, 291 USD\nPNR HELD42 · ticketed: NO/);
  });
});

describe('the other readers, as before', () => {
  // Flagged for review, and the desk - the lasting list - says the issuance
  // was never answered: it read like any refused issuance.
  it('the desk lists it as flagged for review, saying the issuance was not answered', async () => {
    const { row } = await heldBy(issuedInSession(timedOut()));
    const { attentionOf, attentionLabel } = await import('../../shared/reviewQueue.js');
    const attention = attentionOf(row);
    expect(attention.kind).toBe('review');
    expect(attention.reason).toMatch(/^chain failed after commit at issueTicket; issuance not answered - read the FA lines/);
    expect(attentionLabel(attention)).toBe('Flagged for review');
  });

  it('the customer\'s pages say the ticket is not issued yet, until ticket sync reads the PNR', async () => {
    const { row } = await heldBy(issuedInSession(timedOut()));
    const { attentionMessage, bookingStatusBadge } = await import('../../frontend/src/utils/bookingStatus.js');
    expect(attentionMessage(row)).toBe('Your seats are reserved, but your ticket has not been issued yet. Our team is working on it and will email you.');
    expect(bookingStatusBadge(row).label).toBe('Needs attention');
  });

  it('nothing books or issues it again: the queue clears it and abandoned checkout skips it', async () => {
    const { row } = await heldBy(issuedInSession(timedOut()));
    const { queueActionFor } = await import('../../backend/jobs/bookingQueue.job.js');
    expect(queueActionFor(row)).toBe('clear');
    const { selectCandidates } = await import('../../backend/jobs/abandonedCheckout.job.js');
    expect(selectCandidates([row], { site: 'local' })).toHaveLength(0);
    expect(selectCandidates([row], { site: 'site' })).toHaveLength(0);
  });
});

describe('once ticket sync has read the PNR', () => {
  it('a ticket found: recorded and the e-ticket sent; the desk and Slack go quiet', async () => {
    const { table } = await heldBy(issuedInSession(timedOut()));
    const job = await import('../../backend/jobs/ticketSync.job.js');
    const found = await job.findUnticketed();
    expect(found.map((r) => r.booking_reference)).toEqual([REF]);
    const provider = {
      getFlightOrderDetails: vi.fn(async () => ({
        success: true,
        data: {
          tickets: [{ number: '220-7491175301', travelerId: '2', validatingCarrier: 'LH', issuedOn: '2026-09-23' }],
          travelers: [{ id: '2', name: { firstName: 'JANE', lastName: 'DOE' } }],
        },
      })),
    };
    const sendEmail = vi.fn(async () => ({ success: true }));
    expect(await job.syncOne(found[0], { provider, sendEmail })).toMatchObject({ outcome: 'recorded', emailed: true });
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const synced = table.row(REF);
    expect(synced.booking_details.gds.ticketed).toBe(true);
    const { attentionOf } = await import('../../shared/reviewQueue.js');
    const alarm = await import('../../backend/jobs/needsReviewAlert.job.js');
    expect(attentionOf(synced)).toBeNull();
    expect(alarm.selectUnannounced([synced])).toHaveLength(0);
  });
});
