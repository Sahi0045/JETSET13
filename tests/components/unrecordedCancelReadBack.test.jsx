import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import path from 'node:path';
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
const { attentionMessage, bookingStatusBadge, isCompletedTrip } = await import('../../frontend/src/utils/bookingStatus');
const { canDownloadDocument, ticketState } = await import('../../frontend/src/utils/eTicket');

/**
 * A cancel that went through and could not be recorded, opened again from
 * My Trips, Manage Booking or My Trips "View Details".
 *
 * The cancel voided every ticket, released the PNR and voided the payment;
 * its final "cancelled" write failed (flagUnrecordedCancellation). The
 * customer was told "Your cancellation was processed, but we could not save
 * it. Please do not try again - call (877) 538-7380". The row still reads
 * confirmed, paid and ticketed, and the flag names no voided number.
 *
 * Every page read the row: the badge said Ticketed, Manage Booking offered
 * "Download E-Ticket" of the void number, and "View Details" said "Booking
 * Confirmed! ... your ticket has been issued". The server now names the state
 * (needs_review.unrecorded_cancellation - asserted against the real
 * toClientBooking in tests/backend/unrecordedCancelOtherSurfaces.test.js).
 */

const A = '220-1111111111';
const REASON = 'cancellation carried out but not recorded: airline reservation released, payment VOID 291 USD; '
  + 'check the airline and ARC Pay and record it by hand';
const REFUSED = 'GDS cancellation failed; refund withheld to avoid paying out against a live booking';
const travellers = [{ id: '1', firstName: 'Jane', lastName: 'Doe', type: 'ADULT' }];

const named = (state = {}) => ({
  reason: REASON, no_confirmed_seat: false, ticket_numbers_missing: false, commit_unknown: false, unrecorded_cancellation: false, ...state,
});

// As both booking reads send it (toClientBooking), and as My Trips keeps it.
const sent = (over = {}) => ({
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
  needs_review: named({ unrecorded_cancellation: true }),
  gds: { ticketed: true },
  source: 'database',
  ...over,
});
const unrecorded = sent();

// A raw row, which names nothing: the page walks the flags itself.
const rawRow = {
  type: 'flight', status: 'confirmed', payment_status: 'paid',
  booking_details: {
    pnr: 'HELD99', gds: { ticketed: true }, tickets: [{ number: A, travelerId: '1' }],
    needs_review: { reason: REASON, source: 'cancellation', unrecorded: true, ticketsVoided: true, paymentAction: 'VOID', refundAmount: 291 },
  },
};

const UNRECORDED = 'Your cancellation went through, but our record of it is still being updated, so this booking may not show as cancelled yet. '
  + 'It is not valid for travel. Our team will confirm what happened to your payment - please do not try again. '
  + 'If you have any questions, call (877) 538-7380 with your booking reference.';

const confirmationText = (bookingData) => render(
  <MemoryRouter initialEntries={[{ pathname: '/booking-confirmation', state: { bookingData } }]}>
    <BookingConfirmation />
  </MemoryRouter>
).container.textContent;

const manageBookingText = (bookingData) => {
  mockUseFlightBooking.mockReturnValue({ data: bookingData, isLoading: false, error: null, refetch: vi.fn() });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[{ pathname: `/manage-booking/${bookingData.bookingReference}`, state: { bookingData } }]}>
        <Routes>
          <Route path="/manage-booking/:bookingId" element={<ManageBooking />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  ).container.textContent;
};

