import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * What the support desk sees of a booking's Jet Coins: how many it used, how
 * many already went back (read from the wallet's hold, the one record every
 * return writes), the coins the desk may still return, and a problem the order
 * route or a void left behind.
 */

vi.mock('../../backend/middleware/auth.middleware.js', async () => {
  const actual = await vi.importActual('../../backend/middleware/auth.middleware.js');
  return {
    ...actual,
    protect: (req, _res, next) => { req.user = { id: 'staff-1', email: 'desk@jetsetterss.com', role: 'support' }; next(); },
  };
});

const used = (coins) => ({ total: 72.2, wallet: { coins } });

const booking = (reference, details = {}, over = {}) => ({
  id: `id-${reference}`,
  booking_reference: reference,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 72.2,
  created_at: '2026-10-11T09:00:00Z',
  ...over,
  booking_details: { pnr: 'ABC123', gds: { ticketed: true }, tickets: [{ number: '220-7491175300' }], ...details },
});

const hold = (reference, coins, returned = 0, status = 'captured') => ({ booking_reference: reference, coins, returned_coins: returned, status });

const rowsFor = async (bookings, { holds = [], holdsFail = false } = {}) => {
  const table = fakeBookingsTable(bookings);
  const holdReads = [];
  const holdsTable = {
    select: vi.fn(() => holdsTable),
    in: vi.fn((column, references) => {
      holdReads.push({ column, references });
      return Promise.resolve(holdsFail
        ? { data: null, error: { message: 'connection reset' } }
        : { data: holds.filter((row) => references.includes(row.booking_reference)), error: null });
    }),
  };
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation((name) => (name === 'wallet_holds' ? holdsTable : table.from(name)));
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  const res = await request(app).get('/api/flights/admin-bookings-all');
  return { rows: Object.fromEntries(res.body.data.map((row) => [row.bookingReference, row])), holdReads };
};

beforeEach(() => {
  vi.resetModules();
});

describe('the desk row of a booking that used Jet Coins', () => {
  it('carries the coins used, the coins returned according to the hold, and any wallet problem', async () => {
    const issue = { kind: 'return_failed', coins: 5000, reason: 'void', at: '2026-10-11T10:00:00Z' };
    const { rows } = await rowsFor([
      booking('FLTPLAIN'),
      booking('FLTUSED', { verified_charge: used(5000) }),
      booking('FLTBACK', { verified_charge: used(5000), wallet_issue: issue }),
    ], { holds: [hold('FLTUSED', 5000), hold('FLTBACK', 5000, 3000)] });

    expect(rows.FLTPLAIN).toMatchObject({ walletCoins: 0, walletCoinsReturned: 0, walletCoinsOffer: 0, walletIssue: null });
    expect(rows.FLTUSED).toMatchObject({ walletCoins: 5000, walletCoinsReturned: 0, walletIssue: null });
    expect(rows.FLTBACK).toMatchObject({ walletCoins: 5000, walletCoinsReturned: 3000, walletIssue: issue });
  });

  it('reads every hold in one batch, for the bookings that used coins only', async () => {
    const { holdReads } = await rowsFor([
      booking('FLTPLAIN'),
      booking('FLTA', { verified_charge: used(5000) }),
      booking('FLTB', { verified_charge: used(100) }),
    ], { holds: [hold('FLTA', 5000), hold('FLTB', 100)] });

    expect(holdReads).toHaveLength(1);
    expect(holdReads[0].column).toBe('booking_reference');
    expect([...holdReads[0].references].sort()).toEqual(['FLTA', 'FLTB']);
  });

  it('counts a released hold as every coin back', async () => {
    const { rows } = await rowsFor(
      [booking('FLTREL', { verified_charge: used(5000), wallet_issue: { kind: 'capture_failed', coins: 5000 } })],
      { holds: [hold('FLTREL', 5000, 0, 'released')] },
    );
    expect(rows.FLTREL).toMatchObject({ walletCoinsReturned: 5000, walletCoinsOffer: 0 });
  });
});

