import { describe, expect, it } from 'vitest';
import { canVoidPayment } from '../../frontend/src/utils/adminBookingActions';

/**
 * The admin bookings list offers Void only where the server would do it.
 *
 * Void reverses a payment and releases nothing. On a flight with an airline
 * reservation it left the reservation live with nothing paying for it, and
 * wrote the booking cancelled and refunded, so neither alarm looked at it again.
 */
describe('canVoidPayment', () => {
  const paidFlight = (over = {}) => ({ type: 'flight', status: 'pending', paymentStatus: 'paid', bookingDetails: {}, ...over });

  it('is offered for a paid flight checkout that never reached the airline', () => {
    expect(canVoidPayment(paidFlight())).toBe(true);
  });

  it('is never offered for a flight with an airline reservation', () => {
    expect(canVoidPayment(paidFlight({ bookingDetails: { pnr: 'ABC123' } }))).toBe(false);
    expect(canVoidPayment(paidFlight({ pnr: 'ABC123' }))).toBe(false);
    expect(canVoidPayment(paidFlight({ bookingDetails: { amadeus_order_id: 'ABC123' } }))).toBe(false);
  });

  it('waits while the flight is being booked, queued or cancelled', () => {
    expect(canVoidPayment(paidFlight({ bookingBusy: true }))).toBe(false);
  });

  it('is not offered for a payment that is not simply paid, or a booking already cancelled', () => {
    expect(canVoidPayment(paidFlight({ paymentStatus: 'refunded' }))).toBe(false);
    expect(canVoidPayment(paidFlight({ paymentStatus: 'unpaid' }))).toBe(false);
    expect(canVoidPayment(paidFlight({ status: 'cancelled' }))).toBe(false);
    expect(canVoidPayment({ ...paidFlight(), isPackage: true })).toBe(false);
  });

  it('stays offered for a paid hotel or cruise, which have no airline reservation', () => {
    expect(canVoidPayment({ type: 'hotel', status: 'confirmed', paymentStatus: 'paid' })).toBe(true);
    expect(canVoidPayment({ type: 'cruise', status: 'confirmed', paymentStatus: 'paid', bookingDetails: { pnr: 'X' } })).toBe(true);
  });
});
