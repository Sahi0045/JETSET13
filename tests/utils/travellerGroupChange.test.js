import { describe, expect, it } from 'vitest';
import {
  fareIdentity,
  findSameFare,
  rebuildTravellers,
  searchForGroup,
} from '../../frontend/src/utils/travellerGroupChange.js';

/**
 * Changing who travels on the review page re-searches the same route and takes
 * the SAME flights in the SAME booking classes - never the nearest fare.
 */

const segment = (number, at, from = 'DEL', to = 'BOM') => ({
  carrierCode: 'AI', number, departure: { iataCode: from, at }, arrival: { iataCode: to },
});

const offer = ({ number = '2955', at = '2026-10-06T07:00:00', rbd = 'T', total = '104.10', types = ['ADULT'] } = {}) => ({
  itineraries: [{ segments: [segment(number, at)] }],
  validatingAirlineCodes: ['AI'],
  price: { total },
  travelerPricings: types.map((travelerType) => ({ travelerType, fareDetailsBySegment: [{ class: rbd }] })),
  _ama: { segments: [{ rbd }] },
});

describe('findSameFare', () => {
  const current = offer();

  it('finds the same flights in the same booking class', () => {
    const results = [
      { price: { total: '90.00' }, originalOffer: offer({ number: '2956', total: '90.00', types: ['ADULT', 'ADULT'] }) },
      { price: { total: '160.40' }, originalOffer: offer({ total: '160.40', types: ['ADULT', 'ADULT'] }) },
    ];
    expect(findSameFare(current, results)).toBe(results[1]);
  });

  // Another class is another fare, with its own rules and baggage.
  it('never takes the same flight in a different booking class', () => {
    const results = [{ originalOffer: offer({ rbd: 'Y', total: '300.00', types: ['ADULT', 'ADULT'] }) }];
    expect(findSameFare(current, results)).toBeNull();
  });

  it('never takes the same flight number on another departure time', () => {
    const results = [{ originalOffer: offer({ at: '2026-10-06T19:00:00', types: ['ADULT', 'ADULT'] }) }];
    expect(findSameFare(current, results)).toBeNull();
  });

  it('takes the cheapest when the same fare comes back more than once', () => {
    const results = [
      { originalOffer: offer({ total: '170.00' }) },
      { originalOffer: offer({ total: '160.40' }) },
    ];
    expect(findSameFare(current, results).originalOffer.price.total).toBe('160.40');
  });

  it('reads the booking class from the fare details when there is no GDS segment data', () => {
    const { _ama, ...plain } = offer();
    expect(fareIdentity(plain)).toBe(fareIdentity(offer()));
  });

  // One flight and booking class can be sold as two fares - one refundable,
  // one not. The cheaper one used to be taken, silently.
  it('never swaps to another fare basis in the same booking class', () => {
    const withBasis = (fareBasis, total, types) => ({ ...offer({ total, types }), _ama: { segments: [{ rbd: 'T', fareBasis }] } });
    const chosen = withBasis('TRFLEX', '104.10', ['ADULT']);
    const results = [
      { originalOffer: withBasis('TNRSAVER', '120.00', ['ADULT', 'ADULT']) },
      { originalOffer: withBasis('TRFLEX', '180.00', ['ADULT', 'ADULT']) },
    ];
    expect(findSameFare(chosen, results).originalOffer.price.total).toBe('180.00');
  });
});

describe('searchForGroup', () => {
  it('searches the route, dates and cabin the customer searched, for the new group', () => {
    const search = searchForGroup(
      { from: 'New Delhi (DEL)', to: 'BOM', departDate: '2026-10-06', travelClass: 'BUSINESS' },
      offer(),
      { adults: 2, children: 1, infants: 1 },
    );
    expect(search).toMatchObject({
      from: 'New Delhi (DEL)', to: 'BOM', departDate: '2026-10-06', returnDate: '', tripType: 'oneWay',
      travelClass: 'BUSINESS', adults: 2, children: 1, infants: 1, travelers: 4,
    });
  });

  it('falls back to the offer, including the return date of a round trip', () => {
    const roundTrip = {
      itineraries: [
        { segments: [segment('1', '2026-10-06T07:00:00', 'DEL', 'BOM')] },
        { segments: [segment('2', '2026-10-12T21:00:00', 'BOM', 'DEL')] },
      ],
    };
    expect(searchForGroup(null, roundTrip, { adults: 1, children: 0, infants: 0 })).toMatchObject({
      from: 'DEL', to: 'BOM', departDate: '2026-10-06', returnDate: '2026-10-12', tripType: 'roundTrip',
    });
  });
});

describe('rebuildTravellers', () => {
  const blank = (type, index) => ({ id: index + 1, type, firstName: '' });

  it("keeps what was typed for each type and adds blank forms, in the new fare's order", () => {
    const current = [
      { id: 1, type: 'ADULT', firstName: 'Asha' },
      { id: 2, type: 'CHILD', firstName: 'Kabir' },
    ];
    const pricings = [{ travelerType: 'ADULT' }, { travelerType: 'ADULT' }, { travelerType: 'CHILD' }, { travelerType: 'HELD_INFANT' }];

    expect(rebuildTravellers(current, pricings, blank)).toEqual([
      { id: 1, type: 'ADULT', firstName: 'Asha' },
      { id: 2, type: 'ADULT', firstName: '' },
      { id: 3, type: 'CHILD', firstName: 'Kabir' },
      { id: 4, type: 'HELD_INFANT', firstName: '' },
    ]);
  });

  it('drops the travellers the new group no longer has', () => {
    const current = [{ id: 1, type: 'ADULT', firstName: 'Asha' }, { id: 2, type: 'ADULT', firstName: 'Ravi' }];
    expect(rebuildTravellers(current, [{ travelerType: 'ADULT' }], blank)).toEqual([{ id: 1, type: 'ADULT', firstName: 'Asha' }]);
  });
});
