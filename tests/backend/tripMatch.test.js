import { describe, expect, it } from 'vitest';
import { checkoutKey, flightsKey, travellerDetailsKey, travellerNamesKey } from '../../backend/utils/tripMatch.js';

/**
 * "The same trip", for checkout handing back an open payment page and for the
 * order route holding a second payment. Missing data is never the same.
 */
const segment = (over = {}) => ({
  carrierCode: 'LH', number: '401', departure: { iataCode: 'JFK', at: '2026-10-04T18:00:00' }, arrival: { iataCode: 'FRA' }, ...over,
});
const offer = (segments = [segment()]) => ({ id: '7', itineraries: [{ segments }] });

describe('flightsKey', () => {
  it('is the same for the same flights, whatever the offer id', () => {
    expect(flightsKey({ ...offer(), id: '1' })).toBe(flightsKey({ ...offer(), id: '42' }));
  });

  it('differs for another flight or another day', () => {
    expect(flightsKey(offer([segment({ number: '403' })]))).not.toBe(flightsKey(offer()));
    expect(flightsKey(offer([segment({ departure: { iataCode: 'JFK', at: '2026-10-05T18:00:00' } })]))).not.toBe(flightsKey(offer()));
  });

  it('says nothing for an offer that does not say which flights', () => {
    expect(flightsKey(null)).toBeNull();
    expect(flightsKey({ itineraries: [] })).toBeNull();
    expect(flightsKey(offer([segment({ number: '' })]))).toBeNull();
  });
});

describe('travellerNamesKey', () => {
  it('matches names however they were typed, in any order', () => {
    expect(travellerNamesKey([{ firstName: 'Jane', lastName: 'Doe' }, { firstName: 'John', lastName: 'Doe' }]))
      .toBe(travellerNamesKey([{ firstName: ' JOHN ', lastName: 'doe' }, { name: { firstName: 'jane', lastName: 'Doe' } }]));
  });

  // A family can book the same flight twice for different people.
  it('differs for different people', () => {
    expect(travellerNamesKey([{ firstName: 'Jane', lastName: 'Doe' }])).not.toBe(travellerNamesKey([{ firstName: 'Anna', lastName: 'Doe' }]));
    expect(travellerNamesKey([{ firstName: 'Jane', lastName: 'Doe' }]))
      .not.toBe(travellerNamesKey([{ firstName: 'Jane', lastName: 'Doe' }, { firstName: 'John', lastName: 'Doe' }]));
  });

  it('says nothing when a traveller has no name', () => {
    expect(travellerNamesKey([{ firstName: 'Jane' }])).toBeNull();
    expect(travellerNamesKey([])).toBeNull();
  });
});

describe('checkoutKey', () => {
  const traveller = { firstName: 'Jane', lastName: 'Doe', type: 'ADULT', dateOfBirth: '1990-01-01', gender: 'female', passportNumber: 'X1234567' };
  const base = {
    bookingData: { originalOffer: offer(), passengerData: [traveller], bookingDetails: { contact: { email: 'jane@example.com', phone: '5550100' } } },
    customerEmail: 'Jane@Example.com',
    total: 402,
  };

  it('is the same for the same checkout', () => {
    expect(checkoutKey(base)).toBe(checkoutKey({ ...base, customerEmail: 'jane@example.com', total: '402.00' }));
  });

  // Handing back the first page would book the details the customer corrected.
  it('differs when any traveller detail, the contact, the coupon or the total differs', () => {
    const withTraveller = (over) => ({ ...base, bookingData: { ...base.bookingData, passengerData: [{ ...traveller, ...over }] } });
    expect(checkoutKey(withTraveller({ passportNumber: 'X7654321' }))).not.toBe(checkoutKey(base));
    expect(checkoutKey(withTraveller({ dateOfBirth: '1991-01-01' }))).not.toBe(checkoutKey(base));
    expect(checkoutKey({ ...base, bookingData: { ...base.bookingData, bookingDetails: { contact: { email: 'jane@example.com', phone: '5550199' } } } })).not.toBe(checkoutKey(base));
    expect(checkoutKey({ ...base, couponCode: 'FLY10' })).not.toBe(checkoutKey(base));
    expect(checkoutKey({ ...base, total: 402.01 })).not.toBe(checkoutKey(base));
  });

  it('says nothing without flights, travellers or a total', () => {
    expect(checkoutKey({ ...base, bookingData: { ...base.bookingData, originalOffer: null } })).toBeNull();
    expect(checkoutKey({ ...base, bookingData: { ...base.bookingData, passengerData: [] } })).toBeNull();
    expect(checkoutKey({ ...base, total: undefined })).toBeNull();
    expect(travellerDetailsKey([{ lastName: 'Doe' }])).toBeNull();
  });
});
