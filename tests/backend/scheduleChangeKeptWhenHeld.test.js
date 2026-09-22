import axios from 'axios';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { attentionOf, flagsInForce, scheduleChangeOf } from '../../shared/reviewQueue.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

// The payment handlers take their Supabase client from arcpay.config.js
// (heldForReviewEmail.test.js does the same).
vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  const chain = {};
  for (const m of ['select', 'update', 'insert', 'upsert', 'eq', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.maybeSingle = chain.single;
  return { ...actual, supabase: { from: vi.fn(() => chain) } };
});

/**
 * A schedule change the chain accepted, on a booking the order route then held.
 *
 * The chain accepts a TK segment at commit with change advice (bookingChain.js
 * step 'acceptScheduleChange') and reported it only in its RESULT
 * (`scheduleChanged`), which createFlightOrder turns into the
 * `schedule_changed_by_airline` review flag. When a later step threw instead -
 * the airline refusing issuance (2161 PROHIBITED TICKETING CARRIER, a standing
 * PDT refusal), in the booking session or in a new one - the BookingChainError
 * carried no schedule change, and the order route's committed branch wrote
 * "chain failed after commit at issueTicket" as the only flag. Nobody was told
 * the flight was retimed: the desk and the Slack alarm both read
 * scheduleChangeOf, which found nothing, and the booking kept the searched
 * times for the e-ticket a person later issued.
 *
 * Now every chain error after the acceptance carries the change, and
 * flagForReview keeps it under the held flag as `previous` - with any flag
 * already on the booking under that. The alarm names it on the held booking's
 * line, and once a person has ticketed it the desk and the alarm show the
 * retiming as the job left to do (openTicketedFlagOf).
 *
 * End to end: the real SOAP chain (amadeusSoap/index.js createFlightOrder)
 * behind the real order route, with only the SOAP replies and the database
 * faked.
 */

const REF = 'FLTTKHELD';
const INDICATOR = 'SI-TK-HELD';

const envelope = (name, inner, session) => `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3">
  <soap:Header>${session ? `<awsse:Session TransactionStatusCode="${session.status}"><awsse:SessionId>${session.id}</awsse:SessionId><awsse:SequenceNumber>${session.seq}</awsse:SequenceNumber><awsse:SecurityToken>TOK</awsse:SecurityToken></awsse:Session>` : ''}</soap:Header>
  <soap:Body><${name}>${inner}</${name}></soap:Body>
</soap:Envelope>`;
const reply = (xml) => ({ status: 200, data: xml, headers: {} });
const SESSION = { status: 'InSeries', id: 'SESS1', seq: '1' };

const sellOk = envelope('Air_SellFromRecommendationReply',
  '<itineraryDetails><segmentInformation><actionDetails><quantity>1</quantity><statusCode>OK</statusCode></actionDetails></segmentInformation></itineraryDetails>', SESSION);
const addOk = envelope('PNR_Reply', '<dummy/>', SESSION);
const fopOk = envelope('FOP_CreateFormOfPaymentReply', '<dummy/>', SESSION);
const priceOk = envelope('Fare_PricePNRWithBookingClassReply',
  '<fareList><fareReference><uniqueReference>1</uniqueReference></fareReference><paxSegReference><refDetails><refQualifier>PA</refQualifier><refNumber>1</refNumber></refDetails></paxSegReference><fareDataInformation><fareDataSupInformation><fareDataQualifier>712</fareDataQualifier><fareAmount>76.00</fareAmount><fareCurrency>USD</fareCurrency></fareDataSupInformation></fareDataInformation></fareList>', SESSION);
const tstOk = envelope('Ticket_CreateTSTFromPricingReply', '<tstList><tstReference><uniqueReference>1</uniqueReference></tstReference></tstList>', SESSION);
const pnrHeaderXml = '<pnrHeader><reservationInfo><reservation><companyId>1A</companyId><controlNumber>ABC123</controlNumber><date>040926</date></reservation></reservationInfo></pnrHeader>'
  + '<travellerInfo><elementManagementPassenger><reference><qualifier>PT</qualifier><number>2</number></reference></elementManagementPassenger>'
  + '<passengerData><travellerInformation><traveller><surname>SMITH</surname></traveller><passenger><firstName>JOHN MR</firstName></passenger></travellerInformation></passengerData></travellerInfo>';
