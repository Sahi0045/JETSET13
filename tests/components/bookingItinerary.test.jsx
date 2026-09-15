import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import BookingItinerary from '../../frontend/src/Pages/Common/flights/BookingItinerary.jsx';
import BookingConfirmation from '../../frontend/src/Pages/Common/BookingConfirmation.jsx';
import FlightETicket from '../../frontend/src/Pages/Common/flights/FlightETicket.jsx';
import { itinerariesFromOffer } from '../../shared/bookingItineraries.js';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));

/**
 * A round trip with a connection, on every page after payment.
 *
 * The confirmation page, My Trips, Manage Booking and the travel document read
 * the first leg only: no return flight anywhere, and a connection shown as its
 * first flight number beside its last arrival.
 */

const legs = itinerariesFromOffer({
  itineraries: [
    {
      duration: 'PT10H40M',
      segments: [
        { id: '1', departure: { iataCode: 'JFK', terminal: '1', at: '2026-11-15T19:25:00' }, arrival: { iataCode: 'KEF', at: '2026-11-16T05:05:00' }, carrierCode: 'FI', number: '614' },
        { id: '2', departure: { iataCode: 'KEF', at: '2026-11-16T07:40:00' }, arrival: { iataCode: 'LHR', terminal: '2', at: '2026-11-16T11:05:00' }, carrierCode: 'FI', number: '450', operating: { carrierCode: 'BA' } },
      ],
    },
    {
      duration: 'PT8H10M',
      segments: [
        { id: '3', departure: { iataCode: 'LHR', terminal: '2', at: '2026-11-22T13:00:00' }, arrival: { iataCode: 'JFK', terminal: '7', at: '2026-11-22T16:10:00' }, carrierCode: 'BA', number: '117' },
      ],
    },
  ],
});

const booking = {
  type: 'flight', bookingReference: 'FLT1', status: 'pending_ticketing', pnr: 'ABC123', payment_status: 'paid',
  origin: 'JFK', destination: 'LHR', departureDate: '2026-11-15', flightNumber: 'FI614', itineraries: legs,
};

describe('the itinerary', () => {
  it('shows both legs, every flight number, the connection and the terminals', () => {
    const text = render(<BookingItinerary legs={legs} />).container.textContent;

    expect(text).toMatch(/Outbound: JFK → LHR/);
    expect(text).toMatch(/Return: LHR → JFK/);
    for (const flight of ['FI614', 'FI450', 'BA117']) expect(text).toContain(flight);
    expect(text).toMatch(/Connection in KEF · 2h 35m between flights/);
    expect(text).toMatch(/Operated by BA/);
    expect(text).toMatch(/Terminal 7/);
    expect(text).toMatch(/7:25 PM/);
  });

  it('fits a My Trips card, one line per flight, terminals included', () => {
    const text = render(<BookingItinerary legs={legs} variant="compact" />).container.textContent;

    expect(text).toMatch(/Return/);
    expect(text).toMatch(/BA117 LHR T2 1:00 PM → JFK T7 4:10 PM/);
    expect(text).toMatch(/FI614 JFK T1 7:25 PM → KEF 5:05 AM/);
  });

  it('renders nothing without legs', () => {
    expect(render(<BookingItinerary legs={[]} />).container.textContent).toBe('');
  });
});

describe('the pages that show it', () => {
  it('the confirmation page shows the return flight and its date', () => {
    const { container } = render(
      <MemoryRouter initialEntries={[{ pathname: '/booking-confirmation', state: { bookingData: booking } }]}>
        <BookingConfirmation />
      </MemoryRouter>
    );

    expect(container.textContent).toMatch(/Your Flights/);
    expect(container.textContent).toContain('BA117');
    expect(container.textContent).toMatch(/Return.*Sun, Nov 22, 2026/);
  });

  it('the travel document prints every leg', () => {
    const text = render(<FlightETicket bookingData={booking} />).container.textContent;

    expect(text).toContain('FI450');
    expect(text).toContain('BA117');
    expect(text).toMatch(/Sunday, November 22, 2026/);
  });

  it('My Trips and Manage Booking render every leg too', () => {
    const read = (file) => readFileSync(path.resolve(process.cwd(), file), 'utf8');
    expect(read('frontend/src/Pages/Common/login/mytrips.jsx')).toMatch(/<BookingItinerary legs=\{legs\} variant="compact"/);
    expect(read('frontend/src/Pages/Common/flights/ManageBooking.jsx')).toMatch(/<BookingItinerary legs=\{itineraryLegs\} \/>/);
  });
});
