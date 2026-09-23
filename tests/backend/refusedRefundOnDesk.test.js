import axios from 'axios';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { attentionLabel, attentionOf } from '../../shared/reviewQueue.js';
import { buildMessage, selectUnrefunded } from '../../backend/jobs/paymentFailureAlert.job.js';

/**
 * A cancel whose automatic refund ARC Pay refused (REFUND_FAILED), carried
 * through the real cancel handler, then read by the two rules that decide who
 * is told: the failed-refund Slack alarm (selectUnrefunded) and the desk /
 * admin "Needs attention" queue (attentionOf, via admin-bookings-all
 * ?attention=open). shared/reviewQueue.js promises the queue is exactly what
 * Slack announced.
 *
 * The cancel writes no review flag for a refused refund - no decision to
 * review, no reason from the payment step, no ticket to claim - and the row is
 * cancelled, so the queue read it as settled. Slack announced it once and
 * stamped it; after that the only trace was the booking in "All bookings", and
 * "Mark as handled" answered that there was nothing to handle.
 */

const booking = () => ({
  id: 'uuid-1',
  booking_reference: 'FLT123',
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 291,
  booking_details: { pnr: 'ABC123', order_id: 'FLT123', customer_email: 'traveler@example.com' },
  user_id: null,
});

const supabaseFor = (row) => {
  const updates = [];
  const chain = () => {
    const c = {
      select: vi.fn(() => c),
      update: vi.fn((payload) => { updates.push(payload); return c; }),
      insert: vi.fn(() => c),
      eq: vi.fn(() => c),
      is: vi.fn(() => c),
      neq: vi.fn(() => c),
      or: vi.fn(() => c),
      filter: vi.fn(() => c),
      order: vi.fn(() => c),
      limit: vi.fn(() => c),
      single: vi.fn().mockResolvedValue({ data: row, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: (resolve) => resolve({ data: [row], error: null }),
    };
    return c;
  };
  return { client: { from: vi.fn(() => chain()) }, updates };
};

const cancelFlightOrder = vi.fn();
let supabaseDouble = supabaseFor(booking());

vi.mock('../../backend/routes/payment/arcpay.config.js', () => ({
  get supabase() { return supabaseDouble.client; },
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

const runCancel = async () => {
  supabaseDouble = supabaseFor(booking());
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const req = createRequest({ method: 'POST', body: { bookingReference: 'FLT123', reason: 'test', email: 'traveler@example.com' } });
  const res = createResponse();
  await handleCancelBookingAction(req, res);
  return res;
};

/** The row as the cancel left it: its closing write applied to the booking. */
const rowAfterCancel = () => {
  const written = supabaseDouble.updates.find((u) => u.status === 'cancelled');
  return { ...booking(), ...written, created_at: '2026-09-23T10:00:00Z' };
};

beforeEach(() => {
  vi.resetModules();
  cancelFlightOrder.mockReset();
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockResolvedValue({
    status: 200,
    data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 291, currency: 'USD' } }] },
  });
  // ARC refuses every VOID and REFUND.
  axios.put.mockResolvedValue({ status: 200, data: { result: 'FAILURE', response: { gatewayCode: 'DECLINED' } } });
});

describe.each([
  ['tickets voided the same day (refund less the fee)', { success: true, hadTickets: true, voided: true, requiresAirlineRefund: [] }],
  ['a reservation released before any ticket (refund all)', { success: true, hadTickets: false, voided: false, requiresAirlineRefund: [] }],
])('a cancelled flight whose refund ARC Pay refused: %s', (_label, gds) => {
  it('is announced by the failed-refund alarm and listed on the desk queue', async () => {
    cancelFlightOrder.mockResolvedValue(gds);
    const res = await runCancel();
    expect(res.body.cancellation.paymentAction).toBe('REFUND_FAILED');

    const row = rowAfterCancel();
    expect(row.status).toBe('cancelled');
    expect(row.payment_status).toBe('paid');

    // Slack: announced once, as needing a refund by hand, then stamped.
    const announced = selectUnrefunded([row]);
    expect(announced.map((b) => b.booking_reference)).toEqual(['FLT123']);
    expect(buildMessage(announced)).toMatch(/These need refunding by hand/);

    // The desk and the admin panel's "Needs attention": the same booking.
    const attention = attentionOf(row);
    expect(attention, 'the desk queue does not list a refund ARC Pay refused').not.toBeNull();
    expect(attention).toMatchObject({ kind: 'refund_failed', since: row.booking_details.cancellation.cancelledAt });
    expect(attention.reason).toMatch(/REFUND_FAILED/);
    expect(attentionLabel(attention)).toBe('Refund did not go through');
  });
});

/** A cancelled booking as the cancel records one, with `cancellation` over the refused one. */
const cancelledWith = (cancellation = {}, extra = {}) => ({
  id: 'b-refused',
  booking_reference: 'FLTREF1',
  travel_type: 'flight',
  status: 'cancelled',
  payment_status: 'paid',
  total_amount: 291,
  created_at: '2026-09-20T10:00:00Z',
  ...extra,
  booking_details: {
    pnr: 'ABC123',
    arc_captured_amount: 291,
    cancellation: {
      cancelledAt: '2026-09-20T12:00:00Z', paymentAction: 'REFUND_FAILED', refundAmount: 0, cancellationFee: 50,
      currency: 'USD', basis: 'tickets voided the day they were issued', ...cancellation,
    },
    ...(extra.booking_details || {}),
  },
});

describe('the desk list, beside a refused refund', () => {
  it('drops it once the refund is finished', () => {
    expect(attentionOf(cancelledWith({ paymentAction: 'PARTIAL_REFUND', refundAmount: 241, manualRefund: { mode: 'refund' } }))).toBeNull();
  });

  it('never lists a cancellation that returned or owed nothing', () => {
    expect(attentionOf(cancelledWith({ paymentAction: 'NOTHING_TO_REFUND' }))).toBeNull();
    expect(attentionOf(cancelledWith({ paymentAction: 'NO_REFUND_FEE_COVERS' }))).toBeNull();
    expect(attentionOf(cancelledWith({ paymentAction: 'VOID', refundAmount: 291 }))).toBeNull();
    expect(attentionOf(cancelledWith({}, { total_amount: 0 }))).toBeNull();
    // No cancellation record at all: as before.
    expect(attentionOf({ status: 'cancelled', payment_status: 'paid', total_amount: 291, booking_details: {} })).toBeNull();
  });

  it('drops it once the desk marks it handled', () => {
    const handled = cancelledWith({}, {
      booking_details: { needs_review: { reason: 'x', at: '2026-09-21T09:00:00Z', resolved_at: '2026-09-21T09:00:00Z', resolution: 'refunded in the ARC portal' } },
    });
    expect(attentionOf(handled)).toBeNull();
  });

  it('keeps it when the flag marked handled was an earlier one, settled before the cancel', () => {
    const earlier = cancelledWith({}, {
      booking_details: { needs_review: { reason: 'chain failed after commit at issueTicket', at: '2026-09-18T10:00:00Z', resolved_at: '2026-09-19T09:00:00Z' } },
    });
    expect(attentionOf(earlier)).toMatchObject({ kind: 'refund_failed' });
  });

  it('leaves the cancel\'s own flags as they were', () => {
    // A refund held for review carries the cancel's flag: listed under it, as before.
    const held = cancelledWith({ paymentAction: 'REFUND_UNDER_REVIEW', cancellationFee: 0 }, {
      booking_details: { needs_review: { reason: 'non-refundable fare with tickets past their void window', source: 'cancellation', at: '2026-09-20T12:00:00Z' } },
    });
    expect(attentionOf(held)).toMatchObject({ kind: 'review', reason: /non-refundable fare/ });
    // Tickets to claim from the airline stay a claim.
    const claim = cancelledWith({}, {
      booking_details: { needs_review: { reason: 'tickets could not be voided; airline refund must be claimed', source: 'cancellation', at: '2026-09-20T12:00:00Z', tickets: ['220-7491175301'] } },
    });
    expect(attentionOf(claim)).toMatchObject({ kind: 'airline_refund', tickets: ['220-7491175301'] });
  });

  it('lists a fallback cancel that attempted no refund and wrote no flag', () => {
    // flight.routes.js DELETE /order: the airline cancelled, no refund was tried.
    const fallback = cancelledWith({
      paymentAction: 'REFUND_UNDER_REVIEW', cancellationFee: 0, source: 'fallback',
      reason: 'fallback cancel: the orchestrated cancel gave no answer, so no refund was attempted',
    });
    const attention = attentionOf(fallback);
    expect(attention).toMatchObject({ kind: 'refund_not_made', reason: /no refund was attempted/ });
    expect(attentionLabel(attention)).toBe('Refund not made yet');
  });
});

describe('marking a refused refund handled on the desk', () => {
  const appWith = async (rows) => {
    const table = fakeBookingsTable(rows);
    const supabase = (await import('../../backend/config/supabase.js')).default;
    supabase.from.mockImplementation(table.from);
    const routes = (await import('../../backend/routes/flight.routes.js')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/flights', routes);
    return { app, table };
  };

  it('is recorded, under what was wrong, and takes it off the list', async () => {
    const { app, table } = await appWith([cancelledWith()]);

    const open = await request(app).get('/api/flights/admin-bookings-all?attention=open');
    expect(open.body.data.map((b) => b.bookingReference)).toEqual(['FLTREF1']);

    const res = await request(app).post('/api/flights/admin-bookings/b-refused/resolve-review').send({ note: 'Refunded 241 in the ARC portal.' });

    expect(res.status).toBe(200);
    const review = table.row('FLTREF1').booking_details.needs_review;
    expect(review).toMatchObject({ resolution: 'Refunded 241 in the ARC portal.', resolved_by: 'desk@jetsetterss.com' });
    expect(review.reason).toMatch(/REFUND_FAILED/);
    expect(review.reason).not.toMatch(/never ticketed/);
    expect(review.ticketed).toBeUndefined();

    const after = await request(app).get('/api/flights/admin-bookings-all?attention=open');
    expect(after.body.data).toHaveLength(0);
  });

  it('is recorded over an earlier flag marked handled before the cancel, which is kept', async () => {
    const earlierFlag = { reason: 'chain failed after commit at issueTicket', at: '2026-09-18T10:00:00Z', resolved_at: '2026-09-19T09:00:00Z', resolution: 'ticketed by hand' };
    const { app, table } = await appWith([cancelledWith({}, { booking_details: { needs_review: earlierFlag } })]);

    const res = await request(app).post('/api/flights/admin-bookings/b-refused/resolve-review').send({ note: 'Refunded 241 in the ARC portal.' });

    expect(res.status).toBe(200);
    const review = table.row('FLTREF1').booking_details.needs_review;
    expect(review).toMatchObject({ reason: /REFUND_FAILED/, resolution: 'Refunded 241 in the ARC portal.', previous: earlierFlag });
    const after = await request(app).get('/api/flights/admin-bookings-all?attention=open');
    expect(after.body.data).toHaveLength(0);
  });

  it('still refuses a booking already handled, and one with nothing to handle', async () => {
    const handled = cancelledWith({}, {
      booking_details: { needs_review: { reason: 'x', at: '2026-09-21T09:00:00Z', resolved_at: '2026-09-21T09:00:00Z' } },
    });
    const settled = { ...cancelledWith({ paymentAction: 'PARTIAL_REFUND', refundAmount: 241 }), id: 'b-settled', booking_reference: 'FLTREF2' };
    const { app } = await appWith([handled, settled]);

    const again = await request(app).post('/api/flights/admin-bookings/b-refused/resolve-review').send({ note: 'again' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_RESOLVED');

    const nothing = await request(app).post('/api/flights/admin-bookings/b-settled/resolve-review').send({ note: 'x' });
    expect(nothing.status).toBe(409);
    expect(nothing.body.code).toBe('NOTHING_TO_RESOLVE');
  });
});
