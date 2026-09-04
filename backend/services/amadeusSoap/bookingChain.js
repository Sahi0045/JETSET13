import logger from '../logger.js';
import { getWsConfig } from './config.js';
import { AmadeusSoapError, inspectReply } from './errors.js';
import { buildFlightOrder, isTicketed, readRecordLocator, readTickets } from './mappers/flightOrder.js';
import { toDDMMYY } from './mappers/datetime.js';
import { buildAirSellBody, readAirSellReply } from './operations/airSell.js';
import { buildAddElementsBody, buildCancelBody, buildCommitBody, buildRetrieveBody } from './operations/pnr.js';
import {
  buildCreateTstBody,
  buildFopBody,
  buildIssueTicketBody,
  buildPricePnrBody,
  buildQueuePlaceBody,
  readCreateTstReply,
  readIssueTicketReply,
  readPricePnrReply,
} from './operations/ticketing.js';
import { callStateless, withSession } from './session.js';

const log = logger.child({ svc: 'amadeus-ws', flow: 'booking' });

/**
 * The booking chain: one HTTP request, one Amadeus session, ten calls.
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
    this.cause = cause;
  }
}

/** Pull the operation reply out of a parsed SOAP body. */
const replyOf = (result) => {
  const key = Object.keys(result.body ?? {}).find((k) => k !== 'Fault');
  return key ? result.body[key] : {};
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
 */
const callStep = async (ctx, { step, operation, bodyXml, pnr, committed, ticketed }) => {
  let result;
  try {
    result = await ctx.call(operation, bodyXml);
  } catch (cause) {
    throw new BookingChainError({ step, pnr, committed, ticketed, cause, code: cause?.code ?? 502 });
  }

  const reply = replyOf(result);
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

  return reply;
};

/**
 * @param {object} p
 * @param {object} p.offer            the priced offer, carrying `_ama`
 * @param {Array}  p.travelers        {firstName, lastName, gender, dateOfBirth}
 * @param {object} p.contact          {email, phone}
 * @param {string} p.bookingReference our reference, filed on the PNR as a remark
 * @param {number} [p.expectedTotal]  the fare total the customer was quoted
 * @param {Function} [p.onCommitted]  awaited with {pnr, order} the moment a PNR exists
 */
export const runBookingChain = async (p) => {
  const config = getWsConfig();
  const { offer, contact = {}, bookingReference, expectedTotal, onCommitted } = p;

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

  const ageMinutes = ama.searchedAt ? (Date.now() - Date.parse(ama.searchedAt)) / 60000 : 0;
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

  const validatingCarrier = offer.validatingAirlineCodes?.[0] ?? ama.segments[0]?.marketingCarrier;
  const started = Date.now();

  return withSession(async (ctx) => {
    let pnr = null;
    let committed = false;
    let ticketed = false;

    // ---- 1. Sell -----------------------------------------------------------
    // Holds the seats. Never retried: a retried sell is a second booking.
    const sellReply = await callStep(ctx, {
      step: 'sell',
      operation: 'Air_SellFromRecommendation',
      bodyXml: buildAirSellBody({ segments: ama.segments, seats: seatCount(travelers) }),
    });

    const sold = readAirSellReply(sellReply);
    if (!sold.sold) {
      // UC between search and sell is normal, not exceptional: the fare class
      // sold out in the seconds since the customer chose it. It has to read as
      // a clean "gone", because the refund path is what happens next.
      throw new BookingChainError({
        step: 'sell',
        error: 'That flight is no longer available at this price',
        code: 409,
        technicalError: `segment status ${sold.statuses.join(',') || 'absent'}`,
      });
    }

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
      }),
    });

    // ---- 3. Price the PNR --------------------------------------------------
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

    // ---- 3b. Fare-change guard --------------------------------------------
    // Compared against the FARE the customer was quoted, not against what they
    // were charged: the charged amount includes the admin-configured service
    // fee, which Amadeus knows nothing about. Tolerance is an env var because
    // the acceptable drift is a business decision, and it defaults to zero.
    if (expectedTotal != null && priced.total != null) {
      const drift = Math.abs(priced.total - Number(expectedTotal));
      if (drift > config.priceTolerance) {
        throw new BookingChainError({
          step: 'priceCheck',
          error: 'The fare changed while we were booking - please search again',
          code: 409,
          technicalError: `priced ${priced.total} ${priced.currency}, expected ${expectedTotal}`,
        });
      }
    }

    // ---- 4. TST ------------------------------------------------------------
    const tstReply = await callStep(ctx, {
      step: 'createTst',
      operation: 'Ticket_CreateTSTFromPricing',
      // The pricing reference, not a TST number - no TST exists until this call.
      bodyXml: buildCreateTstBody(priced.fares.map((f) => f.reference)),
    });
    const tstRefs = readCreateTstReply(tstReply);

    // ---- 5. Form of payment ------------------------------------------------
    await callStep(ctx, {
      step: 'fop',
      operation: 'FOP_CreateFormOfPayment',
      bodyXml: buildFopBody({ fopCode: config.fopCode }),
    });

    // ---- 6. Commit. Everything changes here. -------------------------------
    const commitReply = await callStep(ctx, {
      step: 'commit',
      operation: 'PNR_AddMultiElements',
      bodyXml: buildCommitBody(),
    });

    pnr = readRecordLocator(commitReply);
    if (!pnr) {
      throw new BookingChainError({
        step: 'commit',
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

    // ---- 7. Queue (bookkeeping; never fatal) -------------------------------
    let queued = false;
    try {
      await callStep(ctx, {
        step: 'queue',
        operation: 'Queue_PlacePNR',
        bodyXml: buildQueuePlaceBody({
          recordLocator: pnr,
          queueOffice: config.queueOffice,
          queueNumber: config.queueNumber,
        }),
        pnr,
        committed,
      });
      queued = true;
    } catch (cause) {
      // A booking that is not on a queue is still a booking. Refunding one over
      // a filing error would be far worse than leaving it for the desk to find.
      log.warn({ pnr, reason: cause?.technicalError ?? cause?.message }, 'Queue_PlacePNR failed; booking stands');
    }

    // ---- 8. Issue ----------------------------------------------------------
    if (config.autoTicket) {
      const issueReply = await callStep(ctx, {
        step: 'issueTicket',
        operation: 'DocIssuance_IssueTicket',
        bodyXml: buildIssueTicketBody(),
        pnr,
        committed,
      });
      ticketed = readIssueTicketReply(issueReply).issued;
    }

    // ---- 9. Read the ticket numbers back -----------------------------------
    // Issuance replies with a status only. Non-fatal: the tickets exist whether
    // or not we manage to read their numbers in this request.
    let tickets = order.tickets;
    if (config.autoTicket && ticketed) {
      try {
        const retrieved = await callStep(ctx, {
          step: 'retrieve',
          operation: 'PNR_Retrieve',
          bodyXml: buildRetrieveBody(pnr),
          pnr,
          committed,
          ticketed,
        });
        tickets = readTickets(retrieved);
        order = buildFlightOrder(retrieved, { flightOffers: [offer], bookingReference });
        order.tickets = tickets;
      } catch (cause) {
        log.warn({ pnr, reason: cause?.technicalError ?? cause?.message }, 'reading ticket numbers failed');
      }
    }

    log.info({
      pnr, ticketed, queued, tstRefs: tstRefs.length, totalMs: Date.now() - started,
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
    };
  }, { config });
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

  return withSession(async (ctx) => {
    const retrieved = await callStep(ctx, {
      step: 'retrieve',
      operation: 'PNR_Retrieve',
      bodyXml: buildRetrieveBody(recordLocator),
      pnr: recordLocator,
    });

    const tickets = readTickets(retrieved);

    await callStep(ctx, {
      step: 'cancel',
      operation: 'PNR_Cancel',
      bodyXml: buildCancelBody(recordLocator),
      pnr: recordLocator,
      committed: true,
      ticketed: tickets.length > 0,
    });

    log.info({ pnr: recordLocator, hadTickets: tickets.length }, 'flight.booking.cancelled');
    return { cancelled: true, hadTickets: tickets.length > 0, tickets };
  }, { config });
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
