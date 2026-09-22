import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import FlightCard from '../../frontend/src/Pages/Common/flights/FlightCard.jsx';

/**
 * The layover in Flight Details, when an earlier flight lands on the way.
 *
 * transformAmadeusFlightData (backend/routes/flight.routes.js) and the return
 * leg built in flightsearchpage.jsx put each flight's technical stops into
 * stopDetails BEFORE the connection that follows it: AI2592 DEL-BOM, down at
 * Indore 16:05-16:40, then BOM-DXB, gives
 * [IDR 0h 35m (technical), BOM 3h 0m]. The expanded card read stopDetails by
 * flight position, so the gap after the first flight said "Layover at Mumbai ·
 * 0h 35m" - Indore's 35 minutes on the ground - instead of the 3h wait in
 * Mumbai. The gap after a flight is now the connection after it.
 */

beforeEach(() => { localStorage.setItem('userCurrency', 'USD'); });

const seg = (from, to, dep, arr, number) => ({
  departure: { time: dep.slice(11, 16), airport: from, at: dep },
  arrival: { time: arr.slice(11, 16), airport: to, at: arr },
  airline: { code: 'AI', name: 'Air India', logo: '' },
  flightNumber: `AI ${number}`,
  duration: undefined,
  stops: 0,
});

const delBomDxb = [
  seg('DEL', 'BOM', '2026-11-15T14:30:00', '2026-11-15T18:05:00', '2592'),
  seg('BOM', 'DXB', '2026-11-15T21:05:00', '2026-11-15T23:55:00', '983'),
];
const indore = { airport: 'IDR', duration: '0h 35m', waitingTime: '0h 35m', technical: true };
const mumbai = { airport: 'BOM', duration: '3h 0m', waitingTime: '3h 0m' };

const card = (overrides) => ({
  id: '1-1',
  airline: { code: 'AI', name: 'Air India', logo: '' },
  departure: { time: '14:30', airport: 'DEL', rawDate: '2026-11-15' },
  arrival: { time: '23:55', airport: 'DXB', rawDate: '2026-11-15' },
  duration: '10h 55m',
  stops: 2,
  stopDetails: [indore, mumbai],
  price: { amount: 300, total: '300.00', base: '250.00', currency: 'USD' },
  baggage: { checked: null, cabin: null },
  segments: delBomDxb,
  originalOffer: { travelerPricings: [{}] },
  ...overrides,
});

const openDetails = (flight) => {
  const view = render(<FlightCard flight={flight} onBook={() => {}} cityMap={{ BOM: 'Mumbai', IDR: 'Indore' }} />);
  fireEvent.click(screen.getByText(/Flight\s*Details/));
  return view;
};

describe('Flight Details for a connection after a technical stop', () => {
  it('shows the Mumbai layover as the 3h wait between the two flights', () => {
    openDetails(card());
    const layover = screen.getByText(/Layover at Mumbai/);
    expect(layover.textContent).toContain('3h 0m');
    expect(layover.textContent).not.toContain('0h 35m');
  });

  it('does the same on the return leg', () => {
    openDetails(card({
      returnLeg: {
        departure: { time: '14:30', airport: 'DEL', rawDate: '2026-11-20' },
        arrival: { time: '23:55', airport: 'DXB', rawDate: '2026-11-20' },
        duration: '10h 55m',
        stops: 2,
        stopDetails: [indore, mumbai],
        segments: delBomDxb,
      },
      stops: 1,
      stopDetails: [mumbai],
    }));
    const layovers = screen.getAllByText(/Layover at Mumbai/);
    expect(layovers).toHaveLength(2);
    layovers.forEach((l) => expect(l.textContent).toContain('3h 0m'));
  });

  it('shows a connection with no technical stop as before', () => {
    openDetails(card({ stops: 1, stopDetails: [mumbai] }));
    expect(screen.getByText(/Layover at Mumbai/).textContent).toBe('Layover at Mumbai· 3h 0m');
  });

  it('still names the technical stop of a single flight on the card', () => {
    openDetails(card({
      stops: 1,
      stopDetails: [indore],
      segments: [seg('DEL', 'BOM', '2026-11-15T14:30:00', '2026-11-15T18:05:00', '2592')],
      arrival: { time: '18:05', airport: 'BOM', rawDate: '2026-11-15' },
    }));
    expect(screen.getByText(/1 stop/).parentElement.textContent).toMatch(/Indore · 0h 35m wait/);
    expect(screen.queryByText(/Layover at/)).toBeNull();
  });
});
