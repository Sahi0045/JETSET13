import { describe, expect, it } from 'vitest';
import { attentionMessage, bookingStatusBadge, cancellationMessage, needsAttention, needsManualRefund, refundStatus } from '../../frontend/src/utils/bookingStatus';

/**
 * What My Trips tells a customer about their booking.
 *
 * The badge came from `status` alone and fell back to "Confirmed" for anything
 * unmapped, so a reservation with no ticket and a status nobody had mapped both
 * read as a confirmed trip. The "Failed" tab matched a status nothing writes,
 * and a refused refund was reported as "cancelled successfully".
 */
describe('bookingStatusBadge', () => {
  it('never calls a status it does not know "Confirmed"', () => {
    expect(bookingStatusBadge({ type: 'hotel', status: null }).label).toBe('Status unavailable');
    expect(bookingStatusBadge({ type: 'hotel', status: 'on_hold' }).label).toBe('On Hold');
  });

  it('calls a flight with a PNR and no ticket pending, whatever its status says', () => {
    expect(bookingStatusBadge({ type: 'flight', status: 'confirmed', pnr: 'ABC123', tickets: [] }).label).toBe('Ticket pending');
    expect(bookingStatusBadge({ type: 'flight', status: 'pending_ticketing', pnr: 'ABC123' }).label).toBe('Ticket pending');
    expect(bookingStatusBadge({ type: 'flight', status: 'paid', pnr: 'ABC123' }).label).toBe('Ticket pending');
  });

  it('calls a flight with ticket numbers ticketed', () => {
    const badge = bookingStatusBadge({ type: 'flight', status: 'confirmed', pnr: 'ABC123', tickets: [{ number: '220-7491174926' }] });
    expect(badge).toEqual({ label: 'Ticketed', tone: 'success' });
  });

  it('shows cancelled, and flags what needs attention', () => {
    expect(bookingStatusBadge({ type: 'flight', status: 'cancelled' }).label).toBe('Cancelled');
    expect(bookingStatusBadge({ type: 'flight', status: 'pending_ticketing', pnr: 'ABC', needs_review: { reason: 'x' } }).label)
      .toBe('Needs attention');
  });

  it('keeps non-flight confirmations as they were', () => {
    expect(bookingStatusBadge({ type: 'cruise', status: 'confirmed' }).label).toBe('Confirmed');
    expect(bookingStatusBadge({ type: 'hotel', status: 'paid' }).label).toBe('Paid');
  });
});

describe('needsAttention', () => {
  it('catches a reservation flagged for review that has no ticket', () => {
    expect(needsAttention({ status: 'pending_ticketing', needs_review: { reason: 'chain failed after commit at issueTicket' } })).toBe(true);
  });

  it('catches a cancellation whose refund did not go through', () => {
    expect(needsAttention({ status: 'cancelled', cancellation: { paymentAction: 'REFUND_FAILED' } })).toBe(true);
    expect(needsAttention({ status: 'cancelled', booking_details: { cancellation: { paymentAction: 'VOID_FAILED' } } })).toBe(true);
  });

  it('leaves alone what is settled', () => {
    expect(needsAttention({ status: 'cancelled', cancellation: { paymentAction: 'FULL_REFUND' } })).toBe(false);
    expect(needsAttention({ status: 'confirmed', tickets: [{ number: '1' }], needs_review: { reason: 'x' } })).toBe(false);
    expect(needsAttention({ status: 'pending' })).toBe(false);
  });
});

describe('cancellationMessage', () => {
  it('says plainly when the refund did not go through', () => {
    const text = cancellationMessage({ success: true, cancellation: { paymentAction: 'REFUND_FAILED', refundAmount: 0 } });
    expect(text).toMatch(/did not go through/);
    expect(text).toMatch(/Nothing has been returned/);
    expect(text).not.toMatch(/successfully/);
  });

  it('says no refund is due when the fee covers the fare', () => {
    expect(cancellationMessage({ cancellation: { paymentAction: 'NO_REFUND_FEE_COVERS' } })).toMatch(/no refund is due/);
  });

  it('gives the refund amount in its own currency', () => {
    expect(cancellationMessage({ cancellation: { paymentAction: 'PARTIAL_REFUND', refundAmount: 215.5, currency: 'USD' } }))
      .toMatch(/\$215\.50/);
  });

  it('promises nothing it does not know', () => {
    expect(cancellationMessage({ success: true })).toMatch(/email you the refund details/);
  });
});

/**
 * "View Details" and Manage Booking said what `status` said. A cancellation
 * whose refund failed could read "refunded" off `payment_status`, a queued
 * booking read as a reservation, and a paid checkout the airline never saw as
 * "Awaiting payment".
 */
