import { ticketState } from './eTicket';

/**
 * What a booking's state means to the customer, in one place.
 *
 * My Trips derived its badge from `status` alone and fell back to "Confirmed"
 * for anything it did not recognise, so a held reservation with no ticket, a
 * row flagged for review, and a status nobody had mapped all read as a
 * confirmed trip. Its "Failed" tab matched a status nothing ever writes, and
 * a cancellation whose refund was refused was reported as "cancelled
 * successfully". Everything here reads what the booking record actually says.
 */

/** Cancellation outcomes where the money did not go back. Mirrors the backend. */
export const REFUND_STUCK_ACTIONS = ['REFUND_FAILED', 'VOID_FAILED', 'VOID_MISSING_TXN_ID', 'MANUAL_PROCESS_REQUIRED'];
export const REFUND_DONE_ACTIONS = ['PARTIAL_REFUND', 'FULL_REFUND', 'REFUNDED', 'VOID'];

const cancellationOf = (booking) =>
  booking?.cancellation || booking?.booking_details?.cancellation || booking?.bookingDetails?.cancellation || null;

const reviewOf = (booking) =>
  booking?.needs_review || booking?.booking_details?.needs_review || booking?.bookingDetails?.needs_review || null;

/** Does someone need to act on this booking? */
export function needsAttention(booking) {
  const status = String(booking?.status || '').toUpperCase();
  if (status === 'FAILED') return true;
  if (REFUND_STUCK_ACTIONS.includes(cancellationOf(booking)?.paymentAction)) return true;
  return Boolean(reviewOf(booking)) && status !== 'CANCELLED' && ticketState(booking) !== 'issued';
}

/**
 * The badge for a booking card.
 * @returns {{label: string, tone: 'success'|'warning'|'danger'|'neutral'}}
 */
export function bookingStatusBadge(booking) {
  const status = String(booking?.status || '').toLowerCase();
  const isFlight = String(booking?.type || booking?.travel_type || '').toLowerCase() === 'flight';

  if (status === 'cancelled') return { label: 'Cancelled', tone: 'danger' };
  if (needsAttention(booking)) return { label: 'Needs attention', tone: 'warning' };

  if (isFlight) {
    const tickets = ticketState(booking);
    if (tickets === 'issued') return { label: 'Ticketed', tone: 'success' };
    if (tickets === 'pending') return { label: 'Ticket issued', tone: 'success' };
    // A PNR without a ticket is a reservation on a deadline, not a finished
    // trip. Older rows carry 'confirmed' or 'paid' for exactly this state.
    if (booking?.pnr || ['pending_ticketing', 'confirmed', 'paid'].includes(status)) {
      return { label: 'Ticket pending', tone: 'warning' };
    }
    if (status === 'pending') return { label: 'Awaiting payment', tone: 'neutral' };
  } else {
    if (status === 'confirmed') return { label: 'Confirmed', tone: 'success' };
    if (status === 'paid') return { label: 'Paid', tone: 'success' };
    if (status === 'pending') return { label: 'Pending', tone: 'neutral' };
  }

  // Never "Confirmed" for a state nobody mapped.
  return {
    label: status ? status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Status unavailable',
    tone: 'neutral',
  };
}

const money = (amount, currency) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
  } catch {
    return `${currency || ''} ${Number(amount).toFixed(2)}`.trim();
  }
};

/** What to tell the customer after a cancellation, from what happened to the money. */
export function cancellationMessage(result) {
  const cancellation = result?.cancellation || {};
  const action = cancellation.paymentAction;
  const amount = Number(cancellation.refundAmount);
  const currency = cancellation.currency || result?.booking?.currency || 'USD';

  if (REFUND_STUCK_ACTIONS.includes(action)) {
    return 'Your booking is cancelled, but the automatic refund did not go through. Nothing has been returned to your card yet. '
      + 'Our team has been alerted and will refund you; call (877) 538-7380 if you have not heard from us within 2 business days.';
  }
  if (action === 'NO_REFUND_FEE_COVERS') {
    return 'Your booking is cancelled. The cancellation fee covers the fare, so no refund is due.';
  }
  if (REFUND_DONE_ACTIONS.includes(action) && amount > 0) {
    return `Your booking is cancelled. A refund of ${money(amount, currency)} is on its way to your original payment method.`;
  }
  return 'Your booking is cancelled. We will email you the refund details.';
}
