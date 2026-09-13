import { describe, expect, it } from 'vitest';
import { bookingStatusBadge, cancellationMessage, needsAttention } from '../../frontend/src/utils/bookingStatus';

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