describe('refundStatus', () => {
  const cancelled = (cancellation, over = {}) => ({ type: 'flight', status: 'cancelled', cancellation, ...over });

  it('is nothing for a booking that is not cancelled', () => {
    expect(refundStatus({ status: 'confirmed', payment_status: 'refunded' })).toBeNull();
  });

  it('never says refunded when the reversal failed, whatever payment_status says', () => {
    const status = refundStatus(cancelled({ paymentAction: 'REFUND_FAILED', refundAmount: 0 }, { payment_status: 'refunded' }));
    expect(status).toEqual({ key: 'failed', label: 'Refund not processed', tone: 'danger' });
  });

  it('names every outcome the cancel records', () => {
    expect(refundStatus(cancelled({ paymentAction: 'REFUND_UNDER_REVIEW' })).key).toBe('review');
    expect(refundStatus(cancelled({ paymentAction: 'NOTHING_TO_REFUND' })).key).toBe('nothing_held');
    expect(refundStatus(cancelled({ paymentAction: 'NO_REFUND_FEE_COVERS' })).key).toBe('none_due');
    expect(refundStatus(cancelled({ paymentAction: 'VOID', refundAmount: 291, currency: 'USD' })))
      .toEqual({ key: 'refunded', label: 'Refunded $291.00', tone: 'success' });
  });

  it('reads a cancellation with no record from the payment state: still paid is a refund owed', () => {
    expect(refundStatus(cancelled(null, { payment_status: 'paid' })).key).toBe('pending');
    expect(refundStatus(cancelled(null, { paymentStatus: 'refunded' })).key).toBe('refunded');
    expect(refundStatus(cancelled(null, { payment_status: 'unpaid' }))).toBeNull();
  });
});

describe('what needs attention, in words', () => {
  it('counts a refund under review, or owed with no record, as needing attention', () => {
    expect(needsAttention({ status: 'cancelled', cancellation: { paymentAction: 'REFUND_UNDER_REVIEW' } })).toBe(true);
    expect(needsAttention({ status: 'cancelled', payment_status: 'paid' })).toBe(true);
    expect(needsAttention({ status: 'cancelled', cancellation: { paymentAction: 'NOTHING_TO_REFUND' } })).toBe(false);
  });

  it('says a failed refund failed, and a refund under review is being reviewed', () => {
    expect(attentionMessage({ status: 'cancelled', cancellation: { paymentAction: 'VOID_FAILED' } })).toMatch(/did not go through/);
    const review = attentionMessage({ status: 'cancelled', cancellation: { paymentAction: 'REFUND_UNDER_REVIEW' } });
    expect(review).toMatch(/reviewing the refund/);
    expect(review).not.toMatch(/did not go through/);
  });

  it('tells a held reservation from a booking the airline never received', () => {
    expect(attentionMessage({ type: 'flight', status: 'pending_ticketing', pnr: 'ABC123', needs_review: { reason: 'x' } }))
      .toMatch(/seats are reserved/);
    const unbooked = attentionMessage({ type: 'flight', status: 'pending', needs_review: { reason: 'charge not reversed after the booking failed' } });
    expect(unbooked).toMatch(/could not be completed/);
    expect(unbooked).not.toMatch(/seats are reserved/);
  });

  it('says nothing about a booking that is fine', () => {
    expect(attentionMessage({ type: 'flight', status: 'confirmed', pnr: 'ABC123', tickets: [{ number: '1' }] })).toBeNull();
    expect(attentionMessage({ status: 'cancelled', cancellation: { paymentAction: 'VOID', refundAmount: 10 } })).toBeNull();
  });
});

describe('badges for a flight the airline has not got yet', () => {
  it('calls a queued booking "Being confirmed", not a reservation', () => {
    expect(bookingStatusBadge({ type: 'flight', status: 'pending', payment_status: 'paid', queued: true }).label).toBe('Being confirmed');
  });

  it('tells a paid checkout that was never booked from one never paid for', () => {
    expect(bookingStatusBadge({ type: 'flight', status: 'pending', payment_status: 'paid' }).label).toBe('Paid, not booked yet');
    expect(bookingStatusBadge({ type: 'flight', status: 'pending', payment_status: 'unpaid' }).label).toBe('Awaiting payment');
  });
});

describe('needsManualRefund', () => {
  // The admin panel's "Finish refund" is for a cancelled flight whose refund did
  // not happen - and for nothing else.
  it('is offered only for a cancelled flight whose refund failed, is under review, or never ran', () => {
    const cancelled = (cancellation, extra = {}) => ({
      type: 'flight', status: 'cancelled', paymentStatus: 'paid', bookingDetails: { cancellation }, ...extra,
    });
    expect(needsManualRefund(cancelled({ paymentAction: 'REFUND_FAILED' }))).toBe(true);
    expect(needsManualRefund(cancelled({ paymentAction: 'REFUND_UNDER_REVIEW' }))).toBe(true);
    expect(needsManualRefund(cancelled(undefined))).toBe(true);

    expect(needsManualRefund(cancelled({ paymentAction: 'FULL_REFUND', refundAmount: 291 }))).toBe(false);
    expect(needsManualRefund(cancelled({ paymentAction: 'NOTHING_TO_REFUND' }))).toBe(false);
    expect(needsManualRefund({ type: 'flight', status: 'confirmed', paymentStatus: 'paid' })).toBe(false);
    expect(needsManualRefund(cancelled({ paymentAction: 'REFUND_FAILED' }, { type: 'hotel' }))).toBe(false);
  });

  it('reads the refund the desk finished as refunded', () => {
    const finished = {
      type: 'flight', status: 'cancelled', paymentStatus: 'partially_refunded',
      bookingDetails: { cancellation: { paymentAction: 'PARTIAL_REFUND', refundAmount: 241, cancellationFee: 50, currency: 'USD' } },
    };
    expect(refundStatus(finished)).toMatchObject({ key: 'refunded', label: 'Refunded $241.00' });
    expect(needsManualRefund(finished)).toBe(false);
  });
});
