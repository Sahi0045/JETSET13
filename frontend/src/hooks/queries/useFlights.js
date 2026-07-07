import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { getApiUrl } from '../../utils/apiHelper';

export function useFlightBooking(bookingId, options = {}) {
  return useQuery({
    queryKey: ['flights', 'booking', bookingId],
    queryFn: async () => {
      const res = await fetch(getApiUrl(`flights/bookings/${encodeURIComponent(bookingId)}`), {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Failed to fetch booking (${res.status})`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Booking not found');
      return data.data || data.booking || data;
    },
    enabled: (options.enabled ?? true) && !!bookingId,
    ...options,
  });
}
