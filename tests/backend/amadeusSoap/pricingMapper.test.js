import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyPricingToOffer } from '../../../backend/services/amadeusSoap/mappers/pricing.js';
import { mapMasterPricerReply } from '../../../backend/services/amadeusSoap/mappers/offer.js';
import { parseSoap, unwrapEnvelope } from '../../../backend/services/amadeusSoap/parseXml.js';

/**
 * These numbers are what a customer is charged. The pricing reply supersedes
 * the search quote, and the booking chain reads its total before ticketing, so
 * an error here is a financial error rather than a display one.
 */

const config = { wsap: '1ASIWJETJEC', officeId: 'SCK1S2400', currency: 'USD' };

const load = (name) => {
  const xml = readFileSync(new URL(`../../fixtures/amadeus/${name}.xml`, import.meta.url), 'utf8');
  const { body } = unwrapEnvelope(parseSoap(xml));
  return body[Object.keys(body).find((k) => k !== 'Fault')];
};

const offerFrom = (searchFixture) => {
  const { offers } = mapMasterPricerReply(load(searchFixture), { config, searchSignature: 'test' });
  return offers[0];
};

describe('single passenger', () => {
  it('prices to the same total and base the search quoted', () => {
    const { offer, priced } = applyPricingToOffer(load('informative-pricing'), offerFrom('mptbs-oneway-jfk-lhr'));

    expect(priced).toBe(true);
    expect(offer.price.total).toBe('291.00');
    expect(offer.price.base).toBe('110.00');
    expect(offer.price.currency).toBe('USD');
  });

  it('itemises taxes as fees', () => {
    const { offer } = applyPricingToOffer(load('informative-pricing'), offerFrom('mptbs-oneway-jfk-lhr'));
    const taxTotal = offer.price.fees.reduce((sum, f) => sum + Number(f.amount), 0);

    expect(offer.price.fees.length).toBeGreaterThan(0);
    // Taxes should account for the gap between base and total.
    expect(taxTotal).toBeCloseTo(Number(offer.price.total) - Number(offer.price.base), 1);
  });

  it('records what was priced, for the booking chain to compare against', () => {
    const { offer } = applyPricingToOffer(load('informative-pricing'), offerFrom('mptbs-oneway-jfk-lhr'));

    expect(offer._ama.pricedTotal).toBe('291.00');
    expect(offer._ama.pricedCurrency).toBe('USD');
    // _ama must survive: the chain sells exactly what was priced.
    expect(offer._ama.segments.length).toBeGreaterThan(0);
  });
});

describe('mixed passenger types', () => {
  // The office files fares in INR and converts: B comes back in INR, E is the
  // same base in USD, 712 is the USD total. Summing B into a USD total made the
  // family base read 21654.00 instead of 229.00.
  it('never mixes currencies when deriving the base', () => {
    const { offer } = applyPricingToOffer(load('informative-pricing-family'), offerFrom('mptbs-family-del-bom'));

    expect(offer.price.currency).toBe('USD');
    expect(Number(offer.price.base)).toBeLessThan(Number(offer.price.total));
    // A base larger than the total means an unconverted foreign amount leaked in.
    expect(Number(offer.price.base)).toBeGreaterThan(0);
  });

  it('gives each passenger the fare their own group was priced at', () => {
    const { offer } = applyPricingToOffer(load('informative-pricing-family'), offerFrom('mptbs-family-del-bom'));
    const byType = Object.fromEntries(offer.travelerPricings.map((t) => [t.travelerType + t.travelerId, t.price.total]));

    expect(offer.travelerPricings).toHaveLength(3);
    // Two adults share a fare; the child is priced separately. Matching groups
    // by position rather than by traveller reference gave adult 2 the child fare.
    expect(byType.ADULT1).toBe(byType.ADULT2);
    expect(byType.CHILD3).not.toBe(byType.ADULT1);
  });

  it('sums the offer total across every passenger', () => {
    const { offer } = applyPricingToOffer(load('informative-pricing-family'), offerFrom('mptbs-family-del-bom'));
    const sum = offer.travelerPricings.reduce((n, t) => n + Number(t.price.total), 0);

    expect(Number(offer.price.total)).toBeCloseTo(sum, 2);
  });
});

describe('round trip', () => {
  it('prices every segment of both legs', () => {
    const offer = offerFrom('mptbs-roundtrip');
    const { offer: priced } = applyPricingToOffer(load('informative-pricing-rt'), offer);
    const segmentCount = offer.itineraries.reduce((n, i) => n + i.segments.length, 0);

    expect(priced.travelerPricings[0].fareDetailsBySegment).toHaveLength(segmentCount);
    for (const detail of priced.travelerPricings[0].fareDetailsBySegment) {
      expect(detail.fareBasis).toBeTruthy();
      expect(detail.class).toBeTruthy();
    }
  });
});

describe('degradation', () => {
  it('reports not-priced rather than throwing on an empty reply', () => {
    const { priced } = applyPricingToOffer({}, offerFrom('mptbs-oneway-jfk-lhr'));
    expect(priced).toBe(false);
  });

  it('leaves the original offer untouched', () => {
    const offer = offerFrom('mptbs-oneway-jfk-lhr');
    const before = JSON.stringify(offer);
    applyPricingToOffer(load('informative-pricing'), offer);
    expect(JSON.stringify(offer)).toBe(before);
  });
});
