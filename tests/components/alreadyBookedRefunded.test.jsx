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
 * The order page, reloaded for a held PNR that was refunded without being
 * cancelled: the order route answers 200 ALREADY_BOOKED, in production today.
 *
 * The page said "Reservation Held - Your seats are reserved with the airline
 * ... Our team is finishing it", then the confirmation page said "Total Paid
 * ... Payment received ... Our team is finishing your ticket". The refund was
 * mentioned nowhere. The answer now says what the payment record says
 * (paymentState), and neither page claims a held seat or a received payment
 * when it says the payment was returned.
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
  orderId: 'FLTHELD1',
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

// The order route's 200 for a PNR that already exists, as it sends it.
const alreadyBooked = (over = {}) => ({
  success: true,
  data: { id: 'HELD99', pnr: 'HELD99', status: 'PENDING_TICKETING', bookingReference: 'FLTHELD1' },
  pnr: 'HELD99',
  orderId: 'HELD99',
  bookingReference: 'FLTHELD1',
  mode: 'ALREADY_BOOKED',
  ticketed: false,
  tickets: [],
  needsReview: true,
  savedToDatabase: true,
  message: 'This booking already exists; its ticket has not been issued yet',
  ...over,
});

const renderOrderPage = () => render(
  <MemoryRouter initialEntries={[{ pathname: '/flight-create-orders', state: orderData }]}>
    <Routes>
      <Route path="/flight-create-orders" element={<FlightCreateOrders />} />
      <Route path="/booking-confirmation" element={<BookingConfirmation />} />
    </Routes>
  </MemoryRouter>
);

// Both pages, in order: what the order page says, then the confirmation page it redirects to.
const bothPages = async (body) => {
  vi.stubGlobal('fetch', vi.fn(async () => reply(200, body)));
  const { container } = renderOrderPage();
  await waitFor(() => expect(container.textContent).toMatch(/Redirecting to your booking confirmation/));
  const orderPage = container.textContent;
  await waitFor(() => expect(container.textContent).toMatch(/View All Trips/), { timeout: 5000 });
  return { orderPage, confirmation: container.textContent };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const HELD_SEAT = /Reservation Held|seats are reserved|finishing (it|your ticket)/i;
const RECEIVED = /Payment received|Total Paid/;

describe('a reload of the order page for a held PNR whose payment was refunded', () => {
  it('claims neither a held seat nor a received payment, and says it was refunded', async () => {
    const { orderPage, confirmation } = await bothPages(alreadyBooked({ paymentState: 'returned' }));

    expect(orderPage).not.toMatch(HELD_SEAT);
    expect(orderPage).toMatch(/Your payment for this booking has been refunded\./);
    expect(confirmation).not.toMatch(HELD_SEAT);
    expect(confirmation).not.toMatch(RECEIVED);
    expect(confirmation).toMatch(/Payment refunded/);
  }, 10000);

  it('refunded in part: says part of it was', async () => {
    const { orderPage, confirmation } = await bothPages(alreadyBooked({ paymentState: 'partly_returned' }));

    expect(orderPage).not.toMatch(HELD_SEAT);
    expect(orderPage).toMatch(/Part of your payment for this booking has been refunded\./);
    expect(confirmation).not.toMatch(HELD_SEAT);
    expect(confirmation).not.toMatch(/Payment received/);
    expect(confirmation).toMatch(/Partly refunded/);
  }, 10000);

  it('ticketed, and refunded: the ticket stands, the payment is not "received"', async () => {
    const { orderPage, confirmation } = await bothPages(alreadyBooked({
      ticketed: true, tickets: [{ number: '220-7491174926' }], paymentState: 'returned', message: 'This booking already exists',
      data: { id: 'HELD99', pnr: 'HELD99', status: 'CONFIRMED', bookingReference: 'FLTHELD1' },
    }));

    expect(orderPage).toMatch(/Booking Confirmed!/);
    expect(confirmation).not.toMatch(/Payment received/);
    expect(confirmation).toMatch(/Payment refunded/);
  }, 10000);
});

// Fence: a paid booking, and an answer from a server that does not say, as today.
describe('the answers next to it', () => {
  for (const [label, body] of [
    ['paid (held)', alreadyBooked({ paymentState: 'held' })],
    ['not said', alreadyBooked()],
  ]) {
    it(`${label}: "Reservation Held", then "Total Paid ... Payment received"`, async () => {
      const { orderPage, confirmation } = await bothPages(body);

      expect(orderPage).toMatch(/Reservation Held/);
      expect(orderPage).toMatch(/Your seats are reserved with the airline, but your ticket could not be issued automatically/);
      expect(confirmation).toMatch(/Reservation Held/);
      expect(confirmation).toMatch(/Total Paid/);
      expect(confirmation).toMatch(/Payment received/);
      expect(confirmation).toMatch(/Our team is finishing your ticket/);
    }, 10000);
  }

  it('ticketed and paid: "Booking Confirmed!", then "Payment received"', async () => {
    const { orderPage, confirmation } = await bothPages(alreadyBooked({
      ticketed: true, tickets: [{ number: '220-7491174926' }], paymentState: 'held', message: 'This booking already exists',
    }));

    expect(orderPage).toMatch(/Booking Confirmed!/);
    expect(confirmation).toMatch(/Payment received/);
  }, 10000);
});
