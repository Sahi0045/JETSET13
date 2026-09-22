import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The order read and the order cancel act on the reservation the OWNED row
 * holds, never on the reference in the URL.
 *
 * Hosted checkout saves a row under whatever order reference it is given, owned
 * by the caller. A package checkout sent with another customer's record locator
 * as its reference (ABC123) made the caller the "owner" of that locator:
 * loadOwnedBooking matches booking_reference, order_id and amadeus_order_id,
 * newest first, so it picked the caller's planted row, and the routes then sent
 * the path value to the GDS - GET /order retrieved the stranger's PNR (names,
 * ticket numbers), and DELETE /order's fallback cancelled it. Checkout's side
 * is tested in checkoutOrderReference.test.js.
 */

const VICTIM = '0b7c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4';
const ATTACKER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

// The victim's real flight booking. Its PNR is ABC123.
const victimRow = () => ({
  id: 'victim-row', booking_reference: 'FLT1726000000000', travel_type: 'flight', status: 'confirmed',
  payment_status: 'paid', user_id: VICTIM, created_at: '2026-09-20T10:00:00Z',
  booking_details: { pnr: 'ABC123', amadeus_order_id: 'ABC123', order_id: 'FLT1726000000000' },
});
// What handleHostedCheckout wrote for a signed-in caller who posted
// { bookingType: 'package', orderId: 'ABC123', amount: 1 } before the fix.
const plantedRow = () => ({
  id: 'attacker-row', booking_reference: 'ABC123', travel_type: 'package', status: 'pending',
  payment_status: 'unpaid', user_id: ATTACKER, created_at: '2026-09-22T10:00:00Z',
  booking_details: { order_id: 'ABC123' },
});

let rows = [];

const at = (row, path) => path.split(/->>?/).reduce((v, k) => (v == null ? undefined : v[k]), row);

// A table that honours what these routes ask: or(...), eq, order(created_at),
// limit, maybeSingle/single - and accepts any write.
const tableQuery = () => {
  let filtered = [...rows];
  let desc = false;
  let lim = null;
  const q = {};
  q.select = () => q;
  q.or = (expr) => {
    const clauses = String(expr).split(',').map((c) => { const m = c.match(/^(.*)\.eq\.(.*)$/); return [m[1], m[2]]; });
    filtered = filtered.filter((r) => clauses.some(([col, val]) => String(at(r, col) ?? '') === val));
    return q;
  };
  q.eq = (col, val) => { filtered = filtered.filter((r) => String(at(r, col) ?? '') === String(val)); return q; };
  q.order = (_c, { ascending } = {}) => { desc = ascending === false; return q; };
  q.limit = (n) => { lim = n; return q; };
  const result = () => {
    let out = [...filtered].sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (desc) out.reverse();
    if (lim != null) out = out.slice(0, lim);
    return out;
  };
  q.maybeSingle = async () => ({ data: result()[0] ?? null, error: null });
  q.single = async () => ({ data: result()[0] ?? null, error: null });
  const written = { data: [{ id: 'written' }], error: null };
  const writeChain = new Proxy({}, {
    get: (_t, key) => (key === 'then'
      ? (resolve) => resolve(written)
      : () => writeChain),
  });
  q.update = () => writeChain;
  q.upsert = () => writeChain;
  q.insert = () => writeChain;
  return q;
};

const getFlightOrderDetails = vi.fn();
const cancelFlightOrder = vi.fn();
const handleCancelBookingAction = vi.fn();

vi.mock('../../backend/services/flightProvider.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: new Proxy(actual.default, {
      get: (target, key) => {
        if (key === 'getFlightOrderDetails') return (...a) => getFlightOrderDetails(...a);
        if (key === 'cancelFlightOrder') return (...a) => cancelFlightOrder(...a);
        return target[key];
      },
    }),
  };
});

vi.mock('../../backend/routes/payment/operations.handlers.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, handleCancelBookingAction: (...a) => handleCancelBookingAction(...a) };
});

vi.mock('../../backend/middleware/auth.middleware.js', async (importOriginal) => {
  const actual = await importOriginal();
  const userFrom = (req) => (req.headers['x-test-user'] ? JSON.parse(req.headers['x-test-user']) : null);
  return {
    ...actual,
    protect: (req, res, next) => { req.user = userFrom(req); return req.user ? next() : res.status(401).json({}); },
    optionalProtect: (req, res, next) => { req.user = userFrom(req); next(); },
  };
});

