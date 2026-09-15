import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isCompletedTrip } from '../../frontend/src/utils/bookingStatus';

/**
 * "Trip Completed" in My Trips.
 *
 * It was shown under every past travel date: a reservation never ticketed, a
 * booking still queued, a checkout never paid for.
 */
describe('isCompletedTrip', () => {
  it('calls a flight booked here completed only once it was ticketed', () => {
    expect(isCompletedTrip({ type: 'flight', status: 'confirmed', pnr: 'ABC123', tickets: [{ number: '057-1' }] })).toBe(true);
    expect(isCompletedTrip({ type: 'flight', status: 'pending_ticketing', pnr: 'ABC123', needs_review: { reason: 'ticket_numbers_not_retrieved' } })).toBe(true);
    expect(isCompletedTrip({ type: 'flight', status: 'pending_ticketing', pnr: 'ABC123' })).toBe(false);
    expect(isCompletedTrip({ type: 'flight', status: 'confirmed', pnr: 'ABC123', tickets: [] })).toBe(false);
    expect(isCompletedTrip({ type: 'flight', status: 'pending', payment_status: 'unpaid' })).toBe(false);
    expect(isCompletedTrip({ type: 'flight', status: 'pending_confirmation', queued: true })).toBe(false);
  });

  it('calls a quoted trip or another kind of booking completed once confirmed or paid', () => {
    expect(isCompletedTrip({ type: 'flight', status: 'CONFIRMED', quoteId: 'q1', inquiryId: 'i1' })).toBe(true);
    expect(isCompletedTrip({ type: 'cruise', status: 'confirmed' })).toBe(true);
    expect(isCompletedTrip({ type: 'hotel', status: 'pending' })).toBe(false);
  });

  it('never calls a cancelled booking completed', () => {
    expect(isCompletedTrip({ type: 'flight', status: 'cancelled', tickets: [{ number: '057-1' }] })).toBe(false);
    expect(isCompletedTrip({ type: 'cruise', status: 'CANCELLED' })).toBe(false);
  });

  it('is what My Trips asks before saying "Trip Completed"', () => {
    const src = readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/login/mytrips.jsx'), 'utf8');
    expect(src).toMatch(/daysUntilTrip < 0 && \(isCompletedTrip\(booking\) \? \(/);
    expect(src).toMatch(/Travel date passed/);
  });
});
