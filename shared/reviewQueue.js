/**
 * Which bookings still need a person, in one place.
 *
 * The Slack alarms (jobs/needsReviewAlert.job.js, jobs/paymentFailureAlert.job.js)
 * announce a booking exactly once and then stamp `alerted_at`, so the message in
 * Slack is the only trace. Nothing in the admin panel could list those bookings,
 * show why they were flagged, or record that someone had dealt with one - the
 * flag stayed on the booking for ever, and staff had to paste a reference out of
 * Slack into the search box to find it at all.
 *
 * The rules here are the alarm's own selection rules, so the panel's "Needs
 * attention" list is exactly what Slack announced.
 *
 * Shared: the server shapes admin rows with it, and the panel reads the result.
 */

const detailsOf = (booking) => booking?.booking_details ?? booking?.bookingDetails ?? booking?.details ?? {};
const statusOf = (booking) => String(booking?.status ?? '').toLowerCase();
const paymentOf = (booking) => String(booking?.payment_status ?? booking?.paymentStatus ?? '').toLowerCase();

// The top review flag, from a database row or from a page's copy of one: the
// single-booking read spreads booking_details, so its flag sits at the top.
const topFlagOf = (booking) => booking?.needs_review ?? detailsOf(booking)?.needs_review ?? null;

/**
 * The first review flag that `matches`, on top or under later flags, or null.
 *
 * A booking keeps only its latest flag on top. A later cancel attempt - failed,
 * or carried out and not recorded - writes its own flag and keeps the one
 * before only as `previous` (payment/operations.handlers.js keepingPrevious).
 * Every reader that looked at the top flag alone forgot the earlier state the
 * moment that happened: a PNR with no confirmed seat read "your seats are
 * reserved" again after its cancel was refused. So every state that a later
 * flag can bury is read through here, and there is one walker.
 *
 * A flag a person resolved settles everything under it, so the search stops
 * there. `pastResolved` is for a fact about the airline record rather than a
 * job for a person: a ticket the airline issued stays issued whatever anyone
 * recorded after it.
 *
 * Twenty levels is far more than any booking gets; it only stops a malformed
 * chain from looping.
 */
export function flagInForce(booking, matches, options) {
  return flagsInForce(booking, options).find(matches) ?? null;
}

/**
 * Every review flag on a booking, latest first, down to (not including) the
 * first one a person resolved - or the whole chain with `pastResolved`. The
 * walk flagInForce searches, for a reader that needs what every flag recorded
 * (the tickets each cancel attempt voided, say).
 */
export function flagsInForce(booking, { pastResolved = false } = {}) {
  const flags = [];
  let review = topFlagOf(booking);
  for (let depth = 0; review && depth < 20; depth += 1) {
    if (review.resolved_at && !pastResolved) break;
    flags.push(review);
    review = review.previous;
  }
  return flags;
}

/** Ticket numbers recorded on a booking. */
export const ticketsOf = (details) => (Array.isArray(details?.tickets) ? details.tickets : [])
  .filter((ticket) => ticket?.number);

/** Whether the airline has issued a ticket, by either of the two records of it. */
export const isTicketed = (details) => details?.gds?.ticketed === true || ticketsOf(details).length > 0;

/**
 * The order route's flag says `issuance: 'unknown'` when DocIssuance was sent
 * after commit and never answered - a timeout, or a reply that was not a SOAP
 * envelope (bookingChain.js callStep). A ticket may exist that the booking
 * does not record. Beside `ticketed: false`, never in place of it: the flag's
 * `ticketed` says the ticket WAS issued (openTicketedFlagOf). Here so the chain
 * that finds it, the route that writes it, and the alarm and the cancel that
 * read it share one value.
 */
export const ISSUANCE_UNKNOWN = 'unknown';

/**
 * The booking chain's flag on a booking it DID ticket: issuance answered OK,
 * but not every ticket number surfaced in the PNR (bookingChain.js
 * readTicketNumbers). The row is ticketed by definition, so a "ticketed means
 * done" check skipped it - and nobody was ever told to find the numbers.
 */
export const TICKET_NUMBERS_MISSING = 'ticket_numbers_not_retrieved';

