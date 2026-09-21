import { describe, expect, it } from 'vitest';
import { attentionMessage, bookingStatusBadge, needsAttention } from '../../frontend/src/utils/bookingStatus';

/**
 * A flagged flight refunded without being cancelled, in My Trips.
 *
 * The Payments tab writes payment_status alone, so the booking keeps its
 * review flag. Its sentence said it was refunded, but its badge said "Needs
 * attention" and it sat in My Trips' "Failed" tab (needsAttention), though
 * nothing is waiting on the customer or on a refund. The same booking with no
 * flag was badged "Refunded" and was not in that tab.
 */

// As toClientBooking sends them.
const flagged = (over = {}) => ({
  type: 'flight', bookingReference: 'FLTRB1', status: 'pending_ticketing', pnr: 'RB1111', payment_status: 'refunded',
  tickets: [], gds: { ticketed: false },
  needs_review: { reason: 'chain failed after commit at issueTicket', no_confirmed_seat: false, ticket_numbers_missing: false },
  ...over,
});

describe('a flagged flight refunded without being cancelled', () => {
  it('gets the Refunded badge, and is not in the Failed tab', () => {
    expect(bookingStatusBadge(flagged())).toEqual({ label: 'Refunded', tone: 'neutral' });
    expect(needsAttention(flagged())).toBe(false);
  });

  it('refunded in part: Partly refunded', () => {
    expect(bookingStatusBadge(flagged({ payment_status: 'partially_refunded' })).label).toBe('Partly refunded');
    expect(needsAttention(flagged({ payment_status: 'partially_refunded' }))).toBe(false);
  });

  it('with no PNR, too', () => {
    const noPnr = flagged({ pnr: null, status: 'pending', needs_review: { reason: 'charge not reversed after the booking failed' } });
    expect(bookingStatusBadge(noPnr).label).toBe('Refunded');
    expect(needsAttention(noPnr)).toBe(false);
  });
});

// Fence: what the badge, the tab and the sentence say of the bookings next to it.
describe('the bookings next to it', () => {
  it('its sentence still says it was refunded', () => {
    expect(attentionMessage(flagged())).toBe('This booking was not completed, and your payment for it has been refunded. '
      + 'If you have any questions, call (877) 538-7380 with your booking reference.');
  });

  it('the same booking still paid: Needs attention, in the Failed tab', () => {
    expect(bookingStatusBadge(flagged({ payment_status: 'paid' })).label).toBe('Needs attention');
    expect(needsAttention(flagged({ payment_status: 'paid' }))).toBe(true);
  });

  it('refunded with no flag: Refunded, not in the Failed tab', () => {
    expect(bookingStatusBadge(flagged({ needs_review: null })).label).toBe('Refunded');
    expect(needsAttention(flagged({ needs_review: null }))).toBe(false);
    expect(attentionMessage(flagged({ needs_review: null }))).toBeNull();
  });

  it('cancelled and refunded: Cancelled; a cancellation whose refund failed stays in the Failed tab', () => {
    expect(bookingStatusBadge(flagged({ status: 'cancelled' })).label).toBe('Cancelled');
    expect(needsAttention(flagged({ status: 'cancelled' }))).toBe(false);
    const stuck = flagged({ status: 'cancelled', cancellation: { paymentAction: 'REFUND_FAILED' } });
    expect(needsAttention(stuck)).toBe(true);
    expect(attentionMessage(stuck)).toMatch(/did not go through/);
  });

  it('ticketed and refunded: Ticketed, as before', () => {
    const ticketed = flagged({ status: 'confirmed', tickets: [{ number: '220-7491174926' }], gds: { ticketed: true } });
    expect(bookingStatusBadge(ticketed).label).toBe('Ticketed');
    expect(needsAttention(ticketed)).toBe(false);
  });
});
