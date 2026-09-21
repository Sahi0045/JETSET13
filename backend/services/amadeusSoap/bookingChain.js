import logger from '../logger.js';
import { getWsConfig } from './config.js';
import { AmadeusSoapError, inspectReply } from './errors.js';
import { buildFlightOrder, isTicketed, readRecordLocator, readTickets } from './mappers/flightOrder.js';
import { toDDMMYY } from './mappers/datetime.js';
import { arr, atTxt } from './parseXml.js';
import { buildAirSellBody, readAirSellReply } from './operations/airSell.js';
import { buildAddElementsBody, buildCancelBody, buildCommitBody, buildIgnoreBody, buildRetrieveBody } from './operations/pnr.js';
import {
  buildCreateTstBody,
  buildFopBody,
  buildIssueTicketBody,
  buildPricePnrBody,
  buildQueuePlaceBody,
  buildVoidTicketBody,
  readVoidTicketReply,
  readCreateTstReply,
  readIssueTicketReply,
  readPricePnrReply,
} from './operations/ticketing.js';
import { callStateless, withSession } from './session.js';
import {
  cannotTicket, interlineNotAllowed, interlinePairsOf, ticketingCarrierOf,
} from './ticketingCarriers.js';

const log = logger.child({ svc: 'amadeus-ws', flow: 'booking' });

const sleep = (ms) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

/**
 * The booking chain: one HTTP request, one Amadeus session, ten calls - and new
 * sessions for issuance when the airline's record locator arrives after commit
 * (issueInFreshSessions).
 *
 * The customer has already paid by the time this runs - ARC Pay's hosted
 * checkout completes before POST /order - so every failure mode here is a
 * question of what to do with money that has already moved. That makes one
 * moment matter more than all the others: PNR_AddMultiElements with optionCode
 * 11 ("end and retrieve"). Before it, nothing is saved in the airline's system
 * and signing out discards the work; after it, a booking exists whether or not
 * the rest of the chain succeeds.
 *
 *   steps 1-5 fail  -> nothing was created -> refund, tell the customer honestly
 *   step 6 onwards  -> a PNR exists        -> never silently refund; reconcile
 *
 * The PNR is therefore handed to the caller the instant step 6 returns, before
 * queueing or ticketing is attempted. A crash after that point leaves a booking
 * that can be found; a crash before it leaves nothing to find.
 */

/** Where the chain got to. `committed` is the line between the two failure modes. */
export class BookingChainError extends Error {
  constructor({ step, pnr = null, committed = false, ticketed = false, cause, error, code = 502, technicalError }) {
    super(error ?? cause?.message ?? `Booking failed at ${step}`);
    this.name = 'BookingChainError';
    this.step = step;
    this.pnr = pnr;
    this.committed = committed;
    this.ticketed = ticketed;
    this.error = error ?? cause?.error ?? 'We could not complete your booking';
    this.code = code;
    this.technicalError = technicalError ?? cause?.technicalError ?? cause?.message ?? null;
    // Carried up from the underlying AmadeusSoapError so the route can record
    // which call failed and what Amadeus said about it. Without these a
    // refunded booking leaves only the customer-facing wording behind, which
    // names neither the operation nor the code.
    this.operation = cause?.operation ?? null;
    this.amadeusCode = cause?.amadeusCode ?? null;
    this.cause = cause;
  }
}

/** Pull the operation reply out of a parsed SOAP body. */
const replyOf = (result) => {
  const key = Object.keys(result.body ?? {}).find((k) => k !== 'Fault');
  return key ? result.body[key] : {};
};

/**
 * One value from each air segment of a PNR reply (an itineraryInfo whose
 * segmentName is AIR), '' where the segment does not carry it.
 */
const airSegmentValues = (pnrReply, path) => {
  const found = [];
  const visit = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 8) return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'itineraryInfo') {
        for (const item of arr(value)) {
          if (atTxt(item, 'elementManagementItinerary.segmentName') === 'AIR') {
            found.push(atTxt(item, path));
          }
        }
      } else if (typeof value === 'object') {
        visit(value, depth + 1);
      }
    }
  };
  visit(pnrReply);
  return found;
};

/** The airline's own record locator on each air segment, '' until it sends one. */
const airSegmentLocators = (pnrReply) => airSegmentValues(pnrReply, 'itineraryReservationInfo.reservation.controlNumber');

/**
 * Is any air segment still without the airline's own record locator?
 *
 * Both call sites used to ask `locators.some((l) => !l)` directly, and
 * `[].some(...)` is false - so a reply carrying no segment this reader
 * recognises (an unexpected shape, a reshaped schema) was read as "every
 * locator is present" and issuance was attempted at once. Issuing too early is
 * the exact failure the fresh-session mechanism exists for, so the empty case
 * belongs on the cautious side: not knowing is not the same as knowing they
 * have arrived.
 */
const anyLocatorMissing = (pnrReply) => {
  const locators = airSegmentLocators(pnrReply);
  return locators.length === 0 || locators.some((locator) => !locator);
};

/** Each air segment's status: HK, or TK when the airline has changed it. */
const airSegmentStatuses = (pnrReply) => airSegmentValues(pnrReply, 'relatedProduct.status');

/**
 * A segment the airline changed and still confirms (TK). Accepted with change
 * advice, then ticketed.
 *
 * TL and TN used to be in here as well, and they are not seats: TL is the
 * airline's schedule change landing on a WAITLIST, TN on a request it has not
 * answered. Accepted like TK, they were queued, ticketed and emailed as
 * confirmed - a ticket for a seat the airline had not given the passenger.
 */
const SCHEDULE_CHANGE_STATUSES = new Set(['TK']);

/**
 * Segment statuses at commit that are not a seat.
 *
 * The sell refuses a waitlist before anything is saved (airSell.js: "A
 * waitlist is not a seat"), but the airline can still move a segment between
 * the sell and the end transact. TL/TN (waitlisted/requested after a schedule
 * change), HL/HN/NN/WL (the same without one), and UC, UN, UU, US, NO, HX, UNS
 * (unable, not operating, no action, cancelled) all say the airline is not
 * holding a confirmed seat. Every commit reply captured from this office - 138
 * segments across LH, KU, EN, GF, CZ, BF, EK, KE, LY and MU on PDT, 15-17 Sep
 * 2026 - answered HK, so this never meets a normal booking.
 *
 * The PNR exists by then and the customer has paid, so it is not refunded
 * blind: the chain places it on the office queue, stops before change advice
 * and issuance, and the order route holds it for a person (the `committed`
 * branch).
 */
const NOT_A_SEAT_AT_COMMIT = new Set(['TL', 'TN', 'HL', 'HN', 'NN', 'WL', 'UC', 'UN', 'UU', 'US', 'NO', 'HX', 'UNS']);

/**
 * Issuance the airline refused only because its side is not ready yet. Seen on
 * PDT (15 Sep 2026) right after commit: B6 "9125 ETKT DISALLOWED - NEED AIRLINE
 * R/LOC-RETRY", DL "ETKT: SYSTEM UNABLE TO PROCESS", AA "ETKT: ITEM/DATA NOT
 * FOUND OR DATA NOT EXISTING" - each issued once the airline's locator was on
 * the PNR.
 */
const issuanceNotReady = (cause) => String(cause?.amadeusCode ?? '') === '9125'
  || /NEED AIRLINE R\/?LOC|ETKT: SYSTEM UNABLE TO PROCESS|ETKT: ITEM\/DATA NOT FOUND/i.test(String(cause?.technicalError ?? ''));

