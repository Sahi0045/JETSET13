import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));

const { default: FlightETicket } = await import('../../frontend/src/Pages/Common/flights/FlightETicket.jsx');
const { documentState, ticketState } = await import('../../frontend/src/utils/eTicket');
const { attentionMessage } = await import('../../frontend/src/utils/bookingStatus');

/**
 * A ticketed booking whose ticket numbers never came back, after the customer's
 * cancel was refused by the airline.
 *
 * The chain flags "ticket_numbers_not_retrieved" on a booking it DID ticket.
 * A refused cancel then writes its own flag on top, and the page read the top
 * reason only: the ticket state went from "Issued, number pending" to "Not yet
 * issued", and the document from "Your ticket has been issued" to "This is a
 * confirmed reservation, not a ticket ... Your seat is held under the PNR".
 * The ticket exists.
 */

// What toClientBooking sends for that booking: the top reason, and the state
// worked out from the whole chain of flags.
const afterRefusedCancel = {
  type: 'flight', bookingReference: 'FLTNUM1', status: 'confirmed', pnr: 'NUM111', payment_status: 'paid',
  origin: 'JFK', destination: 'LHR', departureDate: '2099-01-15', tickets: [],
  gds: { ticketed: true },
  needs_review: {
    reason: 'GDS cancellation failed; refund withheld to avoid paying out against a live booking',
    no_confirmed_seat: false,
    ticket_numbers_missing: true,
  },
};

describe('a ticketed booking whose numbers never came back, after a refused cancel', () => {
  it('is still issued, number pending', () => {
    expect(ticketState(afterRefusedCancel)).toBe('pending');
    expect(documentState(afterRefusedCancel)).toBe('ticket_pending');
  });

  it('the document says the ticket was issued, not that a seat is merely held', () => {
    const text = render(<FlightETicket bookingData={afterRefusedCancel} />).container.textContent;

    expect(text).toMatch(/Your ticket has been issued/);
    expect(text).not.toMatch(/held under the PNR|not a ticket/);
  });

  it('a raw row carrying the chain is read the same way, past a resolved flag too', () => {
    const raw = {
      status: 'confirmed',
      booking_details: {
        pnr: 'NUM111',
        needs_review: {
          reason: 'GDS cancellation failed; refund withheld to avoid paying out against a live booking',
          source: 'cancellation',
          cancelFailed: true,
          resolved_at: '2026-09-22T09:00:00Z',
          previous: { reason: 'ticket_numbers_not_retrieved', expected: 1, got: 0 },
        },
      },
    };
    expect(ticketState(raw)).toBe('pending');
  });

  it('a booking with no such flag anywhere is not called issued', () => {
    expect(ticketState({ ...afterRefusedCancel, needs_review: { ...afterRefusedCancel.needs_review, ticket_numbers_missing: false } })).toBe('none');
  });

  // My Trips and Manage Booking put this sentence beside "Issued, number
  // pending" and a document saying "Your ticket has been issued".
  it('My Trips does not say the ticket has not been issued', () => {
    const top = { ...afterRefusedCancel, needs_review: { reason: 'ticket_numbers_not_retrieved', no_confirmed_seat: false, ticket_numbers_missing: true } };
    for (const booking of [afterRefusedCancel, top]) {
      expect(attentionMessage(booking)).not.toMatch(/not been issued|not issued/);
      expect(attentionMessage(booking)).toMatch(/Your ticket has been issued/);
    }
  });
});
