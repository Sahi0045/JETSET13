/**
 * Durable booking queue worker.
 *
 * When every Amadeus slot stays busy past the booking wait, POST /api/flights/order
 * does not refund the (already paid) customer. It stores the order on the booking
 * row (`booking_details.queued_order`, `gds_chain.state = 'queued'`) and answers
 * 202. This worker picks those rows up and replays each one through that same
 * route once a slot is free, so a queued booking gets exactly the handling a
 * live one does: the payment-coverage guard, the chain, the confirmation email,
 * or the refund.
 *
 * Supabase is the queue, not memory, so a restart or deploy loses nothing: on
 * boot the worker simply finds the rows again. The route's compare-and-set
 * claim on the booking reference is what stops two workers (or a worker and a
 * customer's own retry) running one booking twice.
 */
import supabase from '../config/supabase.js';
import { getWsConfig } from '../services/amadeusSoap/config.js';
import { getSemaphore } from '../services/amadeusSoap/semaphore.js';
import { sendEmail } from '../services/emailService.js';
// The order route's own TTL: a claim older than this was left by a request
// that died, and its booking needs running again.
import {
  AUTO_COMPLETE_WINDOW_MS, CHAIN_CLAIM_TTL_MS as CLAIM_TTL_MS, MAX_QUEUE_ATTEMPTS, liveChainState,
} from '../utils/bookingChainClaim.js';
import { queueEnvironment } from '../utils/queueEnvironment.js';
import { unchangedSince } from '../utils/bookingDetailsGuard.js';
import { isUsableEmail } from '../../shared/email.js';
import { orderDataFromCheckoutRow } from '../../shared/flightOrderBody.js';
const MAX_PER_TICK = 5;

/**
 * How long a booking waits, after an answer that said "not now", before it is
 * replayed again. The worker ticks every five seconds: without a wait, a gateway
 * that was unreachable for half a minute used up the whole queue cap and was
 * asked about the same payment on every tick.
 */
export const RETRY_DELAY_MS = 60_000;

/**
 * How long a replay may run before the worker gives up on the answer.
 *
 * Derived from what the chain can actually take, not guessed: the post-commit
 * locator wait plus the issue retries, plus room for the ten GDS calls before
 * the commit. A ceiling shorter than the chain makes the worker abandon a
 * request that is still working and ask again on the next tick.
 */
const DEFAULT_REPLAY_TIMEOUT_MS = 250_000;
const replayTimeoutMs = () => {
  try {
    const ws = getWsConfig();
    const postCommit = (ws.airlineLocatorMaxWaitMs ?? 180_000)
      + ((ws.issueRetries ?? 2) * (ws.issueRetryDelayMs ?? 4000));
    return postCommit + 60_000;
  } catch {
    // getWsConfig throws when the Amadeus settings are absent. A replay that
    // cannot read a timeout must still run: the alternative is a paid booking
    // never retried because of a config lookup.
    return DEFAULT_REPLAY_TIMEOUT_MS;
  }
};

const log = (msg, extra = {}) => console.log(`[BookingQueue] ${msg}`, extra);

/** Rows that still hold an order and are not being worked on right now. */
export async function findRunnable({ limit = MAX_PER_TICK, now = Date.now(), env = queueEnvironment() } = {}) {
  // The environment filter belongs in the query, not after it.
  //
  // This took the 50 oldest queued rows and then discarded the other
  // environment's in JS, so 50+ foreign rows at the front of the queue starved
  // this environment's paid bookings indefinitely - and dev and production
  // share this database, which is the whole premise of the label.
  const { data, error } = await supabase
    .from('bookings')
    .select('booking_reference, status, payment_status, booking_details')
    .not('booking_details->queued_order', 'is', null)
    .eq('booking_details->>queued_env', env)
    .order('updated_at', { ascending: true })
    .limit(50);

  if (error) {
    log('could not read the queue', { error: error.message });
    return [];
  }

  // Local dev and production share this database: never touch a booking
  // another environment queued.
  const acted = (data || [])
    .filter((row) => row.booking_details?.queued_env === env)
    .map((row) => ({ row, action: queueActionFor(row, { now }) }))
    .filter(({ action }) => action !== null);
  // Clearing takes no Amadeus slot, so it is not counted against `limit`: a
  // row whose clear keeps failing stays at the front of this oldest-first read,
  // and counted, five of them would have stopped every paid booking behind them.
  return [
    ...acted.filter(({ action }) => action !== 'clear').slice(0, limit),
    ...acted.filter(({ action }) => action === 'clear'),
  ].map(({ row }) => row);
}

