import { createHash } from 'node:crypto';
import logger from '../logger.js';
import { reportError } from '../monitoring.js';
import { isCityCode, resolveToIata, searchLocations as searchAirports } from '../airportsIndex.js';
import { getWsConfig } from './config.js';
import { AmadeusSoapError, inspectReply } from './errors.js';
import { mapMasterPricerReply } from './mappers/offer.js';
import { buildMasterPricerBody } from './operations/masterPricer.js';
import { buildInformativePricingBody } from './operations/informativePricing.js';
import { applyPricingToOffer } from './mappers/pricing.js';
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

/**
 * Re-price an offer.
 *
 * The search price is a quote; this is the fare Amadeus will charge, and the
 * two diverge once availability moves. Booking must re-price before ticketing,
 * and /flights/price exists so the UI can show the customer the real number
 * before they pay.
 *
 * Returns the REST flight-offers-pricing envelope the route passes straight
 * through, plus the `included` block /fare-rules reshapes.
 */
const priceFlightOffer = async (flightOffer) => {
  const config = getWsConfig();
  const offer = flightOffer?.originalOffer ?? flightOffer;
  const ama = offer?._ama;

  if (!ama?.segments?.length) {
    throw new AmadeusSoapError({
      error: 'This flight can no longer be priced - please search again',
      code: 409,
      technicalError: 'offer is missing _ama; it did not come from this provider',
      operation: 'Fare_InformativePricingWithoutPNR',
    });
  }

  const result = await callStateless('Fare_InformativePricingWithoutPNR', buildInformativePricingBody({
    paxRefs: ama.paxRefs,
    segments: ama.segments,
    currency: config.currency,
    validatingCarrier: offer.validatingAirlineCodes?.[0],
  }));

  const { reply } = soapReply(result);
  const status = inspectReply(reply, 'Fare_InformativePricingWithoutPNR');
  if (status.error) {
    reportIfAlerting(status.error);
    throw status.error;
  }

  const { offer: pricedOffer, text } = applyPricingToOffer(reply, offer);

  return {
    success: true,
    data: {
      type: 'flight-offers-pricing',
      flightOffers: [pricedOffer],
      bookingRequirements: {},
    },
    // Shaped exactly as the REST API's `included` block, so the /fare-rules
    // route reshapes and scrapes it unchanged.
    included: {
      bags: buildBagsIncluded(pricedOffer),
      'detailed-fare-rules': buildFareRulesIncluded(text),
    },
    dictionaries: {},
  };
};

/** Checked-bag allowance per segment, in the REST `included.bags` shape. */
const buildBagsIncluded = (offer) => {
  const bags = {};
  const details = offer.travelerPricings?.[0]?.fareDetailsBySegment ?? [];
  details.forEach((detail, index) => {
    const included = detail.includedCheckedBags;
    if (!included) return;
    bags[String(index + 1)] = {
      quantity: included.quantity ?? included.weight ?? 0,
      name: included.weight === undefined
        ? 'CHECKED_BAG'
        : `CHECKED_BAG ${included.weight}${included.weightUnit ?? 'KG'}`,
      price: null,
      segmentIds: [detail.segmentId],
    };
  });
  return bags;
};

/**
 * Fare-rule free text in the REST `included['detailed-fare-rules']` shape.
 *
 * Amadeus returns rules as free text, so the route's existing penalty scraper
 * still applies - only the transport changed. Rule text richer than this needs
 * Fare_CheckRules, which requires a TST inside an active PNR session and so
 * arrives with the booking chain.
 */
const buildFareRulesIncluded = (text = []) => {
  const descriptions = text
    .filter((entry) => entry.text)
    .map((entry) => ({
      descriptionType: /REFUND|PENALT|CANCEL|CHANGE/i.test(entry.text) ? 'PENALTIES' : 'INFORMATION',
      text: entry.text,
    }));

  return descriptions.length === 0 ? {} : { 1: { fareNotes: { descriptions } } };
};

