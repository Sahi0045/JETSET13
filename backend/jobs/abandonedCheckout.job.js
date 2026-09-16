/**
 * Finish flight bookings whose customer paid and never came back.
 *
 * Booking is driven by the customer's browser: ARC Pay's hosted checkout
 * redirects to /payment/callback, which hands over to the order page, which
 * POSTs /api/flights/order. A customer who closes the tab after paying - or
 * whose connection drops on the redirect - never reaches that POST. The money
 * is captured, nothing is booked, no email goes out, and nothing notices: the
 * row still reads `pending`, with no PNR for the paid-not-ticketed alarm to
 * see. (Flight-flow audit 2026-09-12: "Reconciliation is browser-driven only".)
 *
 * This job asks ARC about checkouts that never reached the order route. For
 * one that was paid it does what the browser would have done: rebuilds the
 * order from the checkout row with the order page's own builder
 * (shared/flightOrderBody.js), proves the payer with the success indicator ARC
 * issued for that session, and sends it to POST /api/flights/order through the
 * booking queue's `replay`. So the outcome is handled exactly as a live one:
 * the route books it or reverses the charge, and the customer gets an email
 * either way.
 *
 * Deliberately conservative:
 *  - 30 minutes' grace, so the customer's own browser always gets there first;
 *    the route's claim on the reference stops the two running one booking twice;
 *  - booked automatically only within 6 hours of checkout. Later than that the
 *    customer may have booked elsewhere, so the row is flagged for a human
 *    (`needs_review`, which the paid-not-ticketed alarm announces);
 *  - only this environment's checkouts: local and production share the
 *    database, and each checkout's return URL says which site took it;
 *  - nothing is written to a checkout that has not been paid, and what has been
 *    checked lives in memory, so this job never races the customer's browser
 *    for `booking_details`. A restart just asks again.
 */
import supabase from '../config/supabase.js';
import { reconcileBookingPayment } from '../routes/payment/checkout.handlers.js';
import { replay } from './bookingQueue.job.js';
import { queueEnvironment } from '../utils/queueEnvironment.js';
import { liveChainState } from '../utils/bookingChainClaim.js';
import { unchangedSince } from '../utils/bookingDetailsGuard.js';
import { buildFlightOrderBody, orderDataFromCheckoutRow } from '../../shared/flightOrderBody.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** The customer's browser normally books within seconds of paying; it gets this long first. */
export const GRACE_MS = 30 * MINUTE;
/** Past this, a paid checkout goes to a human rather than being booked. */
export const AUTO_COMPLETE_WINDOW_MS = 6 * HOUR;
/** A hosted checkout can still be paid for a while after it opens; until then "unpaid" is not final. */
export const PAYABLE_MS = 3 * HOUR;
/** How long before a checkout with no answer yet is asked about again. */
export const RECHECK_MS = 30 * MINUTE;
/** Checkouts older than this are left alone. */
export const LOOKBACK_MS = 7 * 24 * HOUR;
/** The browser confirmed the payment this recently, so its order is on the way. */
export const BROWSER_HANDOFF_MS = 10 * MINUTE;

const MAX_PER_TICK = 5;
const DEFAULT_INTERVAL_MS = 5 * MINUTE;
// After the needs-review alert's first run, so the boot-time jobs do not all start at once.
const FIRST_RUN_DELAY_MS = 2 * MINUTE;

const log = (msg, extra = {}) => console.log(`[AbandonedCheckout] ${msg}`, extra);

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * Which site took a checkout, from the return URL the page gave ARC Pay:
 * 'local' for a developer's machine, 'site' for the public site, null when the
 * row does not say.
 */
export function checkoutSite(row) {
  try {
    const { host } = new URL(row?.booking_details?.pending_booking_data?.returnUrl);
    return LOCAL_HOST.test(host) ? 'local' : 'site';
  } catch {
    return null;
  }
}

export const siteForEnv = (nodeEnv = process.env.NODE_ENV) => (nodeEnv === 'production' ? 'site' : 'local');

/**
 * Checkouts that never reached the order route and are due a look.
 *
 * Pure, so the selection can be tested without a database. `checked` is this
 * process's memory of what it already asked about.
 */
