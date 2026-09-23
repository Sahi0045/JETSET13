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

import { REFUND_REVIEW_ACTIONS, REFUND_STUCK_ACTIONS } from './cancellationOutcome.js';

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
 * The flag on a paid reservation the airline holds and nobody has ticketed:
 * the one the paid-not-ticketed alarm writes on a booking it announces, and
 * the desk on a commit it found held (flight.routes.js recordHeldAtAirline).
 * The alarm's own constant (needsReviewAlert.job.js UNTICKETED_REVIEW_REASON);
 * here so the customer's pages can read it too, and a test keeps the two equal.
 */
export const UNTICKETED_REVIEW_REASON = 'PNR committed, never ticketed';

/**
 * Whether the flag on top of a booking says it is waiting on its ticket and
 * nothing else: held for staff after a later step failed (isHeldForReview), or
 * a paid reservation never ticketed (UNTICKETED_REVIEW_REASON). A later flag on
 * top - a cancel the airline refused, say - is something else for a person to
 * do. Whether the airline holds a seat for it is the reader's to check: a
 * commit that never answered carries a held flag and has no PNR.
 */
export const isAwaitingTicketOnly = (booking) => {
  const review = topFlagOf(booking);
  return Boolean(review) && (review.reason === UNTICKETED_REVIEW_REASON || isHeldForReview(review));
};

/**
 * The flag on a TICKETED booking that still needs a person, or null.
 *
 * "Ticketed, so done" holds for most flags - the ticket turned up later, by
 * retry or by hand - and the desk and the alarm skip those. Not for these two:
 *
 *  - held after the ticket was issued: the customer was never sent their
 *    e-ticket. Skipped as done, nobody sent it (ticket sync now does, and
 *    marks the flag handled). Only when the flag itself says the ticket was
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
  return heldAfterIssueOf(booking) ?? scheduleChangeOf(booking);
}

/**
 * The order route's hold on a booking whose ticket was already issued
 * (flagForReview writes `ticketed: true`), on top and unresolved, or null.
 *
 * The desk, the alarm and ticket sync read it: ticket sync reads such a
 * booking's numbers from the PNR, records them and sends the e-ticket, which
 * is everything the hold asks of a person.
 */
export function heldAfterIssueOf(booking) {
  const review = topFlagOf(booking);
  return review && !review.resolved_at && review.ticketed === true && isHeldForReview(review) ? review : null;
}

/**
 * That hold, for what the customer is told: its ticket was issued, whether or
 * not its number has reached us. On top or under a later flag, resolved or
 * not - a person dealing with the booking does not un-issue its ticket, as
 * ticketNumbersMissingOf reads it. Null once a cancel voided any ticket on the
 * booking, as the order route's ALREADY_BOOKED answer reads gds.ticketed.
 *
 * The customer's pages read only ticket numbers and the chain's numbers flag,
 * and this booking has neither: every one said no ticket was issued - "not a
 * ticket", "Ticket not yet issued" - while the desk and a retry of the order
 * said it was.
 */
export const ticketIssuedBeforeHoldOf = (booking) => (voidedTicketsOf(booking).length > 0 ? null
  : flagInForce(booking, (review) => review.ticketed === true && isHeldForReview(review), { pastResolved: true }));

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

/** flagUnrecordedCancellation's flag (payment/operations.handlers.js). */
const isUnrecordedCancellationFlag = (review) => review.source === 'cancellation' && review.unrecorded === true;

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
  return flagInForce(booking, isUnrecordedCancellationFlag);
}

/**
 * The unrecorded-cancellation flag, for what the customer is told: read past a
 * resolved flag too, until the booking is recorded cancelled; or null.
 *
 * The flag records a fact about the airline record - the reservation
 * released, the tickets voided, the money moved - as well as a job for a
 * person. "Mark as handled" says a person dealt with it, not that any of that
 * was undone, and it is refused nothing: with the booking left confirmed, a
 * reload of the order page was answered ALREADY_BOOKED and ticketed with the
 * void number ("Booking Confirmed!"), and every booking read offered its
 * E-Ticket again. Only the booking can say otherwise, and the record it keeps
 * of that is its status.
 *
 * The customer's answers and pages only. The desk list and the alarm read
 * unrecordedCancellationOf: a person resolving the flag takes it off them.
 */
export const unrecordedCancellationForCustomerOf = (booking) => (statusOf(booking) === 'cancelled' ? null
  : flagInForce(booking, isUnrecordedCancellationFlag, { pastResolved: true }));

