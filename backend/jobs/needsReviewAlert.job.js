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

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 60 * 1000;      // let the app finish booting first

const log = (msg, extra = {}) => console.log(`[NeedsReviewAlert] ${msg}`, extra);

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
    const details = booking?.booking_details || {};
    const review = details.needs_review;
    if (!review) return false;                    // never flagged
    if (review.alerted_at) return false;          // already announced once

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

    return true;
  });
}

/** One line per booking. No passenger data: alerts get forwarded around. */
export function describeBooking(booking) {
  const details = booking.booking_details || {};
  const review = details.needs_review || {};
  const hours = Math.round((Date.now() - Date.parse(review.at || booking.created_at)) / 36e5);
  return [
    `*${booking.booking_reference}* — ${booking.status}/${booking.payment_status}, ${booking.total_amount} USD`,
    `PNR ${details.pnr || 'none'} · ticketed: ${review.ticketed === true ? 'yes' : 'NO'}`,
    `reason: ${review.reason || 'unknown'} · flagged ${hours}h ago`,
  ].join('\n');
}

export function buildMessage(bookings) {
  return [
    `:rotating_light: *${bookings.length} booking${bookings.length > 1 ? 's' : ''} paid but not ticketed*`,
    'The customer has paid and holds a PNR, but no ticket was issued. These need manual ticketing.',
    '',
    ...bookings.map(describeBooking),
  ].join('\n\n');
}

async function postToSlack(text, webhookUrl) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(15_000),
  });
  // A Slack webhook answers with the literal string "ok"; anything else means
  // the message did not land, and the bookings must stay unmarked so the next
  // run tries again.
  const body = (await response.text()).trim();
  if (!response.ok || body !== 'ok') {
    throw new Error(`Slack webhook refused the message (${response.status}): ${body.slice(0, 200)}`);
  }
}

/** Stamp the bookings so the next run stays quiet about them. */
async function markAlerted(bookings) {
  for (const booking of bookings) {
    const details = booking.booking_details || {};
    const updated = {
      ...details,
      needs_review: { ...(details.needs_review || {}), alerted_at: new Date().toISOString() },
    };
    const { error } = await supabase
      .from('bookings')
      .update({ booking_details: updated })
      .eq('booking_reference', booking.booking_reference);
    if (error) log('announced but could not mark', { booking: booking.booking_reference, error: error.message });
  }
}

export async function runOnce({ webhookUrl = process.env.ALERT_SLACK_WEBHOOK_URL, dryRun = false } = {}) {
  // A dry run asks the database what it would say and stops there, so it needs
  // no webhook - that is the whole point of being able to check by hand from a
  // laptop that has no production secrets.
  if (!webhookUrl && !dryRun) return { skipped: 'no ALERT_SLACK_WEBHOOK_URL' };

  const { data, error } = await supabase
    .from('bookings')
    .select('booking_reference, status, payment_status, total_amount, created_at, booking_details')
    .not('booking_details->needs_review', 'is', null)
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
