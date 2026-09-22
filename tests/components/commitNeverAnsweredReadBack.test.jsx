import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseFlightBooking = vi.fn();

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/hooks/queries', () => ({
  useFlightBooking: (...args) => mockUseFlightBooking(...args),
}));
vi.mock('../../frontend/src/Services/ArcPayService', () => ({ default: { cancelBooking: vi.fn() } }));

const { default: BookingConfirmation } = await import('../../frontend/src/Pages/Common/BookingConfirmation.jsx');
const { default: ManageBooking } = await import('../../frontend/src/Pages/Common/flights/ManageBooking.jsx');
const { attentionMessage, bookingStatusBadge } = await import('../../frontend/src/utils/bookingStatus');
const { canDownloadDocument } = await import('../../frontend/src/utils/eTicket');

/**
 * A booking whose airline commit never answered, opened again from its row.
 *
 * Right after paying, the order page and the confirmation page it redirects to
 * say our team is checking with the airline whether the booking went through,
 * and not to book the trip again (tests/components/unknownCommitOrder.test.jsx).
 * Nobody knows yet whether the airline holds a reservation.
 *
 * Every later view reads the stored row, which has no PNR and carries only the
 * review reason. The My Trips card, the Manage Booking banner and the page My
 * Trips "View Details" opens read it as any booking with no PNR: it could not
 * be completed, our team is looking after the payment - and nothing against
 * booking the trip again.
 */

// As both booking reads send it (toClientBooking - asserted against the real
// order route in tests/backend/commitNeverAnsweredReadBack.test.js), and as
// My Trips keeps it.
const storedRow = {
  id: 1,
  type: 'flight',
  bookingReference: 'FLTUNK1',
  status: 'pending',
  totalAmount: 291,
  amount: 291,
  currency: 'USD',
  paymentStatus: 'paid',
  payment_status: 'paid',
  origin: 'JFK',
  destination: 'LHR',
  departureDate: '2099-11-15',
  queued: false,
  cancellation: null,
  tickets: [],
  voided_tickets: [],
  needs_review: {
    reason: 'chain failed after commit at commit', no_confirmed_seat: false, ticket_numbers_missing: false, commit_unknown: true,
  },
  gds: null,
  // mytrips.jsx loadBookings adds this to every database row.
  source: 'database',
};

// The same row from a copy that does not name the state: the pages walk the
// flag themselves, as they do for the other states the server names.
const unnamedRow = {
  ...storedRow,
  needs_review: { reason: 'chain failed after commit at commit', no_confirmed_seat: false, ticket_numbers_missing: false },
};

// A booking that really did fail, and whose reversal failed too: no PNR, and
// "could not be completed ... looking after your payment" is true of it.
const reallyFailed = {
  ...storedRow,
  bookingReference: 'FLTFAIL1',
  needs_review: {
    reason: 'charge not reversed after the booking failed', no_confirmed_seat: false, ticket_numbers_missing: false, commit_unknown: false,
  },
};

// A person found out and marked the flag handled: the server names no state.
const resolvedRow = {
  ...storedRow,
  needs_review: { ...storedRow.needs_review, commit_unknown: false },
};

const CHECKING = 'Your payment is safe and our team is checking with the airline whether your booking went through. '
  + 'We will email you either way - please do not book this trip again in the meantime.';
const NOT_COMPLETED = /Booking Not Completed|could not be completed/i;

const confirmationText = (bookingData) => render(
  <MemoryRouter initialEntries={[{ pathname: '/booking-confirmation', state: { bookingData } }]}>
    <BookingConfirmation />
  </MemoryRouter>
).container.textContent;

const manageBookingText = (bookingData) => {
  mockUseFlightBooking.mockReturnValue({ data: bookingData, isLoading: false, error: null, refetch: vi.fn() });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[{ pathname: `/manage-booking/${bookingData.bookingReference}`, state: { bookingData } }]}>
        <Routes>
          <Route path="/manage-booking/:bookingId" element={<ManageBooking />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  ).container.textContent;
};