/**
 * Today, on the office's calendar - the only date the void window is measured
 * against.
 *
 * Amadeus stamps a ticket with the office's local date, not UTC: on PDT at
 * 00:11 UTC on 16 Sep 2026, a ticket issued minutes earlier read
 * `FA PAX 220-7491175168/ETLH/USD871.73/15SEP26/SCK1S2400`. Against
 * `new Date().toISOString()` that ticket looked like yesterday's, so the void
 * was skipped and the customer was told the airline owed them a refund - every
 * day, for the hours between midnight UTC and midnight in the office.
 *
 * An unusable zone falls back to UTC rather than throwing: a mistyped setting
 * must not stop a cancellation.
 */
const officeToday = (timeZone) => {
  try {
    // en-CA renders YYYY-MM-DD, which is what the ticket's date parses to.
    return new Date().toLocaleDateString('en-CA', { timeZone });
  } catch {
    log.warn({ timeZone }, 'unusable office time zone; measuring the void window against UTC');
    return new Date().toISOString().slice(0, 10);
  }
};

/**
 * A void that failed for now, not for good.
 *
 * 5795 INVALID OR MISSING COUPON/BOOKLET NUMBER answered a void asked for
 * seconds after issuance on PDT (16 Sep 2026): the coupons were not in the
 * e-ticket record yet, and the same void succeeded 15 s later. A timeout is the
 * other one - the airline's ticketing link went quiet rather than refusing
 * (HO, CA, MU, NX on PDT). 5458 NOT AUTHORISED and 5245 NOT SUPPORTED are
 * refusals and are not retried.
 */
const voidFailedForNow = (cause) => String(cause?.amadeusCode ?? '') === '5795'
  || /INVALID OR MISSING COUPON/i.test(String(cause?.technicalError ?? ''))
  || cause?.code === 'ECONNABORTED'
  || /timeout of \d+ms exceeded/i.test(String(cause?.technicalError ?? cause?.message ?? ''));

/**
 * Which tickets a void that failed overall DID void.
 *
 * Ticket_CancelDocument answers once per document, and a two-ticket void can
 * come back voided for one and refused for the other. That was collapsed to
 * one boolean and the error named no ticket, so the desk (needs_review.detail,
 * written from technicalError) could not tell the ticket now void at Amadeus
 * from the one still live - and a cancel on a later day would list the void
 * one as a refund to claim from the airline. The reply's number carries a
 * check digit ours does not, so it is matched as a prefix, as
 * readVoidTicketReply does; a reply without numbers is reported as a count
 * rather than guessed at by position.
 */
const partialVoid = (result, voidable) => {
  const documents = result.documents ?? [];
  const numbered = documents.length > 0 && documents.every((document) => document.number);
  if (!numbered) {
    const count = documents.filter((document) => document.voided).length;
    return {
      voided: null,
      unvoided: null,
      text: count > 0 ? `; ${count} of ${voidable.length} documents answered voided, which ones the reply does not say` : '',
    };
  }
  const isVoided = (ticket) => documents.some((document) => document.voided
    && document.number.startsWith(ticket.number.replace(/\D/g, '')));
  const voided = voidable.filter(isVoided).map((ticket) => ticket.number);
  const unvoided = voidable.filter((ticket) => !isVoided(ticket)).map((ticket) => ticket.number);
  return {
    voided,
    unvoided,
    text: voided.length > 0 ? `; voided ${voided.join(', ')} but not ${unvoided.join(', ')} - the PNR is left live` : '',
  };
};

/** Seats are held per passenger; an infant travels on a lap and holds none. */
const seatCount = (travelers) => travelers.filter((t) => t.ptc !== 'INF' && t.ptc !== 'HELD_INFANT').length;

/**
 * Match the client's travellers to the passenger types the offer was priced for.
 *
 * No client sends a PTC - the web app sends {firstName, lastName, dateOfBirth,
 * gender} and nothing else - but the offer knows, because the search asked for
 * a specific mix of adults and children. Booking a child on an adult fare is a
 * fare the airline can reject at check-in, so the types are carried across here
 * by position, which is the order both sides build their lists in.
 */
const withPassengerTypes = (travelers, offer) => {
  const types = (offer?.travelerPricings ?? []).map((t) => t.travelerType);
  return travelers.map((traveler, index) => ({
    ...traveler,
    ptc: traveler.ptc ?? types[index] ?? 'ADULT',
  }));
};

/**
 * Run one operation and fail loudly.
 *
 * `inspectReply` classifies "no results" as an empty success, which is right
 * for a search and wrong for every call here: there is no such thing as an
 * empty sell. Booking treats it as the failure it is.
 *
 * `refusalOf` reads a reply that answers the question itself before its error
 * containers are classified, and returns the error to throw, or null.
 */
const callStep = async (ctx, { step, operation, bodyXml, pnr, committed, ticketed, refusalOf }) => {
  let result;
  try {
    result = await ctx.call(operation, bodyXml);
  } catch (cause) {
    throw new BookingChainError({ step, pnr, committed, ticketed, cause, code: cause?.code ?? 502 });
  }

  const reply = replyOf(result);
  const refusal = refusalOf?.(reply);
  if (refusal) throw refusal;
  const inspected = inspectReply(reply, operation);
  if (!inspected.ok) {
    throw new BookingChainError({
      step,
      pnr,
      committed,
      ticketed,
      cause: inspected.error,
      error: inspected.error?.error,
      code: inspected.error?.code ?? 502,
      technicalError: inspected.error?.technicalError ?? 'Amadeus returned no usable reply',
    });
  }

  // An element the airline refused that the booking survives without. It does
  // not stop the chain, but it is never silent: a refused FOID used to reach
  // the log as nothing at all, and then as a whole failed booking.
  if (inspected.warnings?.length) {
    for (const warning of inspected.warnings) {
      log.warn({ step, operation, pnr, element: warning.element, amadeusCode: warning.code, reason: warning.text },
        'the airline refused one element; the booking continues without it');
    }
  }

  return reply;
};

/**
 * Read the ticket numbers back after issuance, with retries.
 *
 * Issuance replies with a status only, and the ticket numbers take a moment
 * to land in the PNR. Amadeus's reference flow waits, retrieves, and if the
 * numbers are not there yet waits again and retries a few times before
 * leaving the PNR for manual follow-up. Non-fatal throughout: the tickets
 * exist whether or not we capture their numbers on this request.
 *
 * `expected` is one ticket per traveller, a lap infant included: the
 * 2ADT+1CH+1INF certification booking (BMPUST, PDT 17 Sep 2026) carried four
 * FA elements for its four travellers. The loop used to stop at the first
 * retrieve carrying ANY ticket, so a PNR read while the numbers were still
 * landing locked in a partial set - and a non-empty list raised no flag, so
 * every later reader took two tickets of four as the whole booking.
 */
const readTicketNumbers = async (ctx, { pnr, order, offer, bookingReference, config, expected = 1 }) => {
  let tickets = order.tickets;
  let current = order;
  const wanted = Math.max(1, expected);
  const attempts = Math.max(1, config.ticketRetrieveRetries + 1);
  await sleep(config.ticketRetrieveInitialMs);
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const retrieved = await callStep(ctx, {
        step: 'retrieve',
        operation: 'PNR_Retrieve',
        bodyXml: buildRetrieveBody(pnr),
        pnr,
        committed: true,
        ticketed: true,
      });
      const found = readTickets(retrieved);
      // Keep the most complete set seen, so a later short read cannot lose a
      // number an earlier one had.
      if (found.length > (tickets?.length ?? 0)) {
        tickets = found;
        current = buildFlightOrder(retrieved, { flightOffers: [offer], bookingReference });
        current.tickets = tickets;
      }
      if (found.length >= wanted) break;
    } catch (cause) {
      log.warn({ pnr, attempt, reason: cause?.technicalError ?? cause?.message }, 'reading ticket numbers failed');
    }
    if (attempt < attempts) await sleep(config.ticketRetrieveDelayMs);
  }
  if (!tickets?.length) {
    // Ticket issued but its number has not surfaced yet — flag for manual
    // follow-up rather than silently confirm a booking with no ticket number.
    // With the count, as the partial case below, so the alarm can say how many
    // numbers the desk is looking for.
    current.needsReview = {
      reason: 'ticket_numbers_not_retrieved', expected: wanted, got: 0, at: new Date().toISOString(),
    };
    log.warn({ pnr, attempts }, 'ticket numbers not in PNR after retries; flagged for manual follow-up');
  } else if (tickets.length < wanted) {
    // Some numbers, not all. The same reason as none at all - the e-ticket and
    // the confirmation email already read it as "issued, number pending" - with
    // the count, so the desk knows it is looking for the missing ones.
    current.needsReview = {
      reason: 'ticket_numbers_not_retrieved', expected: wanted, got: tickets.length, at: new Date().toISOString(),
    };
    log.warn({ pnr, attempts, expected: wanted, got: tickets.length }, 'not every traveller\'s ticket number is in the PNR after retries; flagged for manual follow-up');
  }
  return { tickets, order: current };
};

