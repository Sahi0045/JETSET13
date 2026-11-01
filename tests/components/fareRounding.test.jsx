import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Price from '../../frontend/src/Components/Price.jsx';
import currencyService from '../../frontend/src/Services/CurrencyService.js';
import FlightCard from '../../frontend/src/Pages/Common/flights/FlightCard.jsx';
import { cheapestDays } from '../../frontend/src/Pages/Common/flights/searchResults.js';

/**
 * Fares are in dollars and shown in rupees, each figure converted and rounded
 * on its own. Live on 29 Oct: "₹9,530 per person, ₹19,059 for 2 travellers",
 * a rupee short of 2 x ₹9,530; and the date strip marked Mon 2 Nov "Cheapest"
 * beside the searched Wed 4 Nov at the same ₹9,530, cents dearer in dollars.
 */

const rupees = (text) => Number(String(text).replace(/[^0-9]/g, ''));

const twoAdults = (each, base) => ({
  id: '1',
  airline: { code: 'LH', name: 'Lufthansa', logo: '' },
  departure: { time: '18:00', airport: 'JFK' },
  arrival: { time: '08:00', airport: 'FRA' },
  duration: 'PT8H',
  stops: 0,
  price: { amount: 2 * each, total: (2 * each).toFixed(2), base: (2 * base).toFixed(2), currency: 'USD' },
  baggage: { checked: null, cabin: null },
  originalOffer: {
    price: { total: (2 * each).toFixed(2) },
    travelerPricings: [1, 2].map(() => ({ travelerType: 'ADULT', price: { total: each.toFixed(2), base: base.toFixed(2) } })),
  },
});

beforeEach(() => {
  localStorage.setItem('userCurrency', 'INR');
});

afterEach(() => {
  localStorage.setItem('userCurrency', 'USD');
});

describe('the total for two travellers in rupees', () => {
  it('is exactly twice the fare per person', () => {
    // $100.02 is ₹8,336.67, shown ₹8,337; $200.04 converted on its own is ₹16,673.
    expect(currencyService.convertAndFormat(200.04, 'INR')).toBe('₹16,673');
    const { container } = render(<FlightCard flight={twoAdults(100.02, 80)} onViewPrices={() => {}} />);

    expect(container.querySelector('.text-\\[26px\\]').textContent).toBe('₹8,337');
    expect(container.textContent).toContain('₹16,674 for 2 travellers');
  });

  it('adds up in the fare breakup: base fare and taxes make the total', () => {
    render(<FlightCard flight={twoAdults(100.02, 80)} onViewPrices={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /fare breakup/i }));

    const row = (label) => rupees(screen.getByText(label).parentElement.lastChild.textContent);
    expect(row('Base fare') + row('Taxes & fees')).toBe(16674);
    expect(rupees(screen.getByText(/^Total/).parentElement.lastChild.textContent)).toBe(16674);
  });

  it('is what <Price> shows for a list of parts, taking a negative count away', () => {
    const { container } = render(
      <Price amount={[{ amount: 100.02, currency: 'USD', times: 2 }, { amount: 80, currency: 'USD', times: -2 }]} />,
    );
    expect(container.textContent).toBe(`₹${(16674 - 13336).toLocaleString('en-US')}`);
  });
});

describe('the cheapest days on the strip', () => {
  const day = (isoDate, price, selected = false) => ({ isoDate, price, currency: 'USD', selected });
  const shown = (currency) => (d) => currencyService.displayAmount(d.price, d.currency, currency);
  const week = [day('wed', 109.83, true), day('mon', 109.82), day('fri', 130)];

  it('are every day showing the lowest fare, the searched day too', () => {
    expect(currencyService.displayAmount(109.82, 'USD', 'INR')).toBe(currencyService.displayAmount(109.83, 'USD', 'INR'));
    expect(cheapestDays(week, shown('INR'))).toEqual(new Set(['wed', 'mon']));
  });

  it('are the one day when the cents show', () => {
    expect(cheapestDays(week, shown('USD'))).toEqual(new Set(['mon']));
  });

  it('are none when every priced day shows the same fare, or only one is priced', () => {
    expect(cheapestDays([day('a', 100), day('b', 100), day('c', null)], shown('USD')).size).toBe(0);
    expect(cheapestDays([day('a', 100), day('b', null)], shown('USD')).size).toBe(0);
  });
});
