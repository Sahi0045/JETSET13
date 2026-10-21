import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The cruise and hotel "save booking" calls after payment cannot touch a row
 * that is not their own paid checkout.
 *
 * POST /api/cruises/bookings and POST /api/hotels/bookings take no session,
 * and upserted on booking_reference whatever orderId and userId the body
 * named; the indicator check was skipped when the body carried none. So a
 * reference alone rewrote ANY row of the bookings table - a customer's flight
 * booking included - with a new owner (or none, and the caller's email), and a
 * wrong indicator reset any row to pending/unpaid. utils/checkoutSave.js now
 * requires the row checkout created for this product and ARC's indicator for
 * it; the owner and amount are checkout's own.
 */

const VICTIM = '0b7c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4';
const ATTACKER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const REF = 'FLT0A1B2C3D4E5F60';

const victimRow = () => ({
  id: 'victim-row', booking_reference: REF, travel_type: 'flight', status: 'confirmed',
  payment_status: 'paid', user_id: VICTIM, created_at: '2026-09-20T10:00:00Z', total_amount: 812.4,
  booking_details: {
    pnr: 'ABC123', amadeus_order_id: 'ABC123', order_id: REF, customer_email: 'victoria@example.com',
    travelers: [{ id: '1', firstName: 'Victoria', lastName: 'Victim', dateOfBirth: '1990-01-01', email: 'victoria@example.com', mobile: '+15550001111' }],
  },
  passenger_details: [{ firstName: 'Victoria', lastName: 'Victim', email: 'victoria@example.com' }],
});

let rows = [];
const at = (row, path) => path.split(/->>?/).reduce((v, k) => (v == null ? undefined : v[k]), row);

// A bookings table with real upsert-on-booking_reference semantics.
const tableQuery = () => {
  let filtered = [...rows];
  let desc = false;
  let lim = null;
  let upserted = null;
  const q = {};
  q.select = () => q;
  q.or = (expr) => {
    const clauses = String(expr).split(',').map((c) => { const m = c.match(/^(.*)\.eq\.(.*)$/); return [m[1], m[2]]; });
    filtered = filtered.filter((r) => clauses.some(([col, val]) => String(at(r, col) ?? '') === val));
    return q;
  };
  q.eq = (col, val) => { filtered = filtered.filter((r) => String(at(r, col) ?? '') === String(val)); return q; };
  q.filter = (col, _op, val) => q.eq(col, val);
  q.order = (_c, { ascending } = {}) => { desc = ascending === false; return q; };
  q.limit = (n) => { lim = n; return q; };
  const result = () => {
    if (upserted) return [upserted];
    let out = [...filtered].sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (desc) out.reverse();
    if (lim != null) out = out.slice(0, lim);
    return out;
  };
  q.maybeSingle = async () => ({ data: result()[0] ?? null, error: null });
  q.single = async () => ({ data: result()[0] ?? null, error: null });
  q.upsert = (row) => {
    const i = rows.findIndex((r) => r.booking_reference === row.booking_reference);
    if (i >= 0) rows[i] = { ...rows[i], ...row };
    else rows.push({ id: `row-${rows.length}`, created_at: new Date().toISOString(), ...row });
    upserted = rows.find((r) => r.booking_reference === row.booking_reference);
    return q;
  };
  q.update = () => q;
  q.insert = () => q;
  q.then = (resolve) => resolve({ data: result(), error: null });
  return q;
};

const getFlightOrderDetails = vi.fn();
vi.mock('../../backend/services/flightProvider.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: new Proxy(actual.default, {
      get: (target, key) => (key === 'getFlightOrderDetails' ? (...a) => getFlightOrderDetails(...a) : target[key]),
    }),
  };
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
  const flights = (await import('../../backend/routes/flight.routes.js')).default;
  const cruises = (await import('../../backend/routes/cruise.routes.js')).default;
  const hotels = (await import('../../backend/routes/hotel.routes.js')).default;
  const server = express();
  server.use(express.json());
  server.use('/api/flights', flights);
  server.use('/api/cruises', cruises);
  server.use('/api/hotels', hotels);
  return server;
};
const as = (id) => JSON.stringify({ id, role: 'user' });

beforeEach(() => {
  vi.resetModules();
  rows = [victimRow()];
  getFlightOrderDetails.mockReset();
  getFlightOrderDetails.mockImplementation(async (locator) => ({
    success: true, pnr: locator,
    data: { id: locator, travelers: [{ name: { firstName: 'VICTORIA', lastName: 'VICTIM' } }] },
  }));
});

