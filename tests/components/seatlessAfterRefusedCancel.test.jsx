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
const { default: FlightETicket } = await import('../../frontend/src/Pages/Common/flights/FlightETicket.jsx');
const { canDownloadDocument, documentState, hasNoConfirmedSeat } = await import('../../frontend/src/utils/eTicket');
const { attentionMessage, bookingStatusBadge, NO_CONFIRMED_SEAT_REVIEW_REASON } = await import('../../frontend/src/utils/bookingStatus');

/**
 * A PNR with no confirmed seat, after the customer's cancel was refused by the
 * airline.
 *
 * The refused cancel writes its own review flag on top of the seatless one. The
 * pages read the top reason only, so every one of them went back to "Your
 * seats are reserved": the confirmation page My Trips opens, the My Trips
 * sentence, Manage Booking, and the PDF it offered ("Your seat is held under
 * the PNR below"). No seat was ever confirmed.
 *
 * The row is exactly what both booking reads now send for it - asserted
 * against the real cancel handler and toClientBooking in
 * tests/backend/seatlessCancelRefused.test.js.
 */
const afterRefusedCancel = {
  type: 'flight', bookingReference: 'FLTSEAT42', status: 'pending_ticketing', pnr: 'SEAT42', payment_status: 'paid',
  origin: 'JFK', destination: 'LHR', departureDate: '2099-01-15', tickets: [], source: 'database',
  gds: { ticketed: false },
  needs_review: {
    reason: 'GDS cancellation failed; refund withheld to avoid paying out against a live booking',
    no_confirmed_seat: true,
    ticket_numbers_missing: false,
  },
};

// The same failed cancel on an ordinary held reservation: its seats ARE held.
const heldAfterRefusedCancel = {
  ...afterRefusedCancel,
  bookingReference: 'FLTHELD9',
  needs_review: { ...afterRefusedCancel.needs_review, no_confirmed_seat: false },
};

const SEAT_HELD = /Reservation Held|seats? (are|is) (reserved|held)|held under the PNR|confirmed reservation/i;

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

describe('a PNR with no confirmed seat, after the airline refused its cancel', () => {
  beforeEach(() => mockUseFlightBooking.mockReset());

  it('the confirmation page says the seat is not confirmed, never that it is held', () => {
    const text = confirmationText(afterRefusedCancel);

    expect(text).not.toMatch(SEAT_HELD);
    expect(text).toMatch(/Seat Not Confirmed/);
    expect(text).toMatch(/The airline has not confirmed a seat on every flight/);
  });

  it('My Trips says the seat is not confirmed', () => {
    expect(attentionMessage(afterRefusedCancel)).toMatch(/The airline has not confirmed a seat on every flight/);
    expect(attentionMessage(afterRefusedCancel)).not.toMatch(SEAT_HELD);
    expect(bookingStatusBadge(afterRefusedCancel).label).toBe('Needs attention');
  });

  it('Manage Booking offers no document, and says the seat is not confirmed', () => {
    const { container, queryByRole } = renderManageBooking(afterRefusedCancel);

    expect(queryByRole('button', { name: /Download/ })).toBeNull();
    expect(container.textContent).not.toMatch(SEAT_HELD);
    expect(container.textContent).toMatch(/The airline has not confirmed a seat on every flight/);
  });

  it('the document is not a booking confirmation, and is not offered', () => {
    expect(documentState(afterRefusedCancel)).toBe('no_confirmed_seat');
    expect(canDownloadDocument(afterRefusedCancel)).toBe(false);
    const text = render(<FlightETicket bookingData={afterRefusedCancel} />).container.textContent;
    expect(text).not.toMatch(/held under the PNR/);
  });

  it('a held reservation whose cancel was refused keeps its held wording and its document', () => {
    expect(confirmationText(heldAfterRefusedCancel)).toMatch(/Reservation Held/);
    expect(documentState(heldAfterRefusedCancel)).toBe('held');
    expect(canDownloadDocument(heldAfterRefusedCancel)).toBe(true);
  });

  it('a copy of the row that carries the whole chain is read the same way', () => {
    const raw = {
      status: 'pending_ticketing',
      booking_details: {
        pnr: 'SEAT42',
        needs_review: {
          reason: 'GDS cancellation failed; refund withheld to avoid paying out against a live booking',
          source: 'cancellation',
          cancelFailed: true,
          previous: { reason: NO_CONFIRMED_SEAT_REVIEW_REASON },
        },
      },
    };
    expect(hasNoConfirmedSeat(raw)).toBe(true);
    expect(canDownloadDocument(raw)).toBe(false);
  });
});
