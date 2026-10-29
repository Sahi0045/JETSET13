import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import FlightCard from '../../frontend/src/Pages/Common/flights/FlightCard.jsx';
import FlightSortTabs from '../../frontend/src/Pages/Common/flights/FlightSortTabs.jsx';
import { sortFlights } from '../../frontend/src/Pages/Common/flights/flightSort.js';
import { farePerTraveller } from '../../shared/farePerTraveller.js';

/**
 * The results page showed the airline's total for every traveller: two adults
 * on DEL-HYD read "₹19,040 for 2 travellers + platform fee", which the owner
 * took for one ticket's price (29 Oct). Each price is now one traveller's,
 * with the total for all of them under it.
 */

const pricing = (travelerType, total) => ({ travelerType, price: { currency: 'USD', total } });
const offer = (total, ...pricings) => ({ id: '1', price: { total }, travelerPricings: pricings });

const flight = (originalOffer, id = '1') => ({
  id,
  airline: { code: 'LH', name: 'Lufthansa', logo: '' },
  departure: { time: '18:00', airport: 'JFK' },
  arrival: { time: '08:00', airport: 'FRA' },
  duration: 'PT8H',
  stops: 0,
  price: { amount: Number(originalOffer.price.total), total: originalOffer.price.total, base: '300.00', currency: 'USD' },
  baggage: { checked: null, cabin: null },
  originalOffer,
});

const headline = (container) => container.querySelector('.text-\\[26px\\]').textContent;

beforeEach(() => {
  localStorage.setItem('userCurrency', 'USD');
});

describe("one traveller's fare", () => {
  it("is each adult's own price when every traveller is an adult", () => {
    expect(farePerTraveller(offer('400.00', pricing('ADULT', '200.00'), pricing('ADULT', '200.00'))))
      .toEqual({ each: 200, unit: 'person', travellers: 2 });
  });

  it("is the adult's fare, not the total divided, when a child flies too", () => {
    expect(farePerTraveller(offer('500.00', pricing('ADULT', '200.00'), pricing('ADULT', '200.00'), pricing('CHILD', '100.00'))))
      .toEqual({ each: 200, unit: 'adult', travellers: 3 });
  });

  it('is unknown when the offer gives no traveller a price of their own', () => {
    expect(farePerTraveller(offer('400.00', { travelerType: 'ADULT' }, { travelerType: 'ADULT' })).each).toBeNull();
  });

  // The SOAP mapper puts the offer total on each traveller when Amadeus leaves
  // out their own amount.
  it('is unknown when each of two travellers carries the whole total', () => {
    expect(farePerTraveller(offer('400.00', pricing('ADULT', '400.00'), pricing('ADULT', '400.00'))).each).toBeNull();
  });

  it('is the whole fare for one traveller', () => {
    expect(farePerTraveller(offer('200.00', pricing('ADULT', '200.00'))))
      .toEqual({ each: 200, unit: 'person', travellers: 1 });
  });
});

describe('the result card', () => {
  it('shows the fare per person, and the total for both travellers under it', () => {
    const { container } = render(<FlightCard flight={flight(offer('400.00', pricing('ADULT', '200.00'), pricing('ADULT', '200.00')))} onViewPrices={() => {}} />);

    expect(headline(container)).toMatch(/^\$200(\.00)?$/);
    expect(screen.getByText('per person')).toBeTruthy();
    expect(container.textContent).toMatch(/\$400(\.00)? for 2 travellers/);
    expect(container.textContent).not.toContain('platform fee');
  });

  it("says the fare is an adult's when a child flies too", () => {
    const { container } = render(<FlightCard flight={flight(offer('500.00', pricing('ADULT', '200.00'), pricing('ADULT', '200.00'), pricing('CHILD', '100.00')))} onViewPrices={() => {}} />);

    expect(headline(container)).toMatch(/^\$200(\.00)?$/);
    expect(screen.getByText('per adult')).toBeTruthy();
    expect(container.textContent).toMatch(/\$500(\.00)? for 3 travellers/);
  });

  it("lists each traveller type's fare in the breakup, and says the platform fee comes at checkout", () => {
    const { container } = render(<FlightCard flight={flight(offer('500.00', pricing('ADULT', '200.00'), pricing('ADULT', '200.00'), pricing('CHILD', '100.00')))} onViewPrices={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /fare breakup/i }));

    expect(screen.getByText('Adult × 2')).toBeTruthy();
    expect(screen.getByText('Child × 1')).toBeTruthy();
    expect(container.textContent).toContain('Total (3 travellers)');
    expect(container.textContent).toContain('Platform fee shown at checkout');
  });

  it('shows the total, and says so, when no traveller has a price of their own', () => {
    const { container } = render(<FlightCard flight={flight(offer('400.00', { travelerType: 'ADULT' }, { travelerType: 'ADULT' }))} onViewPrices={() => {}} />);

    expect(headline(container)).toMatch(/^\$400(\.00)?$/);
    expect(screen.getByText('total for 2 travellers')).toBeTruthy();
  });

  it('shows no total line for one traveller', () => {
    const { container } = render(<FlightCard flight={flight(offer('200.00', pricing('ADULT', '200.00')))} onViewPrices={() => {}} />);

    expect(screen.getByText('per person')).toBeTruthy();
    expect(container.textContent).not.toMatch(/for 1 traveller/);
  });
});

describe('the sort tabs', () => {
  it("quote one traveller's fare", () => {
    const { container } = render(
      <FlightSortTabs flights={[flight(offer('400.00', pricing('ADULT', '200.00'), pricing('ADULT', '200.00')))]} sortOrder="price" onSortChange={() => {}} />,
    );

    const cheapest = container.querySelector('button');
    expect(cheapest.textContent).toMatch(/\$200(\.00)?/);
    expect(cheapest.textContent).not.toMatch(/\$400/);
  });
});

describe('sorting by price', () => {
  // The list is read by the fares it shows. With a child on board the cheaper
  // total can carry the dearer adult fare.
  it("orders by the fare each card shows, not by the total", () => {
    const cheaperTotal = flight(offer('480.00', pricing('ADULT', '210.00'), pricing('ADULT', '210.00'), pricing('CHILD', '60.00')), 'adult-210');
    const cheaperAdult = flight(offer('500.00', pricing('ADULT', '200.00'), pricing('ADULT', '200.00'), pricing('CHILD', '100.00')), 'adult-200');

    expect(sortFlights([cheaperTotal, cheaperAdult], 'price').map((f) => f.id)).toEqual(['adult-200', 'adult-210']);
  });
});
