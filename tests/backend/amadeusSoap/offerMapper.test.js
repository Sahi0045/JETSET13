import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapMasterPricerReply } from '../../../backend/services/amadeusSoap/mappers/offer.js';
import { parseSoap, unwrapEnvelope } from '../../../backend/services/amadeusSoap/parseXml.js';

const config = { wsap: '1ASIWJETJEC', officeId: 'SCK1S2400', currency: 'USD' };

const load = (name) => {
  const xml = readFileSync(new URL(`../../fixtures/amadeus/${name}.xml`, import.meta.url), 'utf8');
  const { body } = unwrapEnvelope(parseSoap(xml));
  const reply = body[Object.keys(body).find((k) => k !== 'Fault')];
  return mapMasterPricerReply(reply, { config, searchSignature: 'test' });
};

describe('price', () => {
  // recPriceInfo/monetaryDetail[1] is the total TAX, not the base fare. Reading
  // it as the base understates every fare shown to a customer and is written
  // into booking_details.price_base at booking time.
  it('derives base as total minus tax, not from the second monetary detail', () => {
    const { offers } = load('mptbs-oneway-jfk-lhr');
    const offer = offers[0];

    expect(offer.price.total).toBe('291.00');
    expect(offer.price.base).toBe('110.00');            // 291.00 - 181.00 tax
    expect(offer.price.base).not.toBe('181.00');        // the tax, if misread
    expect(Number(offer.price.total) - Number(offer.price.base)).toBeCloseTo(181, 2);
  });

  // The offer total is what the client charges through ARC Pay, so it must
  // cover every passenger. recPriceInfo carries the all-passenger amount while
  // paxFareDetail carries the per-passenger one; reading the latter quoted a
  // 2+1 family 98.00 instead of 286.70. A single adult makes the two identical,
  // which is why nothing caught it until a family was priced.
  it('quotes the all-passenger total, not one passenger', () => {
    const { offers } = load('mptbs-family-del-bom');
    const offer = offers[0];
    const sumOfPassengers = offer.travelerPricings.reduce((n, t) => n + Number(t.price.total), 0);

    expect(offer.travelerPricings).toHaveLength(3);
    expect(Number(offer.price.total)).toBeCloseTo(sumOfPassengers, 2);
    // The per-adult fare alone must not be mistaken for the offer total.
    expect(Number(offer.price.total)).toBeGreaterThan(Number(offer.travelerPricings[0].price.total));
  });

  it.each(['mptbs-oneway-jfk-lhr', 'mptbs-family-del-bom', 'mptbs-roundtrip'])(
    '%s: offer total reconciles with the sum of passenger fares', (fixture) => {
      for (const offer of load(fixture).offers) {
        const sum = offer.travelerPricings.reduce((n, t) => n + Number(t.price.total), 0);
        expect(Number(offer.price.total)).toBeCloseTo(sum, 2);
      }
    },
  );

  it('reports the office currency and never a null total', () => {
    const { offers, currency } = load('mptbs-roundtrip');
    expect(currency).toBe('USD');
    for (const offer of offers) {
      expect(offer.price.currency).toBe('USD');
      expect(Number(offer.price.total)).toBeGreaterThan(0);
      expect(Number(offer.price.base)).toBeGreaterThan(0);
      expect(Number(offer.price.base)).toBeLessThanOrEqual(Number(offer.price.total));
    }
  });
});

describe('itineraries', () => {
  it('resolves a round trip to two legs via the refQualifier S entries', () => {
    const { offers } = load('mptbs-roundtrip');
    const offer = offers[0];

    expect(offer.itineraries).toHaveLength(2);
    expect(offer.oneWay).toBe(false);
    // Outbound must start where the return ends.
    const out = offer.itineraries[0].segments;
    const back = offer.itineraries[1].segments;
    expect(out[0].departure.iataCode).toBe(back[back.length - 1].arrival.iataCode);
  });

  it('keeps a one-way search to a single leg', () => {
    const { offers } = load('mptbs-oneway-jfk-lhr');
    expect(offers[0].itineraries).toHaveLength(1);
    expect(offers[0].oneWay).toBe(true);
  });

  // dateOfArrival is already the true arrival date; adding dateVariation on top
  // put every overnight flight a day late and produced negative durations.
  it('never produces a segment that arrives before it departs', () => {
    for (const name of ['mptbs-oneway-jfk-lhr', 'mptbs-roundtrip', 'mptbs-family-del-bom']) {
      const { offers } = load(name);
      for (const offer of offers) {
        for (const itinerary of offer.itineraries) {
          for (const segment of itinerary.segments) {
            expect(segment.arrival.at >= segment.departure.at, `${name}: ${segment.carrierCode}${segment.number}`).toBe(true);
          }
        }
      }
    }
  });

  it('takes the leg duration from Amadeus elapsed flight time', () => {
    const { offers } = load('mptbs-oneway-jfk-lhr');
    expect(offers[0].itineraries[0].duration).toMatch(/^PT\d+H(\d+M)?$/);
  });

  // Local airport times with no timezone data cannot yield a correct elapsed
  // time, and a wrong one would eventually be trusted.
  it('omits per-segment duration rather than guessing across timezones', () => {
    const { offers } = load('mptbs-oneway-jfk-lhr');
    expect(offers[0].itineraries[0].segments[0].duration).toBeUndefined();
  });
});