/**
 * The numbers-missing flag on a booking, on top or under a later one, or null.
 *
 * It records a fact about the airline record - a ticket WAS issued - so it is
 * read past a resolved flag too: a person dealing with the booking does not
 * un-issue its ticket. Read from the top alone, a refused cancel on top of it
 * made the booking look unticketed: the customer's pages said the ticket was
 * not issued, and a later cancel whose retrieve missed the FA lines could
 * refund in full over a live ticket.
 */
export const ticketNumbersMissingOf = (booking) => flagInForce(
  booking, (review) => review.reason === TICKET_NUMBERS_MISSING, { pastResolved: true },
);

/**
 * The numbers-missing flag, for what the customer is told: null once the
 * tickets it records have been voided.
 *
 * An issued ticket stays issued, but a void un-issues it. A same-day cancel can
 * void every ticket and then have PNR_Cancel refused: the booking keeps the
 * flag, and read from it alone the pages said "Your ticket has been issued"
 * and offered a document saying so, of void tickets. So once the booking or
 * any flag records as many voided tickets as the flag expected, and no record
 * names one still live, no issued ticket is left to speak of.
 *
 * The customer's pages only. The refund decision and the alarm read
 * ticketNumbersMissingOf: they ask whether a ticket was ever issued.
 */
export function liveTicketNumbersMissingOf(booking) {
  const missing = ticketNumbersMissingOf(booking);
  if (!missing) return null;
  const flags = flagsInForce(booking, { pastResolved: true });
  const digits = (number) => String(number ?? '').replace(/\D/g, '');
  const listed = (list) => (Array.isArray(list) ? list : []);
  const voided = new Set([detailsOf(booking)?.voided_tickets, ...flags.map((flag) => flag.voided_tickets)]
    .flatMap(listed).map(digits).filter(Boolean));
  const stillLive = flags.some((flag) => listed(flag.unvoided_tickets).some((number) => !voided.has(digits(number))));
  const expected = Number.isFinite(missing.expected) ? missing.expected : 1;
  return !stillLive && voided.size >= expected ? null : missing;
}

/**
 * Every ticket number a cancel recorded as voided, once each: the booking's own
 * list plus every flag's, down the whole chain.
 *
 * A cancel that voids tickets and then has PNR_Cancel refused leaves the
 * ticket list as it was (payment/operations.handlers.js records the void
 * beside it), so a reader of the list alone called void tickets issued. Past a
 * resolved flag too, as liveTicketNumbersMissingOf reads it: a void is a fact
 * about the airline record, and nobody marking the booking handled un-voids a
 * ticket.
 */
export function voidedTicketsOf(booking) {
  const listed = (list) => (Array.isArray(list) ? list : []);
  const seen = new Set();
  return [detailsOf(booking)?.voided_tickets, ...flagsInForce(booking, { pastResolved: true }).map((flag) => flag.voided_tickets)]
    .flatMap(listed)
    .filter((number) => {
      const digits = String(number ?? '').replace(/\D/g, '');
      if (!digits || seen.has(digits)) return false;
      seen.add(digits);
      return true;
    });
}

/**
 * The order route's flag on a PNR the airline confirmed no seat on: a flight
 * came back from commit waitlisted, requested, unable or cancelled (the
 * chain's step 'segmentStatus', bookingChain.js NOT_A_SEAT_AT_COMMIT). The PNR
 * is live, nothing is ticketed, and the customer has paid. Defined here so the
 * route that writes it and the alarm that reads it share one value
 * (frontend/src/utils/eTicket.js keeps the customer pages' copy; a test keeps
 * the two equal).
 */
export const NO_CONFIRMED_SEAT_REVIEW_REASON = 'chain failed after commit at segmentStatus';

/**
 * The no-confirmed-seat flag on a booking, on top or under a later one, or null.
 *
 * The seatless Slack section tells staff to cancel the PNR, and a refused
 * cancel writes its own flag on top. Read from the top alone, the booking then
 * went back to "Your seats are reserved" on every customer page, offered a PDF
 * saying the seat was held, and a retry of the order answered ALREADY_BOOKED.
 * No seat had been confirmed at any point.
 *
 * Past a resolved flag too: resolving says a person dealt with the booking,
 * not that the airline gave it a seat. A person who called the customer and
 * pressed "Mark as handled" with the seat still waitlisted turned every page
 * back to "Your seats are reserved". Only the booking can say otherwise, and
 * the one record it keeps of that is a ticket.
 */
