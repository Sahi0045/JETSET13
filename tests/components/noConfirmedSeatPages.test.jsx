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
const { canDownloadDocument, documentState } = await import('../../frontend/src/utils/eTicket');
const { NO_CONFIRMED_SEAT_REVIEW_REASON } = await import('../../frontend/src/utils/bookingStatus');

/**
 * A PNR the airline confirmed no seat on, as the customer's own pages show it.
 *
 * The chain stops at step 'segmentStatus' when a flight comes back from commit
 * waitlisted, requested, unable or cancelled. The PNR is live, nothing is
 * ticketed, and the customer has paid. The order answer, the email and the My
 * Trips sentence stopped saying the seat was held; the confirmation page My
 * Trips opens ("View Details") and the document Manage Booking hands out did
 * not: "Reservation Held - Your seats are reserved with the airline", and a PDF
 * reading "Your seat is held under the PNR below".
 *
 * Every other held booking keeps its wording and its document.
 */

// The row as GET /flights/bookings sends it (toClientBooking): the review flag
// cut down to its reason.
const noSeat = {
  type: 'flight', bookingReference: 'FLTNOSEAT', status: 'pending_ticketing', pnr: 'XYZ789', payment_status: 'paid',
  origin: 'JFK', destination: 'LHR', departureDate: '2099-01-15', tickets: [], source: 'database',
  needs_review: { reason: NO_CONFIRMED_SEAT_REVIEW_REASON },
};
// Held for staff after a later step failed: the airline holds the seats.
const heldForStaff = { ...noSeat, bookingReference: 'FLTHELD', needs_review: { reason: 'chain failed after commit at issueTicket' } };
// The ordinary held reservation: a PNR, no ticket, no flag.
const held = { ...noSeat, bookingReference: 'FLTPLAIN', needs_review: null };

const SEAT_HELD = /Reservation Held|seats? (are|is) (reserved|held)|held under the PNR|confirmed reservation|finishing your ticket/i;

const confirmationText = (bookingData) => render(
  <MemoryRouter initialEntries={[{ pathname: '/booking-confirmation', state: { bookingData } }]}>
    <BookingConfirmation />
  </MemoryRouter>
).container.textContent;

const renderManageBooking = (bookingData) => {
  mockUseFlightBooking.mockReturnValue({ data: bookingData, isLoading: false, error: null, refetch: vi.fn() });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[{ pathname: `/manage-booking/${bookingData.bookingReference}`, state: { bookingData } }]}>
        <Routes>
          <Route path="/manage-booking/:bookingId" element={<ManageBooking />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('the confirmation page for a PNR with no confirmed seat', () => {
  it('never says a seat is held or reserved, and says what is true', () => {
    const text = confirmationText(noSeat);

    expect(text).not.toMatch(SEAT_HELD);
    expect(text).toMatch(/The airline has not confirmed a seat on every flight/);
    expect(text).toMatch(/no ticket has been issued/);
    expect(text).toMatch(/Our team will contact you/);
    expect(text).toMatch(/do not book this trip again/i);
    expect(text).toMatch(/XYZ789/);
  });

  it('keeps today\'s wording for a reservation held for staff', () => {
    const text = confirmationText(heldForStaff);

    expect(text).toMatch(/Reservation Held/);
    expect(text).toMatch(/Your seats are reserved with the airline\. Your ticket is being issued and is not ready yet\./);
    expect(text).toMatch(/Our team is finishing your ticket and will email you as soon as it is issued/);
    expect(text).not.toMatch(/has not confirmed a seat/);
  });

  it('keeps today\'s wording for an ordinary held reservation', () => {
    const text = confirmationText(held);

    expect(text).toMatch(/Reservation Held/);
    expect(text).toMatch(/We email your e-ticket to the address you booked with once it is issued/);
    expect(text).not.toMatch(/has not confirmed a seat|do not book this trip again/i);
  });
});

describe('the document for a PNR with no confirmed seat', () => {
  it('is not called held, and is not offered', () => {
    expect(documentState(noSeat)).not.toBe('held');
    expect(canDownloadDocument(noSeat)).toBe(false);
    // The single-booking shape spreads booking_details, and a raw row nests it.
    expect(canDownloadDocument({ status: 'pending_ticketing', booking_details: { pnr: 'XYZ789', needs_review: { reason: NO_CONFIRMED_SEAT_REVIEW_REASON } } })).toBe(false);
  });

  it('is still held, and still offered, for every other held booking', () => {
    expect(documentState(held)).toBe('held');
    expect(documentState(heldForStaff)).toBe('held');
    expect(canDownloadDocument(held)).toBe(true);
    expect(canDownloadDocument(heldForStaff)).toBe(true);
  });
});

describe('Manage Booking for a PNR with no confirmed seat', () => {
  beforeEach(() => mockUseFlightBooking.mockReset());

  it('offers no document, and nothing on the page says a seat is held', () => {
    const { container, queryByRole } = renderManageBooking(noSeat);

    expect(queryByRole('button', { name: /Download/ })).toBeNull();
    expect(container.textContent).not.toMatch(SEAT_HELD);
    expect(container.textContent).toMatch(/The airline has not confirmed a seat on every flight/);
    expect(container.textContent).toMatch(/Our team will contact you/);
    expect(container.textContent).toMatch(/do not book this trip again/i);
  });

  it('still offers the booking confirmation, worded as today, for a held reservation', () => {
    const { container, getByRole } = renderManageBooking(held);

    expect(getByRole('button', { name: 'Download Booking Confirmation' })).toBeTruthy();
    expect(container.textContent).toMatch(/This is a confirmed reservation, not a ticket\./);
    expect(container.textContent).toMatch(/Your seat is held under the PNR below\./);
  });
});