/**
 * Issue in a new session, once the airline's record locator is on the PNR.
 *
 * An airline Amadeus does not host confirms the booking in its own system after
 * commit, and refuses the ticket until its record locator is on the PNR (9125
 * NEED AIRLINE R/LOC). Retrieving again in the session that committed did not
 * show it: Royal Brunei BI423 and BI421 on PDT went 90 and 117 seconds without
 * it. Amadeus (15 Sep 2026): close the session and open a new one with a PNR
 * retrieve. Done that way, BI421's locator was on the PNR 12 seconds after
 * commit, and the ticket issued at once.
 *
 * Each look is its own session: retrieve, then issue when every air segment
 * carries the airline's locator - or when the wait is over, since issuance is
 * tried regardless. A ticket already on the PNR is read, never issued again.
 * Refusals because the airline is not ready are retried the same way, up to
 * the configured number, counting one already met in the booking session.
 *
 * "Already ticketed" means a ticket for every traveller (`expectedTickets`).
 * Finding ANY ticket used to end the loop as ticketed and done, so a PNR seen
 * with one ticket of three - still landing, or issued in part - was recorded
 * complete. It is not issued again either (the traveller who has a ticket would
 * get a second one): it is read again, and flagged if still short.
 */
const issueInFreshSessions = async (booked, {
  offer, bookingReference, config, notReadyRefusals = 0, expectedTickets = 1,
}) => {
  const { pnr } = booked;
  const waitStarted = Date.now();
  let refusals = notReadyRefusals;

  for (;;) {
    // `withSession` takes its semaphore permit itself, outside `callStep`, so a
    // SlotTimeoutError raised here is raw: no `committed`, no `pnr`. Every look
    // in this loop happens AFTER the PNR is committed, and the order route reads
    // `slotTimeout && !committed` as "nothing was sold" - it queues the booking,
    // overwrites the committed marker, and answers 202 for a reservation the
    // airline already holds. Anything that escapes a post-commit session is a
    // post-commit failure, whatever raised it.
    let outcome;
    try {
      outcome = await withSession(async (ctx) => {
      const current = await callStep(ctx, {
        step: 'retrieve', operation: 'PNR_Retrieve', bodyXml: buildRetrieveBody(pnr), pnr, committed: true,
      });

      const existing = readTickets(current);
      if (existing.length >= expectedTickets) {
        const order = buildFlightOrder(current, { flightOffers: [offer], bookingReference });
        order.tickets = existing;
        return { ticketed: true, tickets: existing, order };
      }
      if (existing.length > 0) {
        const partial = buildFlightOrder(current, { flightOffers: [offer], bookingReference });
        partial.tickets = existing;
        return {
          ticketed: true,
          ...(await readTicketNumbers(ctx, {
            pnr, order: partial, offer, bookingReference, config, expected: expectedTickets,
          })),
        };
      }

      const locators = airSegmentLocators(current);
      const waitedMs = Date.now() - waitStarted;
      const locatorMissing = anyLocatorMissing(current);
      if (locatorMissing) {
        if (waitedMs < config.airlineLocatorWaitMs) return { waiting: true };
        log.warn({ pnr, locators, waitedMs }, 'airline record locator not on every segment yet; issuing anyway');
      }

      let issueReply;
      try {
        issueReply = await callStep(ctx, {
          step: 'issueTicket', operation: 'DocIssuance_IssueTicket', bodyXml: buildIssueTicketBody(), pnr, committed: true,
        });
      } catch (cause) {
        if (!issuanceNotReady(cause)) throw cause;
        // The airline is only slow. While its record locator is still missing,
        // keep looking until the hard cap rather than spending the two quick
        // retries on it: La Compagnie's B0100 answered 9125 for the whole 90 s
        // wait on PDT (16 Sep 2026) and ticketed on a later look, once its
        // locator arrived about 45 s after commit.
        if (locatorMissing && waitedMs < config.airlineLocatorMaxWaitMs) {
          log.warn({ pnr, waitedMs, reason: cause?.technicalError }, 'the airline has not sent its record locator yet; looking again in a new session');
          return { waiting: true };
        }
        if (refusals >= config.issueRetries) throw cause;
        refusals += 1;
        log.warn({ pnr, attempt: refusals, reason: cause?.technicalError }, 'the airline is not ready to ticket yet; retrying in a new session');
        return { waiting: true, notReady: true };
      }
      if (!readIssueTicketReply(issueReply).issued) return { ticketed: false };
      return {
        ticketed: true,
        ...(await readTicketNumbers(ctx, {
          pnr, order: booked.order, offer, bookingReference, config, expected: expectedTickets,
        })),
      };
      }, { config });
    } catch (cause) {
      if (cause instanceof BookingChainError) throw cause;
      throw new BookingChainError({
        step: 'issueTicket', pnr, committed: true, ticketed: false, cause, code: cause?.code ?? 502,
      });
    }

    if (!outcome.waiting) {
      log.info({ pnr, ticketed: outcome.ticketed, waitedMs: Date.now() - waitStarted }, 'flight.booking.chain ticketing in a new session finished');
      return {
        ...booked,
        ticketed: outcome.ticketed,
        ...(outcome.ticketed ? { tickets: outcome.tickets, order: outcome.order } : {}),
      };
    }
    await sleep(outcome.notReady ? config.issueRetryDelayMs : config.airlineLocatorPollMs);
  }
};

/**
 * @param {object} p
 * @param {object} p.offer            the priced offer, carrying `_ama`
 * @param {Array}  p.travelers        {firstName, lastName, gender, dateOfBirth}
 * @param {object} p.contact          {email, phone}
 * @param {string} p.bookingReference our reference, filed on the PNR as a remark
 * @param {number} [p.expectedTotal]  the fare total the customer paid for
 * @param {number} [p.paidAmount]     what ARC captured
 * @param {number} [p.verifiedChargeTotal] what checkout verified and charged for this fare
 * @param {Function} [p.onCommitted]  awaited with {pnr, order} the moment a PNR exists
 */