/** A PNR reply with one air segment at `status`, and the airline's locator unless `locator` is false. */
const withSegmentStatus = (status, { locator = true } = {}) => envelope('PNR_Reply', pnrHeaderXml
  + '<originDestinationDetails><itineraryInfo><elementManagementItinerary><segmentName>AIR</segmentName></elementManagementItinerary>'
  + `<relatedProduct><quantity>1</quantity><status>${status}</status></relatedProduct>`
  + (locator ? '<itineraryReservationInfo><reservation><companyId>IB</companyId><controlNumber>XYZ123</controlNumber></reservation></itineraryReservationInfo>' : '')
  + '</itineraryInfo></originDestinationDetails>', SESSION);
const queueOk = envelope('Queue_PlacePNRReply', '<dummy/>', SESSION);
// The exact refusal the PDT office gave Air India PNR ASOV8X (issueTicketReply.test.js).
const issueRefused = envelope('DocIssuance_IssueTicketReply',
  '<processingStatus><statusCode>X</statusCode></processingStatus><errorGroup><errorOrWarningCodeDetails><errorDetails><errorCode>2161</errorCode></errorDetails></errorOrWarningCodeDetails>'
  + '<errorWarningDescription><freeText>PROHIBITED TICKETING CARRIER - RE-ENTER TICKETING CARRIER</freeText></errorWarningDescription></errorGroup>', SESSION);
const signOutOk = envelope('Security_SignOutReply', '<dummy/>');

const offer = () => ({
  type: 'flight-offer',
  id: '1',
  source: 'GDS',
  price: { total: '76.00', currency: 'USD', base: '40.00' },
  validatingAirlineCodes: ['IB'],
  travelerPricings: [{
    travelerId: '1', fareOption: 'STANDARD', travelerType: 'ADULT',
    price: { currency: 'USD', total: '76.00', base: '40.00' },
    fareDetailsBySegment: [{ segmentId: '1', cabin: 'ECONOMY', fareBasis: 'SDNNNNB4', class: 'S' }],
  }],
  itineraries: [{
    duration: 'PT2H30M',
    segments: [{
      id: '1',
      departure: { iataCode: 'MAD', at: '2026-11-01T08:00:00' },
      arrival: { iataCode: 'LHR', at: '2026-11-01T09:30:00' },
      carrierCode: 'IB', number: '3170', aircraft: { code: '320' }, numberOfStops: 0,
    }],
  }],
  _ama: {
    wsap: '1ASIWJETJEC',
    officeId: 'SCK1S2400',
    searchedAt: new Date().toISOString(),
    paxRefs: [{ ref: '1', ptc: 'ADT' }],
    segments: [{
      legIndex: 0, boardPoint: 'MAD', offPoint: 'LHR', departureDate: '011126', arrivalDate: '011126', marketingCarrier: 'IB', flightNumber: '3170', rbd: 'S',
    }],
  },
});

const checkoutRow = () => ({
  id: 1,
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 76,
  user_id: null,
  created_at: new Date().toISOString(),
  booking_details: {
    order_id: REF,
    success_indicator: INDICATOR,
    customer_email: 'john@example.com',
    arc_captured_amount: 76,
    arc_captured_currency: 'USD',
    pending_booking_data: {
      bookingData: {
        originalOffer: offer(),
        passengerData: [{ firstName: 'John', lastName: 'Smith', gender: 'MALE', dateOfBirth: '1990-01-01' }],
      },
    },
    verified_charge: { total: 76, pricedFare: { total: 76, currency: 'USD' }, verifiedAt: new Date().toISOString() },
  },
});

const order = {
  bookingReference: REF,
  orderId: REF,
  transactionId: INDICATOR,
  contactInfo: { email: 'john@example.com', countryCode: '1', phoneNumber: '5551234567' },
  travelers: [{ id: '1', firstName: 'John', lastName: 'Smith', dateOfBirth: '1990-01-01', gender: 'MALE' }],
};

const stubChainEnv = () => {
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
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
  vi.stubEnv('AMADEUS_WS_TICKET_RETRIEVE_INITIAL_MS', '0');
  vi.stubEnv('AMADEUS_WS_TICKET_RETRIEVE_RETRIES', '0');
  vi.stubEnv('AMADEUS_WS_TICKET_RETRIEVE_DELAY_MS', '0');
};

/**
 * Answers by SOAP action, each in the order given: [action fragment, reply,
 * or an Error to throw]. Anything not scripted - the sign-outs - is answered OK.
 */
const converse = (script) => {
  axios.post.mockReset();
  const left = [...script];
  axios.post.mockImplementation(async (_url, _body, cfg) => {
    const action = cfg?.headers?.SOAPAction ?? '';
    const index = left.findIndex(([fragment]) => action.includes(fragment));
    if (index === -1) return reply(signOutOk);
    const [[, answer]] = left.splice(index, 1);
    if (answer instanceof Error) throw answer;
    return reply(answer);
  });
};

