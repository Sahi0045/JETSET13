import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTO_COMPLETE_WINDOW_MS, settle } from '../../backend/jobs/abandonedCheckout.job.js';
import { supabaseMock } from './setup.js';

/**
 * A paid checkout the job means to hand to a human must actually reach one.
 *
 * `flagForReview` writes `needs_review` onto the row under a compare-and-set
 * (utils/bookingDetailsGuard.js), whose own contract is that "a write that
 * matches no row lost a race, and the caller reads again and decides again".
 * It never read again. It could not even tell: the update had no `.select()`,
 * and supabase-js answers `{ data: null, error: null }` for an update that
 * matched nothing. So a lost race - `reconcileBookingPayment` writing
 * `arc_captured_amount` between the read and the write is the ordinary one -
 * came back `true`, `settle` answered `final: true`, and the job never asked
 * about the row again.
 *
 * What that left: `status: pending`, `payment_status: paid`, no PNR, no
 * `queued_order`, no `needs_review`. The needs-review alarm needs a flag or a
 * PNR, the payment-failure alarm needs a cancellation, ticket sync needs a PNR,
 * the booking queue needs a queued order. The customer's money sat captured,
 * no flight was booked, and nothing anywhere said so.
 *
 * The same hole was open two more ways: a read or a write that failed for a
 * moment also answered final, and so did finding a booking chain running on
 * the row - which may yet fail and leave it exactly as above.
 *
 * These drive `settle` with the REAL flag function against a mocked database,
 * so they exercise the write itself rather than a stub of it.
 */

const HOUR = 60 * 60_000;
const NOW = Date.parse('2026-09-21T12:00:00Z');

const paidRow = ({ ageMs = AUTO_COMPLETE_WINDOW_MS + HOUR, details = {} } = {}) => ({
  id: 'row-1',
  booking_reference: 'FLTLATE1',
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  created_at: new Date(NOW - ageMs).toISOString(),
  booking_details: {
    order_id: 'FLTLATE1',
    success_indicator: 'SUCCESS-1',
    pending_booking_data: { returnUrl: 'https://www.jetsetterss.com/payment/callback?orderId=FLTLATE1' },
    ...details,
  },
});

/** The row as flagForReview reads it back. */
const fresh = (details = {}, row = {}) => ({
  data: { status: 'pending', payment_status: 'paid', booking_details: { order_id: 'FLTLATE1', ...details }, ...row },
  error: null,
});

const WROTE_ONE = { data: [{ booking_reference: 'FLTLATE1' }], error: null };
// What supabase-js returns for an update whose filters matched no row.
const WROTE_NONE = { data: [], error: null };

/**
 * A database that answers flagForReview's reads and writes in order, and
 * counts them. An update only resolves through `.select()`, so a write that
 * does not ask how many rows it touched gets no answer from this mock.
 */
function database({ reads = [], writes = [] }) {
  const calls = { reads: 0, writes: 0, written: [] };
  supabaseMock.from.mockImplementation(() => {
    let updating = false;
    const chain = {};
    for (const method of ['eq', 'is', 'gte', 'lte', 'order', 'limit']) chain[method] = vi.fn(() => chain);
    chain.update = vi.fn((values) => {
      updating = true;
      calls.written.push(values);
      return chain;
    });
    chain.select = vi.fn(() => {
      if (!updating) return chain;
      const answer = writes[calls.writes] ?? WROTE_NONE;
      calls.writes += 1;
      return Promise.resolve(answer);
    });
    chain.single = vi.fn(() => {
      const answer = reads[calls.reads] ?? { data: null, error: { message: 'no more reads scripted' } };
      calls.reads += 1;
      return Promise.resolve(answer);
    });
    return chain;
  });
  return calls;
}

const paid = vi.fn(async () => ({ paid: true }));
const neverSend = vi.fn(async () => {
  throw new Error('a late checkout must never be sent to the order route');
});

afterEach(() => {
  supabaseMock.from.mockReset();
  vi.clearAllMocks();
});

