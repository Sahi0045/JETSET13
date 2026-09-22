import { describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * The booking queue's failure email, when the order route answered "a person
 * is on this one" (409 BOOKING_NEEDS_REVIEW).
 *
 * The route answers that for a booking already flagged for a person: a commit
 * the airline never answered ("our team is checking with the airline whether
 * this booking went through ... please do not book this trip again"), or a PNR
 * the airline confirmed no seat on, for which the route deliberately sends no
 * email because a person contacts the customer. The queue took it for any
 * final failure and emailed "We could not confirm your flight booking ... Our
 * team has been alerted and will contact you" - which says the booking failed
 * while the airline may hold it, and invites the second booking the customer
 * must not make.
 *
 * No failure email is sent for it: the booking already carries the flag a
 * person works from, and that person tells the customer what the airline said.
 * Every other final failure is emailed as before.
 */

const REF = 'FLTQREV1';
const minuteAgo = () => new Date(Date.now() - 60_000).toISOString();
const tenMinutesAgo = () => new Date(Date.now() - 10 * 60_000).toISOString();

const order = {
  bookingReference: REF,
  transactionId: 'SI-QREV',
  contactInfo: { email: 'jane@example.com' },
  travelers: [{ id: '1', firstName: 'Jane', lastName: 'Doe' }],
};

const queuedRow = (details = {}) => ({
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 291,
  created_at: new Date().toISOString(),
  booking_details: {
    queued_order: order,
    queued_env: 'production',
    customer_email: 'jane@example.com',
    gds_chain: { state: 'queued', startedAt: minuteAgo(), queueAttempts: 1 },
    ...details,
  },
});

// The row once another run of the same order had sent it to the airline and
// the commit never answered; the worker replays what it read while it was
// still queued. (Read with the flag already on it, the worker only drops the
// stored order - queueActionFor answers 'clear' - and never gets this answer.)
const commitUnknownRow = () => queuedRow({
  gds_chain: { state: 'in_progress', startedAt: tenMinutesAgo(), claimedAt: tenMinutesAgo(), attempt: 1 },
  needs_review: { reason: 'chain failed after commit at commit', ticketed: false, at: tenMinutesAgo() },
});
// The row after the route's own replay committed a PNR with no confirmed seat
// and flagged it (flagForReview); the worker replayed what it read before.
const seatlessRow = () => ({
  ...queuedRow({
    pnr: 'SEAT42',
    gds: { ticketed: false },
    gds_chain: { state: 'finished', finishedAt: minuteAgo() },
    needs_review: { reason: 'chain failed after commit at segmentStatus', ticketed: false, at: minuteAgo() },
  }),
  status: 'pending_ticketing',
});

const CHECKING = `Our team is checking with the airline whether this booking went through, so it was not sent to the airline again. `
  + 'Nothing more has been charged. Please do not book this trip again in the meantime - we will email you either way. '
  + `If you have not heard from us within 2 business days, call (877) 538-7380 with booking reference ${REF}.`;

let table = null;

const load = async (rows) => {
  vi.resetModules();
  table = fakeBookingsTable(rows);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const job = await import('../../backend/jobs/bookingQueue.job.js');
  const { sendEmail } = await import('../../backend/services/emailService.js');
  sendEmail.mockClear();
  return { ...job, sendEmail };
};

const answering = (status, body) => vi.fn().mockResolvedValue({ status, json: async () => body });
const snapshot = (row) => JSON.parse(JSON.stringify(row));

describe('a queued booking the route answered "a person is on this one"', () => {
  it('a commit being checked with the airline: no "could not confirm" email, the flag kept, the order dropped', async () => {
    const { replay, sendEmail } = await load([commitUnknownRow()]);
    const flag = snapshot(table.row(REF).booking_details.needs_review);

    const outcome = await replay(queuedRow(), {
      baseUrl: 'http://x',
      fetchImpl: answering(409, {
        success: false, code: 'BOOKING_NEEDS_REVIEW', needsReview: true, bookingReference: REF, paymentState: 'held', error: CHECKING, message: CHECKING,
      }),
    });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(outcome).toBe('needs-review');
    expect(table.row(REF).booking_details.needs_review).toEqual(flag);
    expect(table.row(REF).booking_details.queued_order).toBeUndefined();
  });

  it('a PNR the airline confirmed no seat on: no email either - the route sends none, a person contacts them', async () => {
    const { replay, sendEmail } = await load([seatlessRow()]);
    const message = 'The airline has not confirmed a seat on every flight - our team will contact you';

    const outcome = await replay(queuedRow(), {
      baseUrl: 'http://x',
      fetchImpl: answering(409, { success: false, code: 'BOOKING_NEEDS_REVIEW', needsReview: true, pnr: 'SEAT42', error: message, message }),
    });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(outcome).toBe('needs-review');
  });
});

// Fences: every other final failure is emailed exactly as before.
describe('the other final failures', () => {
  const emailed = async (status, body) => {
    const { replay, sendEmail } = await load([queuedRow()]);
    const outcome = await replay(snapshot(table.row(REF)), { baseUrl: 'http://x', fetchImpl: answering(status, body) });
    expect(outcome).toBe('failed');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    return sendEmail.mock.calls[0][0];
  };

  it('a payer not verified: "We could not confirm your flight booking", our team alerted', async () => {
    const mail = await emailed(403, { success: false, code: 'PAYER_NOT_VERIFIED' });

    expect(mail.subject).toBe('We could not confirm your flight booking');
    expect(mail.data.whatHappensNext).toBe('We could not confirm your booking. Our team has been alerted and will contact you. '
      + 'You can also call (877) 538-7380 with your booking reference.');
  });

  it('a second payment for one trip: its own words', async () => {
    const mail = await emailed(409, { success: false, code: 'DUPLICATE_PAYMENT', duplicatePayment: true, needsReview: true });

    expect(mail.data.whatHappensNext).toMatch(/^This payment looks like a second payment for a trip you had already booked/);
  });

  it('a failed booking whose payment went back: the refund words', async () => {
    const mail = await emailed(502, { success: false, code: 'BOOKING_FAILED', bookingFailed: true, refunded: true });

    expect(mail.data.whatHappensNext).toMatch(/your payment has been reversed/);
  });
});
