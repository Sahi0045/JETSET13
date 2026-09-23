import { describe, expect, it, vi } from 'vitest';

vi.mock('../../backend/config/supabase.js', () => ({ default: { from: vi.fn() } }));

/**
 * The needs-review alarm and an airline claim the desk already handled.
 *
 * ARC Pay refused the customer refund on a cancel that also left tickets to
 * claim from the airline. The desk claims the tickets and marks the claim
 * handled before the alarm's next run. The refused refund keeps the booking
 * on Needs attention (attentionOf answers refund_failed), so the alarm's
 * "anything the desk shows" check let it through, and needsAirlineRefundClaim
 * reads the flag on top with no look at resolved_at: Slack sent staff to
 * claim tickets already claimed, and the alarm stamped the resolved flag.
 *
 * The refused refund itself is the failed-refund alarm's to announce
 * (paymentFailureAlert.job.js), and it still is.
 */

const row = ({ resolved = false, paymentAction = 'REFUND_FAILED', refundAmount = 0, ticketed = true } = {}) => ({
  booking_reference: 'FLTSLK1',
  status: 'cancelled',
  payment_status: paymentAction === 'REFUND_FAILED' ? 'paid' : 'partially_refunded',
  total_amount: 291,
  created_at: '2026-09-22T09:00:00Z',
  booking_details: {
    pnr: 'ABC123',
    arc_captured_amount: 291,
    ...(ticketed ? { gds: { ticketed: true }, tickets: [{ number: '108-2412345671' }] } : {}),
    cancellation: { cancelledAt: '2026-09-22T10:00:00Z', paymentAction, refundAmount, cancellationFee: 50, currency: 'USD', amadeusCancelled: true },
    needs_review: {
      reason: 'tickets could not be voided; airline refund must be claimed', source: 'cancellation', at: '2026-09-22T10:00:00Z', tickets: ['108-2412345671'],
      ...(resolved ? { resolved_at: '2026-09-22T10:05:00Z', resolved_by: 'desk@jetsetterss.com', resolution: 'Claimed from the airline.' } : {}),
    },
  },
});

const CLAIMS_HEADING = /refund to claim from the airline/;

describe('an airline claim marked handled, over a customer refund ARC Pay refused', () => {
  it('is not announced as a claim to make', async () => {
    const { selectUnannounced } = await import('../../backend/jobs/needsReviewAlert.job.js');
    expect(selectUnannounced([row({ resolved: true })]), 'a claim already marked handled was announced').toHaveLength(0);
    // Whatever the ticket record says.
    expect(selectUnannounced([row({ resolved: true, ticketed: false })])).toHaveLength(0);
  });

  it('is not listed under the claims heading, whatever hands it to the message', async () => {
    const { buildMessage } = await import('../../backend/jobs/needsReviewAlert.job.js');
    const text = buildMessage([row({ resolved: true })]);
    expect(text).not.toMatch(CLAIMS_HEADING);
    // Nor under any other heading: "ticket it, or refund it" of a cancelled booking.
    expect(text).not.toMatch(/FLTSLK1/);
  });

  it('its refused refund is still the failed-refund alarm\'s to announce', async () => {
    const { selectUnrefunded } = await import('../../backend/jobs/paymentFailureAlert.job.js');
    expect(selectUnrefunded([row({ resolved: true })])).toHaveLength(1);
  });
});

describe('beside it', () => {
  it('the same claim still open is announced under the claims heading, refund refused or not', async () => {
    const { buildMessage, selectUnannounced } = await import('../../backend/jobs/needsReviewAlert.job.js');
    for (const open of [row(), row({ paymentAction: 'PARTIAL_REFUND', refundAmount: 241 })]) {
      expect(selectUnannounced([open])).toHaveLength(1);
      expect(buildMessage([open])).toMatch(CLAIMS_HEADING);
      expect(buildMessage([open])).toMatch(/FLTSLK1/);
    }
  });

  it('a claim marked handled over a refund that went back stays quiet, as before', async () => {
    const { selectUnannounced } = await import('../../backend/jobs/needsReviewAlert.job.js');
    expect(selectUnannounced([row({ resolved: true, paymentAction: 'PARTIAL_REFUND', refundAmount: 241 })])).toHaveLength(0);
  });

  it('a claim already announced is not announced again', async () => {
    const { selectUnannounced } = await import('../../backend/jobs/needsReviewAlert.job.js');
    const announced = row();
    announced.booking_details.needs_review.alerted_at = '2026-09-22T10:15:00Z';
    expect(selectUnannounced([announced])).toHaveLength(0);
  });
});