/**
 * What a cancel that went through and could not be recorded did with the
 * money, for a booking since recorded cancelled by hand: the cancellation
 * record it could not write, taken from its flag; or null.
 *
 * Modify Status records it cancelled (shared/bookingStatusChange.js) and
 * writes the status alone: no cancellation record, and payment_status as the
 * cancel left it - 'paid', though the cancel voided or refunded the payment.
 * Read from the row, the customer's pages said "Refund pending", "Not refunded
 * yet" and "Refunded To Your Card $0.00" of money that had gone back. The flag
 * says what the cancel did (flagUnrecordedCancellation's paymentAction and
 * refundAmount). Read past a resolved flag, as the customer's pages read it,
 * and only while the booking has no cancellation record of its own.
 */
export function cancellationRecordedByHandOf(booking) {
  if (statusOf(booking) !== 'cancelled' || booking?.cancellation || detailsOf(booking)?.cancellation) return null;
  const flag = flagInForce(booking, isUnrecordedCancellationFlag, { pastResolved: true });
  if (!flag?.paymentAction) return null;
  return {
    paymentAction: flag.paymentAction,
    refundAmount: Number(flag.refundAmount) || 0,
    cancelledAt: flag.at ?? null,
    amadeusCancelled: flag.amadeusCancelled ?? null,
    ticketsVoided: flag.ticketsVoided ?? null,
    recordedByHand: true,
  };
}

/** flagUnrecordedCancellation's words for a cancel that released the reservation. */
const RELEASED_REASON = 'airline reservation released';

/** Whether a flag records the airline holding the booking: held, or never ticketed. */
const recordsHold = (review) => review.outcome === 'held' || review.reason === UNTICKETED_REVIEW_REASON || isHeldForReview(review);

/**
 * The unrecorded-cancellation flag whose own cancel released `reservation`,
 * with nothing recorded since that says the airline holds it; or null. Read
 * past a resolved flag, as the customer's pages read it.
 *
 * What lets staff record such a booking cancelled by hand
 * (shared/bookingStatusChange.js). The flag says a cancel happened, not what
 * it released: one that found no reservation - a commit that never answered -
 * says "no airline reservation", and a record locator the desk writes after it
 * (flight.routes.js recordHeldAtAirline) is live. So the flag must name this
 * reservation (`amadeusCancelled` and `pnr`; a flag stored before says so only
 * in its text), and above it may sit only a later cancel of the same
 * reservation that the airline refused - it was already released - and that a
 * person has looked at.
 */
