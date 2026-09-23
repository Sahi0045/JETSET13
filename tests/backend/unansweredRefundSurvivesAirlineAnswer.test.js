import axios from 'axios';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { shownQueryFor } from './helpers/deskShown.js';

/**
 * A refund nobody saw answered stays on the desk after the airline's answer.
 *
 * Staff Cancel & refund a paid commit that never answered BEFORE anyone knows
 * what the airline holds (the desk offers it); ARC's reply to the VOID is a
 * 504 page, or the request times out. The cancel's flag then sits on top of the
 * commit's, and the desk records the airline's answer - not held - on it. That
 * answer settled the airline question, not the money: the unknown VOID must
 * stay on Needs attention until ARC Pay is checked and the refund recorded.
 */
const REF = 'FLTUNK9';
const COMMIT_UNKNOWN = 'chain failed after commit at commit';
const tenMinutesAgo = () => new Date(Date.now() - 10 * 60_000).toISOString();

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

vi.mock('../../backend/services/flightProvider.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: new Proxy(actual.default, {
      get: (target, key) => (key === 'cancelFlightOrder' ? vi.fn() : target[key]),
    }),
  };
});

vi.mock('../../backend/middleware/auth.middleware.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    protect: (req, _res, next) => { req.user = { id: 'staff-1', email: 'desk@jetsetterss.com', role: 'support' }; next(); },
  };
});

const commitUnknown = () => {
  const at = tenMinutesAgo();
  return {
    id: 'bk-unk9',
    booking_reference: REF,
    travel_type: 'flight',
    status: 'pending',
    payment_status: 'paid',
    total_amount: 291,
    created_at: at,
    passenger_details: [{ firstName: 'Jane', lastName: 'Doe' }],
    booking_details: {
      order_id: REF,
      customer_email: 'jane@example.com',
      arc_captured_amount: 291,
      arc_captured_currency: 'USD',
      gds_chain: { state: 'in_progress', startedAt: at, claimedAt: at, attempt: 1 },
      needs_review: { reason: COMMIT_UNKNOWN, ticketed: false, at, alerted_at: at },
    },
  };
};

let mailer;

beforeEach(() => {
  vi.resetModules();
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockReset();
  axios.get.mockResolvedValue({
    status: 200,
    data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 291, currency: 'USD' } }] },
  });
  mailer = {
    sendEmail: vi.fn().mockResolvedValue({ id: 'email-mock-id' }),
    sendBookingNotificationEmails: vi.fn().mockResolvedValue({ success: true }),
    sendCancellationNotificationEmails: vi.fn().mockResolvedValue({ success: true }),
  };
  vi.doMock('../../backend/services/emailService.js', () => ({ ...mailer, default: mailer }));
});

afterEach(() => {
  vi.doUnmock('../../backend/services/emailService.js');
});

const desk = async (rows) => {
  table = fakeBookingsTable(rows, { tables: { price_settings: [], payments: [] } });
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  return {
    cancel: () => request(app).post('/api/flights/admin-bookings/bk-unk9/cancel').send({ reason: 'Customer asked' }),
    open: async () => (await request(app).get('/api/flights/admin-bookings-all?attention=open')).body.data,
    handle: async (body) => request(app).post(`/api/flights/admin-bookings/bk-unk9/resolve-review${await shownQueryFor('bk-unk9')}`).send(body),
  };
};

const summary = (row) => ({
  status: row.status,
  payment: row.payment_status,
  action: row.booking_details.cancellation?.paymentAction,
  unknown: row.booking_details.cancellation?.reversalOutcomeUnknown ?? false,
  top: row.booking_details.needs_review?.reason,
});

describe('cancel before the airline answer, then "not held"', () => {
  it('VOID answered 504: the unanswered VOID stays on the desk after the airline answer is recorded', async () => {
    // The VOID gets a proxy 504 page; if a REFUND follows (base), ARC refuses it:
    // the VOID had landed and there is nothing left to refund.
    axios.put.mockImplementation(async (_url, body) => (body.apiOperation === 'VOID'
      ? { status: 504, data: '<html>Gateway Timeout</html>' }
      : { status: 200, data: { result: 'FAILURE', error: { cause: 'INVALID_REQUEST', explanation: 'nothing to refund' } } }));
    const d = await desk([commitUnknown()]);

    const cancelled = await d.cancel();
    const [entry] = await d.open();

    const pressed = await d.handle({ note: 'Rang the airline: it has no record of this booking.', outcome: 'not_held' });
    const listed = await d.open();

    expect(listed.map((b) => b.bookingReference), 'the money question left the desk on an airline answer').toEqual([REF]);
  });

  it('VOID timed out (axios throws): same question', async () => {
    axios.put.mockImplementation(async () => { throw new Error('timeout of 30000ms exceeded'); });
    const d = await desk([commitUnknown()]);

    await d.cancel();
    const [entry] = await d.open();

    const pressed = await d.handle({ note: 'Rang the airline: it has no record of this booking.', outcome: 'not_held' });
    const listed = await d.open();

    expect(listed.map((b) => b.bookingReference), 'the money question left the desk on an airline answer').toEqual([REF]);
  });
});