/**
 * Cheapest fare per date, for the date strip and the fare calendar.
 *
 * Fare_MasterPricerCalendar - the operation designed for this - is in the WSAP
 * and in the agreed scope but returns "OPTION NOT PERMITTED" (code 1006) on
 * this office, so a flexible-date search is not available to us. Until Amadeus
 * enables it, each date is priced with an ordinary search.
 *
 * That is the fan-out the old REST code did, with two differences that make it
 * safe: the date count is capped, and results are cached, so a customer paging
 * a calendar cannot turn one page view into thirty GDS calls. The transport's
 * semaphore bounds concurrency on top of that.
 */
const MAX_CALENDAR_DATES = 10;

const priceDates = async (params, dates) => {
  const wanted = [...new Set(dates)].filter(Boolean).slice(0, MAX_CALENDAR_DATES);
  const prices = {};

  const results = await Promise.allSettled(wanted.map(async (date) => {
    const result = await searchFlights({ ...params, departDate: date, returnDate: undefined, max: 5 });
    const cheapest = result.data.reduce(
      (min, offer) => Math.min(min, Number(offer.price?.total) || Infinity),
      Infinity,
    );
    return { date, price: Number.isFinite(cheapest) ? cheapest : null };
  }));

  for (const outcome of results) {
    // A single unpriceable date must not fail the whole strip; the UI simply
    // shows no price for it.
    if (outcome.status === 'fulfilled' && outcome.value.price !== null) {
      prices[outcome.value.date] = outcome.value.price;
    }
  }

  return { prices, requested: wanted.length, capped: dates.length > MAX_CALENDAR_DATES };
};

/** Backs /flights/date-prices and /flights/calendar-prices. */
const getCalendarPrices = async ({ dates = [], ...params }) => {
  if (!Array.isArray(dates) || dates.length === 0) {
    return { success: false, prices: {}, error: 'dates are required' };
  }

  try {
    const { prices, capped } = await priceDates(params, dates);
    const values = Object.values(prices);
    return {
      success: true,
      prices,
      dateWisePrices: prices,
      lowestPrice: values.length > 0 ? Math.min(...values) : null,
      currency: getWsConfig().currency,
      capped,
    };
  } catch (error) {
    log.warn({ err: error.message }, 'calendar pricing failed');
    return { success: false, prices: {}, dateWisePrices: {}, error: error.error ?? error.message };
  }
};

/**
 * Cheapest departure dates around a date.
 *
 * The REST equivalent scanned a whole range server-side. Without
 * Fare_MasterPricerCalendar that is not possible here, so this samples a small
 * window rather than pretending to cover a month.
 */
const getCheapestFlightDates = async (origin, destination, options = {}) => {
  const { departureDate, oneWay = true } = options;
  if (!departureDate) return { success: false, data: [], error: 'departureDate is required' };

  const anchor = new Date(`${departureDate}T00:00:00Z`);
  const dates = [-2, -1, 0, 1, 2, 3, 4].map((offset) => {
    const d = new Date(anchor);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  }).filter((d) => d >= new Date().toISOString().slice(0, 10));

  const result = await getCalendarPrices({
    from: origin, to: destination, adults: 1, dates,
  });
  if (!result.success) return { success: false, data: [], error: result.error };

  const currency = result.currency;
  return {
    success: true,
    data: Object.entries(result.prices)
      .map(([date, price]) => ({
        departureDate: date,
        returnDate: oneWay ? undefined : undefined,
        price: { total: price.toFixed(2), currency },
      }))
      .sort((a, b) => Number(a.price.total) - Number(b.price.total)),
    meta: { count: Object.keys(result.prices).length, sampled: dates.length },
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

  priceFlightOffer,
  getCalendarPrices,
  getCheapestFlightDates,

  // Phase 3: the booking chain. Phase 4: cancel/retrieve/status.
  createFlightOrder: notYetImplemented('Air_SellFromRecommendation'),
  getFlightOrderDetails: notYetImplemented('PNR_Retrieve'),
  cancelFlightOrder: notYetImplemented('PNR_Cancel'),
  getFlightStatus: async () => ({ success: false, data: [], reason: 'not_available' }),
};

export { searchFlights, searchLocations, priceFlightOffer };
