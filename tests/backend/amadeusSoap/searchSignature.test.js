import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapMasterPricerReply } from '../../../backend/services/amadeusSoap/mappers/offer.js';
import { parseSoap, unwrapEnvelope } from '../../../backend/services/amadeusSoap/parseXml.js';

/**
 * `_ama.searchSignature` was documented as detecting "a search whose
 * parameters changed between search and booking", stamped on every offer, and
 * compared by nothing - not the price route, not the order route, not the
 * chain. A field that reads like a guard and is not one is worse than no field:
 * the next change that leans on it is wrong without knowing. What does guard a
 * booking is the offer's own segments, its age (offerMaxAgeMin) and the order
 * route's traveller-count check.
 */

const load = (name) => {
  const xml = readFileSync(new URL(`../../fixtures/amadeus/${name}.xml`, import.meta.url), 'utf8');
  const { body } = unwrapEnvelope(parseSoap(xml));
  return body[Object.keys(body).find((k) => k !== 'Fault')];
};

describe('an offer from search', () => {
  it('carries no signature that nothing checks', () => {
    const { offers } = mapMasterPricerReply(load('mptbs-oneway-jfk-lhr'), {
      config: { wsap: '1ASIWJETJEC', officeId: 'SCK1S2400', currency: 'USD' },
      searchSignature: 'abc123',
    });

    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]._ama).not.toHaveProperty('searchSignature');
    // What the booking actually relies on is still there.
    expect(offers[0]._ama).toHaveProperty('searchedAt');
    expect(offers[0]._ama.segments.length).toBeGreaterThan(0);
  });
});
