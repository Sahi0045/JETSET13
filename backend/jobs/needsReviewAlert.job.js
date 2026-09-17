/**
 * Announce bookings that took money but never produced a ticket.
 *
 * The booking chain deliberately does NOT refund once the PNR is committed: if
 * ticketing fails after that point it keeps the booking, sets
 * `booking_details.needs_review`, and expects a human to finish the ticket by
 * hand (flight.routes.js, the `committed` branch).
 *
 * Nobody was watching that queue. An audit on 2026-09-12 found two bookings -
 * FLTMTPR74L5 (6 Sep) and FLTDE65B4DDB7A44E (11 Sep) - sitting `confirmed` and
 * `paid` with a PNR and no ticket, unnoticed for days. Booking is disabled in
 * production, so today that costs nothing; once it is live, the same silence is
 * a customer holding a worthless confirmation.
 *
 * Runs inside the API process, like the booking-queue worker, so it works
 * wherever the app is deployed with no extra software or second login.
 *
 * Delivery is a Slack incoming webhook (`ALERT_SLACK_WEBHOOK_URL`): one URL in
 * the environment, no SDK, no OAuth. Without it the job stays asleep rather
 * than failing, so a deploy that has not been given a webhook is not a crash.
 */
import supabase from '../config/supabase.js';
import { postToSlack } from './slackAlert.js';
import { unchangedSince } from '../utils/bookingDetailsGuard.js';

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 60 * 1000;      // let the app finish booting first

const log = (msg, extra = {}) => console.log(`[NeedsReviewAlert] ${msg}`, extra);

/**
 * The flag written on an ordinary unticketed reservation this job announces.
 * It describes the booking as the order route left it, not a new problem, so
 * the route still owes that booking its confirmation email
 * (confirmationEmailOwed in routes/flight.routes.js).
 */
export const UNTICKETED_REVIEW_REASON = 'PNR committed, never ticketed';

/**
 * Which flagged bookings actually deserve waking someone up.
 *
 * Exported and pure so it can be tested without a database, and so the manual
 * script (scripts/alerts/needs-review-watch.mjs) and this job cannot drift
 * apart - the filtering is the part that decides whether an alert channel stays
 * trusted or gets muted.
 *
 * @param {Array<object>} rows - booking rows carrying `booking_details`
 * @returns {Array<object>} the rows worth announcing
 */
export function selectUnannounced(rows = []) {
  return rows.filter((booking) => {
    if (!booking) return false;
    const details = booking.booking_details || {};
    const review = details.needs_review;
    if (review?.alerted_at) return false;         // already announced once

    // A cancellation with a refund still to claim from the airline. It is
    // cancelled and ticketed, so both checks below would skip it - and did.
    if (needsAirlineRefundClaim(booking)) return true;

    // The ticket turned up later, by retry or by hand.
    if (details.gds?.ticketed === true) return false;
    if (Array.isArray(details.tickets) && details.tickets.length > 0) return false;

    // Already dealt with: a cancelled or refunded booking has been resolved and
    // nobody needs paging about it. The first dry run flagged FLTMTPRZA5T -
    // cancelled and refunded days earlier - which is exactly the false alarm
    // that gets an alert channel muted.
    const status = String(booking.status || '').toLowerCase();
    const payment = String(booking.payment_status || '').toLowerCase();
    if (['cancelled', 'refunded'].includes(status)) return false;
    if (['refunded', 'partially_refunded', 'reversed'].includes(payment)) return false;

    // Flagged by the chain or by a human: announce.
    if (review) return true;

    // Not flagged, and this is the case that was invisible: the ordinary
    // outcome while AUTO_TICKET is off. The gateway took the money, the chain
    // committed a PNR, issuance never ran, and the row was written `confirmed`
    // with no flag on it. That is a customer holding a reservation on a
    // ticketing deadline, and it was the MAJORITY case this job could not see.
    return details.gds?.ticketed === false && Boolean(details.pnr) && payment === 'paid';
  });
}

