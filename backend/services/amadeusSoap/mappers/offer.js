import { createRequire } from 'node:module';
import { CABIN_BY_DESIGNATOR } from '../codes.js';
import { AIRCRAFT_NAMES } from '../../../data/airports/aircraft.js';
import { arr, at, atTxt, num, txt } from '../parseXml.js';
import {
  applyDateVariation, fromDDMMYY, minutesBetween, toIsoDuration, toIsoLocal,
} from './datetime.js';

const require = createRequire(import.meta.url);
const { carriers: AIRLINE_NAMES } = require('../../../data/airports/airlines.min.json');

/**
 * MasterPricer reply -> the REST-compatible flight offer the app already reads.
 *
 * The route layer (transformAmadeusFlightData, flight.routes.js:383-543) and
 * both clients are untouched by this migration, so this mapper's output is the
 * contract: it must produce the same field names and nesting the Self-Service
 * REST API did. `_ama` is additive and namespaced - the UI never reads it, but
 * it rides along inside `originalOffer` and carries everything the booking
 * chain needs, because this WSAP has no bookable-token concept.
 */

/**
 * Resolve one recommendation's flights.
 *
 * `segmentFlightRef.referencingDetail` holds one entry per leg with
 * refQualifier 'S', in document order: the i-th one indexes
 * flightIndex[i].groupOfFlights[refNumber - 1]. Entries with other qualifiers
 * ('B' and friends) are not segment references and must be skipped, or a round
 * trip resolves to the wrong flights.
 */
const resolveLegs = (recommendation, flightIndexes) => arr(at(recommendation, 'segmentFlightRef.referencingDetail'))
  .filter((d) => txt(d.refQualifier) === 'S')
  .map((d, legIndex) => {
    const groups = arr(at(flightIndexes[legIndex], 'groupOfFlights'));
    const group = groups[Number.parseInt(txt(d.refNumber), 10) - 1];
    return { legIndex, group };
  })
  .filter((l) => l.group);

/** Elapsed flight time for a leg, when Amadeus supplies it (unitQualifier EFT). */
const legElapsedMinutes = (group) => {
  const proposal = arr(at(group, 'propFlightGrDetail.flightProposal'))
    .find((p) => txt(p.unitQualifier) === 'EFT');
  const raw = txt(proposal?.ref);          // 'HHMM', e.g. 1430 = 14h30
  if (!/^\d{3,4}$/.test(raw)) return null;
  const padded = raw.padStart(4, '0');
  return Number.parseInt(padded.slice(0, 2), 10) * 60 + Number.parseInt(padded.slice(2), 10);
};

const buildSegment = (flight, index) => {
  const info = flight.flightInformation ?? {};
  const dt = info.productDateTime ?? {};
  const [board, off] = arr(info.location);

  const depDate = txt(dt.dateOfDeparture);
  // dateOfArrival is already the real arrival date; dateVariation reports the
  // day offset rather than being an offset to apply. Adding it on top puts
  // overnight flights a day late. The variation is only needed as a fallback
  // when Amadeus omits dateOfArrival entirely.
  const arrDate = txt(dt.dateOfArrival)
    ? fromDDMMYY(txt(dt.dateOfArrival))
    : applyDateVariation(depDate, txt(dt.dateVariation));
  const departureAt = toIsoLocal(depDate, txt(dt.timeOfDeparture));
  const arrivalAt = arrDate ? `${arrDate}T${txt(dt.timeOfArrival).padStart(4, '0').replace(/(\d{2})(\d{2})/, '$1:$2')}:00` : null;

  return {
    id: String(index + 1),
    departure: {
      iataCode: txt(board?.locationId),
      terminal: txt(board?.terminal) || undefined,
      at: departureAt,
    },
    arrival: {
      iataCode: txt(off?.locationId),
      terminal: txt(off?.terminal) || undefined,
      at: arrivalAt,
    },
    carrierCode: txt(at(info, 'companyId.marketingCarrier')),
    number: txt(info.flightOrtrainNumber),
    aircraft: { code: txt(at(info, 'productDetail.equipmentType')) },
    operating: { carrierCode: txt(at(info, 'companyId.operatingCarrier')) || txt(at(info, 'companyId.marketingCarrier')) },
    // Deliberately omitted. Departure and arrival are LOCAL airport times and
    // MasterPricer carries no timezone data, so subtracting them gives a wrong
    // elapsed time for any flight crossing zones (JFK 19:25 -> KEF 06:10 reads
    // as 10h45 but is really 5h45). Nothing reads it: the route transform takes
    // the card duration from itinerary.duration - Amadeus's own elapsed flight
    // time - and computes layovers between two times at the same airport, which
    // is unaffected. A wrong number here would eventually be trusted.
    duration: undefined,
    numberOfStops: 0,
    blacklistedInEU: false,
    _raw: {
      departureDate: depDate,
      departureTime: txt(dt.timeOfDeparture),
      arrivalDate: txt(dt.dateOfArrival),
      arrivalTime: txt(dt.timeOfArrival),
      dateVariation: txt(dt.dateVariation),
      electronicTicketing: txt(at(info, 'addProductDetail.electronicTicketing')),
    },
  };
};

