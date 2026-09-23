import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseFlightBooking = vi.fn();

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/flights/FlightETicket', () => ({ default: React.forwardRef(() => null) }));
vi.mock('../../frontend/src/hooks/queries', () => ({
  useFlightBooking: (...args) => mockUseFlightBooking(...args),
}));
vi.mock('../../frontend/src/Services/ArcPayService', () => ({
  default: { cancelFlightBooking: vi.fn(), cancelBooking: vi.fn() },
}));
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({
    user: { id: '0b7c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4', email: 'jane@example.com' },
    isAuthenticated: true,
    session: null,
    loading: false,
  }),
}));
vi.mock('../../frontend/src/utils/authHeaders', () => ({ authHeaders: async (headers = {}) => headers }));

const { default: ManageBooking } = await import('../../frontend/src/Pages/Common/flights/ManageBooking.jsx');
const { default: MyTrips } = await import('../../frontend/src/Pages/Common/login/mytrips.jsx');

/**
 * The Cancel button on a booking whose airline commit never answered.
 *
 * Nobody knows yet whether the airline holds a reservation, and the server now
 * refuses a customer's cancel of it (tests/backend/commitUnknownSelfCancel.test.js):
 * a cancel would reverse the payment and take the booking off every list while
 * the airline may still hold it. Manage Booking and My Trips offered the button
 * all the same, beside the sentence saying our team is checking with the
 * airline and not to book again.
 */

// As both booking reads send it (toClientBooking), and as My Trips keeps it -
// the shape tests/components/commitNeverAnsweredReadBack.test.jsx renders.
const commitUnknown = {
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
};

// The same, from a copy that does not name the state: the page walks the flag.
const unnamed = {
  ...commitUnknown,
  needs_review: { reason: 'chain failed after commit at commit', no_confirmed_seat: false, ticket_numbers_missing: false },
};

// A held reservation: the airline gave a record locator.
const held = {
  ...commitUnknown,
  id: 2,
  bookingReference: 'FLTHELD1',
  pnr: 'HELD99',
  status: 'pending_ticketing',
  needs_review: { reason: 'chain failed after commit at issueTicket', no_confirmed_seat: false, ticket_numbers_missing: false, commit_unknown: false },
};

// A person found out and marked the flag handled: the server names no state.
const resolved = {
  ...commitUnknown,
  id: 3,
  bookingReference: 'FLTRES1',
  needs_review: { ...commitUnknown.needs_review, commit_unknown: false },
};

const CHECKING = /checking with the airline whether your booking went through/;

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

describe('Manage Booking', () => {
  beforeEach(() => mockUseFlightBooking.mockReset());

  it.each([
    ['as the server names it', commitUnknown],
    ['from a copy that does not name it', unnamed],
  ])('offers no Cancel Booking while we are checking with the airline (%s)', (_label, booking) => {
    const { container } = renderManageBooking(booking);

    expect(container.textContent).toMatch(CHECKING);
    expect(screen.queryByRole('button', { name: /Cancel Booking/ })).toBeNull();
    // The way to reach us about it stays.
    expect(screen.getByRole('link', { name: /Call to change this booking/ })).toBeTruthy();
  });

  // Fences.
  it.each([
    ['a held reservation', held],
    ['one whose flag a person resolved', resolved],
  ])('still offers Cancel Booking on %s', (_label, booking) => {
    renderManageBooking(booking);

    expect(screen.getByRole('button', { name: /Cancel Booking/ })).toBeTruthy();
  });
});

/** My Trips, signed in, with these bookings from the server. */
const renderMyTrips = (bookings) => {
  vi.stubGlobal('fetch', vi.fn(async (url) => ({
    ok: true,
    status: 200,
    json: async () => (String(url).includes('flights/bookings')
      ? { success: true, data: bookings }
      : { success: true, data: [] }),
  })));
  return render(
    <MemoryRouter initialEntries={['/my-trips']}>
      <MyTrips />
    </MemoryRouter>
  );
};

/** The card that names this reference. */
const cardFor = async (reference) => {
  const label = await screen.findByText(`#${reference}`);
  return label.closest('.group');
};

describe('My Trips', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('offers no Cancel Booking on the card while we are checking with the airline', async () => {
    renderMyTrips([commitUnknown, held]);

    const card = await cardFor('FLTUNK1');
    expect(card.textContent).toMatch(CHECKING);
    expect(within(card).queryByRole('button', { name: /Cancel Booking/ })).toBeNull();
  });

  // Fence.
  it('still offers it on a held reservation beside it', async () => {
    renderMyTrips([commitUnknown, held]);

    const card = await cardFor('FLTHELD1');
    await waitFor(() => expect(within(card).getByRole('button', { name: /Cancel Booking/ })).toBeTruthy());
  });
});
