/**
 * Announce cancellations where the customer's money never went back.
 *
 * When a booking is cancelled, `handleCancelBookingAction` asks ARC Pay to
 * refund or void, then records the outcome in
 * `booking_details.cancellation.paymentAction` (payment/operations.handlers.js).
 * The successful outcomes - PARTIAL_REFUND, VOID, NO_REFUND_FEE_COVERS - also
 * write to the `payments` row. The failures write nothing but a console line.
 *
 * Worse, the booking row that follows a failed refund is labelled
 * `partially_refunded`, because the status is chosen from whether a payment
 * action was *attempted*, not whether it *worked*:
 *
 *     payment_status: cancellationResult.paymentProcessed ? ... : ...
 *
 * So a customer who cancelled and was never paid back appears, in the database
 * and in the admin panel, to have been refunded. Nothing in the product ever
 * says otherwise. That is the gap this closes: `paymentAction` is the only
 * field that still tells the truth, and this reads it.
 *
 * Runs inside the API process next to the paid-but-not-ticketed watch, and
 * delivers through the same webhook. Asleep without one.
 */
import supabase from '../config/supabase.js';
import { unchangedSince } from '../utils/bookingDetailsGuard.js';
import { postToSlack } from './slackAlert.js';
import { readEveryCandidate } from './alarmCandidates.js';
import { alarmsMayRun } from './needsReviewAlert.job.js';
import { queueEnvironment } from '../utils/queueEnvironment.js';

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
// Staggered behind the needs-review job so two alarms waking at once cannot
// arrive as one indistinguishable burst.
const FIRST_RUN_DELAY_MS = 90 * 1000;

const log = (msg, extra = {}) => console.log(`[PaymentFailureAlert] ${msg}`, extra);

/**
 * Every branch of the ARC Pay cancel path that ends without returning money.
 *
 * Taken from the handler rather than from observed data: only REFUND_FAILED has
 * happened so far, and an alarm that only knows about the failure it has
 * already seen is worth very little.
 */
export const FAILED_PAYMENT_ACTIONS = [
  'REFUND_FAILED',           // ARC Pay refused the refund
  'VOID_FAILED',             // ARC Pay refused the void
  'VOID_MISSING_TXN_ID',     // nothing to void against; not even attempted
  'MANUAL_PROCESS_REQUIRED', // the handler threw mid-refund
  // Not attempted, on purpose: a flight whose fare or tickets leave the amount
  // to a person (payment/operations.handlers.js decideFlightRefund). Nothing
  // else pages about it - the needs-review watch skips cancelled bookings - so
  // without this it is money owed that nobody is told about.
  'REFUND_UNDER_REVIEW',
];

/**
 * Which cancelled bookings still owe the customer money.
 *
 * Exported and pure so the decision can be tested without a database - it is
 * the part that decides whether this channel stays trusted or gets muted.
 *
 * @param {Array<object>} rows - booking rows carrying `booking_details`
 * @returns {Array<object>} the rows worth announcing
 */
export function selectUnrefunded(rows = []) {
  return rows.filter((booking) => {
    const cancellation = booking?.booking_details?.cancellation;
    if (!cancellation) return false;                                    // never cancelled
    if (cancellation.alerted_at) return false;                          // already announced once
    if (!FAILED_PAYMENT_ACTIONS.includes(cancellation.paymentAction)) return false;

    // Nothing was ever taken, so there is nothing to give back. Older rows
    // (HTLMR07MJV4, cancelled/unpaid) carry a cancellation with no action at
    // all and must not be announced.
    if (!(Number(booking.total_amount) > 0)) return false;

    // Someone refunded it by hand afterwards and recorded the amount.
    if (Number(cancellation.refundAmount) > 0) return false;

    return true;
  });
}

/** One line per booking. No passenger data: alerts get forwarded around. */
export function describeFailure(booking) {
  const cancellation = booking.booking_details?.cancellation || {};
  const hours = Math.round(
    (Date.now() - Date.parse(cancellation.cancelledAt || booking.created_at)) / 36e5,
  );
  const reason = String(cancellation.reason || '').slice(0, 80);
  return [
    `*${booking.booking_reference}* — ${booking.total_amount} USD taken, ${cancellation.refundAmount ?? 0} returned`,
    `${cancellation.paymentAction} · the row reads ${booking.status}/${booking.payment_status}, which is not what happened`,
    `cancelled ${hours}h ago${reason ? ` · ${reason}` : ''}`,
  ].join('\n');
}

/**
 * Why the cancel held the refund, as it recorded it.
 *
 * The cancel's own review flag carries the fullest reason - the decision and
 * anything the payment step added, such as a reversal that ended unknown - and
 * `basis` is the decision alone. A fallback cancel writes neither, only why it
 * was cancelled.
 */
function heldReasonOf(booking) {
  const details = booking.booking_details || {};
  const review = details.needs_review?.source === 'cancellation' ? details.needs_review.reason : null;
  const reason = review || details.cancellation?.basis || details.cancellation?.reason || 'no reason was recorded';
  return String(reason).slice(0, 240);
}

/** One line per held refund. Nothing failed here, and the row does not lie. */
export function describeHeld(booking) {
  const cancellation = booking.booking_details?.cancellation || {};
  const hours = Math.round(
    (Date.now() - Date.parse(cancellation.cancelledAt || booking.created_at)) / 36e5,
  );
  return [
    `*${booking.booking_reference}* — ${booking.total_amount} USD taken, nothing returned yet`,
    `held because: ${heldReasonOf(booking)}`,
    `cancelled ${hours}h ago · the row reads ${booking.status}/${booking.payment_status}`,
  ].join('\n');
}

