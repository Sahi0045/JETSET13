import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attentionOf, TICKET_NUMBERS_MISSING } from '../../shared/reviewQueue.js';

/**
 * Ticket sync reads the numbers the booking chain could not.
 *
 * The chain issues the ticket, then reads its number back from the PNR. When
 * the numbers have not landed before its retries run out, it records the
 * booking ticketed and flags it `ticket_numbers_not_retrieved`. ticketSync's
 * findUnticketed skipped every row with `gds.ticketed: true`, so nothing ever
 * read those numbers: the booking waited for a person to read the FA lines,
 * and the customer's document said "We will email your ticket number
 * shortly" for as long as that took.
 *
 * Ticket sync now also takes paid, open bookings whose top flag is that one,
 * unresolved, with its tickets not voided (liveTicketNumbersMissingOf). It
 * asks with PNR_Retrieve only (getFlightOrderDetails), records the numbers the
 * way the chain does (attributeTickets: our traveller ids, the PNR reference
 * kept as pnrTravelerId), resolves the flag so the desk and the alarm stop
 * showing it, and sends the e-ticket email that was promised. Same window,
 * same ten per tick, same "asked" stamp as the unticketed rows.
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

const A = '220-7491175301';
const B = '220-7491175302';
const REFUSED = 'GDS cancellation failed; refund withheld to avoid paying out against a live booking';

const numbersMissing = (over = {}) => ({
  reason: TICKET_NUMBERS_MISSING, expected: 2, got: 0, at: '2026-09-20T10:05:00.000Z', ...over,
});

const travellers = [
  { id: '1', firstName: 'Asha', lastName: 'Rao', ptc: 'ADULT', email: 'flyer@example.com' },
  { id: '2', firstName: 'Dev', lastName: 'Rao', ptc: 'ADULT' },
];

const booking = (reference, pnr, details = {}, over = {}) => ({
  booking_reference: reference,
  status: 'confirmed',
  payment_status: 'paid',
  created_at: '2026-09-20T10:00:00.000Z',
  passenger_details: travellers,
  booking_details: { pnr, customer_email: 'flyer@example.com', gds: { ticketed: true }, tickets: [], ...details },
  ...over,
});

const flagged = (reference, pnr, flag = numbersMissing(), details = {}, over = {}) => booking(reference, pnr, { needs_review: flag, ...details }, over);

/**
 * The PNR as retrieveBooking reads it: Amadeus lists the passengers in its own
 * order and numbers (5 and 2 for our 1 and 2), and each FA line names one.
 */
const pnrWith = (tickets) => ({
  tickets,
  travelers: [
    { id: '5', name: { firstName: 'ASHA', lastName: 'RAO' } },
    { id: '2', name: { firstName: 'DEV', lastName: 'RAO' } },
  ],
});
const fa = (number, travelerId) => ({ number, travelerId, validatingCarrier: 'LH', issuedOn: '2026-09-20' });

/**
 * A provider with only the retrieve. Anything else ticket sync touched -
 * issue, void, cancel, price - would throw "is not a function".
 */
const provider = (tickets) => ({ getFlightOrderDetails: vi.fn(async () => ({ success: true, data: pnrWith(tickets) })) });

const row = (reference) => rows.find((r) => r.booking_reference === reference);

let job;
let alarm;

beforeEach(async () => {
  rows = [];
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(() => table());
  job = await import('../../backend/jobs/ticketSync.job.js');
  alarm = await import('../../backend/jobs/needsReviewAlert.job.js');
});

