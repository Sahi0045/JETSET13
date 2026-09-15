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
