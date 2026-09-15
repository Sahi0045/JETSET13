import { describe, expect, it } from 'vitest';
import { needsManualRefund, refundStatus } from '../../frontend/src/utils/bookingStatus';

/**
 * Finish refund stays offered while the gateway still holds money the cancel
 * did not keep as its fee.
 *
 * A partial manual refund recorded everything still held as "a cancellation
 * fee was kept", and the button went away with money still owed.
 */
describe('needsManualRefund after a partial refund', () => {
  const cancelled = (cancellation) => ({ type: 'flight', status: 'cancelled', paymentStatus: 'partially_refunded', bookingDetails: { cancellation } });

  it('is still offered while money is held', () => {
    const booking = cancelled({ paymentAction: 'PARTIAL_REFUND', refundAmount: 241, cancellationFee: 0, stillHeld: 50 });
    expect(refundStatus(booking).key).toBe('refunded');
    expect(needsManualRefund(booking)).toBe(true);
  });

  it('is not offered once the rest is the fee the cancel kept', () => {
    expect(needsManualRefund(cancelled({ paymentAction: 'PARTIAL_REFUND', refundAmount: 241, cancellationFee: 50 }))).toBe(false);
  });

  it('is not offered for a booking that is not cancelled, or not a flight', () => {
    expect(needsManualRefund({ ...cancelled({ stillHeld: 50 }), status: 'confirmed' })).toBe(false);
    expect(needsManualRefund({ ...cancelled({ paymentAction: 'PARTIAL_REFUND', refundAmount: 1, stillHeld: 50 }), type: 'hotel' })).toBe(false);
  });
});
