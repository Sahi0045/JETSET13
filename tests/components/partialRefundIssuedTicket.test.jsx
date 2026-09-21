import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));

const { default: BookingConfirmation } = await import('../../frontend/src/Pages/Common/BookingConfirmation.jsx');
const { attentionMessage } = await import('../../frontend/src/utils/bookingStatus');

/**
 * A refund on a booking whose ticket was issued, its number not read back.
 *
 * The refunded wording was checked before the ticket state, so a partial
 * refund from the Payments tab - a service fee returned as goodwill, say -
 * told the customer "This booking was not completed", and the confirmation
 * page said "Booking Not Completed", while the ticket cell said "Issued,
 * number pending" and the document "Your ticket has been issued". The ticket
 * was issued: the booking was completed, and money was returned.
 */

// As toClientBooking sends it.
const issuedNumberPending = (paymentStatus) => ({
  type: 'flight', bookingReference: 'FLTPR9', status: 'confirmed', pnr: 'PR9999', payment_status: paymentStatus, amount: 291,
  origin: 'JFK', destination: 'LHR', departureDate: '2099-01-15', tickets: [], gds: { ticketed: true }, source: 'database',
  needs_review: { reason: 'ticket_numbers_not_retrieved', no_confirmed_seat: false, ticket_numbers_missing: true },
});

const confirmationText = (bookingData) => render(
  <MemoryRouter initialEntries={[{ pathname: '/booking-confirmation', state: { bookingData } }]}>
    <BookingConfirmation />
  </MemoryRouter>
).container.textContent;

describe('a refund on an issued ticket whose number has not come back', () => {
  it('in part: the ticket is issued and part of the payment was refunded, never "not completed"', () => {
    const booking = issuedNumberPending('partially_refunded');

    expect(attentionMessage(booking)).not.toMatch(/not completed/i);
    expect(attentionMessage(booking)).toMatch(/Your ticket has been issued, and part of your payment for it has been refunded/);
    const text = confirmationText(booking);
    expect(text).not.toMatch(/not completed/i);
    expect(text).toMatch(/Your ticket has been issued, and part of your payment for it has been refunded/);
    expect(text).toMatch(/Partly refunded/);
    expect(text).not.toMatch(/Our team is getting your ticket number/);
  });

  it('in full: the same, never "not completed"', () => {
    const booking = issuedNumberPending('refunded');

    expect(attentionMessage(booking)).not.toMatch(/not completed/i);
    expect(attentionMessage(booking)).toMatch(/Your ticket has been issued, and your payment for it has been refunded/);
    const text = confirmationText(booking);
    expect(text).not.toMatch(/not completed/i);
    expect(text).toMatch(/Payment refunded/);
  });
});

// Fence: the bookings next to it keep today's words.
describe('the bookings next to it', () => {
  it('the same ticket still paid: issued, number on its way', () => {
    const booking = issuedNumberPending('paid');

    expect(attentionMessage(booking)).toBe('Your ticket has been issued, but its ticket number has not reached us yet. Our team is getting it from the airline.');
    const text = confirmationText(booking);
    expect(text).toMatch(/Ticket Issued/);
    expect(text).toMatch(/Our team is getting your ticket number from the airline/);
    expect(text).toMatch(/Payment received/);
  });

  it('a held PNR with no ticket, refunded in part: not completed, part refunded (unchanged)', () => {
    const held = {
      ...issuedNumberPending('partially_refunded'), status: 'pending_ticketing', gds: { ticketed: false },
      needs_review: { reason: 'chain failed after commit at issueTicket', no_confirmed_seat: false, ticket_numbers_missing: false },
    };

    expect(attentionMessage(held)).toBe('This booking was not completed. Part of your payment for it has been refunded; '
      + 'please call (877) 538-7380 with your booking reference about the rest.');
    expect(confirmationText(held)).toMatch(/Booking Not Completed/);
  });

  it('a ticket with its number, refunded in part: Booking Confirmed, Partly refunded (unchanged)', () => {
    const ticketed = { ...issuedNumberPending('partially_refunded'), tickets: [{ number: '220-7491174926' }], needs_review: null };

    expect(attentionMessage(ticketed)).toBeNull();
    const text = confirmationText(ticketed);
    expect(text).toMatch(/Booking Confirmed!/);
    expect(text).toMatch(/Partly refunded/);
  });
});
