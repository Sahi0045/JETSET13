import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { errorHandler } from '../../backend/middleware/errorHandler.js';

/**
 * A PNR the airline confirmed no seat on, whose cancel the airline refused.
 *
 * The seatless Slack section tells staff to cancel the PNR and then refund. A
 * refused PNR_Cancel writes its own review flag on top and keeps the seatless
 * one only as `previous`. Every reader looked at the top flag: toClientBooking
 * sent only its reason, so the customer's pages said "Your seats are reserved"
 * again, and a retry of the order answered ALREADY_BOOKED. No seat was ever
 * confirmed.
 *
 * Driven through the real cancel handler and the real booking chain (only the
 * SOAP and ARC wire is stubbed), then the real projection and the real order
 * route on the row the cancel left.
 */

const REF = 'FLTSEAT42';
const PNR = 'SEAT42';
const SEATLESS = 'chain failed after commit at segmentStatus';

const seatless = () => ({
  id: 'bk-seat42',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending_ticketing',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  created_at: '2026-09-21T08:00:00Z',
  booking_details: {
    pnr: PNR,
    order_id: REF,
    success_indicator: `SI-${REF}`,
    customer_email: 'jane@example.com',
    gds: { ticketed: false },
    tickets: [],
    gds_chain: { state: 'finished', finishedAt: '2026-09-21T08:01:00Z' },
    needs_review: { reason: SEATLESS, ticketed: false, at: '2026-09-21T08:01:00Z', alerted_at: '2026-09-21T08:15:00Z' },
  },
});

let table = fakeBookingsTable([]);

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    ARC_PAY_CONFIG: { ...actual.ARC_PAY_CONFIG, BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw' },
    getArcPayAuthConfig: () => ({ headers: {} }),
    get supabase() { return { from: (...args) => table.from(...args) }; },
  };
});

// The real SOAP provider behind the flight provider; only axios.post answers.
// The order route must never reach createFlightOrder for this booking.
const createFlightOrder = vi.fn();
vi.mock('../../backend/services/flightProvider.js', async () => {
  const soap = (await vi.importActual('../../backend/services/amadeusSoap/index.js')).default;
  return {
    default: { cancelFlightOrder: (...args) => soap.cancelFlightOrder(...args), createFlightOrder: (...args) => createFlightOrder(...args) },
    providerStatus: () => ({ enabled: true, bookingEnabled: true, wsap: '1ASIWJETJEC' }),
  };
});

const envelope = (name, inner) => `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3">
  <soap:Header><awsse:Session TransactionStatusCode="InSeries"><awsse:SessionId>S1</awsse:SessionId><awsse:SequenceNumber>1</awsse:SequenceNumber><awsse:SecurityToken>T</awsse:SecurityToken></awsse:Session></soap:Header>
  <soap:Body><${name}>${inner}</${name}></soap:Body>
</soap:Envelope>`;
const soapReply = (xml) => ({ status: 200, data: xml, headers: {} });
// No FA line: nothing was ever ticketed on this PNR.
const retrievedNoTickets = envelope('PNR_Reply',
  `<pnrHeader><reservationInfo><reservation><controlNumber>${PNR}</controlNumber></reservation></reservationInfo></pnrHeader>`);
const cancelRefused = envelope('PNR_Reply',
  '<generalErrorInfo><errorOrWarningCodeDetails><errorDetails><errorCode>999</errorCode></errorDetails></errorOrWarningCodeDetails>'
  + '<errorFreeText>CANCEL NOT ALLOWED</errorFreeText></generalErrorInfo>');

const cancel = async () => {
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const res = createResponse();
  await handleCancelBookingAction(createRequest({ method: 'POST', body: { bookingReference: REF, reason: 'Change of plans', email: 'jane@example.com' } }), res);
  return res;
};

