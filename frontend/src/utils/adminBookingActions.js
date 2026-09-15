import { ADMIN_STATUS_LABELS, allowedStatuses } from '../../../shared/bookingStatusChange';

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