const countOf = (bookings) => `${bookings.length} cancelled booking${bookings.length > 1 ? 's' : ''}`;
const totalOf = (bookings) => bookings.reduce((sum, b) => sum + (Number(b.total_amount) || 0), 0).toFixed(2);

export function buildMessage(bookings) {
  // REFUND_UNDER_REVIEW is not a refund that failed: the cancel refused to move
  // money it could not tell was owed - a ticket the airline may still hold, a
  // fare whose rules decide the amount - and the row, cancelled/paid, says so.
  // Told "these need refunding by hand", staff would refund what may be a live
  // ticket. It gets its own section, and the reason it was held.
  const held = bookings.filter((b) => b.booking_details?.cancellation?.paymentAction === 'REFUND_UNDER_REVIEW');
  const failed = bookings.filter((b) => !held.includes(b));
  const sections = [];
  if (failed.length) {
    sections.push(
      `:money_with_wings: *${countOf(failed)} where the refund never went through* — ${totalOf(failed)} USD`,
      'ARC Pay did not return the money, but the booking is stored as refunded, so nothing else will ever flag it. These need refunding by hand.',
      '',
      ...failed.map(describeFailure),
    );
  }
  if (held.length) {
    if (sections.length) sections.push('');
    sections.push(
      `:hourglass_flowing_sand: *${countOf(held)} whose refund is held for a person to decide* — ${totalOf(held)} USD taken`,
      'Nothing was refunded, on purpose: the cancel could not tell what is owed. Check the tickets with the airline first, then decide what goes back and record it on the desk.',
      '',
      ...held.map(describeHeld),
    );
  }
  return sections.join('\n\n');
}

/**
 * Stamp the bookings so the next run stays quiet about them.
 *
 * The stamp is written onto the whole booking_details column, so it is pinned
 * to the row this run read (unchangedSince). Unpinned, a stamp built from that
 * copy could undo whatever landed while Slack was being posted to - a refund
 * the desk finished, a review flag, a cancellation record. A stamp that loses
 * the race is simply not written: the next run reads the booking again, and
 * says nothing if the refund has since been made.
 */
export async function markAlerted(bookings) {
  for (const booking of bookings) {
    const details = booking.booking_details || {};
    const updated = {
      ...details,
      cancellation: { ...(details.cancellation || {}), alerted_at: new Date().toISOString() },
    };
    const query = supabase
      .from('bookings')
      .update({ booking_details: updated })
      .eq('booking_reference', booking.booking_reference);
    const { data, error } = await unchangedSince(query, booking).select('booking_reference');
    if (error) log('announced but could not mark', { booking: booking.booking_reference, error: error.message });
    else if (!data?.length) log('booking changed while announcing; not marked', { booking: booking.booking_reference });
  }
}

export async function runOnce({ webhookUrl = process.env.ALERT_SLACK_WEBHOOK_URL, dryRun = false } = {}) {
  // A dry run asks the database what it would say and stops there, so it needs
  // no webhook and no production secrets.
  if (!webhookUrl && !dryRun) return { skipped: 'no ALERT_SLACK_WEBHOOK_URL' };

  // Every page, not the first: a refund that worked is never stamped, so it
  // stays in this set, and a first page of 200 of them hid every failed refund
  // behind it (alarmCandidates.js).
  const { data, error } = await readEveryCandidate(() => supabase
    .from('bookings')
    .select('booking_reference, status, payment_status, total_amount, created_at, booking_details')
    .not('booking_details->cancellation', 'is', null)
    // Every cancellation keeps its record for years. Without this the 200 oldest
    // were read every run, and once 200 existed a failed refund was never seen.
    .is('booking_details->cancellation->>alerted_at', null)
    .order('created_at', { ascending: true }), log);

  if (error) throw new Error(`could not read bookings: ${error.message}`);

  const unrefunded = selectUnrefunded(data || []);
  if (unrefunded.length === 0) return { announced: 0 };

  const message = buildMessage(unrefunded);

  // Nothing sent, nothing stamped: a booking is announced exactly once, and a
  // dry run must not be what spends it.
  if (dryRun) {
    return {
      announced: 0,
      dryRun: true,
      wouldAnnounce: unrefunded.map((b) => b.booking_reference),
      message,
    };
  }

  await postToSlack(message, webhookUrl);
  await markAlerted(unrefunded);
  log(`announced ${unrefunded.length} booking(s)`, { refs: unrefunded.map((b) => b.booking_reference) });
  return { announced: unrefunded.length };
}

export function startPaymentFailureAlertJob({ intervalMs = DEFAULT_INTERVAL_MS, env = process.env } = {}) {
  if (!supabase) return { stop: () => {} };

  if (!env.ALERT_SLACK_WEBHOOK_URL) {
    log('asleep: set ALERT_SLACK_WEBHOOK_URL to turn on failed-refund alerts');
    return { stop: () => {} };
  }

  // Production only, unless asked for by name - the same rule, and the same
  // reason, as the paid-but-not-ticketed alarm (alarmsMayRun): a laptop
  // stamping `alerted_at` on production's failed refunds silences them there.
  if (!alarmsMayRun(env)) {
    log(`asleep: this is '${queueEnvironment(env)}', not production (set ALERT_JOBS=true to run it here)`);
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