const retryOrder = async () => {
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  return request(app).post('/api/flights/order').send({
    bookingReference: REF,
    orderId: REF,
    transactionId: `SI-${REF}`,
    contactInfo: { email: 'jane@example.com' },
    travelers: [{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', gender: 'FEMALE' }],
  });
};

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.resetModules();
  createFlightOrder.mockReset();
  axios.post.mockReset();
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
  axios.get.mockReset();
  axios.get.mockResolvedValue({
    status: 200,
    data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: '1', type: 'PAYMENT', amount: 291, currency: 'USD' } }] },
  });
});

// The seatless booking, after the customer's cancel was refused by the airline.
const refusedCancel = async () => {
  table = fakeBookingsTable([seatless()], { tables: { price_settings: [], payments: [] } });
  axios.post
    .mockResolvedValueOnce(soapReply(retrievedNoTickets))
    .mockResolvedValueOnce(soapReply(cancelRefused))
    .mockResolvedValue(soapReply(envelope('Security_SignOutReply', '<dummy/>')));

  const cancelled = await cancel();

  // The refused cancel, as the verifiers proved it: the failure flag on top,
  // the seatless one under it, and nothing refunded.
  expect(cancelled.statusCode).toBe(502);
  const row = table.row(REF);
  expect(row.booking_details.needs_review).toMatchObject({ cancelFailed: true, previous: { reason: SEATLESS } });
  expect(axios.put).not.toHaveBeenCalled();
  return row;
};

describe('a PNR with no confirmed seat whose cancel the airline refused', () => {
  it('still tells the pages the seat is not confirmed', async () => {
    const row = await refusedCancel();

    // What both booking reads send the browser: enough to know. The customer
    // pages' test (tests/components/seatlessAfterRefusedCancel.test.jsx)
    // renders this exact shape.
    const { toClientBooking } = await import('../../backend/routes/flight.routes.js');
    expect(toClientBooking(row).needs_review).toEqual({
      reason: 'GDS cancellation failed; refund withheld to avoid paying out against a live booking',
      no_confirmed_seat: true,
      ticket_numbers_missing: false,
      commit_unknown: false,
      unrecorded_cancellation: false,
    });
  });

  it('answers a reload of the order page as under review, not "already booked"', async () => {
    await refusedCancel();

    const retry = await retryOrder();

    expect(retry.body.mode).toBeUndefined();
    expect(retry.status).toBe(409);
    expect(retry.body.code).toBe('BOOKING_NEEDS_REVIEW');
    expect(createFlightOrder).not.toHaveBeenCalled();
    expect(axios.put).not.toHaveBeenCalled();
  });

  // Round 5: resolving says a person dealt with it, not that the airline gave
  // a seat; the note is free text. This asserted `false` - the pages then said
  // "Your seats are reserved" of a seat nothing on the booking records.
  it('is not settled by a person resolving the flag on top; a ticket on the booking settles it', async () => {
    const row = seatless();
    row.booking_details.needs_review = {
      reason: 'GDS cancellation failed; refund withheld to avoid paying out against a live booking',
      source: 'cancellation',
      cancelFailed: true,
      previous: row.booking_details.needs_review,
      resolved_at: '2026-09-22T09:00:00Z',
      resolution: 'seat confirmed with the airline by phone',
    };
    const { toClientBooking } = await import('../../backend/routes/flight.routes.js');

    expect(toClientBooking(row).needs_review.no_confirmed_seat).toBe(true);
    row.booking_details.tickets = [{ number: '220-7491174926' }];
    expect(toClientBooking(row).needs_review.no_confirmed_seat).toBe(false);
  });

  it('is not claimed for a booking that never had the flag', async () => {
    const row = seatless();
    row.booking_details.needs_review = { reason: 'chain failed after commit at issueTicket', ticketed: false };
    const { toClientBooking } = await import('../../backend/routes/flight.routes.js');

    expect(toClientBooking(row).needs_review).toEqual({
      reason: 'chain failed after commit at issueTicket', no_confirmed_seat: false, ticket_numbers_missing: false, commit_unknown: false,
      unrecorded_cancellation: false,
    });
  });
});