export const runBookingChain = async (p) => {
  const config = getWsConfig();
  const { offer, contact = {}, bookingReference, expectedTotal, paidAmount, verifiedChargeTotal, onCommitted, beforeCommit } = p;

  const ama = offer?._ama;
  if (!ama?.segments?.length) {
    throw new BookingChainError({
      step: 'validate',
      error: 'This fare can no longer be booked - please search again',
      code: 409,
      technicalError: 'offer is missing _ama; it did not come from this provider',
    });
  }

  // A PDT offer must never be sold against a production WSAP, or the reverse:
  // the recommendation refers to inventory in one system only.
  if (ama.wsap && ama.wsap !== config.wsap) {
    throw new BookingChainError({
      step: 'validate',
      error: 'This fare has expired - please search again',
      code: 409,
      technicalError: `offer was found on WSAP ${ama.wsap}, this server is ${config.wsap}`,
    });
  }

  // Before any seat is sold: issuance would refuse this carrier's ticket, and a
  // PNR we cannot ticket only has to be cancelled again (ticketingCarriers.js).
  if (cannotTicket(offer, config.unticketableCarriers)) {
    throw new BookingChainError({
      step: 'validate',
      error: 'This airline cannot be booked with us online - please choose another flight',
      code: 409,
      technicalError: `validating carrier ${ticketingCarrierOf(offer)} is one this office cannot ticket (AMADEUS_WS_UNTICKETABLE_CARRIERS)`,
    });
  }

  // Interline, before any seat is sold. Proven on PDT 16 Sep 2026: a B6-plated
  // itinerary carrying LH900 sold and priced cleanly and was refused only at
  // issuance - 8102 NO INTERLINE BETWEEN CARRIERS B6-LH - with the PNR
  // committed and the card already charged (ticketingCarriers.js).
  if (interlineNotAllowed(offer, config.interline)) {
    throw new BookingChainError({
      step: 'validate',
      error: 'This itinerary cannot be ticketed as one booking - please choose another flight',
      code: 409,
      technicalError: `interline ticketing not confirmed for ${interlinePairsOf(offer).join(', ')} (AMADEUS_WS_INTERLINE_BLOCKED_PAIRS)`,
    });
  }

  // Aged from when the airline last priced the fare, not from the search. The
  // order route prices it again, or stamps checkout's verification: a customer
  // who took twenty minutes to choose and was booked by the abandoned-checkout
  // job half an hour after paying was refunded as "expired" on a fare the
  // airline had confirmed minutes earlier.
  const agedFrom = ama.pricedAt || ama.searchedAt;
  const ageMinutes = agedFrom ? (Date.now() - Date.parse(agedFrom)) / 60000 : 0;
  if (ageMinutes > config.offerMaxAgeMin) {
    throw new BookingChainError({
      step: 'validate',
      error: 'This fare has expired - please search again',
      code: 409,
      technicalError: `offer is ${Math.round(ageMinutes)} minutes old, limit is ${config.offerMaxAgeMin}`,
    });
  }

  const travelers = withPassengerTypes(p.travelers ?? [], offer);
  if (travelers.length === 0) {
    throw new BookingChainError({ step: 'validate', error: 'Passenger details are required', code: 400 });
  }

  // A standard PNR holds at most 9 seat-holding passengers (infants on a lap do
  // not count). 10+ is a group booking — a different flow the airline rejects on
  // this path — so refuse it here, before any GDS call, rather than commit a
  // booking the airline will bounce.
  const seated = seatCount(travelers);
  if (seated > config.maxPassengersPerPnr) {
    throw new BookingChainError({
      step: 'validate',
      error: `A single booking can hold at most ${config.maxPassengersPerPnr} passengers. Please book larger groups separately or contact us.`,
      code: 400,
      technicalError: `${seated} seat-holding passengers exceeds the ${config.maxPassengersPerPnr}-per-PNR limit`,
    });
  }

  const validatingCarrier = offer.validatingAirlineCodes?.[0] ?? ama.segments[0]?.marketingCarrier;
  const started = Date.now();

  const booked = await withSession(async (ctx) => {
    let pnr = null;
    let committed = false;
    let ticketed = false;

    // ---- 1. Sell -----------------------------------------------------------
    // Holds the seats. Never retried: a retried sell is a second booking.
    //
    // UC between search and sell is normal, not exceptional: the fare class
    // sold out in the seconds since the customer chose it. It has to read as
    // a clean "gone", because the refund path is what happens next.
    const sellRefused = (answer, cause) => new BookingChainError({
      step: 'sell',
      cause,
      error: 'That flight is no longer available at this price',
      code: 409,
      technicalError: `segment status ${answer.statuses.join(',') || 'absent'}${cause?.amadeusCode ? ` (${cause.amadeusCode})` : ''}`,
    });
    const sellReply = await callStep(ctx, {
      step: 'sell',
      operation: 'Air_SellFromRecommendation',
      bodyXml: buildAirSellBody({ segments: ama.segments, seats: seatCount(travelers) }),
      // The segment statuses first, as confirmSeats reads them. Every real
      // refusal on disk (16-Book-Unavailable-Class, PDT 17 Sep 2026) is UNS on
      // each segment WITH a message-level 288, and callStep classified the 288
      // first: a 502 "temporarily unavailable" for a class that had simply
      // gone. A reply with no segment status keeps Amadeus's own classification.
      refusalOf: (reply) => {
        const answer = readAirSellReply(reply, { expectedSegments: ama.segments.length });
        if (answer.sold || answer.statuses.length === 0) return null;
        return sellRefused(answer, inspectReply(reply, 'Air_SellFromRecommendation').error ?? undefined);
      },
    });

    const sold = readAirSellReply(sellReply, { expectedSegments: ama.segments.length });
    if (!sold.sold) throw sellRefused(sold);

    // ---- 2. Names and contact elements -------------------------------------
    // toDDMMYY throws on an unparseable date, and this runs after the seats are
    // held - a malformed lastTicketingDate must not strand a sold itinerary.
    let ticketingDate = null;
    try {
      if (offer.lastTicketingDate) ticketingDate = toDDMMYY(offer.lastTicketingDate);
    } catch {
      log.warn({ value: offer.lastTicketingDate }, 'unusable lastTicketingDate; office default applies');
    }
    await callStep(ctx, {
      step: 'addElements',
      operation: 'PNR_AddMultiElements',
      bodyXml: buildAddElementsBody({
        travelers,
        contact,
        bookingReference,
        officeId: config.officeId,
        // Without a last-ticketing date the office default applies, which is
        // safer than inventing one that might already be in the past.
        ticketing: ticketingDate ? { date: ticketingDate, time: '2359' } : null,
        // A US itinerary: DOCS with date of birth and gender, passport or not.
        secureFlight: p.secureFlight === true,
      }),
    });

    // ---- 3. Form of payment ------------------------------------------------
    // Before pricing, on the whole PNR. Amadeus prices OB fees - the fees an
    // airline files for a form of payment in a market - from the FOP already on
    // the PNR, so an FOP added after the TST can leave those fees out of the
    // fare. Amadeus (15 Sep 2026) allows it afterwards only where no OB fees
    // apply and recommends it before pricing, as their reference flow does.
    // No TST exists yet, so nothing to associate: pnrElementAssociation is
    // optional (FOP_CreateFormOfPayment_19_2_1A.xsd) and the FP element then
    // covers every passenger and segment in the PNR.
    await callStep(ctx, {
      step: 'fop',
      operation: 'FOP_CreateFormOfPayment',
      bodyXml: buildFopBody({ fopCode: config.fopCode }),
    });

    // ---- 4. Price the PNR --------------------------------------------------
    // The authoritative fare. The search quote and the informative price were
    // both indications against live availability; this prices what is held.
    const priceReply = await callStep(ctx, {
      step: 'pricePnr',
      operation: 'Fare_PricePNRWithBookingClass',
      bodyXml: buildPricePnrBody({ currency: config.currency, validatingCarrier }),
    });

    const priced = readPricePnrReply(priceReply);
    if (!priced.fares.length) {
      throw new BookingChainError({
        step: 'pricePnr',
        error: 'We could not price this itinerary - please search again',
        code: 409,
        technicalError: 'Fare_PricePNRWithBookingClass returned no fareList',
      });
    }

    // ---- 4b. Fare-change guard --------------------------------------------
    // Compared against the FARE the customer paid for, not against what they
    // were charged: the charged amount includes the admin-configured service
    // fee, which Amadeus knows nothing about. Tolerance is an env var because
    // the acceptable drift is a business decision, and it defaults to zero.
    //
    // In whole cents. The PNR total is a sum of per-passenger amounts and the
    // quote is rounded to cents; compared as floats, about one family booking in
    // four was refused over a difference of 0.00000000000003.
    //
    // And only a RISE is refused. A fare that prices lower than the customer
    // paid for costs nobody anything, and refusing it refunded customers out of
    // a cheaper seat.
    //
    // A total we cannot read, or one in another currency, is refused too: the
    // guard can only pass a fare it cannot compare, and nothing is sold yet.
    if (expectedTotal != null && (priced.total == null || priced.currency !== config.currency)) {
      throw new BookingChainError({
        step: 'priceCheck',
        error: 'We could not confirm the fare with the airline - please search again',
        code: 409,
        technicalError: `no comparable fare total in the pricing reply (total ${priced.total}, currency ${priced.currency}, expected ${expectedTotal} ${config.currency})`,
      });
    }
    if (expectedTotal != null) {
      const riseCents = Math.round(Number(priced.total) * 100) - Math.round(Number(expectedTotal) * 100);
      if (riseCents > Math.round(config.priceTolerance * 100)) {
        throw new BookingChainError({
          step: 'priceCheck',
          error: 'The fare changed while we were booking - please search again',
          code: 409,
          technicalError: `priced ${priced.total} ${priced.currency}, expected ${expectedTotal}`,
        });
      }
    }

    // ---- 4c. Payment-coverage guard ---------------------------------------
    // The fare-drift guard above checks the fare is stable; it does NOT check
    // the customer actually PAID enough to cover it. The ARC charge amount is
    // client-supplied at hosted checkout and never re-validated, so a tampered
    // "$1" charge would otherwise buy this full-price ticket. `paidAmount` is
    // the amount ARC captured, read server-side from the booking row (never
    // from the order request), so this catches the shortfall here — before any
    // seat is sold or ticket issued — and the caller reverses the charge.
    //
    // A ratio, not an exact match: the charge carries the admin service fee
    // (up) and any coupon (down) Amadeus does not see, so `minPaymentRatio`
    // (default 0.8, 0 = disabled) is the floor as a fraction of the priced fare.
    //
    // No payment on record is refused, not waved through. The route reads
    // `paidAmount` from the booking row that hosted checkout creates; if there
    // is no row - a missing or made-up bookingReference on a direct POST to
    // /order - there is no evidence anything was paid, and skipping the check
    // would ticket for free.
    if (config.minPaymentRatio > 0) {
      const paid = paidAmount == null ? NaN : Number(paidAmount);
      if (!Number.isFinite(paid)) {
        throw new BookingChainError({
          step: 'paymentCoverage',
          error: 'We could not confirm your payment covers this fare - please contact support.',
          code: 402,
          technicalError: `no captured payment on record for booking ${bookingReference || '(none)'}`,
        });
      }
    }
    // With a total that checkout verified and charged, the floor is that total:
    // the customer paid exactly what this fare was priced at - with the service
    // fee, less any coupon - and the fare guard above has already refused a fare
    // that rose since. The ratio stays for a booking with no verified charge; on
    // its own it refused every booking whose coupon took more than a fifth off.
    if (config.minPaymentRatio > 0 && (verifiedChargeTotal != null || priced.total != null)) {
      const floor = verifiedChargeTotal != null
        ? Number(verifiedChargeTotal)
        : Number(priced.total) * config.minPaymentRatio;
      if (Math.round(Number(paidAmount) * 100) + 1 < Math.round(floor * 100)) {
        throw new BookingChainError({
          step: 'paymentCoverage',
          error: 'We could not confirm your payment covers this fare - please contact support.',
          code: 402,
          technicalError: verifiedChargeTotal != null
            ? `paid ${paidAmount}, verified charge ${verifiedChargeTotal} ${priced.currency}`
            : `paid ${paidAmount}, fare ${priced.total} ${priced.currency}, floor ${floor.toFixed(2)} (ratio ${config.minPaymentRatio})`,
        });
      }
    }

    // ---- 5. TST ------------------------------------------------------------
    const tstReply = await callStep(ctx, {
      step: 'createTst',
      operation: 'Ticket_CreateTSTFromPricing',
      // The pricing reference, not a TST number - no TST exists until this call.
      bodyXml: buildCreateTstBody(priced.fares.map((f) => f.reference)),
    });
    const tstRefs = readCreateTstReply(tstReply);

    // Last chance to stop without selling anything. The caller confirms this
    // request still holds the booking. A chain slower than its claim's life, or
    // one whose heartbeat could not reach the database, can have been taken over
    // by a retry, the queue or a cancel - and committing then sold a second PNR
    // against one payment. Answers 'held', 'lost' or 'unavailable'.
    if (beforeCommit) {
      const hold = await beforeCommit();
      if (hold !== 'held') {
        const stopped = new BookingChainError({
          step: 'claim',
          error: 'This booking is already being confirmed. Please wait a moment before trying again.',
          code: 409,
          technicalError: hold === 'lost'
            ? 'the booking claim was taken over before commit'
            : 'the booking claim could not be confirmed before commit',
        });
        stopped.claimLost = hold === 'lost';
        stopped.claimUnavailable = hold !== 'lost';
        throw stopped;
      }
    }

    // ---- 6. Commit. Everything changes here. -------------------------------
    //
    // `committed: 'unknown'` - a third state, and the only honest one for a
    // request whose ANSWER we never saw.
    //
    // This step was marked `committed: false`, the default. A 25s timeout
    // (AMADEUS_WS_TIMEOUT_MS) on the end transact does not mean Amadeus did not
    // process it: this file's own notes record airlines taking 45 to 117
    // seconds around commit. The route reads `providerError.committed` to
    // choose between "flag for review" and "reverse the payment", so a commit
    // that timed out was refunded while the airline held the reservation - and
    // with no PNR list operation in this layer, the RM remark filed at commit
    // cannot be used to find the orphan afterwards.
    //
    // Checked before choosing a truthy value: nothing compares `committed`
    // strictly, nothing persists it, and `if (providerError?.committed)`
    // (flight.routes.js) returns 202 before the `slotTimeout && !committed`
    // queue branch is reached. So 'unknown' routes to a human, which is what
    // not knowing deserves.
    const commitReply = await callStep(ctx, {
      step: 'commit',
      operation: 'PNR_AddMultiElements',
      bodyXml: buildCommitBody(),
      committed: 'unknown',
    });

    pnr = readRecordLocator(commitReply);
    if (!pnr) {
      throw new BookingChainError({
        step: 'commit',
        // Same reasoning: the end transact was accepted and we cannot read a
        // locator out of the answer. The record may well exist.
        committed: 'unknown',
        error: 'We could not confirm your booking',
        code: 502,
        technicalError: 'PNR_AddMultiElements committed without returning a record locator',
      });
    }
    committed = true;
    ticketed = isTicketed(commitReply);

    let order = buildFlightOrder(commitReply, { flightOffers: [offer], bookingReference });

    // Persist before queueing or ticketing is attempted. A failure after this
    // await leaves a booking the database knows about; a failure before it
    // would leave one only Amadeus knows about.
    if (onCommitted) {
      try {
        await onCommitted({ pnr, order, tstRefs, priced });
      } catch (cause) {
        log.error({ pnr, reason: cause?.message }, 'persisting the committed PNR failed');
      }
    }

    // ---- 6b. A segment the airline changed ---------------------------------
    // IB4001 MAD-JFK, operated by AA, came back from commit with status TK -
    // confirmed, but changed by the airline - and issuance answered 1969 VERIFY
    // ITINERARY. Amadeus (15 Sep 2026): end the transaction with change advice,
    // PNR_AddMultiElements optionCode 13, which accepts the change. PDT stopped
    // returning TK for that flight before it could be proved end to end, so this
    // runs only when a segment carries a changed status.
    let bookedReply = commitReply;

    // Queue_PlacePNR, from step 7 and from the not-a-seat stop below. Returns
    // whether it was filed.
    const placeOnQueue = async () => {
      try {
        await callStep(ctx, {
          step: 'queue',
          operation: 'Queue_PlacePNR',
          bodyXml: buildQueuePlaceBody({
            recordLocator: pnr,
            queueOffice: config.queueOffice,
            queueNumber: config.queueNumber,
            queueCategory: config.queueCategory,
          }),
          pnr,
          committed,
        });
        return true;
      } catch (cause) {
        // A booking that is not on a queue is still a booking. Refunding one over
        // a filing error would be far worse than leaving it for the desk to find.
        log.warn({ pnr, reason: cause?.technicalError ?? cause?.message }, 'Queue_PlacePNR failed; booking stands');
        return false;
      }
    };

    const statuses = airSegmentStatuses(commitReply);
    const notSeats = statuses.filter((status) => NOT_A_SEAT_AT_COMMIT.has(status));
    if (notSeats.length > 0) {
      log.error({ pnr, statuses }, 'the airline is not holding a confirmed seat on every flight; not ticketing');
      // Queued first. This is the PNR that most needs an agent - paid,
      // committed, no confirmed seat - and stopping before the queue (round 1)
      // kept exactly this one off the office queue. Never fatal, as in step 7.
      await placeOnQueue();
      throw new BookingChainError({
        step: 'segmentStatus',
        pnr,
        committed,
        ticketed: false,
        error: 'The airline has not confirmed a seat on every flight - our team will contact you',
        code: 502,
        technicalError: `segment status ${statuses.join(',')} at commit: ${notSeats.join(',')} is not a confirmed seat `
          + '(waitlisted, requested, unable or cancelled); not accepted or ticketed',
      });
    }
    const changed = statuses.filter((status) => SCHEDULE_CHANGE_STATUSES.has(status));
    if (changed.length > 0) {
      log.warn({ pnr, changed }, 'a segment was changed by the airline; accepting it with change advice');
      bookedReply = await callStep(ctx, {
        step: 'acceptScheduleChange',
        operation: 'PNR_AddMultiElements',
        bodyXml: buildCommitBody({ changeAdvice: true }),
        pnr,
        committed,
      });
    }

    // ---- 7. Queue (bookkeeping; never fatal) -------------------------------
    const queued = await placeOnQueue();

    // ---- 8. Issue ----------------------------------------------------------
    // Airlines Amadeus hosts (LH, QR, AF) carry their record locator at commit
    // and are ticketed here, in this session. An airline that confirms in its
    // own system after commit - B6, VS, AA, DL and BI on PDT - refuses the
    // ticket until its locator is on the PNR, and that is looked for in new
    // sessions once this one has ended (issueInFreshSessions).
    let issueInNewSession = false;
    let notReadyRefusals = 0;
    if (config.autoTicket) {
      if (anyLocatorMissing(bookedReply)) {
        issueInNewSession = true;
      } else {
        try {
          const issueReply = await callStep(ctx, {
            step: 'issueTicket',
            operation: 'DocIssuance_IssueTicket',
            bodyXml: buildIssueTicketBody(),
            pnr,
            committed,
          });
          ticketed = readIssueTicketReply(issueReply).issued;
        } catch (cause) {
          if (!issuanceNotReady(cause)) throw cause;
          log.warn({ pnr, reason: cause?.technicalError }, 'the airline is not ready to ticket yet; retrying in a new session');
          issueInNewSession = true;
          notReadyRefusals = 1;
        }
      }
    }

    // ---- 9. Read the ticket numbers back (with retries) --------------------
    let tickets = order.tickets;
    if (config.autoTicket && ticketed) {
      ({ tickets, order } = await readTicketNumbers(ctx, {
        pnr, order, offer, bookingReference, config, expected: travelers.length,
      }));
    }

    log.info({
      pnr, ticketed, queued, issueInNewSession, tstRefs: tstRefs.length, totalMs: Date.now() - started,
    }, 'flight.booking.chain complete');

    return {
      pnr,
      order,
      ticketed,
      queued,
      tickets,
      tstRefs,
      priced: { total: priced.total, currency: priced.currency },
      lastTicketingDate: priced.fares[0]?.lastTicketingDate ?? offer.lastTicketingDate ?? null,
      sessionId: ctx.sessionId,
      // The airline changed a segment and the change was accepted. The booking
      // and its emails still show the searched times, so a person has to tell
      // the customer (index.js turns this into a review flag).
      scheduleChanged: changed.length > 0 ? changed : null,
      issueInNewSession,
      notReadyRefusals,
    };
  }, { config });

  const { issueInNewSession, notReadyRefusals, ...result } = booked;
  if (!issueInNewSession) return result;
  return issueInFreshSessions(result, {
    offer, bookingReference, config, notReadyRefusals, expectedTickets: travelers.length,
  });
};

