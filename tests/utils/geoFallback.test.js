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
