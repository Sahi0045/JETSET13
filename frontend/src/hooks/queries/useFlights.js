import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { getApiUrl } from '../../utils/apiHelper';
import { authHeaders } from '../../utils/authHeaders';

export function useFlightBooking(bookingId, options = {}) {
  // `email` lets a guest open their own booking. It travels in a header, not
  // the query string, so it never lands in access logs.
  const { email, ...queryOptions } = options;
  return useQuery({
    queryKey: ['flights', 'booking', bookingId, email || null],
    queryFn: async () => {
      const res = await fetch(getApiUrl(`flights/bookings/${encodeURIComponent(bookingId)}`), {
        credentials: 'include',
        headers: await authHeaders(email ? { 'x-booking-email': email } : {}),
      });
      if (res.status === 404) {
        throw new Error(email
          ? 'No booking matches that reference and email.'
          : 'We could not find this booking in your account.');
      }
      if (!res.ok) throw new Error(`Failed to fetch booking (${res.status})`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Booking not found');
      return data.data || data.booking || data;
    },
    // A not-found answer will not change by asking again.
    retry: (count, err) => !/^(No booking matches|We could not find)/.test(err?.message || '') && count < 2,
    ...queryOptions,
    enabled: (queryOptions.enabled ?? true) && !!bookingId,
  });
}
