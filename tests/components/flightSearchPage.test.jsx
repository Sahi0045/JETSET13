import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import currencyService from '../../frontend/src/Services/CurrencyService.js';
import { formatDateToISO, getSafeDate } from '../../frontend/src/utils/dateUtils.js';
import FlightSearchPage from '../../frontend/src/Pages/Common/flights/flightsearchpage.jsx';
import { withDepartureDate } from '../../frontend/src/Pages/Common/flights/searchResults.js';

/**
 * The flight results page, driven through its own fetches.
 *
 * Everything around the results is replaced by a stand-in - the site chrome,
 * the flight card, the filter sidebar and the modify form - so these exercise
 * what the page decides: which answer it shows, when it shows a failure, what
 * it searches for, and which page of results it is on.
 */

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/PageWrapper', () => ({ default: (Page) => Page }));
vi.mock('../../frontend/src/Pages/Common/flights/FlightCard', () => ({
  default: ({ flight }) => <div data-testid="flight-card">{flight.id}</div>,
}));
// The sidebar now only serves the phone drawer; the desktop filters live in
// FlightFilterBar. The buttons the tests press moved with them.
vi.mock('../../frontend/src/Pages/Common/flights/FlightFilterSidebar', () => ({
  default: () => null,
}));
vi.mock('../../frontend/src/Pages/Common/flights/FlightFilterBar', () => ({
  default: ({ onFilterChange, onResetAll }) => (
    <>
      <button type="button" onClick={() => onFilterChange('stops', '0')}>Only non-stop</button>
      <button type="button" onClick={() => onFilterChange('price', [0, 1])}>Cheap only</button>
      <button type="button" onClick={onResetAll}>Reset filters</button>
    </>
  ),
}));
vi.mock('../../frontend/src/Pages/Common/flights/FlightModifyBar', () => ({
  default: ({ onSearch }) => (
    <button type="button" onClick={() => onSearch(globalThis.__nextSearch)}>Modify search</button>
  ),
}));

const addDays = (isoDate, days) => {
  const date = getSafeDate(isoDate);
  date.setDate(date.getDate() + days);
  return formatDateToISO(date);
};
const D1 = addDays(formatDateToISO(new Date()), 30);
const D2 = addDays(D1, 1);
const D3 = addDays(D1, 2);

const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
const answer = (status, body) => Promise.resolve(response(status, body));

const card = (id, { stops = 0, price = 100 } = {}) => ({
  id,
  airline: 'Test Air',
  airlineCode: 'TA',
  flightNumber: `TA-${id}`,
  price: { amount: price, total: price.toFixed(2), currency: 'USD' },
  duration: '2h 0m',
  durationMinutes: 120,
  stops,
  departure: { time: '08:00', airport: 'DEL', date: D1 },
  arrival: { time: '10:00', airport: 'BOM', date: D1 },
});

let searchAnswer;
let datePriceBodies;
let currentLocation;

const searchBodies = () => fetch.mock.calls
  .filter(([url]) => String(url).includes('/flights/search'))
  .map(([, init]) => JSON.parse(init.body));

const LocationProbe = () => {
  currentLocation = useLocation();
  return null;
};

const renderPage = (search = `from=DEL&to=BOM&date=${D1}`) => render(
  <MemoryRouter initialEntries={[`/flights/search?${search}`]}>
    <Routes>
      <Route path="/flights/search" element={<><FlightSearchPage /><LocationProbe /></>} />
    </Routes>
  </MemoryRouter>,
);

