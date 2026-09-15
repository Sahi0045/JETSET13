import { describe, expect, it } from 'vitest';
import { buildFlightOrderBody } from '../../shared/flightOrderBody.js';

/**
 * The phone's country code on the order body.
 *
 * The review page never sent one and this defaulted to '1', so every phone was
 * booked onto the PNR as a US number. The page now sends the lead traveller's
 * code as digits; a booking saved before that falls back to the traveller's own
 * code, and none is invented.
 */

const orderData = (contact, lead = {}) => ({
  orderId: 'FLT1',
  amount: 402,
  originalOffer: { id: '1', travelerPricings: [{ travelerType: 'ADULT' }] },
  passengerData: [{ firstName: 'Asha', lastName: 'Rao', gender: 'female', dateOfBirth: '1990-01-01', type: 'ADULT', mobile: '9876543210', ...lead }],
  bookingDetails: { contact },
});

describe('buildFlightOrderBody contact country code', () => {
  it("sends the code the review page sent, as digits", () => {
    const { body } = buildFlightOrderBody(orderData({ phone: '9876543210', countryCode: '+91' }));
    expect(body.contactInfo).toMatchObject({ countryCode: '91', phoneNumber: '9876543210' });
  });

  it("falls back to the lead traveller's own code", () => {
    const { body } = buildFlightOrderBody(orderData({ phone: '7700900123' }, { countryCode: '+44' }));
    expect(body.contactInfo.countryCode).toBe('44');
  });

  it("invents none: no '1' for a number with no code", () => {
    const { body } = buildFlightOrderBody(orderData({ phone: '7700900123' }));
    expect(body.contactInfo.countryCode).toBe('');
  });
});
