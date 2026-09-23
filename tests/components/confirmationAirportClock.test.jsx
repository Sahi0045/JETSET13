import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/PageWrapper', () => ({ default: (Page) => Page }));
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ user: null }) }));

const { default: FlightCreateOrders } = await import('../../frontend/src/Pages/Common/flights/FlightCreateOrders.jsx');
const { default: BookingConfirmation } = await import('../../frontend/src/Pages/Common/BookingConfirmation.jsx');

/**
 * The flight times on the confirmation page the customer lands on straight
 * after paying, as the airports' clocks read them.
 *
 * Amadeus's `at` is the airport's own clock with no offset. FlightCreateOrders
 * made the page's departure and arrival times with
 * `new Date(at).toLocaleTimeString()`, through the VIEWER's time zone, and
 * BookingConfirmation printed them at the top of the page: a time inside the
 * viewer's spring-forward hour moved an hour. The review page before payment
 * was fixed for this (searchResults.js airportClockLabel); this page was not.
 *
 * 14 Mar 2027 is the day New York springs forward (02:00 -> 03:00).
 */

const offerFor = (segments) => ({
  itineraries: [{ duration: 'PT2H', segments }],
  price: { total: '291.00', currency: 'USD' },
  travelerPricings: [{ travelerType: 'ADULT' }],
});

const flight = (from, to, dep, arr, number = '101') => ({
  id: number, carrierCode: 'AI', number,
  departure: { iataCode: from, ...(dep ? { at: dep } : {}) },
  arrival: { iataCode: to, ...(arr ? { at: arr } : {}) },
});

const orderDataFor = (offer, selected = {}) => ({
  orderId: 'FLT1',
  transactionId: 'SI-1',
  amount: 291,
  originalOffer: offer,
  selectedFlight: { originalOffer: offer, itineraries: offer.itineraries, ...selected },
  passengerData: [{ firstName: 'Jane', lastName: 'Doe', gender: 'FEMALE', dateOfBirth: '1990-01-01', email: 'jane@example.com', type: 'ADULT' }],
  bookingDetails: { contact: { email: 'jane@example.com' }, isInternational: false },
});

const reply = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: '',
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null), forEach: (fn) => fn('application/json', 'content-type') },
  text: async () => JSON.stringify(body),
  json: async () => body,
});

/** Pays, lets the order page answer and hand over, and returns the confirmation page's route card. */
async function confirmationFor(orderData) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubGlobal('fetch', vi.fn(async () => reply(200, {
    success: true, pnr: 'BH9F9H', bookingReference: 'FLT1', ticketed: true,
    tickets: [{ number: '098-7491175288', travelerId: '1' }], transactionId: '625923098465',
  })));

  const { container } = render(
    <MemoryRouter initialEntries={[{ pathname: '/flight-create-orders', state: orderData }]}>
      <Routes>
        <Route path="/flight-create-orders" element={<FlightCreateOrders />} />
        <Route path="/booking-confirmation" element={<BookingConfirmation />} />
      </Routes>
    </MemoryRouter>
  );

  const flush = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  await flush();
  await flush();
  await flush(2500);

  expect(container.textContent).toMatch(/Airline Reference/);
  // The route card at the top of the page: origin, time, then destination, time.
  const route = container.querySelector('.backdrop-blur-sm');
  expect(route).toBeTruthy();
  return route;
}

let originalTz;
beforeAll(() => {
  originalTz = process.env.TZ;
  process.env.TZ = 'America/New_York';
});
afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the confirmation page after payment, seen from New York on its spring-forward day', () => {
  it("prints the departure as the airport's clock reads it (02:40), not 03:40", async () => {
    const route = await confirmationFor(orderDataFor(offerFor([
      flight('DEL', 'BOM', '2027-03-14T02:40:00', '2027-03-14T04:40:00'),
    ])));

    expect(route.textContent).not.toMatch(/03:40/);
    // As the itinerary below prints it (BookingItinerary's clockTime).
    expect(screen.getAllByText('2:40 AM')).toHaveLength(2);
    expect(screen.getAllByText('4:40 AM')).toHaveLength(2);
  });

  it("prints the arrival as the airport's clock reads it (02:50), not 03:50", async () => {
    const route = await confirmationFor(orderDataFor(offerFor([
      flight('BOM', 'DEL', '2027-03-14T00:35:00', '2027-03-14T02:50:00'),
    ])));

    expect(route.textContent).not.toMatch(/03:50/);
    expect(screen.getAllByText('2:50 AM')).toHaveLength(2);
    expect(screen.getAllByText('12:35 AM')).toHaveLength(2);
  });

  it('prints a connection from its first departure to its last arrival, both on their own clocks', async () => {
    const route = await confirmationFor(orderDataFor(offerFor([
      flight('DEL', 'BOM', '2027-03-14T02:40:00', '2027-03-14T04:40:00', '101'),
      flight('BOM', 'GOI', '2027-03-14T06:00:00', '2027-03-14T07:15:00', '202'),
    ])));

    expect(route.textContent).not.toMatch(/03:40/);
    expect(route.textContent).toContain('2:40 AM');
    expect(route.textContent).toContain('7:15 AM');
  });
});

describe('the confirmation page on an ordinary day, as before', () => {
  it('prints an evening departure and the next morning arrival', async () => {
    const route = await confirmationFor(orderDataFor(offerFor([
      flight('JFK', 'LHR', '2026-11-15T19:25:00', '2026-11-16T06:10:00'),
    ])));

    expect(route.textContent).toMatch(/0?7:25 PM/);
    expect(route.textContent).toMatch(/0?6:10 AM/);
  });

  it('prints a midnight departure as 12:05 AM and a noon arrival as 12:30 PM', async () => {
    const route = await confirmationFor(orderDataFor(offerFor([
      flight('DEL', 'BOM', '2026-11-15T00:05:00', '2026-11-15T12:30:00'),
    ])));

    expect(route.textContent).toContain('12:05 AM');
    expect(route.textContent).toContain('12:30 PM');
    expect(route.textContent).not.toMatch(/24:05|00:05/);
  });

  it('keeps the times the results page gave when the offer carries none', async () => {
    const route = await confirmationFor(orderDataFor(
      offerFor([flight('DEL', 'BOM', null, null)]),
      { departureTime: '10:15 AM', arrivalTime: '12:30 PM' },
    ));

    expect(route.textContent).toContain('10:15 AM');
    expect(route.textContent).toContain('12:30 PM');
  });
});
