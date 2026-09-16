import { describe, expect, it } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * The double has to fail the way the real thing fails.
 *
 * 21 test files across the money paths run against this helper, and an audit on
 * 16 Sep found it answered questions PostgREST would refuse: `insert`, `upsert`
 * and `delete` were no-ops, `order` and `limit` were ignored, `.not()` was
 * ignored, and an `.or()` carrying an `and(...)` group matched every row. Each
 * of those let a real defect ship green - most sharply, the checkout's booking
 * row upsert could be deleted outright and twelve tests stayed green while
 * every paying customer became invisible.
 *
 * So the helper's own fidelity is pinned here. A double nobody checks is just a
 * more confident way to be wrong.
 */

const rows = () => ([
  { booking_reference: 'A', created_at: '2026-09-01T00:00:00Z', status: 'pending', booking_details: { needs_review: { reason: 'x' } } },
  { booking_reference: 'B', created_at: '2026-09-02T00:00:00Z', status: 'pending', booking_details: { gds: { ticketed: false }, pnr: 'ABC123' } },
  { booking_reference: 'C', created_at: '2026-09-03T00:00:00Z', status: 'confirmed', booking_details: { gds: { ticketed: true }, pnr: 'XYZ999' } },
]);

const refs = (data) => (data || []).map((row) => row.booking_reference).join(',');

describe('.or() with an and(...) group', () => {
  /**
   * The live paid-but-not-ticketed alarm's filter, verbatim. Split on its inner
   * comma, the last fragment ended `null)` - which is not the string `null` -
   * so `is` never matched, `not` inverted it, and the whole `or` answered TRUE
   * for every row. The alarm's own test could not have failed.
   */
  const ALARM = 'booking_details->needs_review.not.is.null,'
    + 'and(booking_details->gds->>ticketed.eq.false,booking_details->>pnr.not.is.null)';

  it('matches only the rows the alarm is about', async () => {
    const db = fakeBookingsTable(rows());

    const { data } = await db.from('bookings').select('*').or(ALARM);

    expect(refs(data)).toBe('A,B');
  });

  it('does not quietly match everything', async () => {
    const db = fakeBookingsTable(rows());

    const { data } = await db.from('bookings').select('*').or(ALARM);

    expect(data).not.toHaveLength(3);
  });
});

describe('.not() as a method', () => {
  it('excludes the rows it names', async () => {
    const db = fakeBookingsTable(rows());

    const { data } = await db.from('bookings').select('*').not('booking_details->>pnr', 'is', null);

    expect(refs(data)).toBe('B,C');
  });
});

describe('order and limit', () => {
  it('answers with the newest when asked for the newest', async () => {
    const db = fakeBookingsTable(rows());

    const { data } = await db.from('bookings').select('*')
      .order('created_at', { ascending: false }).limit(1);

    expect(refs(data)).toBe('C');
  });

  // The queue worker takes the oldest first, so a paid customer is not starved.
  it('answers with the oldest when asked for the oldest', async () => {
    const db = fakeBookingsTable(rows());

    const { data } = await db.from('bookings').select('*')
      .order('created_at', { ascending: true }).limit(1);

    expect(refs(data)).toBe('A');
  });

  it('caps at the limit', async () => {
    const db = fakeBookingsTable(rows());

    const { data } = await db.from('bookings').select('*').limit(2);

    expect(data).toHaveLength(2);
  });
});

describe('writes that write', () => {
  it('inserts a row that can then be read back', async () => {
    const db = fakeBookingsTable(rows());

    await db.from('bookings').insert({ booking_reference: 'NEW', status: 'pending' });

    expect(db.row('NEW')).toMatchObject({ booking_reference: 'NEW', status: 'pending' });
  });

  it('refuses to insert over an existing reference, as the unique index does', async () => {
    const db = fakeBookingsTable(rows());

    const { error } = await db.from('bookings').insert({ booking_reference: 'A' });

    expect(error?.code).toBe('23505');
  });

  it('upserts over an existing reference instead', async () => {
    const db = fakeBookingsTable(rows());

    await db.from('bookings').upsert({ booking_reference: 'A', status: 'paid' });

    expect(db.row('A').status).toBe('paid');
    expect(db.table).toHaveLength(3);
  });

  it('deletes what it matched', async () => {
    const db = fakeBookingsTable(rows());

    await db.from('bookings').delete().eq('booking_reference', 'B');

    expect(db.row('B')).toBeUndefined();
    expect(db.table).toHaveLength(2);
  });

  /**
   * The one that matters most: the checkout's booking row. Without it the
   * customer pays and no route or job can ever find them, and the helper used
   * to report the write as fine while writing nothing.
   */
  it('records that a write happened, so a route that stops writing is visible', async () => {
    const db = fakeBookingsTable([]);

    await db.from('bookings').upsert({ booking_reference: 'FLT1', status: 'pending' });

    expect(db.writes).toHaveLength(1);
    expect(db.row('FLT1')).toBeDefined();
  });
});

describe('.single()', () => {
  it('errors on more than one row, as PostgREST does', async () => {
    const db = fakeBookingsTable(rows());

    const { data, error } = await db.from('bookings').select('*').single();

    expect(data).toBeNull();
    expect(error?.code).toBe('PGRST116');
  });

  it('still answers with the one row when there is one', async () => {
    const db = fakeBookingsTable(rows());

    const { data } = await db.from('bookings').select('*').eq('booking_reference', 'B').single();

    expect(data.booking_reference).toBe('B');
  });

  it('still reports no rows as PGRST116', async () => {
    const db = fakeBookingsTable(rows());

    const { error } = await db.from('bookings').select('*').eq('booking_reference', 'NOPE').single();

    expect(error?.code).toBe('PGRST116');
  });
});

describe('an update that matches nothing', () => {
  // Every compare-and-set in the codebase reads `!data?.length` to know it lost.
  it('reports no rows matched, which is how a lost CAS is detected', async () => {
    const db = fakeBookingsTable(rows());

    const { data } = await db.from('bookings').update({ status: 'x' })
      .eq('booking_reference', 'NOPE').select();

    expect(data).toEqual([]);
    expect(db.writes[0].matched).toBe(0);
  });
});
