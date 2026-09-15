import { describe, expect, it } from 'vitest';
import { canVoidPayment, statusOptionsFor } from '../../frontend/src/utils/adminBookingActions';

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

/**
 * Modify Status offers only a status that still describes the booking - the
 * rules the server enforces (shared/bookingStatusChange.js).
 */
describe('statusOptionsFor', () => {
  const values = (booking) => statusOptionsFor(booking).map((option) => option.value);

  it('leaves a paid reservation with no ticket only as it is', () => {
    expect(values({ type: 'flight', status: 'pending_ticketing', paymentStatus: 'paid', bookingDetails: { pnr: 'ABC123', gds: { ticketed: false } } }))
      .toEqual(['pending_ticketing']);
  });

  it('lets a ticketed flight be confirmed or completed, never cancelled by hand', () => {
    expect(values({ type: 'flight', status: 'pending_ticketing', paymentStatus: 'paid', bookingDetails: { pnr: 'ABC123', tickets: [{ number: '1' }] } }))
      .toEqual(['pending_ticketing', 'confirmed', 'completed']);
  });

  it('lets an unpaid checkout that never reached the airline be cancelled', () => {
    expect(values({ type: 'flight', status: 'pending', paymentStatus: 'unpaid', bookingDetails: {} })).toEqual(['pending', 'cancelled']);
  });

  it('offers no change while the booking is busy', () => {
    expect(values({ type: 'flight', status: 'pending', paymentStatus: 'unpaid', bookingDetails: {}, bookingBusy: true })).toEqual(['pending']);
  });

  it('keeps a paid hotel away from a hand-typed cancel, and from waiting for a ticket', () => {
    expect(values({ type: 'hotel', status: 'pending', paymentStatus: 'paid' })).toEqual(['pending', 'confirmed', 'completed']);
  });

  it('labels each option', () => {
    expect(statusOptionsFor({ type: 'flight', status: 'pending_ticketing', bookingDetails: { pnr: 'A' } })[0])
      .toEqual({ value: 'pending_ticketing', label: 'Ticket pending' });
  });
});
