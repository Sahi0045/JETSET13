import axios from 'axios';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { createRequest, createResponse } from './helpers/express.helpers.js';

/**
 * A ticket the airline will never let this office issue, after the customer paid.
 *
 * DocIssuance_IssueTicket answers some refusals for good: 2161 PROHIBITED
 * TICKETING CARRIER, "ETKT: NOT AUTHORISED", 8100 NOT VALID THIS MARKET, 8102
 * NO INTERLINE. Waiting or retrying does not change them. The order route held
 * every one for a person: the customer was charged, told "our team is
 * finalising your ticket", and kept waiting on a ticket nobody could issue,
 * while the airline's ticketing deadline ran.
 *
 * Now the route releases the reservation and returns the payment through the
 * cancel flow, which refunds in full only when the airline shows no ticket.
 * Anything it cannot settle - a cancel the airline refuses, an issuance nobody
 * saw answered, a refusal that is only "not yet" - stays held as before.
 */

let table = fakeBookingsTable([]);
const cancelFlightOrder = vi.fn();
const send = vi.fn();
const sendCancellation = vi.fn();

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    ARC_PAY_CONFIG: { ...actual.ARC_PAY_CONFIG, BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw' },
    getArcPayAuthConfig: () => ({ headers: {} }),
    get supabase() { return { from: (...args) => table.from(...args) }; },
  };
});

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
const committed = env('PNR_Reply',
  '<pnrHeader><reservationInfo><reservation><controlNumber>HELD42</controlNumber><date>040926</date></reservation></reservationInfo></pnrHeader>'
  + '<originDestinationDetails><itineraryInfo>'
  + '<elementManagementItinerary><segmentName>AIR</segmentName></elementManagementItinerary>'
  + '<itineraryReservationInfo><reservation><controlNumber>AI7XY2</controlNumber></reservation></itineraryReservationInfo>'
  + '</itineraryInfo></originDestinationDetails>');
const queueOk = env('Queue_PlacePNRReply', '<dummy/>');
const signOutOk = env('Security_SignOutReply', '<dummy/>');

// The refusals DocIssuance gave this office on PDT, as issuanceRefusals.test.js has them.
const issueRefused = (code, text) => env('DocIssuance_IssueTicketReply',
  '<processingStatus><statusCode>X</statusCode></processingStatus><errorGroup><errorOrWarningCodeDetails><errorDetails>'
  + `<errorCode>${code}</errorCode></errorDetails></errorOrWarningCodeDetails>`
  + `<errorWarningDescription><freeText>${text}</freeText></errorWarningDescription></errorGroup>`);
const refused2161 = issueRefused('2161', 'PROHIBITED TICKETING CARRIER - RE-ENTER TICKETING CARRIER');
const refusedNotAuthorised = issueRefused('0', 'KU ETKT: NOT AUTHORISED');
const timedOut = () => Object.assign(new Error('timeout of 25000ms exceeded'), { code: 'ECONNABORTED' });

const converse = (script) => {
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

const issuedWith = (issueAnswer) => [
  ['ITAREQ', sellOk], ['PNRADD', addOk], ['TFOPCQ', fopOk], ['TPCBRQ', priceOk], ['TAUTCQ', tstOk],
  ['PNRADD', committed], ['QUQPCQ', queueOk], ['TTKTIQ', issueAnswer],
];

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
  vi.stubEnv('AMADEUS_WS_ISSUE_RETRY_DELAY_MS', '0');
  vi.resetModules();
  axios.post.mockReset();
  converse(script);
  const { runBookingChain } = await import('../../backend/services/amadeusSoap/bookingChain.js');
  const offer = {
    id: '1',
    source: 'GDS',
    price: { total: '76.00', currency: 'USD' },
    validatingAirlineCodes: ['AI'],
    travelerPricings: [{ travelerId: '1', travelerType: 'ADULT' }],
    itineraries: [{ segments: [{ id: '1' }] }],
    _ama: {
      wsap: '1ASIWJETJEC',
      officeId: 'SCK1S2400',
      searchedAt: new Date().toISOString(),
      paxRefs: [{ ref: '1', ptc: 'ADT' }],
      segments: [{
        legIndex: 0, boardPoint: 'DEL', offPoint: 'GOI', departureDate: '161026',
        arrivalDate: '161026', marketingCarrier: 'AI', flightNumber: '883', rbd: 'S',
      }],
    },
  };
  return runBookingChain({ offer, travelers: [{ firstName: 'Jane', lastName: 'Doe', gender: 'FEMALE' }] })
    .then(() => null, (error) => error);
};

