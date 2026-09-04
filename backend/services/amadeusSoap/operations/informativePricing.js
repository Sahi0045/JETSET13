import { OPERATIONS } from '../codes.js';
import { each, el, wrap } from '../xml.js';

/**
 * Fare_InformativePricingWithoutPNR - price a set of segments before any PNR
 * exists.
 *
 * This is what /flights/price and the pricing step of /order use. The search
 * price is a quote; this is the fare Amadeus will actually charge, and the two
 * can differ once availability shifts. Booking must never ticket at the search
 * price without re-pricing.
 *
 * Root sequence (Fare_InformativePricingWithoutPNR_24_3_1A.xsd):
 *   originatorGroup? -> stakeholder[] -> passengersGroup[1..198]
 *     -> segmentGroup[1..99] -> pricingOptionGroup[0..999]
 */

const PTC_TO_CODE = Object.freeze({ ADULT: 'ADT', CHILD: 'CHD', HELD_INFANT: 'INF', SEATED_INFANT: 'INS' });

/**
 * One passengersGroup per passenger type.
 *
 * `segmentControlDetails` carries the shape of the request: how many passengers
 * of this type, and how many segments each is being priced over. Amadeus uses
 * it to line the groups up against segmentGroup, so it has to match exactly.
 */
const buildPassengerGroups = (paxRefs, segmentCount) => {
  const byType = new Map();
  for (const pax of paxRefs) {
    const code = PTC_TO_CODE[pax.ptc] ?? pax.ptc ?? 'ADT';
    if (!byType.has(code)) byType.set(code, []);
    byType.get(code).push(pax.ref);
  }

  return [...byType.entries()].map(([code, refs]) => wrap('passengersGroup', [
    // Verified against the live WSAP: `quantity` is the SEGMENT count and
    // `numberOfUnits` is the PASSENGER count - the reverse of what the names
    // suggest. The traveller IDs below must number exactly `numberOfUnits`, or
    // Amadeus returns error 477, "the number of Passengers IDs does not match
    // the number of passengers in the group".
    wrap('segmentRepetitionControl', wrap('segmentControlDetails', [
      el('quantity', String(segmentCount)),
      el('numberOfUnits', String(refs.length)),
    ])),
    // travellersID is max=1 per group and holds one travellerDetails per
    // passenger. Emitting one travellersID each returns error 477, "the number
    // of Passengers IDs does not match the number of passengers in the group".
    wrap('travellersID', each(refs, (ref) => wrap('travellerDetails', el('measurementValue', String(ref))))),
    code === 'ADT' ? '' : wrap('discountPtc', el('valueQualifier', code)),
  ])).join('');
};

/**
 * One segmentGroup per flight segment, in travel order across all legs.
 *
 * Note `offpointDetails` - one 'f'. MasterPricer spells the same concept
 * `offPointDetails`; copying that spelling here fails validation with an error
 * that does not name the element.
 */
const buildSegmentGroups = (segments) => each(segments, (segment) => wrap('segmentGroup', wrap('segmentInformation', [
  wrap('flightDate', [
    el('departureDate', segment.departureDate),
    el('departureTime', segment.departureTime),
    segment.arrivalDate ? el('arrivalDate', segment.arrivalDate) : '',
  ]),
  wrap('boardPointDetails', el('trueLocationId', segment.boardPoint)),
  wrap('offpointDetails', el('trueLocationId', segment.offPoint)),
  wrap('companyDetails', el('marketingCompany', segment.marketingCarrier)),
  wrap('flightIdentification', [
    el('flightNumber', segment.flightNumber),
    el('bookingClass', segment.rbd),
  ]),
])));

/**
 * @param {object} p
 * @param {Array<{ref:string, ptc:string}>} p.paxRefs   from offer._ama.paxRefs
 * @param {Array} p.segments                             from offer._ama.segments
 * @param {string} [p.currency='USD']
 * @param {string} [p.validatingCarrier]                 pins the plating carrier
 */
export const buildInformativePricingBody = (p) => {
  const { paxRefs, segments, currency = 'USD', validatingCarrier } = p;

  if (!segments?.length) throw new Error('segments are required to price an offer');
  if (!paxRefs?.length) throw new Error('paxRefs are required to price an offer');

  const body = [
    buildPassengerGroups(paxRefs, segments.length),
    buildSegmentGroups(segments),
    // RP  - published fares only, matching what search returned
    // FCO - price in this currency
    // VC  - plate on the validating carrier the recommendation named
    wrap('pricingOptionGroup', wrap('pricingOptionKey', el('pricingOptionKey', 'RP'))),
    wrap('pricingOptionGroup', [
      wrap('pricingOptionKey', el('pricingOptionKey', 'FCO')),
      // CurrenciesType -> firstCurrencyDetails; currencyQualifier is mandatory.
      wrap('currency', wrap('firstCurrencyDetails', [
        el('currencyQualifier', 'FCO'),
        el('currencyIsoCode', currency),
      ])),
    ]),
    validatingCarrier
      ? wrap('pricingOptionGroup', [
        wrap('pricingOptionKey', el('pricingOptionKey', 'VC')),
        wrap('carrierInformation', wrap('companyIdentification', el('otherCompany', validatingCarrier))),
      ])
      : '',
  ].filter(Boolean).join('');

  const ns = OPERATIONS.Fare_InformativePricingWithoutPNR.namespace;
  return `    <Fare_InformativePricingWithoutPNR xmlns="${ns}">${body}</Fare_InformativePricingWithoutPNR>`;
};
