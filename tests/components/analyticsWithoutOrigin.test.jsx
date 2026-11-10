import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The flight home sections when the visitor's city has no airport code.
 *
 * GeoService leaves the origin blank for a city it cannot place (Fatehpur,
 * Houston). On 10 Nov 2026 the live home and flights pages then asked
 * /api/flights/analytics/booked?origin= and got a 400 on every visit, and
 * "Cheapest fares from" sat on "Checking prices…" over no fares.
 */

const location = { current: { city: '', cityCode: '', countryCode: 'IN', loading: false } };
vi.mock('../../frontend/src/Context/LocationContext', () => ({ useLocationContext: () => location.current }));

const server = () => vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: [] }) }));
const calls = (fetch, path) => fetch.mock.calls.filter(([url]) => String(url).includes(path));

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  location.current = { city: '', cityCode: '', countryCode: 'IN', loading: false };
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('the flight analytics service', () => {
  it('sends nothing when an airport code it needs is missing', async () => {
    const fetch = server();
    vi.stubGlobal('fetch', fetch);
    const service = (await import('../../frontend/src/Services/FlightAnalyticsService.js')).default;

    expect(await service.getMostBookedDestinations('')).toEqual([]);
    expect(await service.getMostBookedDestinations(undefined)).toEqual([]);
    expect(await service.getCheapestFlightDates('DEL', '')).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('still asks when the code is there', async () => {
    const fetch = server();
    vi.stubGlobal('fetch', fetch);
    const service = (await import('../../frontend/src/Services/FlightAnalyticsService.js')).default;

    await service.getMostBookedDestinations('DEL');

    expect(calls(fetch, 'analytics/booked')).toHaveLength(1);
    expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get('origin')).toBe('DEL');
  });
});

describe('popular destinations without an origin', () => {
  it('shows the standard destinations and asks the server for nothing', async () => {
    const fetch = server();
    vi.stubGlobal('fetch', fetch);
    const { default: PopularDestinations } = await import('../../frontend/src/Pages/Common/flights/popular-destination.jsx');

    render(<PopularDestinations onSelectDestination={() => {}} />);

    expect((await screen.findAllByText(/New York/)).length).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls(fetch, 'analytics/booked')).toHaveLength(0);
  });
});

describe('cheapest fares', () => {
  it('shows nothing, rather than "Checking prices…" over no fares, when the origin is unknown', async () => {
    vi.stubGlobal('fetch', server());
    const { default: CheapestFlights } = await import('../../frontend/src/Pages/Common/flights/cheapest-flight.jsx');

    const { container } = render(<CheapestFlights onBookFlight={() => {}} />);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/Checking prices/)).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('shows fares from the visitor\'s airport when it is known', async () => {
    location.current = { city: 'New Delhi', cityCode: 'DEL', countryCode: 'IN', loading: false };
    vi.stubGlobal('fetch', server());
    const { default: CheapestFlights } = await import('../../frontend/src/Pages/Common/flights/cheapest-flight.jsx');

    render(<CheapestFlights onBookFlight={() => {}} />);

    expect(await screen.findByText('New Delhi (DEL)')).toBeTruthy();
  });
});
