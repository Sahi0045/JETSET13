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
 * The session is the trustworthy source: `optionalProtect` verifies the cookie
 * or bearer token and leaves the user on the request. The body is kept only as
 * a fallback for clients that send it without a session, and only when it looks
 * like a UUID - it is client-supplied, so it must never reach a database filter
 * unchecked.
 */

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * @param {object} req - Express request, ideally past `optionalProtect`.
 * @returns {string|null} the owning user id, or null for a genuine guest.
 */
export function resolveBookingUserId(req) {
  const sessionId = req?.user?.id;
  if (sessionId && UUID.test(String(sessionId))) return String(sessionId);

  const claimed = req?.body?.userId;
  if (claimed && UUID.test(String(claimed))) return String(claimed);

  return null;
}
