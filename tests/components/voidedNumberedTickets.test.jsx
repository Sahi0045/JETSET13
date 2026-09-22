import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const mockUseFlightBooking = vi.fn();

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));
vi.mock('../../frontend/src/Pages/Common/Footer', () => ({ default: () => null }));
vi.mock('../../frontend/src/hooks/queries', () => ({
  useFlightBooking: (...args) => mockUseFlightBooking(...args),
}));

const { default: FlightETicket } = await import('../../frontend/src/Pages/Common/flights/FlightETicket.jsx');
const { default: ManageBooking } = await import('../../frontend/src/Pages/Common/flights/ManageBooking.jsx');
const { default: BookingConfirmation } = await import('../../frontend/src/Pages/Common/BookingConfirmation.jsx');
const eTicket = await import('../../frontend/src/utils/eTicket');
const { attentionMessage, bookingStatusBadge, isCompletedTrip } = await import('../../frontend/src/utils/bookingStatus');

/**
 * Tickets with their numbers recorded, voided by a cancel whose PNR_Cancel the
 * airline then refused.
 *
 * The booking keeps its ticket list (the cancel does not prune it) and records
 * the voided numbers on booking_details.voided_tickets and on the refused
 * cancel's flag. ticketState read the list alone, so every page said the
 * ticket was issued: My Trips printed the void numbers, Manage Booking offered
 * "Download E-Ticket", and the document was headed "E-Ticket" with "Ticket #"
 * beside each void number. Nobody can fly on them.
 */

const A = '125-2412345671';
const B = '125-2412345672';
const REFUSED = 'GDS cancellation failed; refund withheld to avoid paying out against a live booking';

const travellers = [
  { id: '1', firstName: 'Dev', lastName: 'Rao', type: 'ADULT' },
  { id: '2', firstName: 'Ira', lastName: 'Rao', type: 'ADULT' },
];
const tickets = [
  { number: A, travelerId: '1', issuedOn: '2026-09-21' },
  { number: B, travelerId: '2', issuedOn: '2026-09-21' },
];

// As toClientBooking sends it.
const sent = (voided, over = {}) => ({
  type: 'flight', bookingReference: 'FLTVN1', status: 'confirmed', pnr: 'VNUM11', payment_status: 'paid', amount: 582,
  origin: 'JFK', destination: 'LHR', departureDate: '2099-01-15', tickets, gds: { ticketed: true },
  travelers: travellers, passengerData: travellers,
  needs_review: { reason: REFUSED, no_confirmed_seat: false, ticket_numbers_missing: false },
  voided_tickets: voided, source: 'database',
  ...over,
});
const allVoided = sent([A, B]);
const oneVoided = sent([A]);
// Not voided at all, not flagged: the booking on main.
const ticketed = sent([], { needs_review: null });

// A raw row, as the page's own walk reads one that carries no server-worked state.
const rawRow = (details) => ({
  type: 'flight', status: 'confirmed', payment_status: 'paid',
  booking_details: { pnr: 'VNUM11', gds: { ticketed: true }, tickets, ...details },
});
const refusedFlag = (voided) => ({ reason: REFUSED, source: 'cancellation', cancelFailed: true, voided_tickets: voided, unvoided_tickets: [] });

const documentText = (bookingData) => render(<FlightETicket bookingData={bookingData} />).container.textContent;

const confirmationText = (bookingData) => render(
  <MemoryRouter initialEntries={[{ pathname: '/booking-confirmation', state: { bookingData } }]}>
    <BookingConfirmation />
  </MemoryRouter>
).container.textContent;

