import { describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * The abandoned-checkout job, when the order route answers "a person is on
 * this one".
 *
 * The job books a paid checkout by sending it through the booking queue's
 * `replay`. When the route answers 409 BOOKING_NEEDS_REVIEW - the booking is
 * already flagged for a person: a commit our team is checking with the
 * airline, a PNR with no confirmed seat - `replay` answers 'needs-review'. That
 * is an outcome: the flag is kept, the stored order dropped, and the person
 * working the flag owns the booking. `settle` had no case for it and fell to
 * its default, logging 'retry' with `final: false`: a booking a person owns,
 * reported as one still to be settled.
 */

const NOW = Date.parse('2026-09-13T12:00:00Z');
const MIN = 60_000;
const ago = (ms) => new Date(NOW - ms).toISOString();
const REF = 'FLTABANDON1';

const checkoutRow = () => ({
  id: 'row-1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 109.21,
  created_at: ago(45 * MIN),
  booking_details: {
    order_id: REF,
    session_id: 'SESSION-1',
    success_indicator: 'SUCCESS-INDICATOR-1',
    customer_email: 'ann@example.com',
    pending_booking_data: {
      orderId: REF,
      returnUrl: `https://www.jetsetterss.com/payment/callback?orderId=${REF}&bookingType=flight`,
      customerEmail: 'ann@example.com',
      bookingData: {
        amount: 109.21,
        originalOffer: {
          id: '1',
          source: 'GDS',
          itineraries: [{ segments: [] }],
          travelerPricings: [{ travelerId: '1', travelerType: 'ADULT' }],
          price: { total: '80.20', currency: 'USD' },
        },
        passengerData: [{
          firstName: 'Ann', lastName: 'Traveller', dateOfBirth: '1990-04-02', gender: 'FEMALE', type: 'ADULT',
          email: 'ann@example.com', mobile: '5550100', nationality: 'US', passportNumber: 'X1234567', passportExpiry: '2030-01-01',
        }],
      },
      bookingDetails: { contact: { email: 'ann@example.com', phone: '5550100' } },
    },
  },
});

const paid = vi.fn(async () => ({ paid: true }));

describe('settling a checkout the route answered "a person is on this one"', () => {
  it('is settled for good, as that outcome, and not flagged again', async () => {
    const { settle } = await import('../../backend/jobs/abandonedCheckout.job.js');
    const flag = vi.fn(async () => 'flagged');

    const result = await settle(checkoutRow(), { now: NOW, reconcile: paid, send: vi.fn(async () => 'needs-review'), flag });

    expect(result).toEqual({ outcome: 'needs-review', final: true });
    expect(flag).not.toHaveBeenCalled();
  });

  it('through the booking queue\'s real replay', async () => {
    vi.resetModules();
    // The row once the order route has flagged it for a person: a commit the
    // airline never answered, from the customer's own browser a moment ago.
    const flagged = checkoutRow();
    flagged.booking_details.needs_review = { reason: 'chain failed after commit at commit', ticketed: false, at: ago(MIN) };
    const table = fakeBookingsTable([flagged]);
    const supabase = (await import('../../backend/config/supabase.js')).default;
    supabase.from.mockImplementation(table.from);
    const { settle } = await import('../../backend/jobs/abandonedCheckout.job.js');
    const { replay } = await import('../../backend/jobs/bookingQueue.job.js');
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 409,
      json: async () => ({ success: false, code: 'BOOKING_NEEDS_REVIEW', needsReview: true, bookingReference: REF, paymentState: 'held' }),
    });
    // As runOnce sends it.
    const send = (row, body) => replay(
      { booking_reference: row.booking_reference, status: row.status, booking_details: { ...row.booking_details, queued_order: body } },
      { baseUrl: 'http://x', fetchImpl },
    );

    const result = await settle(checkoutRow(), { now: NOW, reconcile: paid, send, flag: vi.fn() });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ outcome: 'needs-review', final: true });
    expect(table.row(REF).booking_details.needs_review.reason).toBe('chain failed after commit at commit');
  });
});

// Fences: every other answer settles as before.
describe('the other answers', () => {
  const settleWith = async (answer) => {
    const { settle } = await import('../../backend/jobs/abandonedCheckout.job.js');
    return settle(checkoutRow(), { now: NOW, reconcile: paid, send: vi.fn(async () => answer), flag: vi.fn(async () => 'flagged') });
  };

  it('a route that could not be reached is asked about again', async () => {
    expect(await settleWith('retry')).toEqual({ outcome: 'retry', final: false });
  });

  it('booked, re-queued, in progress and refused keep their outcomes', async () => {
    expect(await settleWith('confirmed')).toEqual({ outcome: 'booked', final: true });
    expect(await settleWith('already-finished')).toEqual({ outcome: 'booked', final: true });
    expect(await settleWith('requeued')).toEqual({ outcome: 'requeued', final: true });
    expect(await settleWith('in-progress')).toEqual({ outcome: 'in-progress', final: true });
    expect(await settleWith('failed')).toEqual({ outcome: 'failed', final: true });
  });
});