export const noConfirmedSeatOf = (booking) => (isTicketed(detailsOf(booking)) ? null
  : flagInForce(booking, (review) => review.reason === NO_CONFIRMED_SEAT_REVIEW_REASON, { pastResolved: true }));

/**
 * The order route's flag on a booking whose airline commit never answered:
 * PNR_AddMultiElements timed out, sent back something that is not SOAP, or
 * answered with no record locator (bookingChain.js step 6, `committed:
 * 'unknown'`). The chain throws before a record locator is read, so the row
 * has no PNR, and nobody knows yet whether the airline holds a reservation.
 * The customer was told our team is checking with the airline, and not to
 * book again (flight.routes.js, the 202 for a committed chain error).
 */
export const COMMIT_UNKNOWN_REVIEW_REASON = 'chain failed after commit at commit';

/**
 * The commit-unknown flag still open on a booking with no PNR, on top or under
 * a later one, or null.
 *
 * The order page knows the state from the answer to the order. Every later
 * read comes from the row, which has no PNR and this reason alone - the shape
 * of a booking that failed - so it was read as one: "failed", with nothing
 * against booking the trip again, while the first booking may be held at the
 * airline.
 *
 * A PNR on the row, or a person resolving the flag (flagInForce stops there),
 * means somebody found out: every reader then goes back to what the row says.
 */
export const commitUnknownOf = (booking) => (booking?.pnr || detailsOf(booking)?.pnr ? null
  : flagInForce(booking, (review) => review.reason === COMMIT_UNKNOWN_REVIEW_REASON));

/**
 * The provider's flag on a booking whose flight the airline retimed: a segment
 * came back TK and the chain accepted the change (amadeusSoap/index.js
 * createFlightOrder). The booking and its ticket are real, and the customer is
 * sent the ordinary confirmation (flight.routes.js EMAILED_REVIEW_REASONS) on
 * the understanding that the team tells them the new times.
 */
export const SCHEDULE_CHANGED_REVIEW_REASON = 'schedule_changed_by_airline';

/**
 * The schedule-change flag still open on a booking, on top or under a later
 * one, or null.
 *
 * Under a later flag too: the chain can also flag the ticket numbers it could
 * not read back, and the retiming is still news to the customer whatever else
 * happened. A flag a person resolved settles it (flagInForce).
 */
export const scheduleChangeOf = (booking) => flagInForce(
  booking, (review) => review.reason === SCHEDULE_CHANGED_REVIEW_REASON,
);

/**
 * The review flags the order route's two 202 "needs review" answers write
 * (flight.routes.js flagForReview): the airline holds the seats, and a later
 * step - queueing, ticketing, the final save - failed. The customer is sent
 * the "held" email, "our team is finishing your ticket" (confirmationEmailKind
 * 'held'), and not the confirmation. Here so the route that emails it and the
 * desk and alarm that follow it up share one list.
 */
export const HELD_REVIEW_REASON_PREFIXES = ['chain failed after commit at ', 'order route failed after commit'];

/**
 * Whether a flag is one the order route held the booking with - not the
 * no-confirmed-seat flag, which shares the prefix and is sent no email.
 */
export const isHeldForReview = (review) => {
  const reason = String(review?.reason || '');
  return reason !== NO_CONFIRMED_SEAT_REVIEW_REASON && HELD_REVIEW_REASON_PREFIXES.some((prefix) => reason.startsWith(prefix));
};

/**
 * The flag on a TICKETED booking that still needs a person, or null.
 *
 * "Ticketed, so done" holds for most flags - the ticket turned up later, by
 * retry or by hand - and the desk and the alarm skip those. Not for these two:
 *
 *  - held after the ticket was issued: the customer was told "our team is
 *    finishing your ticket" and was never sent the confirmation. Skipped as
 *    done, nobody sent it. Only when the flag itself says the ticket was
 *    already issued (flagForReview writes `ticketed`): a booking held BEFORE
 *    issuance and ticketed later - by hand, then ticket sync, which sends the
 *    e-ticket - is the "ticketed, so done" case;
 *  - a schedule change: the ticket is issued, and the customer still has to be
 *    told the new times.
 *
 * The desk list and the alarm both read this, so they cannot disagree about
 * it. (The numbers-missing flag has its own rule in each: it is on top and
 * unresolved, or it is nobody's job.)
 */
