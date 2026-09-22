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
 * What My Trips lists under "Failed".
 *
 * The tab lists bookings someone has to act on (needsAttention). A booking
 * whose airline commit never answered was listed there: it has not failed -
 * our team is checking with the airline whether it went through, and the
 * customer was told not to book the trip again. Under "Failed" it said the
 * opposite of its own sentence, and invited the second booking the sentence
 * warns against.
 *
 * The same for a PNR the airline confirmed no seat on: its page says "Seat Not
 * Confirmed" and "Our team will contact you about this booking. Please do not
 * book this trip again in the meantime", and the desk's instruction is to
 * secure the seat with the airline or cancel it. Nothing has failed yet: the
 * reservation is live and its outcome open. Both stay under Upcoming with
 * their sentences.
 */

const base = {
  type: 'flight',
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
  gds: null,
};

// As toClientBooking sends each (commitNeverAnsweredReadBack.test.js asserts
// the first against the real route).
const commitUnknown = {
  ...base,
  id: 1,
  bookingReference: 'FLTUNK1',
  needs_review: { reason: 'chain failed after commit at commit', no_confirmed_seat: false, ticket_numbers_missing: false, commit_unknown: true },
};
const noSeat = {
  ...base,
  id: 2,
  bookingReference: 'FLTNOSEAT',
  status: 'pending_ticketing',
  pnr: 'XYZ789',
  needs_review: { reason: 'chain failed after commit at segmentStatus', no_confirmed_seat: true, ticket_numbers_missing: false, commit_unknown: false },
};
// A booking that really failed, and whose reversal failed too.
const reallyFailed = {
  ...base,
  id: 3,
  bookingReference: 'FLTFAIL1',
  needs_review: { reason: 'charge not reversed after the booking failed', no_confirmed_seat: false, ticket_numbers_missing: false, commit_unknown: false },
};
// A commit that never answered, cancelled by staff, whose refund the gateway refused.
const cancelledRefundStuck = {
  ...commitUnknown,
  id: 4,
  bookingReference: 'FLTUNKCX',
  status: 'cancelled',
  cancellation: { paymentAction: 'REFUND_FAILED', refundAmount: 0, currency: 'USD' },
};
// A plain held reservation, flagged for staff after a later step failed.
const heldForStaff = {
  ...base,
  id: 5,
  bookingReference: 'FLTHELD1',
  status: 'pending_ticketing',
  pnr: 'HELD99',
  needs_review: { reason: 'chain failed after commit at issueTicket', no_confirmed_seat: false, ticket_numbers_missing: false, commit_unknown: false },
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

const ALL = [commitUnknown, noSeat, reallyFailed, cancelledRefundStuck, heldForStaff];

describe('the Failed tab', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('leaves out a commit being checked with the airline and a seat not confirmed yet', async () => {
    const { container } = renderMyTrips(ALL);
    await screen.findByText('#FLTUNK1');

    fireEvent.click(screen.getByRole('button', { name: 'Failed' }));

    const failed = listed(container);
    expect(failed).not.toContain('FLTUNK1');
    expect(failed).not.toContain('FLTNOSEAT');
  });

  it('they stay under Upcoming, with their own sentences', async () => {
    const { container } = renderMyTrips(ALL);
    await screen.findByText('#FLTUNK1');

    const upcoming = listed(container);
    expect(upcoming).toEqual(expect.arrayContaining(['FLTUNK1', 'FLTNOSEAT']));
    expect(container.textContent).toMatch(/checking with the airline whether your booking went through/);
    expect(container.textContent).toMatch(/The airline has not confirmed a seat on every flight/);
  });

  // Fences: what the tab listed before, it still lists.
  it('still lists a booking that failed, a stuck refund on a cancelled one, and a held booking flagged for staff', async () => {
    const { container } = renderMyTrips(ALL);
    await screen.findByText('#FLTUNK1');

    fireEvent.click(screen.getByRole('button', { name: 'Failed' }));

    expect(listed(container)).toEqual(expect.arrayContaining(['FLTFAIL1', 'FLTUNKCX', 'FLTHELD1']));
  });
});