const upToCommit = (commitReply) => [
  ['ITAREQ', sellOk], ['PNRADD', addOk], ['TFOPCQ', fopOk], ['TPCBRQ', priceOk], ['TAUTCQ', tstOk], ['PNRADD', commitReply],
];
/** TK at commit, accepted, queued, then issuance refused in the booking session. */
const refusedInSession = () => [
  ...upToCommit(withSegmentStatus('TK')), ['PNRADD', withSegmentStatus('HK')], ['QUQPCQ', queueOk], ['TTKTIQ', issueRefused],
];
/** The same, with no airline locator yet: issuance refused in a new session (issueInFreshSessions). */
const refusedInNewSession = () => [
  ...upToCommit(withSegmentStatus('TK', { locator: false })), ['PNRADD', withSegmentStatus('HK', { locator: false })],
  ['QUQPCQ', queueOk], ['PNRRET', withSegmentStatus('HK')], ['TTKTIQ', issueRefused],
];
/** TK at commit, accepted, queued, then DocIssuance never answered. */
const unansweredInSession = () => [
  ...upToCommit(withSegmentStatus('TK')), ['PNRADD', withSegmentStatus('HK')], ['QUQPCQ', queueOk],
  ['TTKTIQ', Object.assign(new Error('timeout of 25000ms exceeded'), { code: 'ECONNABORTED' })],
];
/** No change at commit: issuance refused in the booking session. */
const refusedUnchanged = () => [...upToCommit(withSegmentStatus('HK')), ['QUQPCQ', queueOk], ['TTKTIQ', issueRefused]];

const changeAdviceSent = () => axios.post.mock.calls.map(([, body]) => String(body))
  .filter((body) => body.includes('<PNR_AddMultiElements') && body.includes('<optionCode>13</optionCode>')).length;

/** What the real provider throws for `script`. */
const chainFailure = async (script) => {
  converse(script);
  const provider = (await import('../../backend/services/amadeusSoap/index.js')).default;
  return provider.createFlightOrder({
    data: { flightOffers: [offer()], travelers: [{ id: '1', name: { firstName: 'John', lastName: 'Smith' }, gender: 'MALE', dateOfBirth: '1990-01-01' }] },
  }, { bookingReference: 'FLT1', expectedTotal: 76 }).then(() => null, (e) => e);
};

const send = vi.fn();

/** The real chain behind the real order route, answering `script`. Returns the answer and the table. */
const heldBy = async (script) => {
  converse(script);
  vi.doMock('../../backend/services/flightProvider.js', async () => {
    const soap = (await vi.importActual('../../backend/services/amadeusSoap/index.js')).default;
    return {
      default: {
        priceFlightOffer: vi.fn(async (priced) => ({
          success: true,
          data: { flightOffers: [{ ...priced, price: { currency: 'USD', total: '76.00', grandTotal: '76.00', base: '40.00' } }] },
        })),
        createFlightOrder: (orderData, options) => soap.createFlightOrder(orderData, options),
      },
      providerStatus: () => ({ bookingEnabled: true, wsap: '1ASIWJETJEC' }),
    };
  });
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
  return { res, table, row: table.row(REF) };
};

/** A person tickets the PNR by hand; ticket sync reads it and records the ticket. */
const ticketedBySync = async (table) => {
  const job = await import('../../backend/jobs/ticketSync.job.js');
  const [found] = await job.findUnticketed();
  const provider = {
    getFlightOrderDetails: vi.fn(async () => ({
      success: true,
      data: {
        tickets: [{ number: '075-1234567890', travelerId: '2', validatingCarrier: 'IB', issuedOn: '2026-09-23' }],
        travelers: [{ id: '2', name: { firstName: 'JOHN', lastName: 'SMITH' } }],
      },
    })),
  };
  const result = await job.syncOne(found, { provider, sendEmail: vi.fn(async () => ({ success: true })) });
  expect(result).toMatchObject({ outcome: 'recorded' });
  return table.row(REF);
};

const alarm = () => import('../../backend/jobs/needsReviewAlert.job.js');

beforeEach(() => {
  vi.unstubAllEnvs();
  stubChainEnv();
  vi.resetModules();
  send.mockReset();
  send.mockResolvedValue({ success: true });
  const mailer = { sendBookingNotificationEmails: send, sendEmail: vi.fn(), sendCancellationNotificationEmails: vi.fn(), sendTicketIssuedEmail: vi.fn() };
  vi.doMock('../../backend/services/emailService.js', () => ({ ...mailer, default: mailer }));
});

