import axios from 'axios';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { attentionLabel, attentionOf } from '../../shared/reviewQueue.js';

/**
 * A refund ARC Pay refused on a cancel that also left tickets to claim from
 * the airline.
 *
 * A refundable fare with tickets past their void window: the cancel decides
 * 241 back and a 50 fee kept, and ARC Pay refuses the REFUND (REFUND_FAILED).
 * The cancel's only flag reason is "tickets could not be voided; airline
 * refund must be claimed", with the tickets - a refused refund adds none. The
 * desk listed it only as "Refund to claim from the airline" and never said
 * the customer's refund had been refused; and once the desk claimed the
 * tickets and marked that handled, the unreturned 241 left Needs attention.
 *
 * The cancel is the real one; the desk list and "Mark as handled" are the real
 * route over the row it wrote.
 */

const booking = () => ({
  id: 'uuid-1',
  booking_reference: 'FLT123',
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 291,
  booking_details: { pnr: 'ABC123', order_id: 'FLT123', customer_email: 'traveler@example.com', refundable: true },
  user_id: null,
});

const supabaseFor = (row) => {
  const updates = [];
  const chain = () => {
    const c = {
      select: vi.fn(() => c), insert: vi.fn(() => c), eq: vi.fn(() => c), is: vi.fn(() => c),
      neq: vi.fn(() => c), or: vi.fn(() => c), filter: vi.fn(() => c), order: vi.fn(() => c), limit: vi.fn(() => c),
      update: vi.fn((payload) => { updates.push(payload); return c; }),
      single: vi.fn().mockResolvedValue({ data: row, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: (resolve) => resolve({ data: [row], error: null }),
    };
    return c;
  };
  return { client: { from: vi.fn(() => chain()) }, updates };
};

const cancelFlightOrder = vi.fn();
let database = supabaseFor(booking());

vi.mock('../../backend/routes/payment/arcpay.config.js', () => ({
  get supabase() { return database.client; },
  ARC_PAY_CONFIG: { BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT' },
  getArcPayAuthConfig: () => ({ headers: {} }),
}));
vi.mock('../../backend/services/flightProvider.js', () => ({
  default: { cancelFlightOrder: (...args) => cancelFlightOrder(...args) },
  providerStatus: () => ({ enabled: true, bookingEnabled: true }),
}));
vi.mock('../../backend/middleware/auth.middleware.js', async () => {
  const actual = await vi.importActual('../../backend/middleware/auth.middleware.js');
  return {
    ...actual,
    protect: (req, _res, next) => { req.user = { id: 'staff-1', email: 'desk@jetsetterss.com', role: 'support' }; next(); },
  };
});

beforeEach(() => {
  vi.resetModules();
  database = supabaseFor(booking());
  // Past the void window: the tickets are listed for a claim from the airline.
  cancelFlightOrder.mockReset();
  cancelFlightOrder.mockResolvedValue({ success: true, hadTickets: true, voided: false, requiresAirlineRefund: ['108-2412345671'] });
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockResolvedValue({
    status: 200,
    data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 291, currency: 'USD' } }] },
  });
  // ARC refuses the REFUND.
  axios.put.mockResolvedValue({ status: 200, data: { result: 'FAILURE', response: { gatewayCode: 'DECLINED' } } });
});

/** The cancel, then the row as it left it (with an id the desk routes can address). */
const cancelled = async () => {
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const res = createResponse();
  await handleCancelBookingAction(createRequest({ method: 'POST', body: { bookingReference: 'FLT123', reason: 'test', email: 'traveler@example.com' } }), res);
  const written = database.updates.find((update) => update.status === 'cancelled');
  return { res, row: { ...booking(), ...written, id: 'b-claim', created_at: '2026-09-22T09:00:00Z' } };
};

const deskOver = async (rows) => {
  const table = fakeBookingsTable(rows);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  const open = async () => (await request(app).get('/api/flights/admin-bookings-all?attention=open')).body.data;
  const handle = (note) => request(app).post('/api/flights/admin-bookings/b-claim/resolve-review').send({ note });
  return { table, open, handle };
};

