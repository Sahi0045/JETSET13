import { OPERATIONS } from '../codes.js';
import { arr, at, txt } from '../parseXml.js';
import { each, el, wrap } from '../xml.js';

/**
 * Air_SellFromRecommendation - claim seats on the flights the customer chose.
 *
 * This is the first mutating call in the booking chain and the call that opens
 * the session. Everything before it is a quote; this one holds inventory in the
 * airline's system. It must never be retried: a retried sell is a second
 * booking, and the customer is already charged by the time we get here.
 *
 * Root sequence (Air_SellFromRecommendation_05_2_IA.xsd):
 *   messageActionDetails? -> recordLocator? -> itineraryDetails[0..99]
 *     { originDestinationDetails, message?, segmentInformation[1..9]
 *       { travelProductInformation, relatedproductInformation } }
 */

/**
 * Statuses that mean the seats are held.
 *
 * This WSAP answers a successful sell with `OK` in
 * `segmentInformation/actionDetails/statusCode`, not with the KK/HK/SS codes
 * the segment-status vocabulary would suggest. Verified against the live reply:
 * without OK here every successful booking was rejected as unsold.
 */
const SOLD = new Set(['OK', 'KK', 'HK', 'SS', 'HL']);

/**
 * Statuses that mean they are not, and never will be for this request.
 * UC is "unable to confirm" - the fare sold out between search and sell, which
 * is normal rather than exceptional and has to be handled as a clean refund.
 */
const REFUSED = new Set(['UC', 'NO', 'US', 'UN', 'NN']);

/** Group the flat `_ama.segments` list back into the legs it came from. */
const groupByLeg = (segments) => {
  const legs = new Map();
  for (const segment of segments) {
    const key = segment.legIndex ?? 0;
    if (!legs.has(key)) legs.set(key, []);
    legs.get(key).push(segment);
  }
  return [...legs.entries()].sort((a, b) => a[0] - b[0]).map(([, list]) => list);
};

const buildSegment = (segment, seats) => wrap('segmentInformation', [
  wrap('travelProductInformation', [
    wrap('flightDate', [
      el('departureDate', segment.departureDate),
      el('arrivalDate', segment.arrivalDate),
      // Reports that the arrival falls on a later day. Amadeus rejects the
      // segment outright if this disagrees with the two dates above.
      el('dateVariation', segment.dateVariation),
    ]),
    wrap('boardPointDetails', el('trueLocationId', segment.boardPoint)),
    // One 'f', as in Fare_InformativePricingWithoutPNR. MasterPricer spells the
    // same concept offPointDetails; that spelling fails here.
    wrap('offpointDetails', el('trueLocationId', segment.offPoint)),
    wrap('companyDetails', el('marketingCompany', segment.marketingCarrier)),
    wrap('flightIdentification', [
      el('flightNumber', segment.flightNumber),
      // The booking class is the RBD the fare was found in (a letter such as
      // 'T'), not the cabin. Selling in the cabin code prices a different fare.
      el('bookingClass', segment.rbd),
    ]),
  ]),
  // NN = "need", the request to sell. `quantity` is seats, so infants are
  // excluded: they are carried on an adult's lap and hold no inventory.
  wrap('relatedproductInformation', [
    el('quantity', String(seats)),
    el('statusCode', 'NN'),
  ]),
]);

/**
 * @param {object} p
 * @param {Array} p.segments   offer._ama.segments
 * @param {number} p.seats     passengers occupying a seat (adults + children)
 */
export const buildAirSellBody = (p) => {
  const { segments, seats } = p;
  if (!segments?.length) throw new Error('segments are required to sell an itinerary');
  if (!(seats >= 1)) throw new Error('seats must be at least 1');

  const legs = groupByLeg(segments);

  const body = [
    // 183 = sell, M1 = from a recommendation rather than from availability.
    wrap('messageActionDetails', wrap('messageFunctionDetails', [
      el('messageFunction', '183'),
      el('additionalMessageFunction', 'M1'),
    ])),
    each(legs, (leg) => wrap('itineraryDetails', [
      wrap('originDestinationDetails', [
        el('origin', leg[0].boardPoint),
        el('destination', leg[leg.length - 1].offPoint),
      ]),
      each(leg, (segment) => buildSegment(segment, seats)),
    ])),
  ].join('');

  const ns = OPERATIONS.Air_SellFromRecommendation.namespace;
  return `    <Air_SellFromRecommendation xmlns="${ns}">${body}</Air_SellFromRecommendation>`;
};

/**
 * Read the seat statuses back.
 *
 * The reply nests the status differently depending on how the segment resolved,
 * so rather than guessing one path this collects every statusCode under the
 * itinerary nodes. A sell is only good if every segment came back sold - a
 * partial confirmation is still a failed booking, and leaving it half-held is
 * worse than not booking at all.
 *
 * @returns {{sold: boolean, statuses: string[], refused: string[]}}
 */
export const readAirSellReply = (reply) => {
  const statuses = [];

  const visit = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 8) return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'statusCode') {
        for (const entry of arr(value)) statuses.push(txt(entry).toUpperCase());
      } else if (typeof value === 'object') {
        visit(value, depth + 1);
      }
    }
  };
  visit(at(reply, 'itineraryDetails') ?? reply);

  const refused = statuses.filter((s) => REFUSED.has(s));
  return {
    sold: statuses.length > 0 && statuses.every((s) => SOLD.has(s)),
    statuses,
    refused,
  };
};
