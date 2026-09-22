import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attentionLabel, attentionOf, SCHEDULE_CHANGED_REVIEW_REASON } from '../../shared/reviewQueue.js';

/**
 * A booking held after its ticket was issued, with no ticket number recorded.
 *
 * flagForReview writes `gds.ticketed: true` and a held flag with `ticketed:
 * true` - from the order route's outer catch, or a chain error past issuance -
 * and records no ticket numbers. Slack told staff to "record any ticket number
 * missing, then send the customer their e-ticket", and nothing could: no route
 * or desk action writes a ticket number, and ticket sync, the only writer of
 * them after the order, skipped the row - its unticketed population wants
 * gds.ticketed false, its numbers-missing one the chain's numbers flag. The
 * booking kept no ticket number for good, and the customer was never sent
 * their e-ticket.
 *
 * Ticket sync now reads these too: PNR_Retrieve only, the numbers recorded the
 * way the chain records them, the e-ticket sent once, and the held flag marked
 * handled as the numbers flag is.
 */

/** The bookings table behind the query builder, as ticketSyncWindow.test.js has it. */
let rows = [];

const valueAt = (row, path) => path.split(/->>?/).reduce((value, key) => (value == null ? undefined : value[key]), row);
const text = (value) => (value == null ? null : String(value));

const table = () => {
  const filters = [];
  const sorts = [];
  let cap = Infinity;
  const leaf = (clause) => {
    const [, column, op, value] = /^(.+?)\.(is|eq)\.(.*)$/.exec(clause);
    return (row) => (op === 'is' ? valueAt(row, column) == null : text(valueAt(row, column)) === value);
  };
  const run = () => {
    let out = rows.filter((row) => filters.every((keep) => keep(row)));
    out = [...out].sort((a, b) => {
      for (const { column, ascending, nullsFirst } of sorts) {
        const left = valueAt(a, column);
        const right = valueAt(b, column);
        if (left == null && right == null) continue;
        const nullFirst = nullsFirst ?? !ascending;
        if (left == null) return nullFirst ? -1 : 1;
        if (right == null) return nullFirst ? 1 : -1;
        if (left === right) continue;
        return (left > right ? 1 : -1) * (ascending ? 1 : -1);
      }
      return 0;
    });
    return { data: out.slice(0, cap), error: null };
  };
  const chain = {
    select: () => chain,
    in: (column, list) => { filters.push((row) => list.includes(valueAt(row, column))); return chain; },
    eq: (column, value) => { filters.push((row) => text(valueAt(row, column)) === String(value)); return chain; },
    is: (column) => { filters.push((row) => valueAt(row, column) == null); return chain; },
    not: (column, op, value) => {
      if (op === 'is') filters.push((row) => valueAt(row, column) != null);
      else if (op === 'in') {
        const list = String(value).replace(/^\(|\)$/g, '').split(',');
        filters.push((row) => valueAt(row, column) != null && !list.includes(String(valueAt(row, column))));
      } else throw new Error(`table double: .not(${op}) is not understood`);
      return chain;
    },
    or: (expression) => {
      const any = expression.split(',').map(leaf);
      filters.push((row) => any.some((test) => test(row)));
      return chain;
    },
    order: (column, { ascending = true, nullsFirst } = {}) => { sorts.push({ column, ascending, nullsFirst }); return chain; },
    limit: (count) => { cap = count; return chain; },
    then: (resolve, reject) => {
      try { resolve(run()); } catch (error) { reject(error); }
    },
  };
  return chain;
};

vi.mock('../../backend/routes/flight.routes.js', () => ({
  patchBookingDetails: vi.fn(async (reference, patch) => {
    const row = rows.find((r) => r.booking_reference === reference);
    if (!row) return null;
    const changes = typeof patch === 'function' ? patch(row.booking_details) : patch;
    row.booking_details = { ...row.booking_details, ...changes };
    return row;
  }),
}));

const HELD_AT = '2026-09-20T10:05:00.000Z';

const heldTicketed = ({ review = {}, details = {}, ...over } = {}) => ({
  booking_reference: 'FLTHELDT',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 300,
  created_at: '2026-09-20T10:00:00.000Z',
  passenger_details: [{ id: '1', firstName: 'Asha', lastName: 'Rao', ptc: 'ADULT', email: 'flyer@example.com' }],
  booking_details: {
    pnr: 'HELDT1',
    customer_email: 'flyer@example.com',
    gds: { ticketed: true },
    // As flagForReview writes it from the order route's outer catch.
    needs_review: { reason: 'order route failed after commit: boom', ticketed: true, at: HELD_AT, ...review },
    ...details,
  },
  ...over,
});

const onPnr = () => ({
  success: true,
  data: {
    tickets: [{ number: '220-7491175301', travelerId: '2', issuedOn: '2026-09-20' }],
    travelers: [{ id: '2', name: { firstName: 'ASHA', lastName: 'RAO' } }],
  },
});

let job;
let alarm;
let amadeus;
let sendEmail;

beforeEach(async () => {
  rows = [];
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(() => table());
  job = await import('../../backend/jobs/ticketSync.job.js');
  alarm = await import('../../backend/jobs/needsReviewAlert.job.js');
  amadeus = { getFlightOrderDetails: vi.fn(async () => onPnr()) };
  sendEmail = vi.fn(async () => ({ success: true }));
});

