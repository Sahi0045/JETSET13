import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FlightCard from '../../frontend/src/Pages/Common/flights/FlightCard.jsx';
import FlightFareOptions from '../../frontend/src/Pages/Common/flights/FlightFareOptions.jsx';

/**
 * What a result says about its price, its seats and its fares.
 */

const flight = (over = {}) => ({
  id: '1',
  airline: { code: 'LH', name: 'Lufthansa', logo: '' },
  departure: { time: '18:00', airport: 'JFK' },
  arrival: { time: '08:00', airport: 'FRA' },
  duration: 'PT8H',
  stops: 0,
  price: { amount: 400, total: '400.00', base: '300.00', currency: 'USD' },
  baggage: { checked: null, cabin: null },
  originalOffer: { id: '1', travelerPricings: [{ travelerType: 'ADULT' }, { travelerType: 'ADULT' }] },
  ...over,
});

beforeEach(() => {
  localStorage.setItem('userCurrency', 'USD');
});

describe('the result card', () => {
  // "No hidden fees" sat over a price that leaves out the service fee.
  it('says its price is before the service fee', () => {
    render(<FlightCard flight={flight()} onViewPrices={() => {}} />);
    expect(screen.getByText('for 2 travellers + service fee')).toBeTruthy();
  });

  // Amadeus caps the count at 9: "9 seats left", in red, on flights with room.
  it('reads a capped seat count as 9+', () => {
    render(<FlightCard flight={flight({ numberOfBookableSeats: 9 })} onViewPrices={() => {}} />);
    expect(screen.getByText('9+ seats').className).not.toMatch(/red/);
  });

  it('still warns when few seats are left', () => {
    render(<FlightCard flight={flight({ numberOfBookableSeats: 2 })} onViewPrices={() => {}} />);
    expect(screen.getByText('2 seats left').className).toMatch(/text-red-600/);
  });
});

describe('the fare options', () => {
  const withUpsell = (data) => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data }) }));
  };

  // The only fare there was, labelled CHEAPEST.
  it('calls no fare the cheapest when it is the only one', async () => {
    withUpsell([]);
    render(<FlightFareOptions flight={flight()} onClose={() => {}} onSelect={() => {}} />);

    await screen.findByRole('button', { name: 'BOOK' });
    expect(screen.queryByText('CHEAPEST')).toBeNull();
  });

  it('marks the cheapest of several', async () => {
    withUpsell([{ id: '2', price: { amount: 520, total: '520.00', currency: 'USD' }, brandedFareLabel: 'Flex', originalOffer: { id: '2' } }]);
    render(<FlightFareOptions flight={flight()} onClose={() => {}} onSelect={() => {}} />);

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'BOOK' })).toHaveLength(2));
    expect(screen.getByText('CHEAPEST')).toBeTruthy();
  });
});
