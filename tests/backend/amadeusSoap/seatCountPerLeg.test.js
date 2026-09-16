import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapMasterPricerReply } from '../../../backend/services/amadeusSoap/mappers/offer.js';
import { parseSoap, unwrapEnvelope } from '../../../backend/services/amadeusSoap/parseXml.js';

/**
 * `numberOfBookableSeats` is the scarcest segment of THIS offer.
 *
 * It was read by searching `fareByLeg.flatMap(l => l.fares)` - every leg's
 * fares - for the first whose `rbd` matched the segment's. On a round trip
 * booked in one class that is the OUTBOUND's fare for both legs, so a scarce
 * return was reported with the outbound's roomier count. Each segment now takes
 * its availability from its own leg's fare, where that fare is already
 * resolved.
 *
 * Why it matters: `seatsLeftLabel` (searchResults.js) renders 9 or more as a
 * calm "9+ seats". An offer with 4 left on the return therefore looked
 * plentiful right up to the sell that refuses it - and a sell refused after
 * payment is a refund, not a retry.
 *
 * The fixture is `mptbs-roundtrip.xml` with ONE value changed: the return
 * leg's E fare carries 4 seats where the outbound's carries 9. Everything else
 * is a recorded reply. Measured against the mapper as it stood before the fix,
 * that offer reports 9; after it, 4.
 *
 * (The certification replies show the same fault in seven of fifty offers, but
 * `tests/fixtures/amadeus/certification/` is gitignored - 1.4 MB of recorded
 * Amadeus traffic - so a test that reads them passes locally and fails in CI,
 * which is how this file first went red on main.)
 */

const config = { wsap: '1ASIWJETJEC', officeId: 'SCK1S2400', currency: 'USD' };

const load = (name) => {
  const xml = readFileSync(new URL(`../../fixtures/amadeus/${name}.xml`, import.meta.url), 'utf8');
  const { body } = unwrapEnvelope(parseSoap(xml));
  const reply = body[Object.keys(body).find((k) => k !== 'Fault')];
  return mapMasterPricerReply(reply, { config, searchSignature: 'test' });
};

/** Every availability figure the reply states, read straight out of the XML. */
const statedAvailability = (name) => {
  const xml = readFileSync(new URL(`../../fixtures/amadeus/${name}.xml`, import.meta.url), 'utf8');
  return [...xml.matchAll(/<avlStatus>(\d+)<\/avlStatus>/g)].map((m) => Number(m[1]));
};

describe('numberOfBookableSeats', () => {
  // The bug, exactly: this offer reported 9 - "9+ seats" - for a return leg
  // that has 4.
  it('reports the scarcer leg, not the roomier one', () => {
    const { offers } = load('mptbs-roundtrip-uneven-availability');

    expect(Number(offers[0].numberOfBookableSeats)).toBe(4);
  });

  it('leaves the other offers in the same reply alone', () => {
    const { offers } = load('mptbs-roundtrip-uneven-availability');

    expect(offers.map((o) => Number(o.numberOfBookableSeats))).toEqual([4, 3, 9, 1, 9]);
  });

  // The unedited recording: the same mapper must not move anything here.
  it('is unchanged on a reply whose legs agree', () => {
    const { offers } = load('mptbs-roundtrip');

    expect(offers.map((o) => Number(o.numberOfBookableSeats))).toEqual([9, 3, 9, 1, 9]);
  });

  it('never claims more seats than the reply states anywhere', () => {
    for (const name of ['mptbs-roundtrip', 'mptbs-roundtrip-uneven-availability', 'mptbs-oneway-jfk-lhr']) {
      const highest = Math.max(...statedAvailability(name));
      for (const [index, offer] of load(name).offers.entries()) {
        const seats = Number(offer.numberOfBookableSeats);
        if (!Number.isFinite(seats)) continue;
        expect(seats, `${name} offer ${index}`).toBeGreaterThan(0);
        expect(seats, `${name} offer ${index}`).toBeLessThanOrEqual(highest);
      }
    }
  });
});
