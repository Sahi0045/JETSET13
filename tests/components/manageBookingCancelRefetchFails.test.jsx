import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({
    user: { id: '0b7c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4', email: 'jane@example.com' }, isAuthenticated: true, session: null, loading: false,
  }),
}));
vi.mock('../../frontend/src/utils/authHeaders', () => ({ authHeaders: async (headers = {}) => headers }));

// The real useFlightBooking and the real ArcPayService: the booking read and
// the cancel go through fetch, as they do live.
const { default: ManageBooking } = await import('../../frontend/src/Pages/Common/flights/ManageBooking.jsx');

/**
 * A cancel lost to the network, on Manage Booking opened from a link or after
 * a reload (no booking handed over by My Trips).
 *
 * Every cancel answer that is not a success reads the booking again, since a
 * refusal can come after the cancel changed it. When the connection is gone,
 * that read fails too, after its retries - and the page read "the booking
 * could not be read, and nothing was handed over" as "there is no booking to
 * show": the whole page became "We couldn't open this booking / Failed to
 * fetch / Booked without an account? Enter the email used when booking". A
 * signed-in customer lost the booking they were looking at and the cancel's
 * own answer, with its phone number.
 *
 * A booking the page has already read is shown on: with the cancel's answer,
 * and the note that it may be out of date.
 */

const REF = 'FLTNET1';
const travellers = [{ id: '1', firstName: 'Jane', lastName: 'Doe', type: 'ADULT' }];
const ticketed = {
  id: 'bk-1', type: 'flight', bookingReference: REF, orderId: REF, totalAmount: 291, amount: 291, currency: 'USD',
  paymentStatus: 'paid', payment_status: 'paid', pnr: 'NET1PN', origin: 'JFK', destination: 'LHR', departureDate: '2099-11-15',
  queued: false, cancellation: null, voided_tickets: [], travelers: travellers, passengerData: travellers, cancel_failed: false,
  status: 'confirmed', tickets: [{ number: '220-1111111111', travelerId: '1' }], needs_review: null, gds: { ticketed: true },
};
const NETWORK_REFUSAL = 'We could not reach our servers to cancel this booking. Please check your connection and try again, or call (877) 538-7380.';
const REFUSED_TEXT = 'This booking is already being cancelled.';

const reply = (status, body) => ({
  ok: status >= 200 && status < 300, status, statusText: '',
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null), forEach: (fn) => fn('application/json', 'content-type') },
  text: async () => JSON.stringify(body),
  json: async () => body,
});

afterEach(() => vi.unstubAllGlobals());

/**
 * The page opened by reference alone. `cancel` answers the cancel POST, or
 * throws for a connection that is gone; `online` decides every booking read.
 */
const openByLink = ({ cancel, readsAfterCancel = 'fail' }) => {
  const reads = { before: 0, after: 0 };
  let cancelled = false;
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (String(url).includes('/cancel')) {
      cancelled = true;
      return cancel();
    }
    if (String(url).includes(`flights/bookings/${REF}`)) {
      if (!cancelled) { reads.before += 1; return reply(200, { success: true, data: ticketed }); }
      reads.after += 1;
      if (readsAfterCancel === 'fail') throw new TypeError('Failed to fetch');
      return reply(200, { success: true, data: ticketed });
    }
    return reply(200, { success: true });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/manage-booking/${REF}`]}>
        <Routes><Route path="/manage-booking/:bookingId" element={<ManageBooking />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...view, reads };
};

const cancelThroughThePopUp = () => {
  fireEvent.click(screen.getAllByRole('button', { name: /Cancel Booking/ })[0]);
  const buttons = screen.getAllByRole('button', { name: /^Cancel Booking$/ });
  fireEvent.click(buttons[buttons.length - 1]);
};

describe('Manage Booking opened from a link, when the cancel and the read after it both fail', () => {
  it('keeps the booking and the cancel\'s own answer, and says the page may be out of date', async () => {
    const { container, reads } = openByLink({ cancel: () => { throw new TypeError('Failed to fetch'); } });
    await waitFor(() => expect(container.textContent).toMatch(/Booking Status: Ticketed/));

    cancelThroughThePopUp();
    await waitFor(() => expect(container.textContent).toContain(NETWORK_REFUSAL));
    // The read after the answer, and its retries, all fail.
    await waitFor(() => expect(reads.after).toBe(3));
    await waitFor(() => expect(container.textContent).toMatch(/could not refresh this booking/));

    expect(container.textContent).not.toMatch(/We couldn't open this booking/);
    expect(container.textContent).toContain(NETWORK_REFUSAL);
    expect(container.textContent).toMatch(/Booking Status: Ticketed/);
    expect(container.textContent).toContain(REF);
  });

  it('a refusal the server answered, and a read after it that fails: the refusal stays on the page', async () => {
    const { container, reads } = openByLink({ cancel: () => reply(409, { success: false, code: 'CANCEL_IN_PROGRESS', error: REFUSED_TEXT }) });
    await waitFor(() => expect(container.textContent).toMatch(/Booking Status: Ticketed/));

    cancelThroughThePopUp();
    await waitFor(() => expect(reads.after).toBe(3));
    await waitFor(() => expect(container.textContent).toMatch(/could not refresh this booking/));

    expect(container.textContent).not.toMatch(/We couldn't open this booking/);
    expect(container.textContent).toContain(REFUSED_TEXT);
  });
});

// Fences: the pages around it, unchanged.
describe('around it', () => {
  it('a booking that could never be read still shows the error screen, with the guest lookup', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/manage-booking/${REF}`]}>
          <Routes><Route path="/manage-booking/:bookingId" element={<ManageBooking />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => expect(container.textContent).toMatch(/We couldn't open this booking/));
    expect(container.textContent).toMatch(/Booked without an account\? Enter the email used when booking/);
  });

  it('a read after the refusal that succeeds shows no out-of-date note', async () => {
    const { container, reads } = openByLink({
      cancel: () => reply(409, { success: false, code: 'CANCEL_IN_PROGRESS', error: REFUSED_TEXT }),
      readsAfterCancel: 'ok',
    });
    await waitFor(() => expect(container.textContent).toMatch(/Booking Status: Ticketed/));

    cancelThroughThePopUp();
    await waitFor(() => expect(reads.after).toBe(1));
    await waitFor(() => expect(container.textContent).toContain(REFUSED_TEXT));

    expect(container.textContent).not.toMatch(/could not refresh this booking/);
    expect(container.textContent).toMatch(/Booking Status: Ticketed/);
  });
});
