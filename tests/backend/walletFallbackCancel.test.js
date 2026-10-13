import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * DELETE /api/flights/order/:orderId's fallback cancel of a booking that used
 * Jet Coins. It returns no money and no coins, so the desk finishes both: its
 * cancellation record must leave the coins to review, or the desk is offered
 * no Return Jet Coins and the coins are never returned.
 */

const REF = 'FLTFBC1';
const OWNER = { id: '0b7c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4', role: 'user' };
const STAFF = { id: 'staff-1', role: 'support' };

const row = (details = {}) => ({
  id: 'bk-fbc1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 72.2,
  user_id: OWNER.id,
  created_at: '2026-10-11T08:00:00Z',
  booking_details: { pnr: 'SEAT42', order_id: REF, customer_email: 'jane@example.com', gds: { ticketed: true }, tickets: [], ...details },
});

let table = fakeBookingsTable([]);
let holds = [];
const cancelFlightOrder = vi.fn();

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return { ...actual, get supabase() { return { from: (...args) => table.from(...args) }; } };
});

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

const holdsTable = {
  select: () => holdsTable,
  in: (_column, references) => Promise.resolve({ data: holds.filter((hold) => references.includes(hold.booking_reference)), error: null }),
};

const appFor = async (bookingRow) => {
  table = fakeBookingsTable([bookingRow]);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation((name) => (name === 'wallet_holds' ? holdsTable : table.from(name)));
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  return app;
};

const as = (user) => ({ 'x-test-user': JSON.stringify(user) });

beforeEach(() => {
  vi.resetModules();
  holds = [];
  cancelFlightOrder.mockReset();
  cancelFlightOrder.mockResolvedValue({ success: true });
});

describe('a fallback cancel of a booking that used Jet Coins', () => {
  it('leaves the coins to the desk, which is offered every coin used', async () => {
    const app = await appFor(row({ verified_charge: { total: 72.2, wallet: { coins: 5000, amount: 50 } } }));
    holds = [{ booking_reference: REF, coins: 5000, returned_coins: 0, status: 'captured' }];

    const res = await request(app).delete(`/api/flights/order/${REF}`).set(as(OWNER)).send();

    expect(res.body.mode).toBe('FALLBACK_CANCELLATION');
    expect(table.row(REF).booking_details.cancellation).toMatchObject({
      paymentAction: 'REFUND_UNDER_REVIEW', source: 'fallback', coinsInReview: true,
    });

    const desk = await request(app).get('/api/flights/admin-bookings-all').set(as(STAFF));
    const listed = desk.body.data.find((booking) => booking.bookingReference === REF);
    expect(listed).toMatchObject({ walletCoins: 5000, walletCoinsOffer: 5000 });
  });

  it('records the same cancellation as before for a booking that used no coins', async () => {
    const app = await appFor(row({ verified_charge: { total: 291 } }));

    const res = await request(app).delete(`/api/flights/order/${REF}`).set(as(OWNER)).send();

    expect(res.body.mode).toBe('FALLBACK_CANCELLATION');
    const { cancellation } = table.row(REF).booking_details;
    expect(cancellation).toMatchObject({ paymentAction: 'REFUND_UNDER_REVIEW', source: 'fallback' });
    expect(cancellation).not.toHaveProperty('coinsInReview');
  });
});