/**
 * What the worker does with a row that still holds a queued order.
 *
 *  - 'replay':    run it through the order route;
 *  - 'clear':     it is finished - only drop the stored order;
 *  - 'hand-over': a failed chain too old to replay - flag it for a person and
 *                 tell the customer, never book it;
 *  - null:        leave it this tick.
 *
 * @returns {'replay'|'clear'|'hand-over'|null}
 */
export function queueActionFor(row, { now = Date.now() } = {}) {
  const details = row?.booking_details || {};
  const chain = details.gds_chain || {};
  if (details.pnr || row.status === 'cancelled') return 'clear';
  if (chain.state === 'queued') {
    // Waiting out a retry delay (retryLater).
    const retryAfter = Date.parse(chain.retryAfter ?? '');
    return Number.isFinite(retryAfter) && retryAfter > now ? null : 'replay';
  }
  // Finished, with the order still stored: a person owns it (`needs_review`,
  // which the queue's own final failure writes), the route has started a
  // reversal (`fulfillment_failed`), or the money went back. Picked up to drop
  // the order - passport numbers and dates of birth, and what makes the
  // admin's Void Payment answer BOOKING_BUSY - and never replayed. Before, a
  // clear that failed once was never tried again: nothing selected these rows.
  // Not while a chain still holds the booking.
  const settled = details.needs_review || details.fulfillment_failed
    || ['refunded', 'partially_refunded'].includes(row.payment_status);
  if (settled) return liveChainState(chain, now) ? null : 'clear';
  // Let go by the route and never queued again. Before a retryable 503 the
  // route releases its claim, which writes the chain `failed`
  // (releaseBookingChain), and retryLater puts it back to `queued`. When
  // that write does not land - an error, or the database not answering the
  // read before it - the row keeps its order and a `failed` chain, and
  // without this branch no job ever looked at it again: charged, not booked,
  // nobody told. Nothing is running it, so it is run again, after the same
  // wait a re-queue would have had.
  //
  // Not while something else owns the outcome - settled above.
  if (chain.state === 'failed') {
    // And only while it is young enough to book. Round 1 replayed a failed
    // chain of any age, and one with no finish time at once: on deploy every
    // stranded row would have gone through /order, so a payment staff had
    // settled by hand was booked weeks late, and one refunded in the ARC
    // portal was emailed "we could not confirm your booking". The rule for a
    // paid booking never booked is abandonedCheckout's - book or refund within
    // AUTO_COMPLETE_WINDOW_MS, past that a person decides. A row that records
    // no time at all is taken as old.
    const stoppedAt = Date.parse(chain.finishedAt || chain.queuedAt || '');
    if (!Number.isFinite(stoppedAt) || now - stoppedAt > AUTO_COMPLETE_WINDOW_MS) return 'hand-over';
    return now - stoppedAt < RETRY_DELAY_MS ? null : 'replay';
  }
  // A replay that died mid-chain leaves its claim behind; once it is stale,
  // run the booking again rather than strand a paid customer.
  return chain.state === 'in_progress' && chain.startedAt && now - Date.parse(chain.startedAt) > CLAIM_TTL_MS
    ? 'replay'
    : null;
}

/**
 * A failed chain past the replay window: flagged for a person, and the customer
 * told, instead of booked. Flagged first - if that cannot be written nothing is
 * sent and the order is kept, so the next tick tries again rather than email a
 * customer that a team nobody told has been alerted.
 */
