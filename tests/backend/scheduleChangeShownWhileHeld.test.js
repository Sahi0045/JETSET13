import axios from 'axios';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { attentionOf, flagsInForce, scheduleChangeOf } from '../../shared/reviewQueue.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { shownQueryOf } from './helpers/deskShown.js';

vi.mock('../../backend/middleware/auth.middleware.js', async () => {
  const actual = await vi.importActual('../../backend/middleware/auth.middleware.js');
  return {
    ...actual,
    protect: (req, _res, next) => { req.user = { id: 'staff-1', email: 'desk@jetsetterss.com', role: 'support' }; next(); },
  };
});


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
  return { res, table, app, row: table.row(REF) };
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


/**
 * Verifier probes (audit r3, item 2): the retiming on a HELD, still unticketed
 * booking, as the desk shows it - and what happens when the desk's usual
 * workflow ("ticket issued by hand", then Mark as handled; supportDesk.test.js)
 * runs before the 15-minute alarm and before ticket sync.
 */
describe('verifier: the desk and a held booking the airline retimed', () => {
  it('the desk names the retiming while the booking is still unticketed', async () => {
    const { row } = await heldBy(refusedInSession());
    expect(scheduleChangeOf(row)).toMatchObject({ statuses: ['TK'] });
    // The desk's only line for this booking (BookingsList / SupportQueue render
    // attentionLabel + reason).
    expect(attentionOf(row).reason).toMatch(/schedule_changed_by_airline/);
  });

  it('ticketed by hand and marked handled from the desk before the alarm ran: the retiming still reaches someone', async () => {
    const { app, table } = await heldBy(refusedInSession());
    const before = table.row(REF);
    const shownOnDesk = attentionOf(before).reason;

    const resolved = await request(app)
      .post(`/api/flights/admin-bookings/1/resolve-review${shownQueryOf(before)}`)
      .send({ note: 'Ticket issued by hand in Amadeus.' });
    expect(resolved.status).toBe(200);

    const ticketed = await ticketedBySync(table);
    const { selectUnannounced } = await alarm();
    const stillOpen = scheduleChangeOf(ticketed);
    const announced = selectUnannounced([ticketed]).length;
    // Either the person who resolved it was shown the retiming, or it is still
    // open for someone afterwards.
    expect({
      deskLineNamedRetiming: /schedule_changed_by_airline/.test(shownOnDesk),
      retimingStillOpen: Boolean(stillOpen) || announced > 0,
    }).not.toEqual({ deskLineNamedRetiming: false, retimingStillOpen: false });
  });
});
