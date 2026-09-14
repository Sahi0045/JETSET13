import { DESIGNATOR_BY_CABIN, OPERATIONS } from '../codes.js';
import { each, el, wrap } from '../xml.js';
import { toDDMMYY } from '../mappers/datetime.js';

/**
 * Fare_MasterPricerTravelBoardSearch and Fare_MasterPricerCalendar.
 *
 * The two messages share most of their body, so the shared pieces are built
 * once here. Element order follows the root sequence in each XSD exactly:
 *
 *   numberOfUnit -> globalOptions -> paxReference -> ... -> fareOptions
 *     -> ... -> travelFlightInfo -> itinerary
 *
 * XML Schema sequences are ordered, and a misplaced element fails validation
 * with a message that does not name the element, so the order is the contract.
 * `travelFlightInfo` in particular sits *before* `itinerary`.
 */

/**
 * Seats requested (PX) and recommendations wanted back (RC).
 *
 * PX counts SEATS - adults and children. An infant on a lap holds none, and
 * counting one returns "926 Invalid number of passenger" (live WSAP,
 * 2026-09-15).
 */
const buildNumberOfUnit = (seats, max) => wrap('numberOfUnit', [
  wrap('unitNumberDetail', [el('numberOfUnits', String(seats)), el('typeOfUnit', 'PX')]),
  wrap('unitNumberDetail', [el('numberOfUnits', String(max)), el('typeOfUnit', 'RC')]),
]);

/**
 * One traveller reference per passenger, grouped by passenger type code.
 *
 * Adults and children are numbered 1..n once overall. An infant has no number
 * of its own: it rides on an adult's lap, so it carries that adult's reference
 * with infantIndicator 1 - infant 1 on adult 1, infant 2 on adult 2. Numbered as
 * a passenger in its own right, as it was, every search with an infant failed
 * with "955 Invalid passenger type code". Verified against the live WSAP on
 * 2026-09-15 for 1+1, 2+2 and 2 adults + 1 child + 1 infant.
 */
const buildPaxReferences = ({ adults = 1, children = 0, infants = 0 }) => {
  let ref = 0;
  const seated = [['ADT', adults], ['CHD', children]]
    .filter(([, n]) => n > 0)
    .map(([ptc, n]) => wrap('paxReference', [
      el('ptc', ptc),
      each(Array.from({ length: n }, () => ++ref), (r) => wrap('traveller', el('ref', String(r)))),
    ]))
    .join('');
  const onLaps = infants > 0
    ? wrap('paxReference', [
      el('ptc', 'INF'),
      each(Array.from({ length: infants }, (_, i) => i + 1), (adultRef) => wrap('traveller', [
        el('ref', String(adultRef)),
        el('infantIndicator', '1'),
      ])),
    ])
    : '';
  return seated + onLaps;
};

/**
 * pricingTickInfo is mandatory inside fareOptions; conversionRate is where the
 * currency is pinned, which keeps offers USD for ARC Pay.
 *
 * conversionType is optional in the schema but rejected when absent: omitting
 * it returns "Bad value (coded) - conversionRate/fareSelect" and zero
 * recommendations. 'FC' (fare currency) is the working value.
 */
const buildFareOptions = (currency = 'USD') => wrap('fareOptions', [
  wrap('pricingTickInfo', wrap('pricingTicketing', [
    el('priceType', 'RP'),
    el('priceType', 'RU'),
    el('priceType', 'TAC'),
  ])),
  wrap('conversionRate', wrap('conversionRateDetail', [
    el('conversionType', 'FC'),
    el('currency', currency),
  ])),
]);

/**
 * Cabin, non-stop and airline filters.
 * Included and excluded carriers are mutually exclusive in one companyIdentity
 * block; carrierQualifier 'X' excludes, 'M' includes.
 */
const buildTravelFlightInfo = ({ travelClass, nonStop, includedAirlineCodes, excludedAirlineCodes }) => {
  const cabin = DESIGNATOR_BY_CABIN[String(travelClass || '').toUpperCase().replace(/\s+/g, '_')];
  const included = (includedAirlineCodes || []).filter(Boolean);
  const excluded = (excludedAirlineCodes || []).filter(Boolean);

  const carriers = included.length > 0
    ? wrap('companyIdentity', [el('carrierQualifier', 'M'), each(included, (c) => el('carrierId', c))])
    : excluded.length > 0
      ? wrap('companyIdentity', [el('carrierQualifier', 'X'), each(excluded, (c) => el('carrierId', c))])
      : '';

  return wrap('travelFlightInfo', [
    // CabinIdentificationType orders cabinQualifier before cabin.
    cabin ? wrap('cabinId', [el('cabinQualifier', 'RC'), el('cabin', cabin)]) : '',
    carriers,
    nonStop ? wrap('flightDetail', el('flightType', 'N')) : '',
  ]);
};