/** Per-segment fare data, keyed by leg then position within the leg. */
const readFareDetails = (paxFareProduct) => arr(at(paxFareProduct, 'fareDetails')).map((leg) => ({
  segRef: atTxt(leg, 'segmentRef.segRef'),
  designator: atTxt(leg, 'majCabin.bookingClassDetails.designator'),
  fares: arr(leg.groupOfFares).map((g) => ({
    rbd: atTxt(g, 'productInformation.cabinProduct.rbd'),
    cabinDesignator: atTxt(g, 'productInformation.cabinProduct.cabin'),
    avlStatus: atTxt(g, 'productInformation.cabinProduct.avlStatus'),
    fareBasis: atTxt(g, 'productInformation.fareProductDetail.fareBasis'),
    passengerType: atTxt(g, 'productInformation.fareProductDetail.passengerType'),
    breakPoint: atTxt(g, 'productInformation.breakPoint'),
  })),
}));

/** Free-text pricing messages carry the ticketing deadline and refundability. */
const readPricingMessages = (paxFareProduct) => {
  const messages = arr(paxFareProduct.fare).map((f) => ({
    qualifier: atTxt(f, 'pricingMessage.freeTextQualification.textSubjectQualifier'),
    text: arr(at(f, 'pricingMessage.description')).map(txt).join(' '),
  }));

  const ltd = messages.find((m) => m.qualifier === 'LTD');
  const penalty = messages.filter((m) => m.qualifier === 'PEN').map((m) => m.text).join(' ');

  // 'LAST TKT DTE 05SEP26 - SEE ADV PURCHASE'
  const match = ltd?.text.match(/\b(\d{2})([A-Z]{3})(\d{2})\b/);
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const lastTicketingDate = match
    ? `20${match[3]}-${String(MONTHS.indexOf(match[2]) + 1).padStart(2, '0')}-${match[1]}`
    : null;

  return {
    lastTicketingDate,
    refundable: penalty ? !/NON-?REFUNDABLE/i.test(penalty) : null,
    messages,
  };
};

/**
 * Free checked-bag allowance for a recommendation.
 *
 * The element is spelled `freeBagAllownceInfo` - Amadeus's own typo, and it
 * must be matched exactly. serviceCoverageInfoGrp maps a recommendation item
 * number to a freeBagAllowanceGrp entry via refQualifier 'F'.
 */
const readBaggage = (reply, itemNumber) => {
  const fba = arr(reply.serviceFeesGrp).find((g) => atTxt(g, 'serviceTypeInfo.carrierFeeDetails.type') === 'FBA');
  if (!fba) return null;

  const coverage = arr(fba.serviceCoverageInfoGrp)
    .find((c) => atTxt(c, 'itemNumberInfo.itemNumber.number') === String(itemNumber));
  if (!coverage) return null;

  const ref = arr(at(coverage, 'serviceCovInfoGrp.refInfo.referencingDetail'))
    .find((d) => txt(d.refQualifier) === 'F');
  const wanted = txt(ref?.refNumber) || String(itemNumber);

  const group = arr(fba.freeBagAllowanceGrp)
    .find((g) => atTxt(g, 'itemNumberInfo.itemNumberDetails.number') === wanted)
    ?? arr(fba.freeBagAllowanceGrp)[0];

  const details = at(group, 'freeBagAllownceInfo.baggageDetails');
  if (!details) return null;

  const allowance = num(details.freeAllowance) ?? 0;
  const code = txt(details.quantityCode);
  // 'N' counts pieces; 'W' and 'K' are weights in kilos.
  return code === 'N' ? { quantity: allowance } : { weight: allowance, weightUnit: 'KG' };
};

