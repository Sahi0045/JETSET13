import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseFlightBooking = vi.fn();
vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/PageWrapper', () => ({ default: (Page) => Page }));
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ user: null }) }));
vi.mock('../../frontend/src/hooks/queries', () => ({ useFlightBooking: (...args) => mockUseFlightBooking(...args) }));
vi.mock('../../frontend/src/Services/ArcPayService', () => ({ default: { cancelFlightBooking: vi.fn() } }));

const { default: FlightCreateOrders } = await import('../../frontend/src/Pages/Common/flights/FlightCreateOrders.jsx');
const { default: BookingConfirmation } = await import('../../frontend/src/Pages/Common/BookingConfirmation.jsx');
const { default: ManageBooking } = await import('../../frontend/src/Pages/Common/flights/ManageBooking.jsx');
const { default: FlightETicket } = await import('../../frontend/src/Pages/Common/flights/FlightETicket.jsx');

/**
 * A booking state rendered on every customer page from exactly what the
 * server sends for it (proved against the real routes in
 * tests/backend/heldAfterTicketCustomerPages.test.js):
 *
 *  - held after its ticket was issued: every page said no ticket was issued -
 *    "your ticket could not be issued automatically", "not a ticket", "Ticket
 *    not yet issued" - and My Trips badged it "Needs attention".
 */

const offer = {
  itineraries: [{
    segments: [{
      id: '1', departure: { iataCode: 'JFK', at: '2099-11-15T19:25:00' }, arrival: { iataCode: 'LHR', at: '2099-11-16T06:10:00' },
      carrierCode: 'FI', number: '614',
    }],
  }],
  price: { total: '291.00', currency: 'USD' },
  travelerPricings: [{ travelerType: 'ADULT' }],
};
const orderData = {
  orderId: 'FLT1', transactionId: 'SI-1', amount: 291, totalAmount: 291, originalOffer: offer,
  selectedFlight: { originalOffer: offer, itineraries: offer.itineraries },
  passengerData: [{ firstName: 'Jane', lastName: 'Doe', gender: 'FEMALE', dateOfBirth: '1990-01-01', email: 'jane@example.com', type: 'ADULT' }],
  bookingDetails: { contact: { email: 'jane@example.com' }, isInternational: true },
};
const reply = (status, body) => ({
  ok: status >= 200 && status < 300, status, statusText: '',
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null), forEach: (fn) => fn('application/json', 'content-type') },
  text: async () => JSON.stringify(body),
});
const orderPages = async (status, body) => {
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
const viewDetails = (bookingData) => render(
  <MemoryRouter initialEntries={[{ pathname: '/booking-confirmation', state: { bookingData } }]}>
    <BookingConfirmation />
  </MemoryRouter>
).container.textContent;
const manageBooking = (bookingData) => {
  mockUseFlightBooking.mockReturnValue({ data: bookingData, isLoading: false, error: null, refetch: vi.fn() });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[{ pathname: `/manage-booking/${bookingData.bookingReference}`, state: { bookingData } }]}>
        <Routes><Route path="/manage-booking/:bookingId" element={<ManageBooking />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  ).container.textContent;
};
const document = (bookingData) => render(<FlightETicket bookingData={bookingData} />).container.textContent;

beforeEach(() => mockUseFlightBooking.mockReset());
afterEach(() => vi.unstubAllGlobals());

const base = {
  type: 'flight', payment_status: 'paid', paymentStatus: 'paid', origin: 'JFK', destination: 'LHR',
  departureDate: '2099-11-15', amount: 291, totalAmount: 291, tickets: [], voided_tickets: [], source: 'database',
  travelers: [{ firstName: 'Jane', lastName: 'Doe' }],
};
const flags = (over) => ({ no_confirmed_seat: false, ticket_numbers_missing: false, commit_unknown: false, ...over });

