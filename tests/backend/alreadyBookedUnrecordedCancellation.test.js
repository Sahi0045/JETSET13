import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * A reload of the order page after a cancel that went through - every ticket
 * voided, the PNR released, the payment voided - and whose "cancelled" write
 * failed. flagUnrecordedCancellation (payment/operations.handlers.js) leaves
 * the row as it was, confirmed and paid, with gds.ticketed and its ticket
 * list, and a flag that says only ticketsVoided, with no numbers. The customer
 * was told "Please do not try again - call (877) 538-7380".
 *
 * The order route answered it ALREADY_BOOKED, ticketed:true with the void
 * number as its ticket, and the order page said "Booking Confirmed!" and
 * handed the confirmation page an issued ticket. It is now answered as the
 * review below answers any other booking a person is sorting out, and as it
 * already was with no PNR: 409 BOOKING_NEEDS_REVIEW, its payment neither held
 * nor returned (paymentStateOf 'unconfirmed'), nothing sent to the airline.
 */

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

const REF = 'FLTHELD1';
const JANE = [{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', gender: 'FEMALE' }];
const createFlightOrder = vi.fn();
let mailer;

const retry = async (row) => {
  table = fakeBookingsTable([row]);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  return request(app).post('/api/flights/order').send({
    bookingReference: REF, orderId: REF, transactionId: `SI-${REF}`, contactInfo: { email: 'jane@example.com' }, travelers: JANE,
  });
};

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  // As in production: booking is switched off, and this answer comes first.
  vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'false');
  vi.resetModules();
  createFlightOrder.mockReset();
  vi.doMock('../../backend/services/flightProvider.js', () => ({
    default: { createFlightOrder },
    providerStatus: () => ({ bookingEnabled: false }),
  }));
  mailer = { sendBookingNotificationEmails: vi.fn(async () => ({ success: true })), sendEmail: vi.fn(), sendCancellationNotificationEmails: vi.fn() };
  vi.doMock('../../backend/services/emailService.js', () => ({ ...mailer, default: mailer }));
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockReset();
});

afterEach(() => {
  vi.doUnmock('../../backend/services/flightProvider.js');
  vi.doUnmock('../../backend/services/emailService.js');
  vi.unstubAllEnvs();
});

const A = '220-1111111111';
const HOUR_AGO = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();

// flagUnrecordedCancellation's flag, as the cancel handler writes it.
const unrecorded = (over = {}) => ({
  reason: 'cancellation carried out but not recorded: airline reservation released, payment VOID 291 USD; '
    + 'check the airline and ARC Pay and record it by hand',
  source: 'cancellation',
  unrecorded: true,
  ticketsVoided: true,
  at: '2026-09-22T08:03:00Z',
  paymentAction: 'VOID',
  refundAmount: 291,
  ...over,
});

// A ticketed booking as the success path left it, and as the cancel left it:
// its claim expired, the row otherwise untouched.
const row = (details = {}, over = {}) => ({
  id: 'bk-held1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 291,
  user_id: 'user-1',
  created_at: new Date().toISOString(),
  ...over,
  booking_details: {
    pnr: 'HELD99',
    order_id: REF,
    success_indicator: `SI-${REF}`,
    customer_email: 'jane@example.com',
    gds: { ticketed: true },
    tickets: [{ number: A, travelerId: '1' }],
    gds_chain: { state: 'cancelling', startedAt: HOUR_AGO(), stateBeforeCancel: 'finished' },
    confirmation_email: { state: 'sent' },
    ...details,
  },
});

const expectUnderReview = (res) => {
  expect(res.status).toBe(409);
  expect(res.body.code).toBe('BOOKING_NEEDS_REVIEW');
  expect(res.body.needsReview).toBe(true);
  expect(res.body.bookingReference).toBe(REF);
  // Neither held nor refunded: the customer was told we would confirm which.
  expect(res.body.paymentState).toBe('unconfirmed');
  expect(res.body.error).toMatch(/our team is reviewing it/);
  expect(res.body.error).not.toMatch(/refunded|held/);
  expect(res.body.mode).toBeUndefined();
  expect(res.body.ticketed).toBeUndefined();
  expect(res.body.tickets).toBeUndefined();
  expect(createFlightOrder).not.toHaveBeenCalled();
  expect(axios.get).not.toHaveBeenCalled();
  expect(axios.put).not.toHaveBeenCalled();
};

describe('a reload after a cancel that released the PNR and could not record it', () => {
  it('is under review, not ALREADY_BOOKED and ticketed', async () => {
    expectUnderReview(await retry(row({ needs_review: unrecorded() })));
  });

  it('with its flag under a later one (a retried cancel refused): the same', async () => {
    const res = await retry(row({
      needs_review: {
        reason: 'GDS cancellation failed; refund withheld to avoid paying out against a live booking',
        source: 'cancellation', cancelFailed: true, pnr: 'HELD99', at: '2026-09-22T09:00:00Z',
        previous: unrecorded(),
      },
    }));

    expectUnderReview(res);
  });

  it('whose confirmation was never sent: is sent none now', async () => {
    const res = await retry(row({ needs_review: unrecorded(), confirmation_email: undefined }));

    expectUnderReview(res);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mailer.sendBookingNotificationEmails).not.toHaveBeenCalled();
  });
});

describe('the answers next to it', () => {
  it('with no PNR: under review, as before', async () => {
    const res = await retry(row({
      pnr: undefined, gds: { ticketed: false }, tickets: [],
      needs_review: unrecorded({ ticketsVoided: false, reason: 'cancellation carried out but not recorded: no airline reservation, payment VOID 291 USD; check the airline and ARC Pay and record it by hand' }),
    }));

    expectUnderReview(res);
  });

  it('recorded cancelled by hand since: cancelled, as before', async () => {
    const res = await retry(row({ needs_review: unrecorded() }, { status: 'cancelled', payment_status: 'refunded' }));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_CANCELLED');
  });

  it('a ticketed booking nobody cancelled: ALREADY_BOOKED and ticketed, as before', async () => {
    const res = await retry(row({ gds_chain: { state: 'finished', finishedAt: '2026-09-21T08:01:00Z' } }));

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('ALREADY_BOOKED');
    expect(res.body.ticketed).toBe(true);
    expect(res.body.tickets).toEqual([{ number: A, travelerId: '1' }]);
    expect(res.body.paymentState).toBe('held');
  });

  it('a cancel the airline refused after voiding every ticket: ALREADY_BOOKED and voided, as before', async () => {
    const res = await retry(row({
      voided_tickets: [A],
      needs_review: {
        reason: 'GDS cancellation failed; refund withheld to avoid paying out against a live booking',
        source: 'cancellation', cancelFailed: true, pnr: 'HELD99', voided_tickets: [A], unvoided_tickets: [], at: '2026-09-22T08:01:00Z',
      },
    }));

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('ALREADY_BOOKED');
    expect(res.body.ticketed).toBe(false);
    expect(res.body.message).toBe('This booking already exists; its ticket has been voided');
    expect(res.body.paymentState).toBe('held');
  });
});