async function handOver(row) {
  const ref = row.booking_reference;
  const alerted = await flagFinalFailure(ref, null, null, {
    reason: `queued booking's chain failed more than ${AUTO_COMPLETE_WINDOW_MS / 3_600_000} hours ago and was not replayed; `
      + 'check the airline and ARC Pay, then book or refund it by hand',
  });
  if (!alerted) {
    log('stale failed booking could not be flagged; will try again', { bookingReference: ref });
    return 'retry';
  }
  log('stale failed booking handed to a person, not replayed', { bookingReference: ref });
  await notifyFailure(row, {}, { alerted });
  await clearQueuedOrder(ref);
  return 'handed-over';
}

/** One row the worker picked, done as queueActionFor says. */
export async function runQueued(row, { baseUrl, fetchImpl, now = Date.now() } = {}) {
  const action = queueActionFor(row, { now });
  if (action === 'hand-over') return handOver(row);
  if (action === 'clear') {
    await clearQueuedOrder(row.booking_reference);
    return 'already-finished';
  }
  if (action === 'replay') return replay(row, { baseUrl, ...(fetchImpl ? { fetchImpl } : {}) });
  return 'skipped';
}

/**
 * How many times a clear that lost its race is read and tried again - the same
 * as the other writers of this column (patchBookingDetails, the alarms' marks).
 */
const CLEAR_TRIES = 3;

/** Drop the stored order (it carries passenger details) once it has an outcome. */
async function clearQueuedOrder(bookingReference) {
  // Read and tried again after a lost race, rather than given up on. This is
  // the only code that removes the order - passengers' dates of birth and
  // passport numbers - and after a final failure nothing selects the row
  // again, so one lost race kept that data for good, and the GDPR erasure job
  // defers any booking still holding a queued order (gdpr.controller.js), so
  // the customer's erasure request was refused on every run after it.
  //
  // A failed read or write is logged and tried again too. A read error used to
  // look like "nothing to clear" and return in silence, and a write error gave
  // up after one try. Past these tries the worker picks the row up again on a
  // later tick (queueActionFor answers 'clear'), so a bad minute is not for good.
  for (let attempt = 0; attempt < CLEAR_TRIES; attempt += 1) {
    const { data: row, error: readError } = await supabase
      .from('bookings')
      .select('status, payment_status, booking_details')
      .eq('booking_reference', bookingReference)
      .single();
    if (readError) {
      // No such row: nothing holds the order any more.
      if (readError.code === 'PGRST116') return;
      log('queued order not cleared: the booking could not be read', { bookingReference, attempt: attempt + 1, error: readError.message });
      continue;
    }
    if (!row?.booking_details?.queued_order) return;
    const { queued_order: _order, queued_env: _env, ...rest } = row.booking_details;
    // Pinned, like every other writer of this column. A replay that the worker
    // abandoned at its timeout leaves the route's own chain still running, and
    // the next tick picks the row up again as soon as a PNR appears - so this
    // read and write can straddle the chain's final save and put the row back as
    // it was, losing the tickets and itineraries it had just written while
    // leaving `status` on the newer value.
    const { data: written, error } = await unchangedSince(
      supabase.from('bookings').update({ booking_details: rest }).eq('booking_reference', bookingReference),
      row,
    ).select('booking_reference');
    if (error) {
      log('queued order not cleared', { bookingReference, attempt: attempt + 1, error: error.message });
      continue;
    }
    if (written?.length) return;
  }
  log('queued order not cleared after every try; a later tick clears it', { bookingReference, tries: CLEAR_TRIES });
}

/**
 * The customer left the page when they got the 202, so a booking that fails
 * later has to reach them by email. Success already sends the confirmation
 * email from the route.
 */
/**
 * What to tell the customer, from what the route actually did.
 *
 * This used to print the route's raw `error` - an exception message on a crash -
 * and otherwise promise "Our team will contact you about your refund shortly"
 * for every failure, including ones where no refund was attempted and ones
 * where the refund was refused. Only `refunded: true` means money went back.
 *
 * "Our team has been alerted" is said only when `alerted`: when the booking
 * carries the review flag the paid-not-ticketed alarm announces. It used to be
 * said for failures nothing had flagged, and nobody ever was alerted.
 */