export function selectCandidates(rows = [], { now = Date.now(), site = siteForEnv(), checked = new Map() } = {}) {
  return rows.filter((row) => {
    const details = row?.booking_details || {};
    if (row?.status !== 'pending' || !['unpaid', 'paid'].includes(row.payment_status)) return false;
    if (!details.success_indicator || !details.pending_booking_data) return false;
    // The order route has seen it and owns the outcome: a PNR exists, it is in
    // the durable queue, or a human has been asked to look.
    if (details.pnr || details.queued_order || details.needs_review) return false;
    /**
     * A chain that is still running owns the booking. One that is NOT running
     * does not, and this used to skip the row for merely HAVING a `gds_chain`
     * key - which is left behind for ever.
     *
     * That made a dead zone no job could see. A paid row with a finished or
     * abandoned chain and no PNR is excluded from the booking queue (it has no
     * `queued_order`), from both alarms (no `needs_review`, no `cancellation`,
     * no PNR) and from ticket sync (no PNR) - so it sat paid and unbooked for
     * ever, with nobody told. Three ordinary ways in, all AFTER the money was
     * taken and reconciled: `releaseBookingChain` writing `state:'failed'` when
     * the duplicate check could not run, the same when a duplicate payment
     * could not be held, and a deploy or a restart killing the process
     * mid-chain and leaving `state:'in_progress'` on the row.
     *
     * `liveChainState` already knows the difference and ages a claim out
     * (CHAIN_CLAIM_TTL_MS 2 min, QUEUED_CHAIN_TTL_MS 30 min). The customer who
     * closed the tab is exactly who this job exists for, and the 30-minute
     * GRACE_MS above means a genuinely running chain is long finished before a
     * row is even a candidate.
     */
    if (liveChainState(details.gds_chain, now)) return false;
    if (checkoutSite(row) !== site) return false;

    const age = now - Date.parse(row.created_at);
    if (!(age >= GRACE_MS && age <= LOOKBACK_MS)) return false;

    const reconciledAt = Date.parse(details.payment_reconciled_at);
    if (Number.isFinite(reconciledAt) && now - reconciledAt < BROWSER_HANDOFF_MS) return false;

    const seen = checked.get(row.booking_reference);
    if (seen?.final) return false;
    return !seen || now - seen.at >= RECHECK_MS;
  });
}

/**
 * Put a paid checkout in front of a human, unless it has moved on since it was
 * read. Conditional on the row still being untouched, so a customer who came
 * back in the meantime is never overwritten.
 */
async function flagForReview(row, reason) {
  const { data: fresh, error: readError } = await supabase
    .from('bookings')
    .select('status, payment_status, booking_details')
    .eq('id', row.id)
    .single();
  if (readError || !fresh) return false;

  const details = fresh.booking_details || {};
  if (fresh.status !== 'pending' || ['refunded', 'partially_refunded'].includes(fresh.payment_status)) return false;
  if (details.pnr || details.queued_order || details.needs_review) return false;
  // Same rule as selectCandidates: a RUNNING chain owns the booking, a dead one
  // does not. Testing for the key meant the rows selectCandidates now admits -
  // the whole point of that change - were selected and then flagged nowhere.
  if (liveChainState(details.gds_chain)) return false;

  // Pinned to the row as just read, which includes the chain's state and stamp
  // (utils/bookingDetailsGuard.js), so a chain that starts in between still
  // wins. The old `.is(gds_chain, null)` could never be true for these rows.
  const { error } = await unchangedSince(
    supabase
      .from('bookings')
      .update({
        booking_details: {
          ...details,
          needs_review: { reason, at: new Date().toISOString(), ticketed: false, source: 'abandoned-checkout' },
        },
      })
      .eq('id', row.id),
    fresh,
  );
  if (error) {
    log('could not flag for review', { bookingReference: row.booking_reference, error: error.message });
    return false;
  }
  return true;
}

/**
 * Settle one checkout. `final` means this process need not ask about it again.
 */
