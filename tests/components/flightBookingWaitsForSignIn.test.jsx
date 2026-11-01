import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The sign-in comes back from the server after every page load (the Supabase
 * client keeps no session: persistSession is false). Manage Booking asked for
 * the booking before it had: the request went out anonymous, the server
 * answered 404 "not in your account", and a 404 is not retried - so a signed-in
 * customer opening their booking link saw "We couldn't open this booking"
 * until they reloaded (seen on jetsetterss.com, 27 Oct).
 */

let auth = { loading: true, user: null };
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => auth }));
vi.mock('../../frontend/src/utils/authHeaders', () => ({
  authHeaders: async (extra = {}) => (auth.user ? { Authorization: 'Bearer signed-in', ...extra } : { ...extra }),
}));

const { useFlightBooking } = await import('../../frontend/src/hooks/queries/useFlights.js');

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

const serveOwnBookingOnly = () => {
  const fetchMock = vi.fn(async (url, init) => (init?.headers?.Authorization
    ? reply(200, { success: true, data: { bookingReference: 'FLT1' } })
    : reply(404, { success: false, error: 'Booking not found' })));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const wrapper = ({ children }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

afterEach(() => {
  vi.unstubAllGlobals();
  auth = { loading: true, user: null };
});

describe('opening a booking from its link', () => {
  it('waits for the sign-in to come back before asking for the booking', async () => {
    const fetchMock = serveOwnBookingOnly();
    auth = { loading: true, user: null };
    const { result, rerender } = renderHook(() => useFlightBooking('FLT1'), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock).not.toHaveBeenCalled();

    auth = { loading: false, user: { id: 'user-1' } };
    rerender();

    await waitFor(() => expect(result.current.data).toEqual({ bookingReference: 'FLT1' }));
    expect(result.current.error).toBeNull();
  });

  it('asks again as whoever turns out to be signed in', async () => {
    const fetchMock = serveOwnBookingOnly();
    auth = { loading: false, user: null };
    const { result, rerender } = renderHook(() => useFlightBooking('FLT1'), { wrapper });
    await waitFor(() => expect(result.current.error?.message).toMatch(/could not find this booking/));

    auth = { loading: false, user: { id: 'user-1' } };
    rerender();

    await waitFor(() => expect(result.current.data).toEqual({ bookingReference: 'FLT1' }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
