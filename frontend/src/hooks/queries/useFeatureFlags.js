import { useQuery } from '@tanstack/react-query';
import { guestFlightBookingQuery } from './flightReviewQueries';

/**
 * Whether a flight can be booked without an account: the admin panel's switch
 * (Feature Flags > Guest flight booking).
 *
 * This only decides what the review page shows a signed-out visitor. Checkout
 * asks the server's own copy of the switch on every guest checkout, so an
 * answer that has gone stale here ends in checkout's LOGIN_REQUIRED, never in
 * a guest booking an admin switched off.
 *
 * Resolves `true` only for a stored "on". A failed read rejects, and the page
 * treats anything but a successful `true` as off.
 */
export function useGuestFlightBooking(options = {}) {
  return useQuery({
    // A visitor waits on this before the page appears: ask fresh, fail fast.
    ...guestFlightBookingQuery(),
    ...options,
  });
}