describe('the coins the desk is offered to return', () => {
  const FEE_COVERS = {
    paymentAction: 'NO_REFUND_FEE_COVERS', coinsReturned: 28750, coinsOwed: 28750, coinsKept: 1150,
  };

  it('offers nothing after a cancel the fee covered: the 1,150 coins kept as the fee are not owed', async () => {
    const { rows } = await rowsFor(
      [booking('FLTFEE', { verified_charge: used(29900), cancellation: FEE_COVERS }, { status: 'cancelled', payment_status: 'refunded' })],
      { holds: [hold('FLTFEE', 29900, 28750)] },
    );
    expect(rows.FLTFEE).toMatchObject({ walletCoinsReturned: 28750, walletCoinsOffer: 0 });
  });

  it('offers nothing on a live booking that used coins and shows no sign of trouble', async () => {
    const { rows } = await rowsFor([booking('FLTLIVE', { verified_charge: used(5000) })], { holds: [hold('FLTLIVE', 5000)] });
    expect(rows.FLTLIVE.walletCoinsOffer).toBe(0);
  });

  it('offers the whole of a cancel left to review, less what the hold says has gone back', async () => {
    const review = { paymentAction: 'REFUND_UNDER_REVIEW', coinsReturned: 0, coinsOwed: 0, coinsKept: 0, coinsInReview: true };
    const { rows } = await rowsFor([
      booking('FLTREV', { verified_charge: used(5000), cancellation: review }, { status: 'cancelled' }),
      booking('FLTREV2', { verified_charge: used(5000), cancellation: review }, { status: 'cancelled' }),
    ], { holds: [hold('FLTREV', 5000), hold('FLTREV2', 5000, 2000)] });
    expect(rows.FLTREV.walletCoinsOffer).toBe(5000);
    expect(rows.FLTREV2.walletCoinsOffer).toBe(3000);
  });

  it('offers what a failed cancel return still owes, and shrinks as the desk returns it', async () => {
    const failed = { paymentAction: 'NO_REFUND_FEE_COVERS', coinsReturned: 0, coinsOwed: 28750, coinsKept: 1150 };
    const { rows } = await rowsFor([
      booking('FLTFAIL', { verified_charge: used(29900), cancellation: failed }, { status: 'cancelled' }),
      booking('FLTFAIL2', { verified_charge: used(29900), cancellation: failed }, { status: 'cancelled' }),
    ], { holds: [hold('FLTFAIL', 29900), hold('FLTFAIL2', 29900, 10000)] });
    expect(rows.FLTFAIL.walletCoinsOffer).toBe(28750);
    expect(rows.FLTFAIL2.walletCoinsOffer).toBe(18750);
  });

  it('keeps offering a review cancel\'s coins after the desk finishes the card refund, until they are all back', async () => {
    const finished = {
      paymentAction: 'FULL_REFUND', refundAmount: 72.2, coinsReturned: 0, coinsOwed: 0, coinsKept: 0, coinsInReview: true,
      manualRefund: { at: '2026-10-12T10:00:00Z', previousPaymentAction: 'REFUND_UNDER_REVIEW' },
    };
    const { rows } = await rowsFor([
      booking('FLTFIN', { verified_charge: used(5000), cancellation: finished }, { status: 'cancelled', payment_status: 'refunded' }),
      booking('FLTFIN2', { verified_charge: used(5000), cancellation: finished }, { status: 'cancelled', payment_status: 'refunded' }),
    ], { holds: [hold('FLTFIN', 5000), hold('FLTFIN2', 5000, 5000)] });
    expect(rows.FLTFIN.walletCoinsOffer).toBe(5000);
    expect(rows.FLTFIN2.walletCoinsOffer).toBe(0);
  });

  it('offers nothing for a cancel that was not left to review and settled its coins', async () => {
    const { rows } = await rowsFor(
      [booking('FLTSETTLED', { verified_charge: used(5000), cancellation: { paymentAction: 'FULL_REFUND', coinsReturned: 5000, coinsOwed: 5000, coinsKept: 0 } }, { status: 'cancelled' })],
      { holds: [hold('FLTSETTLED', 5000, 5000)] },
    );
    expect(rows.FLTSETTLED.walletCoinsOffer).toBe(0);
  });

  it('shows a capture problem but offers no coins for it: the customer kept the flight', async () => {
    const issue = { kind: 'capture_failed', coins: 5000, status: 'error', at: '2026-10-11T10:00:00Z' };
    const { rows } = await rowsFor(
      [booking('FLTCAPT', { verified_charge: used(5000), wallet_issue: issue })],
      { holds: [hold('FLTCAPT', 5000, 0, 'held')] },
    );
    expect(rows.FLTCAPT).toMatchObject({ walletIssue: issue, walletCoinsOffer: 0 });
  });

  it('offers the coins on a booking the order route or a void left a wallet problem on', async () => {
    const { rows } = await rowsFor(
      [booking('FLTISSUE', { verified_charge: used(5000), wallet_issue: { kind: 'return_failed', coins: 5000, reason: 'void' } })],
      { holds: [hold('FLTISSUE', 5000, 1000)] },
    );
    expect(rows.FLTISSUE.walletCoinsOffer).toBe(4000);
  });

  it('offers nothing for a booking with no hold, or when the holds cannot be read, and still lists the booking', async () => {
    const stuck = { verified_charge: used(5000), wallet_issue: { kind: 'return_failed', coins: 5000, reason: 'void' } };

    const withoutHold = await rowsFor([booking('FLTNOHOLD', stuck)], { holds: [] });
    expect(withoutHold.rows.FLTNOHOLD).toMatchObject({ walletCoins: 5000, walletCoinsReturned: 0, walletCoinsOffer: 0 });

    vi.resetModules();
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unreadable = await rowsFor([booking('FLTUNREAD', stuck)], { holds: [hold('FLTUNREAD', 5000)], holdsFail: true });
    expect(unreadable.rows.FLTUNREAD).toMatchObject({ walletCoins: 5000, walletCoinsOffer: 0 });
    silence.mockRestore();
  });
});
