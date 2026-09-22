import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { attentionOf } from '../../shared/reviewQueue.js';

/**
 * A customer cancelling a booking whose airline commit never answered.
 *
 * The chain throws `committed: 'unknown'` from its commit step before any
 * record locator is read, so the row has no PNR and a review flag saying so
 * (tests/backend/commitNeverAnsweredReadBack.test.js drives the real order
 * route to exactly this row). Nobody knows yet whether the airline holds a
 * reservation.
 *
 * Every customer cancel - Manage Booking, My Trips, DELETE /flights/order, the
 * payments router - ends in the one orchestrated handler, which saw no PNR,
 * called no airline, reversed the whole payment and marked the row cancelled.
 * From then on the desk list skipped it (cancelled) and the duplicate check
 * skipped it: a reservation the airline may still hold, with its money gone
 * and nobody left looking at it. Staff may still cancel it, as today, but the
 * booking has to stay on the desk until a person finds out.
 */

const REF = 'FLTUNK1';
const OWNER = '0b7c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4';
const BOOKER = 'jane@example.com';
const COMMIT_UNKNOWN = 'chain failed after commit at commit';
const tenMinutesAgo = () => new Date(Date.now() - 10 * 60_000).toISOString();

let table = fakeBookingsTable([]);
const cancelFlightOrder = vi.fn();

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
      get: (target, key) => (key === 'cancelFlightOrder' ? (...args) => cancelFlightOrder(...args) : target[key]),
    }),
  };
});

// A signed-in request carries its user in a header (cancelRoutesForwardSession.test.js).
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

/** The row the order route leaves when the commit never answered, the chain's claim long lapsed. */
const commitUnknown = (over = {}, details = {}) => {
  const at = tenMinutesAgo();
  return {
    id: 'bk-unk1',
    booking_reference: REF,
    travel_type: 'flight',
    status: 'pending',
    payment_status: 'paid',
    total_amount: 291,
    user_id: OWNER,
    created_at: at,
    passenger_details: [{ firstName: 'Jane', lastName: 'Doe' }],
    ...over,
    booking_details: {
      order_id: REF,
      success_indicator: `SI-${REF}`,
      customer_email: BOOKER,
      arc_captured_amount: 291,
      arc_captured_currency: 'USD',
      gds_chain: { state: 'in_progress', startedAt: at, claimedAt: at, attempt: 1 },
      needs_review: {
        reason: COMMIT_UNKNOWN,
        ticketed: false,
        at,
        amadeus: { operation: 'PNR_AddMultiElements', code: null, message: 'timeout of 25000ms exceeded' },
        alerted_at: at,
      },
      ...details,
    },
  };
};

/** An ordinary held booking: the airline gave a record locator. */
const heldBooking = () => ({
  id: 'bk-held1',
  booking_reference: 'FLTHELD1',
  travel_type: 'flight',
  status: 'pending_ticketing',
  payment_status: 'paid',
  total_amount: 291,
  user_id: OWNER,
  created_at: tenMinutesAgo(),
  passenger_details: [{ firstName: 'Jane', lastName: 'Doe' }],
  booking_details: {
    pnr: 'ABC123', order_id: 'FLTHELD1', customer_email: BOOKER, arc_captured_amount: 291, gds: { ticketed: false },
  },
});

const CHECKING = 'Our team is checking with the airline whether this booking went through, so it cannot be cancelled online yet. '
  + 'Nothing has been cancelled or refunded. To cancel it, please call (877) 538-7380 with booking reference FLTUNK1.';

const captured = () => ({
  status: 200,
  data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 291, currency: 'USD' } }] },
});

const withRows = async (rows) => {
  table = fakeBookingsTable(rows, { tables: { price_settings: [], payments: [] } });
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
};

const flightsApp = async () => {
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  return app;
};

const paymentsApp = async () => {
  const routes = (await import('../../backend/routes/payment.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/payments', routes);
  return app;
};

const as = (user) => ({ 'x-test-user': JSON.stringify(user) });
const owner = as({ id: OWNER, role: 'user' });
const staff = as({ id: 'staff-1', email: 'desk@jetsetterss.com', role: 'support' });

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('VERCEL', '');
  cancelFlightOrder.mockReset();
  cancelFlightOrder.mockResolvedValue({ success: true, hadTickets: false, voided: false, requiresAirlineRefund: [] });
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
  axios.get.mockReset();
  axios.get.mockResolvedValue(captured());
  delete process.env.RATE_LIMIT_GUEST_BOOKING_MAX;
});

/** Nothing moved: no airline call, no money, no write, the row as it was. */
const nothingMoved = (before) => {
  expect(cancelFlightOrder).not.toHaveBeenCalled();
  expect(axios.put).not.toHaveBeenCalled();
  expect(table.writes).toEqual([]);
  expect(table.row(REF)).toEqual(before);
};