afterEach(() => {
  vi.doUnmock('../../backend/services/emailService.js');
  vi.doUnmock('../../backend/services/flightProvider.js');
  vi.unstubAllEnvs();
});

describe('the chain\'s error carries the change it accepted', () => {
  it('issuance refused in the booking session', async () => {
    const error = await chainFailure(refusedInSession());
    expect(changeAdviceSent()).toBe(1);
    expect(error).toMatchObject({
      name: 'BookingChainError', committed: true, pnr: 'ABC123', step: 'issueTicket', amadeusCode: '2161', scheduleChanged: ['TK'],
    });
  });

  it('issuance refused in a new session, once the airline\'s locator arrived', async () => {
    const error = await chainFailure(refusedInNewSession());
    expect(changeAdviceSent()).toBe(1);
    expect(axios.post.mock.calls.some(([, , cfg]) => String(cfg?.headers?.SOAPAction).includes('PNRRET'))).toBe(true);
    expect(error).toMatchObject({
      name: 'BookingChainError', committed: true, pnr: 'ABC123', step: 'issueTicket', amadeusCode: '2161', scheduleChanged: ['TK'],
    });
  });

  it('no change at commit: the same refusal carries none', async () => {
    const error = await chainFailure(refusedUnchanged());
    expect(changeAdviceSent()).toBe(0);
    expect(error).toMatchObject({ committed: true, step: 'issueTicket', amadeusCode: '2161' });
    expect(error.scheduleChanged ?? null).toBeNull();
  });
});

describe('the order route holding that booking', () => {
  it('keeps the schedule change under the held flag, where the desk and Slack look for it', async () => {
    const { res, row } = await heldBy(refusedInSession());

    // The route took the committed branch: the airline holds ABC123, a person finishes it.
    expect(res.status).toBe(202);
    expect(res.body.needsReview).toBe(true);
    expect(row.status).toBe('pending_ticketing');
    expect(row.booking_details.pnr).toBe('ABC123');
    expect(row.booking_details.gds.ticketed).toBe(false);
    expect(row.booking_details.needs_review).toEqual({
      reason: 'chain failed after commit at issueTicket',
      ticketed: false,
      at: expect.any(String),
      amadeus: { operation: 'DocIssuance_IssueTicket', code: '2161', message: expect.stringContaining('PROHIBITED TICKETING CARRIER') },
      previous: { reason: 'schedule_changed_by_airline', statuses: ['TK'], at: expect.any(String) },
    });
    expect(flagsInForce(row).map((flag) => flag.reason)).toEqual(['chain failed after commit at issueTicket', 'schedule_changed_by_airline']);
    expect(scheduleChangeOf(row)).toMatchObject({ statuses: ['TK'] });
    // The held email ("our team is finishing your ticket") still goes out.
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].heldForReview).toBe(true);
  });

  it('held from a new session: the same', async () => {
    const { res, row } = await heldBy(refusedInNewSession());
    expect(res.status).toBe(202);
    expect(row.booking_details.needs_review).toMatchObject({
      reason: 'chain failed after commit at issueTicket',
      previous: { reason: 'schedule_changed_by_airline', statuses: ['TK'] },
    });
  });

  it('before anyone tickets it: Slack names the retiming on the held booking\'s line; the desk lists the hold', async () => {
    const { row } = await heldBy(refusedInSession());
    const { buildMessage, selectUnannounced } = await alarm();
    const picked = selectUnannounced([row]);
    expect(picked).toHaveLength(1);
    const text = buildMessage(picked);
    expect(text).toMatch(/^:rotating_light: \*1 booking paid but not ticketed\*/);
    expect(text).toContain('PNR ABC123 · ticketed: NO\nreason: chain failed after commit at issueTicket');
    expect(text).toContain('the airline also changed the schedule (segment status: TK): tell the customer the new times');
    // The desk's line leads with the hold, the job in front of the retiming.
    expect(attentionOf(row)).toMatchObject({ kind: 'review' });
    expect(attentionOf(row).reason).toMatch(/^chain failed after commit at issueTicket/);
  });

  it('once a person has ticketed it: the retiming is what is left, on the desk and in Slack', async () => {
    const { table } = await heldBy(refusedInSession());
    const ticketed = await ticketedBySync(table);

    expect(ticketed.booking_details.gds.ticketed).toBe(true);
    // Ticket sync leaves the held flag alone (heldThenTicketedStaysQuiet), so
    // the change stays under it.
    expect(ticketed.booking_details.needs_review.previous).toMatchObject({ reason: 'schedule_changed_by_airline', statuses: ['TK'] });
    expect(attentionOf(ticketed)).toMatchObject({ kind: 'schedule_changed', reason: 'schedule_changed_by_airline' });
    const { buildMessage, selectUnannounced } = await alarm();
    const text = buildMessage(selectUnannounced([ticketed]));
    expect(text).toMatch(/^:clock3: \*1 ticketed booking whose schedule the airline changed\*/);
    expect(text).toContain('PNR ABC123 · segment status: TK');
    expect(text).not.toMatch(/paid but not ticketed|held after its ticket was issued/);
  });

  it('announced while held: not announced again once ticketed, since that post named the retiming', async () => {
    const { table } = await heldBy(refusedInSession());
    const row = table.row(REF);
    row.booking_details.needs_review.alerted_at = new Date().toISOString();
    const ticketed = await ticketedBySync(table);
    const { selectUnannounced } = await alarm();
    expect(selectUnannounced([ticketed])).toHaveLength(0);
    expect(attentionOf(ticketed)).toMatchObject({ kind: 'schedule_changed' });
  });

  it('an issuance nobody saw answered after the change: both kept, and both on the Slack line', async () => {
    const { res, row } = await heldBy(unansweredInSession());
    expect(res.status).toBe(202);
    expect(row.booking_details.needs_review).toMatchObject({
      reason: 'chain failed after commit at issueTicket',
      ticketed: false,
      issuance: 'unknown',
      previous: { reason: 'schedule_changed_by_airline', statuses: ['TK'] },
    });
    const { buildMessage, selectUnannounced } = await alarm();
    const text = buildMessage(selectUnannounced([row]));
    expect(text).toMatch(/^:grey_question: \*1 booking paid, ticket issuance not answered\*/);
    expect(text).toContain('PNR ABC123 · ticketed: unknown');
    expect(text).toContain('the airline also changed the schedule (segment status: TK): tell the customer the new times');
  });

  it('no change at commit: the held flag is written as before, with nothing under it', async () => {
    const { res, row } = await heldBy(refusedUnchanged());
    expect(res.status).toBe(202);
    expect(row.booking_details.needs_review).toEqual({
      reason: 'chain failed after commit at issueTicket',
      ticketed: false,
      at: expect.any(String),
      amadeus: { operation: 'DocIssuance_IssueTicket', code: '2161', message: expect.stringContaining('PROHIBITED TICKETING CARRIER') },
    });
    expect(scheduleChangeOf(row)).toBeNull();
    const { buildMessage, selectUnannounced } = await alarm();
    expect(buildMessage(selectUnannounced([row]))).not.toMatch(/changed the schedule/);
  });
});