describe('a cancel that went through and could not be recorded, read from its row', () => {
  beforeEach(() => mockUseFlightBooking.mockReset());

  it.each([
    ['as the server names it', unrecorded],
    ['from a raw row', rawRow],
  ])('the My Trips and Manage Booking sentence says the cancellation went through (%s)', (_label, row) => {
    expect(attentionMessage(row)).toBe(UNRECORDED);
    expect(bookingStatusBadge(row).label).toBe('Needs attention');
  });

  it('the void ticket is not called issued, and the trip is never "completed"', () => {
    expect(ticketState(unrecorded)).toBe('cancelled');
    expect(canDownloadDocument(unrecorded)).toBe(false);
    expect(isCompletedTrip({ ...unrecorded, departureDate: '2020-01-15' })).toBe(false);
  });

  it('Manage Booking says it, and offers no document and no second cancel', () => {
    const text = manageBookingText(unrecorded);

    expect(text).toContain(UNRECORDED);
    expect(text).not.toMatch(/Download E-Ticket|Download Booking Confirmation/);
    expect(text).not.toMatch(/Booking Status: Ticketed/);
    // Told "Please do not try again": its dialog said no ticket had been issued.
    expect(text).not.toMatch(/Cancel Booking/);
  });

  it('My Trips "View Details" is not "Booking Confirmed", and does not say the payment was received', () => {
    const text = confirmationText(unrecorded);

    expect(text).not.toMatch(/Booking Confirmed|your ticket has been issued|Reservation Held|Payment received/i);
    expect(text).toMatch(/Cancellation Being Recorded/);
    expect(text).toMatch(/Your cancellation went through, but our record of it is still being updated/);
    expect(text).toMatch(/please do not try again/i);
    expect(text).toMatch(/\(877\) 538-7380/);
  });

  it('the My Trips card prints no void number as a ticket, and offers no second cancel', () => {
    const trips = readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/login/mytrips.jsx'), 'utf8');
    expect(trips).toMatch(/if \(ticketState\(booking\) === 'cancelled'\) return 'Cancelled';/);
    expect(trips).toMatch(/statusUp !== 'CANCELLED' && statusUp !== 'FAILED' && ticketState\(booking\) !== 'cancelled' && \(daysUntilTrip/);
  });
});

// Fences: the states next to it read exactly as before.
describe('next to it', () => {
  beforeEach(() => mockUseFlightBooking.mockReset());

  it('a ticketed booking nobody cancelled: Ticketed, an E-Ticket, "Booking Confirmed!"', () => {
    const ticketed = sent({ needs_review: null });

    expect(attentionMessage(ticketed)).toBeNull();
    expect(bookingStatusBadge(ticketed).label).toBe('Ticketed');
    expect(ticketState(ticketed)).toBe('issued');
    const manage = manageBookingText(ticketed);
    expect(manage).toMatch(/Download E-Ticket/);
    expect(manage).toMatch(/Cancel Booking/);
    expect(confirmationText(ticketed)).toMatch(/Booking Confirmed!/);
  });

  it('recorded cancelled: "Booking Cancelled", as before', () => {
    const cancelled = sent({ status: 'cancelled', payment_status: 'refunded', paymentStatus: 'refunded' });

    expect(bookingStatusBadge(cancelled).label).toBe('Cancelled');
    expect(confirmationText(cancelled)).toMatch(/Booking Cancelled/);
  });

  it('a cancel the airline refused, nothing voided: still ticketed', () => {
    const refused = sent({ needs_review: named({ reason: REFUSED }) });

    expect(ticketState(refused)).toBe('issued');
    expect(bookingStatusBadge(refused).label).toBe('Ticketed');
    expect(confirmationText(refused)).toMatch(/Booking Confirmed!/);
  });

  it('a cancel the airline refused after voiding every ticket: "Ticket Voided"', () => {
    const voided = sent({ voided_tickets: [A], needs_review: named({ reason: REFUSED }) });

    expect(attentionMessage(voided)).toMatch(/Your ticket has been voided and is not valid for travel/);
    expect(confirmationText(voided)).toMatch(/Ticket Voided/);
  });

  it('a commit that never answered: we are checking', () => {
    const checking = sent({
      pnr: undefined, status: 'pending', tickets: [], gds: null,
      needs_review: named({ reason: 'chain failed after commit at commit', commit_unknown: true }),
    });

    expect(attentionMessage(checking)).toMatch(/checking with the airline whether your booking went through/);
    expect(confirmationText(checking)).toMatch(/Checking With the Airline/);
  });

  it('a PNR the airline confirmed no seat on: "Seat Not Confirmed"', () => {
    const noSeat = sent({
      status: 'pending_ticketing', tickets: [], gds: { ticketed: false },
      needs_review: named({ reason: 'chain failed after commit at segmentStatus', no_confirmed_seat: true }),
    });

    expect(attentionMessage(noSeat)).toMatch(/The airline has not confirmed a seat on every flight/);
    expect(confirmationText(noSeat)).toMatch(/Seat Not Confirmed/);
  });
});