describe('a customer cancelling a booking whose airline commit never answered', () => {
  it('Manage Booking (signed in): refused - we are checking, nothing cancelled, call us', async () => {
    await withRows([commitUnknown()]);
    const before = structuredClone(table.row(REF));

    const res = await request(await flightsApp()).post(`/api/flights/order/${REF}/cancel`).set(owner).send({ reason: 'Change of plans' });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, code: 'BOOKING_BEING_CHECKED', bookingReference: REF });
    expect(res.body.error).toBe(CHECKING);
    expect(res.body.message).toBe(CHECKING);
    nothingMoved(before);
  });

  it('Manage Booking (a guest, by the email it was booked with): the same', async () => {
    await withRows([commitUnknown({ user_id: null })]);
    const before = structuredClone(table.row(REF));

    const res = await request(await flightsApp()).post(`/api/flights/order/${REF}/cancel`).send({ email: BOOKER });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe(CHECKING);
    nothingMoved(before);
  });

  it('DELETE /flights/order/:ref: refused with the same words, and the no-refund fallback is not reached', async () => {
    await withRows([commitUnknown()]);
    const before = structuredClone(table.row(REF));

    const res = await request(await flightsApp()).delete(`/api/flights/order/${REF}`).set(owner);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, code: 'BOOKING_BEING_CHECKED', error: CHECKING });
    expect(res.body.mode).not.toBe('FALLBACK_CANCELLATION');
    nothingMoved(before);
  });

  it('the payments router (POST ?action=cancel-booking): the same', async () => {
    await withRows([commitUnknown({ user_id: null })]);
    const before = structuredClone(table.row(REF));

    const res = await request(await paymentsApp()).post('/api/payments?action=cancel-booking').send({ bookingReference: REF, email: BOOKER });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe(CHECKING);
    nothingMoved(before);
  });

  it('still gives a stranger the one signed-out answer first, and says nothing about the check', async () => {
    await withRows([commitUnknown({ user_id: null })]);

    const res = await request(await flightsApp()).post(`/api/flights/order/${REF}/cancel`).send({ email: 'stranger@example.com' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('BOOKING_NOT_FOUND');
    expect(JSON.stringify(res.body)).not.toMatch(/checking with the airline/);
  });
});

describe('staff cancelling the same booking', () => {
  it('goes ahead as today - cancelled and refunded - and the booking stays on the desk', async () => {
    await withRows([commitUnknown()]);
    const app = await flightsApp();

    const res = await request(app).post('/api/flights/admin-bookings/bk-unk1/cancel').set(staff).send({ reason: 'Customer called' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const row = table.row(REF);
    expect(row.status).toBe('cancelled');
    expect(axios.put).toHaveBeenCalled();
    // No PNR, so no airline call - which is exactly why a person still has to
    // find out whether the airline holds anything.
    expect(cancelFlightOrder).not.toHaveBeenCalled();

    expect(attentionOf(row)).toMatchObject({ kind: 'review', reason: COMMIT_UNKNOWN });
    const open = await request(app).get('/api/flights/admin-bookings-all?attention=open').set(staff);
    expect(open.body.data.map((b) => b.bookingReference)).toContain(REF);
  });

  it('a refund from the Payments tab alone keeps it on the desk too', () => {
    expect(attentionOf(commitUnknown({ payment_status: 'refunded' }))).toMatchObject({ kind: 'review', reason: COMMIT_UNKNOWN });
  });
});

// Fences: everything next to it behaves as it did.
describe('next to it', () => {
  it("a normal booking's self-cancel goes through as today: the airline, the refund, cancelled", async () => {
    await withRows([heldBooking()]);

    const res = await request(await flightsApp()).post('/api/flights/order/FLTHELD1/cancel').set(owner).send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(cancelFlightOrder).toHaveBeenCalledWith('ABC123');
    expect(axios.put).toHaveBeenCalled();
    expect(table.row('FLTHELD1').status).toBe('cancelled');
    // And, settled, it is off the desk as before.
    expect(attentionOf(table.row('FLTHELD1'))).toBeNull();
  });

  it('once a person resolved the flag (not held at the airline), the customer may cancel it as before', async () => {
    const resolvedAt = new Date().toISOString();
    await withRows([commitUnknown({}, {
      needs_review: { reason: COMMIT_UNKNOWN, ticketed: false, at: tenMinutesAgo(), resolved_at: resolvedAt, resolution: 'not held at the airline' },
    })]);

    const res = await request(await flightsApp()).post(`/api/flights/order/${REF}/cancel`).set(owner).send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(table.row(REF).status).toBe('cancelled');
    expect(attentionOf(table.row(REF))).toBeNull();
  });

  it('a booking that really failed, cancelled by staff, leaves the desk as before', () => {
    const failed = commitUnknown({ status: 'cancelled', payment_status: 'refunded' }, {
      needs_review: { reason: 'charge not reversed after the booking failed', ticketed: false, at: tenMinutesAgo() },
    });
    expect(attentionOf(failed)).toBeNull();
  });
});
