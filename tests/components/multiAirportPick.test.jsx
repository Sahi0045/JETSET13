import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FlightSearchForm from '../../frontend/src/Pages/Common/flights/flight-search-form.jsx';
import { clearCache } from '../../frontend/src/Services/AirportService.js';
import { buildSearchPayload, searchFromQuery, searchToQuery } from '../../frontend/src/Pages/Common/flights/searchQuery.js';

/**
 * Ticking several airports for one side of a search, as on booking.com
 * (28 Oct): the search then covers all of them.
 */

const reply = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const airport = (code, name, cityName, parent) => ({ code, type: 'AIRPORT', name, cityName, countryCode: 'US', ...(parent ? { parent } : {}) });
const NEW_YORK = [
  { code: 'NYC', type: 'CITY', name: 'New York', cityName: 'New York', countryCode: 'US' },
  airport('JFK', 'John F. Kennedy International Airport', 'New York', 'NYC'),
  airport('EWR', 'Newark Liberty International Airport', 'Newark', 'NYC'),
  airport('LGA', 'LaGuardia Airport', 'New York', 'NYC'),
];

beforeEach(() => {
  localStorage.setItem('userCurrency', 'USD');
  clearCache();
  globalThis.fetch = vi.fn((url, init) => (String(url).includes('/airports/search') && JSON.parse(init.body).keyword === 'new york'
    ? reply({ success: true, data: NEW_YORK })
    : reply({ success: true, data: [airport('EWR', 'Newark Liberty International Airport', 'Newark')] })));
});
afterEach(() => vi.useRealTimers());

const renderForm = (props = {}) => render(<MemoryRouter><FlightSearchForm onSearch={() => {}} {...props} /></MemoryRouter>);

async function openList(name = 'from', text = 'new york') {
  vi.useFakeTimers();
  const input = document.querySelector(`input[name="${name}"]`);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: text } });
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  return input;
}

const tick = (code) => fireEvent.mouseDown(screen.getByRole('checkbox', { name: `Search ${code} too` }));

describe('ticking airports', () => {
  it('searches the ticked airports together once Done is pressed', async () => {
    renderForm();
    const input = await openList();

    tick('JFK');
    tick('EWR');
    expect(screen.getByLabelText('Airports to search').textContent).toBe('JFKEWR');
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Done' }));

    expect(input.value).toBe('JFK, EWR');
    expect(screen.getByText('2 airports, United States')).toBeTruthy();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('adds a pressed row to what is ticked, instead of picking it alone', async () => {
    renderForm();
    const input = await openList();

    tick('JFK');
    fireEvent.mouseDown(screen.getAllByRole('option').find((row) => row.textContent.startsWith('LGA')));
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Done' }));

    expect(input.value).toBe('JFK, LGA');
  });

  it('picks a pressed row alone when nothing is ticked', async () => {
    renderForm();
    const input = await openList();

    fireEvent.mouseDown(screen.getAllByRole('option').find((row) => row.textContent.startsWith('JFK')));

    expect(input.value).toBe('John F. Kennedy (JFK)');
  });

  it('keeps what was ticked when the box is left', async () => {
    renderForm();
    const input = await openList();

    tick('JFK');
    tick('EWR');
    fireEvent.blur(input);

    expect(input.value).toBe('JFK, EWR');
  });

  it('takes a ticked airport off again', async () => {
    renderForm();
    const input = await openList();

    tick('JFK');
    tick('EWR');
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Remove JFK' }));
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Done' }));

    expect(input.value).toBe('Newark Liberty (EWR)');
  });

  it('will not search the same airport at both ends', async () => {
    renderForm();
    await openList('from');
    tick('JFK');
    tick('EWR');
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Done' }));
    const to = await openList('to', 'newark');
    fireEvent.mouseDown(screen.getAllByRole('option')[0]);
    expect(to.value).toBe('Newark (EWR)');

    fireEvent.click(screen.getByRole('button', { name: /search flights/i }));

    expect(screen.getByText('Leaving from and going to name the same airport')).toBeTruthy();
  });

  it('offers no ticks in a multi-city box', async () => {
    render(
      <MemoryRouter>
        <FlightSearchForm onSearch={() => {}} initialData={{ tripType: 'multiCity', legs: [{ from: '', to: '', departDate: '' }, { from: '', to: '', departDate: '' }] }} />
      </MemoryRouter>,
    );
    vi.useFakeTimers();
    const input = screen.getByLabelText('Flight 1 from');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'new york' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });
});

describe('on a phone', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn((query) => ({ matches: query.includes('max-width'), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
  });
  afterEach(() => { delete window.matchMedia; });

  it('applies the ticked airports from the search page', async () => {
    renderForm();
    vi.useFakeTimers();
    const box = document.querySelector('input[name="from"]');
    fireEvent.focus(box);
    const page = screen.getByRole('dialog', { name: 'Leaving from' });
    fireEvent.change(within(page).getByLabelText('Airport or city'), { target: { value: 'new york' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    tick('JFK');
    tick('LGA');
    fireEvent.mouseDown(within(page).getByRole('button', { name: 'Apply' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(box.value).toBe('JFK, LGA');
  });
});

describe('the results header for several airports', () => {
  it('names the airports and how many', async () => {
    const { default: FlightModifyBar } = await import('../../frontend/src/Pages/Common/flights/FlightModifyBar.jsx');
    render(<MemoryRouter><FlightModifyBar searchParams={{ from: 'JFK,EWR', to: 'LAX', departDate: '2026-12-10', adults: 1 }} cityMap={{ LAX: 'Los Angeles' }} /></MemoryRouter>);

    expect(screen.getByText('JFK, EWR')).toBeTruthy();
    expect(screen.getByText('2 airports')).toBeTruthy();
  });
});

describe('the search for several airports', () => {
  const search = { from: 'JFK, EWR', fromCode: 'JFK,EWR', to: 'Los Angeles (LAX)', toCode: 'LAX', departDate: '2026-12-10', adults: 1 };

  it('sends them as one list', () => {
    expect(buildSearchPayload(search)).toMatchObject({ from: 'JFK,EWR', to: 'LAX' });
  });

  it('keeps them through the link to the results', () => {
    const back = searchFromQuery(searchToQuery(search));
    expect(buildSearchPayload(back)).toMatchObject({ from: 'JFK,EWR', to: 'LAX', departDate: '2026-12-10' });
  });
});
