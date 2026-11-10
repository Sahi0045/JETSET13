import { queryKeys } from '../../lib/queryKeys';
import PricingService from '../../Services/PricingService';
import { endpoints } from '../../config/api-src';
import { getApiUrl } from '../../utils/apiHelper';
import { CONFIG_READ_TIMEOUT_MS } from '../../utils/fetchTimeout';

/**
 * The three small reads the flight review page needs before it can quote a
 * charge: the admin price settings, the guest booking switch and today's free
 * cancellation deadline.
 *
 * They are defined once here so the review page's hooks and the prefetch that
 * runs while the customer is still choosing a fare share one cache entry. A
 * prefetch under a different key would be a request nobody reads.
 */

export const priceConfigQuery = (service = 'all') => ({
  queryKey: queryKeys.pricing.config(service),
  queryFn: () => PricingService.getPriceConfig(service),
  staleTime: 1000 * 60 * 10,
  retry: 2,
});

export async function fetchGuestFlightBooking() {
  const res = await fetch(endpoints.featureFlags.guestFlightBooking, { credentials: 'include', timeoutMs: CONFIG_READ_TIMEOUT_MS });
  if (!res.ok) throw new Error(`Guest booking switch unavailable (${res.status})`);
  const body = await res.json();
  return body?.data?.enabled === true;
}

export const guestFlightBookingQuery = () => ({
  queryKey: ['featureFlags', 'guestFlightBooking'],
  queryFn: fetchGuestFlightBooking,
  staleTime: 0,
  retry: 1,
});

export async function fetchCancelPolicy() {
  const res = await fetch(getApiUrl('flights/cancel-policy'), { credentials: 'include', timeoutMs: CONFIG_READ_TIMEOUT_MS });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) throw new Error(data?.error || `Cancel policy failed (${res.status})`);
  return { freeUntil: data.freeUntil ?? null, timeZone: data.timeZone ?? null };
}

export const cancelPolicyQuery = () => ({
  queryKey: ['flights', 'cancel-policy'],
  queryFn: fetchCancelPolicy,
  staleTime: 60 * 1000,
  retry: 1,
});

/**
 * Start the review page's reads while the customer is still on the fare
 * choice, so they have landed by the time the airline's fare check (about ten
 * seconds) hands over to the review page. Failures are left to the page's own
 * hooks, which retry and say so.
 */
export function prefetchFlightReview(queryClient) {
  queryClient.prefetchQuery(priceConfigQuery('all'));
  queryClient.prefetchQuery(cancelPolicyQuery());
  queryClient.prefetchQuery(guestFlightBookingQuery());
}
