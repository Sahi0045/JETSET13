import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FlightSearchPage from '../../frontend/src/Pages/Common/flights/flightsearchpage.jsx';
import { legsOf, maxStops, totalMinutes } from '../../frontend/src/Pages/Common/flights/flightSort.js';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/PageWrapper', () => ({ default: (Page) => Page }));
vi.mock('../../frontend/src/Pages/Common/flights/FlightFilterSidebar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/flights/FlightModifyBar', () => ({ default: () => null }));

const inDays = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

const segment = (id, from, to, date, dep = '09:00', arr = '13:00') => ({
  id, carrierCode: 'EK', number: `50${id}`, aircraft: { code: '77W' },
  departure: { iataCode: from, at: `${date}T${dep}:00` },
  arrival: { iataCode: to, at: `${date}T${arr}:00` },
});

const offer = (id, itineraries) => {
  const first = itineraries[0];
  const last = first[first.length - 1];
  return {
    id,
    airline: 'Emirates',
    airlineCode: 'EK',
    flightNumber: `EK ${first[0].number}`,
    price: { amount: 717.16, total: '717.16', currency: 'USD' },
    duration: '4h 0m',
    durationMinutes: 240,
    stops: first.length - 1,
    departure: { time: '09:00', airport: first[0].departure.iataCode, date: first[0].departure.at.slice(0, 10) },
    arrival: { time: '13:00', airport: last.arrival.iataCode, date: last.arrival.at.slice(0, 10) },
    originalOffer: {
      itineraries: itineraries.map((segments) => ({ duration: 'PT4H', segments })),
      travelerPricings: [{ travelerId: '1' }],
    },
  };
};

const [d1, d2, d3] = [inDays(30), inDays(34), inDays(41)];
const threeLegs = offer('mc-1', [
  [segment('1', 'DEL', 'DXB', d1)],
  [segment('2', 'DXB', 'LHR', d2)],
  [segment('3', 'LHR', 'DXB', d3), segment('4', 'DXB', 'DEL', d3, '15:00', '20:00')],
]);
const openJaw = offer('oj-1', [[segment('1', 'DEL', 'DXB', d1)], [segment('2', 'LHR', 'DEL', d2)]]);

let searchBodies;

const renderResults = (query) => render(
  <MemoryRouter initialEntries={[`/flights/search?${query}`]}>
    <Routes>
      <Route path="/flights/search" element={<FlightSearchPage />} />
    </Routes>
  </MemoryRouter>,
);

const answerWith = (data) => {
  globalThis.fetch = vi.fn((url, init = {}) => {
    const target = String(url);
    if (target.includes('/flights/search')) {
      searchBodies.push(JSON.parse(init.body));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data }) });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  });
};

const multiCityQuery = `tripType=multiCity&leg=DEL%7CDXB%7C${d1}&leg=DXB%7CLHR%7C${d2}&leg=LHR%7CDEL%7C${d3}`;

beforeEach(() => {
  searchBodies = [];
  localStorage.setItem('userCurrency', 'USD');
  window.scrollTo = vi.fn();
});

describe('multi-city results', () => {
  it('searches the legs from the link', async () => {
    answerWith([threeLegs]);
    renderResults(multiCityQuery);

    await waitFor(() => expect(searchBodies).toHaveLength(1));
    expect(searchBodies[0].legs).toEqual([
      { from: 'DEL', to: 'DXB', departDate: d1 },
      { from: 'DXB', to: 'LHR', departDate: d2 },
      { from: 'LHR', to: 'DEL', departDate: d3 },
    ]);
  });

  it('shows every flight of the trip on the card, numbered', async () => {
    answerWith([threeLegs]);
    renderResults(multiCityQuery);

    expect(await screen.findByText('Flight 1')).toBeTruthy();
    expect(screen.getByText('Flight 2')).toBeTruthy();
    expect(screen.getByText('Flight 3')).toBeTruthy();
    expect(screen.queryByText('Return')).toBeNull();
  });

  it('a two-flight open-jaw trip is not shown as a return', async () => {
    answerWith([openJaw]);
    renderResults(`tripType=multiCity&leg=DEL%7CDXB%7C${d1}&leg=LHR%7CDEL%7C${d2}`);

    expect(await screen.findByText('Flight 2')).toBeTruthy();
    expect(screen.queryByText('Return')).toBeNull();
  });

  it('asks no one-way date prices and shows no date strip', async () => {
    answerWith([threeLegs]);
    renderResults(multiCityQuery);

    await screen.findByText('Flight 1');
    expect(fetch.mock.calls.some(([url]) => String(url).includes('date-prices'))).toBe(false);
    expect(screen.queryByRole('button', { name: 'Previous week' })).toBeNull();
  });

  it('heads the page with the whole route', async () => {
    answerWith([threeLegs]);
    renderResults(multiCityQuery);

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toMatch(/DEL|Delhi/);
    expect(heading.textContent).toMatch(/→.*→.*→/);
  });
});

describe('sorting a multi-city trip', () => {
  const trip = {
    durationMinutes: 240,
    stops: 0,
    laterLegs: [{ duration: 'PT5H', stops: 0 }, { duration: 'PT9H30M', stops: 1 }],
  };

  it('counts every flight', () => {
    expect(legsOf(trip)).toHaveLength(3);
    expect(totalMinutes(trip)).toBe(240 + 300 + 570);
    expect(maxStops(trip)).toBe(1);
  });
});