export function failureCopy(result, { alerted = true } = {}) {
  // A second payment for a trip that was already booked is held for a human:
  // not booked, and not refunded automatically either, because a family can
  // book one flight twice. Say exactly that.
  //
  // Unless the first booking is a commit the airline never answered: it is
  // paid for, and nobody knows yet whether it was booked. The route reads that
  // with commitUnknownOf for its own answer (duplicatePaymentAnswer) and says
  // so in it (`firstCommitUnknown`); "a trip you had already booked" was false.
  if (result?.code === 'DUPLICATE_PAYMENT') {
    const first = result.firstCommitUnknown === true
      ? 'This payment looks like a second payment for a trip you have already paid for, for the same travellers, '
        + 'so we did not book it again. Your first payment is not affected, and our team is still checking with the airline '
        + 'whether that booking went through. Our team will check it and refund '
      : 'This payment looks like a second payment for a trip you had already booked for the same travellers, '
        + 'so we did not book it again. Your first booking is not affected. Our team will check it and refund ';
    return first
      + 'this payment. If you did mean to book the trip twice, or have not heard from us within 2 business days, '
      + 'call (877) 538-7380 with your booking reference.';
  }
  if (result?.refunded === true) {
    return 'We could not confirm your booking with the airline, so your payment has been reversed. '
      + 'It usually reaches your card within 5-10 business days.';
  }
  if (result?.bookingFailed === true) {
    return 'We could not confirm your booking, and the automatic refund did not go through. '
      + (alerted
        ? 'Our team has been alerted and will refund you manually. If you have not heard from us '
          + 'within 2 business days, call (877) 538-7380 with your booking reference.'
        : 'Please call (877) 538-7380 with your booking reference so we can refund you.');
  }
  return 'We could not confirm your booking. '
    + (alerted
      ? 'Our team has been alerted and will contact you. You can also call (877) 538-7380 with your booking reference.'
      : 'Please call (877) 538-7380 with your booking reference so we can sort it out.');
}

async function notifyFailure(row, result, { alerted } = {}) {
  return notifyCustomer(row, {
    subject: 'We could not confirm your flight booking',
    status: 'Not confirmed',
    whatHappensNext: failureCopy(result, { alerted }),
  });
}

/**
 * The email for a replay the route answered 409 BOOKING_NEEDS_REVIEW: a
 * person already has the booking - a commit our team is checking with the
 * airline, a PNR the airline confirmed no seat on. Neither "confirmed" nor
 * "could not confirm": the customer left on the queue's "Booking Received",
 * and is told the one thing true of every such booking, and what not to do.
 */
export const CHECKING_EMAIL = {
  subject: 'We are checking your flight booking',
  status: 'Being checked',
  whatHappensNext: 'Our team is checking your booking with the airline and will contact you. '
    + 'Please do not book this trip again in the meantime. If you have not heard from us within 2 business days, '
    + 'call (877) 538-7380 with your booking reference.',
};

async function notifyCustomer(row, { subject, status, whatHappensNext }) {
  const bookingReference = row.booking_reference;
  const order = row.booking_details?.queued_order;
  // The first address that can be delivered to, in the order route's order:
  // the order's contact email, its customerEmail, the lead traveller's (the
  // one checkout verified, as the route books), then the one checkout
  // recorded. The contact email was taken whatever it held, and a typed
  // "jane@gmailcom" was the only place this - the one word a customer who left
  // on the 202 gets - was sent.
  const lead = orderDataFromCheckoutRow(row).passengerData?.[0] ?? order?.travelers?.[0];
  const to = [order?.contactInfo?.email, order?.customerEmail, lead?.email, row.booking_details?.customer_email]
    .find(isUsableEmail);
  if (!to) return;
  try {
    await sendEmail({
      to,
      subject,
      data: {
        bookingReference,
        status,
        whatHappensNext,
      },
    });
  } catch (error) {
    log('customer email not sent', { bookingReference, subject, error: error.message });
  }
}

