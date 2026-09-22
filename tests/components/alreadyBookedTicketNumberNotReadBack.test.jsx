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

/**
 * Back to the order page for two travellers, one ticket number read back and
 * voided by a cancel, the other ticket - its number never read back - left
 * live when the airline refused its void.
 *
 * The order route answered that ticketed:false, "its ticket has been voided",
 * and both pages said "Ticket Voided - not valid for travel" of a booking with
 * a live ticket. It now answers ticketed, with the voided number still named
 * and not listed as a ticket (tests/backend/alreadyBookedTicketNumberNotReadBack
 * .test.js). This pins what the pages make of that answer: the ticket was
 * issued, and the voided number named beside it does not turn it "Voided".
 */

const A = '220-1111111111';

const offer = {
  itineraries: [{
    segments: [{
      id: '1', departure: { iataCode: 'JFK', at: '2026-11-15T19:25:00' }, arrival: { iataCode: 'LHR', at: '2026-11-16T06:10:00' },
      carrierCode: 'FI', number: '614',
    }],
  }],
  price: { total: '582.00', currency: 'USD' },
  travelerPricings: [{ travelerType: 'ADULT' }, { travelerType: 'ADULT' }],
};

const orderData = {
  orderId: 'FLTHELD1',
  transactionId: 'SI-1',
  amount: 582,
  totalAmount: 582,
  originalOffer: offer,
  selectedFlight: { originalOffer: offer, itineraries: offer.itineraries },
  passengerData: [
    { firstName: 'Jane', lastName: 'Doe', gender: 'FEMALE', dateOfBirth: '1990-01-01', email: 'jane@example.com', type: 'ADULT' },
    { firstName: 'John', lastName: 'Doe', gender: 'MALE', dateOfBirth: '1989-01-01', type: 'ADULT' },
  ],
  bookingDetails: { contact: { email: 'jane@example.com' }, isInternational: true },
};

const reply = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: '',
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null), forEach: (fn) => fn('application/json', 'content-type') },
  text: async () => JSON.stringify(body),
});

// The order route's 200 for this booking, as it now sends it.
const liveTicketUnread = {
  success: true,
  data: { id: 'HELD99', pnr: 'HELD99', status: 'CONFIRMED', bookingReference: 'FLTHELD1' },
  pnr: 'HELD99',
  orderId: 'HELD99',
  bookingReference: 'FLTHELD1',
  mode: 'ALREADY_BOOKED',
  ticketed: true,
  tickets: [],
  voided_tickets: [A],
  needsReview: true,
  paymentState: 'held',
  savedToDatabase: true,
  message: 'This booking already exists',
};

let handedOver = null;
const HandedOverState = () => {
  handedOver = useLocation().state?.bookingData ?? null;
  return null;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('back to the order page with one ticket voided and another, its number never read back, live', () => {
  it('both pages say the ticket was issued, and neither says it was voided', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, liveTicketUnread)));
    const { container } = render(
      <MemoryRouter initialEntries={[{ pathname: '/flight-create-orders', state: orderData }]}>
        <Routes>
          <Route path="/flight-create-orders" element={<FlightCreateOrders />} />
          <Route path="/booking-confirmation" element={<><BookingConfirmation /><HandedOverState /></>} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(container.textContent).toMatch(/Redirecting to your booking confirmation/));
    const orderPage = container.textContent;
    await waitFor(() => expect(container.textContent).toMatch(/View All Trips/), { timeout: 5000 });
    const confirmation = container.textContent;

    expect(orderPage).toMatch(/Booking Confirmed!/);
    expect(orderPage).not.toMatch(/Voided|not valid for travel/i);
    expect(confirmation).toMatch(/Booking Confirmed!/);
    expect(confirmation).not.toMatch(/Voided|not valid for travel/i);
    expect(handedOver.voided_tickets).toEqual([A]);
  }, 10000);
});