describe('a ticketed booking whose numbers the chain could not read back', () => {
  it('is asked about with PNR_Retrieve, and the numbers are recorded the way the chain records them', async () => {
    rows.push(flagged('FLT-NUM', 'NUMS01'));
    const amadeus = provider([fa(A, '5'), fa(B, '2')]);
    const sendEmail = vi.fn(async () => ({ success: true }));

    const result = await job.runOnce({ provider: amadeus, sendEmail });

    expect(amadeus.getFlightOrderDetails).toHaveBeenCalledWith('NUMS01');
    expect(result.ticketed).toBe(1);
    const details = row('FLT-NUM').booking_details;
    // Against our traveller ids, the PNR's own reference kept beside them.
    expect(details.tickets.map(({ number, travelerId, pnrTravelerId }) => ({ number, travelerId, pnrTravelerId }))).toEqual([
      { number: A, travelerId: '1', pnrTravelerId: '5' },
      { number: B, travelerId: '2', pnrTravelerId: '2' },
    ]);
    expect(details.gds.ticketed).toBe(true);
    // The promised email, once.
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].tickets.map((t) => t.number)).toEqual([A, B]);
  });

  it('resolves the flag, so the desk and the alarm stop showing it', async () => {
    rows.push(flagged('FLT-NUM', 'NUMS01'));

    await job.runOnce({ provider: provider([fa(A, '5'), fa(B, '2')]), sendEmail: vi.fn(async () => ({ success: true })) });

    const after = row('FLT-NUM');
    expect(after.booking_details.needs_review).toMatchObject({
      reason: TICKET_NUMBERS_MISSING, resolved_by: 'ticket sync',
    });
    expect(after.booking_details.needs_review.resolved_at).toBeTruthy();
    expect(after.booking_details.needs_review.resolution).toMatch(new RegExp(`${A}.*${B}`));
    expect(attentionOf(after)).toBeNull();
    expect(alarm.selectUnannounced([after])).toEqual([]);
    // And it is not asked about again.
    expect(await job.findUnticketed()).toEqual([]);
  });

  it('completes a set the chain recorded in part, and the owed-email pass announces it', async () => {
    rows.push(flagged('FLT-PART', 'NUMS02', numbersMissing({ got: 1 }), {
      tickets: [{ number: A, travelerId: '1', pnrTravelerId: '5', validatingCarrier: 'LH', issuedOn: '2026-09-20' }],
    }));
    const sendEmail = vi.fn(async () => ({ success: true }));

    await job.runOnce({ provider: provider([fa(A, '5'), fa(B, '2')]), sendEmail });

    const details = row('FLT-PART').booking_details;
    expect(details.tickets.map((t) => t.number)).toEqual([A, B]);
    expect(details.needs_review.resolved_at).toBeTruthy();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('with the numbers still not on the PNR: the flag stays, the row goes to the back, and nothing throws', async () => {
    rows.push(flagged('FLT-STILL', 'NUMS03'));
    const amadeus = provider([]);

    const first = await job.runOnce({ provider: amadeus, sendEmail: vi.fn() });
    const second = await job.runOnce({ provider: amadeus, sendEmail: vi.fn() });

    expect(first.results).toEqual([expect.objectContaining({ reference: 'FLT-STILL', outcome: 'still-unticketed' })]);
    expect(second.results).toEqual([expect.objectContaining({ reference: 'FLT-STILL', outcome: 'still-unticketed' })]);
    const details = row('FLT-STILL').booking_details;
    expect(details.needs_review).toEqual(numbersMissing());
    expect(details.tickets).toEqual([]);
    expect(details.ticket_checked_at).toBeTruthy();
    expect(amadeus.getFlightOrderDetails).toHaveBeenCalledTimes(2);
  });

  it('with only one of two numbers on the PNR: nothing is written but the asked stamp', async () => {
    rows.push(flagged('FLT-HALF', 'NUMS04'));

    const result = await job.runOnce({ provider: provider([fa(A, '5')]), sendEmail: vi.fn() });

    expect(result.results[0].outcome).toBe('partially-ticketed');
    const details = row('FLT-HALF').booking_details;
    expect(details.tickets).toEqual([]);
    expect(details.needs_review).toEqual(numbersMissing());
  });

  it('writes nothing, and sends nothing, when a cancel flagged it while the PNR was being read', async () => {
    rows.push(flagged('FLT-RACE', 'RACE01'));
    const cancelFlag = { reason: REFUSED, source: 'cancellation', cancelFailed: true, previous: numbersMissing() };
    const amadeus = {
      getFlightOrderDetails: vi.fn(async () => {
        row('FLT-RACE').booking_details = { ...row('FLT-RACE').booking_details, needs_review: cancelFlag };
        return { success: true, data: pnrWith([fa(A, '5'), fa(B, '2')]) };
      }),
    };
    const sendEmail = vi.fn(async () => ({ success: true }));

    const result = await job.runOnce({ provider: amadeus, sendEmail });

    expect(result.results[0].outcome).toBe('left-to-desk');
    expect(row('FLT-RACE').booking_details.tickets).toEqual([]);
    expect(row('FLT-RACE').booking_details.needs_review).toEqual(cancelFlag);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('shares the ten per tick with the unticketed rows, least recently asked first', async () => {
    for (let n = 1; n <= 8; n += 1) rows.push(booking(`FLT-U${n}`, `UNT${n}00`, { gds: { ticketed: false }, tickets: [] }, { created_at: `2026-09-0${n}T10:00:00.000Z` }));
    for (let n = 1; n <= 8; n += 1) rows.push(flagged(`FLT-M${n}`, `MIS${n}00`, numbersMissing(), {}, { created_at: `2026-09-0${n}T11:00:00.000Z` }));

    expect(await job.findUnticketed()).toHaveLength(10);
    const amadeus = provider([]);
    for (let tick = 0; tick < 2; tick += 1) await job.runOnce({ provider: amadeus, sendEmail: vi.fn() });
    // Twenty asks over two ticks reach all sixteen.
    expect(new Set(amadeus.getFlightOrderDetails.mock.calls.map(([pnr]) => pnr)).size).toBe(16);
  });
});

describe('a voided row is never picked up', () => {
  it('every ticket voided, then the cancel refused', async () => {
    rows.push(flagged('FLT-VOID', 'VOID01', {
      reason: REFUSED, source: 'cancellation', cancelFailed: true, voided_tickets: [A, B], unvoided_tickets: [], previous: numbersMissing(),
    }, { voided_tickets: [A, B] }));

    expect(await job.findUnticketed()).toEqual([]);
  });

  it('one of two voided, then the cancel refused', async () => {
    rows.push(flagged('FLT-HALFVOID', 'VOID02', {
      reason: REFUSED, source: 'cancellation', cancelFailed: true, voided_tickets: [A], unvoided_tickets: [B], previous: numbersMissing(),
    }, { voided_tickets: [A] }));

    expect(await job.findUnticketed()).toEqual([]);
  });

  it('a numbers-missing flag whose tickets the booking records as voided', async () => {
    rows.push(flagged('FLT-LEGACYVOID', 'VOID03', numbersMissing(), { voided_tickets: [A, B] }));

    expect(await job.findUnticketed()).toEqual([]);
  });
});

/**
 * Fence: what the job does on main for every other row.
 */
describe('fence: the rows next to it', () => {
  it('an ordinary unticketed row is recorded exactly as today', async () => {
    rows.push(booking('FLT-HAND', 'HANDMD', { gds: { ticketed: false }, tickets: undefined }));
    const sendEmail = vi.fn(async () => ({ success: true }));

    const result = await job.runOnce({ provider: provider([fa(A, '5'), fa(B, '2')]), sendEmail });

    expect(result.ticketed).toBe(1);
    const details = row('FLT-HAND').booking_details;
    // The job's own shape: the PNR reference as travelerId, the name joined on.
    expect(details.tickets).toEqual([{ ...fa(A, '5'), travelerName: 'RAO/ASHA' }, { ...fa(B, '2'), travelerName: 'RAO/DEV' }]);
    expect(details.gds.ticketed).toBe(true);
    expect(details.needs_review).toBeUndefined();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('an unticketed row flagged for staff keeps its flag as it was', async () => {
    const flag = { reason: 'chain failed after commit at issueTicket', ticketed: false, at: '2026-09-20T10:05:00.000Z' };
    rows.push(booking('FLT-FLAG', 'FLAGGD', { gds: { ticketed: false }, tickets: undefined, needs_review: flag }));

    const result = await job.runOnce({ provider: provider([fa(A, '5'), fa(B, '2')]), sendEmail: vi.fn(async () => ({ success: true })) });

    expect(result.ticketed).toBe(1);
    expect(row('FLT-FLAG').booking_details.needs_review).toEqual(flag);
  });

  it('a ticketed row with its numbers and no flag is not asked about', async () => {
    rows.push(booking('FLT-DONE', 'DONE01', { tickets: [fa(A, '5')] }));
    expect(await job.findUnticketed()).toEqual([]);
  });

  it('a numbers-missing flag a person resolved is left to them', async () => {
    rows.push(flagged('FLT-HANDLED', 'HNDL01', numbersMissing({ resolved_at: '2026-09-21T09:00:00Z', resolved_by: 'desk@example.com', resolution: 'called the airline' })));
    expect(await job.findUnticketed()).toEqual([]);
  });

  it('a numbers-missing flag under a refused cancel that voided nothing is left to the desk', async () => {
    rows.push(flagged('FLT-CXLFAIL', 'CXLF01', { reason: REFUSED, source: 'cancellation', cancelFailed: true, previous: numbersMissing() }));
    expect(await job.findUnticketed()).toEqual([]);
  });

  it('a refunded, cancelled or unpaid numbers-missing row is not asked about', async () => {
    rows.push(flagged('FLT-REF', 'REF001', numbersMissing(), {}, { payment_status: 'refunded' }));
    rows.push(flagged('FLT-PREF', 'REF002', numbersMissing(), {}, { payment_status: 'partially_refunded' }));
    rows.push(flagged('FLT-CXL', 'CXL001', numbersMissing(), {}, { status: 'cancelled' }));
    rows.push(flagged('FLT-UNPAID', 'UNP001', numbersMissing(), {}, { payment_status: 'unpaid' }));
    expect(await job.findUnticketed()).toEqual([]);
  });

  // Not a refused cancel a person already resolved: the desk no longer shows
  // it, so Slack does not announce it either (resolvedFlagNotAnnounced.test.js).
  it('the alarm still announces an unresolved numbers-missing flag, and not a resolved refused cancel', () => {
    const missing = flagged('FLT-NUM', 'NUMS01');
    const cancelFailed = flagged('FLT-CXLFAIL', 'CXLF01', {
      reason: REFUSED, source: 'cancellation', cancelFailed: true, resolved_at: '2026-09-21T09:00:00Z',
    });
    expect(alarm.selectUnannounced([missing, cancelFailed]).map((b) => b.booking_reference)).toEqual(['FLT-NUM']);
  });
});