/**
 * Did the route say "not now" rather than "no"? Nothing was booked and nothing
 * was refunded, so the booking can simply run again.
 *
 * Anything else used to count as final - including the 402 PAYMENT_NOT_CAPTURED
 * the route sends when it could not reach the gateway (`retryable: true`), and
 * the 503 BOOKING_UNAVAILABLE it sends when the database could not say who held
 * the booking. The worker emailed "our team has been alerted", dropped the
 * stored order, and left the chain `queued`, which the abandoned-checkout job
 * skips and no alarm matches: the money held, nothing booked, nobody told.
 *
 * A 503 counts unless the route reversed the payment: BOOKING_DISABLED is a 503
 * too, and it is a refund, not a wait.
 */
export function isRetryableAnswer(status, body) {
  if (body?.retryable === true) return true;
  return status === 503 && body?.bookingFailed !== true;
}

/**
 * Put a booking back in the queue after a "not now": counted against the same
 * cap a missing Amadeus slot counts against, and replayed no sooner than
 * RETRY_DELAY_MS.
 *
 * The route may have left the chain `failed` or `in_progress` when it answered.
 * Either way nothing is running it, so it is queued again here - by a
 * compare-and-set on the stamp just read, so a request that has taken the
 * booking since is never undone. A race lost to a write that left the booking
 * free is read and decided again.
 *
 * @returns {Promise<'queued'|'gave-up'|'moved-on'|'not-queued'|'unknown'>}
 *   'not-queued' the write did not land, so the row is as the route left it;
 *                findRunnable picks a released (`failed`) chain up again.
 */
const REQUEUE_TRIES = 3;

async function retryLater(bookingReference, { now = Date.now() } = {}) {
  for (let attempt = 0; attempt < REQUEUE_TRIES; attempt += 1) {
    const { data: row, error } = await supabase
      .from('bookings')
      .select('status, booking_details')
      .eq('booking_reference', bookingReference)
      .single();
    if (error || !row) return 'unknown';

    const details = row.booking_details || {};
    if (!details.queued_order || details.pnr || row.status === 'cancelled') return 'moved-on';
    const chain = details.gds_chain || {};
    const holder = liveChainState(chain, now);
    if (holder === 'in_progress' || holder === 'cancelling') return 'moved-on';

    const queueAttempts = Number(chain.queueAttempts || 0) + 1;
    if (queueAttempts > MAX_QUEUE_ATTEMPTS) return 'gave-up';

    const at = new Date(now).toISOString();
    let update = supabase
      .from('bookings')
      .update({
        booking_details: {
          ...details,
          gds_chain: {
            state: 'queued',
            startedAt: at,
            queuedAt: chain.queuedAt || at,
            ...(chain.attempt ? { attempt: chain.attempt } : {}),
            queueAttempts,
            retryAfter: new Date(now + RETRY_DELAY_MS).toISOString(),
          },
        },
        updated_at: at,
      })
      .eq('booking_reference', bookingReference);
    update = chain.startedAt
      ? update.eq('booking_details->gds_chain->>startedAt', chain.startedAt)
      : update.is('booking_details->gds_chain->>startedAt', null);
    // Asked for the row back, because an update that matched nothing answers
    // `{ data: null, error: null }` - which is how this used to report
    // 'queued' for a write that never happened.
    const { data: written, error: writeError } = await update.select('booking_reference');
    if (writeError) {
      log('could not queue the booking again', { bookingReference, error: writeError.message });
      return 'not-queued';
    }
    if (written?.length) return 'queued';
    // Matched no row: something wrote the chain in between. Read it again and
    // decide again - it may have been taken, or merely touched.
  }
  log('could not queue the booking again: it kept changing', { bookingReference, tries: REQUEUE_TRIES });
  return 'not-queued';
}

/**
 * Put a booking the queue gave up on in front of a human, and say whether it is.
 *
 * Unless the money went back, a final failure is flagged `needs_review`, which
 * the paid-not-ticketed alarm announces. A flag the route already wrote - a
 * refund it could not make, a second payment for one trip - is kept as it is.
 * The queue's hold on the booking is let go at the same time, so it can be
 * cancelled and refunded now rather than in half an hour.
 *
 * @returns {Promise<boolean>} whether the booking now carries a review flag
 */
