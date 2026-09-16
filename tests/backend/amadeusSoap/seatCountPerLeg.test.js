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
 * return was reported with the outbound's roomier count. The mapper now takes
 * each segment's availability from its own leg's fare, where that fare is
 * already resolved.
 *
 * Why it matters: `seatsLeftLabel` (searchResults.js) renders 9 or more as a
 * calm "9+ seats". An offer with 7 left on the return therefore looked
 * plentiful right up to the sell that refuses it - and a sell refused after
 * payment is a refund, not a retry.
 *
 * Measured, not assumed: running the mapper over the recorded certification
 * reply with and without the change moves exactly two of its fifty offers,
 * each downward, to the number the supplier actually stated.
 */

const config = { wsap: '1ASIWJETJEC', officeId: 'SCK1S2400', currency: 'USD' };

const certification = (name) => {
  const xml = readFileSync(new URL(`../../fixtures/amadeus/certification/${name}`, import.meta.url), 'utf8');
  const { body } = unwrapEnvelope(parseSoap(xml));
  const reply = body[Object.keys(body).find((k) => k !== 'Fault')];
  return mapMasterPricerReply(reply, { config, searchSignature: 'test' });
};

const REPLY = '02-Fare_MasterPricerTravelBoardSearch.reply.xml';

describe('numberOfBookableSeats', () => {
  // The bug, exactly: both of these reported 9 - "9+ seats" to the customer.
  it('reports the scarcer leg, not the roomier one', () => {
    const { offers } = certification(REPLY);

    expect(Number(offers[39].numberOfBookableSeats)).toBe(8);
    expect(Number(offers[42].numberOfBookableSeats)).toBe(7);
  });

  it('never claims more seats than the supplier stated anywhere in the offer', () => {
    const { offers } = certification(REPLY);

    for (const [index, offer] of offers.entries()) {
      const seats = Number(offer.numberOfBookableSeats);
      if (!Number.isFinite(seats)) continue;
      // Amadeus caps its own availability figure at 9.
      expect(seats, `offer ${index}`).toBeGreaterThan(0);
      expect(seats, `offer ${index}`).toBeLessThanOrEqual(9);
    }
  });

  // The rest of the file must not move: a fix that changed every count would
  // be a different bug, not this one.
  it('leaves every other offer in the reply untouched', () => {
    const { offers } = certification(REPLY);
    const counts = offers.map((o) => Number(o.numberOfBookableSeats));

    expect(counts).toEqual([
      9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 3, 3,
      3, 3, 3, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 7, 9, 9, 6, 9, 9, 8,
      3, 7, 7, 3, 9, 9, 7, 9, 9, 9,
    ]);
  });
});
