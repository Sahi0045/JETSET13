/**
 * Which status an admin may give a booking by hand, and why not.
 *
 * The admin panel's "Modify Status" wrote whatever it was sent. Marking a paid
 * flight with a PNR `cancelled` released no seats and refunded nothing - and it
 * also hid Cancel & Refund and Void, made the orchestrated cancel refuse the
 * booking as "already cancelled", and silenced both alarms, which skip
 * cancelled rows. Marking a reservation with no ticket `confirmed` told the
 * customer a trip was ticketed when it was not.
 *
 * A status set by hand must still describe the booking. Cancelling anything
 * that holds seats or money goes through Cancel & Refund, which releases both.
 *
 * Shared by the server (PUT /api/flights/admin-bookings/:id), which enforces
 * it, and the admin panel, which offers only what it allows.
 */

export const ADMIN_STATUSES = Object.freeze(['pending', 'pending_ticketing', 'confirmed', 'completed', 'cancelled']);

export const ADMIN_STATUS_LABELS = Object.freeze({
  pending: 'Pending',
  pending_ticketing: 'Ticket pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
});

/** Payment states in which the gateway still holds some of the customer's money. */
const HELD_PAYMENT_STATUSES = ['paid', 'partial', 'partially_refunded', 'authorized', 'completed'];

const refusal = (httpStatus, code, message) => ({ httpStatus, code, message });

/**
 * Why a booking may not be given `nextStatus` by hand, or null when it may.
 *
 * @param {{ type?: string, status?: string, paymentStatus?: string, details?: object, busy?: boolean }} booking
 *   `details` is the row's booking_details; `busy` is true while a booking chain,
 *   the queue or a cancellation holds it.
 * @param {string} nextStatus
 * @returns {null | { httpStatus: number, code: string, message: string }}
 */
export function statusChangeRefusal(booking, nextStatus) {
  const current = String(booking?.status || '').toLowerCase();
  const next = String(nextStatus || '').toLowerCase();
  if (!ADMIN_STATUSES.includes(next)) {
    return refusal(400, 'INVALID_STATUS', `"${nextStatus}" is not a status a booking can be given by hand.`);
  }
  if (next === current) return null;

  const details = booking?.details || {};
  const type = String(booking?.type || '').toLowerCase();
  // A row with no travel type predates the column and is a flight.
  const isFlight = !type || type === 'flight';
  const reservation = isFlight ? (details.pnr || details.amadeus_order_id || null) : null;
  const ticketed = details.gds?.ticketed === true || (Array.isArray(details.tickets) && details.tickets.length > 0);
  const moneyHeld = HELD_PAYMENT_STATUSES.includes(String(booking?.paymentStatus || '').toLowerCase());

  if (current === 'cancelled') {
    return refusal(409, 'BOOKING_CANCELLED',
      'This booking is cancelled: its seats and its payment have already been dealt with, so it cannot be reopened by changing its status.');
  }
  if (booking?.busy) {
    return refusal(409, 'BOOKING_BUSY',
      'This booking is being confirmed with the airline or cancelled right now. Nothing has been changed; refresh it in a few minutes.');
  }

  if (next === 'cancelled') {
    if (reservation) {
      return refusal(409, 'USE_CANCEL_AND_REFUND',
        `This flight has an airline reservation (${reservation}). Marking it cancelled would release no seats and refund nothing. Use Cancel & Refund.`);
    }
    if (moneyHeld) {
      return refusal(409, 'USE_CANCEL_AND_REFUND',
        'This booking holds a payment. Marking it cancelled would refund nothing. Use Cancel & Refund, which returns what is owed.');
    }
    return null;
  }

  if (!isFlight) {
    return next === 'pending_ticketing' ? refusal(400, 'INVALID_STATUS', 'Only a flight can be waiting for a ticket.') : null;
  }
  if ((next === 'confirmed' || next === 'completed') && !ticketed) {
    return refusal(409, 'NOT_TICKETED',
      'No ticket has been issued for this flight, so it cannot be marked confirmed or completed. Issue the ticket first.');
  }
  if (next === 'pending' && reservation) {
    return refusal(409, 'HAS_RESERVATION',
      `This flight has an airline reservation (${reservation}), so it is not merely pending: it is waiting for its ticket, or ticketed.`);
  }
  if (next === 'pending_ticketing' && !reservation) {
    return refusal(409, 'NO_RESERVATION', 'This flight has no airline reservation, so it cannot be waiting for a ticket.');
  }
  if (next === 'pending_ticketing' && ticketed) {
    return refusal(409, 'ALREADY_TICKETED', 'A ticket has been issued for this flight, so it is not waiting for one.');
  }
  return null;
}

/** The statuses a booking can be given by hand: its own first, then each allowed change. */
export function allowedStatuses(booking) {
  const current = String(booking?.status || '').toLowerCase();
  const changes = ADMIN_STATUSES.filter((status) => status !== current && !statusChangeRefusal(booking, status));
  return current ? [current, ...changes] : changes;
}
