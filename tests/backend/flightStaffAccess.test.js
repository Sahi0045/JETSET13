import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Visa agents are not flight staff, and a refused cancel is not a reason to
 * cancel anyway.
 *
 * `isStaff` in flight.routes.js counted role `agent` - the visa agents' role -
 * so every visa agent could open any customer's booking with its passports and
 * dates of birth. DELETE /order then handed their cancel to the orchestrator,
 * which refused them, and treated that refusal like an outage: its fallback
 * cancelled the booking at the airline and marked it cancelled, with no refund.
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
  created_at: '2026-09-12T10:00:00Z',
  passenger_details: [{ firstName: 'Ann', lastName: 'Lee', passportNumber: 'X1234567', dateOfBirth: '1990-01-01' }],
  booking_details: { pnr: 'ABC123', order_id: 'FLT123', customer_email: 'owner@example.com' },
};

const cancelFlightOrder = vi.fn();
const getFlightOrderDetails = vi.fn();
const orchestrator = vi.fn();
let updates = [];

const chainFor = (data) => {
  const c = {};
  for (const m of ['select', 'insert', 'eq', 'or', 'filter', 'order', 'limit', 'is']) c[m] = vi.fn(() => c);
  c.update = vi.fn((payload) => { updates.push(payload); return c; });
  c.single = vi.fn().mockResolvedValue({ data, error: null });
  c.maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
  c.then = (resolve) => resolve({ data: null, error: null });
  return c;
};

vi.mock('../../backend/routes/payment/operations.handlers.js', () => ({
  handleCancelBookingAction: (...args) => orchestrator(...args),
  reverseArcPaymentForOrder: vi.fn(),
}));

vi.mock('../../backend/services/flightProvider.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: new Proxy(actual.default, {
      get: (target, key) => {
        if (key === 'cancelFlightOrder') return (...args) => cancelFlightOrder(...args);
        if (key === 'getFlightOrderDetails') return (...args) => getFlightOrderDetails(...args);
        return target[key];
      },
    }),
  };
});

// A signed-in request carries its user in a header, as in
// cancelRoutesForwardSession.test.js.
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
const VISA_AGENT = { id: STRANGER, role: 'agent' };

/** The orchestrator answers the way handleCancelBookingAction does. */
const orchestratorAnswers = (status, body) => {
  orchestrator.mockImplementation(async (_req, res) => res.status(status).json(body));
};

const expectNothingCancelled = () => {
  expect(cancelFlightOrder).not.toHaveBeenCalled();
  expect(updates.filter((u) => u?.status === 'cancelled')).toEqual([]);
};

beforeEach(() => {
  vi.resetModules();
  updates = [];
  cancelFlightOrder.mockReset();
  cancelFlightOrder.mockResolvedValue({ success: true });
  getFlightOrderDetails.mockReset();
  getFlightOrderDetails.mockResolvedValue({ data: { id: 'ABC123' }, pnr: 'ABC123' });
  orchestrator.mockReset();
});

describe('a visa agent', () => {
  it("cannot open a customer's booking", async () => {
    const res = await request(await makeApp()).get('/api/flights/bookings/FLT123').set(as(VISA_AGENT));
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('X1234567');
  });

  it("cannot read a customer's order from the GDS", async () => {
    const res = await request(await makeApp()).get('/api/flights/order/FLT123').set(as(VISA_AGENT));
    expect(res.status).toBe(404);
    expect(getFlightOrderDetails).not.toHaveBeenCalled();
  });

  it("cannot cancel a customer's booking, by any path", async () => {
    const res = await request(await makeApp()).delete('/api/flights/order/FLT123').set(as(VISA_AGENT));
    expect(res.status).toBe(404);
    expect(orchestrator).not.toHaveBeenCalled();
    expectNothingCancelled();
  });

  it('is not proof of who paid for an order', async () => {
    const { provesPayer } = await import('../../backend/routes/flight.routes.js');
    expect(provesPayer({ user: VISA_AGENT, body: {} }, row)).toBe(false);
    expect(provesPayer({ user: { id: STRANGER, role: 'admin' }, body: {} }, row)).toBe(true);
  });
});

it('an admin still opens any booking', async () => {
  const res = await request(await makeApp()).get('/api/flights/bookings/FLT123').set(as({ id: STRANGER, role: 'admin' }));
  expect(res.status).toBe(200);
  expect(res.body.data.bookingReference).toBe('FLT123');
  // Staff see the passport number as stored; everyone else gets it masked.
  expect(res.body.data.passengerData[0].passportNumber).toBe('X1234567');
});

describe('DELETE /flights/order/:ref when the orchestrator says no', () => {
  it('passes a refusal through unchanged, and cancels nothing', async () => {
    orchestratorAnswers(403, { success: false, code: 'NOT_AUTHORIZED', error: 'Not authorized to cancel this booking' });
    const res = await request(await makeApp()).delete('/api/flights/order/FLT123').set(as({ id: OWNER }));

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, code: 'NOT_AUTHORIZED', error: 'Not authorized to cancel this booking' });
    expect(res.body.mode).not.toBe('FALLBACK_CANCELLATION');
    expectNothingCancelled();
  });

  it('passes "already cancelled" through unchanged', async () => {
    orchestratorAnswers(400, { success: false, error: 'Booking is already cancelled' });
    const res = await request(await makeApp()).delete('/api/flights/order/FLT123').set(as({ id: OWNER }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Booking is already cancelled');
    expectNothingCancelled();
  });

  it('passes a failed write through as the error it is, without its internals', async () => {
    orchestratorAnswers(500, { success: false, error: 'Failed to update booking status', details: 'deadlock detected' });
    const res = await request(await makeApp()).delete('/api/flights/order/FLT123').set(as({ id: OWNER }));

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to update booking status');
    expect(JSON.stringify(res.body)).not.toContain('deadlock');
    expectNothingCancelled();
  });

  it('still says when it needs review, as before', async () => {
    orchestratorAnswers(502, { success: false, error: 'We could not cancel your reservation with the airline.', needsReview: true });
    const res = await request(await makeApp()).delete('/api/flights/order/FLT123').set(as({ id: OWNER }));

    expect(res.status).toBe(502);
    expect(res.body.needsReview).toBe(true);
    expectNothingCancelled();
  });
});

describe('DELETE /flights/order/:ref when the orchestrator cannot be reached', () => {
  it('falls back to cancelling at the airline, as it was meant to', async () => {
    orchestrator.mockRejectedValue(new Error('module failed to load'));
    const res = await request(await makeApp()).delete('/api/flights/order/FLT123').set(as({ id: OWNER }));

    expect(cancelFlightOrder).toHaveBeenCalled();
    expect(res.body.mode).toBe('FALLBACK_CANCELLATION');
  });

  it('falls back when it gave no answer at all', async () => {
    orchestrator.mockResolvedValue(undefined);
    const res = await request(await makeApp()).delete('/api/flights/order/FLT123').set(as({ id: OWNER }));

    expect(cancelFlightOrder).toHaveBeenCalled();
    expect(res.body.mode).toBe('FALLBACK_CANCELLATION');
  });
});
