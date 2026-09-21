import { describe, expect, it } from 'vitest';
import { flagInForce, unrecordedCancellationOf } from '../../shared/reviewQueue.js';

/**
 * One walker for every state a later review flag can bury.
 *
 * A later cancel writes its own flag on top and keeps the one before only as
 * `previous`. Each round of the flight audit found another reader that looked
 * at the top flag alone and forgot the state under it. The walker answers for
 * all of them, and stops at a flag a person resolved.
 */

const SEATLESS = 'chain failed after commit at segmentStatus';
const isSeatless = (review) => review.reason === SEATLESS;

const seatless = { reason: SEATLESS, at: '2026-09-20T10:00:00Z' };
const cancelFailed = (previous) => ({
  reason: 'GDS cancellation failed; refund withheld to avoid paying out against a live booking',
  source: 'cancellation',
  cancelFailed: true,
  at: '2026-09-21T10:00:00Z',
  ...(previous ? { previous } : {}),
});
const row = (needsReview) => ({ status: 'pending_ticketing', booking_details: { pnr: 'SEAT42', needs_review: needsReview } });

describe('flagInForce', () => {
  it('finds the flag on top', () => {
    expect(flagInForce(row(seatless), isSeatless)).toBe(seatless);
  });

  it('finds the flag under a later one, however many deep', () => {
    expect(flagInForce(row(cancelFailed(seatless)), isSeatless)).toBe(seatless);
    expect(flagInForce(row(cancelFailed(cancelFailed(seatless))), isSeatless)).toBe(seatless);
  });

  it('stops at a flag a person resolved: that settles everything under it', () => {
    expect(flagInForce(row({ ...seatless, resolved_at: '2026-09-22T09:00:00Z' }), isSeatless)).toBeNull();
    expect(flagInForce(row({ ...cancelFailed(seatless), resolved_at: '2026-09-22T09:00:00Z' }), isSeatless)).toBeNull();
  });

  it('walks past a resolved flag only when asked to, for a fact about the airline record', () => {
    const resolved = { ...cancelFailed(seatless), resolved_at: '2026-09-22T09:00:00Z' };
    expect(flagInForce(row(resolved), isSeatless, { pastResolved: true })).toBe(seatless);
  });

  it('reads every shape a booking arrives in: a row, a spread row, camelCase', () => {
    const chain = cancelFailed(seatless);
    expect(flagInForce({ needs_review: chain }, isSeatless)).toBe(seatless);
    expect(flagInForce({ bookingDetails: { needs_review: chain } }, isSeatless)).toBe(seatless);
  });

  it('answers null when nothing matches, when there is no flag, and on a chain that loops', () => {
    expect(flagInForce(row(cancelFailed(null)), isSeatless)).toBeNull();
    expect(flagInForce(row(null), isSeatless)).toBeNull();
    expect(flagInForce(null, isSeatless)).toBeNull();
    const loop = { reason: 'a' };
    loop.previous = loop;
    expect(flagInForce(row(loop), isSeatless)).toBeNull();
  });

  it('is the walker the unrecorded-cancellation rule uses', () => {
    const unrecorded = { reason: 'cancellation carried out but not recorded', source: 'cancellation', unrecorded: true };
    expect(unrecordedCancellationOf(row(cancelFailed(unrecorded)))).toBe(unrecorded);
    expect(unrecordedCancellationOf(row({ ...cancelFailed(unrecorded), resolved_at: '2026-09-22T09:00:00Z' }))).toBeNull();
  });
});
