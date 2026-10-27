import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FlightFilterSidebar from '../../frontend/src/Pages/Common/flights/FlightFilterSidebar.jsx';
import FlightAppliedFilters from '../../frontend/src/Pages/Common/flights/FlightAppliedFilters.jsx';
import { filtersWithin, matchesFilters } from '../../frontend/src/Pages/Common/flights/searchResults.js';

/**
 * The filter column beside the results, laid out like the comparison sites:
 * sections that open and close, stops as tick boxes with a "from" price, and
 * sliders for times and lengths. The tags above the results name the same
 * choices, and a cleared tag puts the column back.
 */

beforeEach(() => { localStorage.setItem('userCurrency', 'USD'); });
afterEach(cleanup);

const bounds = { min: 0, max: 1000 };
const stopsStats = [
  { value: 0, count: 4, minPrice: 106 },
  { value: 1, count: 9, minPrice: 131 },
  { value: 2, count: 0, minPrice: null },
];

const renderColumn = (filters = filtersWithin(bounds), props = {}) => {
  const onFilterChange = vi.fn();
  const onResetAll = vi.fn();
  render(
    <FlightFilterSidebar
      filters={filters}
      priceRangeBounds={bounds}
      airlines={['Air India', 'IndiGo']}
      airlineStats={new Map([['Air India', { count: 3, minPrice: 233 }], ['IndiGo', { count: 5, minPrice: 106 }]])}
      airportStats={{ origins: [], dests: [] }}
      stopsStats={stopsStats}
      journeyRange={{ min: 140, max: 660 }}
      layoverRange={{ min: 70, max: 315 }}
      onFilterChange={onFilterChange}
      onToggleAirline={() => {}}
      onToggleAirport={() => {}}
      onResetAll={onResetAll}
      {...props}
    />,
  );
  return { onFilterChange, onResetAll };
};

const lastCall = (fn) => fn.mock.calls.at(-1);

describe('the stops boxes', () => {
  it('say what each keeps and the cheapest fare it keeps', () => {
    renderColumn();
    const direct = screen.getByLabelText('Direct').closest('label');
    expect(within(direct).getByText(/from/).textContent).toContain('106');
    const twoPlus = screen.getByLabelText('2+ stops');
    expect(twoPlus.disabled).toBe(true);
    expect(within(twoPlus.closest('label')).getByText('None')).toBeTruthy();
  });

  it('add and remove a stop count, and the list keeps exactly those', () => {
    const { onFilterChange } = renderColumn();
    fireEvent.click(screen.getByLabelText('Direct'));
    expect(lastCall(onFilterChange)).toEqual(['stops', [0]]);

    cleanup();
    const { onFilterChange: next } = renderColumn({ ...filtersWithin(bounds), stops: [0] });
    fireEvent.click(screen.getByLabelText('1 stop'));
    expect(lastCall(next)).toEqual(['stops', [0, 1]]);
    fireEvent.click(screen.getByLabelText('Direct'));
    expect(lastCall(next)).toEqual(['stops', []]);

    const kept = [0, 1, 2].map((stops) => matchesFilters(
      { price: { amount: 100 }, stops, departure: {}, arrival: {}, airline: {} },
      { ...filtersWithin(bounds), stops: [0, 1] },
      (f) => f.price.amount,
    ));
    expect(kept).toEqual([true, true, false]);
  });
});

