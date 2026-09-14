import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CustomFlightCalendar from '../../frontend/src/Pages/Common/flights/CustomFlightCalendar.jsx';
import { stripDates } from '../../frontend/src/Pages/Common/flights/searchResults.js';
import { formatDateToISO } from '../../frontend/src/utils/dateUtils.js';

/**
 * The search form's date picker shows real fares or none.
 *
 * It drew an invented "estimated" curve around ₹3,500 with a green "Cheapest"
 * day whenever fewer than two real prices were known, printed real USD totals
 * behind a hard-coded "₹", and asked /cheapest-dates without the departure date
 * the provider needs - so the estimates were nearly all anyone ever saw.
 */

const inDays = (n) => {
  const date = new Date();
  date.setDate(date.getDate() + n);
  return formatDateToISO(date);
};

const respond = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

let datePrices;
const datePriceCalls = () => fetch.mock.calls.filter(([url]) => String(url).includes('/flights/date-prices'));

const renderCalendar = (props = {}) => render(
  <CustomFlightCalendar
    selectedDate={inDays(10)}
    originCode="DEL"
    destinationCode="BOM"
    onSelect={() => {}}
    onClose={() => {}}
    {...props}
  />,
);

beforeEach(() => {
  localStorage.setItem('userCurrency', 'USD');
  datePrices = () => respond({ success: false, dateWisePrices: {}, lowestPrice: null, error: 'No prices available' });
  globalThis.fetch = vi.fn((url) => (String(url).includes('/flights/date-prices') ? datePrices() : respond({})));
});

describe('CustomFlightCalendar', () => {
  it('asks for real fares, for the passengers and cabin being searched', async () => {
    const selected = inDays(10);
    datePrices = () => respond({ success: true, dateWisePrices: { [selected]: 82.3 }, lowestPrice: 82.3, currency: 'USD' });

    renderCalendar({ selectedDate: selected, adults: 2, children: 1, travelClass: 'BUSINESS' });

    await waitFor(() => expect(screen.getByTestId('calendar-fare').textContent).toBe('$82.30'));
    expect(JSON.parse(datePriceCalls()[0][1].body)).toEqual({
      from: 'DEL', to: 'BOM', dates: stripDates(selected), adults: 2, children: 1, infants: 0, travelClass: 'BUSINESS',
    });
  });

  it('shows no price at all when no fare is known', async () => {
    const { container } = renderCalendar();

    await waitFor(() => expect(datePriceCalls()).toHaveLength(1));
    await waitFor(() => expect(container.querySelector('.animate-spin')).toBeNull());

    expect(screen.queryAllByTestId('calendar-fare')).toHaveLength(0);
    expect(container.textContent).not.toMatch(/₹/);
    expect(screen.queryByText(/cheapest|lowest fare/i)).toBeNull();
  });

  it('shows no price at all when the request fails', async () => {
    datePrices = () => Promise.reject(new TypeError('Failed to fetch'));
    const { container } = renderCalendar();

    await waitFor(() => expect(datePriceCalls()).toHaveLength(1));
    await waitFor(() => expect(container.querySelector('.animate-spin')).toBeNull());
    expect(screen.queryAllByTestId('calendar-fare')).toHaveLength(0);
  });

  it('marks the lowest of the real fares, and only when there are two to compare', async () => {
    datePrices = () => respond({
      success: true, dateWisePrices: { [inDays(11)]: 120, [inDays(12)]: 95.5 }, lowestPrice: 95.5, currency: 'USD',
    });
    renderCalendar();

    await waitFor(() => expect(screen.getAllByTestId('calendar-fare')).toHaveLength(2));
    const lowest = screen.getAllByTestId('calendar-fare').find((el) => el.textContent === '$95.50');
    expect(lowest.className).toMatch(/text-green-600/);
    expect(screen.getByText('Lowest fare shown')).toBeTruthy();
  });

  // One-way fares from the origin are not what a return date costs.
  it('prices nothing on the return-date calendar', async () => {
    renderCalendar({ showPrices: false });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(datePriceCalls()).toHaveLength(0);
  });

  it('has no invented or interpolated prices left in the source', () => {
    const source = readFileSync(
      path.resolve(process.cwd(), 'frontend/src/Pages/Common/flights/CustomFlightCalendar.jsx'),
      'utf8',
    );
    expect(source).not.toMatch(/estimatePrice/);
    expect(source).not.toMatch(/₹\{/);
    expect(source).not.toMatch(/getCheapestFlightDates/);
    expect(source).not.toMatch(/interpDate/);
  });
});