const manageBookingText = (bookingData, { openCancel = false } = {}) => {
  mockUseFlightBooking.mockReturnValue({ data: bookingData, isLoading: false, error: null, refetch: vi.fn() });
  const { container } = render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/manage-booking/FLTVN1']}>
        <Routes>
          <Route path="/manage-booking/:bookingId" element={<ManageBooking />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  if (openCancel) fireEvent.click(screen.getAllByRole('button', { name: /Cancel Booking/ })[0]);
  return container.textContent;
};

describe('every recorded ticket voided, then the cancel refused', () => {
  it('ticketState does not call it issued, from the server\'s list or from a raw row', () => {
    expect(eTicket.ticketState(allVoided)).toBe('none');
    expect(eTicket.ticketState(rawRow({ voided_tickets: [A, B], needs_review: refusedFlag([A, B]) }))).toBe('none');
    // Recorded on the flag only, under a later one, and resolved since.
    expect(eTicket.ticketState(rawRow({
      needs_review: { reason: 'later', resolved_at: '2026-09-22T09:00:00Z', previous: refusedFlag([A, B]) },
    }))).toBe('none');
  });

  it('the document is not an E-Ticket and prints no void number as a ticket', () => {
    const text = documentText(allVoided);

    expect(text).not.toMatch(/E-Ticket/);
    expect(text).not.toMatch(/Ticket #/);
    expect(text).not.toMatch(/Date of Issue/);
    expect(text).not.toMatch(/Your seat is held|once it is issued|Ticket not yet issued/);
    expect(text).toMatch(/Ticket voided — not valid for travel/);
    expect(text).toMatch(/The ticket on this booking has been voided/);
  });

  it('Manage Booking offers no document, and its cancel dialog neither calls the ticket issued nor promises no fee', () => {
    const text = manageBookingText(allVoided, { openCancel: true });

    expect(text).not.toMatch(/Download E-Ticket|Download Booking Confirmation/);
    expect(text).not.toMatch(/Your ticket has been issued/);
    expect(text).not.toMatch(/No ticket has been issued yet, so no cancellation fee applies/);
    expect(text).toMatch(/Your ticket has been voided, so a cancellation fee may apply/);
  });

  it('the confirmation page and the booking\'s sentence say it was voided, not issued or being issued', () => {
    const page = confirmationText(allVoided);
    expect(page).not.toMatch(/Booking Confirmed|your ticket has been issued|Reservation Held|being issued|not ready yet/i);
    expect(page).toMatch(/Ticket Voided/);

    const sentence = attentionMessage(allVoided);
    expect(sentence).toMatch(/Your ticket has been voided and is not valid for travel/);
    expect(sentence).not.toMatch(/has not been issued yet|has been issued/);
    expect(bookingStatusBadge(allVoided).label).not.toBe('Ticketed');
  });

  it('My Trips shows no void number and says voided; the trip is never "completed"', () => {
    expect(eTicket.liveTickets(allVoided)).toEqual([]);
    expect(eTicket.ticketsVoided(allVoided)).toBe(true);
    const trips = readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/login/mytrips.jsx'), 'utf8');
    expect(trips).toMatch(/liveTickets\(booking\)\.map\(\(t\) => t\?\.number\)/);
    expect(trips).toMatch(/if \(ticketsVoided\(booking\)\) return 'Voided';/);
    expect(isCompletedTrip({ ...allVoided, departureDate: '2020-01-15' })).toBe(false);
  });
});

describe('one ticket of two voided', () => {
  it('the voided traveller\'s line says voided, and the other ticket prints as today', () => {
    const text = documentText(oneVoided);

    expect(text).not.toMatch(new RegExp(`Ticket #: ${A}`));
    expect(text).toMatch(/Ticket voided — not valid for travel/);
    expect(text).toMatch(new RegExp(`Ticket #: ${B}`));
    expect(text).toMatch(/E-Ticket/);
    expect(eTicket.liveTickets(oneVoided).map((t) => t.number)).toEqual([B]);
  });
});

/**
 * Fence: a ticket that was not voided looks exactly as it does today.
 */
describe('fence: tickets nobody voided, and the states next to it', () => {
  it('a ticketed booking: issued, an E-Ticket with both numbers, a fee warning, Booking Confirmed', () => {
    expect(eTicket.ticketState(ticketed)).toBe('issued');
    expect(eTicket.documentState(ticketed)).toBe('ticketed');
    expect(bookingStatusBadge(ticketed).label).toBe('Ticketed');
    expect(attentionMessage(ticketed)).toBeNull();
    expect(isCompletedTrip({ ...ticketed, departureDate: '2020-01-15' })).toBe(true);

    const doc = documentText(ticketed);
    expect(doc).toMatch(/E-Ticket/);
    expect(doc).toMatch(new RegExp(`Ticket #: ${A}`));
    expect(doc).toMatch(new RegExp(`Ticket #: ${B}`));
    expect(doc).toMatch(/Date of Issue/);

    const manage = manageBookingText(ticketed, { openCancel: true });
    expect(manage).toMatch(/Download E-Ticket/);
    expect(manage).toMatch(/Your ticket has been issued, so a cancellation fee may apply/);

    expect(confirmationText(ticketed)).toMatch(/Booking Confirmed!/);
  });

  it('the same booking as a raw row, and one sent before the field existed: issued', () => {
    expect(eTicket.ticketState(rawRow({}))).toBe('issued');
    const { voided_tickets: _unused, ...withoutField } = ticketed;
    expect(eTicket.ticketState(withoutField)).toBe('issued');
  });

  it('a refused cancel that voided nothing: still issued', () => {
    expect(eTicket.ticketState(sent([]))).toBe('issued');
    expect(eTicket.ticketState(rawRow({ needs_review: { reason: REFUSED, source: 'cancellation', cancelFailed: true } }))).toBe('issued');
  });

  it('a cancelled booking reads cancelled whatever it voided', () => {
    expect(eTicket.ticketState({ ...allVoided, status: 'cancelled' })).toBe('cancelled');
  });

  it('a held PNR with no ticket: none, held, "Ticket pending"', () => {
    const held = sent([], { tickets: [], gds: { ticketed: false }, needs_review: null, status: 'pending_ticketing' });
    expect(eTicket.ticketState(held)).toBe('none');
    expect(eTicket.documentState(held)).toBe('held');
    expect(bookingStatusBadge(held).label).toBe('Ticket pending');
    expect(attentionMessage(held)).toBeNull();
  });

  it('numbers missing, nothing voided: pending', () => {
    const pending = sent([], { tickets: [], needs_review: { reason: 'ticket_numbers_not_retrieved', no_confirmed_seat: false, ticket_numbers_missing: true } });
    expect(eTicket.ticketState(pending)).toBe('pending');
    expect(eTicket.documentState(pending)).toBe('ticket_pending');
  });
});
