/**
 * Airlines this office cannot issue tickets for.
 *
 * An office tickets only for the carriers Amadeus has authorised on it, and PDT
 * carries the same authorisations as production. On PDT, 15 Sep 2026, every
 * airline on office SCK1S2400's list was booked end to end, and
 * DocIssuance_IssueTicket refused these at issuance:
 *
 *   AI  2161 PROHIBITED TICKETING CARRIER
 *   GF  8100 ETKT THIS CARRIER NOT VALID THIS MARKET
 *   AW  ETKT: INVALID AIRLINE DESIGNATOR/VENDOR SUPPLIER
 *   BF CY EN HF JX KC KU LG NT SQ SS  ETKT: NOT AUTHORISED
 *
 * Carriers that are not on the office's list were tested the same evening:
 *
 *   CX EK QF UL  2161 PROHIBITED TICKETING CARRIER
 *   VN           ETKT: NOT AUTHORISED
 *
 * Being off the list is not always fatal: TK, TG, WY and VS ticketed. So the
 * list here is the carriers that were actually refused, not every carrier
 * missing from the office's list.
 *
 * Search offered them anyway, so a customer could pay for a fare we would book
 * and then fail to ticket - a refund, or a held booking for staff. A fare plated
 * on one of them is left out of search, and refused at pricing and at booking
 * for an offer found before the list applied.
 *
 * Not here: CZ (COMMUNICATIONS LINE UNAVAILABLE), and BI and CG (the airline
 * record locator never arrived). Those are link and timing failures rather than
 * a refusal of authority, and may be PDT only.
 *
 * AMADEUS_WS_UNTICKETABLE_CARRIERS replaces the list (codes separated by commas
 * or spaces). Set it empty to offer every carrier again - for example once
 * Amadeus adds AI and GF to the office.
 */
export const DEFAULT_UNTICKETABLE_CARRIERS = Object.freeze([
  'AI', 'GF', 'AW', 'BF', 'CY', 'EN', 'HF', 'JX', 'KC', 'KU', 'LG', 'NT', 'SQ', 'SS',
  'CX', 'EK', 'QF', 'UL', 'VN',
]);

/** Two-character airline codes from free text; anything else is ignored. */
export const parseCarrierList = (value) => String(value ?? '')
  .split(/[\s,]+/)
  .map((code) => code.trim().toUpperCase())
  .filter((code) => /^[A-Z0-9]{2}$/.test(code));

/** The carrier whose ticket it is: the plating (validating) carrier. */
export const ticketingCarrierOf = (offer) => offer?.validatingAirlineCodes?.[0]
  ?? offer?._ama?.segments?.[0]?.marketingCarrier
  ?? null;

/** Whether this office would be refused the ticket for this offer. */
export const cannotTicket = (offer, unticketable = []) => {
  const carrier = ticketingCarrierOf(offer);
  return Boolean(carrier) && unticketable.includes(carrier);
};

/**
 * Every airline that MARKETS a segment of this offer.
 *
 * The marketing carrier is the one whose code is on the flight number, which is
 * what the ticket has to cover. The OPERATING carrier can differ on a codeshare
 * - LH1234 operated by LX - and that is not an interline ticket at all, so it
 * is deliberately not read here.
 */
export const marketingCarriersOf = (offer) => {
  const fromOffer = (offer?.itineraries ?? [])
    .flatMap((itinerary) => itinerary?.segments ?? [])
    .map((segment) => segment?.carrierCode);
  const fromAma = (offer?._ama?.segments ?? []).map((segment) => segment?.marketingCarrier);
  return [...new Set([...fromOffer, ...fromAma].filter(Boolean))];
};

/**
 * An itinerary whose ticket is issued on one airline's stock while another
 * airline markets one of its flights. Ticketing that needs an interline
 * agreement between the two, and the office has to hold it.
 */
export const isInterline = (offer) => {
  const plating = ticketingCarrierOf(offer);
  if (!plating) return false;
  return marketingCarriersOf(offer).some((carrier) => carrier !== plating);
};

/**
 * The plating-to-marketing pairs an offer needs, as `B6-LH`.
 *
 * Used to name the exact relationship in a refusal and in the log, so a pair
 * that turns out to be fine can be allowed by name.
 */
export const interlinePairsOf = (offer) => {
  const plating = ticketingCarrierOf(offer);
  if (!plating) return [];
  return marketingCarriersOf(offer)
    .filter((carrier) => carrier !== plating)
    .map((carrier) => `${plating}-${carrier}`);
};

/** Pairs from free text: `B6-LH, DL-UA`. Anything else is ignored. */
export const parsePairList = (value) => String(value ?? '')
  .split(/[\s,]+/)
  .map((pair) => pair.trim().toUpperCase())
  .filter((pair) => /^[A-Z0-9]{2}-[A-Z0-9]{2}$/.test(pair));

/**
 * Plating relationships that have been seen to fail at issuance.
 *
 * Proven on PDT, 16 Sep 2026, through the browser and then reproduced: a
 * JetBlue-plated Frankfurt-JFK itinerary (B6 stock, LH900 + B63920) sold
 * cleanly, priced cleanly at 385.43, the card was charged 390.28 and the PNR
 * committed - and only then did issuance answer `8102 ETKT RJT - NO INTERLINE
 * BETWEEN CARRIERS B6-LH`.
 *
 * There is no earlier signal. Air_SellFromRecommendation answered OK on both
 * segments and Fare_PricePNRWithBookingClass returned the quoted fare, so the
 * pre-payment seat and fare check passed; DocIssuance_IssueTicket needs a
 * committed PNR, so the question cannot be asked before the money moves. A pair
 * can therefore only be learned the hard way - from an 8102 - and then kept out
 * of search so it costs one customer rather than every customer.
 */
export const DEFAULT_NO_INTERLINE_PAIRS = Object.freeze(['B6-LH']);

/**
 * Should this offer be kept out of search?
 *
 * Deliberately NOT "every interline itinerary". Plating another airline's
 * flight is a normal and often necessary arrangement - Hahn Air (HR) and APG
 * (GP) exist to do nothing else, and on an India search they carry 12 of 50
 * offers, all of them SpiceJet flights on HR or GP stock. Refusing all of them
 * would cost about a quarter of that result set to prevent a failure measured
 * at roughly one offer in sixty. The first version of this guard did exactly
 * that, and the search-route test caught it.
 *
 * So the default is to block only what has actually been refused, by pair. That
 * leaves the first customer on any NEW bad pair still exposed - and that case
 * is handled properly rather than silently: the chain flags the booking for
 * review with the Amadeus text, does not auto-refund a reservation the airline
 * is holding, and a human decides.
 *
 * `blockAll` is the stricter setting for anyone who would rather lose the
 * inventory than risk it. Both it and the pair list are environment-driven,
 * because this may be an artefact of the PDT office's interline table and a
 * production office may hold agreements this one does not.
 */
export const interlineNotAllowed = (offer, { blockAll = false, blocked = [] } = {}) => {
  if (!isInterline(offer)) return false;
  if (blockAll) return true;
  return interlinePairsOf(offer).some((pair) => blocked.includes(pair));
};
