import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The review page's price settings: asked for early, and not waited on for long.
 *
 * On 10 Nov 2026 that read stalled for 45 seconds on the live site, the flight
 * deadline, before its retry answered in about a second. It now starts while
 * the customer is still choosing a fare, and gives up within a few seconds so
 * the retry comes sooner.
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

describe('the price settings read', () => {
  it('gives up within ten seconds instead of the 45-second flight deadline', async () => {
    const fetch = server();
    vi.stubGlobal('fetch', fetch);
    const { default: PricingService } = await import('../../frontend/src/Services/PricingService.js');

    await PricingService.getPriceConfig('all');

    const [[, init]] = requested(fetch, 'admin/price-settings');
    expect(init?.timeoutMs).toBeGreaterThan(0);
    expect(init?.timeoutMs).toBeLessThanOrEqual(10_000);
  });
});

describe('choosing a fare', () => {
  it('asks for the price settings, the guest switch and the cancel policy as the fare choice opens', async () => {
    const fetch = server();
    vi.stubGlobal('fetch', fetch);
    localStorage.setItem('userCurrency', 'USD');
    const { default: FlightFareOptions } = await import('../../frontend/src/Pages/Common/flights/FlightFareOptions.jsx');
    const flight = {
      id: '1',
      airline: { code: 'AI', name: 'Air India', logo: '' },
      departure: { time: '20:40', airport: 'DEL' },
      arrival: { time: '23:10', airport: 'BOM' },
      stops: 0,
      price: { amount: 84.6, total: '84.60', currency: 'USD' },
      baggage: { checked: null, cabin: null },
      originalOffer: { id: '1', travelerPricings: [{ travelerType: 'ADULT' }] },
    };

    render(<FlightFareOptions flight={flight} onClose={() => {}} onSelect={() => {}} />);

    await waitFor(() => {
      expect(requested(fetch, 'admin/price-settings')).toHaveLength(1);
      expect(requested(fetch, 'feature-flags/guest-flight-booking')).toHaveLength(1);
      expect(requested(fetch, 'flights/cancel-policy')).toHaveLength(1);
    });
  });
});
