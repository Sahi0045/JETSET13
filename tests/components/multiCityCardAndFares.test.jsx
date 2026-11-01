import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FlightCard from '../../frontend/src/Pages/Common/flights/FlightCard.jsx';
import FlightFareOptions from '../../frontend/src/Pages/Common/flights/FlightFareOptions.jsx';
import { tripAirlines } from '../../frontend/src/Pages/Common/flights/flightSort.js';

const airline = (code, name) => ({ code, name, logo: '' });
const segment = (code, name, number, from, to, dep, arr) => ({
  airline: airline(code, name),
  flightNumber: `${code} ${number}`,
  departure: { time: dep, airport: from },
  arrival: { time: arr, airport: to },
});
const leg = (from, to, dep, arr, date, segments) => ({
  departure: { time: dep, airport: from, rawDate: date },
  arrival: { time: arr, airport: to, rawDate: date },
  duration: 'PT4H',
  stops: segments.length - 1,
  stopDetails: [],
  airline: segments[0].airline,
  segments,
});

const multiCity = () => {
  const first = leg('DEL', 'DXB', '16:15', '18:35', '2026-11-10', [segment('EK', 'Emirates', '517', 'DEL', 'DXB', '16:15', '18:35')]);
  return {
    ...first,
    id: 'mc-1',
    airline: airline('EK', 'Emirates'),
    flightNumber: 'EK 517',
    price: { amount: 2797.86, total: '2797.86', base: '2230.00', currency: 'USD' },
    baggage: { checked: null, cabin: null },
    originalOffer: { id: 'mc-1', travelerPricings: [{ travelerType: 'ADULT' }] },
    laterLegs: [
      leg('DXB', 'LHR', '14:30', '18:20', '2026-11-14', [segment('EK', 'Emirates', '3', 'DXB', 'LHR', '14:30', '18:20')]),
      leg('LHR', 'SFO', '11:50', '14:50', '2026-11-18', [segment('VS', 'Virgin Atlantic', '19', 'LHR', 'SFO', '11:50', '14:50')]),
    ],
  };
};

beforeEach(() => {
  localStorage.setItem('userCurrency', 'USD');
});

describe('the airlines of a trip', () => {
  it('are every airline that flies it, once each, in order', () => {
    expect(tripAirlines(multiCity()).map((entry) => entry.name)).toEqual(['Emirates', 'Virgin Atlantic']);
  });

  it('are the one airline of a single-airline trip', () => {
    const trip = multiCity();
    trip.laterLegs = trip.laterLegs.slice(0, 1);
    expect(tripAirlines(trip).map((entry) => entry.name)).toEqual(['Emirates']);
  });
});

describe('a multi-city result card flown by two airlines', () => {
  it('names both airlines, not only the first', () => {
    render(<FlightCard flight={multiCity()} onViewPrices={() => {}} />);

    expect(screen.getByText('Emirates + Virgin Atlantic')).toBeTruthy();
  });

  it("shows each flight's own flight number", () => {
    render(<FlightCard flight={multiCity()} onViewPrices={() => {}} />);

    expect(screen.getByText('Flight 1')).toBeTruthy();
    expect(screen.getByText('VS 19')).toBeTruthy();
    expect(screen.getByText('EK 3')).toBeTruthy();
  });
});

describe('choosing a fare for a multi-city trip', () => {
  it('heads the choice with every flight, not only the first', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: [] }) }));
    render(<FlightFareOptions flight={multiCity()} onClose={() => {}} onSelect={() => {}} />);

    await screen.findByRole('button', { name: 'BOOK' });
    const header = screen.getByTestId('fare-options-trip');
    expect(within(header).getByText('Emirates + Virgin Atlantic')).toBeTruthy();
    expect(within(header).getByText('Flight 1')).toBeTruthy();
    expect(within(header).getByText('Flight 3')).toBeTruthy();
    expect(within(header).getByText('LHR 11:50')).toBeTruthy();
    expect(within(header).getByText('SFO 14:50')).toBeTruthy();
  });
});
