import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));

const { default: BookingConfirmation } = await import('../../frontend/src/Pages/Common/BookingConfirmation.jsx');
const { canDownloadDocument, documentState, hasNoConfirmedSeat } = await import('../../frontend/src/utils/eTicket');
const { attentionMessage, NO_CONFIRMED_SEAT_REVIEW_REASON } = await import('../../frontend/src/utils/bookingStatus');

/**
 * The customer's pages for a PNR the airline confirmed no seat on, once a
 * person resolved its flag.
 *
 * Resolving says a person dealt with it, not that the airline gave a seat.
 * The pages said "Reservation Held - Your seats are reserved", "Your seats are
 * reserved, but your ticket has not been issued yet", and offered the PDF
 * "Your seat is held under the PNR below". They keep the not-confirmed wording
 * until the booking itself records a ticket. (The server's side, and the order
 * route, are in tests/backend/resolvedSeatlessStays.test.js.)
 */

const RESOLVED = { resolved_at: '2026-09-22T09:00:00Z', resolution: 'called the customer' };
const REFUSED = 'GDS cancellation failed; refund withheld to avoid paying out against a live booking';

// A raw row, as the pages' own walk reads one that carries no server-worked state.
const raw = (top, details = {}) => ({
  type: 'flight', bookingReference: 'FLTSEAT7', status: 'pending_ticketing', payment_status: 'paid',
  origin: 'JFK', destination: 'LHR', departureDate: '2099-01-15',
  booking_details: { pnr: 'SEAT77', gds: { ticketed: false }, tickets: [], needs_review: top, ...details },
});
const seatless = (extra = {}) => ({ reason: NO_CONFIRMED_SEAT_REVIEW_REASON, ...extra });

const SEAT_HELD = /Reservation Held|seats? (are|is) (reserved|held)|held under the PNR/i;

const confirmationText = (bookingData) => render(
  <MemoryRouter initialEntries={[{ pathname: '/booking-confirmation', state: { bookingData } }]}>
    <BookingConfirmation />
  </MemoryRouter>
).container.textContent;

describe('a no-seat flag a person resolved, with no ticket', () => {
  for (const [label, top] of [
    ['resolved on top', seatless(RESOLVED)],
    ['under a refused cancel a person resolved', { reason: REFUSED, source: 'cancellation', cancelFailed: true, previous: seatless(), ...RESOLVED }],
  ]) {
    it(`${label}: every page keeps "not confirmed", and no held-seat document`, () => {
      const booking = raw(top);

      expect(hasNoConfirmedSeat(booking)).toBe(true);
      expect(documentState(booking)).toBe('no_confirmed_seat');
      expect(canDownloadDocument(booking)).toBe(false);
      expect(attentionMessage(booking)).toMatch(/The airline has not confirmed a seat on every flight/);
      const text = confirmationText(booking);
      expect(text).toMatch(/Seat Not Confirmed/);
      expect(text).not.toMatch(SEAT_HELD);
    });
  }
});

// Fence: the bookings next to it keep today's answers.
describe('the bookings next to it', () => {
  it('the flag not resolved: not confirmed', () => {
    expect(hasNoConfirmedSeat(raw(seatless()))).toBe(true);
    expect(canDownloadDocument(raw(seatless()))).toBe(false);
  });

  it('a resolved no-seat flag on a booking that has since recorded its ticket: ticketed', () => {
    const booking = raw(seatless(RESOLVED), { gds: { ticketed: true }, tickets: [{ number: '220-7491174926' }] });

    expect(hasNoConfirmedSeat(booking)).toBe(false);
    expect(documentState(booking)).toBe('ticketed');
    expect(canDownloadDocument(booking)).toBe(true);
  });

  it('a held PNR that never had the flag: held, and its document offered', () => {
    const booking = raw({ reason: 'chain failed after commit at issueTicket', ...RESOLVED });

    expect(hasNoConfirmedSeat(booking)).toBe(false);
    expect(documentState(booking)).toBe('held');
    expect(canDownloadDocument(booking)).toBe(true);
  });

  it('the server\'s answer is taken as sent', () => {
    const sent = { type: 'flight', status: 'pending_ticketing', pnr: 'SEAT77', payment_status: 'paid', tickets: [] };
    expect(hasNoConfirmedSeat({ ...sent, needs_review: { reason: NO_CONFIRMED_SEAT_REVIEW_REASON, no_confirmed_seat: true } })).toBe(true);
    expect(hasNoConfirmedSeat({ ...sent, needs_review: { reason: REFUSED, no_confirmed_seat: false } })).toBe(false);
  });
});