export function unrecordedCancellationReleasing(booking, reservation) {
  if (!reservation || statusOf(booking) === 'cancelled') return null;
  const flags = flagsInForce(booking, { pastResolved: true });
  const at = flags.findIndex(isUnrecordedCancellationFlag);
  if (at < 0) return null;
  const flag = flags[at];
  const released = typeof flag.amadeusCancelled === 'boolean'
    ? flag.amadeusCancelled && flag.pnr === reservation
    : String(flag.reason || '').includes(RELEASED_REASON);
  if (!released || recordsHold(flag)) return null;
  const settledRetry = (review) => review.cancelFailed === true && Boolean(review.resolved_at) && review.pnr === reservation;
  return flags.slice(0, at).every(settledRetry) ? flag : null;
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
 * The refused cancel while the desk lists it ("Cancel failed at the airline"),
 * or null: for what the customer is told.
 *
 * The cancel answered them "We could not cancel your reservation with the
 * airline. Our team has been alerted and will complete it", and nobody issues
 * a ticket on it after that. No customer page read it, so a held reservation
 * went on promising one: "Our team is working on it", "We will email your
 * e-ticket once it is issued".
 *
 * The desk's own rule (attentionOf), so the customer hears the cancellation is
 * being completed exactly while the desk has it to complete: not once a person
 * resolved it, not over a cancellation carried out and not recorded, and not
 * once a later cancel went through.
 */
export const openFailedCancellationOf = (booking) => (attentionOf(booking)?.kind === 'cancel_failed'
  ? detailsOf(booking).needs_review : null);

/**
 * Every way a cancellation ends with the customer's money still at the gateway
 * and a person needed to return it. Taken from the cancel paths' branches
 * rather than from what has been seen, since only REFUND_FAILED has happened so
 * far:
 *  - REFUND_FAILED, VOID_FAILED: ARC Pay refused the refund or the void;
 *  - VOID_MISSING_TXN_ID: nothing to void against, not even attempted;
 *  - MANUAL_PROCESS_REQUIRED: the handler threw mid-refund;
 *  - REFUND_UNDER_REVIEW: not attempted on purpose - the fare or the tickets
 *    leave the amount to a person (payment/operations.handlers.js
 *    decideFlightRefund), a fallback cancel that tried no refund - or a
 *    reversal sent and never answered (reversalOutcomeUnknown), where it may
 *    not be owed at all.
 */
export const REFUND_NOT_RETURNED_ACTIONS = Object.freeze([...REFUND_STUCK_ACTIONS, ...REFUND_REVIEW_ACTIONS]);

/**
 * A cancel's own refund sent to ARC Pay and never answered: REFUND_UNDER_REVIEW
 * with reversalOutcomeUnknown. It may have gone back.
 */
const isUnansweredRefund = (cancellation) => REFUND_REVIEW_ACTIONS.includes(cancellation?.paymentAction)
  && cancellation?.reversalOutcomeUnknown === true;

/**
 * The cancellation record of a booking whose money never went back, or null.
 *
 * The failed-refund alarm's selection (jobs/paymentFailureAlert.job.js
 * selectUnrefunded), here so the desk lists exactly what it announces.
 */
export function refundNotReturnedOf(booking) {
  const cancellation = detailsOf(booking)?.cancellation;
  if (!cancellation || !REFUND_NOT_RETURNED_ACTIONS.includes(cancellation.paymentAction)) return null;
  // Nothing was ever taken, so there is nothing to give back. Older rows
  // (HTLMR07MJV4, cancelled/unpaid) carry a cancellation with no action at all.
  if (!(Number(booking?.total_amount ?? booking?.totalAmount) > 0)) return null;
  // Someone refunded it by hand afterwards and recorded the amount.
  if (Number(cancellation.refundAmount) > 0) return null;
  return cancellation;
}

const roundCents = (value) => Math.round(Number(value) * 100) / 100;

/**
 * The fee a cancel decided to keep when it decided what goes back, or null
 * when nothing decided an amount.
 *
 *  - a refund or void that did not go through (REFUND_STUCK_ACTIONS), or one
 *    sent and never answered (REFUND_UNDER_REVIEW with reversalOutcomeUnknown):
 *    the cancel worked out the refund and recorded the fee it keeps as
 *    `cancellationFee`. Not knowing whether the unanswered one landed does not
 *    change what was decided; if it never did, the fee is still kept;
 *  - after a refund by hand, `decidedFee` (payment/operations.handlers.js
 *    settleManualFlightRefund carries it over). The settle writes what was kept
 *    SO FAR as `cancellationFee` - 0 while ARC still holds more than the fee -
 *    and read from there the fee was nothing, and went back to the card.
 *
 * A refund held for a person has none, before a refund by hand or after one:
 * what the desk returned is not a decision that the rest is owed.
 */
export function decidedFeeOf(cancellation) {
  if (!cancellation) return null;
  if (cancellation.decidedFee !== undefined && cancellation.decidedFee !== null) {
    const recorded = Number(cancellation.decidedFee);
    return Number.isFinite(recorded) ? roundCents(Math.max(0, recorded)) : null;
  }
  const decided = REFUND_STUCK_ACTIONS.includes(cancellation.paymentAction) || isUnansweredRefund(cancellation);
  if (!decided) return null;
  return roundCents(Math.max(0, Number(cancellation.cancellationFee) || 0));
}

/**
 * What the customer is owed back on a cancellation, as the cancel decided it,
 * or null when nothing decided an amount.
 *
 * What ARC held when the cancel ran, less the fee the cancel decided to keep
 * (decidedFeeOf) and anything refunded since:
 *  - a refund or void that did not go through (REFUND_STUCK_ACTIONS) - the
 *    refund it tried to make. Slack named only the whole payment and the desk
 *    filled that in, so finishing a refund "less the fee" by hand sent the fee
 *    back too;
 *  - one sent and never answered (reversalOutcomeUnknown): what goes back if
 *    ARC Pay shows it never landed. The desk filled in the whole payment here
 *    too, and the office email said to refund everything ARC held;
 *  - the rest of one, after a refund by hand left money at ARC (`stillHeld`),
 *    never more than that.
 *
 * Never what ARC still holds as such: that took the rest of a refund a person
 * was deciding, and a fee a cancel kept, as owed, and one press sent it.
 *
 * `unanswered` when the cancel's own refund was never answered: whoever
 * finishes it checks ARC Pay first.
 *
 * @returns {null | { owed: number, paid: number, fee: number, refunded?: number, unanswered?: true, currency: string }}
 */
export function refundOwedOf(booking) {
  const details = detailsOf(booking);
  const cancellation = details?.cancellation;
  if (!cancellation) return null;
  const fee = decidedFeeOf(cancellation);
  if (fee === null) return null;
  const stillHeld = Number(cancellation.stillHeld) > 0 ? roundCents(cancellation.stillHeld) : 0;
  if (!stillHeld && !REFUND_NOT_RETURNED_ACTIONS.includes(cancellation.paymentAction)) return null;
  const currency = cancellation.currency || details.arc_captured_currency || details.currency || 'USD';
  // The cancel reconciles with ARC first and writes what it holds; a row from
  // before that has the checkout amount only.
  const captured = Number(details.arc_captured_amount);
  const paid = captured > 0 ? captured : Number(booking?.total_amount ?? booking?.totalAmount);
  if (!(paid > 0)) return null;
  const refunded = roundCents(Math.max(0, Number(cancellation.refundAmount) || 0));
  const decided = Math.max(0, roundCents(paid - fee - refunded));
  const owed = stillHeld ? Math.min(decided, stillHeld) : decided;
  if (stillHeld && !(owed > 0)) return null;
  const unanswered = isUnansweredRefund(cancellation);
  return { owed, paid: roundCents(paid), fee, ...(refunded > 0 ? { refunded } : {}), ...(unanswered ? { unanswered } : {}), currency };
}

/**
 * What a Finish refund box starts from: what the cancel decided goes back
 * (refundOwedOf), or nothing.
 *
 * Nothing while the cancel's own refund is unanswered and ARC Pay has not been
 * asked since (`arcChecked`: the page's own Check ARC Pay, or Sync from ARC,
 * found nothing returned). That refund may have landed: on a fare under twice
 * the fee, the decided amount still fits under what ARC holds after it did, so
 * a box filled in before anyone looked invited one press to send it again.
 */
export function refundPrefillOf(booking, { arcChecked = false } = {}) {
  const owed = refundOwedOf(booking);
  if (!owed || (owed.unanswered && !arcChecked)) return '';
  return String(owed.owed);
}

/** The owed amount in words, for the desk and the alarm: "241.00 USD owed (291.00 paid less the 50.00 cancellation fee the cancel kept)". */
export function describeRefundOwed(owed) {
  if (!owed) return null;
  const amount = (value) => Number(value).toFixed(2);
  const less = [
    owed.fee > 0 ? `the ${amount(owed.fee)} cancellation fee the cancel kept` : null,
    owed.refunded > 0 ? `${amount(owed.refunded)} already refunded` : null,
  ].filter(Boolean);
  const basis = less.length ? ` (${amount(owed.paid)} paid less ${less.join(' and ')})` : '';
  return `${amount(owed.owed)} ${owed.currency} owed${basis}`;
}

/** What the desk reads of a refund ARC Pay refused: that nothing went back, and what is owed. */
function refusedRefundReason(booking, cancellation) {
  const owed = describeRefundOwed(refundOwedOf(booking));
  return `the refund did not go through (${cancellation.paymentAction}): nothing has gone back to the customer${owed ? `; ${owed}` : ''}`;
}

/**
 * The two jobs of one desk entry: a customer refund ARC Pay refused, or sent
 * and never answered, under an airline claim flag (attentionOf `jobs`). "Mark
 * as handled" says which one a press handled (resolve-review `job`).
 *
 * One press resolved the claim flag whatever the note said: the entry's kind
 * and time cannot tell the jobs apart - a Finish refund leaves the claim flag
 * open, so they do not change - and a refund note closed an airline claim
 * nobody had made. A claim note closed the refund the same way: one that was
 * never answered, and may never have gone back, left the desk with nobody
 * asked to check ARC Pay.
 */
export const ATTENTION_JOBS = Object.freeze(['refund', 'claim']);

/**
 * "Customer refund handled" on that entry (resolve-review `job: 'refund'`),
 * recorded on the claim flag it leaves open, at or after the cancel - or null.
 */
function refusedRefundHandledOn(review, cancellation) {
  const handled = review?.refundHandled;
  if (!handled?.at) return null;
  return Date.parse(handled.at) < Date.parse(cancellation?.cancelledAt) ? null : handled;
}

/** The customer refund job: one ARC Pay refused, or sent and never answered. */
const isRefundJob = (cancellation) => REFUND_STUCK_ACTIONS.includes(cancellation?.paymentAction) || isUnansweredRefund(cancellation);

/** A customer refund job (isRefundJob) that nobody has handled, or null. */
function openRefundJobOf(booking) {
  const notReturned = refundNotReturnedOf(booking);
  if (!notReturned || !isRefundJob(notReturned)) return null;
  return refusedRefundHandledOn(detailsOf(booking)?.needs_review, notReturned) ? null : notReturned;
}

/** A customer refund ARC Pay refused that nobody has handled, or null. */
function openRefusedRefundOf(booking) {
  const open = openRefundJobOf(booking);
  return open && REFUND_STUCK_ACTIONS.includes(open.paymentAction) ? open : null;
}

/**
 * A flag's words with a customer refund ARC Pay refused said first, for an
 * entry whose flag is about something else - an airline claim, a commit that
 * never answered. A refused refund adds no reason to any flag, so the flag's
 * words were all the desk read, and nobody was told the customer had nothing
 * back. Not once the desk recorded the refund handled.
 */
function withRefusedRefundFirst(booking, reason) {
  const notReturned = openRefusedRefundOf(booking);
  return notReturned ? `${refusedRefundReason(booking, notReturned)}; ${reason}` : reason;
}

/**
 * A cancellation whose money never went back, as the desk lists it, or null.
 *
 * Asked where attentionOf would otherwise call a booking settled: it is
 * cancelled, or its flag was marked handled. The cancel writes no flag when ARC
 * Pay refuses the refund - there is no decision to review and no ticket to
 * claim - and a fallback cancel writes none when it tries no refund at all. So
 * the alarm announced these once, stamped them, and the desk's list never
 * showed them. A refund left for review under the cancel's own flag is listed
 * under that flag, as before, and never reaches here.
 *
 * Marked handled by a person at or after the cancel, it is settled. A flag
 * marked handled before it - a ticket issued by hand, say, and the booking
 * cancelled later - settled something else.
 *
 * The airline claim's flag settles something else too, when ARC Pay refused
 * the refund: handling it claims the tickets' value from the airline, and the
 * flag never named the refusal (a refused refund adds no reason). Marking the
 * claim handled took the customer's unreturned refund off the list. It stays
 * until the refund is recorded, or marked handled - on its own entry (the
 * route writes that over the claim), or as "Customer refund handled" while
 * the claim was open (refusedRefundHandledOn). So does one sent and never
 * answered: the claim flag's reason names it, but the claim's note is about the
 * tickets, and the refund may never have gone back. A refund held on purpose
 * for a person is named by the claim flag's own reason, so resolving that flag
 * still settles it.
 *
 * So does a commit that never answered, resolved with what the airline said:
 * staff may cancel it before anyone knows, a refused refund on that cancel
 * writes no flag, and recording "the airline does not hold it" answered the
 * commit, not the refund.
 */
function refundNotReturnedAttentionOf(booking) {
  const cancellation = refundNotReturnedOf(booking);
  if (!cancellation) return null;
  const review = detailsOf(booking)?.needs_review;
  const refused = REFUND_STUCK_ACTIONS.includes(cancellation.paymentAction);
  const refundJob = isRefundJob(cancellation);
  if (refundJob && refusedRefundHandledOn(review, cancellation)) return null;
  const handledSince = review?.resolved_at && !(Date.parse(review.resolved_at) < Date.parse(cancellation.cancelledAt));
  const settledSomethingElse = needsAirlineRefundClaim(booking) || review?.reason === COMMIT_UNKNOWN_REVIEW_REASON;
  if (handledSince && !(refundJob && settledSomethingElse)) return null;

  const since = cancellation.cancelledAt || null;
  if (refused) return { kind: 'refund_failed', reason: refusedRefundReason(booking, cancellation), since };
  const decided = cancellation.reversalOutcomeUnknown ? describeRefundOwed(refundOwedOf(booking)) : null;
  return {
    kind: 'refund_not_made',
    reason: cancellation.reversalOutcomeUnknown
      ? `the refund was sent to ARC Pay and never answered: check ARC Pay before refunding anything${decided ? `; if none of it went back, ${decided}` : ''}`
      : String(cancellation.basis || cancellation.reason || 'no refund was made'),
    since,
  };
}

/**
 * A commit that never answered, which the desk recorded the airline does not
 * hold (flight.routes.js resolve-review, outcome 'not_held'), on a booking
 * that still holds the payment: nothing cancelled it and nothing returned the
 * money. The flag it returns, or null.
 *
 * The customer paid for a booking that does not exist, and nothing else would
 * ever say so: resolved, the flag read as settled, so the booking left the
 * desk and the needs-review alarm; the failed-refund alarm needs a
 * cancellation, the abandoned-checkout job skips a flagged row, and ticket
 * sync needs a PNR. The whole payment stayed at ARC with nobody told to
 * return it. It is a refund to make until Cancel & refund (or the Payments
 * tab) returns the money, or a person marks that entry handled, which writes
 * a flag of its own on top.
 *
 * Only while the flag on top is that answer: a cancel since has its own
 * record (refundNotReturnedAttentionOf reads what it left owed).
 */
export function notHeldStillPaidOf(booking) {
  const details = detailsOf(booking);
  const review = details?.needs_review;
  if (!review?.resolved_at || review.reason !== COMMIT_UNKNOWN_REVIEW_REASON || review.outcome !== 'not_held') return null;
  if (booking?.pnr || details.pnr || details.cancellation) return null;
  if (['cancelled', 'refunded'].includes(statusOf(booking)) || paymentOf(booking) !== 'paid') return null;
  // Nothing was ever taken, so there is nothing to give back.
  return Number(booking?.total_amount ?? booking?.totalAmount) > 0 ? review : null;
}

/** notHeldStillPaidOf as the desk lists it: a refund nobody has made. */
function notHeldRefundAttentionOf(booking) {
  const review = notHeldStillPaidOf(booking);
  if (!review) return null;
  return {
    kind: 'refund_not_made',
    reason: 'the airline does not hold this booking, and its payment has not been returned: nothing was booked. '
      + 'Cancel & refund it - there is no reservation to release, so the cancel returns the payment',
    since: review.resolved_at,
  };
}

/**
 * What still needs doing on this booking, or null.
 *
 * @returns {null | { kind: 'not_ticketed'|'review'|'airline_refund'|'unrecorded_cancellation'|'cancel_failed'|'schedule_changed'
 *                    |'held_ticketed'|'refund_failed'|'refund_not_made',
 *                    reason: string, since: string|null, tickets?: string[], jobs?: string[] }}
 */
export function attentionOf(booking) {
  const details = detailsOf(booking);
  const review = details?.needs_review || null;
  if (review?.resolved_at) return refundNotReturnedAttentionOf(booking) ?? notHeldRefundAttentionOf(booking);

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
    // A customer refund ARC Pay refused, under the claim: a refused refund adds
    // no reason to the cancel's flag, so the claim's words were all the desk
    // read, and nobody was told the customer had nothing back. Said first, and
    // kept on the list after the claim is handled (refundNotReturnedAttentionOf).
    //
    // Two jobs then, and the entry names them (ATTENTION_JOBS): a press says
    // which one it handled, so a refund note cannot close the claim. So too
    // for a refund sent and never answered, which the claim's reason names
    // already: a claim note cannot close it.
    return {
      kind: 'airline_refund',
      reason: withRefusedRefundFirst(booking, review.reason || 'the refund has to be claimed from the airline'),
      since: review.at || null,
      tickets: review.tickets.map((ticket) => ticket?.number ?? ticket),
      ...(openRefundJobOf(booking) ? { jobs: [...ATTENTION_JOBS] } : {}),
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

  // A commit the airline never answered (commitUnknownOf) stays until a person
  // finds out, whatever happened here since. Staff may cancel it, and the
  // Payments tab may refund it: that settles the money, not whether the
  // airline holds a reservation for it - and a cancelled or refunded booking
  // read as settled took it off the desk, the one place anyone would look.
  //
  // A staff cancel of it whose refund ARC Pay refused writes no flag, so this
  // entry is the refused refund's too: said first, as under an airline claim,
  // and kept on the list once the airline's answer is recorded
  // (refundNotReturnedAttentionOf).
  if (commitUnknownOf(booking)) {
    return { kind: 'review', reason: withRefusedRefundFirst(booking, review.reason || 'flagged for review'), since: review.at || null };
  }

  if (['cancelled', 'refunded'].includes(statusOf(booking))) return refundNotReturnedAttentionOf(booking);
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
    return { kind: 'not_ticketed', reason: UNTICKETED_REVIEW_REASON, since: null };
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
  if (attention.kind === 'refund_failed') return 'Refund did not go through';
  if (attention.kind === 'refund_not_made') return 'Refund not made yet';
  return 'Flagged for review';
};
