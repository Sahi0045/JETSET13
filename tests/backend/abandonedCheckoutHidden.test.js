import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAbandonedCheckout } from '../../backend/routes/flight.routes.js';

/**
 * My Trips and abandoned checkouts.
 *
 * Hosted checkout writes the booking row before the customer reaches the
 * payment page, so every payment page opened and closed without paying became a
 * "trip" in My Trips.
 */

const row = (over = {}, details = {}) => ({
  travel_type: 'flight', status: 'pending', payment_status: 'unpaid', ...over,
  booking_details: { order_id: 'FLT1', ...details },
});

describe('isAbandonedCheckout', () => {
  it('is a pending, unpaid flight checkout with nothing sent to the airline', () => {
    expect(isAbandonedCheckout(row())).toBe(true);
    expect(isAbandonedCheckout(row({ payment_status: null }))).toBe(true);
    expect(isAbandonedCheckout(row({ payment_status: 'pending' }))).toBe(true);
  });

  it('keeps anything with a sign of life', () => {
    expect(isAbandonedCheckout(row({ payment_status: 'paid' }))).toBe(false);
    expect(isAbandonedCheckout(row({ payment_status: 'refunded' }))).toBe(false);
    expect(isAbandonedCheckout(row({}, { pnr: 'ABC123' }))).toBe(false);
    expect(isAbandonedCheckout(row({}, { queued_order: { flightOffer: {} } }))).toBe(false);
    expect(isAbandonedCheckout(row({}, { needs_review: { reason: 'possible duplicate payment' } }))).toBe(false);
    expect(isAbandonedCheckout(row({}, { cancellation: { paymentAction: 'NONE' } }))).toBe(false);
  });

  it('keeps every other status and kind of booking', () => {
    expect(isAbandonedCheckout(row({ status: 'pending_ticketing' }))).toBe(false);
    expect(isAbandonedCheckout(row({ status: 'cancelled' }))).toBe(false);
    expect(isAbandonedCheckout(row({ travel_type: 'hotel' }))).toBe(false);
  });

  it('is applied to the customer bookings list', () => {
    const src = readFileSync(path.resolve(process.cwd(), 'backend/routes/flight.routes.js'), 'utf8');
    expect(src).toMatch(/\.filter\(\(row\) => !isAbandonedCheckout\(row\)\)\s*\.map\(\(row\) => toClientBooking\(row\)\)/);
  });
});