// Held AFTER the ticket was issued (flagForReview ticketed: true, no
// numbers), as toClientBooking sends it.
const heldAfterTicket = {
  ...base, bookingReference: 'FLTHT9', status: 'confirmed', pnr: 'HT9PNR', gds: { ticketed: true },
  needs_review: flags({ reason: 'order route failed after commit: boom', ticket_numbers_missing: true }),
};
// The order route's 202 for it (outer catch, committedTicketed).
const heldAfterTicket202 = {
  success: true, data: { id: 'HT9PNR', pnr: 'HT9PNR', status: 'PENDING_CONFIRMATION', bookingReference: 'FLT1' },
  pnr: 'HT9PNR', orderId: 'HT9PNR', bookingReference: 'FLT1', needsReview: true, ticketed: true,
  message: 'Your ticket has been issued and our team is completing your booking. We will email you your e-ticket as soon as it is done.',
};

const NOT_ISSUED = /not been issued|not yet issued|could not be issued|is being issued|not a ticket|once it is issued/i;

describe('held after the ticket was issued: every page says the ticket is issued', () => {
  it('the order page and the confirmation it redirects to', async () => {
    const { orderPage, confirmation } = await orderPages(202, heldAfterTicket202);
    expect({ orderPage: orderPage.match(NOT_ISSUED)?.[0] ?? null, confirmation: confirmation.match(NOT_ISSUED)?.[0] ?? null })
      .toEqual({ orderPage: null, confirmation: null });
    expect(orderPage).toMatch(/Your ticket has been issued/);
  }, 10000);

  it('My Trips View Details, Manage Booking and the document', () => {
    const pages = { viewDetails: viewDetails(heldAfterTicket), manageBooking: manageBooking(heldAfterTicket), document: document(heldAfterTicket) };
    expect({
      viewDetails: pages.viewDetails.match(NOT_ISSUED)?.[0] ?? null,
      manageBooking: pages.manageBooking.match(NOT_ISSUED)?.[0] ?? null,
      document: pages.document.match(NOT_ISSUED)?.[0] ?? null,
    }).toEqual({ viewDetails: null, manageBooking: null, document: null });
    expect(pages.viewDetails).toMatch(/Ticket Issued/);
    // Not "Needs attention": nothing is wrong with a ticket that is issued.
    expect(pages.manageBooking).toMatch(/Booking Status: Ticket issued/);
    expect(pages.document).toMatch(/Your ticket has been issued/);
  });
});

// Fences: the held reservation next to it, as it was.
describe('an ordinary held reservation', () => {
  const heldPlain = { ...base, bookingReference: 'FLTH1', status: 'pending_ticketing', pnr: 'HLD111', gds: { ticketed: false }, needs_review: null };
  const heldForStaff = { ...heldPlain, needs_review: flags({ reason: 'chain failed after commit at issueTicket' }) };

  it('still says its ticket is being issued, and offers its booking confirmation', () => {
    expect(viewDetails(heldPlain)).toMatch(/Your ticket is being issued and is not ready yet/);
    const manage = manageBooking(heldPlain);
    expect(manage).toMatch(/Booking Status: Ticket pending/);
    expect(manage).toMatch(/Download Booking Confirmation/);
    expect(document(heldPlain)).toMatch(/We will email your e-ticket once it is issued/);
  });

  it('held for staff: our team is finishing its ticket, Needs attention', () => {
    expect(viewDetails(heldForStaff)).toMatch(/Our team is finishing your ticket/);
    const manage = manageBooking(heldForStaff);
    expect(manage).toMatch(/Booking Status: Needs attention/);
    expect(manage).toMatch(/Our team is working on it/);
  });

  it('the order page for one held before its ticket was issued: could not be issued automatically', async () => {
    const { orderPage } = await orderPages(202, {
      success: true, data: { id: 'HLD111', pnr: 'HLD111', status: 'PENDING_CONFIRMATION' }, pnr: 'HLD111', orderId: 'HLD111',
      bookingReference: 'FLT1', needsReview: true,
      message: 'Your seats are reserved with the airline and our team is completing your booking. We will email you as soon as it is done.',
    });
    expect(orderPage).toMatch(/Reservation Held/);
    expect(orderPage).toMatch(/your ticket could not be issued automatically/);
  }, 10000);
});