/**
 * Confirm the airline will sell these seats, without booking them.
 *
 * Search availability is a copy, and for a polled carrier it can say a class is
 * open when the airline will not sell it: Gulf Air GF131 DEL-BAH on 22 Sep 2026
 * was offered in W with 7 seats and every Air_SellFromRecommendation answered
 * UNS / 288 - after the customer had paid, so the booking was refunded. Checkout
 * calls this before the charge instead.
 *
 * One sell, then - in the same session - a pricing of what was sold (see
 * confirmFare), then sign out. Nothing is named and nothing is committed, so the
 * session ends with no PNR and the seats go back - the same as a booking chain
 * that fails before commit. It is never run after payment: the booking chain's
 * own sell and pricing are the real ones.
 *
 * @param {object} flightOffer an offer carrying `_ama`, as priced
 * @returns {Promise<{available: true, statuses: string[], fare: {adultTotal: number, currency: string} | null}>}
 * @throws {AmadeusSoapError} code 409 when the airline refuses the seats or the
 *   fare, or the adult fare rose, which checkout reads as FARE_UNAVAILABLE; any
 *   other failure keeps its own code
 */
export const confirmSeats = async (flightOffer) => {
  const config = getWsConfig();
  const offer = flightOffer?.originalOffer ?? flightOffer;
  const ama = offer?._ama;

  if (!ama?.segments?.length) {
    throw new AmadeusSoapError({
      error: 'This flight can no longer be booked - please search again',
      code: 409,
      technicalError: 'seat check: offer is missing _ama; it did not come from this provider',
      operation: 'Air_SellFromRecommendation',
    });
  }
  if (ama.wsap && ama.wsap !== config.wsap) {
    throw new AmadeusSoapError({
      error: 'This fare has expired - please search again',
      code: 409,
      technicalError: `seat check: offer was found on WSAP ${ama.wsap}, this server is ${config.wsap}`,
      operation: 'Air_SellFromRecommendation',
    });
  }

  // Seats held, from the fare's own passenger types: a lap infant holds none.
  const seats = seatCount((offer.travelerPricings ?? []).map((t) => ({ ptc: t.travelerType }))) || 1;
  const flights = ama.segments.map((s) => `${s.marketingCarrier}${s.flightNumber}/${s.rbd}`);

  // Those types come from the request body, on a route anyone can call, and
  // nothing capped them: buildAirSellBody refuses only fewer than one. The fare
  // was priced from `_ama.paxRefs` (index.js priceFlightOffer), so a body that
  // left paxRefs at one adult and listed nine ADULT pricings priced one seat and
  // sold nine. The sell holds exactly what was priced, and never more than one
  // booking can hold - the chain's own ceiling, applied before its first call.
  const pricedSeats = Array.isArray(ama.paxRefs) && ama.paxRefs.length > 0 ? seatCount(ama.paxRefs) : null;
  if (seats > config.maxPassengersPerPnr || (pricedSeats !== null && seats !== pricedSeats)) {
    throw new AmadeusSoapError({
      error: 'This fare can no longer be booked - please search again',
      code: 409,
      technicalError: `seat check: ${seats} seats asked for; the fare was priced for ${pricedSeats ?? 'an unstated number'} `
        + `and a booking holds at most ${config.maxPassengersPerPnr}`,
      operation: 'Air_SellFromRecommendation',
    });
  }

  return withSession(async (ctx) => {
    const reply = replyOf(await ctx.call('Air_SellFromRecommendation', buildAirSellBody({ segments: ama.segments, seats })));
    const sold = readAirSellReply(reply, { expectedSegments: ama.segments.length });
    if (sold.sold) {
      log.info({ flights, seats, statuses: sold.statuses }, 'seat check: the airline will sell these seats');
      // Still in the session that holds them: price what was just sold.
      const fare = config.priceCheckBeforePayment ? await confirmFare(ctx, { offer, config, flights }) : null;
      return { available: true, statuses: sold.statuses, fare };
    }

    const inspected = inspectReply(reply, 'Air_SellFromRecommendation');
    // Sold for some flights and not answered for the rest: the airline will not
    // sell the whole trip, which is a refusal, not a reply to try again.
    const partlySold = sold.statuses.length > 0 && sold.statuses.length < ama.segments.length;
    if (sold.refused.length > 0 || partlySold) {
      const amadeusCode = inspected.error?.amadeusCode ?? null;
      log.warn({ flights, seats, statuses: sold.statuses, amadeusCode }, 'seat check: the airline refused these seats');
      throw new AmadeusSoapError({
        error: 'That flight is no longer available at this price - please search again',
        code: 409,
        technicalError: `seat check: segment status ${sold.statuses.join(',')}${partlySold ? ` for ${sold.statuses.length} of ${ama.segments.length} flights` : ''}${amadeusCode ? ` (${amadeusCode})` : ''}`,
        operation: 'Air_SellFromRecommendation',
        amadeusCode,
      });
    }
    // No seat status at all: not an answer about the seats, so not reported as
    // one. The customer is asked to try again rather than to search again.
    throw inspected.error ?? new AmadeusSoapError({
      error: 'We could not confirm the seats with the airline',
      code: 502,
      technicalError: 'seat check: Air_SellFromRecommendation returned no segment status',
      operation: 'Air_SellFromRecommendation',
    });
  }, { config });
};

