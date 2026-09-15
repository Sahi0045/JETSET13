import { describe, expect, it } from 'vitest';
import { toClientBooking } from '../../backend/routes/flight.routes.js';

/**
 * What checkout charged, as the bookings API sends it.
 *
 * The confirmation page showed "Base Fare" as the total less taxes, folding the
 * service fee and a coupon discount into the fare, because nothing sent the
 * figures checkout had verified.
 */

const row = (verifiedCharge) => ({
  id: 'b1', travel_type: 'flight', booking_reference: 'FLT1', status: 'pending_ticketing', payment_status: 'paid', total_amount: 540.86,
  booking_details: { pnr: 'ABC123', ...(verifiedCharge ? { verified_charge: verifiedCharge } : {}) },
});

describe('chargeBreakdown', () => {
  it('sends the fare, fee, discount and total checkout verified, and nothing else from that record', () => {
    const out = toClientBooking(row({
      fare: 500, passengers: 2, seatedPassengers: 2, fixedFee: 50,
      fixedFeeByType: [{ type: 'ADULT', count: 2, each: 25, amount: 50 }],
      percentage: 0, percentageFee: 0, serviceFee: 50, subtotal: 550, discount: 9.14, total: 540.86,
      coupon: { id: 'coupon-uuid-1', code: 'SAVE', discount_type: 'percentage', discount_value: 1.66 },
      pricedFare: { total: 500, currency: 'USD' },
      verifiedAt: '2026-09-15T10:00:00Z',
    }));

    expect(out.chargeBreakdown).toEqual({ fare: 500, serviceFee: 50, discount: 9.14, total: 540.86, currency: 'USD', couponCode: 'SAVE' });
    const sent = JSON.stringify(out);
    expect(sent).not.toContain('coupon-uuid-1');
    expect(sent).not.toContain('fixedFeeByType');
    expect(sent).not.toContain('verifiedAt');
    expect(out).not.toHaveProperty('verified_charge');
  });

  it('reads the fare from the priced fare when an older charge kept no fare', () => {
    expect(toClientBooking(row({ total: 291, pricedFare: { total: 291, currency: 'USD' } })).chargeBreakdown)
      .toEqual({ fare: 291, serviceFee: 0, discount: 0, total: 291, currency: 'USD', couponCode: null });
  });

  it('sends none when checkout recorded no verified charge', () => {
    expect(toClientBooking(row(null)).chargeBreakdown).toBeNull();
  });
});
