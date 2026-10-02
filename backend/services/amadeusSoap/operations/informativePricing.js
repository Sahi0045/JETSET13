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
export const buildPassengerGroups = (paxRefs, segmentCount) => {
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
    code === 'ADT' ? '' : wrap('discountPtc', [
      el('valueQualifier', code),
      // 766: an infant without a seat. An infant's traveller ID is its
      // adult's reference (see masterPricer.js), so without the qualifier the
      // group reads as a second passenger on that seat. Priced correctly on
      // the live WSAP on 2026-09-15.
      code === 'INF' ? wrap('fareDetails', el('qualifier', '766')) : '',
    ]),
  ])).join('');
};

/**
 * One segmentGroup per flight segment, in travel order across all legs.
 *
 * Note `offpointDetails` - one 'f'. MasterPricer spells the same concept
 * `offPointDetails`; copying that spelling here fails validation with an error
 * that does not name the element.
 */
export const buildSegmentGroups = (segments) => each(segments, (segment) => wrap('segmentGroup', wrap('segmentInformation', [
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

/** A fare family's short name: an..30 in the reply schemas, letters and digits in practice. */
const FARE_FAMILY_NAME = /^[A-Z0-9]{1,30}$/;

/**
 * PFF: price one fare family, named in FF.
 *
 * An airline can sell more than one family in the same booking class, so the
 * class alone does not say which fare was chosen: on PDT (1 Oct 2026) Lufthansa
 * FRA-JFK class B priced ECOLIGHT at 2375.89 and ECOFLEX at 2735.89. Unpinned,
 * pricing takes the cheapest. Amadeus's Airline Fare Families certification
 * requires the pricing that creates the TST to name the chosen family.
 *
 * Verified on PDT the same day. The name alone in attributeType answers 911
 * FARE FAMILY IS MISSING, carrierInformation beside it answers INVALID
 * ATTRIBUTE FOR OPTION: PFF, and a family the class does not sell answers 911
 * NO FARE FOUND FOR REQUESTED FARE FAMILY.
 *
 * The name comes back from the client inside the offer, so anything that is not
 * a family name is refused rather than sent.
 *
 * @param {string} [fareFamily]
 * @returns {string} the pricingOptionGroup, or '' when no family is pinned
 */
export const fareFamilyOption = (fareFamily) => {
  if (fareFamily === undefined || fareFamily === null || fareFamily === '') return '';
  if (!FARE_FAMILY_NAME.test(String(fareFamily))) throw new Error('fareFamily is not a fare family name');
  return wrap('pricingOptionGroup', [
    wrap('pricingOptionKey', el('pricingOptionKey', 'PFF')),
    wrap('optionDetail', wrap('criteriaDetails', [
      el('attributeType', 'FF'),
      el('attributeDescription', fareFamily),
    ])),
  ]);
};

/**
 * @param {object} p
 * @param {Array<{ref:string, ptc:string}>} p.paxRefs   from offer._ama.paxRefs
 * @param {Array} p.segments                             from offer._ama.segments
 * @param {string} [p.currency='USD']
 * @param {string} [p.validatingCarrier]                 pins the plating carrier
 * @param {string} [p.fareFamily]                        pins the fare family (PFF)
 */
export const buildInformativePricingBody = (p) => {
  const { paxRefs, segments, currency = 'USD', validatingCarrier, fareFamily } = p;

  if (!segments?.length) throw new Error('segments are required to price an offer');
  if (!paxRefs?.length) throw new Error('paxRefs are required to price an offer');

  const body = [
    buildPassengerGroups(paxRefs, segments.length),
    buildSegmentGroups(segments),
    // RP  - published fares
    // RU  - unifares (negotiated). The search asks for RP, RU and TAC, so
    //       pricing has to accept the same fare types. Asking for published
    //       fares only re-prices a negotiated fare - usually the cheapest
    //       thing the customer was shown - as a published one, at a different
    //       amount. This is the price on the review page and the amount taken
    //       at ARC Pay, so the mismatch is money, not cosmetics.
    // FCO - price in this currency
    // VC  - plate on the validating carrier the recommendation named
    wrap('pricingOptionGroup', wrap('pricingOptionKey', el('pricingOptionKey', 'RP'))),
    wrap('pricingOptionGroup', wrap('pricingOptionKey', el('pricingOptionKey', 'RU'))),
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
    fareFamilyOption(fareFamily),
  ].filter(Boolean).join('');

  const ns = OPERATIONS.Fare_InformativePricingWithoutPNR.namespace;
  return `    <Fare_InformativePricingWithoutPNR xmlns="${ns}">${body}</Fare_InformativePricingWithoutPNR>`;
};
