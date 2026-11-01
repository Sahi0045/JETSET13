import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FlightSortTabs from '../../frontend/src/Pages/Common/flights/FlightSortTabs.jsx';

const flight = (id, amount) => ({ id, price: { amount, total: String(amount), currency: 'USD' }, duration: 'PT2H', stops: 0 });
const flights = [flight('a', 120), flight('b', 90)];
const sortList = () => screen.getAllByRole('combobox')[0];

beforeEach(() => {
  localStorage.setItem('userCurrency', 'USD');
});

describe('the sort list on the results page', () => {
  it('offers price low to high next to high to low', () => {
    render(<FlightSortTabs flights={flights} sortOrder="recommended" onSortChange={() => {}} />);

    const labels = [...sortList().options].map((option) => option.textContent);
    expect(labels).toContain('Price – Low to High');
    expect(labels.indexOf('Price – Low to High')).toBe(labels.indexOf('Price – High to Low') - 1);
  });

  it('sorts by lowest fare when low to high is chosen', () => {
    const onSortChange = vi.fn();
    render(<FlightSortTabs flights={flights} sortOrder="recommended" onSortChange={onSortChange} />);

    fireEvent.change(sortList(), { target: { value: 'price' } });
    expect(onSortChange).toHaveBeenCalledWith('price');
  });

  it('shows low to high as chosen while the list is sorted by lowest fare', () => {
    render(<FlightSortTabs flights={flights} sortOrder="price" onSortChange={() => {}} />);

    expect(sortList().selectedOptions[0].textContent).toBe('Price – Low to High');
  });
});