/**
 * Price the segments the seat check just sold, as the booking chain will price
 * them after payment.
 *
 * Search and informative pricing can quote a fare that PNR pricing will not
 * give. On PDT, 15 Sep 2026: JetBlue B6 3982, 3988 and 3996/L JFK-LAX were
 * quoted PI2QUOY1 at $193.40 by both, and Fare_PricePNRWithBookingClass answered
 * NO FARE FOR BOOKING CODE - on a bare sell, with no names or elements - while
 * B6 323/L on the same fare priced $193.40. Alaska AS83 and AS99 were refused
 * the same way, and AS1306 and B6 3912 priced higher on the PNR. The chain's
 * fare guard caught every one, but after the card was charged: each a refund.
 *
 * Nothing is named here, and without names Amadeus prices ONE adult (PA1, ADT)
 * whatever was sold - two adults, an adult and a child, an adult and an infant
 * alike (PDT, same day). So the adult fare is what can be compared, against the
 * adult's total in the quote. Child and infant fares are left to the chain.
 *
 * Only the airline refusing the fare, or the adult fare rising beyond the
 * tolerance, stops checkout. Pricing that fails for any other reason is logged
 * and let through: the chain prices again after payment, as it always has, and
 * an Amadeus hiccup should not cost a sale.
 *
 * @returns {Promise<{adultTotal: number, currency: string} | null>} null when
 *   there was nothing to compare
 */
