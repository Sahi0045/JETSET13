import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/PageWrapper', () => ({ default: (Page) => Page }));
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ user: null }) }));

const { default: FlightCreateOrders } = await import('../../frontend/src/Pages/Common/flights/FlightCreateOrders.jsx');
const { default: BookingConfirmation } = await import('../../frontend/src/Pages/Common/BookingConfirmation.jsx');

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

// The order route's 200 for a booking that already exists, as it now sends it.
const booked = {
  success: true,
  data: { id: 'Q7XK2M', pnr: 'Q7XK2M', status: 'CONFIRMED', bookingReference: 'FLTHELD1' },
  pnr: 'Q7XK2M',
  orderId: 'Q7XK2M',
  bookingReference: 'FLTHELD1',
  mode: 'LIVE_GDS_BOOKING',
  ticketed: true,
  tickets: [{ number: '108-7491175288', travelerId: '1' }],
  airlineLocators: [{ carrierCode: 'FI', locator: 'K2X9QL' }],
  voided_tickets: [],
  needsReview: false,
  savedToDatabase: true,
  message: 'Flight booked and ticketed',
};

let handedOver = null;
const StateProbe = () => {
  handedOver = useLocation().state?.bookingData ?? null;
  return null;
};

// Both pages, in order: what the order page says, then the confirmation page it redirects to.
const bothPages = async (body) => {
  handedOver = null;
  vi.stubGlobal('fetch', vi.fn(async () => reply(200, body)));
  const { container } = render(
    <MemoryRouter initialEntries={[{ pathname: '/flight-create-orders', state: orderData }]}>
      <Routes>
        <Route path="/flight-create-orders" element={<FlightCreateOrders />} />
        <Route path="/booking-confirmation" element={<><BookingConfirmation /><StateProbe /></>} />
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

describe("the airline's booking code after paying", () => {
  it('reaches the confirmation page from the order answer', async () => {
    const { confirmation } = await bothPages(booked);

    expect(handedOver.airlineLocators).toEqual([{ carrierCode: 'FI', locator: 'K2X9QL' }]);
    expect(confirmation).toMatch(/Airline PNR/);
    expect(confirmation).toMatch(/K2X9QL/);
    expect(confirmation).toMatch(/GDS PNR Q7XK2M/);
  });
});
