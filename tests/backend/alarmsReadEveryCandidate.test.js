import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { runOnce as paymentFailureRun } from '../../backend/jobs/paymentFailureAlert.job.js';
import { runOnce as needsReviewRun } from '../../backend/jobs/needsReviewAlert.job.js';
import { CANDIDATE_PAGE_SIZE, CANDIDATE_MAX_PAGES } from '../../backend/jobs/alarmCandidates.js';
import { supabaseMock } from './setup.js';

/**
 * Both alarms read "the 200 oldest rows not yet stamped", and stamp only the
 * rows they announce. A row the query returns and the selector turns down - a
 * cancellation whose refund worked, a cancelled PNR that was never ticketed, a
 * flag the desk resolved - is never stamped, so it stays at the front of that
 * window for good. Once 200 of them existed, a new row that should page was
 * never read, on that run or any later one.
 *
 * fakeBookingsTable applies the operators the jobs use (`not`, `is`, the
 * needs-review `or`, `order`, `range`, `limit`), so the window is real here.
 */

const iso = (minutesAgo) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

const refunded = (i) => ({
  booking_reference: `FLTOK${i}`,
  status: 'cancelled',
  payment_status: 'refunded',
  total_amount: 100,
  created_at: iso(100_000 - i),
  booking_details: { cancellation: { paymentAction: 'FULL_REFUND', refundAmount: 100 } },
});

const refundFailed = (reference = 'FLTOWED') => ({
  booking_reference: reference,
  status: 'cancelled',
  payment_status: 'partially_refunded',
  total_amount: 450,
  created_at: iso(5),
  booking_details: { cancellation: { paymentAction: 'REFUND_FAILED', refundAmount: 0 } },
});

const cancelledUnticketed = (i) => ({
  booking_reference: `FLTCX${i}`,
  status: 'cancelled',
  payment_status: 'refunded',
  total_amount: 100,
  created_at: iso(100_000 - i),
  booking_details: { pnr: `PNR${i}`, gds: { ticketed: false } },
});

const paidUnticketed = (reference = 'FLTSTUCK') => ({
  booking_reference: reference,
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 700,
  created_at: iso(5),
  booking_details: { pnr: 'ABC123', gds: { ticketed: false } },
});

const times = (count, make) => Array.from({ length: count }, (_, i) => make(i));

let table = null;
const useTable = (rows) => {
  table = fakeBookingsTable(rows);
  supabaseMock.from.mockImplementation(table.from);
  return table;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' }));
});

describe('the failed-refund alarm reads every unannounced cancellation', () => {
  it('sees a new failed refund behind 250 older refunds that worked', async () => {
    useTable([...times(250, refunded), refundFailed()]);
    const result = await paymentFailureRun({ dryRun: true });
    expect(result.wouldAnnounce).toEqual(['FLTOWED']);
  });

  it('with fewer than a page of rows reads once and announces what it did before', async () => {
    useTable([...times(150, refunded), refundFailed()]);
    const result = await paymentFailureRun({ dryRun: true });
    expect(result.wouldAnnounce).toEqual(['FLTOWED']);
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
  });

  it('announces once, then stays quiet', async () => {
    useTable([...times(250, refunded), refundFailed()]);
    expect((await paymentFailureRun({ webhookUrl: 'https://hooks.slack.test/x' })).announced).toBe(1);
    expect(table.row('FLTOWED').booking_details.cancellation.alerted_at).toBeTruthy();
    expect((await paymentFailureRun({ webhookUrl: 'https://hooks.slack.test/x' })).announced).toBe(0);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('does a bounded amount of work however many rows there are, and says so', async () => {
    const log = vi.spyOn(console, 'log');
    const bound = CANDIDATE_PAGE_SIZE * CANDIDATE_MAX_PAGES;
    useTable([...times(bound + 10, refunded), refundFailed()]);
    await paymentFailureRun({ dryRun: true });
    expect(supabaseMock.from).toHaveBeenCalledTimes(CANDIDATE_MAX_PAGES);
    expect(log.mock.calls.some(([line]) => /more than \d+ candidate rows/.test(String(line)))).toBe(true);
    log.mockRestore();
  });
});

describe('the paid-but-not-ticketed alarm reads every unannounced candidate', () => {
  it('sees a new paid, unticketed PNR behind 250 older cancelled ones', async () => {
    useTable([...times(250, cancelledUnticketed), paidUnticketed()]);
    const result = await needsReviewRun({ dryRun: true });
    expect(result.wouldAnnounce).toEqual(['FLTSTUCK']);
  });

  it('with fewer than a page of rows reads once and announces what it did before', async () => {
    useTable([...times(150, cancelledUnticketed), paidUnticketed()]);
    const result = await needsReviewRun({ dryRun: true });
    expect(result.wouldAnnounce).toEqual(['FLTSTUCK']);
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
  });

  it('announces once, then stays quiet', async () => {
    useTable([...times(250, cancelledUnticketed), paidUnticketed()]);
    expect((await needsReviewRun({ webhookUrl: 'https://hooks.slack.test/x' })).announced).toBe(1);
    expect(table.row('FLTSTUCK').booking_details.needs_review.alerted_at).toBeTruthy();
    expect((await needsReviewRun({ webhookUrl: 'https://hooks.slack.test/x' })).announced).toBe(0);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
