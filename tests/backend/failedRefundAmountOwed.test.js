import { describe, expect, it } from 'vitest';
import { buildMessage, describeFailure } from '../../backend/jobs/paymentFailureAlert.job.js';
import { attentionOf, refundOwedOf } from '../../shared/reviewQueue.js';

/**
 * What staff are told to refund when a cancel's refund ARC Pay refused.
 *
 * A same-day cancel of a ticketed booking decides "refund less the
 * cancellation fee": 291 held, a 50 fee, 241 back. ARC Pay refuses the REFUND,
 * and the cancel records REFUND_FAILED with cancellationFee 50 and
 * refundAmount 0 (returnFlightPayment).
 *
 * The failed-refund alarm said "291 USD taken, 0 returned ... These need
 * refunding by hand" and nothing of the fee, so the one figure staff had was
 * the whole payment - and refunding it gave the fee back too.
 */

const refused = (cancellation = {}, over = {}) => ({
  booking_reference: 'FLTFEE7',
  status: 'cancelled',
  payment_status: 'paid',
  total_amount: 291,
  created_at: '2026-09-20T10:00:00Z',
  ...over,
  booking_details: {
    pnr: 'ABC123',
    arc_captured_amount: 291,
    cancellation: {
      cancelledAt: '2026-09-20T12:00:00Z', paymentAction: 'REFUND_FAILED', refundAmount: 0, cancellationFee: 50,
      netRefund: 0, currency: 'USD', ticketsVoided: true, basis: 'tickets voided the day they were issued',
      ...cancellation,
    },
  },
});

describe('the failed-refund alarm', () => {
  it('names what is owed and the fee the cancel kept, not only the whole payment', () => {
    const text = buildMessage([refused()]);

    expect(describeFailure(refused())).toMatch(/291 USD taken, 0 returned/);
    expect(text).toMatch(/These need refunding by hand/);
    expect(text).toMatch(/241\.00 USD owed \(291\.00 paid less the 50\.00 cancellation fee the cancel kept\)/);
    // The section's total: what was taken, and what is owed.
    expect(text).toMatch(/291\.00 USD taken, 241\.00 USD owed/);
  });

  it('names the whole payment as owed when the cancel kept no fee', () => {
    const text = buildMessage([refused({ cancellationFee: 0 })]);

    expect(text).toMatch(/291\.00 USD owed/);
    expect(text).not.toMatch(/cancellation fee/);
  });

  it('reads the checkout amount when the row never recorded what ARC held', () => {
    const older = refused();
    delete older.booking_details.arc_captured_amount;
    expect(refundOwedOf(older)).toEqual({ owed: 241, paid: 291, fee: 50, currency: 'USD' });
  });

  it('names no amount for a refund held for a person to decide', () => {
    const held = refused({ paymentAction: 'REFUND_UNDER_REVIEW', cancellationFee: 0 });
    expect(refundOwedOf(held)).toBeNull();
    expect(buildMessage([held])).not.toMatch(/USD owed/);
  });
});

describe('the desk', () => {
  it('names the same amount on the booking it lists', () => {
    expect(attentionOf(refused()).reason).toMatch(/241\.00 USD owed \(291\.00 paid less the 50\.00 cancellation fee/);
  });
});
