/**
 * What happened to the money when a booking was cancelled, and the one sentence
 * that says so.
 *
 * Shared by the cancel API's response, the cancellation email, My Trips and
 * Manage Booking. Each of them used to phrase the outcome itself, so a single
 * cancellation could read four ways at once: the modal promised a fee and 5-7
 * business days, the result banner said "Booking Cancelled Successfully" in
 * green over a refund the gateway had refused, My Trips added "the airline
 * cancellation is still being processed" to a booking that never had a
 * reservation, and the email said 5-10 days. One outcome now has one sentence.
 */

/** A refund or void was attempted and did not go through. */
export const REFUND_STUCK_ACTIONS = Object.freeze(['REFUND_FAILED', 'VOID_FAILED', 'VOID_MISSING_TXN_ID', 'MANUAL_PROCESS_REQUIRED']);

/** Money went back to the card. */
export const REFUND_DONE_ACTIONS = Object.freeze(['PARTIAL_REFUND', 'FULL_REFUND', 'REFUNDED', 'VOID']);

/**
 * No refund was attempted, on purpose: what is due depends on something the
 * system cannot know - a non-refundable fare past its void window, a ticket the
 * airline and the booking disagree about - so a person decides.
 */
export const REFUND_REVIEW_ACTIONS = Object.freeze(['REFUND_UNDER_REVIEW']);

/** The gateway holds no payment for the booking, so there was nothing to return. */
export const NOTHING_HELD_ACTIONS = Object.freeze(['NOTHING_TO_REFUND']);

const SUPPORT_PHONE = '(877) 538-7380';

/**
 * @returns {'stuck'|'review'|'nothing_held'|'fee_covers'|'refunded'|'unknown'}
 */
export function refundOutcome({ paymentAction, refundAmount } = {}) {
  if (REFUND_STUCK_ACTIONS.includes(paymentAction)) return 'stuck';
  if (REFUND_REVIEW_ACTIONS.includes(paymentAction)) return 'review';
  if (NOTHING_HELD_ACTIONS.includes(paymentAction)) return 'nothing_held';
  if (paymentAction === 'NO_REFUND_FEE_COVERS') return 'fee_covers';
  if (REFUND_DONE_ACTIONS.includes(paymentAction)) return 'refunded';
  // Callers that predate paymentAction: only a positive amount is evidence of a
  // refund. Zero with no action is unknown, and unknown must not promise.
  return Number(refundAmount) > 0 ? 'refunded' : 'unknown';
}

const money = (amount, currency) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
  } catch {
    return `${currency || ''} ${Number(amount).toFixed(2)}`.trim();
  }
};

/**
 * What to tell the customer after a cancellation, from what happened to the money.
 *
 * @param {{ cancellation?: object, booking?: object }} result - the cancel API's
 *   response, or anything carrying its `cancellation` record
 */
export function cancellationMessage(result) {
  const cancellation = result?.cancellation || {};
  const amount = Number(cancellation.refundAmount);
  const fee = Number(cancellation.cancellationFee);
  const currency = cancellation.currency || result?.booking?.currency || 'USD';

  switch (refundOutcome(cancellation)) {
    case 'stuck':
      return 'Your booking is cancelled, but the automatic refund did not go through. Nothing has been returned to your card yet. '
        + `Our team has been alerted and will refund you; call ${SUPPORT_PHONE} if you have not heard from us within 2 business days.`;
    case 'review':
      // Says nothing about whether money has moved: a review also covers a
      // refund whose answer never came back.
      return 'Your booking is cancelled. Our team needs to review the refund for this booking and will email you within 2 business days '
        + `to confirm what is returned to your card. Call ${SUPPORT_PHONE} if you have not heard from us by then.`;
    case 'nothing_held':
      return 'Your booking is cancelled. No payment is being held for this booking, so there is nothing to refund.';
    case 'fee_covers':
      return 'Your booking is cancelled. The cancellation fee covers the amount paid, so no refund is due.';
    case 'refunded':
      if (amount > 0) {
        const kept = fee > 0 ? ` (a ${money(fee, currency)} cancellation fee was kept)` : '';
        return `Your booking is cancelled. A refund of ${money(amount, currency)} is on its way to your original payment method${kept}. `
          + 'It usually reaches your card within 5-10 business days.';
      }
      return 'Your booking is cancelled and your payment has been reversed.';
    default:
      return 'Your booking is cancelled. We will email you the refund details.';
  }
}