describe('a refused refund under an airline-claim flag', () => {
  it('is what the cancel records: REFUND_FAILED, the fee, and a claim flag naming only the tickets', async () => {
    const { res, row } = await cancelled();
    expect(res.body.cancellation).toMatchObject({ paymentAction: 'REFUND_FAILED', cancellationFee: 50 });
    expect(row.booking_details.needs_review).toMatchObject({
      reason: 'tickets could not be voided; airline refund must be claimed', source: 'cancellation', tickets: ['108-2412345671'],
    });
  });

  it('tells the desk the customer refund was refused, and what is owed, beside the claim', async () => {
    const { row } = await cancelled();
    const attention = attentionOf(row);
    expect(attention.reason, 'the desk is never told the customer refund was refused').toMatch(/the refund did not go through \(REFUND_FAILED\)/);
    expect(attention.reason).toMatch(/241\.00 USD owed/);
    expect(attention.reason).toMatch(/airline refund must be claimed/);
    expect(attention.tickets).toEqual(['108-2412345671']);
  });

  it('stays on Needs attention once the airline claim is marked handled, until the refund is', async () => {
    const { row } = await cancelled();
    const desk = await deskOver([row]);

    expect((await desk.handle('Claimed 108-2412345671 from the airline.')).status).toBe(200);
    const listed = await desk.open();
    expect(listed.map((b) => b.bookingReference), 'the refused 241 leaves Needs attention with nothing returned').toEqual(['FLT123']);
    expect(listed[0].attention).toMatchObject({ kind: 'refund_failed' });
    expect(attentionLabel(listed[0].attention)).toBe('Refund did not go through');

    // Handled on its own entry, it goes: under what was wrong, over the claim, which is kept.
    expect((await desk.handle('Refunded 241 in the ARC portal.')).status).toBe(200);
    expect(await desk.open()).toHaveLength(0);
    const review = desk.table.row('FLT123').booking_details.needs_review;
    expect(review).toMatchObject({ reason: /REFUND_FAILED/, resolution: 'Refunded 241 in the ARC portal.' });
    expect(review.previous).toMatchObject({ tickets: ['108-2412345671'], resolution: 'Claimed 108-2412345671 from the airline.' });
  });
});

describe('beside it', () => {
  const claimFlag = (extra = {}) => ({
    reason: 'tickets could not be voided; airline refund must be claimed', source: 'cancellation', at: '2026-09-22T10:00:00Z', tickets: ['108-2412345671'], ...extra,
  });
  const rowWith = (cancellation, review) => ({
    booking_reference: 'FLTCLM2',
    status: 'cancelled',
    payment_status: 'paid',
    total_amount: 291,
    booking_details: {
      pnr: 'ABC123',
      arc_captured_amount: 291,
      cancellation: { cancelledAt: '2026-09-22T10:00:00Z', refundAmount: 0, cancellationFee: 50, currency: 'USD', amadeusCancelled: true, ...cancellation },
      needs_review: review,
    },
  });

  it('once the refund is finished, only the claim is left, in its own words', () => {
    const finished = rowWith({ paymentAction: 'PARTIAL_REFUND', refundAmount: 241, decidedFee: 50, manualRefund: { mode: 'refund' } }, claimFlag());
    expect(attentionOf(finished)).toEqual({
      kind: 'airline_refund', reason: 'tickets could not be voided; airline refund must be claimed', since: '2026-09-22T10:00:00Z', tickets: ['108-2412345671'],
    });
    expect(attentionOf(rowWith({ paymentAction: 'PARTIAL_REFUND', refundAmount: 241 }, claimFlag({ resolved_at: '2026-09-22T12:00:00Z' })))).toBeNull();
  });

  it('a refund held for review under the claim flag is named by that flag, and settled with it', () => {
    const reason = 'non-refundable fare with tickets past their void window: what the airline returns depends on its fare rules; '
      + 'tickets could not be voided; airline refund must be claimed';
    const held = rowWith({ paymentAction: 'REFUND_UNDER_REVIEW', cancellationFee: 0 }, claimFlag({ reason }));
    expect(attentionOf(held)).toMatchObject({ kind: 'airline_refund', reason });
    expect(attentionOf(rowWith({ paymentAction: 'REFUND_UNDER_REVIEW', cancellationFee: 0 }, claimFlag({ reason, resolved_at: '2026-09-22T12:00:00Z' })))).toBeNull();
  });

  it('a refused refund whose own flag was marked handled after the cancel is settled, as before', () => {
    const handled = rowWith({ paymentAction: 'REFUND_FAILED' }, { reason: 'the refund did not go through', at: '2026-09-22T12:00:00Z', resolved_at: '2026-09-22T12:00:00Z' });
    expect(attentionOf(handled)).toBeNull();
  });
});