describe('a booking held after its ticket was issued, with no number recorded', () => {
  it('ticket sync reads its numbers from the PNR, records them and sends the e-ticket once', async () => {
    rows.push(heldTicketed());
    expect(attentionLabel(attentionOf(rows[0]))).toBe('Ticketed, customer not sent it');

    const found = await job.findUnticketed();
    expect(found.map((r) => r.booking_reference)).toEqual(['FLTHELDT']);
    await job.runOnce({ provider: amadeus, sendEmail });

    expect(amadeus.getFlightOrderDetails).toHaveBeenCalledWith('HELDT1');
    const details = rows[0].booking_details;
    // Recorded as the chain records them: our traveller, the PNR's reference kept.
    expect(details.tickets).toEqual([expect.objectContaining({ number: '220-7491175301', travelerId: '1', pnrTravelerId: '2' })]);
    expect(details.gds.ticketed).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({
      customerEmail: 'flyer@example.com', bookingReference: 'FLTHELDT', tickets: [expect.objectContaining({ number: '220-7491175301' })],
    });
    expect(details.ticket_email_sent_at).toBeTruthy();

    // Marked handled: nothing is left for the desk or the alarm.
    expect(details.needs_review).toMatchObject({ reason: 'order route failed after commit: boom', resolved_by: 'ticket sync', resolved_at: expect.any(String) });
    expect(details.needs_review.resolution).toMatch(/220-7491175301/);
    expect(attentionOf(rows[0])).toBeNull();
    expect(alarm.selectUnannounced(rows)).toHaveLength(0);

    // And never sent twice.
    await job.runOnce({ provider: amadeus, sendEmail });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('the numbers the order route did record still get their e-ticket sent', async () => {
    // A final save that failed after issuance records what the chain read back.
    rows.push(heldTicketed({ review: { reason: 'order route failed after commit: the booking could not be saved' },
      details: { tickets: [{ number: '220-7491175301', travelerId: '1', pnrTravelerId: '2' }] } }));

    await job.runOnce({ provider: amadeus, sendEmail });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(rows[0].booking_details.tickets).toHaveLength(1);
    expect(attentionOf(rows[0])).toBeNull();
  });

  it('Slack tells staff what ticket sync does, and never to record a number by hand', () => {
    const text = alarm.buildMessage([heldTicketed()]);
    expect(text).toMatch(/held after its ticket was issued/);
    expect(text).toMatch(/Ticket sync reads the ticket numbers from the PNR/);
    expect(text).not.toMatch(/record any ticket number/);
    expect(text).toMatch(/Do NOT reissue and do NOT refund/);
  });
});

// Fences: what ticket sync leaves alone, and what it does not change.
describe('around it', () => {
  it('no FA line yet: nothing recorded, no email, still on the desk, asked again later', async () => {
    rows.push(heldTicketed());
    amadeus.getFlightOrderDetails.mockResolvedValue({ success: true, data: { tickets: [], travelers: [{ id: '2' }] } });

    const result = await job.runOnce({ provider: amadeus, sendEmail });

    expect(result.results[0].outcome).toBe('still-unticketed');
    expect(rows[0].booking_details.tickets).toBeUndefined();
    expect(rows[0].booking_details.ticket_checked_at).toBeTruthy();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(attentionLabel(attentionOf(rows[0]))).toBe('Ticketed, customer not sent it');
  });

  it('a cancel flagged while the PNR was being read: left to the desk', async () => {
    rows.push(heldTicketed());
    amadeus.getFlightOrderDetails.mockImplementation(async () => {
      rows[0].booking_details = {
        ...rows[0].booking_details,
        needs_review: {
          reason: 'GDS cancellation failed; refund withheld to avoid paying out against a live booking',
          source: 'cancellation', cancelFailed: true, at: new Date().toISOString(), previous: rows[0].booking_details.needs_review,
        },
      };
      return onPnr();
    });

    const result = await job.runOnce({ provider: amadeus, sendEmail });

    expect(result.results[0].outcome).toBe('left-to-desk');
    expect(rows[0].booking_details.tickets).toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('a hold a person already marked handled, or one on a cancelled booking, is not read', async () => {
    rows.push(heldTicketed({ review: { resolved_at: HELD_AT, resolved_by: 'desk', resolution: 'e-ticket sent by hand' } }));
    rows.push(heldTicketed({ booking_reference: 'FLTHELDC', status: 'cancelled' }));

    expect(await job.findUnticketed()).toEqual([]);
    await job.runOnce({ provider: amadeus, sendEmail });
    expect(amadeus.getFlightOrderDetails).not.toHaveBeenCalled();
  });

  it('a hold written before issuance is not this population: its own flag stays open for a person', async () => {
    // Held with no ticket, then ticketed by hand: the unticketed population
    // records it and sends the e-ticket, and leaves the held flag alone.
    rows.push(heldTicketed({ review: { reason: 'chain failed after commit at issueTicket', ticketed: false }, details: { gds: { ticketed: false } }, status: 'pending_ticketing' }));

    await job.runOnce({ provider: amadeus, sendEmail });

    expect(rows[0].booking_details.tickets).toHaveLength(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(rows[0].booking_details.needs_review.resolved_at).toBeUndefined();
  });

  it('a schedule change kept under the hold goes back on top for the desk', async () => {
    rows.push(heldTicketed({ review: { previous: { reason: SCHEDULE_CHANGED_REVIEW_REASON, statuses: ['TK'], at: HELD_AT } } }));

    await job.runOnce({ provider: amadeus, sendEmail });

    const review = rows[0].booking_details.needs_review;
    expect(review).toMatchObject({ reason: SCHEDULE_CHANGED_REVIEW_REASON });
    expect(review.resolved_at).toBeUndefined();
    expect(review.previous).toMatchObject({ reason: 'order route failed after commit: boom', resolved_by: 'ticket sync' });
    expect(attentionLabel(attentionOf(rows[0]))).toBe('Airline changed the schedule');
  });
});
