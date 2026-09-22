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
 * field that still tells the truth, and this reads it. (The cancel paths have
 * since stopped: a refused refund now leaves the row `paid`. Rows written
 * before still read refunded, and the message says so only of those.)
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
import {
  REFUND_NOT_RETURNED_ACTIONS, describeRefundOwed, refundNotReturnedOf, refundOwedOf,
} from '../../shared/reviewQueue.js';

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
// Staggered behind the needs-review job so two alarms waking at once cannot
// arrive as one indistinguishable burst.
const FIRST_RUN_DELAY_MS = 90 * 1000;

const log = (msg, extra = {}) => console.log(`[PaymentFailureAlert] ${msg}`, extra);

/**
 * Every branch of the ARC Pay cancel path that ends without returning money.
 * Kept in shared/reviewQueue.js with the rule below, so the desk lists what
 * this announces.
 */
export const FAILED_PAYMENT_ACTIONS = REFUND_NOT_RETURNED_ACTIONS;

/**
 * Which cancelled bookings still owe the customer money, and have not been
 * announced yet.
 *
 * Exported and pure so the decision can be tested without a database - it is
 * the part that decides whether this channel stays trusted or gets muted. The
 * rule itself is shared/reviewQueue.js refundNotReturnedOf, which the desk's
 * "Needs attention" list reads too: it used to be written here alone, and the
 * desk never listed a refund ARC Pay refused.
 *
 * @param {Array<object>} rows - booking rows carrying `booking_details`
 * @returns {Array<object>} the rows worth announcing
 */
export function selectUnrefunded(rows = []) {
  return rows.filter((booking) => {
    if (!booking?.booking_details) return false;                        // the rule reads the row's own column only
    const cancellation = refundNotReturnedOf(booking);
    return Boolean(cancellation) && !cancellation.alerted_at;           // announced once
  });
}

/**
 * A failed refund whose row says the money went back.
 *
 * What the header describes, and what used to be every failed refund. Both
 * cancel paths now leave the charge where it was - `paid` - after a refund
 * ARC Pay refused, and telling staff that row "is not what happened" had them
 * distrust the one field that was right.
 */
const readsRefunded = (booking) => ['refunded', 'partially_refunded'].includes(String(booking.payment_status || '').toLowerCase());

/**
 * One line per booking. No passenger data: alerts get forwarded around.
 *
 * With what is owed: the whole payment was the only figure here, and a cancel
 * that meant to keep its fee had the fee refunded by hand too.
 */
export function describeFailure(booking) {
  const cancellation = booking.booking_details?.cancellation || {};
  const hours = Math.round(
    (Date.now() - Date.parse(cancellation.cancelledAt || booking.created_at)) / 36e5,
  );
  const reason = String(cancellation.reason || '').slice(0, 80);
  const owed = describeRefundOwed(refundOwedOf(booking));
  return [
    `*${booking.booking_reference}* — ${booking.total_amount} USD taken, ${cancellation.refundAmount ?? 0} returned`,
    ...(owed ? [owed] : []),
    `${cancellation.paymentAction} · the row reads ${booking.status}/${booking.payment_status}${readsRefunded(booking) ? ', which is not what happened' : ''}`,
    `cancelled ${hours}h ago${reason ? ` · ${reason}` : ''}`,
  ].join('\n');
}

/** What the failed section says of its rows, as true of each as it is of all. */
function failedLead(failed) {
  const storedAsRefunded = failed.filter(readsRefunded).length;
  if (storedAsRefunded === 0) return 'ARC Pay did not return the money. These need refunding by hand.';
  if (storedAsRefunded === failed.length) {
    return 'ARC Pay did not return the money, but the booking is stored as refunded, so nothing else will ever flag it. These need refunding by hand.';
  }
  const many = storedAsRefunded > 1;
  return `ARC Pay did not return the money, and ${storedAsRefunded} of them ${many ? 'are' : 'is'} stored as refunded, `
    + `so nothing else will ever flag ${many ? 'them' : 'it'}. These need refunding by hand.`;
}

/**
 * The review flag the cancel wrote with its cancellation record, if any.
 *
 * Not every flag with source 'cancellation' on top is this cancel's. A fallback
 * cancel the airline carried out (flight.routes.js DELETE /order) writes a
 * cancellation and no flag, so an earlier cancel the airline REFUSED stayed on
 * top, and its "refund withheld to avoid paying out against a live booking"
 * was printed as why this one held the refund. A refused cancel never writes a
 * cancellation (cancelFailed), and the cancel's own flag is written with its
 * cancellation, at the same moment - never before it. A flag with no time
 * recorded is taken as the cancel's, as it always was.
 */
