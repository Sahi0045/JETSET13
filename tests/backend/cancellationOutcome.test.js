import { describe, expect, it } from 'vitest';
import { cancellationMessage, refundOutcome } from '../../shared/cancellationOutcome.js';
import { generateAdminCancellationTemplate, generateCancellationTemplate } from '../../backend/services/email/templates.js';

/**
 * One cancellation, one account of it.
 *
 * The cancel API said "Booking cancelled successfully" for every outcome, the
 * Manage Booking modal promised a fee and 5-7 business days, its result banner
 * was green over a refused refund, My Trips appended "the airline cancellation
 * is still being processed" to bookings that never had a reservation, and the
 * email said 5-10 days. The API, the pages and the email now read the outcome
 * from shared/cancellationOutcome.js.
 */

describe('refundOutcome', () => {
  it('names every action the cancel path writes', () => {
    expect(refundOutcome({ paymentAction: 'REFUND_FAILED' })).toBe('stuck');
    expect(refundOutcome({ paymentAction: 'VOID_MISSING_TXN_ID' })).toBe('stuck');
    expect(refundOutcome({ paymentAction: 'REFUND_UNDER_REVIEW' })).toBe('review');
    expect(refundOutcome({ paymentAction: 'NOTHING_TO_REFUND' })).toBe('nothing_held');
    expect(refundOutcome({ paymentAction: 'NO_REFUND_FEE_COVERS' })).toBe('fee_covers');
    expect(refundOutcome({ paymentAction: 'VOID', refundAmount: 291 })).toBe('refunded');
    expect(refundOutcome({ paymentAction: 'FULL_REFUND', refundAmount: 291 })).toBe('refunded');
    expect(refundOutcome({})).toBe('unknown');
  });
});

describe('cancellationMessage', () => {
  it('never promises money for an outcome that did not return any', () => {
    for (const paymentAction of ['REFUND_FAILED', 'REFUND_UNDER_REVIEW', 'NOTHING_TO_REFUND', 'NO_REFUND_FEE_COVERS']) {
      const text = cancellationMessage({ cancellation: { paymentAction, refundAmount: 0 } });
      expect(text, paymentAction).not.toMatch(/on its way|successfully|5-10 business days/);
    }
  });

  it('says what came back and what was kept', () => {
    const text = cancellationMessage({ cancellation: { paymentAction: 'PARTIAL_REFUND', refundAmount: 241, cancellationFee: 50, currency: 'USD' } });
    expect(text).toMatch(/\$241\.00/);
    expect(text).toMatch(/\$50\.00 cancellation fee was kept/);
    expect(text).toMatch(/5-10 business days/);
  });

  it('mentions no fee when none was kept', () => {
    expect(cancellationMessage({ cancellation: { paymentAction: 'VOID', refundAmount: 291, cancellationFee: 0 } })).not.toMatch(/fee/);
  });

  // A review also covers a refund whose answer never came back, so it must not
  // say either way whether money moved.
  it('makes no claim about the card when a person is reviewing the refund', () => {
    const text = cancellationMessage({ cancellation: { paymentAction: 'REFUND_UNDER_REVIEW' } });
    expect(text).toMatch(/review the refund/);
    expect(text).toMatch(/2 business days/);
    expect(text).not.toMatch(/Nothing has been returned/);
  });
});

describe('the cancellation email', () => {
  it('tells the customer a refund under review is being reviewed, with no amount or date', () => {
    const html = generateCancellationTemplate({ bookingReference: 'X', refundAmount: 0, cancellationFee: 0, paymentAction: 'REFUND_UNDER_REVIEW' });
    expect(html).toMatch(/Being reviewed by our team/);
    expect(html).not.toContain('5-10 business days');
    expect(html).not.toContain('$0.00');
  });

  it('says there is nothing to refund when nothing was held', () => {
    const html = generateCancellationTemplate({ bookingReference: 'X', refundAmount: 0, paymentAction: 'NOTHING_TO_REFUND' });
    expect(html).toMatch(/Nothing to refund/);
    expect(html).not.toContain('5-10 business days');
  });

  it('flags a refund under review to the desk as action required', () => {
    const html = generateAdminCancellationTemplate({ bookingReference: 'X', customerName: 'Jane', refundAmount: 0, paymentAction: 'REFUND_UNDER_REVIEW' });
    expect(html).toMatch(/action required/i);
  });
});
