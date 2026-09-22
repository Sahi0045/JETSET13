import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));

const { default: FlightETicket } = await import('../../frontend/src/Pages/Common/flights/FlightETicket.jsx');
const { documentState } = await import('../../frontend/src/utils/eTicket');

/**
 * The "ticket number pending" document on a refunded booking.
 *
 * A ticket was issued and its number never came back; then the Payments tab
 * refunded the booking, in full or in part, without cancelling it. The
 * document said "The ticket number is still being confirmed. We will email
 * your ticket number shortly." Nobody will: ticket sync reads missing numbers
 * for paid bookings only (payment_status paid, completed or confirmed; see
 * tests/backend/ticketSyncNumbersMissing.test.js), and the alarm drops
 * refunded rows. The confirmation page and My Trips already tell this
 * customer to call for it; the document now does too.
 */

// As toClientBooking sends it: issued, number not read back.
const pending = (paymentStatus) => ({
  type: 'flight', bookingReference: 'FLTRP3', status: 'confirmed', pnr: 'RPND33', payment_status: paymentStatus, amount: 291,
  origin: 'JFK', destination: 'LHR', departureDate: '2099-01-15', tickets: [], voided_tickets: [], gds: { ticketed: true },
  needs_review: { reason: 'ticket_numbers_not_retrieved', no_confirmed_seat: false, ticket_numbers_missing: true },
  travelers: [{ id: '1', firstName: 'Asha', lastName: 'Rao', type: 'ADULT' }],
});

const text = (bookingData) => render(<FlightETicket bookingData={bookingData} />).container.textContent;

describe('a refunded booking whose ticket number never came back', () => {
  for (const status of ['refunded', 'partially_refunded', 'reversed']) {
    it(`${status}: promises no email, and says to call for the number`, () => {
      const booking = pending(status);
      expect(documentState(booking)).toBe('ticket_pending');

      const doc = text(booking);
      expect(doc).not.toMatch(/We will email/);
      expect(doc).not.toMatch(/still being confirmed/);
      expect(doc).toMatch(/Your ticket has been issued/);
      expect(doc).toMatch(/If you need your ticket number, call \(877\) 538-7380 with your booking reference/);
    });
  }
});

/**
 * Fence: the paid booking's document, and the other notices, as on main.
 */
describe('fence: the documents next to it', () => {
  it('paid, number pending: the ticket is issued and its number will be emailed', () => {
    const doc = text(pending('paid'));
    expect(doc).toMatch(/Your ticket has been issued\. The ticket number is still being confirmed\./);
    expect(doc).toMatch(/We will email your ticket number shortly\. Your booking reference and PNR below are valid\./);
  });

  it('a held seat, paid: the reservation notice', () => {
    const doc = text({ ...pending('paid'), gds: { ticketed: false }, needs_review: null, status: 'pending_ticketing' });
    expect(doc).toMatch(/This is a confirmed reservation, not a ticket\./);
    expect(doc).toMatch(/We will email your e-ticket once it is issued/);
  });

  it('a ticket with its number, refunded in part: an E-Ticket with its number and no pending notice', () => {
    const doc = text({ ...pending('partially_refunded'), tickets: [{ number: '220-7491174926', travelerId: '1' }], needs_review: null });
    expect(doc).toMatch(/E-Ticket/);
    expect(doc).toMatch(/Ticket #: 220-7491174926/);
    expect(doc).not.toMatch(/ticket number is still being confirmed|If you need your ticket number/);
  });
});
