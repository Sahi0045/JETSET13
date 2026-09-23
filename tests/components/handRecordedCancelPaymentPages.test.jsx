import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockUseFlightBooking = vi.fn();
vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/hooks/queries', () => ({ useFlightBooking: (...args) => mockUseFlightBooking(...args) }));
vi.mock('../../frontend/src/Services/ArcPayService', () => ({ default: { cancelFlightBooking: vi.fn(), cancelBooking: vi.fn() } }));
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({
    user: { id: '0b7c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4', email: 'jane@example.com' }, isAuthenticated: true, session: null, loading: false,
  }),
}));
vi.mock('../../frontend/src/utils/authHeaders', () => ({ authHeaders: async (headers = {}) => headers }));

const { default: ManageBooking } = await import('../../frontend/src/Pages/Common/flights/ManageBooking.jsx');
const { default: BookingConfirmation } = await import('../../frontend/src/Pages/Common/BookingConfirmation.jsx');
const { default: MyTrips } = await import('../../frontend/src/Pages/Common/login/mytrips.jsx');

/**
 * The pages of an unrecorded cancel (flag: "payment VOID 291 USD") after staff
 * recorded it cancelled by hand.
 *
 * The row still says payment_status 'paid' and has no cancellation record, so
 * every page said the refund was pending: Manage Booking "Not refunded yet" and
 * "Refunded To Your Card $0.00", View Details "Refund pending", My Trips
 * "Refund pending" - of 291 USD the cancel had voided back to the card. The
 * booking reads now send what the flag says the cancel did as its
 * cancellation record (tests/backend/handRecordedCancelPaymentReturned.test.js
 * runs the hand cancel and the read), and each page words it from there.
 */
const sent = {
  id: 'bk-1', type: 'flight', bookingReference: 'FLTHELD1', orderId: 'FLTHELD1', status: 'cancelled', totalAmount: 291, amount: 291,
  currency: 'USD', paymentStatus: 'paid', payment_status: 'paid', pnr: 'HELD99', origin: 'JFK', destination: 'LHR', departureDate: '2099-11-15',
  queued: false, tickets: [{ number: '220-1111111111', travelerId: '1' }], voided_tickets: [], cancel_failed: false,
  // As toClientBooking sends it (cancellationRecordedByHandOf).
  cancellation: {
    paymentAction: 'VOID', refundAmount: 291, cancelledAt: '2026-09-22T08:03:00Z', amadeusCancelled: true, ticketsVoided: true, recordedByHand: true,
  },
  needs_review: {
    reason: 'cancellation carried out but not recorded: airline reservation released, payment VOID 291 USD; check the airline and ARC Pay and record it by hand',
    no_confirmed_seat: false, ticket_numbers_missing: false, commit_unknown: false, unrecorded_cancellation: false,
  },
  gds: { ticketed: true },
};
const PENDING = /Refund pending|Not refunded yet|no refund has been recorded/;

afterEach(() => vi.unstubAllGlobals());

describe('recorded cancelled by hand after its payment was voided', () => {
  it('Manage Booking: the refund processed, and what went back to the card', () => {
    mockUseFlightBooking.mockReturnValue({ data: sent, isLoading: false, error: null, refetch: vi.fn() });
    const text = render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[{ pathname: '/manage-booking/FLTHELD1', state: { bookingData: sent } }]}>
          <Routes><Route path="/manage-booking/:bookingId" element={<ManageBooking />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>
    ).container.textContent;

    expect(text).toMatch(/RefundProcessed/);
    expect(text).toMatch(/Refunded \$291\.00/);
    expect(text).toMatch(/Refunded To Your Card\$291\.00/);
    expect(text).not.toMatch(PENDING);
  });

  it('View Details: the payment note says it was refunded', () => {
    const text = render(
      <MemoryRouter initialEntries={[{ pathname: '/booking-confirmation', state: { bookingData: sent } }]}>
        <BookingConfirmation />
      </MemoryRouter>
    ).container.textContent;

    expect(text).toMatch(/Refunded \$291\.00/);
    expect(text).not.toMatch(PENDING);
  });

  it('My Trips: the card says it was refunded', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => ({
      ok: true,
      status: 200,
      json: async () => (String(url).includes('flights/bookings') ? { success: true, data: [sent] } : { success: true, data: [] }),
    })));
    render(<MemoryRouter initialEntries={['/my-trips']}><MyTrips /></MemoryRouter>);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /^Cancelled$/ }));

    const card = (await screen.findByText('#FLTHELD1')).closest('.group');
    expect(card.textContent).toMatch(/Refunded \$291\.00/);
    expect(card.textContent).not.toMatch(PENDING);
  });
});
