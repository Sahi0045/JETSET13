import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyPricingToOffer } from '../../../backend/services/amadeusSoap/mappers/pricing.js';
import { mapMasterPricerReply } from '../../../backend/services/amadeusSoap/mappers/offer.js';
import { parseSoap, unwrapEnvelope } from '../../../backend/services/amadeusSoap/parseXml.js';

/**
 * What the priced offer says beyond its total: the cabin, the tax breakdown and
 * the base. The total was right; these three were not, each in its own way.
 */

const config = { wsap: '1ASIWJETJEC', officeId: 'SCK1S2400', currency: 'USD' };

const load = (name, edit = (xml) => xml) => {
  const xml = edit(readFileSync(new URL(`../../fixtures/amadeus/${name}.xml`, import.meta.url), 'utf8'));
  const { body } = unwrapEnvelope(parseSoap(xml));
  return body[Object.keys(body).find((k) => k !== 'Fault')];
};

const searched = () => mapMasterPricerReply(load('mptbs-family-del-bom'), { config, searchSignature: 'test' }).offers[0];

describe('the cabin pricing states', () => {
  // Read from cabinGroup.cabinSegment.cabinDesignator, which no pricing reply
  // has: every captured one carries the cabin as bookingClassDetails/option
  // and cabinProduct/cabin (the TP business fare on PDT, 17 Sep 2026: J / C).
  // So an offer whose search gave no cabin kept none, although pricing said.
  it('fills in a cabin the search did not give', () => {
    const offer = searched();
    offer.travelerPricings = offer.travelerPricings.map((pricing) => ({
      ...pricing,
      fareDetailsBySegment: pricing.fareDetailsBySegment.map((detail) => ({ ...detail, cabin: null })),
    }));

    const { offer: priced } = applyPricingToOffer(load('informative-pricing-family'), offer);

    const cabins = priced.travelerPricings.flatMap((pricing) => pricing.fareDetailsBySegment.map((detail) => detail.cabin));
    expect(cabins.length).toBeGreaterThan(0);
    expect(cabins.every((cabin) => cabin === 'ECONOMY')).toBe(true);
  });

  it('reads a business cabin as business', () => {
    const offer = searched();
    const business = (xml) => xml.replaceAll('<cabin>M</cabin>', '<cabin>C</cabin>').replaceAll('<option>M</option>', '<option>C</option>');

    const { offer: priced } = applyPricingToOffer(load('informative-pricing-family', business), offer);

    expect(priced.travelerPricings[0].fareDetailsBySegment[0].cabin).toBe('BUSINESS');
  });
});

describe('the taxes listed beside the total', () => {
  // Two adults at 98.00 (taxes 17.00) and a child at 83.30 (taxes 16.30):
  // total 279.30, base 229.00, so 50.30 of tax. `fees` listed the first group's
  // taxes once - 17.00 - beside a total covering all three travellers.
  it('add up to the tax in the total, for every traveller', () => {
    const { offer } = applyPricingToOffer(load('informative-pricing-family'), searched());

    const taxes = offer.price.fees.reduce((sum, fee) => sum + Number(fee.amount), 0);
    expect(offer.price.total).toBe('279.30');
    expect(offer.price.base).toBe('229.00');
    expect(taxes).toBeCloseTo(50.30, 2);
  });
});

describe('a base pricing cannot state in the offer currency', () => {
  // The null-to-0 coercion the file refuses for `total` survived on `base`: a
  // group with no base in USD (B filed in INR, no E) added nothing, and the
  // family base read 162.00 - two adults - beside a total for three.
  it('is not summed as zero', () => {
    const offer = searched();
    const noChildEquivalent = (xml) => xml.replace(
      '<otherMonetaryDetails><typeQualifier>E</typeQualifier><amount>67.00</amount><currency>USD</currency></otherMonetaryDetails>', '',
    );

    const { offer: priced } = applyPricingToOffer(load('informative-pricing-family', noChildEquivalent), offer);

    expect(priced.price.total).toBe('279.30');
    expect(priced.price.base).not.toBe('162.00');
    // The search's own base, as each traveller's pricing already falls back to.
    expect(offer.price.base).toBeTruthy();
    expect(priced.price.base).toBe(offer.price.base);
  });
});