describe('flagging a paid checkout too old to book', () => {
  // The audit finding, exactly.
  it('does not call the checkout settled when every write lost its race', async () => {
    const calls = database({ reads: [fresh(), fresh(), fresh()], writes: [WROTE_NONE, WROTE_NONE, WROTE_NONE] });

    const result = await settle(paidRow(), { now: NOW, reconcile: paid, send: neverSend });

    expect(result.final).toBe(false);
    expect(calls.writes).toBe(3);
  });

  // What the guard's contract asks for: read again, decide again.
  it('reads the row again after a lost race, and flags it on the next try', async () => {
    const calls = database({
      reads: [fresh(), fresh({ arc_captured_amount: '109.21' })],
      writes: [WROTE_NONE, WROTE_ONE],
    });

    const result = await settle(paidRow(), { now: NOW, reconcile: paid, send: neverSend });

    expect(result).toEqual({ outcome: 'flagged-late', final: true });
    expect(calls.reads).toBe(2);
    // Built from the SECOND read, so the payment reconcile that raced it survives.
    expect(calls.written[1].booking_details.arc_captured_amount).toBe('109.21');
    expect(calls.written[1].booking_details.needs_review.reason).toMatch(/never came back/);
  });

  it('is settled once a write lands', async () => {
    database({ reads: [fresh()], writes: [WROTE_ONE] });

    expect(await settle(paidRow(), { now: NOW, reconcile: paid, send: neverSend }))
      .toEqual({ outcome: 'flagged-late', final: true });
  });

  it('looks again when the row could not be read', async () => {
    database({ reads: [{ data: null, error: { message: 'connection reset' } }] });

    expect((await settle(paidRow(), { now: NOW, reconcile: paid, send: neverSend })).final).toBe(false);
  });

  it('looks again when the write failed', async () => {
    database({ reads: [fresh()], writes: [{ data: null, error: { message: 'statement timeout' } }] });

    expect((await settle(paidRow(), { now: NOW, reconcile: paid, send: neverSend })).final).toBe(false);
  });

  // A running chain may still fail and leave the row paid and unbooked.
  it('looks again when a booking chain is running on the row', async () => {
    const running = { gds_chain: { state: 'in_progress', startedAt: new Date().toISOString() } };
    const calls = database({ reads: [fresh(running)] });

    expect((await settle(paidRow(), { now: NOW, reconcile: paid, send: neverSend })).final).toBe(false);
    expect(calls.writes).toBe(0);
  });

  // Someone else owns it now - nothing to write, and nothing to look at again.
  it('leaves a row a human has already been asked about', async () => {
    const calls = database({ reads: [fresh({ needs_review: { reason: 'earlier', at: '2026-09-21T10:00:00Z' } })] });

    expect(await settle(paidRow(), { now: NOW, reconcile: paid, send: neverSend }))
      .toEqual({ outcome: 'flagged-late', final: true });
    expect(calls.writes).toBe(0);
  });

  it('leaves a row the customer came back and booked', async () => {
    const calls = database({ reads: [fresh({ pnr: 'ABC123' })] });

    expect((await settle(paidRow(), { now: NOW, reconcile: paid, send: neverSend })).final).toBe(true);
    expect(calls.writes).toBe(0);
  });

  it('leaves a row that has been refunded', async () => {
    const calls = database({ reads: [fresh({}, { payment_status: 'refunded' })] });

    expect((await settle(paidRow(), { now: NOW, reconcile: paid, send: neverSend })).final).toBe(true);
    expect(calls.writes).toBe(0);
  });
});

describe('flagging a paid checkout whose saved data cannot be booked', () => {
  const incomplete = () => paidRow({
    ageMs: 2 * HOUR,
    details: { pending_booking_data: { returnUrl: 'https://www.jetsetterss.com/x', bookingData: { passengerData: [] } } },
  });

  it('does not call it settled when the flag never landed', async () => {
    database({ reads: [fresh(), fresh(), fresh()], writes: [WROTE_NONE, WROTE_NONE, WROTE_NONE] });

    const result = await settle(incomplete(), { now: NOW, reconcile: paid, send: neverSend });

    expect(result.outcome).toBe('flagged-incomplete');
    expect(result.final).toBe(false);
  });
});

/** A checkout complete enough to be booked, so settle reaches the order route. */
const bookableRow = () => paidRow({
  ageMs: 2 * HOUR,
  details: {
    pending_booking_data: {
      orderId: 'FLTLATE1',
      returnUrl: 'https://www.jetsetterss.com/payment/callback?orderId=FLTLATE1&bookingType=flight',
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
        bookingDetails: { contact: { email: 'ann@example.com', phone: '5550100' } },
        calculatedFare: { totalAmount: 109.21 },
      },
    },
  },
});

describe('a checkout the order route refused', () => {
  // The route has already recorded the failure and emailed the customer.
  // Looking again would re-run settle from the top and send the order a second
  // time - a second failure email to the customer. A flag that did not land
  // here is logged, not retried by resending.
  it('is not sent to the order route a second time, even when the flag did not land', async () => {
    database({ reads: [fresh(), fresh(), fresh()], writes: [WROTE_NONE, WROTE_NONE, WROTE_NONE] });
    const send = vi.fn(async () => 'failed');

    const result = await settle(bookableRow(), { now: NOW, reconcile: paid, send });

    expect(result.final).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