// ---- the real order route --------------------------------------------------

const REF = 'FLTREFUSED1';
const INDICATOR = 'SI-REFUSED-1';

const routeOffer = {
  type: 'flight-offer',
  id: '1',
  source: 'GDS',
  itineraries: [{
    duration: 'PT2H35M',
    segments: [{
      id: '1',
      departure: { iataCode: 'DEL', at: '2026-10-16T06:00:00' },
      arrival: { iataCode: 'GOI', at: '2026-10-16T08:35:00' },
      carrierCode: 'AI', number: '883', aircraft: { code: '32N' }, numberOfStops: 0,
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
  created_at: '2026-10-08T09:00:00.000Z',
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

const payment = { result: 'SUCCESS', transaction: { id: '1', type: 'PAYMENT', amount: 291, currency: 'USD' } };

/** The chain's real failure for `script`, thrown through the real order route after onCommitted. */
const orderAfter = async (script) => {
  const failure = await chainFailure(script);

  vi.unstubAllEnvs();
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWTEST');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
  vi.resetModules();
  const mailer = {
    sendBookingNotificationEmails: send,
    sendEmail: vi.fn(),
    sendCancellationNotificationEmails: sendCancellation,
    sendTicketIssuedEmail: vi.fn(),
  };
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
      cancelFlightOrder: (...args) => cancelFlightOrder(...args),
    },
    providerStatus: () => ({ bookingEnabled: true, enabled: true, wsap: '1ASIWTEST' }),
  }));

  table = fakeBookingsTable([checkoutRow()], { tables: { price_settings: [], payments: [] } });
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
  return { failure, res, row: table.row(REF) };
};

const neverTicketed = { success: true, hadTickets: false, voided: false, requiresAirlineRefund: [] };
const arcRefundsSent = () => axios.put.mock.calls.map(([, body]) => body).filter((body) => body?.apiOperation === 'REFUND' || body?.apiOperation === 'VOID');

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ success: true });
  sendCancellation.mockReset();
  sendCancellation.mockResolvedValue({ success: true });
  cancelFlightOrder.mockReset();
  cancelFlightOrder.mockResolvedValue(neverTicketed);
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS', transaction: { id: '2', type: 'REFUND', amount: 291, currency: 'USD' } } });
  axios.get.mockReset();
  axios.get.mockResolvedValue({ status: 200, data: { status: 'CAPTURED', currency: 'USD', amount: 291, totalCapturedAmount: 291, transaction: [payment] } });
});

afterEach(() => {
  vi.doUnmock('../../backend/services/emailService.js');
  vi.doUnmock('../../backend/services/flightProvider.js');
  vi.unstubAllEnvs();
});

describe('which issuance refusals are for good', () => {
  const standing = async (error) => (await import('../../backend/services/amadeusSoap/codes.js')).isStandingTicketRefusal(error);

  it.each([
    ['2161', 'PROHIBITED TICKETING CARRIER - RE-ENTER TICKETING CARRIER'],
    ['0', 'KU ETKT: NOT AUTHORISED'],
    ['8100', 'ETKT THIS CARRIER NOT VALID THIS MARKET'],
    ['8102', 'ETKT RJT - NO INTERLINE BETWEEN CARRIERS B6-LH'],
    ['0', 'ETKT: INVALID AIRLINE DESIGNATOR/VENDOR SUPPLIER'],
  ])('%s %s', async (amadeusCode, technicalError) => {
    expect(await standing({ amadeusCode, technicalError })).toBe(true);
  });

  it.each([
    ['9125', 'NEED AIRLINE R/LOC'],
    ['0', 'CZ ETKT: COMMUNICATIONS LINE UNAVAILABLE'],
    [null, 'timeout of 25000ms exceeded'],
    ['5458', 'NOT AUTHORISED'],
  ])('not %s %s', async (amadeusCode, technicalError) => {
    expect(await standing({ amadeusCode, technicalError })).toBe(false);
  });
});