describe("a stranger holding only a flight booking's reference", () => {
  it('cannot take the booking over through the unauthenticated cruise save', async () => {
    const server = await app();

    // No session at all: just the reference and the stranger's own account id.
    const save = await request(server).post('/api/cruises/bookings').send({ orderId: REF, userId: ATTACKER, totalAmount: 1 });

    // The stranger now reads the victim's booking and live PNR as its owner...
    const read = await request(server).get(`/api/flights/bookings/${REF}`).set('x-test-user', as(ATTACKER));
    const pnr = await request(server).get(`/api/flights/order/${REF}`).set('x-test-user', as(ATTACKER));
    // ...and the victim has lost it.
    const victimRead = await request(server).get(`/api/flights/bookings/${REF}`).set('x-test-user', as(VICTIM));

    expect({
      save: save.status,
      ownerAfter: rows[0].user_id,
      travelTypeAfter: rows[0].travel_type,
      strangerRead: read.status,
      strangerSawTraveller: JSON.stringify(read.body).includes('Victim'),
      strangerPnrRetrieve: getFlightOrderDetails.mock.calls.map((c) => c[0]),
      victimRead: victimRead.status,
    }).toEqual({
      save: expect.any(Number),
      ownerAfter: VICTIM,
      travelTypeAfter: 'flight',
      strangerRead: 404,
      strangerSawTraveller: false,
      strangerPnrRetrieve: [],
      victimRead: 200,
    });
  });

  it('cannot open it with no account through the unauthenticated hotel save', async () => {
    const server = await app();

    // Signed out: plant an email of the stranger's own on the row.
    await request(server).post('/api/hotels/bookings').send({ orderId: REF, guestInfo: { firstName: 'X', lastName: 'Y', email: 'stranger@example.com' } });
    const read = await request(server).get(`/api/flights/bookings/${REF}`).set('x-booking-email', 'stranger@example.com');

    expect({
      ownerAfter: rows[0].user_id,
      strangerRead: read.status,
      strangerSawPnr: JSON.stringify(read.body).includes('ABC123'),
    }).toEqual({ ownerAfter: VICTIM, strangerRead: 404, strangerSawPnr: false });
  });
});

describe('a wrong indicator', () => {
  it("never resets another customer's paid flight booking", async () => {
    const server = await app();
    const res = await request(server).post('/api/cruises/bookings').send({ orderId: REF, transactionId: 'WRONG' });
    const res2 = await request(server).post('/api/hotels/bookings').send({ orderId: REF, resultIndicator: 'WRONG' });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res2.status).toBeGreaterThanOrEqual(400);
    expect(rows[0]).toMatchObject({ status: 'confirmed', payment_status: 'paid', user_id: VICTIM, travel_type: 'flight' });
  });
});

describe('a save with no checkout row behind it', () => {
  it('creates nothing', async () => {
    const server = await app();
    const res = await request(server).post('/api/cruises/bookings').send({ orderId: 'CRZ0NEWREF00000', transactionId: 'SI', userId: ATTACKER, totalAmount: 1 });
    expect(res.status).toBe(404);
    expect(rows.find((r) => r.booking_reference === 'CRZ0NEWREF00000')).toBeUndefined();
  });
});

// Fences: the payer of a real cruise or hotel checkout still confirms it.
describe("the payer of this product's own checkout", () => {
  const checkoutRow = (ref, travelType, owner) => ({
    id: `co-${ref}`, booking_reference: ref, travel_type: travelType, status: 'pending', payment_status: 'unpaid',
    user_id: owner, created_at: '2026-09-22T10:00:00Z', total_amount: 500,
    booking_details: { order_id: ref, success_indicator: 'SI-OK', session_id: 'SESSION1' },
  });

  it('confirms a cruise with the indicator ARC gave it, keeping checkout\'s owner and amount', async () => {
    rows.push(checkoutRow('CRZ0A1B2C3D4E5F6', 'cruise', VICTIM));
    const server = await app();
    const res = await request(server).post('/api/cruises/bookings').send({
      orderId: 'CRZ0A1B2C3D4E5F6', transactionId: 'SI-OK', userId: ATTACKER, totalAmount: 1, cruiseName: 'Caribbean',
    });
    expect(res.status).toBe(200);
    const row = rows.find((r) => r.booking_reference === 'CRZ0A1B2C3D4E5F6');
    expect(row).toMatchObject({ status: 'confirmed', payment_status: 'paid', user_id: VICTIM, total_amount: 500, travel_type: 'cruise' });
    expect(row.booking_details.success_indicator).toBe('SI-OK');
  });

  it('confirms a hotel with the indicator ARC gave it; a guest checkout stays unowned', async () => {
    rows.push(checkoutRow('HTL0A1B2C3D4E5F6', 'hotel', null));
    const server = await app();
    const res = await request(server).post('/api/hotels/bookings').send({
      orderId: 'HTL0A1B2C3D4E5F6', resultIndicator: 'SI-OK', userId: ATTACKER, totalAmount: 1,
      guestInfo: { firstName: 'Gus', lastName: 'Guest', email: 'gus@example.com' },
    });
    expect(res.status).toBe(200);
    expect(rows.find((r) => r.booking_reference === 'HTL0A1B2C3D4E5F6')).toMatchObject({ status: 'confirmed', payment_status: 'paid', user_id: null, total_amount: 500 });
  });

  it('is refused, and the row left as it was, with a wrong indicator', async () => {
    rows.push(checkoutRow('CRZ0FFFFFFFFFFFF', 'cruise', VICTIM));
    const server = await app();
    const res = await request(server).post('/api/cruises/bookings').send({ orderId: 'CRZ0FFFFFFFFFFFF', transactionId: 'NOPE' });
    expect(res.status).toBe(400);
    expect(rows.find((r) => r.booking_reference === 'CRZ0FFFFFFFFFFFF')).toMatchObject({ status: 'pending', payment_status: 'unpaid', user_id: VICTIM });
  });
});
