import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * A reload of the order page for a booking that already has a PNR: 200
 * ALREADY_BOOKED, answered from the row before the gateway is asked - and
 * before the booking-disabled gate, so in production today.
 *
 * It read no payment record. A held PNR refunded from the Payments tab (which
 * writes payment_status and nothing else) was answered like a paid one, and
 * the order page told that customer their seats were held, the team was
 * finishing their ticket, and "Total Paid ... Payment received". The answer
 * now carries paymentState, as the 409 retry answers do.
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

// A paid PNR held for review after its ticket failed to issue.
const heldPnr = (over = {}, details = {}) => ({
  id: 'bk-held1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending_ticketing',
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
    gds: { ticketed: false },
    tickets: [],
    gds_chain: { state: 'finished', finishedAt: '2026-09-21T08:01:00Z' },
    confirmation_email: { state: 'sent' },
    needs_review: { reason: 'chain failed after commit at issueTicket', ticketed: false, at: '2026-09-21T08:01:00Z' },
    ...details,
  },
});

const createFlightOrder = vi.fn();

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
  const mailer = { sendBookingNotificationEmails: vi.fn(async () => ({ success: true })), sendEmail: vi.fn(), sendCancellationNotificationEmails: vi.fn() };
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

describe('a reload of the order page for a held PNR refunded without being cancelled', () => {
  it('carries the payment record: returned', async () => {
    const res = await retry(heldPnr({ payment_status: 'refunded' }));

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('ALREADY_BOOKED');
    expect(res.body.paymentState).toBe('returned');
    expect(createFlightOrder).not.toHaveBeenCalled();
    expect(axios.get).not.toHaveBeenCalled();
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('carries the payment record: partly returned', async () => {
    const res = await retry(heldPnr({ payment_status: 'partially_refunded' }));

    expect(res.body.mode).toBe('ALREADY_BOOKED');
    expect(res.body.paymentState).toBe('partly_returned');
  });

  it('and says a paid one is held', async () => {
    const res = await retry(heldPnr());

    expect(res.body.paymentState).toBe('held');
  });
});

// Fence: the rest of the answer, and the paid bookings next to it, as today.
describe('the answers next to it', () => {
  it('a paid held PNR: the same 200', async () => {
    const res = await retry(heldPnr());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      mode: 'ALREADY_BOOKED',
      pnr: 'HELD99',
      bookingReference: REF,
      ticketed: false,
      tickets: [],
      needsReview: true,
      message: 'This booking already exists; its ticket has not been issued yet',
      data: { id: 'HELD99', pnr: 'HELD99', status: 'PENDING_TICKETING', bookingReference: REF },
    });
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('a refunded held PNR keeps the rest of that answer', async () => {
    const res = await retry(heldPnr({ payment_status: 'refunded' }));

    expect(res.body).toMatchObject({
      success: true, pnr: 'HELD99', ticketed: false, needsReview: true,
      message: 'This booking already exists; its ticket has not been issued yet',
      data: { status: 'PENDING_TICKETING' },
    });
  });

  it('a ticketed booking: "This booking already exists", CONFIRMED', async () => {
    const res = await retry(heldPnr({ status: 'confirmed' }, {
      gds: { ticketed: true }, tickets: [{ number: '220-7491174926' }], needs_review: undefined,
    }));

    expect(res.body).toMatchObject({ mode: 'ALREADY_BOOKED', ticketed: true, message: 'This booking already exists', data: { status: 'CONFIRMED' } });
  });

  it('a PNR with no confirmed seat is still refused as under review, not "already booked"', async () => {
    const res = await retry(heldPnr({}, { needs_review: { reason: 'chain failed after commit at segmentStatus', ticketed: false } }));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_NEEDS_REVIEW');
  });
});
