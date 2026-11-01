import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FlightSearchPage from '../../frontend/src/Pages/Common/flights/flightsearchpage.jsx';
import offers from '../fixtures/flights/searchOffers.json';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/PageWrapper', () => ({ default: (Page) => Page }));
vi.mock('../../frontend/src/Pages/Common/flights/FlightCard', () => ({
  default: ({ flight, onViewPrices }) => (
    <button type="button" onClick={() => onViewPrices(flight)}>{`select ${flight.id}`}</button>
  ),
}));
vi.mock('../../frontend/src/Pages/Common/flights/FlightFareOptions', () => ({
  default: ({ flight, onSelect }) => (
    <button type="button" onClick={() => onSelect(flight, null)}>choose fare</button>
  ),
}));
vi.mock('../../frontend/src/Pages/Common/flights/FlightFilterSidebar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/flights/FlightModifyBar', () => ({ default: () => null }));

const answer = (status, body) => Promise.resolve({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
});

let checkoutState;

const CheckoutProbe = () => {
  checkoutState = useLocation().state;
  return <div>checkout</div>;
};

beforeEach(() => {
  checkoutState = undefined;
  localStorage.setItem('userCurrency', 'USD');
  window.scrollTo = vi.fn();
  globalThis.fetch = vi.fn((url) => {
    const target = String(url);
    if (target.includes('/flights/search')) return answer(200, { success: true, data: offers });
    if (target.includes('/flights/date-prices')) return answer(200, { success: false, dateWisePrices: {} });
    return answer(404, {});
  });
});

describe('the search page hands checkout the flight it showed', () => {
  it("BOOK hands checkout the search page's flight", async () => {
    render(
      <MemoryRouter initialEntries={['/flights/search?from=DEL&to=BOM&date=2026-11-23&adults=2']}>
        <Routes>
          <Route path="/flights/search" element={<FlightSearchPage />} />
          <Route path="/flights/booking-confirmation" element={<CheckoutProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText(`select ${offers[1].id}`));
    fireEvent.click(await screen.findByText('choose fare'));
    await screen.findByText('checkout');

    expect(checkoutState.attemptId).toMatch(/\S/);
    expect({ ...checkoutState, attemptId: 'x' }).toMatchSnapshot();
  });
});
