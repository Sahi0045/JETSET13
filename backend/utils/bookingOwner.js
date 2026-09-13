/**
 * Who owns a booking.
 *
 * A booking row with no `user_id` is invisible in My Trips forever: that page
 * asks for the signed-in user's bookings, and nothing else links a row to an
 * account. 11 of 14 bookings taken in the week to 2026-09-12 ended up that way,
 * including confirmed, ticketed ones.
 *
 * The reason is that ownership was only ever taken from the request body. The
 * checkout call never sent it, and `POST /flights/order` (which has no auth
 * middleware) believed whatever the client put there - so if the browser did
 * not include `userId`, the customer's own ticket vanished from their account.
 *
 * The session is the only trustworthy source: `optionalProtect` verifies the
 * cookie or bearer token and leaves the user on the request.
 *
 * The body used to be a fallback when there was no session. It is
 * client-supplied, so a guest request carrying someone else's user id filed the
 * booking - its passenger data, and the right to cancel and refund it - under
 * that other account. It is gone. Nothing legitimate needs it: hosted checkout
 * (same origin, cookie present) owns the row at creation, and the order route's
 * save now keeps that owner instead of overwriting it, so a queue replay with no
 * session still lands in the customer's My Trips.
 */

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * @param {object} req - Express request, ideally past `optionalProtect`.
 * @returns {string|null} the owning user id, or null when there is no session.
 */
export function resolveBookingUserId(req) {
  const sessionId = req?.user?.id;
  if (sessionId && UUID.test(String(sessionId))) return String(sessionId);
  return null;
}