/** The legs of a trip. A metro code (LON, NYC) is qualified 'C', an airport 'A'. */
const buildLegs = (p) => {
  const fromIsCity = Boolean(p.fromIsCity);
  const toIsCity = Boolean(p.toIsCity);
  const legs = [{
    origin: p.from, destination: p.to, date: p.departDate,
    originIsCity: fromIsCity, destinationIsCity: toIsCity,
  }];
  if (p.returnDate) {
    legs.push({
      origin: p.to, destination: p.from, date: p.returnDate,
      originIsCity: toIsCity, destinationIsCity: fromIsCity,
    });
  }
  return legs;
};

/**
 * @param {object} leg
 * @param {number} index         0-based; segRef is index+1 and indexes flightIndex in the reply
 * @param {?number} dayInterval  when set, widens the search to +/- N days
 */
const buildItinerary = (leg, index, dayInterval = null) => wrap('itinerary', [
  wrap('requestedSegmentRef', el('segRef', String(index + 1))),
  wrap('departureLocalization', wrap('depMultiCity', [
    el('locationId', leg.origin),
    el('airportCityQualifier', leg.originIsCity ? 'C' : 'A'),
  ])),
  wrap('arrivalLocalization', wrap('arrivalMultiCity', [
    el('locationId', leg.destination),
    el('airportCityQualifier', leg.destinationIsCity ? 'C' : 'A'),
  ])),
  // DateAndTimeInformationType orders firstDateTimeDetail then rangeOfDate.
  wrap('timeDetails', [
    wrap('firstDateTimeDetail', el('date', toDDMMYY(leg.date))),
    dayInterval === null ? '' : wrap('rangeOfDate', [
      el('rangeQualifier', 'C'),
      el('dayInterval', String(dayInterval)),
    ]),
  ]),
]);

const normalize = (p) => {
  if (!p.from || !p.to || !p.departDate) throw new Error('from, to and departDate are required');
  const group = {
    adults: Number(p.adults ?? 1) || 1,
    children: Number(p.children ?? 0) || 0,
    infants: Number(p.infants ?? 0) || 0,
  };
  // Each infant rides on an adult's lap and borrows that adult's reference, so
  // an infant without an adult has nothing to point at.
  if (group.infants > group.adults) throw new Error('each infant must travel with an adult');
  return { ...group, currency: p.currency ?? 'USD' };
};

/**
 * Dated search.
 *
 * @param {object} p
 * @param {string} p.from p.to           IATA airport or metropolitan code
 * @param {boolean} [p.fromIsCity] [p.toIsCity]
 * @param {string} p.departDate          ISO date
 * @param {string} [p.returnDate]        presence makes it a round trip
 * @param {number} [p.adults=1] [p.children=0] [p.infants=0]
 * @param {string} [p.travelClass]       ECONOMY | PREMIUM_ECONOMY | BUSINESS | FIRST
 * @param {boolean} [p.nonStop]
 * @param {string[]} [p.includedAirlineCodes] [p.excludedAirlineCodes]
 * @param {number} [p.max=50]
 * @param {string} [p.currency='USD']
 */
export const buildMasterPricerBody = (p) => {
  const { adults, children, infants, currency } = normalize(p);
  // Seats, not people: an infant on a lap is not counted (buildNumberOfUnit).
  const paxTotal = adults + children;

  const body = [
    buildNumberOfUnit(paxTotal, Number(p.max ?? 50) || 50),
    buildPaxReferences({ adults, children, infants }),
    buildFareOptions(currency),
    buildTravelFlightInfo(p),
    each(buildLegs(p), (leg, i) => buildItinerary(leg, i)),
  ].filter(Boolean).join('');

  const ns = OPERATIONS.Fare_MasterPricerTravelBoardSearch.namespace;
  return `    <Fare_MasterPricerTravelBoardSearch xmlns="${ns}">${body}</Fare_MasterPricerTravelBoardSearch>`;
};

/**
 * Flexible-date search: one call covering departDate +/- dayInterval days.
 *
 * This replaces the fan-out the calendar endpoints used to do - one search per
 * date, batched six at a time with sleeps between - so a month view costs a
 * handful of calls instead of about thirty.
 *
 * @param {number} [p.dayInterval=3] days either side. The WSAP enforces a
 *   ceiling, so callers chunk a wider window into several calls.
 */
export const buildCalendarBody = (p) => {
  const { adults, children, infants, currency } = normalize(p);
  // Seats, not people: an infant on a lap is not counted (buildNumberOfUnit).
  const paxTotal = adults + children;
  const dayInterval = Number(p.dayInterval ?? 3) || 3;

  const body = [
    buildNumberOfUnit(paxTotal, Number(p.max ?? 200) || 200),
    buildPaxReferences({ adults, children, infants }),
    buildFareOptions(currency),
    buildTravelFlightInfo(p),
    each(buildLegs(p), (leg, i) => buildItinerary(leg, i, dayInterval)),
  ].filter(Boolean).join('');

  const ns = OPERATIONS.Fare_MasterPricerCalendar.namespace;
  return `    <Fare_MasterPricerCalendar xmlns="${ns}">${body}</Fare_MasterPricerCalendar>`;
};
