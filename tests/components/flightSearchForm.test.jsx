import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

// The departure calendar prices one-way fares from the origin. On a round trip
// they are the price of a different journey.
describe("the departure calendar's fares", () => {
  const route = { from: 'New Delhi (DEL)', fromCode: 'DEL', to: 'Mumbai (BOM)', toCode: 'BOM', departDate: '2026-10-01' };
  const datePriceCalls = () => fetch.mock.calls.filter(([url]) => String(url).includes('/flights/date-prices'));

  it('are shown for a one-way trip', async () => {
    renderForm({ initialData: { ...route, tripType: 'oneWay', returnDate: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Select departure date' }));

    await waitFor(() => expect(datePriceCalls()).toHaveLength(1));
  });

  it('are not asked for on a round trip', async () => {
    renderForm({ initialData: { ...route, tripType: 'roundTrip', returnDate: '2026-10-08' } });
    fireEvent.click(screen.getByRole('button', { name: 'Select departure date' }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(datePriceCalls()).toHaveLength(0);
  });
});

// The departure field is itself a button that opens and closes on Enter. A key
// pressed on a day reached it too, and closed the calendar without choosing.
describe('the calendar from the keyboard', () => {
  it('stays open for a key pressed on one of its days', () => {
    const { container } = renderForm({ initialData: { from: '', to: '', departDate: '2026-10-01', tripType: 'oneWay', returnDate: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Select departure date' }));
    const firstDay = container.querySelector('[data-date]:not([disabled])');

    fireEvent.keyDown(firstDay, { key: 'Enter' });

    expect(screen.getByRole('dialog', { name: 'Choose a date' })).toBeTruthy();
  });
});

// Each infant travels on an adult's lap. Lowering adults left more infants than
// laps, a search the airline refuses.
describe('the traveller counts', () => {
  it('take infants down with the adults', () => {
    renderForm({ initialData: { from: '', to: '', departDate: '2026-10-01', tripType: 'oneWay', returnDate: '', adults: 2, infants: 2 } });
    fireEvent.click(screen.getByRole('button', { name: 'Select travellers and class' }));

    const counter = (label) => within(screen.getByText(label).parentElement);
    fireEvent.click(counter('ADULTS (12y +)').getByRole('button', { name: '1' }));

    expect(counter('INFANTS (below 2y)').getByRole('button', { name: '1' }).className).toMatch(/bg-\[#055B75\]/);
    expect(counter('INFANTS (below 2y)').getByRole('button', { name: '2' }).className).not.toMatch(/bg-\[#055B75\] text-white/);
  });
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
