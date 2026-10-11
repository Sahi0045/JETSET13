import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { getApiUrl } from '../../utils/apiHelper';
import { authHeaders } from '../../utils/authHeaders';
import { bookedFeeRulesStaleTime } from '../../utils/bookedFeeRules';

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
  return useQuery({
    queryKey: ['flights', 'booking', bookingId, 'cancel-quote', email || null],
    queryFn: () => fetchCancelQuote(bookingId, email),
    staleTime: 0,
    retry: false,
    ...queryOptions,
    enabled: (queryOptions.enabled ?? true) && !!bookingId,
  });
}

export function useBookedFeeRules(bookingId, options = {}) {
  const { email, ...queryOptions } = options;
  return useQuery({
    queryKey: ['flights', 'booking', bookingId, 'fee-rules', email || null],
    queryFn: () => fetchBookedFeeRules(bookingId, email),
    staleTime: bookedFeeRulesStaleTime,
    retry: false,
    ...queryOptions,
    enabled: (queryOptions.enabled ?? true) && !!bookingId,
  });
}
