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

describe('one price covering several flight combinations', () => {
  /**
   * A recommendation is a price; each `segmentFlightRef` inside it is one
   * combination of flights sold at that price. The mapper read
   * `segmentFlightRef.referencingDetail` as if there were only ever one, which
   * is undefined whenever there are several, and the whole recommendation was
   * dropped.
   *
   * The fixture is certification search 01 as Amadeus returned it (headers
   * already redacted by the recorder; it carries no office id or username):
   * 19 recommendations holding 50 combinations. The site showed 8 of them, and
   * not the cheapest - $76.00 - which sat in a recommendation with two.
   */
  const FIXTURE = 'mptbs-shared-price-combinations';
  const rawReply = () => {
    const xml = readFileSync(new URL(`../../fixtures/amadeus/${FIXTURE}.xml`, import.meta.url), 'utf8');
    const { body } = unwrapEnvelope(parseSoap(xml));
    return body[Object.keys(body).find((k) => k !== 'Fault')];
  };
  const list = (value) => [].concat(value ?? []);

  it('maps every combination in the reply to an offer', () => {
    const reply = rawReply();
    const combinations = list(reply.recommendation)
      .reduce((n, recommendation) => n + list(recommendation.segmentFlightRef).length, 0);

    expect(list(reply.recommendation)).toHaveLength(19);
    expect(combinations).toBe(50);
    expect(load(FIXTURE).offers).toHaveLength(combinations);
  });

  it('gives every offer an id of its own', () => {
    const ids = load(FIXTURE).offers.map((offer) => offer.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('shows the cheapest fare in the reply', () => {
    const totals = load(FIXTURE).offers.map((offer) => offer.price.total);

    expect(totals).toContain('76.00');
    expect(Math.min(...totals.map(Number))).toBe(76);
  });

  it('shares the price across a recommendation, but each combination keeps its own flights', () => {
    const shared = load(FIXTURE).offers.filter((offer) => offer._ama.recommendationId === '1');
    const flightsOf = (offer) => offer.itineraries
      .flatMap((itinerary) => itinerary.segments.map((s) => `${s.carrierCode}${s.number}@${s.departure.at}`))
      .join(' ');

    expect(shared).toHaveLength(2);
    expect(shared.map((offer) => offer.price.total)).toEqual(['76.00', '76.00']);
    expect(flightsOf(shared[0])).not.toBe(flightsOf(shared[1]));

    // What the booking chain sells must be the flights this offer shows, not
    // the other combination's.
    for (const offer of shared) {
      expect(offer._ama.segments.map((s) => `${s.marketingCarrier}${s.flightNumber}`))
        .toEqual(offer.itineraries.flatMap((i) => i.segments.map((s) => `${s.carrierCode}${s.number}`)));
    }
  });

  // Baggage is referenced per combination ('B'), and those references differ
  // from the recommendation number for 48 of the 50. Joining on the
  // recommendation number left most offers with no allowance at all.
  it("finds every combination's baggage through its own reference", () => {
    for (const offer of load(FIXTURE).offers) {
      const bags = offer.travelerPricings[0].fareDetailsBySegment[0].includedCheckedBags;
      expect(bags, offer.id).toBeDefined();
    }
  });
});

describe('refundability from the penalty text', () => {
  /**
   * Any penalty text that did not match /NON-?REFUNDABLE/ was read as
   * refundable, so "PENALTY APPLIES" earned a green Refundable badge, and so
   * did "NON REFUNDABLE" spelled with a space. Only explicit refund wording is
   * a yes; any refusal is a no; everything else is unknown.
   *
   * The recorded reply's penalty message is replaced, so the rest of the offer
   * stays exactly as Amadeus filed it.
   */
  const refundableWhen = (text) => {
    const xml = readFileSync(new URL('../../fixtures/amadeus/mptbs-oneway-jfk-lhr.xml', import.meta.url), 'utf8');
    const { body } = unwrapEnvelope(parseSoap(xml));
    const reply = body[Object.keys(body).find((k) => k !== 'Fault')];
    const recommendation = [].concat(reply.recommendation)[0];
    for (const product of [].concat(recommendation.paxFareProduct)) {
      product.fare = text === null ? [] : [{
        pricingMessage: { freeTextQualification: { textSubjectQualifier: 'PEN' }, description: text },
      }];
    }
    return mapMasterPricerReply(reply, { config, searchSignature: 'test' }).offers[0]._ama.refundable;
  };

  it.each([
    'TICKETS ARE NON-REFUNDABLE',
    'TICKETS ARE NON REFUNDABLE AFTER DEPARTURE',
    'NONREFUNDABLE',
    'TICKETS ARE NOT REFUNDABLE',
  ])('reads "%s" as not refundable', (text) => {
    expect(refundableWhen(text)).toBe(false);
  });

  it.each([
    'PENALTY APPLIES',
    'SUBJ TO CANCELLATION/CHANGE PENALTY',
  ])('reads "%s" as unknown, not refundable', (text) => {
    expect(refundableWhen(text)).toBeNull();
  });

  it.each([
    'TICKETS ARE REFUNDABLE',
    'FULLY REFUNDABLE',
    'REFUND ALLOWED',
  ])('reads "%s" as refundable', (text) => {
    expect(refundableWhen(text)).toBe(true);
  });

  it('is unknown when there is no penalty text at all', () => {
    expect(refundableWhen(null)).toBeNull();
  });
});

describe('baggage units', () => {
  /**
   * `quantityCode` says whether the allowance is a weight or a piece count.
   * `unitQualifier` says which unit that weight is in — and we used to ignore
   * it and label every weight KG.
   *
   * Wherever a carrier files in pounds, common on US itineraries and this is a
   * US-settled agency, a 50 LB allowance was shown as 50 KG: more than twice
   * what the passenger may actually carry.
   *
   * The recorded reply carries both fields:
   *   <freeAllowance>15</freeAllowance><quantityCode>W</quantityCode><unitQualifier>K</unitQualifier>
   *
   * These mutate the real fixture's own baggage element rather than building a
   * stand-in, so the recommendation-to-allowance join stays exactly as Amadeus
   * files it.
   */
  const withAllowance = (baggageDetails) => {
    const xml = readFileSync(new URL('../../fixtures/amadeus/mptbs-oneway-jfk-lhr.xml', import.meta.url), 'utf8');
    const { body } = unwrapEnvelope(parseSoap(xml));
    const reply = body[Object.keys(body).find((k) => k !== 'Fault')];

    const groups = [].concat(reply.serviceFeesGrp ?? []);
    for (const group of groups) {
      for (const fba of [].concat(group.freeBagAllowanceGrp ?? [])) {
        if (fba.freeBagAllownceInfo) fba.freeBagAllownceInfo.baggageDetails = baggageDetails;
      }
    }
    return mapMasterPricerReply(reply, { config, searchSignature: 'test' });
  };

  const bagsOf = (result) =>
    result.offers[0]?.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.includedCheckedBags;

  it('reports kilos as kilos', () => {
    expect(bagsOf(withAllowance({ freeAllowance: '15', quantityCode: 'W', unitQualifier: 'K' })))
      .toEqual({ weight: 15, weightUnit: 'KG' });
  });

  it('reports pounds as pounds, rather than as kilos', () => {
    expect(bagsOf(withAllowance({ freeAllowance: '50', quantityCode: 'W', unitQualifier: 'L' })))
      .toEqual({ weight: 50, weightUnit: 'LB' });
  });

  it('counts pieces when the allowance is a piece count', () => {
    expect(bagsOf(withAllowance({ freeAllowance: '2', quantityCode: 'N' })))
      .toEqual({ quantity: 2 });
  });

  it('falls back to kilos when no unit is filed', () => {
    expect(bagsOf(withAllowance({ freeAllowance: '20', quantityCode: 'W' })))
      .toEqual({ weight: 20, weightUnit: 'KG' });
  });
});

describe('booking class', () => {
  // Virgin Atlantic, Delta and JetBlue (PDT, 15 Sep 2026) send two cabinProducts
  // per flight: the fare's own class, then another carrying a bookingModifier.
  // VS26 priced in the first (T) at the search's $294.50 and in the second (O) at
  // $394.50. Read as one object, the pair gave no class and the offer could not
  // be priced or sold (477 Booking Class not specified).
  it("takes the fare's own class when a flight has a class pair", () => {
    const original = readFileSync(new URL('../../fixtures/amadeus/mptbs-oneway-jfk-lhr.xml', import.meta.url), 'utf8');
    const paired = original.replace(/<cabinProduct>[\s\S]*?<\/cabinProduct>/g,
      '<cabinProduct><rbd>T</rbd><cabin>M</cabin><avlStatus>9</avlStatus></cabinProduct>'
      + '<cabinProduct><rbd>O</rbd><bookingModifier>T</bookingModifier><cabin>M</cabin><avlStatus>9</avlStatus></cabinProduct>');
    expect(paired).not.toBe(original);
    const { body } = unwrapEnvelope(parseSoap(paired));
    const { offers } = mapMasterPricerReply(body[Object.keys(body).find((k) => k !== 'Fault')], { config, searchSignature: 'test' });

    expect(offers.length).toBeGreaterThan(0);
    for (const offer of offers) {
      for (const segment of offer._ama.segments) expect(segment.rbd).toBe('T');
      for (const detail of offer.travelerPricings[0].fareDetailsBySegment) expect(detail.class).toBe('T');
    }
  });
});