async function flagFinalFailure(bookingReference, status, body, { now = Date.now(), reason = null } = {}) {
  if (body?.refunded === true) return false;
  const read = async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('status, payment_status, booking_details')
      .eq('booking_reference', bookingReference)
      .single();
    return error ? null : data;
  };

  const row = await read();
  if (!row) return false;
  if (row.status === 'cancelled' || ['refunded', 'partially_refunded'].includes(row.payment_status)) return false;
  const details = row.booking_details || {};
  if (details.needs_review) return true;

  const at = new Date(now).toISOString();
  const chain = details.gds_chain || null;
  let update = supabase
    .from('bookings')
    .update({
      booking_details: {
        ...details,
        needs_review: {
          reason: reason || `queued booking could not be completed (${body?.code || `HTTP ${status}`}); the payment may still be held`,
          source: 'booking-queue',
          ticketed: false,
          at,
        },
        ...(chain?.state === 'queued' ? { gds_chain: { ...chain, state: 'failed', failedStep: 'queue-replay', finishedAt: at } } : {}),
      },
      updated_at: at,
    })
    .eq('booking_reference', bookingReference)
    .is('booking_details->needs_review', null);
  update = chain?.startedAt
    ? update.eq('booking_details->gds_chain->>startedAt', chain.startedAt)
    : update.is('booking_details->gds_chain->>startedAt', null);

  const { data, error } = await update.select('booking_reference');
  if (error) {
    log('could not flag the failed booking for review', { bookingReference, error: error.message });
    return false;
  }
  if (data?.length) return true;
  // Something wrote the row in between; it is alerted only if that write flagged it.
  return Boolean((await read())?.booking_details?.needs_review);
}

