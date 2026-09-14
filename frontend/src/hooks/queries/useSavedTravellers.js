import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { endpoints } from '../../config/api-src';
import { authHeaders } from '../../utils/authHeaders';

/**
 * The signed-in customer's saved travellers, and themselves from their profile
 * (backend/controllers/savedTravellers.controller.js).
 *
 * Nothing here can stop a booking: a failed read is "nothing saved", and the
 * review page works exactly as it did without the list.
 */

const KEY = ['users', 'me', 'travellers'];

// The cookie session requires the double-submit CSRF token on a write.
const csrfHeader = () => {
  try {
    const match = document.cookie.match(/(?:^|;\s*)jt_csrf=([^;]+)/);
    return match ? { 'X-CSRF-Token': decodeURIComponent(match[1]) } : {};
  } catch {
    return {};
  }
};

export function useSavedTravellers({ enabled = true } = {}) {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const res = await fetch(endpoints.user.travellers, { credentials: 'include', headers: await authHeaders() });
      if (!res.ok) throw new Error(`Saved travellers unavailable (${res.status})`);
      const body = await res.json();
      return {
        self: body?.data?.self ?? null,
        travellers: body?.data?.travellers ?? [],
        available: body?.data?.available !== false,
      };
    },
    enabled,
    staleTime: 60_000,
    retry: 1,
  });
}

/** Save the travellers from a booking, for next time. */
export function useSaveTravellers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (travellers) => {
      const res = await fetch(endpoints.user.travellers, {
        method: 'POST',
        credentials: 'include',
        headers: await authHeaders({ 'Content-Type': 'application/json', ...csrfHeader() }),
        body: JSON.stringify({ travellers }),
        // The review page leaves for the payment page moments later; keepalive
        // lets this request finish instead of being cancelled with the page.
        keepalive: true,
      });
      if (!res.ok) throw new Error(`Travellers not saved (${res.status})`);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