const stripButton = (isoDate) => screen
  .getByText(getSafeDate(isoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
  .closest('button');

beforeEach(() => {
  localStorage.setItem('userCurrency', 'USD');
  window.scrollTo = vi.fn();
  datePriceBodies = [];
  searchAnswer = () => answer(200, { success: true, data: [] });
  globalThis.fetch = vi.fn((url, init = {}) => {
    const target = String(url);
    if (target.includes('/flights/search')) return searchAnswer(JSON.parse(init.body));
    if (target.includes('/flights/date-prices')) {
      datePriceBodies.push(JSON.parse(init.body));
      return answer(200, { success: false, dateWisePrices: {} });
    }
    return answer(404, {});
  });
});

describe('a search that fails is shown as a failure', () => {
  // The page stored the error and never rendered it, so every failure read
  // "No flights found" beside a "Reset All Filters" button.
  it("shows a refused search's own reason", async () => {
    const reason = "Each infant travels on an adult's lap, so there must be at least as many adults as infants.";
    searchAnswer = () => answer(400, { success: false, error: reason });
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(reason);
    expect(screen.queryByText('No flights found')).toBeNull();
  });

  it('says it could not load flights when the provider is down, and Retry searches again', async () => {
    let attempts = 0;
    searchAnswer = () => {
      attempts += 1;
      return attempts === 1
        ? answer(502, { success: false, error: 'Flight search failed' })
        : answer(200, { success: true, data: [card('a'), card('b')] });
    };
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/couldn't load flights/i);
    expect(alert.textContent).not.toContain('Flight search failed');

    fireEvent.click(within(alert).getByRole('button', { name: /retry/i }));

    await waitFor(() => expect(screen.getAllByTestId('flight-card')).toHaveLength(2));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(searchBodies()).toHaveLength(2);
  });

  it('copes with a gateway timeout that answers in HTML', async () => {
    searchAnswer = () => Promise.resolve({ ok: false, status: 504, json: () => Promise.reject(new SyntaxError('Unexpected token <')) });
    renderPage();

    expect((await screen.findByRole('alert')).textContent).toMatch(/too long/i);
  });
});

describe('picking dates', () => {
  // A date click fired its own request with no abort and no staleness check,
  // so a slow answer for an earlier click could replace a later one.
  it('shows only the latest date searched, whatever order the answers arrive in', async () => {
    const pending = {};
    searchAnswer = (payload) => new Promise((resolve) => { pending[payload.departDate] = resolve; });
    renderPage();

    await waitFor(() => expect(pending[D1]).toBeDefined());
    await act(async () => pending[D1](response(200, { success: true, data: [card('first-date')] })));
    await screen.findByText('first-date');

    fireEvent.click(stripButton(D2));
    await waitFor(() => expect(pending[D2]).toBeDefined());
    fireEvent.click(stripButton(D3));
    await waitFor(() => expect(pending[D3]).toBeDefined());

    await act(async () => pending[D3](response(200, { success: true, data: [card('third-date')] })));
    await screen.findByText('third-date');

    // The earlier click's answer arrives last.
    await act(async () => pending[D2](response(200, { success: true, data: [card('second-date')] })));

    expect(screen.queryByText('second-date')).toBeNull();
    expect(screen.getByText('third-date')).toBeTruthy();
    expect(currentLocation.search).toContain(`date=${D3}`);
  });

  // The catch neither cleared nor reverted, so the old date's flights stayed
  // on screen under the newly selected date.
  it("never leaves the previous date's flights under a date whose search failed", async () => {
    searchAnswer = (payload) => (payload.departDate === D1
      ? answer(200, { success: true, data: [card('first-date')] })
      : answer(502, { success: false, error: 'Flight search failed' }));
    renderPage();
    await screen.findByText('first-date');

    fireEvent.click(stripButton(D2));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('first-date')).toBeNull();
    expect(stripButton(D2).className).toMatch(/\bselected\b/);
  });

  // The strip changed only the departure, so a day after the return searched a
  // trip that came home before it left.
  it('moves the return with the departure on a round trip', async () => {
    const back = addDays(D1, 1);
    searchAnswer = () => answer(200, { success: true, data: [card('round-trip')] });
    renderPage(`from=DEL&to=BOM&date=${D1}&returnDate=${back}`);
    await screen.findByText('round-trip');

    fireEvent.click(stripButton(D3));

    await waitFor(() => expect(searchBodies().at(-1)).toMatchObject({ departDate: D3, returnDate: addDays(back, 2) }));
    expect(currentLocation.search).toContain(`returnDate=${addDays(back, 2)}`);
  });

  it('keeps the trip length across months and daylight-saving changes', () => {
    expect(withDepartureDate({ departDate: '2026-10-30', returnDate: '2026-11-02' }, '2026-11-01'))
      .toMatchObject({ departDate: '2026-11-01', returnDate: '2026-11-04' });
    expect(withDepartureDate({ departDate: '2026-10-10', returnDate: '' }, '2026-10-12'))
      .toEqual({ departDate: '2026-10-12', returnDate: '' });
  });

  // /date-prices prices one-way fares, so on a round trip every figure on the
  // strip priced a different journey from the one searched.
  it('shows no one-way fares on a round trip strip', async () => {
    searchAnswer = () => answer(200, { success: true, data: [card('round-trip')] });
    renderPage(`from=DEL&to=BOM&date=${D1}&returnDate=${addDays(D1, 5)}`);
    await screen.findByText('round-trip');

    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));

    expect(datePriceBodies).toHaveLength(0);
  });

  it('moves the strip a week without searching, and marks no date in it as searched', async () => {
    searchAnswer = () => answer(200, { success: true, data: [card('first-date')] });
    renderPage();
    await screen.findByText('first-date');
    const searchesBefore = searchBodies().length;

    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));

    const week = [4, 5, 6, 7, 8, 9, 10].map((n) => addDays(D1, n));
    for (const isoDate of week) expect(stripButton(isoDate)).toBeTruthy();
    expect(document.querySelectorAll('.date-button.selected')).toHaveLength(0);
    expect(searchBodies()).toHaveLength(searchesBefore);
    expect(datePriceBodies.at(-1).dates).toEqual(week);
  });
});