/**
 * Dictionaries the route layer uses to turn codes into names
 * (`airlines[carrierCode] || carrierCode`, flight.routes.js:414).
 *
 * MasterPricer does not return a carrier-code dictionary - `companyIdText`
 * carries a reference number, not an IATA code - so names come from the bundled
 * tables instead. Only the carriers and aircraft actually present in this reply
 * are included, keeping the payload the same size the REST dictionaries were.
 */
export const buildDictionaries = (reply, offers = []) => {
  const carriers = {};
  const aircraft = {};

  for (const offer of offers) {
    for (const itinerary of offer.itineraries ?? []) {
      for (const segment of itinerary.segments ?? []) {
        for (const code of [segment.carrierCode, segment.operating?.carrierCode]) {
          if (code && AIRLINE_NAMES[code]) carriers[code] = AIRLINE_NAMES[code];
        }
        const type = segment.aircraft?.code;
        if (type && AIRCRAFT_NAMES[type]) aircraft[type] = AIRCRAFT_NAMES[type];
      }
    }
  }

  return { carriers, aircraft, currencies: {}, locations: {} };
};

/**
 * Map one recommendation to a REST-shaped flight offer.
 * @param {object} ctx { reply, flightIndexes, currency, config, searchSignature }
 */
export const mapRecommendation = (recommendation, ctx) => {
  const { reply, flightIndexes, currency, config, searchSignature } = ctx;
  const itemNumber = atTxt(recommendation, 'itemNumber.itemNumberId.number');
  const legs = resolveLegs(recommendation, flightIndexes);
  if (legs.length === 0) return null;

  const paxProducts = arr(recommendation.paxFareProduct);
  const first = paxProducts[0] ?? {};

  // monetaryDetail[0] is the total and [1] is the TAX, not the base fare -
  // confirmed against paxFareDetail.totalFareAmount / totalTaxAmount. Reading
  // [1] as the base would understate every fare shown to a customer.
  const total = num(at(first, 'paxFareDetail.totalFareAmount'))
    ?? num(arr(at(recommendation, 'recPriceInfo.monetaryDetail'))[0]?.amount);
  const tax = num(at(first, 'paxFareDetail.totalTaxAmount'))
    ?? num(arr(at(recommendation, 'recPriceInfo.monetaryDetail'))[1]?.amount)
    ?? 0;
  const base = total === null ? null : Number((total - tax).toFixed(2));

  const validatingCarrier = arr(at(first, 'paxFareDetail.codeShareDetails'))
    .find((c) => txt(c.transportStageQualifier) === 'V');

  const fareByLeg = readFareDetails(first);
  const pricing = readPricingMessages(first);
  const baggage = readBaggage(reply, itemNumber);

  const amaSegments = [];
  let segmentCounter = 0;

  const itineraries = legs.map(({ legIndex, group }) => {
    const flights = arr(group.flightDetails);
    const legFares = fareByLeg[legIndex]?.fares ?? [];

    const segments = flights.map((flight) => {
      const segment = buildSegment(flight, segmentCounter++);
      const fare = legFares[flights.indexOf(flight)] ?? legFares[0] ?? {};

      amaSegments.push({
        legIndex,
        segmentRef: segment.id,
        boardPoint: segment.departure.iataCode,
        boardTerminal: segment.departure.terminal ?? '',
        offPoint: segment.arrival.iataCode,
        offTerminal: segment.arrival.terminal ?? '',
        departureDate: segment._raw.departureDate,
        departureTime: segment._raw.departureTime,
        arrivalDate: segment._raw.arrivalDate,
        arrivalTime: segment._raw.arrivalTime,
        dateVariation: segment._raw.dateVariation,
        marketingCarrier: segment.carrierCode,
        operatingCarrier: segment.operating.carrierCode,
        flightNumber: segment.number,
        rbd: fare.rbd ?? '',
        cabinDesignator: fare.cabinDesignator ?? '',
        equipmentType: segment.aircraft.code,
        fareBasis: fare.fareBasis ?? '',
        breakPoint: fare.breakPoint ?? '',
      });

      delete segment._raw;
      return segment;
    });

    const elapsed = legElapsedMinutes(group)
      ?? minutesBetween(segments[0]?.departure.at, segments[segments.length - 1]?.arrival.at);

    return { duration: toIsoDuration(elapsed), segments };
  });

  const availability = amaSegments
    .map((s) => Number.parseInt(fareByLeg.flatMap((l) => l.fares).find((f) => f.rbd === s.rbd)?.avlStatus ?? '', 10))
    .filter(Number.isFinite);

  const travelerPricings = paxProducts.flatMap((product) => {
    const ptc = atTxt(product, 'paxReference.ptc') || 'ADT';
    const type = { ADT: 'ADULT', CHD: 'CHILD', INF: 'HELD_INFANT' }[ptc] ?? 'ADULT';
    const paxTotal = num(at(product, 'paxFareDetail.totalFareAmount')) ?? total;
    const paxTax = num(at(product, 'paxFareDetail.totalTaxAmount')) ?? 0;
    const productFares = readFareDetails(product);

    return arr(at(product, 'paxReference.traveller')).map((traveller) => ({
      travelerId: txt(traveller.ref),
      fareOption: 'STANDARD',
      travelerType: type,
      price: {
        currency,
        total: paxTotal === null ? null : paxTotal.toFixed(2),
        base: paxTotal === null ? null : (paxTotal - paxTax).toFixed(2),
      },
      fareDetailsBySegment: itineraries.flatMap((itin, legIndex) => itin.segments.map((segment, i) => {
        const fare = productFares[legIndex]?.fares[i] ?? productFares[legIndex]?.fares[0] ?? {};
        return {
          segmentId: segment.id,
          cabin: CABIN_BY_DESIGNATOR[fare.cabinDesignator] ?? 'ECONOMY',
          fareBasis: fare.fareBasis ?? '',
          brandedFare: null,
          class: fare.rbd ?? '',
          includedCheckedBags: baggage ?? undefined,
          amenities: [],
        };
      })),
    }));
  });

  return {
    type: 'flight-offer',
    id: itemNumber,
    // The /order route gates on `source` being present alongside itineraries
    // and travelerPricings (flight.routes.js:1051).
    source: 'GDS',
    instantTicketingRequired: false,
    nonHomogeneous: false,
    oneWay: itineraries.length === 1,
    lastTicketingDate: pricing.lastTicketingDate,
    numberOfBookableSeats: availability.length > 0 ? Math.min(...availability) : undefined,
    itineraries,
    price: {
      currency,
      total: total === null ? null : total.toFixed(2),
      base: base === null ? null : base.toFixed(2),
      grandTotal: total === null ? null : total.toFixed(2),
      fees: [],
    },
    pricingOptions: { fareType: ['PUBLISHED'], includedCheckedBagsOnly: Boolean(baggage) },
    validatingAirlineCodes: validatingCarrier ? [txt(validatingCarrier.company)] : [],
    travelerPricings,
    _ama: {
      wsap: config.wsap,
      officeId: config.officeId,
      currency,
      recommendationId: itemNumber,
      searchedAt: new Date().toISOString(),
      searchSignature,
      refundable: pricing.refundable,
      paxRefs: paxProducts.flatMap((p) => {
        const ptc = atTxt(p, 'paxReference.ptc') || 'ADT';
        return arr(at(p, 'paxReference.traveller')).map((t) => ({ ref: txt(t.ref), ptc }));
      }),
      segments: amaSegments,
    },
  };
};

/** Map a whole MasterPricer reply. */
export const mapMasterPricerReply = (reply, ctx) => {
  const flightIndexes = arr(reply.flightIndex);
  const currency = atTxt(reply, 'conversionRate.conversionRateDetail.currency') || ctx.config.currency;

  const offers = arr(reply.recommendation)
    .map((rec) => mapRecommendation(rec, { ...ctx, reply, flightIndexes, currency }))
    .filter(Boolean);

  return { offers, dictionaries: buildDictionaries(reply, offers), currency };
};

export { fromDDMMYY };
