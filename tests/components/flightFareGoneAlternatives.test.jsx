import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import FlightFareGoneAlternatives from '../../frontend/src/Pages/Common/flights/FlightFareGoneAlternatives.jsx';

/**
 * The fares on sale now, priced the way the card is charged.
 *
 * The panel printed each alternative through <Price>, which converts to the
 * visitor's currency at whatever rate it has - the hardcoded table when the
 * live fetch failed - and shows the airline's fare alone. The summary right
 * below it shows the charge: US dollars, service fee included. So a visitor
 * browsing in rupees picked "₹36,500" and was shown "US$437.60" beneath it,
 * two numbers that reconcile with nothing (utils/chargeDisplay.js).
 */

const offer = (types) => ({
  id: '2',
  itineraries: [{ segments: [{ carrierCode: 'AI', number: '202', departure: { iataCode: 'DEL', at: '2026-11-15T12:00:00' }, arrival: { iataCode: 'BOM', at: '2026-11-15T14:00:00' } }] }],
  travelerPricings: types.map((travelerType, index) => ({ travelerId: String(index + 1), travelerType })),
  price: { total: '400.00', grandTotal: '400.00', currency: 'USD' },
});

const alternative = (types = ['ADULT']) => ({
  id: '2',
  airline: 'Air India',
  flightNumber: 'AI-202',
  duration: '2h 0m',
  stops: 0,
  departure: { time: '12:00', date: '2026-11-15' },
  arrival: { time: '14:00', date: '2026-11-15' },
  price: { amount: 400, total: '400.00', grandTotal: '400.00', currency: 'USD' },
  originalOffer: offer(types),
});

const state = (flights) => ({ busy: false, error: null, flights, switching: false });
const priceConfig = { flight_taxes_fees: 10, flight_taxes_fees_percentage: 2 };

beforeEach(() => {
  // Browsing in rupees, with no live rates: the case the charge display guards.
  localStorage.setItem('userCurrency', 'INR');
});

describe('an alternative fare', () => {
  it('shows what the card is charged: US dollars, service fee included', () => {
    render(<FlightFareGoneAlternatives state={state([alternative()])} priceConfig={priceConfig} onChoose={() => {}} onSearchAgain={() => {}} />);

    // 400 fare + 10 fixed fee + 2% of the fare (8) - computeFlightCharge.
    expect(screen.getByText('US$418.00')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/₹/);
  });

  // The fixed fee is per seated traveller; a lap infant pays none.
  it('prices every traveller the fare was priced for, as checkout does', () => {
    render(<FlightFareGoneAlternatives state={state([alternative(['ADULT', 'ADULT', 'HELD_INFANT'])])} priceConfig={priceConfig} onChoose={() => {}} onSearchAgain={() => {}} />);

    expect(screen.getByText('US$428.00')).toBeTruthy();
  });

  it('says what the figure is', () => {
    render(<FlightFareGoneAlternatives state={state([alternative()])} priceConfig={priceConfig} onChoose={() => {}} onSearchAgain={() => {}} />);

    expect(screen.getByText(/total for all travellers in US dollars, including our service fee/)).toBeTruthy();
  });
});
