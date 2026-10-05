import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FlightFareOptions from '../../frontend/src/Pages/Common/flights/FlightFareOptions.jsx';

/**
 * The airline's fare families in "Choose your fare".
 *
 * The search priced LH4462 at 2375.79 and the upsell priced the same fare -
 * same class, same fare basis - as Economy Light at 2362.69 (PDT, 5 Oct 2026).
 * Kept apart by price, the one fare showed twice: once as "This fare" and once
 * under its family name.
 */

const flight = (over = {}) => ({
  id: '1',
  airline: { code: 'LH', name: 'Lufthansa', logo: '' },
  departure: { time: '10:15', airport: 'FRA' },
  arrival: { time: '13:10', airport: 'JFK' },
  stops: 0,
  price: { amount: 2375.79, total: '2375.79', currency: 'USD' },
  baggage: { checked: null, cabin: null },
  fareBasis: 'BLOXKXBQ',
  bookingClass: 'B',
  originalOffer: { id: '1', travelerPricings: [{ travelerType: 'ADULT' }] },
  ...over,
});

const family = (name, label, amount, fareBasis, bookingClass = 'B') => ({
  id: `1-${name}`,
  price: { amount, total: amount.toFixed(2), currency: 'USD' },
  brandedFare: name,
  brandedFareLabel: label,
  fareBasis,
  bookingClass,
  amenities: [{ description: '1 CHECKED BAG UP TO 23KG', isChargeable: false }],
  originalOffer: { id: `1-${name}` },
});

const upsell = (data) => {
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data }) }));
};

beforeEach(() => {
  localStorage.setItem('userCurrency', 'USD');
});

describe('the fare families', () => {
  it('show the clicked fare once, under its family name', async () => {
    upsell([family('ECOLIGHT', 'ECONOMY LIGHT', 2362.69, 'BLOXKXBQ'), family('ECOFLEX', 'ECONOMY FLEX', 2720.69, 'BLOXKMFF')]);
    render(<FlightFareOptions flight={flight()} onClose={() => {}} onSelect={() => {}} />);

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'BOOK' })).toHaveLength(2));
    expect(screen.getByText('Economy Light')).toBeTruthy();
    expect(screen.getByText('Economy Flex')).toBeTruthy();
    expect(screen.queryByText(/^this fare$/i)).toBeNull();
  });

  // Lufthansa's Economy Light includes a cabin bag and no checked bag. Read as
  // "any BAG", the card said both "No checked bag" and "Checked baggage".
  it('never call a cabin bag checked baggage, and name each perk once', async () => {
    const light = {
      ...family('ECOLIGHT', 'ECONOMY LIGHT', 2362.69, 'BLOXKXBQ'),
      baggageDetails: { checked: { quantity: 0 }, cabin: { weight: 8, weightUnit: 'KG' } },
      amenities: [
        { description: 'PERSONAL ITEM', isChargeable: false },
        { description: '1 CABIN BAG UP TO 8KG', isChargeable: false },
        { description: 'CHANGE BEFORE DEPARTURE', isChargeable: false },
        { description: 'CHANGE AFTER DEPARTURE', isChargeable: false },
        { description: 'MILEAGE ACCRUAL', isChargeable: false },
        { description: 'LOUNGE ACCESS', isChargeable: true },
      ],
    };
    upsell([light]);
    render(<FlightFareOptions flight={flight()} onClose={() => {}} onSelect={() => {}} />);

    await screen.findByText('Economy Light');
    expect(screen.queryByText('Checked baggage')).toBeNull();
    expect(screen.getAllByText('Date change')).toHaveLength(1);
    expect(screen.getByText('Earns miles')).toBeTruthy();
    expect(screen.queryByText('Lounge access')).toBeNull();
  });

  it('keep the clicked fare when no family is that fare', async () => {
    upsell([family('PRELIGHT', 'PREMIUM ECONOMY LIGHT', 3417.59, 'GXOXKYBO', 'G')]);
    render(<FlightFareOptions flight={flight()} onClose={() => {}} onSelect={() => {}} />);

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'BOOK' })).toHaveLength(2));
    expect(screen.getByText(/^this fare$/i)).toBeTruthy();
    expect(screen.getByText('Premium Economy Light')).toBeTruthy();
  });
});
