import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FlightCard from '../../frontend/src/Pages/Common/flights/FlightCard.jsx';
import FlightCancellationPolicy from '../../frontend/src/Pages/Common/flights/FlightCancellationPolicy.jsx';
import { arrivalDayOffset, legDateLabel } from '../../frontend/src/Pages/Common/flights/searchResults.js';

/**
 * Flight times are the airports' own clocks: Amadeus sends "2026-11-15T22:40:00"
 * with no offset, and a boarding pass prints the same. The screens have to say
 * which day, and whose clock.
 */

const flight = (departure, arrival) => ({
  id: '1',
  airline: { code: 'LH', name: 'Lufthansa', logo: '' },
  departure: { airport: 'JFK', ...departure },
  arrival: { airport: 'LHR', ...arrival },
  duration: 'PT7H',
  stops: 0,
  price: { amount: 400, total: '400.00', base: '300.00', currency: 'USD' },
  baggage: { checked: null, cabin: null },
  originalOffer: { id: '1', travelerPricings: [{ travelerType: 'ADULT' }] },
});

beforeEach(() => {
  localStorage.setItem('userCurrency', 'USD');
});

describe('the dates on a result card', () => {
  // The card showed times only: 22:40 out and 06:15 in read as the same day.
  it("shows each leg's dates and marks a next-day arrival", () => {
    render(<FlightCard
      flight={flight({ time: '22:40', rawDate: '2026-11-15' }, { time: '06:15', rawDate: '2026-11-16' })}
      onViewPrices={() => {}}
    />);

    expect(screen.getByText('Sun, Nov 15')).toBeTruthy();
    expect(screen.getByText('Mon, Nov 16')).toBeTruthy();
    expect(screen.getByText('+1')).toBeTruthy();
  });

  it('marks nothing when the flight lands the same day', () => {
    render(<FlightCard
      flight={flight({ time: '08:00', rawDate: '2026-11-15' }, { time: '11:00', rawDate: '2026-11-15' })}
      onViewPrices={() => {}}
    />);

    expect(screen.queryByText('+1')).toBeNull();
  });
});

describe('reading an airport date', () => {
  // Parsed as local midnight, 15 Nov is 14 Nov anywhere west of Greenwich.
  it('names the calendar day it was given, in any time zone', () => {
    expect(legDateLabel('2026-11-15')).toBe('Sun, Nov 15');
    expect(legDateLabel('')).toBe('');
    expect(legDateLabel('not a date')).toBe('');
  });

  it('counts the days between leaving and landing', () => {
    expect(arrivalDayOffset('2026-11-15', '2026-11-16')).toBe('+1');
    expect(arrivalDayOffset('2026-11-15', '2026-11-17')).toBe('+2');
    // Westward over the date line.
    expect(arrivalDayOffset('2026-11-15', '2026-11-14')).toBe('-1');
    expect(arrivalDayOffset('2026-11-15', '2026-11-15')).toBe('');
    expect(arrivalDayOffset('2026-11-15', undefined)).toBe('');
  });
});

describe('the cancellation deadline', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Labelled "your time", but the times are the departure airport's clock.
  it("says it is on the departure airport's clock, and prints that clock", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({
        cancellation: { hasData: true, cutoffHours: 24, cancelFee: 150, currency: 'USD', refundable: true },
        fareRules: [],
      }),
    }));

    render(<FlightCancellationPolicy flightOffer={{ id: '1' }} fromCode="JFK" toCode="LHR" departureAt="2026-11-15T22:40:00" />);

    expect(await screen.findByText('Cancel between (JFK local time) :')).toBeTruthy();
    // Departure, and the cutoff 24 hours before it.
    expect(screen.getAllByText('22:40')).toHaveLength(2);
    expect(screen.getByText('15 Nov')).toBeTruthy();
    expect(screen.getByText('14 Nov')).toBeTruthy();
    expect(screen.queryByText(/your time/)).toBeNull();
  });
});
