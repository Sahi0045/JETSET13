import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { getApiUrl } from '../../utils/apiHelper';
import { authHeaders } from '../../utils/authHeaders';

/**
 * Open one booking. `email` lets a guest open their own. Exported for the
 * tests; pages use useFlightBooking.
 */
export async function fetchFlightBooking(bookingId, email) {
  // The email travels in a header, not the query string, so it never lands in
  // access logs.
  const res = await fetch(getApiUrl(`flights/bookings/${encodeURIComponent(bookingId)}`), {
    credentials: 'include',
    headers: await authHeaders(email ? { 'x-booking-email': email } : {}),
  });
  if (res.status === 404) {
    throw new Error(email
      ? 'No booking matches that reference and email.'
      : 'We could not find this booking in your account.');
  }
  // Too many wrong emails for this booking from this connection. The server's
  // message says how long to wait; this used to read "Failed to fetch booking
  // (429)" and was retried twice, which could not succeed.
  if (res.status === 429) {
    const body = await res.json().catch(() => null);
    throw Object.assign(
      new Error(body?.error || 'Too many attempts for this booking. Please wait 15 minutes and try again.'),
      { status: 429 }
    );
  }
  if (!res.ok) throw new Error(`Failed to fetch booking (${res.status})`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Booking not found');
  return data.data || data.booking || data;
}

/** A not-found answer, or a rate limit, will not change by asking again. */
export const shouldRetryBookingLookup = (count, err) =>
  err?.status !== 429 && !/^(No booking matches|We could not find)/.test(err?.message || '') && count < 2;

export function useFlightBooking(bookingId, options = {}) {
  const { email, ...queryOptions } = options;
  return useQuery({
    queryKey: ['flights', 'booking', bookingId, email || null],
    queryFn: () => fetchFlightBooking(bookingId, email),
    retry: shouldRetryBookingLookup,
    ...queryOptions,
    enabled: (queryOptions.enabled ?? true) && !!bookingId,
  });
}
