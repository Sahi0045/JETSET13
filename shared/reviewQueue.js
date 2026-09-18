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
 * What still needs doing on this booking, or null.
 *
 * @returns {null | { kind: 'not_ticketed'|'review'|'airline_refund', reason: string,
 *                    since: string|null, tickets?: string[] }}
 */
export function attentionOf(booking) {
  const details = detailsOf(booking);
  const review = details?.needs_review || null;
  if (review?.resolved_at) return null;

  const tickets = ticketsOf(details);
  // A cancelled booking whose tickets were past the void window: the airline
  // owes the money back and somebody has to claim it. This one IS on a
  // cancelled booking, so it is decided before the cancelled check below.
  if (review?.source === 'cancellation' && tickets.length > 0) {
    return {
      kind: 'airline_refund',
      reason: review.reason || 'the refund has to be claimed from the airline',
      since: review.at || null,
      tickets: tickets.map((ticket) => ticket.number),
    };
  }

  if (['cancelled', 'refunded'].includes(statusOf(booking))) return null;
  if (['refunded', 'partially_refunded', 'reversed'].includes(paymentOf(booking))) return null;
  if (isTicketed(details)) return null;

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
  if (attention.kind === 'airline_refund') return 'Refund to claim from the airline';
  if (attention.kind === 'not_ticketed') return 'Paid, seats held, no ticket';
  return 'Flagged for review';
};