export async function settle(row, { now = Date.now(), reconcile = reconcileBookingPayment, send, flag = flagForReview } = {}) {
  const age = now - Date.parse(row.created_at);

  const payment = await reconcile(row);
  // ARC answering 400 or 404 means it has never seen this order, which for a
  // row with no PNR is a definite "not paid" rather than an outage. Decided
  // here rather than in reconcileBookingPayment, because the cancel route and
  // the queue worker both need a non-200 to stay an outage: a cancel that reads
  // it as "never paid" releases the seats and refunds nothing.
  const noSuchOrder = payment.gatewayUnavailable
    && [400, 404].includes(payment.gatewayStatus)
    && !row?.booking_details?.pnr;
  if (payment.gatewayUnavailable && !noSuchOrder) return { outcome: 'gateway-unavailable', final: false };
  if (noSuchOrder) return { outcome: 'not-paid', final: age > PAYABLE_MS };
  if (!payment.paid) return { outcome: 'not-paid', final: age > PAYABLE_MS };

  if (age > AUTO_COMPLETE_WINDOW_MS) {
    await flag(row, `Paid, but the customer never came back to finish booking. Checkout was ${Math.floor(age / HOUR)}h ago, `
      + 'too late to book automatically: book it by hand or refund it.');
    return { outcome: 'flagged-late', final: true };
  }

  const { body, problem } = buildFlightOrderBody(orderDataFromCheckoutRow(row));
  if (problem) {
    const missing = problem === 'OFFER_MISSING' ? 'no flight offer' : 'incomplete traveller details';
    await flag(row, `Paid, but the customer never came back to finish booking, and the saved checkout has ${missing}, `
      + 'so it could not be booked automatically.');
    return { outcome: 'flagged-incomplete', final: true };
  }

  // What the paying browser would have posted, with the proof only it held.
  const result = await send(row, { ...body, resultIndicator: row.booking_details.success_indicator });
  switch (result) {
    case 'confirmed':
    case 'already-finished':
      return { outcome: 'booked', final: true };
    case 'requeued':
    case 'in-progress':
      // The booking queue, or the customer's own browser, has it now.
      return { outcome: result, final: true };
    case 'failed':
      // The route reversed the charge or recorded why it could not, and emailed
      // the customer. Only a refusal that left the row exactly as checkout wrote
      // it still needs a human, and flagging checks for that.
      await flag(row, 'Paid, but the customer never came back, and booking it automatically was refused '
        + 'with nothing recorded on the booking. Book it by hand or refund it.');
      return { outcome: 'failed', final: true };
    default:
      return { outcome: 'retry', final: false };
  }
}

const memory = new Map();

export async function runOnce({ baseUrl, now = Date.now(), site = siteForEnv(), checked = memory, reconcile, send, flag } = {}) {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, booking_reference, status, payment_status, total_amount, created_at, booking_details')
    .eq('travel_type', 'flight')
    .eq('status', 'pending')
    .gte('created_at', new Date(now - LOOKBACK_MS).toISOString())
    .lte('created_at', new Date(now - GRACE_MS).toISOString())
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(`could not read checkouts: ${error.message}`);

  const sendOrder = send || ((row, body) => replay(
    { booking_reference: row.booking_reference, status: row.status, booking_details: { ...row.booking_details, queued_order: body } },
    { baseUrl },
  ));

  const settled = [];
  // One at a time: each can run a whole booking chain.
  for (const row of selectCandidates(data || [], { now, site, checked }).slice(0, MAX_PER_TICK)) {
    let result;
    try {
      result = await settle(row, { now, reconcile, send: sendOrder, flag });
    } catch (e) {
      log('could not settle a checkout', { bookingReference: row.booking_reference, error: e.message });
      result = { outcome: 'error', final: false };
    }
    checked.set(row.booking_reference, { at: now, final: result.final });
    if (result.outcome !== 'not-paid') log(result.outcome, { bookingReference: row.booking_reference });
    settled.push({ bookingReference: row.booking_reference, ...result });
  }
  return settled;
}

export function startAbandonedCheckoutJob({ port, intervalMs = DEFAULT_INTERVAL_MS, env = process.env } = {}) {
  if (!supabase || !port) return { stop: () => {} };

  // Production settles the public site's checkouts. Anywhere else it is
  // opt-in: a laptop booting against the shared database should not start
  // booking, or flagging, a week of abandoned test checkouts.
  //
  // "Production" is the stack that names itself so (utils/queueEnvironment.js),
  // not NODE_ENV: `npm start` sets NODE_ENV=production, and a laptop started
  // that way booked the public site's paid checkouts through its own server.
  const production = queueEnvironment(env) === 'production';
  if (!production && env.ABANDONED_CHECKOUT_JOB !== 'true') {
    log('asleep: set ABANDONED_CHECKOUT_JOB=true to run it outside production');
    return { stop: () => {} };
  }

  const baseUrl = `http://127.0.0.1:${port}`;
  const site = production ? 'site' : 'local';
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runOnce({ baseUrl, site });
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
  log(`started - every ${Math.round(intervalMs / MINUTE)} min, ${site === 'site' ? 'public site' : 'local'} checkouts`);
  return { stop: () => { clearTimeout(first); clearInterval(timer); }, tick };
}
