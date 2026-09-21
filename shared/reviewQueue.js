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

/** Ticket numbers recorded on a booking. */
export const ticketsOf = (details) => (Array.isArray(details?.tickets) ? details.tickets : [])
  .filter((ticket) => ticket?.number);

/** Whether the airline has issued a ticket, by either of the two records of it. */
export const isTicketed = (details) => details?.gds?.ticketed === true || ticketsOf(details).length > 0;

/**
 * The booking chain's flag on a booking it DID ticket: issuance answered OK,
 * but not every ticket number surfaced in the PNR (bookingChain.js
 * readTicketNumbers). The row is ticketed by definition, so a "ticketed means
 * done" check skipped it - and nobody was ever told to find the numbers.
 */
export const TICKET_NUMBERS_MISSING = 'ticket_numbers_not_retrieved';

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
  const review = detailsOf(booking)?.needs_review;
  return review?.source === 'cancellation' && review.unrecorded === true;
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
 * @returns {null | { kind: 'not_ticketed'|'review'|'airline_refund'|'unrecorded_cancellation'|'cancel_failed',
 *                    reason: string, since: string|null, tickets?: string[] }}
 */
export function attentionOf(booking) {
  const details = detailsOf(booking);
  const review = details?.needs_review || null;
  if (review?.resolved_at) return null;

  // Before anything reads the booking's status or tickets: neither says what
  // happened, which is the point of this flag.
  if (isUnrecordedCancellation(booking)) {
    return {
      kind: 'unrecorded_cancellation',
      reason: review.reason || 'cancellation carried out but not recorded',
      since: review.at || null,
      ...(Array.isArray(review.tickets) && review.tickets.length
        ? { tickets: review.tickets.map((ticket) => ticket?.number ?? ticket) }
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
  if (isTicketed(details) && review?.reason !== TICKET_NUMBERS_MISSING) return null;

  if (review) {
    return { kind: 'review', reason: review.reason || 'flagged for review', since: review.at || null };
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
  return 'Flagged for review';
};
