import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDateToISO, getSafeDate } from '../../frontend/src/utils/dateUtils.js';
import { clearCache } from '../../frontend/src/Services/AirportService.js';
import FlightSearchPage from '../../frontend/src/Pages/Common/flights/flightsearchpage.jsx';

/**
 * The results header names an airport the built-in list does not have.
 *
 * Delhi to Darbhanga on a day with no flights (8 Oct 2026) read "Flights from
 * New Delhi to DBR": the header knew only airports.js. With no results there is
 * nothing else on the page to learn the name from.
 */

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/PageWrapper', () => ({ default: (Page) => Page }));
vi.mock('../../frontend/src/Pages/Common/flights/FlightCard', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/flights/FlightFilterSidebar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/flights/FlightFilterBar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/flights/FlightModifyBar', () => ({
  default: ({ cityMap, searchParams }) => <div data-testid="modify-bar">{cityMap[searchParams.toCode || searchParams.to]}</div>,
}));

const date = (() => {
  const d = getSafeDate(formatDateToISO(new Date()));
  d.setDate(d.getDate() + 30);
  return formatDateToISO(d);
})();
const answer = (status, body) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });

beforeEach(() => {
  clearCache();
  localStorage.setItem('userCurrency', 'USD');
  window.scrollTo = vi.fn();
  globalThis.fetch = vi.fn((url) => {
    const target = String(url);
    if (target.includes('/flights/search')) return answer(200, { success: true, data: [] });
    if (target.includes('/airports/search')) {
      return answer(200, { success: true, data: [{ code: 'DBR', cityCode: 'DBR', name: 'Darbhanga Airport', cityName: 'Darbhanga' }] });
    }
    return answer(200, { success: false, dateWisePrices: {} });
  });
});

describe('the results header', () => {
  it('names Darbhanga, not DBR, on a day with no flights', async () => {
    render(
      <MemoryRouter initialEntries={[`/flights/search?from=DEL&to=DBR&date=${date}`]}>
        <Routes>
          <Route path="/flights/search" element={<FlightSearchPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent)
      .toBe('Flights from New Delhi to Darbhanga'));
    expect(screen.getByTestId('modify-bar').textContent).toBe('Darbhanga');
  });
});
