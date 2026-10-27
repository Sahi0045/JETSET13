import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FlightSearchForm from '../../frontend/src/Pages/Common/flights/flight-search-form.jsx';
import { buildSearchPayload } from '../../frontend/src/Pages/Common/flights/searchQuery.js';

const inDays = (days) => {
  const date = new Date(Date.now() + days * 864e5);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const legs = () => [
  { from: 'New Delhi (DEL)', fromCode: 'DEL', to: 'Dubai (DXB)', toCode: 'DXB', departDate: inDays(30) },
  { from: 'Dubai (DXB)', fromCode: 'DXB', to: 'London (LHR)', toCode: 'LHR', departDate: inDays(34) },
];

const renderForm = (props = {}) => render(
  <MemoryRouter>
    <FlightSearchForm onSearch={() => {}} {...props} />
  </MemoryRouter>,
);

beforeEach(() => {
  localStorage.setItem('userCurrency', 'USD');
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }));
});

describe('the multi-city search form', () => {
  it('turns a one-way search into two flights, the second leaving from where the first lands', () => {
    renderForm({ initialData: { ...legs()[0], tripType: 'oneWay', returnDate: '' } });

    fireEvent.click(screen.getByRole('button', { name: 'Multi City' }));

    expect(screen.getByLabelText('Flight 1 from').value).toBe('New Delhi (DEL)');
    expect(screen.getByLabelText('Flight 1 to').value).toBe('Dubai (DXB)');
    expect(screen.getByLabelText('Flight 2 from').value).toBe('Dubai (DXB)');
    expect(screen.getByLabelText('Flight 2 to').value).toBe('');
    expect(screen.queryByRole('button', { name: 'Select return date' })).toBeNull();
  });

  it('adds flights up to six, each leaving from the last one landed, and removes them down to two', () => {
    renderForm({ initialData: { tripType: 'multiCity', legs: legs() } });

    fireEvent.click(screen.getByRole('button', { name: 'Add another flight' }));
    expect(screen.getByLabelText('Flight 3 from').value).toBe('London (LHR)');

    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Add another flight' }));
    expect(screen.getByLabelText('Flight 6 from')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add another flight' })).toBeNull();

    for (let i = 6; i > 2; i -= 1) fireEvent.click(screen.getByRole('button', { name: `Remove flight ${i}` }));
    expect(screen.queryByLabelText('Flight 3 from')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove flight 2' })).toBeNull();
  });

  it('searches with every flight', () => {
    const onSearch = vi.fn();
    renderForm({ onSearch, initialData: { tripType: 'multiCity', legs: legs(), adults: 2 } });

    fireEvent.click(screen.getByRole('button', { name: 'Search flights' }));

    const searched = onSearch.mock.calls[0][0];
    expect(searched.tripType).toBe('multiCity');
    expect(buildSearchPayload(searched).legs).toEqual([
      { from: 'DEL', to: 'DXB', departDate: inDays(30) },
      { from: 'DXB', to: 'LHR', departDate: inDays(34) },
    ]);
    expect(buildSearchPayload(searched).adults).toBe(2);
  });

  it("keeps a flight's calendar open on a double click", () => {
    renderForm({ initialData: { tripType: 'multiCity', legs: legs() } });
    const field = screen.getByRole('button', { name: 'Select date of flight 2' });

    fireEvent.click(field, { detail: 1 });
    fireEvent.click(field, { detail: 2 });

    expect(screen.getByRole('dialog', { name: 'Choose a date' })).toBeTruthy();
  });

  it('a date picked on a flight is kept for that flight only', () => {
    const { container } = renderForm({ initialData: { tripType: 'multiCity', legs: [legs()[0], { ...legs()[1], departDate: '' }] } });

    fireEvent.click(screen.getByRole('button', { name: 'Select date of flight 2' }));
    fireEvent.click(container.querySelector(`[data-date="${inDays(34)}"]`));

    expect(screen.getByRole('button', { name: 'Select date of flight 2' }).textContent).toMatch(new RegExp(inDays(34).slice(8, 10)));
  });

  it('refuses a flight that leaves before the one before it', () => {
    const onSearch = vi.fn();
    const [first, second] = legs();
    renderForm({ onSearch, initialData: { tripType: 'multiCity', legs: [first, { ...second, departDate: inDays(20) }] } });

    fireEvent.click(screen.getByRole('button', { name: 'Search flights' }));

    expect(onSearch).not.toHaveBeenCalled();
    expect(screen.getByText('Flight 2 leaves before flight 1.')).toBeTruthy();
  });

  it('refuses a flight with no destination', () => {
    const onSearch = vi.fn();
    const [first, second] = legs();
    renderForm({ onSearch, initialData: { tripType: 'multiCity', legs: [first, { ...second, to: '', toCode: undefined }] } });

    fireEvent.click(screen.getByRole('button', { name: 'Search flights' }));

    expect(onSearch).not.toHaveBeenCalled();
    expect(screen.getByText('Please enter where flight 2 goes')).toBeTruthy();
  });

  it("fills the next flight's start with where this one lands, until it is typed over", () => {
    renderForm({ initialData: { tripType: 'multiCity', legs: [{ from: 'DEL', to: '', departDate: inDays(30) }, { from: '', to: 'LHR', departDate: inDays(34) }] } });

    fireEvent.change(screen.getByLabelText('Flight 1 to'), { target: { value: 'DXB' } });
    expect(screen.getByLabelText('Flight 2 from').value).toBe('DXB');

    fireEvent.change(screen.getByLabelText('Flight 2 from'), { target: { value: 'BOM' } });
    fireEvent.change(screen.getByLabelText('Flight 1 to'), { target: { value: 'DOH' } });
    expect(screen.getByLabelText('Flight 2 from').value).toBe('BOM');
  });

  it("opens a later flight's calendar at the month it can start in", () => {
    const { container } = renderForm({ initialData: { tripType: 'multiCity', legs: [{ ...legs()[0], departDate: inDays(80) }, { ...legs()[1], departDate: '' }] } });

    fireEvent.click(screen.getByRole('button', { name: 'Select date of flight 2' }));

    expect(container.querySelector(`[data-date="${inDays(82)}"]`)).toBeTruthy();
  });

  it('says how many flights the trip has', () => {
    renderForm({ initialData: { tripType: 'multiCity', legs: legs() } });

    expect(screen.getByText(/Multi-city · 2 flights/)).toBeTruthy();
  });
});
