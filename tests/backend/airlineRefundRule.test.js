import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyPricingToOffer } from '../../backend/services/amadeusSoap/mappers/pricing.js';
import { mapMasterPricerReply, readRefundable } from '../../backend/services/amadeusSoap/mappers/offer.js';
import { parseSoap, unwrapEnvelope } from '../../backend/services/amadeusSoap/parseXml.js';

/**
 * Air India Eco Value, Classic and Flex, 31 Oct 2026 on PDT and production:
 * the search said "TICKETS ARE NON-REFUNDABLE" and the pricing
 * "NON-REFUNDABLE", while the airline files a refund before departure for INR
 * 5000, 3500 and 999 (cat 16, MiniRules cat 33 "BDA" 1, airindia.com). Every
 * booking was saved non-refundable and its e-ticket printed it.
 */

const config = { wsap: '1ASIWJETJEC', officeId: 'SCK1S2400', currency: 'USD' };

const load = (name) => {
  const xml = readFileSync(new URL(`../fixtures/amadeus/${name}.xml`, import.meta.url), 'utf8');
  const { body } = unwrapEnvelope(parseSoap(xml));
  return body[Object.keys(body).find((k) => k !== 'Fault')];
};

const searched = (fixture) => mapMasterPricerReply(load(fixture), { config, searchSignature: 'test' }).offers[0];

describe('whether a fare is refundable', () => {
  it('is not decided by Amadeus\'s own summary line', () => {
    expect(readRefundable('TICKETS ARE NON-REFUNDABLE')).toBeNull();
    expect(readRefundable(['NON-REFUNDABLE'])).toBeNull();
  });

  it('is unknown on Air India\'s priced family fare, which the airline refunds for a fee', () => {
    const { offer } = applyPricingToOffer(load('informative-pricing-family'), searched('mptbs-family-del-bom'));
    expect(offer._ama.refundable).toBeNull();
  });

  it('is still "no" where the airline endorses the ticket NONREF', () => {
    const { offer } = applyPricingToOffer(load('informative-pricing'), searched('mptbs-oneway-jfk-lhr'));
    expect(offer._ama.refundable).toBe(false);
    expect(readRefundable(['FARE RESTR APPLY/NON REF -BG:TP'])).toBe(false);
  });

  // A booking saved refundable is refunded at once on a staff cancel past the
  // void window, less only our fee.
  it('never turns "refundable" beside Amadeus saying otherwise', () => {
    expect(readRefundable(['NON-REFUNDABLE', 'REFUNDABLE WITH PENALTY'])).toBeNull();
    expect(readRefundable(['TICKETS ARE REFUNDABLE'])).toBe(true);
  });
});
