import { describe, expect, it } from 'vitest';
import { buildMessage, selectUnannounced } from '../../backend/jobs/needsReviewAlert.job.js';
import { attentionOf } from '../../shared/reviewQueue.js';

/**
 * A flag the desk resolved before the alarm ran was still announced.
 *
 * The desk shows a flag the moment it is written; the alarm runs every fifteen
 * minutes, and not at all while its job is down. A person who dealt with a
 * booking in between - and pressed "Mark as handled" - was then sent "Cancel
 * the PNR with the airline first..." or "Claim each refund..." about work
 * already done. selectUnannounced read `resolved_at` only for the
 * numbers-missing flag: airline claims, failed cancels, unrecorded
 * cancellations and ordinary flags were announced resolved or not. Slack now
 * announces nothing the desk would not show as needing attention.
 */

const at = new Date().toISOString();
const resolved = { resolved_at: at, resolved_by: 'desk@example.com', resolution: 'dealt with by phone' };

const booking = (reference, details, over = {}) => ({
  booking_reference: reference,
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 300,
  created_at: at,
  booking_details: details,
  ...over,
});

const cancelFailed = (extra = {}) => booking('FLTCF1', {
  pnr: 'P1', gds: { ticketed: true }, tickets: [{ number: '220-1234567891' }],
  needs_review: { reason: 'the airline did not cancel', source: 'cancellation', cancelFailed: true, at, ...extra },
});
const airlineClaim = (extra = {}) => booking('FLTAR1', {
  pnr: 'P2', needs_review: { reason: 'airline refund must be claimed', source: 'cancellation', tickets: ['2201234567892'], at, ...extra },
}, { status: 'cancelled', payment_status: 'refunded' });
const unticketed = (extra = {}) => booking('FLTNT1', {
  pnr: 'P3', gds: { ticketed: false }, needs_review: { reason: 'chain failed after commit at issueTicket', ticketed: false, at, ...extra },
}, { status: 'pending_ticketing' });
const unrecorded = (extra = {}) => booking('FLTUR1', {
  pnr: 'P4', gds: { ticketed: true }, tickets: [{ number: '220-1234567894' }],
  needs_review: {
    reason: 'cancellation carried out but not recorded', source: 'cancellation', unrecorded: true,
    paymentAction: 'REFUNDED', refundAmount: 300, ticketsVoided: true, at, ...extra,
  },
});
const numbersMissing = (extra = {}) => booking('FLTNM1', {
  pnr: 'P5', gds: { ticketed: true }, tickets: [], needs_review: { reason: 'ticket_numbers_not_retrieved', at, ...extra },
});

describe('a flag the desk resolved before the alarm ran', () => {
  it('is not announced, whatever kind it is', () => {
    const rows = [cancelFailed(resolved), airlineClaim(resolved), unticketed(resolved), unrecorded(resolved)];
    expect(rows.map(attentionOf)).toEqual([null, null, null, null]);
    expect(selectUnannounced(rows)).toEqual([]);
  });

  it('nor is one resolved on top of an earlier flag it settled', () => {
    // A later refused cancel over the unrecorded one, and the desk handled it.
    const buried = booking('FLTUR2', {
      ...unrecorded().booking_details,
      needs_review: { reason: 'the airline did not cancel', source: 'cancellation', cancelFailed: true, at, ...resolved, previous: unrecorded().booking_details.needs_review },
    });
    expect(attentionOf(buried)).toBeNull();
    expect(selectUnannounced([buried])).toEqual([]);
  });
});

describe('the same flags, not resolved: announced and shown as before', () => {
  it('a failed cancel', () => {
    expect(attentionOf(cancelFailed())?.kind).toBe('cancel_failed');
    expect(selectUnannounced([cancelFailed()])).toHaveLength(1);
    expect(buildMessage([cancelFailed()])).toMatch(/Cancel the PNR with the airline first/);
  });

  it('an airline refund claim', () => {
    expect(attentionOf(airlineClaim())?.kind).toBe('airline_refund');
    expect(selectUnannounced([airlineClaim()])).toHaveLength(1);
    expect(buildMessage([airlineClaim()])).toMatch(/Claim each refund under the fare rules/);
  });

  it('an unticketed held booking, and an unflagged paid PNR with no ticket', () => {
    const unflagged = booking('FLTUF1', { pnr: 'P6', gds: { ticketed: false } });
    expect(attentionOf(unticketed())?.kind).toBe('review');
    expect(attentionOf(unflagged)?.kind).toBe('not_ticketed');
    expect(selectUnannounced([unticketed(), unflagged])).toHaveLength(2);
  });

  it('an unrecorded cancellation', () => {
    expect(attentionOf(unrecorded())?.kind).toBe('unrecorded_cancellation');
    expect(selectUnannounced([unrecorded()])).toHaveLength(1);
  });

  it('numbers missing, and quiet once resolved, as it already was', () => {
    expect(selectUnannounced([numbersMissing()])).toHaveLength(1);
    expect(selectUnannounced([numbersMissing({ resolved_at: at, resolved_by: 'ticket sync' })])).toHaveLength(0);
  });

  it('a flag already announced is not announced again', () => {
    expect(selectUnannounced([cancelFailed({ alerted_at: at }), airlineClaim({ alerted_at: at })])).toEqual([]);
  });

  it('a cancelled or refunded booking with an ordinary flag stays quiet', () => {
    expect(selectUnannounced([
      { ...unticketed(), status: 'cancelled' },
      { ...unticketed(), payment_status: 'refunded' },
    ])).toEqual([]);
  });
});
