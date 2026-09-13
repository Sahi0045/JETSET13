/**
 * Who may act on a booking: the account that owns it, or - for a booking made
 * without an account - whoever holds an email it was made with.
 *
 * Shared by opening a booking (flight.routes.js `loadOwnedBooking`) and
 * cancelling one (payment/operations.handlers.js). The two had drifted: the
 * cancel looked for the email in a `customer_email` column the bookings table
 * does not have, so it refused every customer.
 *
 * The owner is `user_id`, or `booking_details.original_user_id`, which opening a
 * booking already accepted.
 */

const normalize = (email) => String(email ?? '').trim().toLowerCase();

/** True when the booking belongs to an account. */
export function hasBookingOwner(booking) {
  return Boolean(booking?.user_id || booking?.booking_details?.original_user_id);
}

/** True when `userId` - a verified session id, never a request field - owns the booking. */
export function isBookingOwner(userId, booking) {
  if (!userId || !booking) return false;
  return booking.user_id === userId || booking.booking_details?.original_user_id === userId;
}

/** Every address the booking was made with: checkout's, the contact's, each traveller's. */
export function bookingEmails(booking) {
  const details = booking?.booking_details || {};
  const travellers = Array.isArray(booking?.passenger_details) ? booking.passenger_details : [];
  return [details.customer_email, details.contact?.email, ...travellers.map((p) => p?.email)]
    .map(normalize)
    .filter(Boolean);
}

/** True when `email` is one the booking was made with, in any letter case. */
export function emailMatchesBooking(email, booking) {
  const presented = normalize(email);
  return Boolean(presented) && bookingEmails(booking).includes(presented);
}
