import { describe, expect, it } from 'vitest';
import { adminCancelOutcome } from '../../frontend/src/utils/adminBookingActions';
import { cancellationMessage } from '../../shared/cancellationOutcome';

/**
 * The admin who pressed Cancel & Refund, when the refund was sent and never answered.
 *
 * The cancel closes two things as REFUND_UNDER_REVIEW: a refund it held because
 * it could not tell what is owed, and a VOID or REFUND it sent to ARC Pay that
 * threw mid-request or found the order already reversed - where the money may
 * already be back. The cancel's answer now says which (reversalOutcomeUnknown).
 * The admin toast told both "No refund was made ... Nothing has gone back to
 * the card yet. Decide the amount, then refund it by hand" - for the second, an
 * instruction that could pay the customer twice. It now says to check ARC Pay
 * first. What the customer is told does not change: it already says nothing
 * about whether money has moved.
 */

const REF = 'FLT123456';
const outcome = (cancellation) => adminCancelOutcome(cancellation, { bookingReference: REF, paid: 450 });

const unknown = { paymentAction: 'REFUND_UNDER_REVIEW', refundAmount: 0, cancellationFee: 0, reversalOutcomeUnknown: true };
const held = { paymentAction: 'REFUND_UNDER_REVIEW', refundAmount: 0, cancellationFee: 0 };

describe('a refund sent to ARC Pay with no answer back', () => {
  it('does not say nothing was refunded', () => {
    const result = outcome(unknown);
    expect(result.summary).not.toMatch(/No refund was made/);
    expect(result.detail).not.toMatch(/Nothing has gone back to the card/);
    expect(result.detail).not.toMatch(/Decide the amount/);
  });

  it('says the refund may or may not have gone through, and to check ARC Pay first', () => {
    const result = outcome(unknown);
    expect(result.tone).toBe('warning');
    expect(result.title).toMatch(/unknown/i);
    expect(result.summary).toMatch(/may or may not have gone through/);
    expect(result.detail).toMatch(/Check ARC Pay before anything else/);
    expect(result.detail).toMatch(/Finish refund/);
    expect(result.detail).toMatch(/Sync from ARC/);
    expect(result.figure).toEqual({ label: 'Customer paid', amount: 450 });
  });
});

describe('what does not change', () => {
  it('a refund held on purpose keeps its wording', () => {
    expect(outcome(held)).toEqual({
      tone: 'warning',
      title: 'Cancelled: the refund needs your decision',
      summary: `${REF} is cancelled. No refund was made: this one needs a person to decide what is due.`,
      detail: 'Nothing has gone back to the card yet. Decide the amount, then refund it by hand with Finish refund (💵) on this booking.',
      figure: { label: 'Customer paid', amount: 450 },
      reason: null,
    });
  });

  it('the customer is told the same thing for both', () => {
    expect(cancellationMessage({ cancellation: unknown })).toBe(cancellationMessage({ cancellation: held }));
  });

  it('the mark means nothing on an outcome that is not under review', () => {
    expect(outcome({ ...unknown, paymentAction: 'REFUND_FAILED' })).toEqual(outcome({ paymentAction: 'REFUND_FAILED', refundAmount: 0, cancellationFee: 0 }));
  });
});
