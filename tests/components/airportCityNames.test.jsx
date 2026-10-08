import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, resolveCityNames } from '../../frontend/src/Services/AirportService.js';
import FlightCard from '../../frontend/src/Pages/Common/flights/FlightCard.jsx';

/**
 * City names for airports the built-in list does not have.
 *
 * The flight pages named airports from airports.js, about 200 of them. Every
 * other airport - Darbhanga (DBR), searched on 8 Oct 2026 - was shown as its
 * code: "Flights from New Delhi to DBR". The airport API knows 4,028.
 */

const darbhanga = {
  name: 'Darbhanga Airport', code: 'DBR', type: 'AIRPORT', cityName: 'Darbhanga', cityCode: 'DBR', country: 'IN', countryCode: 'IN',
};
const answer = (body, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) });
const airportRequests = () => fetch.mock.calls
  .filter(([url]) => String(url).includes('/airports/search'))
  .map(([, init]) => JSON.parse(init.body));

beforeEach(() => {
  clearCache();
  globalThis.fetch = vi.fn((url) => (String(url).includes('/airports/search')
    ? answer({ success: true, data: [darbhanga] })
    : answer({}, false)));
});

describe('resolveCityNames', () => {
  it('names an airport the built-in list lacks, from the airport API', async () => {
    expect(await resolveCityNames(['DBR'])).toEqual({ DBR: 'Darbhanga' });
  });

  // The API filters by countryCode, so a lookup sent with the visitor's
  // country finds nothing for an airport abroad.
  it('asks by code alone, with no country', async () => {
    await resolveCityNames(['dbr']);
    expect(airportRequests()).toEqual([expect.objectContaining({ keyword: 'DBR' })]);
    expect(airportRequests()[0]).not.toHaveProperty('countryCode');
  });

  it('asks nothing about an airport the built-in list has', async () => {
    expect(await resolveCityNames(['DEL', 'GOI'])).toEqual({});
    expect(fetch).not.toHaveBeenCalled();
  });

  it('asks once per airport', async () => {
    await resolveCityNames(['DBR']);
    expect(await resolveCityNames(['DBR', 'DEL'])).toEqual({ DBR: 'Darbhanga' });
    expect(airportRequests()).toHaveLength(1);
  });

  it('leaves the code out when the API cannot place it', async () => {
    fetch.mockImplementation(() => answer({ success: false }, false));
    expect(await resolveCityNames(['XQZ'])).toEqual({});
  });
});

describe('the flight card', () => {
  // The search page wrote each leg's city name when the results arrived, from
  // the built-in list: "DBR". The card printed that, whatever the page learned.
  it('names a city the page has looked up since the results arrived', () => {
    render(
      <FlightCard
        flight={{
          id: '1',
          airline: { code: 'SG', name: 'SpiceJet' },
          flightNumber: 'SG 495',
          price: { amount: 162.6, total: '162.60', currency: 'USD' },
          duration: '1h 55m',
          stops: 0,
          stopDetails: [],
          segments: [],
          departure: { time: '13:25', airport: 'DEL', cityName: 'New Delhi', rawDate: '2026-10-18' },
          arrival: { time: '15:20', airport: 'DBR', cityName: 'DBR', rawDate: '2026-10-18' },
        }}
        onBook={() => {}}
        onViewPrices={() => {}}
        cityMap={{ DEL: 'New Delhi', DBR: 'Darbhanga' }}
      />,
    );

    expect(screen.getAllByText('Darbhanga').length).toBeGreaterThan(0);
  });
});
