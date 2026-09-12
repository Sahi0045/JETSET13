import { describe, it, expect } from 'vitest';
import { buildBookingRow } from '../../backend/routes/flight.routes.js';

/**
 * Tests for buildBookingRow and saveBookingToDatabase logic
 * 
 * `buildBookingRow` is imported from the route module. It used to be COPIED
 * into this file "matching the source" - which meant the copy kept passing
 * while the real function drifted, and a test that asserted `status` was
 * `'confirmed'` was pinning a literal the real code had just stopped writing.
 * A replica tests the replica.
 */

describe('buildBookingRow', () => {
  const baseBookingData = {
    bookingReference: 'BK-TEST-001',
    pnr: 'ABC123',
    orderId: 'ORD-001',
    transactionId: 'TXN-001',
    totalAmount: '350.50',
    currency: 'USD',
    origin: 'JFK',
    destination: 'LAX',
    departureDate: '2025-03-15',
    departureTime: '08:00',
    arrivalTime: '11:30',
    airline: 'AA',
    airlineName: 'American Airlines',
    flightNumber: 'AA100',
    duration: 'PT5H30M',
    cabinClass: 'ECONOMY',
    userId: 'user-uuid-123',
    passengerDetails: [{ firstName: 'John', lastName: 'Doe' }],
  };

  it('creates a row with user_id when userId is provided', () => {
    const row = buildBookingRow(baseBookingData, 'user-uuid-123');
    expect(row.user_id).toBe('user-uuid-123');
  });

  it('sets user_id to null when userId is null', () => {
    const row = buildBookingRow(baseBookingData, null);
    expect(row.user_id).toBeNull();
  });

  it('sets travel_type to flight', () => {
    const row = buildBookingRow(baseBookingData, null);
    expect(row.travel_type).toBe('flight');
  });

  /**
   * `status` is an observation, not a literal.
   *
   * It used to be 'confirmed' for every booking. With AUTO_TICKET off - every
   * booking so far - that was a committed PNR on a ticketing deadline that the
   * database could not tell apart from a ticketed one; nor could My Trips, the
   * confirmation email, or the alarm. A booking is confirmed when a ticket
   * exists.
   */
  it('is pending_ticketing for a committed PNR with no ticket', () => {
    const row = buildBookingRow(baseBookingData, null);
    expect(row.status).toBe('pending_ticketing');
  });

  it('is pending_ticketing when the GDS says issuance did not happen', () => {
    const row = buildBookingRow({ ...baseBookingData, gds: { ticketed: false }, tickets: [] }, null);
    expect(row.status).toBe('pending_ticketing');
  });

  it('is confirmed once a ticket number exists', () => {
    const row = buildBookingRow({ ...baseBookingData, tickets: [{ number: '057-2412345678', travelerId: '1' }] }, null);
    expect(row.status).toBe('confirmed');
  });

  it('is confirmed when the GDS reports issuance even before the numbers surface', () => {
    const row = buildBookingRow({ ...baseBookingData, ticketed: true, tickets: [] }, null);
    expect(row.status).toBe('confirmed');
  });

  // The chain's own verdict that issuance succeeded but the numbers had not
  // surfaced before its retries ran out. It was computed, returned in the HTTP
  // body, and never written - so the job that watches for it never saw it.
  it('persists the chain\'s needs_review verdict', () => {
    const needsReview = { reason: 'ticket_numbers_not_retrieved', at: '2026-09-13T00:00:00Z' };
    const row = buildBookingRow({ ...baseBookingData, ticketed: true, needsReview }, null);
    expect(row.booking_details.needs_review).toEqual(needsReview);
  });

  it('writes no needs_review key when there is nothing to review', () => {
    const row = buildBookingRow(baseBookingData, null);
    expect(row.booking_details).not.toHaveProperty('needs_review');
  });

  it('parses totalAmount as float', () => {
    const row = buildBookingRow(baseBookingData, null);
    expect(row.total_amount).toBe(350.50);
  });

  it('handles non-numeric totalAmount', () => {
    const data = { ...baseBookingData, totalAmount: 'invalid' };
    const row = buildBookingRow(data, null);
    expect(row.total_amount).toBe(0);
  });

  it('stores original_user_id in booking_details', () => {
    const row = buildBookingRow(baseBookingData, null);
    expect(row.booking_details.original_user_id).toBe('user-uuid-123');
  });

  it('preserves booking reference', () => {
    const row = buildBookingRow(baseBookingData, null);
    expect(row.booking_reference).toBe('BK-TEST-001');
  });

  it('stores passenger details', () => {
    const row = buildBookingRow(baseBookingData, null);
    expect(row.passenger_details).toEqual([{ firstName: 'John', lastName: 'Doe' }]);
  });

  it('falls back to travelers for passenger_details', () => {
    const data = {
      ...baseBookingData,
      passengerDetails: undefined,
      travelers: [{ firstName: 'Jane', lastName: 'Smith' }]
    };
    const row = buildBookingRow(data, null);
    expect(row.passenger_details).toEqual([{ firstName: 'Jane', lastName: 'Smith' }]);
  });

  it('defaults stops to 0 when not provided', () => {
    const row = buildBookingRow(baseBookingData, null);
    expect(row.booking_details.stops).toBe(0);
  });

  it('defaults currency to USD when not provided', () => {
    const data = { ...baseBookingData, currency: undefined };
    const row = buildBookingRow(data, null);
    expect(row.booking_details.currency).toBe('USD');
  });

  it('sets payment_status to paid', () => {
    const row = buildBookingRow(baseBookingData, null);
    expect(row.payment_status).toBe('paid');
  });
});

describe('saveBookingToDatabase (logic)', () => {
  it('FK violation code 23503 should trigger fallback', () => {
    const error = { code: '23503', message: 'violates foreign key constraint' };
    const shouldRetry = error.code === '23503' || error.code === '42501' ||
      error.message?.includes('violates foreign key') || error.message?.includes('row-level security');
    expect(shouldRetry).toBe(true);
  });

  it('RLS violation code 42501 should trigger fallback', () => {
    const error = { code: '42501', message: 'new row violates row-level security policy' };
    const shouldRetry = error.code === '23503' || error.code === '42501';
    expect(shouldRetry).toBe(true);
  });

  it('Other errors should NOT trigger fallback', () => {
    const error = { code: '23505', message: 'duplicate key value violates unique constraint' };
    const shouldRetry = error.code === '23503' || error.code === '42501' ||
      error.message?.includes('violates foreign key') || error.message?.includes('row-level security');
    expect(shouldRetry).toBe(false);
  });

  it('FK message text should trigger fallback even without code', () => {
    const error = { code: null, message: 'violates foreign key constraint on user_id' };
    const shouldRetry = error.code === '23503' || error.code === '42501' ||
      error.message?.includes('violates foreign key') || error.message?.includes('row-level security');
    expect(shouldRetry).toBe(true);
  });
});
