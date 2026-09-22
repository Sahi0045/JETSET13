import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/PageWrapper', () => ({ default: (Page) => Page }));
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ user: null }) }));

const { default: FlightCreateOrders } = await import('../../frontend/src/Pages/Common/flights/FlightCreateOrders.jsx');
const { default: BookingConfirmation } = await import('../../frontend/src/Pages/Common/BookingConfirmation.jsx');

/**
 * An order whose airline commit never answered: the commit timed out, or came
 * back without a record locator. The chain throws `committed: 'unknown'` with
 * no PNR, and the order route answers 202 success, needsReview, pnr null, with
 * "our team is checking with the airline whether your booking went through ...
 * please do not book again".
 *
 * The order page had no case for a missing PNR: it read the answer as a held
 * reservation, told the customer their seats were reserved with the airline,
 * and handed the confirmation page a booking that said the same. The server's
 * "do not book again" was shown nowhere. Nobody knows whether the airline
 * holds anything.
 */

const offer = {
  itineraries: [{
    segments: [{
      id: '1', departure: { iataCode: 'JFK', at: '2026-11-15T19:25:00' }, arrival: { iataCode: 'LHR', at: '2026-11-16T06:10:00' },
      carrierCode: 'FI', number: '614',
    }],
  }],
  price: { total: '291.00', currency: 'USD' },
  travelerPricings: [{ travelerType: 'ADULT' }],
};

const orderData = {
  orderId: 'FLT1',
  transactionId: 'SI-1',
  amount: 291,
  totalAmount: 291,
  originalOffer: offer,
  selectedFlight: { originalOffer: offer, itineraries: offer.itineraries },
  passengerData: [{ firstName: 'Jane', lastName: 'Doe', gender: 'FEMALE', dateOfBirth: '1990-01-01', email: 'jane@example.com', type: 'ADULT' }],
  bookingDetails: { contact: { email: 'jane@example.com' }, isInternational: true },
};

const reply = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: '',
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null), forEach: (fn) => fn('application/json', 'content-type') },
  text: async () => JSON.stringify(body),
});

// The order route's 202 for a chain error with `committed` set, as it sends it.
const flaggedForReview = (pnr) => ({
  success: true,
  data: { id: pnr, pnr, status: 'PENDING_CONFIRMATION' },
  pnr,
  orderId: pnr,
  bookingReference: 'FLT1',
  needsReview: true,
  message: pnr
    ? 'Your seats are reserved with the airline and our team is finalising your ticket. '
      + 'We will email you as soon as it is issued.'
    : 'Your payment is safe and our team is checking with the airline whether your booking went '
      + 'through. We will email you either way - please do not book again in the meantime.',
});

// Both pages, in order: what the order page says, then the confirmation page it redirects to.
const bothPages = async (status, body) => {
  vi.stubGlobal('fetch', vi.fn(async () => reply(status, body)));
  const { container } = render(
    <MemoryRouter initialEntries={[{ pathname: '/flight-create-orders', state: orderData }]}>
      <Routes>
        <Route path="/flight-create-orders" element={<FlightCreateOrders />} />
        <Route path="/booking-confirmation" element={<BookingConfirmation />} />
      </Routes>
    </MemoryRouter>
  );
  await waitFor(() => expect(container.textContent).toMatch(/Redirecting to your booking confirmation/));
  const orderPage = container.textContent;
  await waitFor(() => expect(container.textContent).toMatch(/View All Trips/), { timeout: 5000 });
  return { orderPage, confirmation: container.textContent };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const HELD_SEAT = /Reservation Held|seats are reserved|could not be completed/i;

describe('an order whose airline commit never answered', () => {
  it('neither page claims a seat; both say we are checking and not to book again', async () => {
    const { orderPage, confirmation } = await bothPages(202, flaggedForReview(null));

    expect(orderPage).not.toMatch(HELD_SEAT);
    expect(orderPage).toMatch(/checking with the airline whether your booking went through/);
    expect(orderPage).toMatch(/please do not book again/i);
    expect(orderPage).toMatch(/\(877\) 538-7380/);

    expect(confirmation).not.toMatch(HELD_SEAT);
    expect(confirmation).toMatch(/checking with the airline whether your booking went through/);
    expect(confirmation).toMatch(/please do not book (this trip )?again/i);
    expect(confirmation).toMatch(/\(877\) 538-7380/);
  }, 10000);
});

// Fence: a PNR held for review, and a ticketed order, read as before.
describe('the answers next to it', () => {
  it('a held PNR flagged for review: seats reserved, on both pages', async () => {
    const { orderPage, confirmation } = await bothPages(202, flaggedForReview('HELD99'));

    expect(orderPage).toMatch(/Reservation Held/);
    expect(orderPage).toMatch(/Your seats are reserved with the airline, but your ticket could not be issued automatically/);
    expect(confirmation).toMatch(/Reservation Held/);
    expect(confirmation).toMatch(/Our team is finishing your ticket/);
    expect(confirmation).not.toMatch(/checking with the airline whether/);
  }, 10000);

  it('a ticketed order reads confirmed', async () => {
    const { orderPage, confirmation } = await bothPages(200, {
      success: true, pnr: 'TKT123', bookingReference: 'FLT1', ticketed: true, tickets: [{ number: '220-7491174926' }],
      data: { id: 'TKT123', pnr: 'TKT123', status: 'CONFIRMED' },
    });

    expect(orderPage).toMatch(/Booking Confirmed!/);
    expect(confirmation).toMatch(/Booking Confirmed!/);
    expect(confirmation).not.toMatch(/checking with the airline whether/);
  }, 10000);
});