/** One line per booking. No passenger data: alerts get forwarded around. */
export function describeBooking(booking) {
  const details = booking.booking_details || {};
  const review = details.needs_review || {};
  const hours = Math.round((Date.now() - Date.parse(review.at || booking.created_at)) / 36e5);
  const ticketed = (review.ticketed ?? details.gds?.ticketed) === true;
  return [
    `*${booking.booking_reference}* — ${booking.status}/${booking.payment_status}, ${booking.total_amount} USD`,
    `PNR ${details.pnr || 'none'} · ticketed: ${ticketed ? 'yes' : 'NO'}`,
    `reason: ${review.reason || UNTICKETED_REVIEW_REASON} · flagged ${hours}h ago`,
    // The GDS's own words, when the chain recorded them. "failed at
    // issueTicket" alone cannot tell a carrier the office may not ticket from
    // missing passenger documents or a code fault.
    ...(review.amadeus
      ? [`Amadeus ${review.amadeus.operation || ''}: ${review.amadeus.message || review.amadeus.code || 'no detail'}`.replace(/\s+:/, ':')]
      : []),
  ].join('\n');
}

/**
 * A cancelled booking whose tickets still hold value with the airline.
 *
 * Tickets past their same-day void window are not voided by the cancel; their
 * value stays with the airline until it is claimed under the fare rules
 * (payment/operations.handlers.js cancelFlightBooking, which lists them on
 * `needs_review.tickets`). That flag was written and never read: this job
 * skipped cancelled rows, and the failed-refund alarm lists only refunds that
 * failed, so the claim reached nobody.
 */
export function needsAirlineRefundClaim(booking) {
  const review = booking?.booking_details?.needs_review;
  return review?.source === 'cancellation' && Array.isArray(review.tickets) && review.tickets.length > 0;
}

/** One line per airline claim. Ticket numbers, never passenger names. */
export function describeAirlineClaim(booking) {
  const details = booking.booking_details || {};
  const review = details.needs_review || {};
  const cancellation = details.cancellation || {};
  const hours = Math.round((Date.now() - Date.parse(review.at || cancellation.cancelledAt || booking.created_at)) / 36e5);
  const tickets = review.tickets || [];
  return [
    `*${booking.booking_reference}* — cancelled, ${booking.payment_status}; customer refund: ${cancellation.paymentAction || 'none recorded'}`,
    `PNR ${details.pnr || 'none'} · ${tickets.length} ticket${tickets.length > 1 ? 's' : ''} to claim: ${tickets.join(', ')}`,
    `flagged ${hours}h ago`,
  ].join('\n');
}

export function buildMessage(bookings) {
  const claims = bookings.filter(needsAirlineRefundClaim);
  const unticketed = bookings.filter((booking) => !needsAirlineRefundClaim(booking));
  const sections = [];
  if (unticketed.length) {
    sections.push(
      `:rotating_light: *${unticketed.length} booking${unticketed.length > 1 ? 's' : ''} paid but not ticketed*`,
      'The customer has paid and no ticket was issued. Each one needs a human: ticket it, or refund it.',
      '',
      ...unticketed.map(describeBooking),
    );
  }
  if (claims.length) {
    sections.push(
      `:airplane_departure: *${claims.length} cancelled booking${claims.length > 1 ? 's' : ''} with a refund to claim from the airline*`,
      'These tickets were past their void window when the booking was cancelled, so the airline still holds their value. '
        + 'Claim each refund under the fare rules.',
      '',
      ...claims.map(describeAirlineClaim),
    );
  }
  return sections.join('\n\n');
}

/**
 * Stamp the bookings so the next run stays quiet about them.
 *
 * This wrote back the copy of each row read before the Slack post, whole, so
 * anything written in between - a running chain's final save, a cancellation
 * record - was undone by an alarm. Each booking is read again, and the stamp
 * written only if nothing that matters has moved since
 * (utils/bookingDetailsGuard.js); a race it loses is read and tried again.
 */
const MARK_TRIES = 3;

