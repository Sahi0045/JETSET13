import { ADMIN_STATUS_LABELS, allowedStatuses } from '../../../shared/bookingStatusChange';
import { refundOutcome } from '../../../shared/cancellationOutcome';

/**
 * Which actions the admin bookings list offers for a booking.
 *
 * The server decides every one of these and refuses what does not fit. This
 * only keeps the panel from offering a button whose answer is already known to
 * be "no" - and from offering one that used to say "yes" and do harm.
 */

const detailsOf = (booking) => booking?.bookingDetails || booking?.booking_details || {};
const typeOf = (booking) => String(booking?.type ?? booking?.travel_type ?? '').toLowerCase();
const isFlight = (booking) => !typeOf(booking) || typeOf(booking) === 'flight';

/**
 * Void reverses a payment before it settles, and does nothing else: it releases
 * no seats. On a flight with an airline reservation that left the reservation
 * live with nothing paying for it, and wrote the booking cancelled and refunded,
 * so neither alarm looked at it again. Such a flight is cancelled with Cancel &
 * Refund, which releases the seats first. A flight being booked or cancelled
 * right now waits (`bookingBusy`, from the server).
 */
export function canVoidPayment(booking) {
  if (!booking || booking.isPackage) return false;
  if (String(booking.status || '').toLowerCase() === 'cancelled') return false;
  if (String(booking.paymentStatus ?? booking.payment_status ?? '').toLowerCase() !== 'paid') return false;
  if (!isFlight(booking)) return true;
  const details = detailsOf(booking);
  if (booking.pnr || details.pnr || details.amadeus_order_id) return false;
  return !booking.bookingBusy;
}

/**
 * The statuses Modify Status offers: the booking's own, then each change that
 * still describes it (shared/bookingStatusChange.js, which the server enforces).
 *
 * @returns {Array<{ value: string, label: string }>}
 */
export function statusOptionsFor(booking) {
  const statuses = allowedStatuses({
    type: typeOf(booking),
    status: booking?.status,
    paymentStatus: booking?.paymentStatus ?? booking?.payment_status,
    details: detailsOf(booking),
    busy: Boolean(booking?.bookingBusy),
  });
  return statuses.map((value) => ({ value, label: ADMIN_STATUS_LABELS[value] || value.replace(/_/g, ' ') }));
}

const usd = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })
  .format(Number(amount) || 0);

/** Why an automatic refund stopped, in the operator's terms. */
const STUCK_CAUSE = {
  REFUND_FAILED: 'ARC Pay refused the refund.',
  VOID_FAILED: 'ARC Pay refused to void the payment.',
  VOID_MISSING_TXN_ID: 'There is no ARC Pay transaction on this booking to void.',
  MANUAL_PROCESS_REQUIRED: 'This payment cannot be refunded automatically.',
};

const FINISH_BY_HAND = 'Refund it by hand with Finish refund (💵) on this booking.';

/**
 * What to tell the admin after Cancel & Refund, from what happened to the money.
 *
 * The bookings list used to build this itself, branching on seven outcome
 * codes. Four of them - FEE_CHARGED, FULL_FEE, VOID_AND_FEE and a bare REFUND -
 * the backend has never sent, and it missed seven that it does. So a refund
 * ARC Pay refused (REFUND_FAILED, refundAmount 0) came up as a green toast,
 * "cancelled successfully", over a result panel with nothing in it: the seats
 * released, the card still charged, and the operator told it worked.
 *
 * It now reads the outcome the way the customer pages, the cancel API and the
 * email already do - shared/cancellationOutcome.js's `refundOutcome` - and says
 * it in the operator's words. Anything that did not settle the money is never
 * `success`, including an outcome it cannot read.
 *
 * @param {object} cancellation - the cancel API's `cancellation` record
 * @param {{ bookingReference?: string, paid?: number }} booking
 * @returns {{ tone: 'success'|'warning'|'error', title: string, summary: string,
 *   detail: string|null, figure: {label: string, amount: number}|null, reason: string|null }}
 */
export function adminCancelOutcome(cancellation = {}, { bookingReference = 'This booking', paid = 0 } = {}) {
  const { paymentAction } = cancellation;
  const refunded = Number(cancellation.refundAmount) || 0;
  const fee = Number(cancellation.cancellationFee) || 0;
  const paidFigure = Number(paid) > 0 ? { label: 'Customer paid', amount: Number(paid) } : null;
  const ref = bookingReference;

  switch (refundOutcome(cancellation)) {
    case 'stuck':
      return {
        tone: 'error',
        title: 'Cancelled, but the refund failed',
        summary: `${ref} is cancelled, but the refund did not go through. Nothing has gone back to the customer's card.`,
        detail: `${STUCK_CAUSE[paymentAction] || 'The automatic refund stopped.'} ${FINISH_BY_HAND}`,
        // The backend does not say what was due when a refund fails, so no
        // refund figure is shown. What the customer paid is known.
        figure: paidFigure,
        reason: null,
      };
    case 'review':
      return {
        tone: 'warning',
        title: 'Cancelled: the refund needs your decision',
        summary: `${ref} is cancelled. No refund was made: this one needs a person to decide what is due.`,
        detail: `Nothing has gone back to the card yet. Decide the amount, then ${FINISH_BY_HAND.charAt(0).toLowerCase()}${FINISH_BY_HAND.slice(1)}`,
        figure: paidFigure,
        reason: cancellation.reviewReason || null,
      };
    case 'nothing_held':
      return {
        tone: 'warning',
        title: 'Cancelled: no payment found',
        summary: `${ref} is cancelled. ARC Pay holds no payment for it, so nothing was refunded.`,
        detail: 'If the customer says they paid, check the order in ARC Pay before you reply.',
        figure: null,
        reason: null,
      };
    case 'fee_covers':
      return {
        tone: 'success',
        title: 'Cancelled: no refund due',
        summary: `${ref} is cancelled. The cancellation fee covers what was paid, so no refund is due.`,
        detail: null,
        figure: fee > 0 ? { label: 'Cancellation fee kept', amount: fee } : null,
        reason: null,
      };
    case 'refunded':
      if (paymentAction === 'VOID') {
        return {
          tone: 'success',
          title: 'Cancelled: payment voided',
          summary: `${ref} is cancelled and the payment voided. The charge is reversed and will not appear on the customer's statement.`,
          detail: null,
          figure: refunded > 0 ? { label: 'Reversed', amount: refunded } : null,
          reason: null,
        };
      }
      if (refunded > 0) {
        const kept = fee > 0 ? `, ${usd(fee)} cancellation fee kept` : '';
        return {
          tone: 'success',
          title: 'Cancelled: refund sent',
          summary: `${ref} is cancelled. ${usd(refunded)} refunded to the customer's card${kept}.`,
          detail: 'It usually reaches the card within 5-10 business days.',
          figure: { label: 'Refunded', amount: refunded },
          reason: null,
        };
      }
      return {
        tone: 'success',
        title: 'Cancelled: payment reversed',
        summary: `${ref} is cancelled and the payment reversed.`,
        detail: null,
        figure: null,
        reason: null,
      };
    default:
      // The shared classifier's own rule: unknown must not promise.
      return {
        tone: 'warning',
        title: 'Cancelled: refund result not reported',
        summary: `${ref} is cancelled, but the refund result was not reported. Check ARC Pay before you tell the customer anything.`,
        detail: null,
        figure: paidFigure,
        reason: null,
      };
  }
}
