import { afterEach, describe, expect, it, vi } from 'vitest';
import GeoService from '../../frontend/src/Services/GeoService.js';

/** The visitor's origin: the listed city when it is one, else the airport the server found. */
const answer = (body) => vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(body) })));

afterEach(() => vi.unstubAllGlobals());

describe('the visitor origin', () => {
  it('is the nearest airport for a town the city list does not know', async () => {
    answer({ city: 'Fatehpur', country_code: 'IN', nearest_airport: { code: 'LKO', cityName: 'Lucknow', distanceKm: 105 } });
    expect(await GeoService.getUserLocation()).toMatchObject({ cityCode: 'LKO', city: 'Lucknow', rawCity: 'Fatehpur' });
  });

  it('stays the listed city when the list knows it', async () => {
    answer({ city: 'Noida', country_code: 'IN', nearest_airport: { code: 'XXX', cityName: 'Elsewhere' } });
    expect(await GeoService.getUserLocation()).toMatchObject({ cityCode: 'DEL', city: 'New Delhi' });
  });

  it('is blank, never a guess, when neither is known', async () => {
    answer({ city: 'Nowhere', country_code: 'US', nearest_airport: null });
    expect(await GeoService.getUserLocation()).toMatchObject({ cityCode: '', city: 'Nowhere' });
  });
});
