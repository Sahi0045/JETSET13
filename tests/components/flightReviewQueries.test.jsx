import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFIG_READ_TIMEOUT_MS } from '../../frontend/src/utils/fetchTimeout.js';

/**
 * The review page's three small reads: who starts them, and how long each may take.
 *
 * On 10 Nov 2026 the price settings read stalled for 45 seconds, the flight
 * deadline, before its retry answered in about a second. These reads now start
 * while the customer is still choosing a fare, and give up after a few seconds
 * so the retry comes sooner.
 */

const answers = {
  'admin/price-settings': { success: true, data: { flight_taxes_fees: 1, flight_taxes_fees_percentage: 0 } },
  'feature-flags/guest-flight-booking': { success: true, data: { enabled: false } },
  'flights/cancel-policy': { success: true, freeUntil: null, timeZone: null },
  'flights/upsell': { success: true, data: [] },
};

const server = () => vi.fn((url) => {
  const key = Object.keys(answers).find((path) => String(url).includes(path));
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(key ? answers[key] : { success: false }) });
});

const requested = (fetch, path) => fetch.mock.calls.filter(([url]) => String(url).includes(path));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('each read gives up after the configuration deadline', () => {
  it('the guest booking switch and the cancel policy', async () => {
    const fetch = server();
    vi.stubGlobal('fetch', fetch);
    const { fetchGuestFlightBooking, fetchCancelPolicy } = await import('../../frontend/src/hooks/queries/flightReviewQueries.js');

    await fetchGuestFlightBooking();
    await fetchCancelPolicy();

    expect(requested(fetch, 'feature-flags/guest-flight-booking')[0][1]?.timeoutMs).toBe(CONFIG_READ_TIMEOUT_MS);
    expect(requested(fetch, 'flights/cancel-policy')[0][1]?.timeoutMs).toBe(CONFIG_READ_TIMEOUT_MS);
  });

  it('is shorter than the flight deadline', async () => {
    const { DEFAULT_TIMEOUT_MS } = await import('../../frontend/src/utils/fetchTimeout.js');
    expect(CONFIG_READ_TIMEOUT_MS).toBeLessThan(DEFAULT_TIMEOUT_MS);
  });
});

describe('the prefetch and the review page share their cache', () => {
  it('fills the same cache entries the review page reads', async () => {
    const fetch = server();
    vi.stubGlobal('fetch', fetch);
    const { QueryClient } = await import('@tanstack/react-query');
    const { prefetchFlightReview, priceConfigQuery, guestFlightBookingQuery, cancelPolicyQuery } = await import('../../frontend/src/hooks/queries/flightReviewQueries.js');
    const client = new QueryClient();

    prefetchFlightReview(client);

    await waitFor(() => {
      expect(client.getQueryData(priceConfigQuery('all').queryKey)).toEqual(answers['admin/price-settings'].data);
      expect(client.getQueryData(guestFlightBookingQuery().queryKey)).toBe(false);
      expect(client.getQueryData(cancelPolicyQuery().queryKey)).toEqual({ freeUntil: null, timeZone: null });
    });

    const { QueryClientProvider } = await import('@tanstack/react-query');
    const { renderHook } = await import('@testing-library/react');
    const { usePriceConfig } = await import('../../frontend/src/hooks/queries/usePricing.js');
    const { useGuestFlightBooking } = await import('../../frontend/src/hooks/queries/useFeatureFlags.js');
    const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    expect(renderHook(() => usePriceConfig('all'), { wrapper }).result.current.isPending).toBe(false);
    expect(renderHook(() => useGuestFlightBooking(), { wrapper }).result.current.isSuccess).toBe(true);
  });
});
