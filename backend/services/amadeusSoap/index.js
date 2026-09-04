import { createHash } from 'node:crypto';
import logger from '../logger.js';
import { reportError } from '../monitoring.js';
import { isCityCode, resolveToIata, searchLocations as searchAirports } from '../airportsIndex.js';
import { getWsConfig } from './config.js';
import { AmadeusSoapError, inspectReply } from './errors.js';
import { mapMasterPricerReply } from './mappers/offer.js';
import { buildMasterPricerBody } from './operations/masterPricer.js';
import { buildInformativePricingBody } from './operations/informativePricing.js';
import { buildFlightInfoBody, readFlightInfoError, readFlightInfoReply } from './operations/flightInfo.js';
import { applyPricingToOffer } from './mappers/pricing.js';
import { cancelBooking, retrieveBooking, runBookingChain } from './bookingChain.js';
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
    reportError(error, {
      service: 'amadeus-ws',
      // Which WSAP produced it. Without this a PDT fault and a production fault
      // are indistinguishable in triage, and after cutover both exist at once.
      wsap: safeWsap(),
      operation: error.operation,
      amadeusCode: error.amadeusCode,
    });
  }
};

/** The configured WSAP, or null - reading config must never break reporting. */
const safeWsap = () => {
  try { return getWsConfig().wsap ?? null; } catch { return null; }
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

/**
 * Choose which dates to price when the caller asks for more than the cap.
 *
 * Taking the first N silently blanked the rest of the month: the fare calendar
 * posts all 31 days, so days 11-31 came back with no price at all while the
 * first ten looked fine. Spreading the sample evenly across the requested range
 * gives every part of the month a price, and the UI can interpolate between
 * them - which is what the other calendar component already does client-side.
 *
 * Past dates are dropped first: they cannot be priced, and spending cap slots
 * on them costs a live GDS call each.
 */
const sampleDates = (dates, cap = MAX_CALENDAR_DATES) => {
  const today = new Date().toISOString().slice(0, 10);
  const usable = [...new Set(dates)].filter((d) => d && d >= today).sort();
  if (usable.length <= cap) return usable;

  const step = (usable.length - 1) / (cap - 1);
  const picked = new Set();
  for (let i = 0; i < cap; i += 1) picked.add(usable[Math.round(i * step)]);
  return [...picked];
};

const priceDates = async (params, dates) => {
  const wanted = sampleDates(dates);
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

  return { prices, requested: wanted.length, capped: wanted.length < [...new Set(dates)].filter(Boolean).length };
};

/** Backs /flights/date-prices and /flights/calendar-prices. */
const getCalendarPrices = async ({ dates = [], ...params }) => {
  if (!Array.isArray(dates) || dates.length === 0) {
    return { success: false, prices: {}, error: 'dates are required' };
  }

  try {
    const { prices, capped, requested } = await priceDates(params, dates);
    const values = Object.values(prices);

    // Nothing priced is not a result worth keeping. Each date is priced under
    // Promise.allSettled, so a total WSAP outage looks like "every date came
    // back empty" rather than an error - and `withCache` stores any non-null
    // value, which pinned the empty strip in Redis for TTL.FLIGHT_CALENDAR
    // (6 hours) and served it to every visitor until it expired. Returning
    // null tells withCache there is nothing to store.
    if (values.length === 0 && requested > 0) return null;

    return {
      success: true,
      prices,
      dateWisePrices: prices,
      lowestPrice: values.length > 0 ? Math.min(...values) : null,
      currency: getWsConfig().currency,
      capped,
    };
  } catch (error) {
    // Rethrow rather than returning a falsy-but-truthy object. The routes wrap
    // this in `withCache`, which caches any non-null value - so returning
    // `{success:false}` here pinned one transient WSAP failure into the cache
    // for TTL.FLIGHT_CALENDAR (6 hours) and every visitor got the empty strip
    // until it expired. Throwing lets the route answer honestly and leaves the
    // cache empty for the next attempt.
    log.warn({ err: error.message }, 'calendar pricing failed');
    throw error;
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
  const { departureDate } = options;
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
      // No returnDate: this samples departure dates only. A round-trip
      // calendar needs Fare_MasterPricerCalendar, which this WSAP bars (1006).
      .map(([date, price]) => ({
        departureDate: date,
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
 * Create a flight order - the booking chain.
 *
 * Takes the REST-shaped order payload the route already builds, so nothing in
 * the request contract changes. `options` carries what the GDS chain needs and
 * REST never had: the reference the payment was captured under, the fare the
 * customer was quoted, and a callback that persists the PNR the moment it
 * exists rather than at the end of the chain.
 *
 * @throws {BookingChainError} carrying `committed`, which decides whether the
 *   caller may refund: before the PNR is committed a refund is the honest
 *   outcome, after it a refund would leave the customer holding a booking they
 *   are no longer paying for.
 */
const createFlightOrder = async (orderData, options = {}) => {
  const payload = orderData?.data ?? orderData ?? {};
  const offer = payload.flightOffers?.[0];

  // The chain re-checks this, but failing here keeps a malformed request from
  // reaching a mutating call at all.
  if (!offer) {
    throw new AmadeusSoapError({ error: 'A flight offer is required to book', code: 400, operation: 'createFlightOrder' });
  }

  const travelers = (payload.travelers ?? []).map((traveler) => ({
    id: traveler.id,
    firstName: traveler.name?.firstName ?? traveler.firstName,
    lastName: traveler.name?.lastName ?? traveler.lastName,
    gender: traveler.gender,
    dateOfBirth: traveler.dateOfBirth,
  }));

  const contactSource = payload.contacts?.[0] ?? payload.travelers?.[0]?.contact ?? {};
  const phone = contactSource.phones?.[0];
  const contact = {
    email: contactSource.emailAddress ?? contactSource.email,
    phone: phone ? `${phone.countryCallingCode ?? ''}${phone.number ?? ''}`.trim() : undefined,
  };

  const result = await runBookingChain({
    offer,
    travelers,
    contact,
    bookingReference: options.bookingReference,
    // The FARE the customer was quoted - not what they were charged, which
    // includes an admin service fee Amadeus knows nothing about.
    expectedTotal: options.expectedTotal ?? Number(offer.price?.total) ?? undefined,
    onCommitted: options.onCommitted,
  });

  return {
    success: true,
    data: result.order,
    pnr: result.pnr,
    orderId: result.pnr,
    // Read by the route's tripwire, which refunds anything containing "MOCK".
    // These two values are the only modes this provider can ever return.
    mode: result.ticketed ? 'LIVE_GDS_BOOKING' : 'LIVE_GDS_BOOKING_UNTICKETED',
    ticketed: result.ticketed,
    tickets: result.tickets,
    gds: {
      wsap: getWsConfig().wsap,
      officeId: getWsConfig().officeId,
      sessionId: result.sessionId,
      ticketed: result.ticketed,
      queued: result.queued,
      tst_refs: result.tstRefs,
      last_ticketing_date: result.lastTicketingDate,
      priced_total: result.priced.total,
      priced_currency: result.priced.currency,
    },
    message: result.ticketed
      ? 'Flight booked and ticketed'
      : 'Flight booked; ticket issuance is pending',
  };
};

/** Read a booking back by record locator. */
const getFlightOrderDetails = async (recordLocator) => {
  const order = await retrieveBooking(recordLocator);
  return { success: true, data: order, pnr: order.id };
};

/**
 * Cancel a booking.
 *
 * Signature kept as-is: operations.handlers.js:99 calls this positionally as
 * part of the shared cancel orchestrator, which also handles the ARC refund.
 */
const cancelFlightOrder = async (recordLocator) => {
  const result = await cancelBooking(recordLocator);
  return {
    success: true,
    hadTickets: result.hadTickets,
    voided: result.voided,
    // Ticket numbers that outlived their same-day void window. The customer is
    // still refunded, but that value sits with the airline and has to be
    // reclaimed under its fare rules - it is not settled by cancelling.
    requiresAirlineRefund: result.requiresAirlineRefund ?? [],
    message: result.voided
      ? 'Booking cancelled and tickets voided'
      : (result.hadTickets
        ? 'Booking cancelled; ticket refund follows the airline fare rules'
        : 'Booking cancelled'),
  };
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

/**
 * Schedule for one flight on one date.
 *
 * Advisory: the date strip and status widget show nothing rather than erroring
 * if this fails, which is the disposition the route already expects.
 */
const getFlightStatus = async (carrier, flightNumber, date) => {
  try {
    const result = await callStateless(
      'Air_FlightInfo',
      buildFlightInfoBody({ carrier, flightNumber, date }),
    );
    const { reply } = soapReply(result);

    // "Not scheduled that day" arrives as a responseError, not a fault. An
    // empty answer is the correct one - the flight does not exist on that date.
    const failure = readFlightInfoError(reply);
    if (failure) {
      log.info({ carrier, flightNumber, date, code: failure.code }, 'no schedule for this flight');
      return { success: true, data: [], meta: { count: 0, reason: failure.text || 'not scheduled' } };
    }

    const legs = readFlightInfoReply(reply);
    return { success: true, data: legs, meta: { count: legs.length } };
  } catch (error) {
    log.warn({ carrier, flightNumber, date, err: error.technicalError ?? error.message }, 'flight status lookup failed');
    return { success: false, data: [], error: 'Flight status is unavailable' };
  }
};

const getSeatMaps = async () => notEntitled('Seat map');
const getBrandedFareUpsell = async () => notEntitled('Branded fare upsell');
const getFlightAvailabilities = async () => notEntitled('Availability search');
const getFlightInspirations = async () => notEntitled('Flight inspiration');
const getFlightPriceAnalysis = async () => notEntitled('Price analysis');
const getMostBookedDestinations = async () => ({ ...notEntitled('Travel analytics'), fallback: true });
const getMostTraveledDestinations = getMostBookedDestinations;
const getBusiestTravelPeriod = getMostBookedDestinations;

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

  createFlightOrder,
  getFlightOrderDetails,
  cancelFlightOrder,
  getFlightStatus,
};

export { searchFlights, searchLocations, priceFlightOffer };