const app = async () => {
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(() => tableQuery());
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const server = express();
  server.use(express.json());
  server.use('/api/flights', routes);
  return server;
};
const as = (id) => JSON.stringify({ id, role: 'user' });

beforeEach(() => {
  vi.resetModules();
  rows = [victimRow(), plantedRow()];
  getFlightOrderDetails.mockReset();
  getFlightOrderDetails.mockImplementation(async (locator) => ({
    success: true,
    pnr: locator,
    data: locator === 'ABC123'
      ? { id: 'ABC123', travelers: [{ id: '1', name: { firstName: 'VICTORIA', lastName: 'VICTIM' } }], tickets: [{ number: '220-1234567890' }] }
      : null,
  }));
  cancelFlightOrder.mockReset();
  cancelFlightOrder.mockResolvedValue({ success: true });
  handleCancelBookingAction.mockReset();
});

describe('GET /api/flights/order/:ref', () => {
  it("does not hand one account another customer's PNR through a row saved under it", async () => {
    const res = await request(await app()).get('/api/flights/order/ABC123').set('x-test-user', as(ATTACKER));

    expect(getFlightOrderDetails).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain('VICTIM');
    expect(res.status).toBe(404);
  });

  // Fence: the owner still reads their own reservation, by its locator...
  it('retrieves the reservation for its owner, asked by the record locator', async () => {
    rows = [victimRow()];
    const res = await request(await app()).get('/api/flights/order/ABC123').set('x-test-user', as(VICTIM));

    expect(res.status).toBe(200);
    expect(getFlightOrderDetails).toHaveBeenCalledWith('ABC123');
    expect(res.body.pnr).toBe('ABC123');
  });

  // ...or by our own reference, which now retrieves the PNR it stored.
  it('retrieves the stored PNR when asked by our own booking reference', async () => {
    rows = [victimRow()];
    const res = await request(await app()).get('/api/flights/order/FLT1726000000000').set('x-test-user', as(VICTIM));

    expect(res.status).toBe(200);
    expect(getFlightOrderDetails).toHaveBeenCalledWith('ABC123');
  });

  // Fence: without ownership, nothing, as before.
  it('still answers 404 to an account that owns no row for the reference', async () => {
    rows = [victimRow()];
    const res = await request(await app()).get('/api/flights/order/ABC123').set('x-test-user', as(ATTACKER));

    expect(res.status).toBe(404);
    expect(getFlightOrderDetails).not.toHaveBeenCalled();
  });

  it('answers 404 for an owned booking that holds no reservation', async () => {
    rows = [plantedRow()];
    const res = await request(await app()).get('/api/flights/order/ABC123').set('x-test-user', as(ATTACKER));

    expect(res.status).toBe(404);
    expect(getFlightOrderDetails).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/flights/order/:ref when the orchestrated cancel throws', () => {
  beforeEach(() => {
    handleCancelBookingAction.mockRejectedValue(new Error('orchestrator down'));
  });

  it("never cancels another customer's PNR through a row saved under it", async () => {
    await request(await app()).delete('/api/flights/order/ABC123').set('x-test-user', as(ATTACKER));

    expect(cancelFlightOrder).not.toHaveBeenCalled();
  });

  it('hands the orchestrator the owned row, not the path value', async () => {
    rows = [victimRow()];
    await request(await app()).delete('/api/flights/order/ABC123').set('x-test-user', as(VICTIM));

    expect(handleCancelBookingAction).toHaveBeenCalled();
    expect(handleCancelBookingAction.mock.calls[0][0].body.bookingReference).toBe('FLT1726000000000');
  });

  // Fence: the owner's own fallback cancel still reaches the airline.
  it("still cancels the owner's own reservation", async () => {
    rows = [victimRow()];
    const res = await request(await app()).delete('/api/flights/order/ABC123').set('x-test-user', as(VICTIM));

    expect(cancelFlightOrder).toHaveBeenCalledWith('ABC123');
    expect(res.body.amadeusCancelled).toBe(true);
  });
});