/** Run one queued booking through the live route. */
export async function replay(row, { baseUrl, fetchImpl = fetch } = {}) {
  const ref = row.booking_reference;
  const order = row.booking_details?.queued_order;

  if (row.booking_details?.pnr || row.status === 'cancelled') {
    await clearQueuedOrder(ref);
    return 'already-finished';
  }

  let status;
  let body;
  try {
    const response = await fetchImpl(`${baseUrl}/api/flights/order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-booking-queue-replay': '1' },
      body: JSON.stringify(order),
      // Longer than the chain can legitimately take.
      //
      // 90s was set when everything after the commit took seconds. Since the
      // airline-locator patience of #132 the chain can run to
      // AMADEUS_WS_AIRLINE_LOCATOR_MAX_WAIT_MS (180s by default) plus its issue
      // retries, so this aborted a replay that was still working: the worker
      // logged "did not complete, will retry" and asked again on the next tick,
      // while the first replay carried on and committed. The claim is what
      // stops that becoming two PNRs, but the worker should not be racing its
      // own in-flight request in the first place.
      signal: AbortSignal.timeout(replayTimeoutMs()),
    });
    status = response.status;
    body = await response.json().catch(() => ({}));
  } catch (error) {
    // Transport failure: the row is untouched or its claim will go stale, and
    // either way the next tick picks it up again.
    log('replay did not complete, will retry', { bookingReference: ref, error: error.message });
    return 'retry';
  }

  if (body?.queued) return 'requeued';               // still no slot; the route re-queued it
  if (status === 409 && body?.code === 'BOOKING_IN_PROGRESS') return 'in-progress';
  // The customer cancelled between this worker reading the row and replaying
  // it. That is an outcome, not a failure: emailing "we could not confirm your
  // booking" to someone who just cancelled it is wrong twice over.
  if (status === 409 && body?.code === 'BOOKING_CANCELLED') {
    await clearQueuedOrder(ref);
    return 'already-finished';
  }

  // The route's 202 for a commit the airline never answered: success, held
  // for a person, and no record locator (the order page reads that answer as
  // 'checking'). Nothing was confirmed, and the route emails nothing - there
  // is no booking to confirm. Read as 'confirmed', the queued customer,
  // promised a confirmation within minutes, and the abandoned-checkout
  // customer heard nothing, with nothing against booking the trip again. It
  // is the state the 409 BOOKING_NEEDS_REVIEW below is emailed about, and it
  // gets the same CHECKING_EMAIL, once: the order is dropped here, and a
  // flagged row is only ever cleared after this, never replayed.
  if (body?.success && body.needsReview === true && !(body.pnr || body.data?.pnr)) {
    log('queued booking\'s commit never answered; sending the checking email', { bookingReference: ref, status });
    await notifyCustomer(row, CHECKING_EMAIL);
    await clearQueuedOrder(ref);
    return 'needs-review';
  }

  if (body?.success) {
    log('queued booking confirmed', { bookingReference: ref, pnr: body.pnr || null });
    await clearQueuedOrder(ref);
    return 'confirmed';
  }

  if (isRetryableAnswer(status, body)) {
    const next = await retryLater(ref);
    if (next !== 'gave-up') {
      log('replay answered "not now", will retry', { bookingReference: ref, status, code: body?.code || null, next });
      return 'retry';
    }
    log('queued booking ran out of retries', { bookingReference: ref, status, code: body?.code || null });
  }

  // A booking a person already has (409 BOOKING_NEEDS_REVIEW): the route
  // found it flagged - a commit our team is checking with the airline, a PNR
  // the airline confirmed no seat on - and sent nothing to the airline. No
  // failure email: "We could not confirm your flight booking" said it had
  // failed while the airline may hold it. But not silence either: the
  // customer left on "Booking Received" and heard nothing until the desk got
  // to them, with nothing against booking the trip again. They are sent the
  // neutral CHECKING_EMAIL, once: the stored order is dropped here as for any
  // outcome, and a flagged row the worker reads again with its chain let go
  // is only cleared, never replayed (queueActionFor). The person working the
  // flag tells them what the airline said. The flag is kept
  // (flagFinalFailure writes over none).
  if (body?.code === 'BOOKING_NEEDS_REVIEW') {
    log('queued booking is with a person; sending the checking email', { bookingReference: ref, status });
    await flagFinalFailure(ref, status, body);
    await notifyCustomer(row, CHECKING_EMAIL);
    await clearQueuedOrder(ref);
    return 'needs-review';
  }

  // A real failure. Whether money went back is in the body, not assumed.
  log('queued booking failed', { bookingReference: ref, status, refunded: body?.refunded === true, code: body?.code || null });
  const alerted = await flagFinalFailure(ref, status, body);
  await notifyFailure(row, body, { alerted });
  await clearQueuedOrder(ref);
  return 'failed';
}

/** Free Amadeus slots right now, or 0 when flights are not configured. */
function freeSlots() {
  try {
    const { active, limit, waitingBookings } = getSemaphore(getWsConfig()).stats;
    // Live customers waiting for a slot go first; the queue takes what is left.
    return waitingBookings > 0 ? 0 : Math.max(0, limit - active);
  } catch {
    return 0;
  }
}

export function startBookingQueueWorker({ port, intervalMs = 5000 } = {}) {
  if (!supabase || !port) return { stop: () => {} };
  const baseUrl = `http://127.0.0.1:${port}`;
  let running = false;

  const tick = async () => {
    // Not paused while booking is switched off. Every queued row is a customer
    // who has paid, and waiting for booking to come back held their money with
    // no email; the route answers a replay then as it answers a live request,
    // with a refund and a phone number (BOOKING_DISABLED).
    if (running) return;
    running = true;
    try {
      const free = Math.min(freeSlots(), MAX_PER_TICK);
      if (free === 0) return;
      const rows = await findRunnable({ limit: free });
      await Promise.all(rows.map((row) => runQueued(row, { baseUrl })));
    } catch (error) {
      log('tick failed', { error: error.message });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  log(`started - every ${intervalMs / 1000}s, running '${queueEnvironment()}' bookings`);
  return { stop: () => clearInterval(timer), tick };
}
