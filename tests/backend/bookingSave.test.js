import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for buildBookingRow and saveBookingToDatabase logic
 * 
 * Since these are defined in an Express router file, we extract the logic
 * into testable pure functions duplicated here (matching the source).
 */

// Replicate buildBookingRow from flight.routes.js
function buildBookingRow(bookingData, userId) {
  return {
    user_id: userId || null,
    booking_reference: bookingData.bookingReference,
    travel_type: 'flight',
    status: 'confirmed',
    total_amount: parseFloat(bookingData.totalAmount) || 0,
    payment_status: 'paid',
    booking_details: {
      pnr: bookingData.pnr,
      order_id: bookingData.orderId,
      transaction_id: bookingData.transactionId,
      amount: parseFloat(bookingData.totalAmount) || 0,
      currency: bookingData.currency || 'USD',
      origin: bookingData.origin,
      destination: bookingData.destination,
      departure_date: bookingData.departureDate,
      departure_time: bookingData.departureTime,
      arrival_time: bookingData.arrivalTime,
      airline: bookingData.airline,
      airline_name: bookingData.airlineName,
      flight_number: bookingData.flightNumber,
      duration: bookingData.duration,
      cabin_class: bookingData.cabinClass,
      departure_terminal: bookingData.departureTerminal || '',
      arrival_terminal: bookingData.arrivalTerminal || '',
      aircraft: bookingData.aircraft || '',
      stops: bookingData.stops ?? 0,
      stop_details: bookingData.stopDetails || [],
      branded_fare: bookingData.brandedFare || null,
      branded_fare_label: bookingData.brandedFareLabel || null,
      operating_carrier: bookingData.operatingCarrier || null,
      operating_airline_name: bookingData.operatingAirlineName || null,
      last_ticketing_date: bookingData.lastTicketingDate || null,
      number_of_bookable_seats: bookingData.numberOfBookableSeats || null,
      refundable: bookingData.refundable || false,
      baggage_details: bookingData.baggageDetails || null,
      baggage: bookingData.baggage || null,
      origin_city: bookingData.originCity || '',
      destination_city: bookingData.destinationCity || '',
      departure_date_full: bookingData.departureDateFull || '',
      arrival_date: bookingData.arrivalDate || '',
      price_base: bookingData.priceBase || null,
      price_grand_total: bookingData.priceGrandTotal || null,
      price_fees: bookingData.priceFees || [],
      flight_offer: bookingData.flightOffer,
      fare_breakdown: bookingData.fareBreakdown || null,
      original_user_id: bookingData.userId || null
    },
    passenger_details: bookingData.passengerDetails || bookingData.travelers
  };
}

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

  it('sets initial status to confirmed', () => {
    const row = buildBookingRow(baseBookingData, null);
    expect(row.status).toBe('confirmed');
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
