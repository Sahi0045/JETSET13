import { useQuery } from '@tanstack/react-query';
import { endpoints } from '../../config/api-src';

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
    queryKey: ['featureFlags', 'guestFlightBooking'],
    queryFn: async () => {
      const res = await fetch(endpoints.featureFlags.guestFlightBooking, { credentials: 'include' });
      if (!res.ok) throw new Error(`Guest booking switch unavailable (${res.status})`);
      const body = await res.json();
      return body?.data?.enabled === true;
    },
    // A visitor waits on this before the page appears: ask fresh, fail fast.
    staleTime: 0,
    retry: 1,
    ...options,
  });
}
