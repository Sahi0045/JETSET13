import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Ticket sync has to reach every booking, not only the oldest ten.
 *
 * `findUnticketed` took the paid bookings with a PNR and no ticket, oldest
 * first, and checked the first ten. A booking that can never be ticketed -
 * Air India refused with 2161 PROHIBITED TICKETING CARRIER, a KU booking
 * refused ETKT NOT AUTHORISED, a PDT PNR since purged - stays in that
 * population for ever, and nothing moved it to the back. So once ten of them
 * existed, they were the ten checked on every tick, and a booking a person
 * ticketed by hand this morning was never retrieved: My Trips kept saying
 * "Ticket pending", the PDF kept saying "do not travel on this document
 * alone", and the e-ticket email was never sent. The job reported `checked: 10`
 * every tick, so nothing looked wrong.
 *
 * Cancelled bookings whose refund failed are in the same population - paid,
 * with a PNR, never ticketed - and were dropped only after the query had
 * already spent its window on them.
 */

/**
 * The bookings table, behind the slice of the query builder the job uses.
 *
 * It filters, orders and caps the way PostgREST does - including NULLS FIRST,
 * and ordering by more than one key - because WHICH rows come back is the whole
 * subject here. A double that ignored order and limit would pass whatever the
 * query asked for.
 */
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
        // Postgres: NULLS LAST for ascending unless told otherwise.
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

// The booking's own compare-and-set patch, reduced to what it does to a row:
// read the current details, apply the patch, merge.
vi.mock('../../backend/routes/flight.routes.js', () => ({
  patchBookingDetails: vi.fn(async (reference, patch) => {
    const row = rows.find((r) => r.booking_reference === reference);
    if (!row) return null;
    const changes = typeof patch === 'function' ? patch(row.booking_details) : patch;
    row.booking_details = { ...row.booking_details, ...changes };
    return row;
  }),
}));

const booking = (reference, pnr, createdAt, over = {}) => ({
  booking_reference: reference,
  status: 'confirmed',
  payment_status: 'paid',
  created_at: createdAt,
  passenger_details: [{ firstName: 'Asha', lastName: 'Rao', email: 'flyer@example.com' }],
  booking_details: { pnr, customer_email: 'flyer@example.com', gds: { ticketed: false } },
  ...over,
});

const day = (n) => `2026-09-${String(n).padStart(2, '0')}T10:00:00.000Z`;

/** Amadeus: only HANDMD has a ticket; the rest never will, and PURGED is gone. */
const amadeus = () => ({
  getFlightOrderDetails: vi.fn(async (pnr) => {
    if (pnr === 'PURGED') throw Object.assign(new Error('Booking not found'), { code: 404 });
    const tickets = pnr === 'HANDMD' ? [{ number: '220-7491175301', travelerId: '2' }] : [];
    return { success: true, data: { tickets, travelers: [{ id: '2', name: { firstName: 'ASHA', lastName: 'RAO' } }] } };
  }),
});

let job;

beforeEach(async () => {
  rows = [];
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(() => table());
  job = await import('../../backend/jobs/ticketSync.job.js');
});

describe('a booking ticketed by hand, behind bookings that never will be', () => {
  it('is found, however many stuck bookings are older than it', async () => {
    // Twelve that can never be ticketed - two of them purged - all older than
    // the one a person has just ticketed.
    for (let n = 1; n <= 12; n += 1) {
      rows.push(booking(`FLT-STUCK-${n}`, n <= 2 ? 'PURGED' : `STUCK${String(n).padStart(2, '0')}`.slice(0, 6), day(n)));
    }
    rows.push(booking('FLT-HAND', 'HANDMD', day(20)));
    const provider = amadeus();
    const sendEmail = vi.fn(async () => ({ success: true }));

    for (let tick = 0; tick < 3; tick += 1) await job.runOnce({ provider, sendEmail });

    const handed = rows.find((r) => r.booking_reference === 'FLT-HAND').booking_details;
    expect(handed.tickets?.map((t) => t.number)).toEqual(['220-7491175301']);
    expect(handed.gds.ticketed).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  /**
   * What moves a stuck booking to the back is a note of when it was last
   * asked about - not a verdict. It must not say the booking is ticketed, and
   * must not stop it being asked about again.
   */
  it('notes when a booking was checked, and nothing else', async () => {
    rows.push(booking('FLT-STUCK', 'STUCKA', day(1)));
    rows.push(booking('FLT-GONE', 'PURGED', day(2)));

    await job.runOnce({ provider: amadeus(), sendEmail: vi.fn() });

    for (const row of rows) {
      const details = row.booking_details;
      expect(details.ticket_checked_at, row.booking_reference).toBeTruthy();
      expect(details.gds.ticketed).toBe(false);
      expect(details.tickets).toBeUndefined();
      expect(details.ticket_issued_emailed).toBeUndefined();
    }
    expect((await job.findUnticketed()).map((r) => r.booking_reference).sort()).toEqual(['FLT-GONE', 'FLT-STUCK']);
  });

  it('asks about every stuck booking in turn rather than the same ten for ever', async () => {
    for (let n = 1; n <= 25; n += 1) rows.push(booking(`FLT-${n}`, `STK${String(n).padStart(3, '0')}`, day(n)));
    const provider = amadeus();

    for (let tick = 0; tick < 3; tick += 1) await job.runOnce({ provider, sendEmail: vi.fn() });

    const asked = new Set(provider.getFlightOrderDetails.mock.calls.map(([pnr]) => pnr));
    expect(asked.size).toBe(25);
  });
});

describe('cancelled bookings in the window', () => {
  /**
   * A cancellation whose refund failed stays `paid`, keeps its PNR and was
   * never ticketed - the population this job reads, for ever. They were
   * dropped only after the query had spent its window on them.
   */
  it('do not crowd out an open booking', async () => {
    for (let n = 1; n <= 60; n += 1) {
      rows.push(booking(`FLT-CXL-${n}`, `CXL${String(n).padStart(3, '0')}`, `2026-08-01T00:${String(n).padStart(2, '0')}:00.000Z`, { status: 'cancelled' }));
    }
    rows.push(booking('FLT-HAND', 'HANDMD', day(20)));

    const result = await job.runOnce({ provider: amadeus(), sendEmail: vi.fn(async () => ({ success: true })) });

    expect(result.ticketed).toBe(1);
    expect(rows.find((r) => r.booking_reference === 'FLT-HAND').booking_details.tickets).toHaveLength(1);
  });
});