async function markAlerted(bookings) {
  for (const booking of bookings) {
    let marked = false;
    let lastError = null;
    for (let tries = 0; tries < MARK_TRIES && !marked; tries += 1) {
      const { data: fresh, error: readError } = await supabase
        .from('bookings')
        .select('status, payment_status, booking_details')
        .eq('booking_reference', booking.booking_reference)
        .single();
      if (readError || !fresh) {
        lastError = readError;
        break;
      }
      const details = fresh.booking_details || {};
      if (details.needs_review?.alerted_at) {
        marked = true;
        break;
      }
      const now = new Date().toISOString();
      // A row announced for the unflagged reason gets a flag written as it is
      // announced, so from here on it is one class: flagged, and stamped.
      const review = details.needs_review
        || { reason: UNTICKETED_REVIEW_REASON, ticketed: false, at: now };
      const { data, error } = await unchangedSince(
        supabase
          .from('bookings')
          .update({ booking_details: { ...details, needs_review: { ...review, alerted_at: now } } })
          .eq('booking_reference', booking.booking_reference),
        fresh,
      ).select('booking_reference');
      if (error) {
        lastError = error;
        break;
      }
      marked = Boolean(data?.length);
    }
    if (!marked) log('announced but could not mark', { booking: booking.booking_reference, error: lastError?.message || 'the booking kept changing' });
  }
}

export async function runOnce({ webhookUrl = process.env.ALERT_SLACK_WEBHOOK_URL, dryRun = false } = {}) {
  // A dry run asks the database what it would say and stops there, so it needs
  // no webhook - that is the whole point of being able to check by hand from a
  // laptop that has no production secrets.
  if (!webhookUrl && !dryRun) return { skipped: 'no ALERT_SLACK_WEBHOOK_URL' };

  // Two shapes of "took money, produced no ticket": rows the chain or a human
  // flagged, and the ordinary outcome while AUTO_TICKET is off - a paid,
  // committed PNR that issuance never touched. The second is the one that
  // was invisible: it carries no flag, only `gds.ticketed: false` and a PNR.
  const { data, error } = await supabase
    .from('bookings')
    .select('booking_reference, status, payment_status, total_amount, created_at, booking_details')
    .or('booking_details->needs_review.not.is.null,and(booking_details->gds->>ticketed.eq.false,booking_details->>pnr.not.is.null)')
    // Announced rows keep their flag, so without this the 200 oldest were read
    // every run: once 200 flagged rows existed, no new one was ever seen.
    .is('booking_details->needs_review->>alerted_at', null)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) throw new Error(`could not read bookings: ${error.message}`);

  const stuck = selectUnannounced(data || []);
  if (stuck.length === 0) return { announced: 0 };

  const message = buildMessage(stuck);

  // Nothing sent, nothing stamped: a booking gets announced exactly once, and a
  // dry run must not be what spends it.
  if (dryRun) {
    return {
      announced: 0,
      dryRun: true,
      wouldAnnounce: stuck.map((b) => b.booking_reference),
      message,
    };
  }

  await postToSlack(message, webhookUrl);
  await markAlerted(stuck);
  log(`announced ${stuck.length} booking(s)`, { refs: stuck.map((b) => b.booking_reference) });
  return { announced: stuck.length };
}

export function startNeedsReviewAlertJob({ intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  if (!supabase) return { stop: () => {} };

  if (!process.env.ALERT_SLACK_WEBHOOK_URL) {
    log('asleep: set ALERT_SLACK_WEBHOOK_URL to turn on paid-but-not-ticketed alerts');
    return { stop: () => {} };
  }

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runOnce();
    } catch (error) {
      log('tick failed', { error: error.message });
    } finally {
      running = false;
    }
  };

  const first = setTimeout(tick, FIRST_RUN_DELAY_MS);
  const timer = setInterval(tick, intervalMs);
  first.unref?.();
  timer.unref?.();
  log(`started - every ${Math.round(intervalMs / 60000)} min`);
  return { stop: () => { clearTimeout(first); clearInterval(timer); }, tick };
}