export function openTicketedFlagOf(booking) {
  if (!isTicketed(detailsOf(booking))) return null;
  const review = topFlagOf(booking);
  if (review && !review.resolved_at && review.ticketed === true && isHeldForReview(review)) return review;
  return scheduleChangeOf(booking);
}

/** What a member of staff recorded when they dealt with it, or null. */
export const reviewResolution = (booking) => {
  const review = detailsOf(booking)?.needs_review;
  if (!review?.resolved_at) return null;
  return {
    at: review.resolved_at,
    by: review.resolved_by || null,
    note: review.resolution || null,
  };
};

/**
 * A cancelled booking whose tickets still hold value with the airline.
 *
 * The tickets are the ones the cancellation could not void, as it recorded
 * them on its review flag (`needs_review.tickets`, from `requiresAirlineRefund`
 * in payment/operations.handlers.js) - not the booking's own ticket list. The
 * two differ exactly when it matters: a booking whose ticket numbers were
 * never read back (`ticket_numbers_not_retrieved`) has no ticket list, and the
 * cancel's own retrieve still finds its tickets and lists them for a claim.
 *
 * The one rule, for the Slack alarm (jobs/needsReviewAlert.job.js) and this
 * panel alike. They used to be written separately, and disagreed.
 */
export function needsAirlineRefundClaim(booking) {
  const review = detailsOf(booking)?.needs_review;
  return review?.source === 'cancellation' && Array.isArray(review.tickets) && review.tickets.length > 0;
}

/**
 * A cancellation that released the seats and moved the money, and whose record
 * could not be written (payment/operations.handlers.js flagUnrecordedCancellation).
 *
 * The booking may still read confirmed and paid, and ticketed. A retry that
 * voided its tickets leaves nothing to claim, so every other rule here skipped
 * it as "ticketed, so done" - and one with tickets left to claim was labelled
 * a refund to claim, when the first thing to do is find out what happened.
 */
export function isUnrecordedCancellation(booking) {
  return unrecordedCancellationOf(booking) !== null;
}

/**
 * The unrecorded-cancellation flag on a booking, or null - on top, or under a
 * later one.
 *
 * A later cancel attempt writes its own flag and keeps the one before only as
 * `previous` (payment/operations.handlers.js keepingPrevious). Reading the top
 * flag alone, a failed retry took "Cancelled, but not recorded" off the desk
 * list and the alarm, though nothing about it had been resolved. A flag a
 * person resolved settles everything under it (flagInForce).
 */
export function unrecordedCancellationOf(booking) {
  return flagInForce(booking, (review) => review.source === 'cancellation' && review.unrecorded === true);
}

/**
 * A cancellation the airline did not carry out (payment/operations.handlers.js
 * cancelFlightBooking): PNR_Cancel or a ticket void was refused, so the PNR is
 * live, no refund was made, and the customer was told "Our team has been
 * alerted and will complete it".
 *
 * The booking still reads ticketed when it was, so every "ticketed, so done"
 * rule skipped it - including a void that went through for some tickets and
 * not the others - and nobody was alerted. A later cancel that went through
 * supersedes it: the booking then reads cancelled.
 */
export function isFailedCancellation(booking) {
  const review = detailsOf(booking)?.needs_review;
  return review?.source === 'cancellation' && review.cancelFailed === true && statusOf(booking) !== 'cancelled';
}

/**
 * What still needs doing on this booking, or null.
 *
 * @returns {null | { kind: 'not_ticketed'|'review'|'airline_refund'|'unrecorded_cancellation'|'cancel_failed'|'schedule_changed'
 *                    |'held_ticketed',
 *                    reason: string, since: string|null, tickets?: string[] }}
 */
