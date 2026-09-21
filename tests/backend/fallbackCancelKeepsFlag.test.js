import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * DELETE /api/flights/order/:orderId's fallback cancel, when the airline cannot
 * be reached.
 *
 * It runs only when the orchestrated cancel threw. Its review flag replaced
 * whatever flag the booking had, with no `previous`: a PNR the airline had
 * confirmed no seat on lost that fact for every reader, and the pages said
 * "Your seats are reserved" again. The flag also said nothing of what it was,
 * so on a ticketed booking the alarm skipped it as done, while the customer
 * was told "Our team has been alerted".
 */

const REF = 'FLTFB1';
const OWNER = { id: '0b7c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4', role: 'user' };
const SEATLESS = { reason: 'chain failed after commit at segmentStatus', ticketed: false, at: '2026-09-21T08:01:00Z', alerted_at: '2026-09-21T08:15:00Z' };

const row = (details = {}) => ({
  id: 'bk-fb1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending_ticketing',
  payment_status: 'paid',
  total_amount: 291,
  user_id: OWNER.id,
  created_at: '2026-09-21T08:00:00Z',
  booking_details: { pnr: 'SEAT42', order_id: REF, customer_email: 'jane@example.com', gds: { ticketed: false }, tickets: [], ...details },
});

let table = fakeBookingsTable([]);
const cancelFlightOrder = vi.fn();

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return { ...actual, get supabase() { return { from: (...args) => table.from(...args) }; } };
});

// The orchestrated cancel throws: the only way the fallback runs.
vi.mock('../../backend/routes/payment/operations.handlers.js', async (importOriginal) => ({
  ...(await importOriginal()),
  handleCancelBookingAction: async () => { throw new Error('orchestrator crashed'); },
}));

vi.mock('../../backend/services/flightProvider.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: new Proxy(actual.default, {
      get: (target, key) => (key === 'cancelFlightOrder' ? (...args) => cancelFlightOrder(...args) : target[key]),
    }),
  };
});

vi.mock('../../backend/middleware/auth.middleware.js', async (importOriginal) => {
  const actual = await importOriginal();
  const userFrom = (req) => (req.headers['x-test-user'] ? JSON.parse(req.headers['x-test-user']) : null);
  return {
    ...actual,
    protect: (req, res, next) => {
      req.user = userFrom(req);
      return req.user ? next() : res.status(401).json({ message: 'Not authorized' });
    },
    optionalProtect: (req, res, next) => { req.user = userFrom(req); next(); },
  };
});

const deleteOrder = async (bookingRow) => {
  table = fakeBookingsTable([bookingRow]);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  return request(app).delete(`/api/flights/order/${REF}`).set('x-test-user', JSON.stringify(OWNER)).send();
};

beforeEach(() => {
  vi.resetModules();
  cancelFlightOrder.mockReset();
  cancelFlightOrder.mockRejectedValue(Object.assign(new Error('getaddrinfo ENOTFOUND'), { technicalError: 'host unreachable' }));
});

describe('the fallback cancel that could not reach the airline', () => {
  it('keeps the earlier flag under its own, so the seat stays unconfirmed for the pages', async () => {
    const res = await deleteOrder(row({ needs_review: SEATLESS }));

    expect(res.status).toBe(502);
    const saved = table.row(REF);
    expect(saved.booking_details.needs_review).toMatchObject({
      reason: 'fallback cancel could not reach the GDS; booking may still be live',
      previous: { reason: SEATLESS.reason },
    });
    const { toClientBooking } = await import('../../backend/routes/flight.routes.js');
    expect(toClientBooking(saved).needs_review.no_confirmed_seat).toBe(true);
  });

  it('is a failed cancellation the alarm announces, on a ticketed booking too', async () => {
    const res = await deleteOrder(row({ gds: { ticketed: true }, tickets: [{ number: '220-7491174932' }] }));

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/Our team has been alerted/);
    const { selectUnannounced } = await import('../../backend/jobs/needsReviewAlert.job.js');
    const { attentionOf } = await import('../../shared/reviewQueue.js');
    expect(selectUnannounced([table.row(REF)])).toHaveLength(1);
    expect(attentionOf(table.row(REF))?.kind).toBe('cancel_failed');
  });
});
