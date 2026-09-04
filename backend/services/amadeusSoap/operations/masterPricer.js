import { DESIGNATOR_BY_CABIN, OPERATIONS } from '../codes.js';
import { each, el, wrap } from '../xml.js';
import { toDDMMYY } from '../mappers/datetime.js';

/**
 * Fare_MasterPricerTravelBoardSearch request builder.
 *
 * Element order below follows the root sequence in
 * Fare_MasterPricerTravelBoardSearch_24_6_1A.xsd exactly:
 *
 *   numberOfUnit -> globalOptions -> paxReference -> ... -> fareOptions
 *     -> ... -> travelFlightInfo -> itinerary
 *
 * XML Schema sequences are ordered, and a misplaced element fails validation
 * with a message that does not name the element, so the order is the contract.
 * `travelFlightInfo` in particular sits *before* `itinerary`.
 */

const PTC = Object.freeze({ adults: 'ADT', children: 'CHD', infants: 'INF' });

/** One traveller reference per passenger, grouped by passenger type code. */
const buildPaxReferences = ({ adults = 1, children = 0, infants = 0 }) => {
  const counts = { adults, children, infants };
  let ref = 0;
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => {
      const travellers = Array.from({ length: n }, () => el('ref', String(++ref)));
      return wrap('paxReference', [el('ptc', PTC[kind]), each(travellers, (t) => wrap('traveller', t))]);
    })
    .join('');
};

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

/** One itinerary block per leg; segRef is 1-based and indexes flightIndex in the reply. */
const buildItineraries = (legs) => each(legs, (leg, i) => wrap('itinerary', [
  wrap('requestedSegmentRef', el('segRef', String(i + 1))),
  wrap('departureLocalization', wrap('depMultiCity', [
    el('locationId', leg.origin),
    el('airportCityQualifier', leg.originIsCity ? 'C' : 'A'),
  ])),
  wrap('arrivalLocalization', wrap('arrivalMultiCity', [
    el('locationId', leg.destination),
    el('airportCityQualifier', leg.destinationIsCity ? 'C' : 'A'),
  ])),
  wrap('timeDetails', wrap('firstDateTimeDetail', [
    el('date', toDDMMYY(leg.date)),
    leg.rangeDays ? '' : '',
  ])),
]));

/**
 * @param {object} p
 * @param {string} p.from            origin IATA
 * @param {string} p.to              destination IATA
 * @param {string} p.departDate      ISO date
 * @param {string} [p.returnDate]    ISO date; presence makes it a round trip
 * @param {number} [p.adults=1] [p.children=0] [p.infants=0]
 * @param {string} [p.travelClass]   ECONOMY | PREMIUM_ECONOMY | BUSINESS | FIRST
 * @param {boolean} [p.nonStop]
 * @param {string[]} [p.includedAirlineCodes] [p.excludedAirlineCodes]
 * @param {number} [p.max=50]        recommendations requested
 * @param {string} [p.currency='USD']
 */
export const buildMasterPricerBody = (p) => {
  const {
    from, to, departDate, returnDate,
    adults = 1, children = 0, infants = 0,
    travelClass, nonStop, includedAirlineCodes, excludedAirlineCodes,
    max = 50, currency = 'USD',
  } = p;

  if (!from || !to || !departDate) throw new Error('from, to and departDate are required');

  const paxTotal = Number(adults) + Number(children) + Number(infants);
  // A metropolitan code (LON, NYC) must be qualified 'C' so Amadeus searches
  // every airport in the city; an airport code is 'A'.
  const fromIsCity = Boolean(p.fromIsCity);
  const toIsCity = Boolean(p.toIsCity);
  const legs = [{ origin: from, destination: to, date: departDate, originIsCity: fromIsCity, destinationIsCity: toIsCity }];
  if (returnDate) legs.push({ origin: to, destination: from, date: returnDate, originIsCity: toIsCity, destinationIsCity: fromIsCity });

  const body = [
    wrap('numberOfUnit', [
      wrap('unitNumberDetail', [el('numberOfUnits', String(paxTotal)), el('typeOfUnit', 'PX')]),
      wrap('unitNumberDetail', [el('numberOfUnits', String(max)), el('typeOfUnit', 'RC')]),
    ]),
    buildPaxReferences({ adults, children, infants }),
    // pricingTickInfo is mandatory inside fareOptions; conversionRate is where
    // the currency is pinned, which keeps offers USD for ARC Pay.
    wrap('fareOptions', [
      wrap('pricingTickInfo', wrap('pricingTicketing', [
        el('priceType', 'RP'),
        el('priceType', 'RU'),
        el('priceType', 'TAC'),
      ])),
      // conversionType is optional in the schema but rejected when absent:
      // omitting it returns "Bad value (coded) - conversionRate/fareSelect" and
      // zero recommendations. 'FC' (fare currency) is the working value.
      wrap('conversionRate', wrap('conversionRateDetail', [
        el('conversionType', 'FC'),
        el('currency', currency),
      ])),
    ]),
    buildTravelFlightInfo({ travelClass, nonStop, includedAirlineCodes, excludedAirlineCodes }),
    buildItineraries(legs),
  ].filter(Boolean).join('');

  return `    <Fare_MasterPricerTravelBoardSearch xmlns="${OPERATIONS.Fare_MasterPricerTravelBoardSearch.namespace}">${body}</Fare_MasterPricerTravelBoardSearch>`;
};
