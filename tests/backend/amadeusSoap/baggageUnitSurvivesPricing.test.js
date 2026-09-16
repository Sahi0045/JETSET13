import { describe, expect, it } from 'vitest';
import { applyPricingToOffer } from '../../../backend/services/amadeusSoap/mappers/pricing.js';

/**
 * Pricing states the number of kilos or pounds. Only the search says which.
 *
 * `Fare_InformativePricingWithoutPNR`'s `baggageAllowance/baggageDetails`
 * carries `freeAllowance` and `quantityCode` and nothing else. The
 * `unitQualifier` that appears elsewhere in the same reply belongs to
 * `ptcSegment/quantityDetails` and is the PASSENGER TYPE - ADT, CNN - which is
 * why reading it here found nothing and silently meant KG either way.
 *
 * `Fare_MasterPricerTravelBoardSearch` does carry a real `unitQualifier`, and
 * mappers/offer.js reads it: a fare filed in pounds comes out of search as
 * `{weight: 50, weightUnit: 'LB'}`. The priced allowance then OVERRIDES the
 * searched one, and used to arrive stamped 'KG' unconditionally - so the card
 * said "50 LB" and the review page said "50 KG" one click later, telling a
 * passenger they may carry more than twice what they may.
 */

const offerWith = (bag) => ({
  id: '1',
  price: { total: '100.00', currency: 'USD' },
  travelerPricings: [{
    travelerId: '1',
    travelerType: 'ADULT',
    price: { total: '100.00', currency: 'USD' },
    fareDetailsBySegment: [{ segmentId: '1', includedCheckedBags: bag }],
  }],
  _ama: { segments: [{ legIndex: 0 }] },
});

/** A pricing reply that states a weight, as Amadeus actually shapes it. */
const replyWeighing = (freeAllowance) => ({
  mainGroup: {
    pricingGroupLevelGroup: {
      numberOfPax: { segmentControlDetails: { numberOfUnits: '1' } },
      fareInfoGroup: {
        fareAmount: {
          monetaryDetails: { typeQualifier: '712', amount: '100.00', currency: 'USD' },
          otherMonetaryDetails: { typeQualifier: 'B', amount: '80.00', currency: 'USD' },
        },
        segmentLevelGroup: {
          segmentInformation: { flightIdentification: { bookingClass: 'Y' } },
          baggageAllowance: { baggageDetails: { freeAllowance: String(freeAllowance), quantityCode: 'W' } },
        },
      },
    },
  },
});

const bagOf = (result) => result.offer.travelerPricings[0].fareDetailsBySegment[0].includedCheckedBags;

describe('the checked-bag unit through pricing', () => {
  // The bug, exactly.
  it('keeps pounds that the search established', () => {
    const result = applyPricingToOffer(replyWeighing(50), offerWith({ weight: 50, weightUnit: 'LB' }));

    expect(result.priced).toBe(true);
    expect(bagOf(result)).toEqual({ weight: 50, weightUnit: 'LB' });
  });

  it('keeps kilos that the search established', () => {
    const result = applyPricingToOffer(replyWeighing(15), offerWith({ weight: 15, weightUnit: 'KG' }));

    expect(bagOf(result)).toEqual({ weight: 15, weightUnit: 'KG' });
  });

  // The priced NUMBER still wins - only the unit is inherited.
  it('takes the priced allowance when it differs from the searched one', () => {
    const result = applyPricingToOffer(replyWeighing(23), offerWith({ weight: 50, weightUnit: 'LB' }));

    expect(bagOf(result)).toEqual({ weight: 23, weightUnit: 'LB' });
  });

  it('falls back to kilos when the search never said either', () => {
    const result = applyPricingToOffer(replyWeighing(15), offerWith(undefined));

    expect(bagOf(result)).toEqual({ weight: 15, weightUnit: 'KG' });
  });
});
