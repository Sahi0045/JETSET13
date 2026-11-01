import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { getApiUrl } from '../../utils/apiHelper';
import { authHeaders } from '../../utils/authHeaders';
import { bookedFeeRulesStaleTime } from '../../utils/bookedFeeRules';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';

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

/**
 * Who is asking, once that is known. The sign-in comes back from the server
 * after every page load (the Supabase client keeps no session). A booking asked
 * for before then went out anonymous, the server answered 404 "not in your
 * account", and a 404 is not retried: a signed-in customer opening their
 * booking link saw "We couldn't open this booking" until they reloaded. So the
 * booking queries wait for it, and are keyed by it, so they ask again as
 * whoever turns out to be signed in.
 */
function useAsker() {
  const { user, loading } = useSupabaseAuth();
  return { ready: !loading, who: user?.id || null };
}

export function useFlightBooking(bookingId, options = {}) {
  const { email, ...queryOptions } = options;
  const asker = useAsker();
  return useQuery({
    queryKey: ['flights', 'booking', bookingId, email || null, asker.who],
    queryFn: () => fetchFlightBooking(bookingId, email),
    retry: shouldRetryBookingLookup,
    ...queryOptions,
    enabled: (queryOptions.enabled ?? true) && !!bookingId && asker.ready,
  });
}

export async function fetchBookedFeeRules(bookingId, email) {
  const res = await fetch(getApiUrl(`flights/bookings/${encodeURIComponent(bookingId)}/fee-rules`), {
    credentials: 'include',
    headers: await authHeaders(email ? { 'x-booking-email': email } : {}),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.success ? data.penalties ?? null : null;
}

export async function fetchCancelPolicy() {
  const res = await fetch(getApiUrl('flights/cancel-policy'), { credentials: 'include' });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) throw new Error(data?.error || `Cancel policy failed (${res.status})`);
  return { freeUntil: data.freeUntil ?? null, timeZone: data.timeZone ?? null };
}

export function useCancelPolicy() {
  return useQuery({
    queryKey: ['flights', 'cancel-policy'],
    queryFn: fetchCancelPolicy,
    staleTime: 60 * 1000,
    retry: false,
  });
}

export async function fetchCancelQuote(bookingId, email) {
  const res = await fetch(getApiUrl(`flights/bookings/${encodeURIComponent(bookingId)}/cancel-quote`), {
    credentials: 'include',
    headers: await authHeaders(email ? { 'x-booking-email': email } : {}),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) throw new Error(data?.error || `Cancel quote failed (${res.status})`);
  return data.quote ?? null;
}

export function useCancelQuote(bookingId, options = {}) {
  const { email, ...queryOptions } = options;
  const asker = useAsker();
  return useQuery({
    queryKey: ['flights', 'booking', bookingId, 'cancel-quote', email || null, asker.who],
    queryFn: () => fetchCancelQuote(bookingId, email),
    staleTime: 0,
    retry: false,
    ...queryOptions,
    enabled: (queryOptions.enabled ?? true) && !!bookingId && asker.ready,
  });
}

export function useBookedFeeRules(bookingId, options = {}) {
  const { email, ...queryOptions } = options;
  const asker = useAsker();
  return useQuery({
    queryKey: ['flights', 'booking', bookingId, 'fee-rules', email || null, asker.who],
    queryFn: () => fetchBookedFeeRules(bookingId, email),
    staleTime: bookedFeeRulesStaleTime,
    retry: false,
    ...queryOptions,
    enabled: (queryOptions.enabled ?? true) && !!bookingId && asker.ready,
  });
}
