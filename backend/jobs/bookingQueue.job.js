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

// Matches CHAIN_CLAIM_TTL_MS in flight.routes.js: a claim older than this was
// left by a request that died, and its booking needs running again.
const CLAIM_TTL_MS = 120_000;
const MAX_PER_TICK = 5;

const log = (msg, extra = {}) => console.log(`[BookingQueue] ${msg}`, extra);

/** Rows that still hold an order and are not being worked on right now. */
export async function findRunnable({ limit = MAX_PER_TICK, now = Date.now(), env = process.env.NODE_ENV || 'development' } = {}) {
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
    if (chain.state === 'queued') return true;
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
 */
export function failureCopy(result) {
  if (result?.refunded === true) {
    return 'We could not confirm your booking with the airline, so your payment has been reversed. '
      + 'It usually reaches your card within 5-10 business days.';
  }
  if (result?.bookingFailed === true) {
    return 'We could not confirm your booking, and the automatic refund did not go through. '
      + 'Our team has been alerted and will refund you manually. If you have not heard from us '
      + 'within 2 business days, call (877) 538-7380 with your booking reference.';
  }
  return 'We could not confirm your booking. Our team has been alerted and will contact you. '
    + 'You can also call (877) 538-7380 with your booking reference.';
}

async function notifyFailure(order, bookingReference, result) {
  const to = order?.contactInfo?.email;
  if (!to) return;
  try {
    await sendEmail({
      to,
      subject: 'We could not confirm your flight booking',
      data: {
        bookingReference,
        status: 'Not confirmed',
        whatHappensNext: failureCopy(result),
      },
    });
  } catch (error) {
    log('failure email not sent', { bookingReference, error: error.message });
  }
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

  if (body?.success) {
    log('queued booking confirmed', { bookingReference: ref, pnr: body.pnr || null });
    await clearQueuedOrder(ref);
    return 'confirmed';
  }

  // A real failure. Whether money went back is in the body, not assumed.
  log('queued booking failed', { bookingReference: ref, status, refunded: body?.refunded === true, code: body?.code || null });
  await notifyFailure(order, ref, body);
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
  log(`started - every ${intervalMs / 1000}s`);
  return { stop: () => clearInterval(timer), tick };
}
