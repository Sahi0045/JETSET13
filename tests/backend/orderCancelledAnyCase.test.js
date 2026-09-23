import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * The order route's "this booking was cancelled" answer, whatever the case of
 * the status.
 *
 * It compared `existing.status === 'cancelled'` exactly, while the reads next
 * to it lowercase the status (unrecordedCancellationForCustomerOf, statusOf in
 * shared/reviewQueue.js). A row reading 'CANCELLED' was therefore not cancelled
 * to the route, and - its unrecorded-cancel flag read as settled by that same
 * status - was answered ALREADY_BOOKED and ticketed: "Booking Confirmed!" on a
 * cancelled booking. The database allows the lowercase value only, so this is
 * hardening; the comparison now reads the status as every other reader does.
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
const A = '220-1111111111';
const JANE = [{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', gender: 'FEMALE' }];
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

// flagUnrecordedCancellation's flag, as the cancel handler writes it.
const unrecorded = {
  reason: 'cancellation carried out but not recorded: airline reservation released, payment VOID 291 USD; '
    + 'check the airline and ARC Pay and record it by hand',
  source: 'cancellation', unrecorded: true, ticketsVoided: true, at: '2026-09-22T08:03:00Z', paymentAction: 'VOID', refundAmount: 291,
};

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
    gds_chain: { state: 'finished', finishedAt: '2026-09-21T08:01:00Z' },
    confirmation_email: { state: 'sent' },
    ...details,
  },
});

const expectCancelled = (res) => {
  expect(res.status).toBe(409);
  expect(res.body.code).toBe('BOOKING_CANCELLED');
  expect(res.body.mode).toBeUndefined();
  expect(res.body.ticketed).toBeUndefined();
  expect(createFlightOrder).not.toHaveBeenCalled();
};

describe('a cancelled booking whose status is not lowercase', () => {
  it.each(['CANCELLED', 'Cancelled'])('%s: BOOKING_CANCELLED, not ALREADY_BOOKED', async (status) => {
    expectCancelled(await retry(row({}, { status, payment_status: 'refunded' })));
  });

  it('CANCELLED, with the unrecorded-cancel flag it settled: BOOKING_CANCELLED, not "Booking Confirmed!"', async () => {
    expectCancelled(await retry(row({ needs_review: unrecorded }, { status: 'CANCELLED', payment_status: 'refunded' })));
  });
});

// Fences.
describe('next to it', () => {
  it('cancelled: BOOKING_CANCELLED, as before', async () => {
    expectCancelled(await retry(row({}, { status: 'cancelled', payment_status: 'refunded' })));
  });

  it('a ticketed booking nobody cancelled: ALREADY_BOOKED and ticketed, as before', async () => {
    const res = await retry(row());

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('ALREADY_BOOKED');
    expect(res.body.ticketed).toBe(true);
  });
});
