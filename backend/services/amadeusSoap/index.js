import { createHash } from 'node:crypto';
import logger from '../logger.js';
import { reportError } from '../monitoring.js';
import { isCityCode, resolveToIata, searchLocations as searchAirports } from '../airportsIndex.js';
import { getWsConfig } from './config.js';
import { AmadeusSoapError, inspectReply } from './errors.js';
import { mapMasterPricerReply } from './mappers/offer.js';
import { buildMasterPricerBody } from './operations/masterPricer.js';
import { unwrapEnvelope } from './parseXml.js';
import { callStateless } from './session.js';

const log = logger.child({ svc: 'amadeus-ws' });

/**
 * Flight provider backed by Amadeus Enterprise Web Services.
 *
 * Method names, arguments and return shapes deliberately match the REST service
 * this replaces, so backend/routes/flight.routes.js and both clients are
 * unchanged. Two conventions from that service are preserved exactly, because
 * the routes' error handling depends on them:
 *
 *   - methods the routes wrap in try/catch THROW {success:false, error, code}
 *   - advisory methods RETURN a soft-fail object and never throw
 */

/** Detect a search whose parameters changed between search and booking. */
const signatureOf = (p) => createHash('sha1')
  .update([p.from, p.to, p.departDate, p.returnDate ?? '', p.adults ?? 1, p.children ?? 0, p.infants ?? 0, p.travelClass ?? ''].join('|'))
  .digest('hex')
  .slice(0, 12);

const reportIfAlerting = (error) => {
  if (error instanceof AmadeusSoapError && error.alert) {
    reportError(error, { service: 'amadeus-ws', operation: error.operation, amadeusCode: error.amadeusCode });
  }
};

const soapReply = (result) => {
  const { body } = unwrapEnvelope({ Envelope: { Header: {}, Body: result.body } });
  const key = Object.keys(result.body).find((k) => k !== 'Fault');
  return { reply: result.body[key], raw: body };
};

/**
 * Search flights.
 * @throws {AmadeusSoapError} shaped as {success:false, error, code} for the route
 */
const searchFlights = async (params) => {
  const config = getWsConfig();

  // The clients send free text as well as codes ("New York", "Delhi"), and the
  // WSAP has no location-search operation, so resolution happens locally.
  const from = resolveToIata(params.from ?? params.originLocationCode);
  const to = resolveToIata(params.to ?? params.destinationLocationCode);
  if (!from || !to) {
    throw new AmadeusSoapError({
      error: `Unknown airport or city: ${!from ? params.from : params.to}`,
      code: 400,
      operation: 'Fare_MasterPricerTravelBoardSearch',
    });
  }

  const request = {
    from,
    to,
    fromIsCity: isCityCode(from),
    toIsCity: isCityCode(to),
    departDate: params.departDate ?? params.departureDate,
    returnDate: params.returnDate || undefined,
    adults: Number(params.adults ?? params.travelers ?? 1) || 1,
    children: Number(params.children ?? 0) || 0,
    infants: Number(params.infants ?? 0) || 0,
    travelClass: params.travelClass,
    nonStop: params.nonStop === true || params.nonStop === 'true',
    includedAirlineCodes: params.includedAirlineCodes,
    excludedAirlineCodes: params.excludedAirlineCodes,
    max: Number(params.max ?? 50) || 50,
    currency: config.currency,
  };

  let result;
  try {
    result = await callStateless('Fare_MasterPricerTravelBoardSearch', buildMasterPricerBody(request));
  } catch (error) {
    reportIfAlerting(error);
    throw error;
  }

  const { reply } = soapReply(result);
  const status = inspectReply(reply, 'Fare_MasterPricerTravelBoardSearch');

  // "No itinerary found" is a successful search with no results. Both clients
  // depend on that staying success:true with an empty array.
  if (status.empty) {
    return { success: true, data: [], meta: { count: 0, source: 'GDS', searchParams: request }, dictionaries: {} };
  }
  if (status.error) {
    reportIfAlerting(status.error);
    throw status.error;
  }

  const { offers, dictionaries, currency } = mapMasterPricerReply(reply, {
    config,
    searchSignature: signatureOf(request),
  });

  return {
    success: true,
    data: offers,
    meta: {
      count: offers.length,
      resultCount: offers.length,
      totalResults: offers.length,
      currency,
      source: 'GDS',
      searchParams: request,
    },
    dictionaries,
  };
};

/** Airport/city autocomplete. Never throws - the route soft-fails on error. */
const searchLocations = (keyword, subType = 'CITY,AIRPORT', options = {}) => {
  try {
    return searchAirports(keyword, subType, options);
  } catch (error) {
    log.warn({ err: error.message }, 'airport lookup failed');
    return { success: false, error: 'Airport lookup unavailable', data: [] };
  }
};

/**
 * Operations this WSAP is not entitled to.
 *
 * Returning a soft-fail rather than throwing matches what the routes already do
 * for these endpoints, so the UI degrades silently instead of erroring. The
 * `reason` makes the cause visible in a network trace rather than looking like
 * an empty result. Entitlements are a kickoff question; if granted, these
 * become real implementations without touching the routes.
 */
const notEntitled = (what) => ({ success: false, data: [], reason: 'not_available', error: `${what} is not available on this account` });

const getSeatMaps = async () => notEntitled('Seat map');
const getBrandedFareUpsell = async () => notEntitled('Branded fare upsell');
const getFlightAvailabilities = async () => notEntitled('Availability search');
const getFlightInspirations = async () => notEntitled('Flight inspiration');
const getFlightPriceAnalysis = async () => notEntitled('Price analysis');
const getMostBookedDestinations = async () => ({ ...notEntitled('Travel analytics'), fallback: true });
const getMostTraveledDestinations = getMostBookedDestinations;
const getBusiestTravelPeriod = getMostBookedDestinations;

/** Phase 2+ - declared here so the facade is complete and the routes can bind. */
const notYetImplemented = (name) => async () => {
  throw new AmadeusSoapError({
    error: 'This feature is being migrated and is temporarily unavailable',
    code: 503,
    technicalError: `${name} is not implemented on the SOAP provider yet`,
    operation: name,
  });
};

export default {
  searchFlights,
  searchLocations,

  // Not entitled on this WSAP - soft-fail, matching the routes' existing shape.
  getSeatMaps,
  getBrandedFareUpsell,
  getFlightAvailabilities,
  getFlightInspirations,
  getFlightPriceAnalysis,
  getMostBookedDestinations,
  getMostTraveledDestinations,
  getBusiestTravelPeriod,

  // Phase 2: pricing, fare rules, calendar.
  priceFlightOffer: notYetImplemented('Fare_InformativePricingWithoutPNR'),
  getFareRules: notYetImplemented('Fare_CheckRules'),
  getCheapestFlightDates: async () => ({ success: false, data: [], reason: 'not_available' }),
  getCalendarPrices: async () => ({ success: false, prices: {}, reason: 'not_available' }),

  // Phase 3: the booking chain. Phase 4: cancel/retrieve/status.
  createFlightOrder: notYetImplemented('Air_SellFromRecommendation'),
  getFlightOrderDetails: notYetImplemented('PNR_Retrieve'),
  cancelFlightOrder: notYetImplemented('PNR_Cancel'),
  getFlightStatus: async () => ({ success: false, data: [], reason: 'not_available' }),
};

export { searchFlights, searchLocations };
