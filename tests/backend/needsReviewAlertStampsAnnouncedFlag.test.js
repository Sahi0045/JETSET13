import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { runOnce, UNTICKETED_REVIEW_REASON } from '../../backend/jobs/needsReviewAlert.job.js';
import { attentionLabel, attentionOf } from '../../shared/reviewQueue.js';
import { supabaseMock } from './setup.js';

/**
 * The needs-review alarm stamps the flag it announced, and no other.
 *
 * markAlerted reads the booking again before it stamps, and pinned its write
 * to that fresh read only (unchangedSince(fresh)). So a flag written between
 * the alarm's candidate read and that fresh read - while the Slack message was
 * being posted, say - was stamped `alerted_at` as though it had been
 * announced. A customer's cancel the airline refused in that window was never
 * announced: Slack had said "paid but not ticketed ... ticket it, or refund
 * it" of a PNR the customer had since asked to cancel, and the "cancellation
 * the airline did not carry out - Do NOT refund until it is cancelled"
 * message never went out.
 *
 * A flag that is not the one announced is left unstamped, so the next run
 * announces it.
 */

const REF = 'FLTRACE1';
const iso = (minutesAgo) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

const paidUnticketed = (details = {}) => ({
  booking_reference: REF,
  status: 'pending_ticketing',
  payment_status: 'paid',
  total_amount: 700,
  created_at: iso(30),
  booking_details: { pnr: 'ABC123', gds: { ticketed: false }, ...details },
});

// What the cancel handler writes when PNR_Cancel is refused
// (payment/operations.handlers.js, source 'cancellation', cancelFailed).
const refusedCancel = () => ({
  reason: 'GDS cancellation failed; refund withheld to avoid paying out against a live booking',
  source: 'cancellation',
  cancelFailed: true,
  pnr: 'ABC123',
  detail: 'PNR_Cancel refused',
  at: new Date().toISOString(),
});

let table;
const posted = [];

/** Slack, with `during` run against the booking while each message is being posted. */
const slackWhile = (during) => vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
  posted.push(JSON.parse(options.body).text);
  during?.(table.row(REF), posted.length);
  return { ok: true, status: 200, text: async () => 'ok' };
}));

const run = () => runOnce({ webhookUrl: 'https://hooks.slack.test/x' });

beforeEach(() => {
  vi.clearAllMocks();
  posted.length = 0;
});

describe('a cancel refused while the alarm is posting', () => {
  it('is still announced as a cancellation the airline did not carry out', async () => {
    table = fakeBookingsTable([paidUnticketed()]);
    supabaseMock.from.mockImplementation(table.from);
    slackWhile((row, count) => {
      if (count === 1) row.booking_details = { ...row.booking_details, needs_review: refusedCancel() };
    });

    const first = await run();
    expect(first.announced).toBe(1);
    expect(posted[0]).toMatch(/paid but not ticketed/);

    const row = table.row(REF);
    // The desk shows the failed cancel, and it is not marked announced.
    expect(attentionLabel(attentionOf(row))).toBe('Cancel failed at the airline');
    expect(row.booking_details.needs_review.alerted_at).toBeUndefined();

    // The next tick announces it, and stamps it.
    const second = await run();
    expect(second.announced).toBe(1);
    expect(posted[1]).toMatch(/the airline did not carry out/);
    expect(table.row(REF).booking_details.needs_review).toMatchObject({ cancelFailed: true, alerted_at: expect.any(String) });

    // Then it is quiet.
    expect((await run()).announced).toBe(0);
    expect(posted).toHaveLength(2);
  });

  it('written over the flag being announced, it is announced too', async () => {
    const held = { reason: 'chain failed after commit at issueTicket', ticketed: false, at: iso(20) };
    table = fakeBookingsTable([paidUnticketed({ needs_review: held })]);
    supabaseMock.from.mockImplementation(table.from);
    slackWhile((row, count) => {
      if (count === 1) row.booking_details = { ...row.booking_details, needs_review: { ...refusedCancel(), previous: held } };
    });

    expect((await run()).announced).toBe(1);
    expect(table.row(REF).booking_details.needs_review.alerted_at).toBeUndefined();
    expect((await run()).announced).toBe(1);
    expect(posted[1]).toMatch(/the airline did not carry out/);
  });
});

// Fences: what the stamp did before, it still does.
describe('the stamp, when the announced flag is still on top', () => {
  it('a flag nothing touched is stamped, and not announced again', async () => {
    const held = { reason: 'chain failed after commit at issueTicket', ticketed: false, at: iso(20) };
    table = fakeBookingsTable([paidUnticketed({ needs_review: held })]);
    supabaseMock.from.mockImplementation(table.from);
    slackWhile();

    expect((await run()).announced).toBe(1);
    expect(table.row(REF).booking_details.needs_review).toMatchObject({ ...held, alerted_at: expect.any(String) });
    expect((await run()).announced).toBe(0);
    expect(posted).toHaveLength(1);
  });

  it('an unflagged booking is stamped with the flag it was announced for', async () => {
    table = fakeBookingsTable([paidUnticketed()]);
    supabaseMock.from.mockImplementation(table.from);
    slackWhile();

    expect((await run()).announced).toBe(1);
    expect(table.row(REF).booking_details.needs_review).toMatchObject({
      reason: UNTICKETED_REVIEW_REASON, ticketed: false, alerted_at: expect.any(String),
    });
    expect((await run()).announced).toBe(0);
  });

  it('a write that leaves the announced flag on top does not stop the stamp', async () => {
    const held = { reason: 'chain failed after commit at issueTicket', ticketed: false, at: iso(20) };
    table = fakeBookingsTable([paidUnticketed({ needs_review: held })]);
    supabaseMock.from.mockImplementation(table.from);
    // A payment reconcile lands during the post: the flag is the same one.
    slackWhile((row) => { row.booking_details = { ...row.booking_details, arc_captured_amount: 700 }; });

    expect((await run()).announced).toBe(1);
    expect(table.row(REF).booking_details).toMatchObject({ arc_captured_amount: 700, needs_review: { ...held, alerted_at: expect.any(String) } });
    expect((await run()).announced).toBe(0);
  });
});
