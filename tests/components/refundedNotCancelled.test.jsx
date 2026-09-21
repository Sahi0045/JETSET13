import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/Pages/Common/Navbar', () => ({ default: () => null }));

const { default: BookingConfirmation } = await import('../../frontend/src/Pages/Common/BookingConfirmation.jsx');
const { attentionMessage, bookingStatusBadge, NO_CONFIRMED_SEAT_REVIEW_REASON } = await import('../../frontend/src/utils/bookingStatus');

/**
 * A flight refunded without being cancelled.
 *
 * The Payments tab refunds a payment and writes payment_status, nothing else,
 * so the booking keeps its status and its review flag. The customer's pages
 * spoke of the money without reading that record: "Our team is looking after
 * your payment", "Payment received", "Total Paid", "This booking has not been
 * paid for", "Awaiting payment", and for a seatless PNR "do not book this trip
 * again". Each was false of a refunded booking.
 */

// As toClientBooking sends them.
const base = {
  type: 'flight', bookingReference: 'FLTREF1', status: 'pending', payment_status: 'refunded', amount: 291,
  origin: 'JFK', destination: 'LHR', departureDate: '2099-01-15', tickets: [], source: 'database',
};
const flaggedNoPnr = {
  ...base,
  needs_review: { reason: 'Paid, but the customer never came back to finish booking.', no_confirmed_seat: false, ticket_numbers_missing: false },
};
const unflaggedNoPnr = { ...base, needs_review: null };
const seatless = {
  ...base, status: 'pending_ticketing', pnr: 'SEAT42',
  needs_review: { reason: NO_CONFIRMED_SEAT_REVIEW_REASON, no_confirmed_seat: true, ticket_numbers_missing: false },
};
const queued = { ...unflaggedNoPnr, queued: true };

const confirmationText = (bookingData) => render(
  <MemoryRouter initialEntries={[{ pathname: '/booking-confirmation', state: { bookingData } }]}>
    <BookingConfirmation />
  </MemoryRouter>
).container.textContent;

const HELD_OR_UNPAID = /looking after your payment|Payment received|Total Paid|has not been paid for|Payment not received|Your payment is complete|do not book this trip again/i;

describe('a flight refunded without being cancelled', () => {
  it('flagged, with no PNR: the confirmation page and My Trips say it was refunded', () => {
    const text = confirmationText(flaggedNoPnr);

    expect(text).toMatch(/your payment for it has been refunded/);
    expect(text).toMatch(/Payment refunded/);
    expect(text).not.toMatch(HELD_OR_UNPAID);
    expect(attentionMessage(flaggedNoPnr)).toMatch(/your payment for it has been refunded/);
    expect(attentionMessage(flaggedNoPnr)).not.toMatch(HELD_OR_UNPAID);
  });

  it('unflagged, with no PNR: not "not paid for", and its badge is not "Awaiting payment"', () => {
    const text = confirmationText(unflaggedNoPnr);

    expect(text).toMatch(/your payment for it has been refunded/);
    expect(text).not.toMatch(HELD_OR_UNPAID);
    expect(bookingStatusBadge(unflaggedNoPnr).label).toBe('Refunded');
  });

  it('a seatless PNR refunded: not told to hold off rebooking a trip it no longer pays for', () => {
    expect(confirmationText(seatless)).not.toMatch(HELD_OR_UNPAID);
    expect(attentionMessage(seatless)).toMatch(/has been refunded/);
    expect(attentionMessage(seatless)).not.toMatch(HELD_OR_UNPAID);
  });

  it('still queued when it was refunded: not "Your payment is complete"', () => {
    expect(confirmationText(queued)).not.toMatch(HELD_OR_UNPAID);
  });

  it('refunded in part: says part of it was', () => {
    const partly = { ...flaggedNoPnr, payment_status: 'partially_refunded' };
    expect(confirmationText(partly)).toMatch(/Part of your payment for it has been refunded/);
    expect(attentionMessage(partly)).toMatch(/Part of your payment for it has been refunded/);
    expect(bookingStatusBadge({ ...unflaggedNoPnr, payment_status: 'partially_refunded' }).label).toBe('Partly refunded');
  });

  it('still paid: keeps today\'s wording', () => {
    const paid = { ...flaggedNoPnr, payment_status: 'paid' };
    expect(confirmationText(paid)).toMatch(/Our team is looking after your payment/);
    expect(confirmationText(paid)).toMatch(/Payment received/);
    expect(attentionMessage(paid)).toMatch(/Our team is looking after your payment/);
  });
});
