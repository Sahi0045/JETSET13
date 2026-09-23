import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockUseFlightBooking = vi.fn();

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/hooks/queries', () => ({ useFlightBooking: (...args) => mockUseFlightBooking(...args) }));
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({
    user: { id: '0b7c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4', email: 'jane@example.com' }, isAuthenticated: true, session: null, loading: false,
  }),
}));
vi.mock('../../frontend/src/utils/authHeaders', () => ({ authHeaders: async (headers = {}) => headers }));

// The real ArcPayService: the answer goes through cancelFailure as it does live.
const { default: ManageBooking } = await import('../../frontend/src/Pages/Common/flights/ManageBooking.jsx');
const { default: MyTrips } = await import('../../frontend/src/Pages/Common/login/mytrips.jsx');

/**
 * A cancel the server did not carry through, on the page that asked for it.
 *
 * A refusal can come after the cancel changed the booking. cancelFlightBooking
 * (payment/operations.handlers.js) voids a same-day ticket, then has PNR_Cancel
 * refused, and answers 502 with needsReview: true and "We could not cancel
 * your reservation with the airline. Our team has been alerted and will
 * complete it" - AFTER writing the booking: the cancelFailed flag and the
 * voided number. Read again, the server says so (toClientBooking
 * voided_tickets / cancel_failed): no document offered, "Ticket voided".
 *
 * Both pages read the booking again only after a timeout or an answer carrying
 * `cancellation`, so under the refusal they went on offering what the booking
 * had been: "Download E-Ticket" of the ticket the cancel had just voided, and
 * a held reservation's "Booking Confirmation" promising an e-ticket. Every
 * answer that is not a success now reads the booking again, and the server's
 * reading takes over; a refusal that changed nothing reads back unchanged.
 */

const A = '220-1111111111';
const REFUSED_TEXT = 'We could not cancel your reservation with the airline. '
  + 'Our team has been alerted and will complete it - please call (877) 538-7380 if it is urgent.';
const REFUSED_REASON = 'GDS cancellation failed; refund withheld to avoid paying out against a live booking';
const travellers = [{ id: '1', firstName: 'Jane', lastName: 'Doe', type: 'ADULT' }];

const base = {
  id: 'bk-1', type: 'flight', bookingReference: 'FLTSD1', orderId: 'FLTSD1', totalAmount: 291, amount: 291, currency: 'USD',
  paymentStatus: 'paid', payment_status: 'paid', pnr: 'SD1PNR', origin: 'JFK', destination: 'LHR', departureDate: '2099-11-15',
  queued: false, cancellation: null, voided_tickets: [], travelers: travellers, passengerData: travellers, cancel_failed: false,
};
const flags = (over) => ({ reason: REFUSED_REASON, no_confirmed_seat: false, ticket_numbers_missing: false, commit_unknown: false, unrecorded_cancellation: false, ...over });

// Ticketed the same day, as both booking reads send it.
const ticketed = { ...base, status: 'confirmed', tickets: [{ number: A, travelerId: '1' }], needs_review: null, gds: { ticketed: true } };
// The same row after the refused cancel voided A (toClientBooking).
const ticketedAfter = { ...ticketed, voided_tickets: [A], cancel_failed: true, needs_review: flags() };
// A held reservation, and the same row after its cancel was refused.
const held = { ...base, status: 'pending_ticketing', tickets: [], needs_review: null, gds: { ticketed: false } };
const heldAfter = { ...held, cancel_failed: true, needs_review: flags() };

const reply = (status, body) => ({
  ok: status >= 200 && status < 300, status, statusText: '',
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null), forEach: (fn) => fn('application/json', 'content-type') },
  text: async () => JSON.stringify(body),
  json: async () => body,
});
// The cancel route's own 502 for an airline refusal.
const REFUSAL_502 = { success: false, error: REFUSED_TEXT, message: REFUSED_TEXT, bookingReference: 'FLTSD1', needsReview: true };
// The handler's catch-all: it can throw after the void, and says nothing of what it did.
const THREW_500 = { success: false, error: 'Cancellation failed. Please contact support.' };
// Another cancel of the same booking holds it: this one wrote nothing.
const IN_PROGRESS_409 = { success: false, code: 'CANCEL_IN_PROGRESS', error: 'This booking is already being cancelled.' };

afterEach(() => vi.unstubAllGlobals());

