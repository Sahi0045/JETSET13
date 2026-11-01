import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FlightSearchPage from '../../frontend/src/Pages/Common/flights/flightsearchpage.jsx';
import { citySearchInstead } from '../../frontend/src/Pages/Common/flights/multiCityHelp.js';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/PageWrapper', () => ({ default: (Page) => Page }));
vi.mock('../../frontend/src/Pages/Common/flights/FlightFilterSidebar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/flights/FlightModifyBar', () => ({ default: () => null }));

const inDays = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
const [d1, d2, d3] = [inDays(30), inDays(34), inDays(41)];

let searchBodies;

const answerEmpty = () => {
  globalThis.fetch = vi.fn((url, init = {}) => {
    if (String(url).includes('/flights/search')) {
      searchBodies.push(JSON.parse(init.body));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: [] }) });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  });
};

const renderResults = (query) => render(
  <MemoryRouter initialEntries={[`/flights/search?${query}`]}>
    <Routes>
      <Route path="/flights/search" element={<FlightSearchPage />} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  searchBodies = [];
  localStorage.setItem('userCurrency', 'USD');
  window.scrollTo = vi.fn();
});

describe('a city instead of its smaller airport', () => {
  it('replaces London Luton with all London airports, everywhere it appears', () => {
    const legs = [
      { from: 'DEL', to: 'DXB', departDate: d1 },
      { from: 'DXB', to: 'LTN', departDate: d2 },
      { from: 'LTN', to: 'SFO', departDate: d3 },
    ];

    expect(citySearchInstead(legs)).toEqual({
      cityNames: ['London'],
      legs: [
        { from: 'DEL', to: 'DXB', departDate: d1 },
        { from: 'DXB', to: 'LON', departDate: d2 },
        { from: 'LON', to: 'SFO', departDate: d3 },
      ],
    });
  });

  it('is nothing when every airport is a main one', () => {
    expect(citySearchInstead([{ from: 'DEL', to: 'DXB', departDate: d1 }, { from: 'DXB', to: 'LHR', departDate: d2 }])).toBeNull();
  });
});

describe('a multi-city search with no flights', () => {
  it('says why, and offers the city instead of its smaller airport', async () => {
    answerEmpty();
    renderResults(`tripType=multiCity&leg=DEL%7CDXB%7C${d1}&leg=DXB%7CLTN%7C${d2}&leg=LTN%7CSFO%7C${d3}`);

    expect(await screen.findByText(/No airline sells these flights together on one ticket/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Search London (all airports) instead' }));

    await waitFor(() => expect(searchBodies).toHaveLength(2));
    expect(searchBodies[1].legs.map((leg) => `${leg.from}-${leg.to}`)).toEqual(['DEL-DXB', 'DXB-LON', 'LON-SFO']);
  });

  it('suggests other dates when no airport can be swapped', async () => {
    answerEmpty();
    renderResults(`tripType=multiCity&leg=DEL%7CDXB%7C${d1}&leg=DXB%7CLHR%7C${d2}`);

    expect(await screen.findByText(/No airline sells these flights together on one ticket/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /all airports/ })).toBeNull();
  });
});
