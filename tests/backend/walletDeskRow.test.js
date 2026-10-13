import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * What the support desk sees of a booking's Jet Coins: how many it used, how
 * many already went back, and a problem the order route or a void left behind.
 */

vi.mock('../../backend/middleware/auth.middleware.js', async () => {
  const actual = await vi.importActual('../../backend/middleware/auth.middleware.js');
  return {
    ...actual,
    protect: (req, _res, next) => { req.user = { id: 'staff-1', email: 'desk@jetsetterss.com', role: 'support' }; next(); },
  };
});

const booking = (reference, details = {}) => ({
  id: `id-${reference}`,
  booking_reference: reference,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 72.2,
  created_at: '2026-10-11T09:00:00Z',
  booking_details: { pnr: 'ABC123', gds: { ticketed: true }, tickets: [{ number: '220-7491175300' }], ...details },
});

const rowsFor = async (bookings) => {
  const table = fakeBookingsTable(bookings);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  const res = await request(app).get('/api/flights/admin-bookings-all');
  return Object.fromEntries(res.body.data.map((row) => [row.bookingReference, row]));
};

beforeEach(() => {
  vi.resetModules();
});

describe('the desk row of a booking that used Jet Coins', () => {
  it('carries the coins used, the coins already returned and any wallet problem', async () => {
    const rows = await rowsFor([
      booking('FLTPLAIN'),
      booking('FLTUSED', { verified_charge: { total: 72.2, wallet: { coins: 5000 } } }),
      booking('FLTBACK', { verified_charge: { total: 72.2, wallet: { coins: 5000 } }, cancellation: { coinsReturned: 3000 } }),
      booking('FLTSTUCK', {
        verified_charge: { total: 72.2, wallet: { coins: 5000 } },
        wallet_issue: { kind: 'return_failed', coins: 5000, reason: 'void', at: '2026-10-11T10:00:00Z' },
      }),
    ]);

    expect(rows.FLTPLAIN).toMatchObject({ walletCoins: 0, walletCoinsReturned: 0, walletIssue: null });
    expect(rows.FLTUSED).toMatchObject({ walletCoins: 5000, walletCoinsReturned: 0, walletIssue: null });
    expect(rows.FLTBACK).toMatchObject({ walletCoins: 5000, walletCoinsReturned: 3000 });
    expect(rows.FLTSTUCK.walletIssue).toMatchObject({ kind: 'return_failed', coins: 5000 });
  });
});
