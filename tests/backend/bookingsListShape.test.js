import { describe, expect, it } from 'vitest';
import { toClientBooking } from '../../backend/routes/flight.routes.js';

/**
 * What GET /api/flights/bookings hands to My Trips and Manage Booking.
 *
 * The list transform mapped ~70 fields and omitted the five that say what
 * happened after payment: `cancellation`, `tickets`, `needs_review`, `gds`,
 * `payment_status`. Manage Booking then had nothing to read, so a cancelled
 * booking whose refund ARC Pay had refused rendered "Processing Refund - In
 * Progress" indefinitely, and the e-ticket helper could not distinguish a
 * held reservation from an issued ticket.
 */

const row = {
  id: 'b1',
  travel_type: 'flight',
  booking_reference: 'FLT-1',
  status: 'cancelled',
  payment_status: 'paid',
  total_amount: 291,
  created_at: '2026-09-12T10:00:00Z',
  passenger_details: [{ firstName: 'A', lastName: 'B' }],
  booking_details: {
    pnr: 'ABC123',
    origin: 'DEL',
    destination: 'BOM',
    cancellation: {
      paymentAction: 'REFUND_FAILED',
      refundAmount: 0,
      cancelledAt: '2026-09-12T11:00:00Z',
      reason: 'Requested by user',
    },
    tickets: [],
    needs_review: { reason: 'ticket_numbers_not_retrieved' },
    gds: { ticketed: false },
  },
};

describe('toClientBooking', () => {
  const out = toClientBooking(row);

  it('passes the cancellation outcome through untouched', () => {
    expect(out.cancellation).toEqual(row.booking_details.cancellation);
  });

  it('exposes the ticketing verdict fields the e-ticket helper reads', () => {
    expect(out.tickets).toEqual([]);
    expect(out.needs_review).toEqual({ reason: 'ticket_numbers_not_retrieved' });
    expect(out.gds).toEqual({ ticketed: false });
  });

  it('sends payment_status in the snake_case the single-booking endpoint uses', () => {
    expect(out.payment_status).toBe('paid');
    // The camelCase twin stays for the callers that already read it.
    expect(out.paymentStatus).toBe('paid');
  });

  it('keeps the fields My Trips already relied on', () => {
    expect(out.id).toBe('b1');
    expect(out.bookingReference).toBe('FLT-1');
    expect(out.status).toBe('cancelled');
    expect(out.pnr).toBe('ABC123');
    expect(out.totalAmount).toBe(291);
    expect(out.travelers).toEqual([{ firstName: 'A', lastName: 'B' }]);
  });

  it('defaults the outcome fields safely for a row that has none', () => {
    const bare = toClientBooking({ id: 'b2', travel_type: 'flight', booking_details: {} });

    expect(bare.cancellation).toBeNull();
    expect(bare.tickets).toEqual([]);
    expect(bare.needs_review).toBeNull();
    expect(bare.gds).toBeNull();
  });

  it('survives a row with no booking_details at all', () => {
    expect(() => toClientBooking({ id: 'b3', travel_type: 'flight' })).not.toThrow();
  });
});