describe('a ticket refused for good', () => {
  it.each([
    ['2161 PROHIBITED TICKETING CARRIER', refused2161],
    ['ETKT: NOT AUTHORISED', refusedNotAuthorised],
  ])('%s: releases the reservation, refunds in full, and says so', async (_name, refusal) => {
    const { failure, res, row } = await orderAfter(issuedWith(refusal));
    expect(failure).toMatchObject({ step: 'issueTicket', committed: true, ticketed: false, pnr: 'HELD42' });

    expect(cancelFlightOrder).toHaveBeenCalledWith('HELD42');
    expect(arcRefundsSent()).toHaveLength(1);

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ success: false, bookingFailed: true, code: 'BOOKING_FAILED', refunded: true, bookingReference: REF });
    expect(res.body.error).toMatch(/airline did not allow this ticket to be issued/i);

    expect(row.status).toBe('cancelled');
    expect(row.booking_details.cancellation).toMatchObject({ paymentAction: expect.stringMatching(/^(VOID|FULL_REFUND)$/) });
    expect(row.booking_details.needs_review).toBeUndefined();
    // Not "our team is finalising your ticket": the cancellation email instead.
    expect(send.mock.calls.some(([data]) => data?.heldForReview)).toBe(false);
    expect(sendCancellation).toHaveBeenCalled();
  });
});

describe('what is still held for a person', () => {
  it('the airline refuses the cancel: no refund, and the cancel flow\'s own flag is kept', async () => {
    cancelFlightOrder.mockRejectedValue(Object.assign(new Error('PNR_Cancel refused'), { technicalError: '999 CANCEL NOT ALLOWED' }));

    const { res, row } = await orderAfter(issuedWith(refused2161));

    expect(arcRefundsSent()).toHaveLength(0);
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ needsReview: true, pnr: 'HELD42', bookingReference: REF });
    expect(row.payment_status).toBe('paid');
    expect(row.booking_details.needs_review).toMatchObject({ cancelFailed: true, source: 'cancellation', pnr: 'HELD42' });
  });

  it('an issuance nobody saw answered: not cancelled, held as before', async () => {
    const { res, row } = await orderAfter(issuedWith(timedOut()));

    expect(cancelFlightOrder).not.toHaveBeenCalled();
    expect(arcRefundsSent()).toHaveLength(0);
    expect(res.status).toBe(202);
    expect(row.booking_details.needs_review).toMatchObject({ reason: 'chain failed after commit at issueTicket', issuance: 'unknown' });
  });
});

describe('the server-only cancel', () => {
  it('cannot be asked for from a web request', async () => {
    table = fakeBookingsTable([{ ...checkoutRow(), user_id: 'owner-1', status: 'pending_ticketing', booking_details: { ...checkoutRow().booking_details, pnr: 'HELD42' } }],
      { tables: { price_settings: [], payments: [] } });
    vi.resetModules();
    const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
    const res = createResponse();
    await handleCancelBookingAction(createRequest({ method: 'POST', body: { bookingReference: REF, reason: 'x', system: true, systemCancel: true } }), res);

    // A signed-out caller is told "not found" rather than that the booking exists.
    expect([401, 403, 404]).toContain(res.statusCode);
    expect(res.body?.success).toBe(false);
    expect(cancelFlightOrder).not.toHaveBeenCalled();
  });
});
