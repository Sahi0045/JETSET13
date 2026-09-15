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
import { providerStatus } from '../services/flightProvider.js';
import { getWsConfig } from '../services/amadeusSoap/config.js';
import { getSemaphore } from '../services/amadeusSoap/semaphore.js';
import { sendEmail } from '../services/emailService.js';
// The order route's own TTL: a claim older than this was left by a request
// that died, and its booking needs running again.
import { CHAIN_CLAIM_TTL_MS as CLAIM_TTL_MS, MAX_QUEUE_ATTEMPTS, liveChainState } from '../utils/bookingChainClaim.js';
import { queueEnvironment } from '../utils/queueEnvironment.js';
const MAX_PER_TICK = 5;

/**
 * How long a booking waits, after an answer that said "not now", before it is
 * replayed again. The worker ticks every five seconds: without a wait, a gateway
 * that was unreachable for half a minute used up the whole queue cap and was
 * asked about the same payment on every tick.
 */
export const RETRY_DELAY_MS = 60_000;

const log = (msg, extra = {}) => console.log(`[BookingQueue] ${msg}`, extra);

/** Rows that still hold an order and are not being worked on right now. */
export async function findRunnable({ limit = MAX_PER_TICK, now = Date.now(), env = queueEnvironment() } = {}) {
  const { data, error } = await supabase
    .from('bookings')
    .select('booking_reference, status, booking_details')
    .not('booking_details->queued_order', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(50);

  if (error) {
    log('could not read the queue', { error: error.message });
    return [];
  }

  return (data || []).filter((row) => {
    // Local dev and production share this database: never touch a booking
    // another environment queued.
    if (row.booking_details?.queued_env !== env) return false;
    const chain = row.booking_details?.gds_chain || {};
    if (row.booking_details?.pnr || row.status === 'cancelled') return true; // finished: only needs clearing
    if (chain.state === 'queued') {
      // Waiting out a retry delay (retryLater).
      const retryAfter = Date.parse(chain.retryAfter ?? '');
      return !(Number.isFinite(retryAfter) && retryAfter > now);
    }
    // A replay that died mid-chain leaves its claim behind; once it is stale,
    // run the booking again rather than strand a paid customer.
    return chain.state === 'in_progress'
      && chain.startedAt && now - Date.parse(chain.startedAt) > CLAIM_TTL_MS;
  }).slice(0, limit);
}

/** Drop the stored order (it carries passenger details) once it has an outcome. */
async function clearQueuedOrder(bookingReference) {
  const { data: row } = await supabase
    .from('bookings')
    .select('booking_details')
    .eq('booking_reference', bookingReference)
    .single();
  if (!row?.booking_details?.queued_order) return;
  const { queued_order: _order, queued_env: _env, ...rest } = row.booking_details;
  await supabase.from('bookings').update({ booking_details: rest }).eq('booking_reference', bookingReference);
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
  if (result?.code === 'DUPLICATE_PAYMENT') {
    return 'This payment looks like a second payment for a trip you had already booked for the same travellers, '
      + 'so we did not book it again. Your first booking is not affected. Our team will check it and refund '
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

async function notifyFailure(order, bookingReference, result, { alerted } = {}) {
  const to = order?.contactInfo?.email;
  if (!to) return;
  try {
    await sendEmail({
      to,
      subject: 'We could not confirm your flight booking',
      data: {
        bookingReference,
        status: 'Not confirmed',
        whatHappensNext: failureCopy(result, { alerted }),
      },
    });
  } catch (error) {
    log('failure email not sent', { bookingReference, error: error.message });
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
 * Either way nothing is running it, and findRunnable picks up only `queued`, so
 * it is queued again here - by a compare-and-set on the stamp just read, so a
 * request that has taken the booking since is never undone.
 *
 * @returns {Promise<'queued'|'gave-up'|'moved-on'|'unknown'>}
 */
async function retryLater(bookingReference, { now = Date.now() } = {}) {
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
  const { error: writeError } = await update;
  // Failed or lost: the row is as the route left it, and a later tick reads it again.
  if (writeError) log('could not queue the booking again', { bookingReference, error: writeError.message });
  return 'queued';
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
async function flagFinalFailure(bookingReference, status, body, { now = Date.now() } = {}) {
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
          reason: `queued booking could not be completed (${body?.code || `HTTP ${status}`}); the payment may still be held`,
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
      signal: AbortSignal.timeout(90_000),
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

  // A real failure. Whether money went back is in the body, not assumed.
  log('queued booking failed', { bookingReference: ref, status, refunded: body?.refunded === true, code: body?.code || null });
  const alerted = await flagFinalFailure(ref, status, body);
  await notifyFailure(order, ref, body, { alerted });
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
    if (running || !providerStatus().bookingEnabled) return;
    running = true;
    try {
      const free = Math.min(freeSlots(), MAX_PER_TICK);
      if (free === 0) return;
      const rows = await findRunnable({ limit: free });
      await Promise.all(rows.map((row) => replay(row, { baseUrl })));
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
