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
const { liveTickets } = await import('../../frontend/src/utils/eTicket');

/**
 * Back to the order page after a same-day cancel voided every ticket and the
 * airline refused PNR_Cancel. The order request is sent again and answered
 * 200 ALREADY_BOOKED from the row, which stays confirmed and paid.
 *
 * That answer called the booking ticketed and listed the void numbers as its
 * tickets, and the booking the order page handed the confirmation page carried
 * no voided_tickets: both pages said the booking was confirmed and its ticket
 * issued. The answer now names the voided tickets, and the order page carries
 * them over, so both pages say the ticket was voided.
 */

const A = '220-1111111111';
const B = '220-2222222222';

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
const alreadyBooked = (over = {}) => ({
  success: true,
  data: { id: 'HELD99', pnr: 'HELD99', status: 'CONFIRMED', bookingReference: 'FLTHELD1' },
  pnr: 'HELD99',
  orderId: 'HELD99',
  bookingReference: 'FLTHELD1',
  mode: 'ALREADY_BOOKED',
  ticketed: true,
  tickets: [{ number: A, travelerId: '1' }],
  voided_tickets: [],
  needsReview: false,
  paymentState: 'held',
  savedToDatabase: true,
  message: 'This booking already exists',
  ...over,
});
const allVoided = alreadyBooked({
  ticketed: false, tickets: [], voided_tickets: [A], needsReview: true,
  data: { id: 'HELD99', pnr: 'HELD99', status: 'PENDING_TICKETING', bookingReference: 'FLTHELD1' },
  message: 'This booking already exists; its ticket has been voided',
});

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

const ISSUED_OR_HELD = /Booking Confirmed|ticket has been issued|Reservation Held|seats are reserved|being issued/i;

describe('back to the order page after a cancel voided every ticket and the airline refused PNR_Cancel', () => {
  it('neither page says the ticket was issued or the seats are held; both say it was voided', async () => {
    const { orderPage, confirmation } = await bothPages(allVoided);

    expect(orderPage).not.toMatch(ISSUED_OR_HELD);
    expect(orderPage).toMatch(/Ticket Voided/);
    expect(orderPage).toMatch(/Your ticket has been voided and is not valid for travel/);
    expect(confirmation).not.toMatch(ISSUED_OR_HELD);
    expect(confirmation).toMatch(/Ticket Voided/);
    expect(handedOver.voided_tickets).toEqual([A]);
  }, 10000);
});

describe('the answers next to it', () => {
  it('one ticket of two voided: issued, with the voided one carried over', async () => {
    const { orderPage, confirmation } = await bothPages(alreadyBooked({
      tickets: [{ number: B, travelerId: '2' }], voided_tickets: [A], needsReview: true,
    }));

    expect(orderPage).toMatch(/Booking Confirmed!/);
    expect(confirmation).toMatch(/Booking Confirmed!/);
    expect(handedOver.voided_tickets).toEqual([A]);
    expect(liveTickets(handedOver).map((ticket) => ticket.number)).toEqual([B]);
  }, 10000);

  it('a ticketed booking nobody cancelled: confirmed, as before', async () => {
    const { orderPage, confirmation } = await bothPages(alreadyBooked());

    expect(orderPage).toMatch(/Booking Confirmed!/);
    expect(confirmation).toMatch(/Booking Confirmed!/);
    expect(handedOver.voided_tickets).toEqual([]);
  }, 10000);

  it('an answer from a server that does not send the field: as before', async () => {
    const { voided_tickets: _omitted, ...older } = alreadyBooked();
    const { orderPage, confirmation } = await bothPages(older);

    expect(orderPage).toMatch(/Booking Confirmed!/);
    expect(confirmation).toMatch(/Booking Confirmed!/);
  }, 10000);

  it('a held PNR with no ticket: held, seats reserved', async () => {
    const { orderPage, confirmation } = await bothPages(alreadyBooked({
      ticketed: false, tickets: [], needsReview: true,
      data: { id: 'HELD99', pnr: 'HELD99', status: 'PENDING_TICKETING', bookingReference: 'FLTHELD1' },
      message: 'This booking already exists; its ticket has not been issued yet',
    }));

    expect(orderPage).toMatch(/Reservation Held/);
    expect(confirmation).toMatch(/Reservation Held/);
  }, 10000);
});
