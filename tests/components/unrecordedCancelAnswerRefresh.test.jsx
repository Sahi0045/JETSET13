import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseFlightBooking = vi.fn();
const mockCancelFlightBooking = vi.fn();

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/flights/FlightETicket', () => ({ default: React.forwardRef(() => null) }));
vi.mock('../../frontend/src/hooks/queries', () => ({
  useFlightBooking: (...args) => mockUseFlightBooking(...args),
}));
vi.mock('../../frontend/src/Services/ArcPayService', () => ({
  default: { cancelFlightBooking: (...args) => mockCancelFlightBooking(...args), cancelBooking: vi.fn() },
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
 * The answer to a cancel that went through and could not be recorded, on the
 * page that asked for it.
 *
 * The cancel voided the ticket, released the PNR and voided the payment; its
 * final write failed, and the answer was a 500 carrying what it did
 * (`cancellation`): "Your cancellation was processed, but we could not save
 * it. Please do not try again - call ...". Both pages showed that sentence and
 * went on showing the booking as they had loaded it - Ticketed, Download
 * E-Ticket, Cancel Booking - until a reload, when the server's read of the
 * same row (needs_review.unrecorded_cancellation) took over. They now read the
 * booking again at once, as they do after a cancel that timed out.
 */

const A = '220-1111111111';
const UNSAVED = 'Your cancellation was processed, but we could not save it. Please do not try again - '
  + 'call (877) 538-7380 and we will confirm what happened to your payment.';
const UNRECORDED = /Your cancellation went through, but our record of it is still being updated/;
const travellers = [{ id: '1', firstName: 'Jane', lastName: 'Doe', type: 'ADULT' }];

// As both booking reads send it (toClientBooking), and as My Trips keeps it.
const ticketed = {
  id: 'bk-held1',
  type: 'flight',
  bookingReference: 'FLTHELD1',
  orderId: 'FLTHELD1',
  status: 'confirmed',
  totalAmount: 291,
  amount: 291,
  currency: 'USD',
  paymentStatus: 'paid',
  payment_status: 'paid',
  pnr: 'HELD99',
  origin: 'JFK',
  destination: 'LHR',
  departureDate: '2099-11-15',
  queued: false,
  cancellation: null,
  tickets: [{ number: A, travelerId: '1' }],
  voided_tickets: [],
  travelers: travellers,
  passengerData: travellers,
  needs_review: null,
  gds: { ticketed: true },
};

// The same row read again after the cancel: the server names the state.
const unrecorded = {
  ...ticketed,
  needs_review: {
    reason: 'cancellation carried out but not recorded: airline reservation released, payment VOID 291 USD; check the airline and ARC Pay and record it by hand',
    no_confirmed_seat: false, ticket_numbers_missing: false, commit_unknown: false, unrecorded_cancellation: true,
  },
};

const carriedOut = { paymentAction: 'VOID', refundAmount: 291, ticketsVoided: true };
const unsavedAnswer = { success: false, error: UNSAVED, cancellation: carriedOut };
const refusal = { success: false, code: 'CANCEL_IN_PROGRESS', error: 'This booking is already being cancelled.' };

describe('Manage Booking', () => {
  let refetch;

  const renderPage = () => render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[{ pathname: '/manage-booking/FLTHELD1', state: { bookingData: ticketed } }]}>
        <Routes>
          <Route path="/manage-booking/:bookingId" element={<ManageBooking />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

  const cancelThroughThePopUp = () => {
    fireEvent.click(screen.getAllByRole('button', { name: /Cancel Booking/ })[0]);
    const buttons = screen.getAllByRole('button', { name: /^Cancel Booking$/ });
    fireEvent.click(buttons[buttons.length - 1]);
  };

  beforeEach(() => {
    mockCancelFlightBooking.mockReset();
    // A read of the booking now answers what the server holds now.
    refetch = vi.fn(async () => {
      mockUseFlightBooking.mockReturnValue({ data: unrecorded, isLoading: false, error: null, refetch });
      return { data: unrecorded };
    });
    mockUseFlightBooking.mockReturnValue({ data: ticketed, isLoading: false, error: null, refetch });
  });

  it('reads the booking again, and stops offering the ticket and a second cancel', async () => {
    mockCancelFlightBooking.mockResolvedValue(unsavedAnswer);
    const { container } = renderPage();
    expect(container.textContent).toMatch(/Download E-Ticket/);

    cancelThroughThePopUp();

    await waitFor(() => expect(container.textContent).toContain(UNSAVED));
    await waitFor(() => expect(container.textContent).toMatch(UNRECORDED));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toMatch(/Download E-Ticket|Booking Status: Ticketed/);
    expect(screen.queryByRole('button', { name: /Cancel Booking/ })).toBeNull();
  });

  // Fence: a refusal changed nothing, and the page is not read again for it.
  it('a refusal: says so, and reads nothing again', async () => {
    mockCancelFlightBooking.mockResolvedValue(refusal);
    const { container } = renderPage();

    cancelThroughThePopUp();

    await waitFor(() => expect(container.textContent).toContain('This booking is already being cancelled.'));
    expect(refetch).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/Download E-Ticket/);
  });
});

describe('My Trips', () => {
  let bookingReads;

  /** My Trips, signed in: the list reads `ticketed` first, then `later` once a cancel was answered. */
  const renderMyTrips = (later) => {
    bookingReads = 0;
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const isBookings = String(url).includes('flights/bookings');
      if (isBookings) bookingReads += 1;
      const answered = mockCancelFlightBooking.mock.calls.length > 0;
      return {
        ok: true,
        status: 200,
        json: async () => (isBookings ? { success: true, data: [answered ? later : ticketed] } : { success: true, data: [] }),
      };
    }));
    return render(
      <MemoryRouter initialEntries={['/my-trips']}>
        <MyTrips />
      </MemoryRouter>
    );
  };

  const cardFor = async (reference) => (await screen.findByText(`#${reference}`)).closest('.group');

  const cancelFromTheCard = async () => {
    const card = await cardFor('FLTHELD1');
    fireEvent.click(await within(card).findByRole('button', { name: /Cancel Booking/ }));
    fireEvent.click(within(card).getByRole('button', { name: /Yes, Cancel/ }));
  };

  beforeEach(() => mockCancelFlightBooking.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it('reads the list again, so the card says the cancellation went through and offers no second cancel', async () => {
    mockCancelFlightBooking.mockResolvedValue(unsavedAnswer);
    renderMyTrips(unrecorded);

    await cancelFromTheCard();

    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toContain(UNSAVED));
    await waitFor(() => expect(bookingReads).toBe(2));
    const card = await cardFor('FLTHELD1');
    await waitFor(() => expect(card.textContent).toMatch(UNRECORDED));
    expect(within(card).queryByRole('button', { name: /Cancel Booking/ })).toBeNull();
    expect(card.textContent).not.toMatch(/Ticketed/);
  });

  // Fence: a refusal changed nothing, and the list is not read again for it.
  it('a refusal: says so, and reads nothing again', async () => {
    mockCancelFlightBooking.mockResolvedValue(refusal);
    renderMyTrips(unrecorded);

    await cancelFromTheCard();

    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toContain('This booking is already being cancelled.'));
    expect(bookingReads).toBe(1);
  });
});
