import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));

const { default: BookingConfirmation } = await import('../../frontend/src/Pages/Common/BookingConfirmation.jsx');
const { NO_CONFIRMED_SEAT_REVIEW_REASON } = await import('../../frontend/src/utils/bookingStatus');

/**
 * The confirmation page for a ticket issued whose number has not come back.
 *
 * The page never read ticketState, so it gave this booking the "held" outcome:
 * "Reservation Held - Your seats are reserved with the airline. Your ticket is
 * being issued and is not ready yet", badge "Ticket pending", and "Our team is
 * finishing your ticket and will email you as soon as it is issued" - beside
 * attention text on the same booking saying the ticket has been issued. My
 * Trips' "View Details" opens this page.
 */

const REFUSED = 'GDS cancellation failed; refund withheld to avoid paying out against a live booking';

// As toClientBooking sends them.
const booking = (needsReview, over = {}) => ({
  type: 'flight', bookingReference: 'FLTNUM8', status: 'confirmed', pnr: 'NUM888', payment_status: 'paid', amount: 291,
  origin: 'JFK', destination: 'LHR', departureDate: '2099-01-15', tickets: [], gds: { ticketed: true },
  needs_review: needsReview, source: 'database',
  ...over,
});
const numbersMissingOnTop = booking({ reason: 'ticket_numbers_not_retrieved', no_confirmed_seat: false, ticket_numbers_missing: true });
const numbersMissingUnderCancel = booking({ reason: REFUSED, no_confirmed_seat: false, ticket_numbers_missing: true });

const confirmationText = (bookingData) => render(
  <MemoryRouter initialEntries={[{ pathname: '/booking-confirmation', state: { bookingData } }]}>
    <BookingConfirmation />
  </MemoryRouter>
).container.textContent;

describe('a ticket issued whose number has not come back', () => {
  for (const [label, bookingData] of [['the flag on top', numbersMissingOnTop], ['under a refused cancel', numbersMissingUnderCancel]]) {
    it(`${label}: says the ticket is issued, never that it is being issued`, () => {
      const text = confirmationText(bookingData);

      expect(text).toMatch(/Your ticket has been issued/);
      expect(text).toMatch(/Ticket issued/);
      expect(text).not.toMatch(/being issued|not ready yet|as soon as it is issued|Reservation Held|Ticket pending/);
    });
  }
});

// Fence: the outcomes next to it, as today.
describe('the outcomes next to it', () => {
  it('a held PNR with no ticket: Reservation Held, being issued', () => {
    const text = confirmationText(booking(null, { status: 'pending_ticketing', gds: { ticketed: false } }));
    expect(text).toMatch(/Reservation Held/);
    expect(text).toMatch(/Your ticket is being issued and is not ready yet/);
    expect(text).toMatch(/Payment received/);
  });

  it('a held PNR flagged for staff: Reservation Held, our team is finishing it', () => {
    const text = confirmationText(booking({ reason: 'chain failed after commit at issueTicket', no_confirmed_seat: false, ticket_numbers_missing: false },
      { status: 'pending_ticketing', gds: { ticketed: false } }));
    expect(text).toMatch(/Reservation Held/);
    expect(text).toMatch(/Our team is finishing your ticket/);
  });

  it('numbers-missing tickets a cancel voided (the server sends false): Reservation Held, not issued', () => {
    const text = confirmationText(booking({ reason: REFUSED, no_confirmed_seat: false, ticket_numbers_missing: false }));
    expect(text).toMatch(/Reservation Held/);
    expect(text).not.toMatch(/Your ticket has been issued/);
  });

  it('a ticket with its number: Booking Confirmed', () => {
    const text = confirmationText(booking(null, { tickets: [{ number: '220-7491174926' }] }));
    expect(text).toMatch(/Booking Confirmed!/);
    expect(text).toMatch(/Your flight is booked and your ticket has been issued/);
  });

  it('no confirmed seat: Seat Not Confirmed', () => {
    const text = confirmationText(booking({ reason: NO_CONFIRMED_SEAT_REVIEW_REASON, no_confirmed_seat: true, ticket_numbers_missing: false },
      { status: 'pending_ticketing', gds: { ticketed: false } }));
    expect(text).toMatch(/Seat Not Confirmed/);
  });

  it('cancelled: Booking Cancelled', () => {
    expect(confirmationText({ ...numbersMissingOnTop, status: 'cancelled' })).toMatch(/Booking Cancelled/);
  });
});