const confirmFare = async (ctx, { offer, config, flights }) => {
  const operation = 'Fare_PricePNRWithBookingClass';
  const validatingCarrier = offer.validatingAirlineCodes?.[0] ?? offer._ama.segments[0]?.marketingCarrier;

  let reply;
  try {
    reply = replyOf(await ctx.call(operation, buildPricePnrBody({ currency: config.currency, validatingCarrier })));
  } catch (error) {
    log.warn({ flights, reason: error?.technicalError ?? error?.message }, 'price check: pricing failed; the booking chain prices after payment');
    return null;
  }

  const status = inspectReply(reply, operation);
  if (status.empty || [400, 409].includes(Number(status.error?.code))) {
    const amadeusCode = status.error?.amadeusCode ?? null;
    log.warn({ flights, amadeusCode, reason: status.error?.technicalError }, 'price check: the airline will not price this fare');
    throw new AmadeusSoapError({
      error: 'This fare can no longer be sold - please search again',
      code: 409,
      technicalError: `price check: ${status.error?.technicalError ?? 'no fare for these segments'}`,
      operation,
      amadeusCode,
    });
  }
  if (status.error) {
    log.warn({ flights, reason: status.error.technicalError }, 'price check: pricing failed; the booking chain prices after payment');
    return null;
  }

  const adult = readPricePnrReply(reply).fares[0]?.amounts?.['712'];
  const quoted = (offer.travelerPricings ?? []).find((t) => t.travelerType === 'ADULT')?.price?.total;
  const quotedCurrency = offer.price?.currency ?? config.currency;
  if (adult?.amount == null || quoted == null || adult.currency !== quotedCurrency) {
    log.warn({ flights, priced: adult ?? null, quoted: quoted ?? null, quotedCurrency }, 'price check: nothing comparable to the quote; the booking chain prices after payment');
    return null;
  }

  // In whole cents, and only a rise - the chain's own fare guard, applied early.
  const riseCents = Math.round(adult.amount * 100) - Math.round(Number(quoted) * 100);
  if (riseCents > Math.round(config.priceTolerance * 100)) {
    log.warn({ flights, pricedAdult: adult.amount, quotedAdult: Number(quoted) }, 'price check: the adult fare prices higher than quoted');
    throw new AmadeusSoapError({
      error: 'The fare has changed - please search again',
      code: 409,
      technicalError: `price check: adult fare priced ${adult.amount} ${adult.currency}, quoted ${quoted}`,
      operation,
    });
  }

  log.info({ flights, pricedAdult: adult.amount, quotedAdult: Number(quoted) }, 'price check: the airline prices the fare as quoted');
  return { adultTotal: adult.amount, currency: adult.currency };
};

/**
 * Cancel a booking.
 *
 * Retrieve first, because what is safe to do depends on whether a ticket was
 * ever issued: an unticketed PNR can simply be cancelled, while a ticketed one
 * needs the ticket voided before the itinerary goes, and a ticket that is no
 * longer voidable has to go back to the airline as a refund rather than being
 * cancelled here.
 */
