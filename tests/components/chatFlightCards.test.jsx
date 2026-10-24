import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChatFlightCards from '../../frontend/src/Pages/Common/chat/ChatFlightCards.jsx';
import { toDisplayFlights } from '../../frontend/src/Pages/Common/flights/flightOffers.js';
import { searchFromQuery, searchToQuery } from '../../frontend/src/Pages/Common/flights/searchQuery.js';
import offers from '../fixtures/flights/searchOffers.json';

const CITY_NAMES = { DEL: 'Delhi', BOM: 'Mumbai' };

vi.mock('../../frontend/src/hooks/useCityNames', async (importOriginal) => ({
  ...(await importOriginal()),
  default: () => CITY_NAMES,
}));
vi.mock('../../frontend/src/Pages/Common/flights/FlightFareOptions', () => ({
  default: ({ flight, onSelect }) => (
    <button type="button" onClick={() => onSelect(flight, { checked: true })}>choose fare</button>
  ),
}));

const search = { from: 'DEL', to: 'BOM', departDate: '2026-11-23', adults: 2, children: 0, infants: 0 };
const results = (overrides = {}) => ({ offers, total: 205, search, searchedAt: new Date().toISOString(), ...overrides });

let landed;

const Probe = () => {
  const location = useLocation();
  landed = location;
  return <div>landed</div>;
};

const renderCards = (props = {}) => render(
  <MemoryRouter initialEntries={['/']}>
    <Routes>
      <Route path="/" element={<ChatFlightCards results={results(props)} sessionId="chat-session-1" />} />
      <Route path="/flights/booking-confirmation" element={<Probe />} />
      <Route path="/flights/search" element={<Probe />} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  landed = undefined;
  localStorage.setItem('userCurrency', 'USD');
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve({}) }));
});

describe('flight cards in the chat', () => {
  it("shows each card's airline, times and price with the service fee label", () => {
    renderCards();

    expect(screen.getAllByText('for 2 travellers + service fee')).toHaveLength(2);
    expect(screen.getByText(new RegExp(`${offers[0].departure.time}.*${offers[0].arrival.time}`))).toBeTruthy();
    expect(screen.getAllByText(offers[0].airline).length).toBeGreaterThan(0);
    expect(screen.getByText(/Nonstop/)).toBeTruthy();
    expect(screen.getByText(/1 stop/)).toBeTruthy();
  });

  it("Book goes through the fare options and hands checkout the search page's state", async () => {
    renderCards();

    fireEvent.click(screen.getAllByRole('button', { name: /^Book/ })[1]);
    fireEvent.click(await screen.findByText('choose fare'));
    await screen.findByText('landed');

    const expected = {
      flightData: toDisplayFlights(offers, { cityMap: CITY_NAMES })[1],
      searchData: searchFromQuery(searchToQuery(search)),
      fareCheck: { checked: true },
    };
    expect(landed.pathname).toBe('/flights/booking-confirmation');
    expect({ ...landed.state, attemptId: 'x' }).toEqual({ ...expected, attemptId: 'x' });
    expect(landed.state.attemptId).toMatch(/\S/);
    const [url, init] = fetch.mock.calls.find(([target]) => String(target).includes('/api/chat/event'));
    expect(url).toBe('/api/chat/event');
    expect(JSON.parse(init.body)).toEqual({ sessionId: 'chat-session-1', event: 'flight_book_clicked', offerId: offers[1].id });
  });

  it('See all links to the full results for the same search', async () => {
    renderCards();

    const link = screen.getByRole('link', { name: 'See all 205 flights' });
    expect(link.getAttribute('href')).toBe('/flights/search?from=DEL&to=BOM&date=2026-11-23&adults=2');

    fireEvent.click(link);
    await screen.findByText('landed');
    expect(landed.state.searchData).toEqual(searchFromQuery(searchToQuery(search)));
  });

  it('names the route, date and travellers it searched', () => {
    renderCards();

    expect(screen.getByText('Delhi (DEL) → Mumbai (BOM)')).toBeTruthy();
    expect(screen.getByText('Mon, Nov 23 · 2 adults · Economy')).toBeTruthy();
  });

  it('shows the return flight of a round trip', () => {
    const homeward = (itinerary) => ({
      ...itinerary,
      segments: [...itinerary.segments].reverse().map((segment) => ({ ...segment, departure: segment.arrival, arrival: segment.departure })),
    });
    const roundTrip = {
      ...offers[0],
      id: 'rt-1',
      originalOffer: { ...offers[0].originalOffer, itineraries: [offers[0].originalOffer.itineraries[0], homeward(offers[1].originalOffer.itineraries[0])] },
    };
    renderCards({ offers: [roundTrip], total: 1, search: { ...search, returnDate: '2026-11-27' } });

    expect(screen.getByText('Mon, Nov 23 – Fri, Nov 27 · 2 adults · Economy')).toBeTruthy();
    expect(screen.getByText(/^Return .* · 1 stop$/)).toBeTruthy();
  });

  it('restored cards show the time their prices were found', () => {
    const searchedAt = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    renderCards({ searchedAt });

    const at = new Date(searchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    expect(screen.getByText(`Prices found at ${at} · confirmed at checkout`)).toBeTruthy();
  });
});
