import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
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

const { default: MyTrips } = await import('../../frontend/src/Pages/Common/login/mytrips.jsx');

/**
 * A reservation the airline holds, waiting only on its ticket, is not listed
 * under "Failed".
 *
 * The desk records a commit that never answered as held under the airline's
 * record locator (resolve-review 'held'): the booking becomes a paid
 * reservation with a live PNR and the flag every unticketed reservation
 * carries (PNR committed, never ticketed). The same for a reservation the
 * order route held for staff after a later step - ticketing, say - failed. My
 * Trips listed both under "Failed", with "Your seats are reserved, but your
 * ticket has not been issued yet" beside them: nothing has failed, the seats
 * are held and a person is issuing the ticket. They stay under Upcoming with
 * that sentence.
 *
 * Only those: a booking that really failed (no PNR, not a commit being
 * checked), a cancelled one whose refund did not go through, and a PNR whose
 * cancellation the airline refused are still listed.
 */

const base = {
  type: 'flight',
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
};

const flag = (reason) => ({ reason, no_confirmed_seat: false, ticket_numbers_missing: false, commit_unknown: false });

// As toClientBooking sends each.
const heldByDesk = {
  ...base,
  id: 1,
  bookingReference: 'FLTDESKHELD',
  status: 'pending_ticketing',
  pnr: 'ABC123',
  gds: { ticketed: false },
  needs_review: flag('PNR committed, never ticketed'),
};
const heldForStaff = {
  ...base,
  id: 2,
  bookingReference: 'FLTHELD1',
  status: 'pending_ticketing',
  pnr: 'HELD99',
  gds: { ticketed: false },
  needs_review: flag('chain failed after commit at issueTicket'),
};
const reallyFailed = {
  ...base,
  id: 3,
  bookingReference: 'FLTFAIL1',
  status: 'pending',
  gds: null,
  needs_review: flag('charge not reversed after the booking failed'),
};
const cancelledRefundStuck = {
  ...heldByDesk,
  id: 4,
  bookingReference: 'FLTHELDCX',
  status: 'cancelled',
  cancellation: { paymentAction: 'REFUND_FAILED', refundAmount: 0, currency: 'USD' },
};
const cancelRefused = {
  ...heldByDesk,
  id: 5,
  bookingReference: 'FLTCXREFUSED',
  pnr: 'LIVE77',
  needs_review: flag('GDS cancellation failed; refund withheld to avoid paying out against a live booking'),
};

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

const listed = (container) => [...container.querySelectorAll('.group p')]
  .map((p) => p.textContent)
  .filter((text) => /^#FLT/.test(text))
  .map((text) => text.slice(1));

const ALL = [heldByDesk, heldForStaff, reallyFailed, cancelledRefundStuck, cancelRefused];

describe('the Failed tab', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('leaves out a reservation held at the airline that is only waiting on its ticket', async () => {
    const { container } = renderMyTrips(ALL);
    await screen.findByText('#FLTDESKHELD');

    fireEvent.click(screen.getByRole('button', { name: 'Failed' }));

    const failed = listed(container);
    expect(failed).not.toContain('FLTDESKHELD');
    expect(failed).not.toContain('FLTHELD1');
  });

  it('they stay under Upcoming, saying the seats are reserved', async () => {
    const { container } = renderMyTrips([heldByDesk, heldForStaff]);
    await screen.findByText('#FLTDESKHELD');

    expect(listed(container)).toEqual(expect.arrayContaining(['FLTDESKHELD', 'FLTHELD1']));
    expect(container.textContent).toMatch(/Your seats are reserved, but your ticket has not been issued yet/);
  });

  // Fences: the rest of what the tab listed, it still lists.
  it('still lists a booking that failed, a cancelled one whose refund failed, and a cancel the airline refused', async () => {
    const { container } = renderMyTrips(ALL);
    await screen.findByText('#FLTDESKHELD');

    fireEvent.click(screen.getByRole('button', { name: 'Failed' }));

    expect(listed(container)).toEqual(expect.arrayContaining(['FLTFAIL1', 'FLTHELDCX', 'FLTCXREFUSED']));
  });
});
