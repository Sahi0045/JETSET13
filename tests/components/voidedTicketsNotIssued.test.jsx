import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));

const { default: FlightETicket } = await import('../../frontend/src/Pages/Common/flights/FlightETicket.jsx');
const { canDownloadDocument, documentState, ticketState } = await import('../../frontend/src/utils/eTicket');
const { attentionMessage, isCompletedTrip } = await import('../../frontend/src/utils/bookingStatus');

/**
 * The customer's pages for a ticketed booking whose numbers never came back,
 * after its cancel voided every ticket and PNR_Cancel was refused.
 *
 * Both tickets are void, and the traveller cannot fly on them. The pages said
 * "Your ticket has been issued", "Issued, number pending", and offered a
 * document saying "Your ticket has been issued ... Your booking reference and
 * PNR below are valid".
 */

const A = '125-2412345671';
const B = '125-2412345672';
const REFUSED = 'GDS cancellation failed; refund withheld to avoid paying out against a live booking';
const NUMBERS_MISSING = { reason: 'ticket_numbers_not_retrieved', ticketed: true, expected: 2, got: 0 };

// A raw row, as the page's own walk reads one that carries no server-worked state.
const rawRow = (top, details = {}) => ({
  type: 'flight', status: 'confirmed', payment_status: 'paid',
  booking_details: { pnr: 'VOID11', gds: { ticketed: true }, tickets: [], needs_review: top, ...details },
});
const refusedCancel = (voided, unvoided, extra = {}) => ({
  reason: REFUSED, source: 'cancellation', cancelFailed: true,
  ...(voided ? { voided_tickets: voided, unvoided_tickets: unvoided } : {}),
  previous: NUMBERS_MISSING,
  ...extra,
});

// What toClientBooking sends for each.
const sent = (numbersMissing) => ({
  type: 'flight', bookingReference: 'FLTVOID1', status: 'confirmed', pnr: 'VOID11', payment_status: 'paid',
  origin: 'JFK', destination: 'LHR', departureDate: '2020-01-15', tickets: [], gds: { ticketed: true },
  needs_review: { reason: REFUSED, no_confirmed_seat: false, ticket_numbers_missing: numbersMissing },
});

const ISSUED = /Your ticket has been issued|Issued, number pending/;

describe('every ticket voided, then the cancel refused', () => {
  it('a raw row: not issued, number pending', () => {
    const booking = rawRow(refusedCancel([A, B], []), { voided_tickets: [A, B] });

    expect(ticketState(booking)).toBe('none');
    expect(documentState(booking)).not.toBe('ticket_pending');
  });

  it('a raw row whose refused cancel was resolved since: still not issued', () => {
    const booking = rawRow(refusedCancel([A, B], [], { resolved_at: '2026-09-22T09:00:00Z' }), { voided_tickets: [A, B] });

    expect(ticketState(booking)).toBe('none');
  });

  it('as the server sends it: no page says a ticket was issued, and the trip is never "completed"', () => {
    const booking = sent(false);

    expect(ticketState(booking)).toBe('none');
    expect(attentionMessage(booking)).not.toMatch(ISSUED);
    expect(render(<FlightETicket bookingData={booking} />).container.textContent).not.toMatch(/Your ticket has been issued/);
    expect(isCompletedTrip(booking)).toBe(false);
  });
});

// Fence: the states next to it keep today's answers.
describe('the states next to it', () => {
  it('a refused cancel that voided nothing: issued, number pending', () => {
    expect(ticketState(rawRow(refusedCancel(null, null)))).toBe('pending');
    expect(ticketState(sent(true))).toBe('pending');
    expect(documentState(sent(true))).toBe('ticket_pending');
    expect(canDownloadDocument(sent(true))).toBe(true);
  });

  it('one ticket of two voided: the other is still issued', () => {
    expect(ticketState(rawRow(refusedCancel([A], [B]), { voided_tickets: [A] }))).toBe('pending');
  });

  it('the flag on top, no cancel: issued, number pending', () => {
    expect(ticketState(rawRow(NUMBERS_MISSING))).toBe('pending');
  });

  it('a cancelled booking reads cancelled whatever its flags say', () => {
    expect(ticketState({ ...rawRow(refusedCancel([A, B], []), { voided_tickets: [A, B] }), status: 'cancelled' })).toBe('cancelled');
  });
});