function cancelReviewOf(booking) {
  const details = booking.booking_details || {};
  const review = details.needs_review;
  if (review?.source !== 'cancellation' || review.cancelFailed) return null;
  if (Date.parse(review.at) < Date.parse(details.cancellation?.cancelledAt)) return null;
  return review;
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
  const reason = cancelReviewOf(booking)?.reason || details.cancellation?.basis || details.cancellation?.reason || 'no reason was recorded';
  return String(reason).slice(0, 240);
}

// How returnFlightPayment began its review reason when it had sent a reversal,
// or was about to, and heard nothing back. Rows cancelled before it recorded
// `reversalOutcomeUnknown` say so only here.
const OUTCOME_UNKNOWN_REASONS = ['automatic reversal ended ', 'refund request did not complete: '];

/**
 * A refund left for review because ARC Pay's answer never came back - the
 * reversal threw mid-request, or found the order already reversed - rather
 * than one the cancel held on purpose. The money may already be back.
 */
function reversalOutcomeUnknown(booking) {
  const cancellation = booking.booking_details?.cancellation || {};
  if (cancellation.paymentAction !== 'REFUND_UNDER_REVIEW') return false;
  if (cancellation.reversalOutcomeUnknown === true) return true;
  const reason = String(cancelReviewOf(booking)?.reason || '');
  return OUTCOME_UNKNOWN_REASONS.some((prefix) => reason.startsWith(prefix));
}

const hoursSinceCancelled = (booking) => Math.round(
  (Date.now() - Date.parse(booking.booking_details?.cancellation?.cancelledAt || booking.created_at)) / 36e5,
);

/** One line per held refund. Nothing failed here, and the row does not lie. */
export function describeHeld(booking) {
  return [
    `*${booking.booking_reference}* — ${booking.total_amount} USD taken, nothing returned yet`,
    `held because: ${heldReasonOf(booking)}`,
    `cancelled ${hoursSinceCancelled(booking)}h ago · the row reads ${booking.status}/${booking.payment_status}`,
  ].join('\n');
}

/** One line per refund whose outcome is unknown. Not "nothing returned": that is the open question. */
export function describeOutcomeUnknown(booking) {
  return [
    `*${booking.booking_reference}* — ${booking.total_amount} USD taken, whether any went back is not known`,
    `the cancel recorded: ${heldReasonOf(booking)}`,
    `cancelled ${hoursSinceCancelled(booking)}h ago · the row reads ${booking.status}/${booking.payment_status}`,
  ].join('\n');
}

const countOf = (bookings) => `${bookings.length} cancelled booking${bookings.length > 1 ? 's' : ''}`;
const totalOf = (bookings) => bookings.reduce((sum, b) => sum + (Number(b.total_amount) || 0), 0).toFixed(2);
/** What the failed rows owe back, the fees their cancels kept left out. */
const owedTotalOf = (bookings) => bookings
  .reduce((sum, b) => sum + (refundOwedOf(b)?.owed ?? (Number(b.total_amount) || 0)), 0).toFixed(2);

export function buildMessage(bookings) {
  // REFUND_UNDER_REVIEW is not a refund that failed: the cancel refused to move
  // money it could not tell was owed - a ticket the airline may still hold, a
  // fare whose rules decide the amount - and the row, cancelled/paid, says so.
  // Told "these need refunding by hand", staff would refund what may be a live
  // ticket. It gets its own section, and the reason it was held.
  //
  // The same code also closes a reversal that was sent and never answered. That
  // is not a hold: "nothing was refunded, on purpose" is false there, and the
  // first thing to learn is whether ARC Pay moved the money - refunded again
  // by hand, the customer would be paid twice. It gets a section of its own.
  const underReview = bookings.filter((b) => b.booking_details?.cancellation?.paymentAction === 'REFUND_UNDER_REVIEW');
  const unknown = underReview.filter(reversalOutcomeUnknown);
  const held = underReview.filter((b) => !unknown.includes(b));
  const failed = bookings.filter((b) => !underReview.includes(b));
  const sections = [];
  if (failed.length) {
    sections.push(
      `:money_with_wings: *${countOf(failed)} where the refund never went through* — ${totalOf(failed)} USD taken, ${owedTotalOf(failed)} USD owed`,
      failedLead(failed),
      '',
      ...failed.map(describeFailure),
    );
  }
  if (unknown.length) {
    if (sections.length) sections.push('');
    sections.push(
      `:grey_question: *${countOf(unknown)} whose refund may or may not have gone through* — ${totalOf(unknown)} USD taken`,
      'The cancel asked ARC Pay to return the money and never learned how that ended. '
        + 'Check the order in ARC Pay before anything else: open Finish refund on the desk and press Check ARC Pay '
        + '(Sync from ARC in the admin panel), which records what ARC Pay shows. Refund by hand only what it still holds.',
      '',
      ...unknown.map(describeOutcomeUnknown),
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
