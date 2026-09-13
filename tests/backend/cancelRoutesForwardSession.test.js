import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * My Trips and the admin panel cancel through the real, refunding path.
 *
 * Both routes check who is asking, then hand the cancel to the orchestrated
 * handler in-process. They handed it only a body - no session - so the handler
 * saw nobody and failed. My Trips then fell back to cancelling at the airline
 * with no refund ("refund pending manual processing"); the admin panel reported
 * the failure.
 */

const OWNER = '0b7c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4';
const STRANGER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

const row = {
  id: 'uuid-1',
  booking_reference: 'FLT123',
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 291,
  user_id: OWNER,
  passenger_details: [],
  booking_details: { pnr: 'ABC123', order_id: 'FLT123', customer_email: 'owner@example.com' },
};

const cancelFlightOrder = vi.fn();

const chainFor = (data) => {
  const c = {};
  for (const m of ['select', 'update', 'insert', 'eq', 'or', 'filter', 'order', 'limit']) c[m] = vi.fn(() => c);
  c.single = vi.fn().mockResolvedValue({ data, error: null });
  c.maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
  c.then = (resolve) => resolve({ data: null, error: null });
  return c;
};

vi.mock('../../backend/routes/payment/arcpay.config.js', () => ({
  supabase: { from: vi.fn(() => chainFor(row)) },
  ARC_PAY_CONFIG: { BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT' },
  getArcPayAuthConfig: () => ({ headers: {} }),
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

// The real middleware verifies a token; here a signed-in request carries its
// user in a header, which is all these routes read from it.
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
    admin: (req, res, next) => (['admin', 'superadmin'].includes(req.user?.role)
      ? next()
      : res.status(403).json({ message: 'Not authorized as an admin' })),
  };
});

const makeApp = async () => {
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(() => chainFor(row));
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  return app;
};

const as = (user) => ({ 'x-test-user': JSON.stringify(user) });

beforeEach(() => {
  vi.resetModules();
  cancelFlightOrder.mockReset();
  cancelFlightOrder.mockResolvedValue({ success: true });
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
});

describe('My Trips: DELETE /flights/order/:ref', () => {
  it("cancels the owner's booking through the orchestrated path, not the no-refund fallback", async () => {
    const res = await request(await makeApp()).delete('/api/flights/order/FLT123').set(as({ id: OWNER }));

    expect(res.body.mode).not.toBe('FALLBACK_CANCELLATION');
    expect(res.body.error || '').not.toMatch(/not authorized/i);
    // Once, by record locator. The fallback would have called it a second time.
    expect(cancelFlightOrder).toHaveBeenCalledTimes(1);
    expect(cancelFlightOrder).toHaveBeenCalledWith('ABC123');
  });

  it("refuses another customer's booking before anything is cancelled", async () => {
    const res = await request(await makeApp()).delete('/api/flights/order/FLT123').set(as({ id: STRANGER }));

    expect(res.status).toBe(404);
    expect(cancelFlightOrder).not.toHaveBeenCalled();
  });
});

describe('admin panel: POST /flights/admin-bookings/:id/cancel', () => {
  it('cancels through the orchestrated path with the admin session', async () => {
    const res = await request(await makeApp())
      .post('/api/flights/admin-bookings/uuid-1/cancel')
      .set(as({ id: STRANGER, role: 'admin' }))
      .send({ reason: 'Admin cancellation' });

    expect(res.body.error || '').not.toMatch(/not authorized/i);
    expect(cancelFlightOrder).toHaveBeenCalledWith('ABC123');
  });
});
