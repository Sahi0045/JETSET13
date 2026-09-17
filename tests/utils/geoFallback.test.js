import { afterEach, describe, expect, it, vi } from 'vitest';
import GeoService from '../../frontend/src/Services/GeoService.js';

/**
 * When every location lookup fails.
 *
 * The fallback put the visitor in India: prices in rupees and a +91 phone code,
 * wherever they were. Every fare is charged in US dollars, so that is the
 * currency to show, and no phone code is better than someone else's.
 */

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('GeoService when every lookup fails', () => {
  it('shows US dollars and suggests no phone code', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));

    const location = await GeoService.getUserLocation();

    expect(location.currency).toBe('USD');
    expect(location.callingCode).toBe('');
  });
});

// Every city not on the short list - and every visitor whose lookups failed -
// was placed in New Delhi, so a visitor in Houston clicking "London" searched
// DEL-LHR.
describe('GeoService and a city it does not know', () => {
  it('names no origin when every lookup fails', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));

    const location = await GeoService.getUserLocation();

    expect(location.cityCode).toBe('');
    expect(location.city).toBe('');
  });

  it('keeps the city it was told and gives it no Delhi code', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { city: 'Houston', country: 'United States', country_code: 'US', currency: 'USD' }, city: 'Houston', country_name: 'United States', country_code: 'US', currency: 'USD' }),
    }));

    const location = await GeoService.getUserLocation();

    expect(location.cityCode).not.toBe('DEL');
    expect(location.city).not.toBe('New Delhi');
  });
});