describe('the sliders', () => {
  it('shows a return departure range only on a round trip', () => {
    renderColumn();
    expect(screen.getByLabelText('Outbound: earliest departure')).toBeTruthy();
    expect(screen.queryByLabelText('Return: earliest departure')).toBeNull();
    cleanup();
    renderColumn(filtersWithin(bounds), { isRoundTrip: true });
    expect(screen.getByLabelText('Return: latest departure')).toBeTruthy();
  });

  it('moves the departure range in quarter hours', () => {
    const { onFilterChange } = renderColumn();
    fireEvent.change(screen.getByLabelText('Outbound: earliest departure'), { target: { value: '367' } });
    expect(lastCall(onFilterChange)).toEqual(['outboundTimes', [360, 1439]]);
  });

  it('sets a longest journey, and none at the far end', () => {
    const { onFilterChange } = renderColumn();
    fireEvent.change(screen.getByLabelText('Longest journey'), { target: { value: '300' } });
    expect(lastCall(onFilterChange)).toEqual(['maxJourney', 300]);

    cleanup();
    const { onFilterChange: next } = renderColumn({ ...filtersWithin(bounds), maxJourney: 300 });
    const slider = screen.getByLabelText('Longest journey');
    fireEvent.change(slider, { target: { value: slider.max } });
    expect(lastCall(next)).toEqual(['maxJourney', null]);
  });

  it('leaves out the layover slider when nothing connects', () => {
    renderColumn(filtersWithin(bounds), { layoverRange: null });
    expect(screen.queryByLabelText('Longest layover')).toBeNull();
  });
});

describe('the rest of the column', () => {
  // Beside this 280 px column a card had about 680 px from 1024 px up, and its
  // fare and Select flight ran out past its right edge (jetsetterss.com,
  // 27 Oct). Below 1280 px the filters open from the Filters button instead.
  it('stands beside the results only from 1280 px up', () => {
    renderColumn();
    const column = screen.getByRole('complementary', { name: 'Filters' }).className.split(/\s+/);

    expect(column).toEqual(expect.arrayContaining(['hidden', 'xl:block']));
    expect(column).not.toContain('lg:block');
  });

  it('turns refundable-only on and off', () => {
    const { onFilterChange } = renderColumn();
    fireEvent.click(screen.getByRole('switch'));
    expect(lastCall(onFilterChange)).toEqual(['refundable', 'yes']);
  });

  it('clears every airline at once', () => {
    const { onFilterChange } = renderColumn({ ...filtersWithin(bounds), airlines: ['IndiGo'] });
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(lastCall(onFilterChange)).toEqual(['airlines', []]);
  });

  it('resets everything from the top, and leaves that to the phone panel\'s own header', () => {
    const { onResetAll } = renderColumn();
    fireEvent.click(screen.getByRole('button', { name: 'Reset all' }));
    expect(onResetAll).toHaveBeenCalled();
    cleanup();
    renderColumn(filtersWithin(bounds), { variant: 'mobile' });
    expect(screen.queryByRole('button', { name: 'Reset all' })).toBeNull();
  });

  it('closes and opens a section', () => {
    renderColumn();
    const header = screen.getByRole('button', { name: 'Stops' });
    fireEvent.click(header);
    expect(screen.queryByLabelText('Direct')).toBeNull();
    fireEvent.click(header);
    expect(screen.getByLabelText('Direct')).toBeTruthy();
  });
});

describe('the tags above the results', () => {
  const renderTags = (filters) => {
    const onFilterChange = vi.fn();
    render(
      <FlightAppliedFilters
        filters={filters}
        priceRangeBounds={bounds}
        onFilterChange={onFilterChange}
        onToggleAirline={() => {}}
        onToggleAirport={() => {}}
        onResetAll={() => {}}
      />,
    );
    return onFilterChange;
  };

  it('name the same stop boxes the column does, one tag each', () => {
    const onFilterChange = renderTags({ ...filtersWithin(bounds), stops: [0, 2] });
    expect(screen.getByRole('button', { name: 'Direct' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '2+ stops' }));
    expect(lastCall(onFilterChange)).toEqual(['stops', [0]]);
  });

  it('show a narrowed departure range and clear it back to the whole day', () => {
    const onFilterChange = renderTags({ ...filtersWithin(bounds), outboundTimes: [360, 720] });
    fireEvent.click(screen.getByRole('button', { name: 'Departs 06:00–12:00' }));
    expect(lastCall(onFilterChange)).toEqual(['outboundTimes', [0, 1439]]);
  });

  it('show nothing when nothing is narrowed', () => {
    renderTags(filtersWithin(bounds));
    expect(screen.queryByText('Applied:')).toBeNull();
  });
});
