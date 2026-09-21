import { describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { runOnce } from '../../backend/jobs/abandonedCheckout.job.js';
import { supabaseMock } from './setup.js';

/**
 * The abandoned-checkout job has to be able to see a checkout past the newest hundred.
 *
 * It read `status = 'pending'` checkouts from the last seven days, newest
 * first, capped at 100. Every hosted checkout writes a pending row and nothing
 * ever clears an unpaid one, so the job's real lookback was "the last hundred
 * checkouts", not seven days. What it had already settled lives in memory and
 * narrows nothing in the query. A paid checkout that fell behind a hundred
 * newer ones - its reconcile answered "gateway unavailable" for a while, say -
 * was never examined again, never booked and never flagged: exactly the paid,
 * unbooked row this job exists for. The sibling jobs' own comments record the
 * same window starvation being fixed for them.
 */

const NOW = Date.parse('2026-09-21T12:00:00Z');
const MIN = 60_000;
const HOUR = 60 * MIN;

const checkout = (reference, createdAt, over = {}) => ({
  id: `id-${reference}`,
  booking_reference: reference,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'unpaid',
  total_amount: 109.21,
  created_at: new Date(createdAt).toISOString(),
  booking_details: {
    order_id: reference,
    success_indicator: `SI-${reference}`,
    pending_booking_data: {
      orderId: reference,
      returnUrl: `https://www.jetsetterss.com/payment/callback?orderId=${reference}&bookingType=flight`,
    },
  },
  ...over,
});

/**
 * `count` pending checkouts, newest first a minute apart from an hour ago,
 * every one of them already settled by this process - except `paidAt`, a
 * checkout nobody has asked about, placed that far down the list.
 */
const backlog = (count, paidAt) => {
  const rows = [];
  const checked = new Map();
  for (let i = 0; i < count; i += 1) {
    const reference = i === paidAt ? 'FLTPAIDLATE' : `FLTABANDON${i}`;
    rows.push(checkout(reference, NOW - HOUR - i * MIN));
    if (i !== paidAt) checked.set(reference, { at: NOW - 5 * MIN, final: true });
  }
  return { rows, checked };
};

const load = (rows) => {
  const table = fakeBookingsTable(rows);
  supabaseMock.from.mockImplementation(table.from);
  return table;
};

const run = (checked, scan, reconcile, flag) => runOnce({
  now: NOW, site: 'site', checked, scan, reconcile, flag, send: vi.fn(async () => 'confirmed'),
});

describe('a paid checkout behind a hundred newer ones', () => {
  it('is still found and settled', async () => {
    const { rows, checked } = backlog(130, 120);
    load(rows);
    const reconcile = vi.fn(async (row) => ({ paid: row.booking_reference === 'FLTPAIDLATE' }));
    const flag = vi.fn(async () => 'flagged');

    const settled = await run(checked, undefined, reconcile, flag);

    expect(reconcile.mock.calls.map(([row]) => row.booking_reference)).toEqual(['FLTPAIDLATE']);
    expect(settled.map((s) => s.bookingReference)).toEqual(['FLTPAIDLATE']);
  });

  it('is reached however far back it is, a page further each run', async () => {
    const { rows, checked } = backlog(260, 245);
    load(rows);
    const reconcile = vi.fn(async (row) => ({ paid: row.booking_reference === 'FLTPAIDLATE' }));
    const scan = { offset: 100 };

    const seen = [];
    for (let tick = 0; tick < 3; tick += 1) {
      const settled = await run(checked, scan, reconcile, vi.fn(async () => 'flagged'));
      seen.push(...settled.map((s) => s.bookingReference));
    }

    expect(seen).toContain('FLTPAIDLATE');
  });

  it('starts again behind the newest page once it has been all the way back', async () => {
    const { rows, checked } = backlog(150, -1);
    load(rows);
    const scan = { offset: 100 };

    await run(checked, scan, vi.fn(async () => ({ paid: false })), vi.fn());

    expect(scan.offset).toBe(100);
  });
});