describe('a booking whose airline commit never answered, read from its row', () => {
  beforeEach(() => mockUseFlightBooking.mockReset());

  it.each([
    ['as the server names it', storedRow],
    ['from a copy that does not name it', unnamedRow],
  ])('the My Trips card sentence says we are checking, and not to book again (%s)', (_label, row) => {
    expect(attentionMessage(row)).toBe(CHECKING);
  });

  it('Manage Booking says the same', () => {
    const text = manageBookingText(storedRow);

    expect(text).not.toMatch(NOT_COMPLETED);
    expect(text).toContain(CHECKING);
  });

  it.each([
    ['as the server names it', storedRow],
    ['from a copy that does not name it', unnamedRow],
  ])('My Trips "View Details" is the page the customer saw after paying (%s)', (_label, row) => {
    const text = confirmationText(row);

    expect(text).not.toMatch(NOT_COMPLETED);
    expect(text).toMatch(/Checking With the Airline/);
    expect(text).toMatch(/checking with the airline whether your booking went through/);
    expect(text).toMatch(/Please do not book this trip again in the meantime/);
  });
});

// Fences: what is right today, and must stay right.
describe('next to it', () => {
  beforeEach(() => mockUseFlightBooking.mockReset());

  it('right after paying, the order page hands over a booking that says so: still "Checking With the Airline"', () => {
    const fresh = { ...storedRow, commitUnknown: true, needs_review: undefined, needsReview: true };

    expect(confirmationText(fresh)).toMatch(/Checking With the Airline/);
  });

  it('a booking that really failed still reads not completed', () => {
    expect(attentionMessage(reallyFailed)).toBe('Your booking could not be completed with the airline. '
      + 'Our team is looking after your payment and will email you.');
    expect(bookingStatusBadge(reallyFailed).label).toBe('Needs attention');
    expect(manageBookingText(reallyFailed)).toMatch(/could not be completed/);
    expect(confirmationText(reallyFailed)).toMatch(/Booking Not Completed/);
  });

  it('once a person resolved the flag, it reads as it did before', () => {
    expect(attentionMessage(resolvedRow)).toMatch(/could not be completed/);
    expect(confirmationText(resolvedRow)).toMatch(/Booking Not Completed/);
    // And a raw row carrying the resolved flag itself.
    const rawResolved = {
      ...unnamedRow,
      needs_review: { reason: 'chain failed after commit at commit', at: '2026-09-15T10:00:00Z', resolved_at: '2026-09-15T12:00:00Z' },
    };
    expect(attentionMessage(rawResolved)).toMatch(/could not be completed/);
  });

  it('refunded since: the refunded sentence and badge, as for any booking with no PNR', () => {
    const refunded = { ...storedRow, paymentStatus: 'refunded', payment_status: 'refunded' };

    expect(attentionMessage(refunded)).toBe('This booking was not completed, and your payment for it has been refunded. '
      + 'If you have any questions, call (877) 538-7380 with your booking reference.');
    expect(bookingStatusBadge(refunded).label).toBe('Refunded');
    expect(confirmationText(refunded)).toMatch(/your payment for it has been refunded/);
  });

  it('a PNR held for review still reads as a held reservation', () => {
    const held = {
      ...storedRow,
      pnr: 'HELD99',
      status: 'pending_ticketing',
      needs_review: { reason: 'chain failed after commit at issueTicket', no_confirmed_seat: false, ticket_numbers_missing: false, commit_unknown: false },
    };

    expect(attentionMessage(held)).toMatch(/Your seats are reserved/);
    expect(confirmationText(held)).toMatch(/Reservation Held/);
  });

  it('offers no document: there is no PNR to prove', () => {
    expect(canDownloadDocument(storedRow)).toBe(false);
    expect(canDownloadDocument(unnamedRow)).toBe(false);
  });
});