export function attentionOf(booking) {
  const details = detailsOf(booking);
  const review = details?.needs_review || null;
  if (review?.resolved_at) return null;

  // Before anything reads the booking's status or tickets: neither says what
  // happened, which is the point of this flag. Found under a later flag too.
  const unrecorded = unrecordedCancellationOf(booking);
  if (unrecorded) {
    return {
      kind: 'unrecorded_cancellation',
      reason: unrecorded.reason || 'cancellation carried out but not recorded',
      since: unrecorded.at || null,
      ...(Array.isArray(unrecorded.tickets) && unrecorded.tickets.length
        ? { tickets: unrecorded.tickets.map((ticket) => ticket?.number ?? ticket) }
        : {}),
    };
  }

  // Before the ticketed check below, for the same reason: the PNR is live, and
  // a ticketed booking read as done.
  if (isFailedCancellation(booking)) {
    return {
      kind: 'cancel_failed',
      reason: review.reason || 'the airline did not cancel the reservation',
      since: review.at || null,
    };
  }

  // A cancelled booking whose tickets were past the void window: the airline
  // owes the money back and somebody has to claim it. This one IS on a
  // cancelled booking, so it is decided before the cancelled check below.
  if (needsAirlineRefundClaim(booking)) {
    return {
      kind: 'airline_refund',
      reason: review.reason || 'the refund has to be claimed from the airline',
      since: review.at || null,
      tickets: review.tickets.map((ticket) => ticket?.number ?? ticket),
    };
  }
  // Any other cancellation that asked for a person - a refund the gateway
  // refused, one left for review. Nothing is owed by the airline, so it is not
  // labelled a claim (it used to be, whenever the booking had ticket numbers,
  // voided or not); but it is not settled either, so it stays on the list. Not
  // a failed cancel a later one completed (isFailedCancellation): nothing is
  // left to do on that.
  if (review?.source === 'cancellation' && review.cancelFailed !== true) {
    return { kind: 'review', reason: review.reason || 'flagged for review', since: review.at || null };
  }

  if (['cancelled', 'refunded'].includes(statusOf(booking))) return null;
  if (['refunded', 'partially_refunded', 'reversed'].includes(paymentOf(booking))) return null;
  if (isTicketed(details) && review?.reason !== TICKET_NUMBERS_MISSING) {
    // Ticketed, and still somebody's job: skipped as done, the customer was
    // never told their flight was retimed, or never sent the ticket our team
    // promised to finish.
    const open = openTicketedFlagOf(booking);
    if (open?.reason === SCHEDULE_CHANGED_REVIEW_REASON) {
      return { kind: 'schedule_changed', reason: open.reason, since: open.at || null };
    }
    if (open) return { kind: 'held_ticketed', reason: open.reason, since: open.at || null };
    return null;
  }

  if (review) {
    // The airline's schedule change kept under the flag on top - under the
    // numbers flag (amadeusSoap/index.js createFlightOrder), or under a hold
    // the order route wrote after the chain accepted it (flagForReview): both
    // are the desk's to see. A person resolving the flag on top alone would
    // settle the retiming unseen.
    const retimed = review.reason === TICKET_NUMBERS_MISSING || isHeldForReview(review)
      ? scheduleChangeOf(booking)
      : null;
    // A hold whose DocIssuance was never answered: a ticket may exist. The
    // desk is the lasting list, and it read like any refused issuance.
    const unanswered = review.issuance === ISSUANCE_UNKNOWN ? 'issuance not answered - read the FA lines before ticketing or refunding' : null;
    const reason = [review.reason || 'flagged for review', retimed?.reason, unanswered].filter(Boolean).join('; ');
    return { kind: 'review', reason, since: review.at || null };
  }
  // Not flagged, but the airline holds seats against a payment and no ticket was
  // ever issued: the alarm announces these too.
  if (paymentOf(booking) === 'paid' && details?.pnr && details?.gds?.ticketed === false) {
    return { kind: 'not_ticketed', reason: 'PNR committed, never ticketed', since: null };
  }
  return null;
}

/** The sentence the panel puts on the row. */
export const attentionLabel = (attention) => {
  if (!attention) return null;
  if (attention.kind === 'unrecorded_cancellation') return 'Cancelled, but not recorded';
  if (attention.kind === 'cancel_failed') return 'Cancel failed at the airline';
  if (attention.kind === 'airline_refund') return 'Refund to claim from the airline';
  if (attention.kind === 'not_ticketed') return 'Paid, seats held, no ticket';
  if (attention.kind === 'schedule_changed') return 'Airline changed the schedule';
  if (attention.kind === 'held_ticketed') return 'Ticketed, customer not sent it';
  return 'Flagged for review';
};
