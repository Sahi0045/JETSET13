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

const { default: ManageBooking } = await import('../../frontend/src/Pages/Common/flights/ManageBooking.jsx');
const { canDownloadDocument, documentState } = await import('../../frontend/src/utils/eTicket');

/**
 * A held PNR refunded without being cancelled, in Manage Booking.
 *
 * The Payments tab writes payment_status alone, so the booking keeps its PNR
 * and its status. canDownloadDocument read neither the payment record nor
 * anything else about the money, and Manage Booking offered "Download Booking
 * Confirmation": a PDF saying "Your seat is held under the PNR below. We will
 * email your e-ticket once it is issued." No ticket will be issued on a
 * refunded booking. In production today (GET /flights/bookings/:ref is not
 * gated by the booking switch).
 */

// As toClientBooking sends it.
const heldPnr = (over = {}) => ({
  type: 'flight', bookingReference: 'FLTHELD2', status: 'pending_ticketing', pnr: 'HELD22', payment_status: 'paid',
  origin: 'JFK', destination: 'LHR', departureDate: '2099-01-15', tickets: [], source: 'database',
  gds: { ticketed: false }, needs_review: null,
  ...over,
});

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

describe('a held PNR refunded without being cancelled', () => {
  beforeEach(() => mockUseFlightBooking.mockReset());

  for (const payment of ['refunded', 'partially_refunded']) {
    it(`${payment}: no held-seat document is offered`, () => {
      const booking = heldPnr({ payment_status: payment });

      expect(canDownloadDocument(booking)).toBe(false);
      expect(renderManageBooking(booking).queryByRole('button', { name: /Download/ })).toBeNull();
    });
  }
});

// Fence: the documents offered today stay offered.
describe('the bookings next to it', () => {
  beforeEach(() => mockUseFlightBooking.mockReset());

  it('a paid held PNR: the booking confirmation is offered', () => {
    const booking = heldPnr();

    expect(documentState(booking)).toBe('held');
    expect(canDownloadDocument(booking)).toBe(true);
    expect(renderManageBooking(booking).getByRole('button', { name: /Download Booking Confirmation/ })).toBeTruthy();
  });

  it('a ticketed booking refunded without being cancelled keeps its e-ticket: the ticket stands', () => {
    const booking = heldPnr({ status: 'confirmed', payment_status: 'refunded', tickets: [{ number: '220-7491174926' }], gds: { ticketed: true } });

    expect(documentState(booking)).toBe('ticketed');
    expect(canDownloadDocument(booking)).toBe(true);
  });

  it('a cancelled, refunded booking: nothing offered, as before', () => {
    expect(canDownloadDocument(heldPnr({ status: 'cancelled', payment_status: 'refunded' }))).toBe(false);
  });

  it('a refunded booking with no PNR: nothing offered, as before', () => {
    expect(canDownloadDocument(heldPnr({ pnr: null, status: 'pending', payment_status: 'refunded' }))).toBe(false);
  });
});