describe('Manage Booking, when the cancel is not carried through', () => {
  let refetch;
  const renderPage = (before, after, answer = [502, REFUSAL_502]) => {
    refetch = vi.fn(async () => {
      mockUseFlightBooking.mockReturnValue({ data: after, isLoading: false, error: null, refetch });
      return { data: after };
    });
    mockUseFlightBooking.mockReturnValue({ data: before, isLoading: false, error: null, refetch });
    vi.stubGlobal('fetch', vi.fn(async (url) => (String(url).includes('/cancel') ? reply(...answer) : reply(200, { success: true }))));
    return render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[{ pathname: '/manage-booking/FLTSD1', state: { bookingData: before } }]}>
          <Routes><Route path="/manage-booking/:bookingId" element={<ManageBooking />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
  const cancelThroughThePopUp = () => {
    fireEvent.click(screen.getAllByRole('button', { name: /Cancel Booking/ })[0]);
    const buttons = screen.getAllByRole('button', { name: /^Cancel Booking$/ });
    fireEvent.click(buttons[buttons.length - 1]);
  };

  it('the airline refused after voiding a same-day ticket: the void ticket is no longer offered as an E-Ticket', async () => {
    const { container } = renderPage(ticketed, ticketedAfter);
    expect(screen.getByRole('button', { name: /Download E-Ticket/ })).toBeTruthy();

    cancelThroughThePopUp();
    await waitFor(() => expect(container.textContent).toContain(REFUSED_TEXT));

    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: /Download E-Ticket/ })).toBeNull();
    expect(container.textContent).not.toMatch(/Booking Status: Ticketed/);
  });

  it('the airline refused a held reservation: no document promising an e-ticket', async () => {
    const { container } = renderPage(held, heldAfter);
    expect(screen.getByRole('button', { name: /Download Booking Confirmation/ })).toBeTruthy();

    cancelThroughThePopUp();
    await waitFor(() => expect(container.textContent).toContain(REFUSED_TEXT));

    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: /Download Booking Confirmation/ })).toBeNull();
    expect(container.textContent).not.toMatch(/We will email your e-ticket once it is issued/);
  });

  it('a 500 that says nothing of what it did: the booking is read again all the same', async () => {
    const { container } = renderPage(ticketed, ticketedAfter, [500, THREW_500]);

    cancelThroughThePopUp();
    await waitFor(() => expect(container.textContent).toContain(THREW_500.error));

    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: /Download E-Ticket/ })).toBeNull();
  });

  // Fence: a refusal that wrote nothing reads back as it was. The refusal is
  // still said, and the ticket is still offered - it is still live.
  it('a refusal that changed nothing: says so, and the booking reads as it did', async () => {
    const { container } = renderPage(ticketed, ticketed, [409, IN_PROGRESS_409]);

    cancelThroughThePopUp();
    await waitFor(() => expect(container.textContent).toContain(IN_PROGRESS_409.error));

    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    expect(container.textContent).toContain(IN_PROGRESS_409.error);
    expect(screen.getByRole('button', { name: /Download E-Ticket/ })).toBeTruthy();
    expect(container.textContent).toMatch(/Booking Status: Ticketed/);
  });
});

describe('My Trips, when the cancel is not carried through', () => {
  const renderMyTrips = (later, answer) => {
    const reads = { bookings: 0 };
    let cancelled = false;
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('/cancel')) { cancelled = true; return reply(...answer); }
      if (String(url).includes('flights/bookings')) {
        reads.bookings += 1;
        return reply(200, { success: true, data: [cancelled ? later : ticketed] });
      }
      return reply(200, { success: true, data: [] });
    }));
    render(<MemoryRouter initialEntries={['/my-trips']}><MyTrips /></MemoryRouter>);
    return reads;
  };
  const cancelFromTheCard = async () => {
    const card = (await screen.findByText('#FLTSD1')).closest('.group');
    fireEvent.click(await within(card).findByRole('button', { name: /Cancel Booking/ }));
    fireEvent.click(within(card).getByRole('button', { name: /Yes, Cancel/ }));
  };

  it('the airline refused after voiding the ticket: the card stops printing the void number as the ticket', async () => {
    const reads = renderMyTrips(ticketedAfter, [502, REFUSAL_502]);

    await cancelFromTheCard();
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toContain(REFUSED_TEXT));

    await waitFor(() => expect(reads.bookings).toBe(2), { timeout: 2000 });
    await waitFor(() => expect((screen.getByText('#FLTSD1')).closest('.group').textContent).not.toMatch(new RegExp(`Ticket${A}`)));
    expect(screen.getByRole('alertdialog').textContent).toContain(REFUSED_TEXT);
  });

  // Fence: a refusal that wrote nothing: the list reads back as it was.
  it('a refusal that changed nothing: says so, and the card reads as it did', async () => {
    const reads = renderMyTrips(ticketed, [409, IN_PROGRESS_409]);

    await cancelFromTheCard();
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toContain(IN_PROGRESS_409.error));

    await waitFor(() => expect(reads.bookings).toBe(2), { timeout: 2000 });
    const card = (await screen.findByText('#FLTSD1')).closest('.group');
    expect(card.textContent).toMatch(/Ticketed/);
    expect(within(card).getByRole('button', { name: /Cancel Booking/ })).toBeTruthy();
  });
});