describe('passengers', () => {
  it('emits one traveler pricing per passenger with the right types', () => {
    const { offers } = load('mptbs-family-del-bom');
    const types = offers[0].travelerPricings.map((t) => t.travelerType);

    expect(offers[0].travelerPricings).toHaveLength(3);
    expect(types.filter((t) => t === 'ADULT')).toHaveLength(2);
    expect(types).toContain('CHILD');
    expect(new Set(offers[0].travelerPricings.map((t) => t.travelerId)).size).toBe(3);
  });

  it('gives every segment a fare detail with cabin and booking class', () => {
    const { offers } = load('mptbs-roundtrip');
    const offer = offers[0];
    const segmentCount = offer.itineraries.reduce((n, i) => n + i.segments.length, 0);

    for (const pricing of offer.travelerPricings) {
      expect(pricing.fareDetailsBySegment).toHaveLength(segmentCount);
      for (const detail of pricing.fareDetailsBySegment) {
        expect(detail.cabin).toMatch(/ECONOMY|PREMIUM_ECONOMY|BUSINESS|FIRST/);
        expect(detail.class).toBeTruthy();
        expect(detail.fareBasis).toBeTruthy();
      }
    }
  });
});

describe('offer contract', () => {
  // POST /order gates on these three being present (flight.routes.js:1051).
  it('carries the keys the booking route gates on', () => {
    const { offers } = load('mptbs-oneway-jfk-lhr');
    for (const offer of offers) {
      expect(offer.itineraries).toBeDefined();
      expect(offer.source).toBe('GDS');
      expect(offer.travelerPricings).toBeDefined();
    }
  });

  it('carries everything the booking chain needs in _ama', () => {
    const { offers } = load('mptbs-roundtrip');
    const ama = offers[0]._ama;
    const segmentCount = offers[0].itineraries.reduce((n, i) => n + i.segments.length, 0);

    expect(ama.wsap).toBe('1ASIWJETJEC');
    expect(ama.segments).toHaveLength(segmentCount);
    expect(ama.paxRefs.length).toBeGreaterThan(0);

    for (const segment of ama.segments) {
      // Air_SellFromRecommendation needs each of these; a missing rbd or date
      // means the segment cannot be sold.
      expect(segment.boardPoint).toMatch(/^[A-Z]{3}$/);
      expect(segment.offPoint).toMatch(/^[A-Z]{3}$/);
      expect(segment.departureDate).toMatch(/^\d{6}$/);   // Date_DDMMYY
      expect(segment.departureTime).toMatch(/^\d{3,4}$/);
      expect(segment.rbd).toBeTruthy();
      expect(segment.marketingCarrier).toMatch(/^[A-Z0-9]{2}$/);
      expect(segment.flightNumber).toBeTruthy();
    }
  });

  it('resolves airline and aircraft names for the dictionaries', () => {
    const { offers, dictionaries } = load('mptbs-oneway-jfk-lhr');
    const carrier = offers[0].itineraries[0].segments[0].carrierCode;

    expect(dictionaries.carriers[carrier]).toBeTruthy();
    expect(dictionaries.carriers[carrier]).not.toBe(carrier);
  });

  it('reads baggage through the freeBagAllownceInfo spelling Amadeus uses', () => {
    const { offers } = load('mptbs-family-del-bom');
    const bags = offers[0].travelerPricings[0].fareDetailsBySegment[0].includedCheckedBags;

    expect(bags).toBeDefined();
    expect('weight' in bags || 'quantity' in bags).toBe(true);
  });
});

describe('no results', () => {
  it('maps an empty reply to no offers rather than throwing', () => {
    const { offers } = load('mptbs-no-results');
    expect(offers).toEqual([]);
  });
});