describe('flagForReview', () => {
  const flagged = async (existingReview, extra) => {
    const table = fakeBookingsTable([{
      ...checkoutRow(),
      booking_details: { ...checkoutRow().booking_details, pnr: 'ABC123', ...(existingReview ? { needs_review: existingReview } : {}) },
    }]);
    const supabase = (await import('../../backend/config/supabase.js')).default;
    supabase.from.mockImplementation(table.from);
    const { flagForReview } = await import('../../backend/routes/flight.routes.js');
    await flagForReview({ bookingReference: REF, pnr: 'ABC123', reason: 'chain failed after commit at issueTicket', ticketed: false, ...extra });
    return table.row(REF).booking_details.needs_review;
  };
  const earlier = { reason: 'PNR committed, never ticketed', ticketed: false, at: '2026-09-23T09:00:00.000Z', alerted_at: '2026-09-23T09:15:00.000Z' };

  it('keeps a flag already on the booking under the schedule change', async () => {
    const review = await flagged(earlier, { scheduleChanged: ['TK'] });
    expect(review).toMatchObject({
      reason: 'chain failed after commit at issueTicket',
      previous: { reason: 'schedule_changed_by_airline', statuses: ['TK'], previous: earlier },
    });
  });

  it('without a schedule change, writes the held flag as before', async () => {
    expect(await flagged(null, {})).toEqual({ reason: 'chain failed after commit at issueTicket', ticketed: false, at: expect.any(String) });
    expect(await flagged(earlier, { scheduleChanged: null })).toEqual({
      reason: 'chain failed after commit at issueTicket', ticketed: false, at: expect.any(String),
    });
    expect(await flagged(null, { scheduleChanged: [] })).toEqual({
      reason: 'chain failed after commit at issueTicket', ticketed: false, at: expect.any(String),
    });
  });
});