describe('pages of results', () => {
  // On page 3, filtering down to 15 flights showed an empty page 3 that read
  // "No flights found".
  it('goes back to the first page when the filters change', async () => {
    const flights = Array.from({ length: 25 }, (_, i) => card(`f${i}`, { stops: i < 15 ? 0 : 1, price: 100 + i }));
    searchAnswer = () => answer(200, { success: true, data: flights });
    renderPage();

    await waitFor(() => expect(screen.getAllByTestId('flight-card')).toHaveLength(10));
    // Let every update the arrival of results sets off finish first. Clicking
    // the moment the first cards appear raced the page's own settling on CI's
    // slower runner, which failed this test on main three times.
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    await waitFor(() => expect(screen.getAllByTestId('flight-card')).toHaveLength(5));

    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Only non-stop' }));

    await waitFor(() => expect(screen.getAllByTestId('flight-card')).toHaveLength(10));
    expect(screen.getAllByTestId('flight-card')[0].textContent).toBe('f0');
    expect(screen.queryByText('No flights found')).toBeNull();
  });
});

/**
 * Clearing the filters brings every flight back.
 *
 * Both reset paths set the price to a fixed 0-50,000 in the display currency,
 * so a fare above it - any fare past USD 600 when prices are shown in rupees -
 * stayed hidden after "Reset all filters". And a currency switch left the
 * bounds in the old currency, hiding every fare whose converted price was
 * above the old maximum.
 */
describe('resetting the filters and switching currency', () => {
  afterEach(() => {
    currencyService.setCurrency('USD');
  });

  it('shows every flight again after either reset, whatever the fares cost', async () => {
    searchAnswer = () => answer(200, { success: true, data: [card('costly', { price: 60000 }), card('cheap', { price: 100 })] });
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId('flight-card')).toHaveLength(2));

    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Cheap only' }));
    await screen.findByText('No flights found');

    // The empty results' own button.
    fireEvent.click(screen.getByRole('button', { name: /Reset All Filters/i }));
    await waitFor(() => expect(screen.getAllByTestId('flight-card')).toHaveLength(2));

    // The sidebar's.
    fireEvent.click(screen.getByRole('button', { name: 'Cheap only' }));
    await screen.findByText('No flights found');
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    await waitFor(() => expect(screen.getAllByTestId('flight-card')).toHaveLength(2));
  });

  it('keeps every flight on screen when the currency changes', async () => {
    searchAnswer = () => answer(200, { success: true, data: [card('priced-in-dollars', { price: 1000 })] });
    renderPage();
    await screen.findByText('priced-in-dollars');

    // USD 1,000 is about INR 83,000: far above the dollar bounds it was filtered by.
    await act(async () => { currencyService.setCurrency('INR'); });
    // The old bounds showed only once the list was filtered again, so filter it
    // again - by a filter this flight passes.
    fireEvent.click(screen.getByRole('button', { name: 'Only non-stop' }));

    await waitFor(() => expect(screen.queryByText('No flights found')).toBeNull());
    expect(screen.getByText('priced-in-dollars')).toBeTruthy();
  });
});

describe('modify search', () => {
  it('searches the codes, puts the search on the URL and reprices the strip for the new passengers', async () => {
    searchAnswer = () => answer(200, { success: true, data: [card('result')] });
    renderPage();
    await screen.findByText('result');

    // A label with a code left behind by an earlier pick, and only the
    // passenger count changed - the strip's fares used to stay the old ones.
    globalThis.__nextSearch = {
      from: 'New Delhi (DEL)', fromCode: 'HYD', to: 'Mumbai (BOM)', toCode: 'BOM',
      departDate: D1, returnDate: '', tripType: 'oneWay', adults: 2, children: 0, infants: 0, travelClass: 'ECONOMY',
    };
    fireEvent.click(screen.getByRole('button', { name: 'Modify search' }));

    await waitFor(() => expect(searchBodies()).toHaveLength(2));
    expect(searchBodies()[1]).toMatchObject({ from: 'DEL', to: 'BOM', departDate: D1, adults: 2 });
    expect(currentLocation.search).toContain('from=DEL');
    expect(currentLocation.search).toContain('to=BOM');
    expect(currentLocation.search).toContain('adults=2');
    await waitFor(() => expect(datePriceBodies.at(-1)).toMatchObject({ from: 'DEL', to: 'BOM', adults: 2 }));

    // The same search again still searches again.
    fireEvent.click(screen.getByRole('button', { name: 'Modify search' }));
    await waitFor(() => expect(searchBodies()).toHaveLength(3));
  });
});
