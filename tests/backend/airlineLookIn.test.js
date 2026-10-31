import { describe, expect, it } from 'vitest';
import { decideFlightRefund } from '../../backend/routes/payment/operations.handlers.js';
import { airlineLookInOf } from '../../shared/flightCancelPolicy.js';

/**
 * Air India's fare rules (cat 16, PDT and production, 31 Oct 2026): "reservations
 * booked more than 7 days prior to commencement of travel may be cancelled or
 * amended within 48 hours of booking ticket without penalty". The route-level
 * case is airlineLookInOnCancel.test.js.
 */

describe('Air India\'s 48-hour free cancellation', () => {
  const bookedAt = '2026-11-01T10:00:00Z';

  it('applies within 48 hours of a booking made more than 7 days before travel', () => {
    expect(airlineLookInOf({ carrier: 'AI', bookedAt, departureDate: '2026-11-20', now: '2026-11-02T20:00:00Z' }))
      .toEqual({ carrier: 'Air India', until: '2026-11-03T10:00:00.000Z' });
  });

  it('does not apply after 48 hours, for travel within 7 days, or to an airline whose rules were not read', () => {
    expect(airlineLookInOf({ carrier: 'AI', bookedAt, departureDate: '2026-11-20', now: '2026-11-03T10:00:01Z' })).toBeNull();
    expect(airlineLookInOf({ carrier: 'AI', bookedAt, departureDate: '2026-11-08', now: '2026-11-02T10:00:00Z' })).toBeNull();
    expect(airlineLookInOf({ carrier: 'LH', bookedAt, departureDate: '2026-11-20', now: '2026-11-02T10:00:00Z' })).toBeNull();
    expect(airlineLookInOf({ carrier: 'AI', bookedAt, departureDate: '', now: '2026-11-02T10:00:00Z' })).toBeNull();
  });

  it('tells the desk not to keep the airline\'s penalty', () => {
    const decision = decideFlightRefund({
      heldAmount: 300, paidInFull: true, everCaptured: true, hasReservation: true,
      gds: { success: true, hadTickets: true, voided: false, requiresAirlineRefund: ['098-2412345678'] },
      rowTicketed: true, refundable: null, fee: 50,
      customer: {
        freeWindow: false, serviceFeeKept: 12.5, cancellationFee: 50,
        fareRule: { refundable: true, penalty: 53, currency: 'USD' },
        airlineLookIn: { carrier: 'Air India', until: '2026-11-03T10:00:00.000Z' },
      },
    });
    expect(decision).toMatchObject({ action: 'review', refundAmount: 0, policy: 'refundable' });
    expect(decision.reason).toMatch(/Air India waives its penalty on a cancel within 48 hours/);
    expect(decision.reason).toMatch(/check its fare rules before keeping any airline penalty/);
  });
});