export const cancelBooking = async (recordLocator) => {
  const config = getWsConfig();
  const today = officeToday(config.officeTimeZone);

  const cancelOnce = async () => withSession(async (ctx) => {
    const retrieved = await callStep(ctx, {
      step: 'retrieve',
      operation: 'PNR_Retrieve',
      bodyXml: buildRetrieveBody(recordLocator),
      pnr: recordLocator,
    });

    const tickets = readTickets(retrieved);

    // A ticket issued today can be voided, which returns the fare in full and
    // leaves nothing to reconcile. After the day of issue it cannot: the money
    // has settled, and the ticket has to be refunded through the airline under
    // its own fare rules. Cancelling the itinerary without voiding a same-day
    // ticket throws away that window for no reason.
    // The plating carrier used to be required here because the void request
    // carried it. It does not: Ticket_CancelDocument identifies the stock by
    // the office's market code. Keeping the carrier in this condition would
    // send a perfectly voidable ticket down the airline-refund path whenever
    // the FA free text did not happen to match the /ET../ pattern.
    const voidable = tickets.filter((t) => t.issuedOn === today && t.number);
    const unvoidable = tickets.filter((t) => !voidable.includes(t));
    let voided = false;

    // A ticket whose issue date could not be read is not "past its void
    // window" - the window is unknown. `issuedOn` is null whenever the DDMMMYY
    // token is missing from the joined FA free text, and `null === today` is
    // false, so such a ticket fell into `unvoidable`, the void block below was
    // skipped entirely, and PNR_Cancel went ahead: the segments stripped with a
    // live ticket standing against them. That is precisely what the guard on a
    // FAILED void prevents - a void that was never ATTEMPTED had no guard at
    // all.
    const undated = tickets.filter((t) => t.number && !t.issuedOn);
    if (undated.length > 0) {
      throw new BookingChainError({
        step: 'voidTicket',
        pnr: recordLocator,
        committed: true,
        ticketed: true,
        error: 'We could not cancel this booking automatically - our team will finish it',
        code: 502,
        technicalError: `ticket ${undated.map((t) => t.number).join(', ')} carries no readable issue date; `
          + 'refusing to cancel the itinerary over a ticket that may still be voidable',
      });
    }

    if (voidable.length > 0) {
      try {
        let voidReply;
        const documentNumbers = voidable.map((t) => t.number.replace('-', ''));
        try {
          voidReply = replyOf(await ctx.call('Ticket_CancelDocument', buildVoidTicketBody({
            documentNumbers,
            marketIataCode: config.marketIataCode,
            targetOffice: config.officeId,
          })));
        } catch (cause) {
          // A void asked for too soon, or one the airline left unanswered, is
          // worth one more try in a moment - this session is unusable after a
          // timeout, so cancelBooking below opens a new one and runs this again.
          if (voidFailedForNow(cause)) return { retryVoid: true, reason: cause?.technicalError ?? cause?.message };
          throw new BookingChainError({ step: 'voidTicket', pnr: recordLocator, committed: true, ticketed: true, cause, code: cause?.code ?? 502 });
        }

        // Confirm rather than assume, per document (readVoidTicketReply). The
        // documents are read before the reply's error group: a ticket an earlier
        // attempt already voided answers 6150 DOCUMENT ALREADY CANCELLED in that
        // group, and treated as a failure it stopped every retry here - a cancel
        // whose PNR_Cancel had failed could never finish, and the booking stayed
        // live with its tickets voided (PDT, 15 Sep 2026).
        const result = readVoidTicketReply(voidReply, documentNumbers);
        if (!result.voided) {
          const inspected = inspectReply(voidReply, 'Ticket_CancelDocument');
          const partly = partialVoid(result, voidable);
          if (voidFailedForNow(inspected.error)) {
            return { retryVoid: true, reason: `${inspected.error?.technicalError ?? 'void failed for now'}${partly.text}` };
          }
          const failure = new BookingChainError({
            step: 'voidTicket',
            pnr: recordLocator,
            committed: true,
            ticketed: true,
            cause: inspected.error ?? undefined,
            error: 'We could not void the ticket',
            code: 502,
            technicalError: (inspected.error?.technicalError
              ?? `Ticket_CancelDocument responseType ${result.responseType || 'absent'} status ${result.status || 'absent'}`)
              + partly.text,
          });
          failure.voidedTickets = partly.voided;
          failure.unvoidedTickets = partly.unvoided;
          throw failure;
        }
        voided = true;
        log.info({ pnr: recordLocator, tickets: voidable.length }, 'tickets voided');
      } catch (cause) {
        // Do not cancel the itinerary on top of a failed void: that would strip
        // the segments while leaving a live ticket against them, which is worse
        // than leaving the booking intact for someone to deal with.
        log.error({ pnr: recordLocator, reason: cause?.technicalError ?? cause?.message }, 'void failed; itinerary left intact');
        throw cause;
      }
    }

    // 8111 SIMULTANEOUS CHANGES TO PNR - USE WRA/RT TO PRINT OR IGNORE. Right
    // after ticketing the airline's own updates are still landing on the PNR,
    // and a cancel then is refused - on PDT an Etihad and an Air Canada booking
    // were both left live this way. It is not a refusal to cancel: Amadeus says
    // to ignore it, redisplay the PNR and try again, which is what this does, twice.
    for (let attempt = 1; ; attempt += 1) {
      try {
        await callStep(ctx, {
          step: 'cancel',
          operation: 'PNR_Cancel',
          bodyXml: buildCancelBody(recordLocator),
          pnr: recordLocator,
          committed: true,
          ticketed: tickets.length > 0,
        });
        break;
      } catch (cause) {
        const simultaneous = String(cause?.amadeusCode ?? '') === '8111'
          || /SIMULTANEOUS CHANGES/i.test(String(cause?.technicalError ?? ''));
        if (!simultaneous || attempt >= 3) throw cause;
        log.warn({ pnr: recordLocator, attempt }, 'PNR_Cancel met simultaneous changes; ignoring it and retrying');
        await sleep(config.cancelRetryDelayMs);
        // Ignore the refused cancel before looking again. A plain retrieve here
        // answered 31 FINISH OR IGNORE, because the failed change was still
        // pending in the session - which is what left most cancels in the
        // 15 Sep airline test unfinished.
        await callStep(ctx, { step: 'ignore', operation: 'PNR_AddMultiElements', bodyXml: buildIgnoreBody(), pnr: recordLocator, committed: true });
      }
    }

    log.info({
      pnr: recordLocator, hadTickets: tickets.length, voided, unvoidable: unvoidable.length,
    }, 'flight.booking.cancelled');

    return {
      cancelled: true,
      hadTickets: tickets.length > 0,
      tickets,
      voided,
      // Tickets that outlived their void window still hold value and need an
      // airline refund; the caller has to know they exist rather than assume
      // cancelling settled everything.
      requiresAirlineRefund: unvoidable.filter((t) => t.number).map((t) => t.number),
    };
  }, { config });

  // One more try for a void that failed only for now (voidFailedForNow): the
  // coupons had not reached the e-ticket record yet, or the airline's link went
  // quiet. The session is opened again from scratch, because a timed-out one
  // answers 93 "illogical conversation" to everything after it.
  const first = await cancelOnce();
  if (!first.retryVoid) return first;

  log.warn({ pnr: recordLocator, reason: first.reason, retryInMs: config.voidRetryDelayMs }, 'void failed for now; trying once more in a new session');
  await sleep(config.voidRetryDelayMs);

  const second = await cancelOnce();
  if (!second.retryVoid) return second;

  // Still not voided: leave the itinerary alone, exactly as a refused void does.
  log.error({ pnr: recordLocator, reason: second.reason }, 'void failed twice; itinerary left intact');
  throw new BookingChainError({
    step: 'voidTicket',
    pnr: recordLocator,
    committed: true,
    ticketed: true,
    error: 'We could not void the ticket',
    code: 502,
    technicalError: second.reason ?? 'Ticket_CancelDocument did not void the ticket',
  });
};

/** Read a booking back by record locator. Stateless - no session needed. */
export const retrieveBooking = async (recordLocator, { flightOffers = [] } = {}) => {
  const result = await callStateless('PNR_Retrieve', buildRetrieveBody(recordLocator));
  const reply = replyOf(result);

  const inspected = inspectReply(reply, 'PNR_Retrieve');
  if (!inspected.ok) {
    throw inspected.error ?? new AmadeusSoapError({
      error: 'Booking not found', code: 404, operation: 'PNR_Retrieve',
    });
  }

  const pnr = readRecordLocator(reply);
  if (!pnr) throw new AmadeusSoapError({ error: 'Booking not found', code: 404, operation: 'PNR_Retrieve' });

  return buildFlightOrder(reply, { flightOffers });
};
