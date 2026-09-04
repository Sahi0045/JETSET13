/**
 * SOAP actions, body namespaces and the error catalogue for WSAP 1ASIWJETJEC.
 *
 * Every value here is taken from the WSAP's own WSDL, not from documentation:
 * the operation versions are baked into the action strings, so a production
 * WSAP shipping different versions is a change to this file plus a fixture
 * re-record. Nothing else in the client hardcodes an operation version.
 */

const ACTION_PREFIX = 'http://webservices.amadeus.com/';
const BODY_NS_PREFIX = 'http://xml.amadeus.com/';

/** operation name -> the version suffix shared by its action and body namespace */
const SUFFIXES = Object.freeze({
  Fare_MasterPricerTravelBoardSearch: 'FMPTBQ_24_6_1A',
  Fare_MasterPricerCalendar: 'FMPCAQ_20_2_1A',
  Fare_InformativePricingWithoutPNR: 'TIPNRQ_24_3_1A',
  Fare_InformativeBestPricingWithoutPNR: 'TIBNRQ_23_1_1A',
  Fare_CheckRules: 'FARQNQ_07_1_1A',
  Air_FlightInfo: 'FLIREQ_07_1_1A',
  Air_SellFromRecommendation: 'ITAREQ_05_2_IA',
  PNR_AddMultiElements: 'PNRADD_22_1_1A',
  Fare_PricePNRWithBookingClass: 'TPCBRQ_24_3_1A',
  Ticket_CreateTSTFromPricing: 'TAUTCQ_04_1_1A',
  FOP_CreateFormOfPayment: 'TFOPCQ_19_2_1A',
  DocIssuance_IssueTicket: 'TTKTIQ_15_1_1A',
  Queue_PlacePNR: 'QUQPCQ_03_1_1A',
  PNR_Retrieve: 'PNRRET_21_1_1A',
  PNR_Cancel: 'PNRXCL_22_1_1A',
  Ticket_CancelDocument: 'TRCANQ_14_1_1A',
  Security_SignOut: 'VLSSOQ_04_1_1A',
});

export const OPERATIONS = Object.freeze(
  Object.fromEntries(
    Object.entries(SUFFIXES).map(([name, suffix]) => [
      name,
      Object.freeze({ name, suffix, action: `${ACTION_PREFIX}${suffix}`, namespace: `${BODY_NS_PREFIX}${suffix}` }),
    ]),
  ),
);

/**
 * Operations that may be sent without a Session header and retried safely.
 * Everything absent from this set mutates GDS state: a retry double-books.
 */
export const STATELESS_OPERATIONS = Object.freeze(new Set([
  'Fare_MasterPricerTravelBoardSearch',
  'Fare_MasterPricerCalendar',
  'Fare_InformativePricingWithoutPNR',
  'Fare_InformativeBestPricingWithoutPNR',
  'Fare_CheckRules',
  'Air_FlightInfo',
  'PNR_Retrieve',
]));

/** Amadeus cabin designator -> the cabin name the UI renders. */
export const CABIN_BY_DESIGNATOR = Object.freeze({
  M: 'ECONOMY',
  W: 'PREMIUM_ECONOMY',
  C: 'BUSINESS',
  F: 'FIRST',
});

/** Our travelClass input -> the designator Amadeus expects in travelFlightInfo. */
export const DESIGNATOR_BY_CABIN = Object.freeze({
  ECONOMY: 'Y',
  PREMIUM_ECONOMY: 'W',
  BUSINESS: 'C',
  FIRST: 'F',
});

/**
 * Amadeus reply conditions mapped to what the HTTP layer should say.
 *
 * `error` is customer-facing and must never carry raw Amadeus text - that goes
 * in `technicalError`, which the existing refund path already logs
 * (flight.routes.js:88). `empty: true` means "not an error at all": a search
 * that found no fares is a successful search with no results, and both clients
 * depend on that staying a 200 with `success: true`.
 */
export const ERROR_CATALOGUE = Object.freeze([
  // 931 is Amadeus's own code for "no itinerary found"; matching the code as
  // well as the text keeps this working if the wording is ever localised.
  { match: /\b931\b|no.*(itinerary|fare|recommendation).*found|not.*available.*date/i, empty: true },
  { match: /invalid.*(city|airport|location)|unknown.*location/i, code: 400, error: 'Unknown airport or city code' },
  { match: /(authenticat|invalid.*(user|password|office)|not.*authoriz)/i, code: 502, error: 'Flight service temporarily unavailable', alert: true },
  { match: /(session|conversation).*(limit|exceed|maximum)|too many/i, code: 503, error: 'Too many concurrent requests, please retry', retryAfter: 2 },
  { match: /unable to (confirm|sell)|segment.*(closed|waitlist)|class.*not.*available/i, code: 409, error: 'That flight is no longer available at this price' },
  { match: /price.*(changed|differ)|fare.*(changed|no longer)/i, code: 409, error: 'The fare changed while booking - please search again' },
  { match: /(pnr|record locator|booking).*not found/i, code: 404, error: 'Booking not found' },
]);

export const DEFAULT_ERROR = Object.freeze({ code: 502, error: 'Flight service temporarily unavailable' });
