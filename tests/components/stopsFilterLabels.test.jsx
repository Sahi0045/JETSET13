import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FlightFilterBar from '../../frontend/src/Pages/Common/flights/FlightFilterBar.jsx';
import FlightFilterSidebar from '../../frontend/src/Pages/Common/flights/FlightFilterSidebar.jsx';
import FlightAppliedFilters from '../../frontend/src/Pages/Common/flights/FlightAppliedFilters.jsx';
import { filtersWithin, matchesFilters } from '../../frontend/src/Pages/Common/flights/searchResults.js';

/**
 * The stops filter, as the desktop bar, the phone drawer and the chip under
 * the bar name it.
 *
 * The desktop bar offered "Up to 2 stops", but the value it sends ('2') keeps
 * only flights with two stops or more (searchResults.js matchesFilters). Picking
 * it hid every non-stop and one-stop flight - often "No flights found" - while
 * the chip under the bar read "2+ stops". The drawer called the same '2' "2+
 * Stops", and its "1 Stop" kept non-stop flights too. Each option now says
 * what it keeps; what it keeps is unchanged.
 */

beforeEach(() => { localStorage.setItem('userCurrency', 'USD'); });

const flight = (stops) => ({
  price: { amount: 400, total: '400.00', currency: 'USD' },
  stops,
  departure: { time: '10:00', airport: 'JFK' },
  arrival: { time: '22:00', airport: 'LHR' },
  airline: { name: 'British Airways' },
  baggage: { checked: null },
  refundable: null,
});

const bounds = { min: 0, max: 1000 };
const priceOf = (f) => f.price.amount;
// What the page keeps for a stops value (flightsearchpage.jsx filteredFlights).
const kept = (stops) => [0, 1, 2, 3].map((s) => matchesFilters(flight(s), { ...filtersWithin(bounds), stops }, priceOf));

const renderBar = (filters, onFilterChange = vi.fn()) => render(
  <FlightFilterBar
    filters={filters}
    priceRangeBounds={bounds}
    airlines={[]}
    airlineStats={new Map()}
    onFilterChange={onFilterChange}
    onToggleAirline={() => {}}
    onResetAll={() => {}}
    resultCount={3}
  />,
);

const renderDrawer = (filters, onFilterChange = vi.fn()) => render(
  <FlightFilterSidebar
    filters={filters}
    priceRangeBounds={bounds}
    airlines={[]}
    airlineStats={new Map()}
    airportStats={{ origins: [], dests: [] }}
    onFilterChange={onFilterChange}
    onToggleAirline={() => {}}
    onToggleAirport={() => {}}
    onResetAll={() => {}}
    variant="mobile"
  />,
);

// Starts from another choice, so picking the option is a change.
const chosenOnBar = (label, from = 'any') => {
  const onFilterChange = vi.fn();
  renderBar({ ...filtersWithin(bounds), stops: from }, onFilterChange);
  fireEvent.click(screen.getAllByRole('button', { expanded: false })[0]);
  fireEvent.click(screen.getByLabelText(label));
  return onFilterChange.mock.calls.at(-1)[1];
};

describe('the desktop stops options', () => {
  it('names the two-or-more option for what it keeps, and the pill and chip agree', () => {
    const chosen = chosenOnBar('2+ stops');
    expect(screen.queryByLabelText('Up to 2 stops')).toBeNull();
    expect(chosen).toBe('2');
    // The filter itself is unchanged: two or more stops only.
    expect(kept(chosen)).toEqual([false, false, true, true]);

    cleanup();
    const filters = { ...filtersWithin(bounds), stops: chosen };
    renderBar(filters);
    expect(screen.getByRole('button', { name: '2+ stops' })).toBeTruthy();
    cleanup();
    render(<FlightAppliedFilters filters={filters} priceRangeBounds={bounds} onFilterChange={() => {}} onToggleAirline={() => {}} onResetAll={() => {}} />);
    expect(screen.getByText('2+ stops')).toBeTruthy();
  });

  it('keeps "Non-stop only" as it was', () => {
    expect(kept(chosenOnBar('Non-stop only'))).toEqual([true, false, false, false]);
  });

  it('keeps "Up to 1 stop" as it was', () => {
    expect(kept(chosenOnBar('Up to 1 stop'))).toEqual([true, true, false, false]);
  });

  it('keeps "Any number of stops" as it was', () => {
    expect(kept(chosenOnBar('Any number of stops', '2'))).toEqual([true, true, true, true]);
  });
});

describe('the phone drawer stops options', () => {
  it('calls the one-stop option "Up to 1 stop", as it keeps non-stop flights too', () => {
    const onFilterChange = vi.fn();
    renderDrawer(filtersWithin(bounds), onFilterChange);
    expect(screen.queryByRole('button', { name: '1 Stop' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Up to 1 stop' }));
    const chosen = onFilterChange.mock.calls.at(-1)[1];
    expect(chosen).toBe('1');
    expect(kept(chosen)).toEqual([true, true, false, false]);
  });

  it('keeps its two-or-more option as it was', () => {
    const onFilterChange = vi.fn();
    renderDrawer(filtersWithin(bounds), onFilterChange);
    fireEvent.click(screen.getByRole('button', { name: /2\+ stops/i }));
    const chosen = onFilterChange.mock.calls.at(-1)[1];
    expect(chosen).toBe('2');
    expect(kept(chosen)).toEqual([false, false, true, true]);
  });
});
