import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FlightSearchForm from '../../frontend/src/Pages/Common/flights/flight-search-form.jsx';
import { searchFromQuery } from '../../frontend/src/Pages/Common/flights/searchQuery.js';

/**
 * The flight search form, as the results page's Modify opens it.
 */

const renderForm = (props = {}) => render(
  <MemoryRouter>
    <FlightSearchForm onSearch={() => {}} {...props} />
  </MemoryRouter>,
);

beforeEach(() => {
  localStorage.setItem('userCurrency', 'USD');
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }));
});

// The URL spelled a round trip 'round-trip' and the form looked for
// 'roundTrip', so after a refresh Modify showed it as one way.
describe('a round trip read back from the URL', () => {
  it('opens in Modify as a round trip, with its return date', () => {
    const search = searchFromQuery('?from=JFK&to=LHR&date=2026-10-01&returnDate=2026-10-20');
    renderForm({ initialData: search });

    expect(screen.queryByText(/Tap to add a return date/)).toBeNull();
    expect(screen.getByText('20')).toBeTruthy();
  });

  it('still reads the old spelling, from state saved before', () => {
    renderForm({ initialData: { from: 'JFK', to: 'LHR', departDate: '2026-10-01', returnDate: '2026-10-21', tripType: 'round-trip' } });

    expect(screen.queryByText(/Tap to add a return date/)).toBeNull();
    expect(screen.getByText('21')).toBeTruthy();
  });
});
