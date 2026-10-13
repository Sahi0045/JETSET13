/**
 * Jet Coins on flights, two chores on one tick.
 *
 * Earning: one coin per whole dollar charged to the card, credited once the
 * booking's free-cancellation window has closed, and only while it is still
 * confirmed, paid and ticketed. A booking cancelled inside the window never
 * earns; one refunded later gives its coins back (wallet.service
 * reverseEarnedCoins, called from the refund paths).
 *
 * Stale holds: coins are held before a payment page exists, so a request that
 * dies, or a customer who never pays, leaves a hold behind. Past the time the
 * payment page can be paid, a hold with no booking row goes back, one on a
 * booking that was made is kept (captured), and one on an unpaid checkout goes
 * back only after the gateway has said nothing was paid - by the
 * abandoned-checkout job where it covers the row, by this sweep where it does
 * not.
 */
import supabase from '../config/supabase.js';
import { captureCoins, earnCoins, releaseCoins, reverseEarnedCoins } from '../services/wallet.service.js';
import { earnedCoinsFor } from '../../shared/jetCoins.js';
import { freeUntilOf } from '../../shared/flightCancelPolicy.js';
import { isTicketed } from '../../shared/reviewQueue.js';
import { officeTimeZoneOf } from '../services/amadeusSoap/config.js';
import { reconcileBookingPayment } from '../routes/payment/checkout.handlers.js';
import { queueEnvironment } from '../utils/queueEnvironment.js';
import { liveChainState, AUTO_COMPLETE_WINDOW_MS } from '../utils/bookingChainClaim.js';
import { PAYABLE_MS, LOOKBACK_MS as CHECKOUT_LOOKBACK_MS, checkoutSite } from './abandonedCheckout.job.js';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const LOOKBACK_MS = 30 * DAY;
const PAGE_SIZE = 500;
const CHUNK = 50;
const EARN_LIMIT = 200;
const SWEEP_LIMIT = 50;
const GATEWAY_ASKS = 5;

const warn = (message, extra = {}) => console.warn(`⚠️ Wallet: ${message}`, extra);

/**
 * Every row of a query, a page at a time. `build` makes a fresh, ordered query
 * for each page. A read that fails throws: a partial list is not a list.
 */
async function readAll(build, pageSize) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if ((data || []).length < pageSize) return rows;
  }
}

const chunksOf = (list, size) => {
  const chunks = [];
  for (let index = 0; index < list.length; index += size) chunks.push(list.slice(index, index + size));
  return chunks;
};

const earnsCoins = (row) => row?.travel_type === 'flight'
  && row.status === 'confirmed'
  && row.payment_status === 'paid'
  && isTicketed(row.booking_details);

const windowClosed = (row, now, timeZone) => {
  const until = freeUntilOf(row.created_at, timeZone);
  return Boolean(until) && Date.parse(until) <= now;
};

/**
 * Whether a booking still earns, read again after its coins were credited.
 * null when it could not be read.
 */
async function stillEarns(client, bookingReference) {
  const { data, error } = await client.from('bookings')
    .select('travel_type, status, payment_status, booking_details')
    .eq('booking_reference', bookingReference)
    .maybeSingle();
  if (error || !data) return null;
  return earnsCoins(data);
}

export async function earnOnce({
  client = supabase,
  now = Date.now(),
  timeZone = officeTimeZoneOf(),
  earn = earnCoins,
  reverse = reverseEarnedCoins,
  limit = EARN_LIMIT,
  pageSize = PAGE_SIZE,
} = {}) {
  const result = { credited: 0, skipped: 0, reversed: 0 };
  const windowStart = new Date(now - LOOKBACK_MS).toISOString();

  /**
   * The whole lookback is read, never its first rows: a booking that earns
   * nothing (not ticketed, no coins) stays in the window for 30 days, so a
   * newest-last page of the oldest bookings would fill up with them and the
   * ones behind it would never be reached. Only the light columns are read for
   * that, and the heavy booking_details only for bookings not yet earned.
   */
  let due;
  let earned;
  try {
    const candidates = await readAll(() => client.from('bookings')
      .select('booking_reference, user_id, created_at')
      .eq('travel_type', 'flight')
      .eq('status', 'confirmed')
      .eq('payment_status', 'paid')
      .not('user_id', 'is', null)
      .gte('created_at', windowStart)
      .lte('created_at', new Date(now - 60 * MINUTE).toISOString())
      .order('created_at', { ascending: true })
      .order('booking_reference', { ascending: true }), pageSize);
    due = candidates.filter((row) => windowClosed(row, now, timeZone));
    if (!due.length) return result;

    const entries = await readAll(() => client.from('wallet_entries')
      .select('idempotency_key')
      .eq('kind', 'earn')
      .gte('created_at', windowStart)
      .order('id', { ascending: true }), pageSize);
    earned = new Set(entries.map((entry) => String(entry.idempotency_key)));
  } catch (error) {
    warn('earnings could not be read', { error: error.message });
    return result;
  }

  const todo = due.filter((row) => !earned.has(`earn:${row.booking_reference}`));
  let attempts = 0;
  for (const refs of chunksOf(todo.map((row) => row.booking_reference), CHUNK)) {
    if (attempts >= limit) break;
    const { data: rows, error } = await client.from('bookings')
      .select('booking_reference, user_id, status, payment_status, travel_type, created_at, booking_details')
      .in('booking_reference', refs);
    if (error) {
      warn('bookings could not be read', { error: error.message });
      continue;
    }
    for (const row of [...(rows || [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
      if (attempts >= limit) break;
      const coins = earnedCoinsFor(row.booking_details?.verified_charge?.total);
      if (!row.user_id || coins <= 0 || !earnsCoins(row) || !windowClosed(row, now, timeZone)) {
        result.skipped += 1;
        continue;
      }
      attempts += 1;
      let outcome;
      try {
        outcome = await earn(client, { userId: row.user_id, bookingReference: row.booking_reference, coins });
      } catch (earnError) {
        result.skipped += 1;
        warn('could not credit', { bookingReference: row.booking_reference, code: earnError.code });
        continue;
      }
      if (outcome?.applied === false) {
        result.skipped += 1;
        continue;
      }

      /**
       * A cancel that finished between the read above and the credit has
       * already looked for coins to take back and found none. Nothing would
       * take these back afterwards, so the booking is read again.
       */
      const stands = await stillEarns(client, row.booking_reference);
      if (stands === false) {
        try {
          await reverse(client, row.booking_reference);
          result.reversed += 1;
        } catch (reverseError) {
          console.error('⚠️ Wallet: coins credited to a booking that no longer earns could not be taken back', {
            bookingReference: row.booking_reference, code: reverseError.code,
          });
        }
        continue;
      }
      if (stands === null) warn('could not confirm a booking still earns after crediting it', { bookingReference: row.booking_reference });
      result.credited += 1;
    }
  }
  if (result.credited || result.reversed) {
    console.log(`🪙 Wallet earn: ${result.credited} credited, ${result.reversed} taken back, ${result.skipped} skipped`);
  }
  return result;
}

const unpaidSite = () => (queueEnvironment() === 'production' ? 'site' : 'local');

/**
 * What to do with one hold that is past the time its payment page can be paid.
 * Pure. `row` is the booking with the hold's reference, or undefined when there
 * is none.
 */
export function decideStaleHold(row, { now = Date.now(), site = unpaidSite() } = {}) {
  const skip = (reason) => ({ action: 'skip', reason });
  if (!row) return { action: 'release', reason: 'no-booking-row' };

  const details = row.booking_details || {};
  if (row.status === 'cancelled' || ['refunded', 'partially_refunded'].includes(row.payment_status)) return skip('cancelled-or-refunded');
  if (row.payment_status === 'paid' || details.pnr || isTicketed(details)) return { action: 'capture', reason: 'booked' };
  if (details.queued_order || details.needs_review) return skip('owned-by-queue-or-review');
  if (liveChainState(details.gds_chain, now)) return skip('booking-in-progress');

  // The gateway can only be asked with this site's own merchant: another
  // site's order reads as "no such order" here, which is not "never paid".
  if (checkoutSite(row) !== site) return skip(checkoutSite(row) ? 'other-site' : 'site-unknown');

  const age = now - Date.parse(row.created_at);
  if (!Number.isFinite(age)) return skip('time-unreadable');
  const coveredByAbandonedCheckout = Boolean(details.success_indicator && details.pending_booking_data) && age <= CHECKOUT_LOOKBACK_MS;
  if (coveredByAbandonedCheckout) return skip('left-to-abandoned-checkout');
  if (age <= AUTO_COMPLETE_WINDOW_MS) return skip('too-soon');
  return { action: 'ask-gateway', reason: 'not-covered-by-abandoned-checkout' };
}

export async function sweepStaleHolds({
  client = supabase,
  now = Date.now(),
  site = unpaidSite(),
  limit = SWEEP_LIMIT,
  gatewayAsks = GATEWAY_ASKS,
  pageSize = PAGE_SIZE,
  reconcile = reconcileBookingPayment,
  release = releaseCoins,
  capture = captureCoins,
} = {}) {
  const result = { released: 0, captured: 0, failed: 0, skipped: [] };
  const skip = (bookingReference, reason) => result.skipped.push({ bookingReference, reason });

  let holds;
  try {
    holds = await readAll(() => client.from('wallet_holds')
      .select('booking_reference, coins, created_at')
      .eq('status', 'held')
      .lte('created_at', new Date(now - PAYABLE_MS).toISOString())
      .order('created_at', { ascending: true })
      .order('booking_reference', { ascending: true }), pageSize);
  } catch (error) {
    warn('holds could not be read', { error: error.message });
    return result;
  }
  if (!holds.length) return result;

  /**
   * A failed read is not "no booking": it would release the coins of a
   * checkout that may have been paid.
   */
  const rows = new Map();
  const unreadable = new Set();
  for (const refs of chunksOf(holds.map((hold) => hold.booking_reference), CHUNK)) {
    const { data, error } = await client.from('bookings')
      .select('id, booking_reference, status, payment_status, total_amount, created_at, booking_details')
      .in('booking_reference', refs);
    if (error) {
      warn('bookings behind stale holds could not be read', { error: error.message });
      refs.forEach((ref) => unreadable.add(ref));
      continue;
    }
    (data || []).forEach((row) => rows.set(row.booking_reference, row));
  }

  let changes = 0;
  let asks = 0;
  const apply = async (bookingReference, action) => {
    changes += 1;
    try {
      if (action === 'release') {
        const outcome = await release(client, bookingReference);
        if (outcome?.status === 'released') result.released += 1;
        else skip(bookingReference, `release-${outcome?.status || 'unknown'}`);
      } else {
        const outcome = await capture(client, bookingReference);
        if (outcome?.status === 'captured') result.captured += 1;
        else skip(bookingReference, `capture-${outcome?.status || 'unknown'}`);
      }
    } catch (error) {
      result.failed += 1;
      console.error('⚠️ Wallet: a stale hold could not be settled', { bookingReference, action, code: error.code });
    }
  };

  for (const { booking_reference: bookingReference } of holds) {
    if (unreadable.has(bookingReference)) { skip(bookingReference, 'booking-unreadable'); continue; }
    const row = rows.get(bookingReference);
    let decision = decideStaleHold(row, { now, site });

    if (decision.action === 'ask-gateway') {
      if (asks >= gatewayAsks) { skip(bookingReference, 'gateway-asks-used'); continue; }
      asks += 1;
      let payment;
      try {
        payment = await reconcile(row);
      } catch (error) {
        skip(bookingReference, 'gateway-unavailable');
        warn('a stale hold\'s payment could not be checked', { bookingReference, error: error.message });
        continue;
      }
      // The same reading as the abandoned-checkout job (settle): a 400 or 404
      // for an order with no PNR is "never paid", any other non-answer is an outage.
      const neverSeen = payment.gatewayUnavailable && [400, 404].includes(payment.gatewayStatus) && !row.booking_details?.pnr;
      if (payment.paid) decision = { action: 'capture', reason: 'paid-at-gateway' };
      else if (payment.gatewayUnavailable && !neverSeen) { skip(bookingReference, 'gateway-unavailable'); continue; }
      else if (Number(payment.heldAmount) > 0) { skip(bookingReference, 'money-held-at-gateway'); continue; }
      else decision = { action: 'release', reason: 'not-paid-at-gateway' };
    }

    if (decision.action === 'skip') { skip(bookingReference, decision.reason); continue; }
    if (changes >= limit) { skip(bookingReference, 'run-limit'); continue; }
    await apply(bookingReference, decision.action);
  }

  console.log(`🪙 Wallet holds: ${holds.length} past their payment window, ${result.released} released, ${result.captured} kept, ${result.failed} failed`, {
    left: result.skipped.slice(0, 10),
  });
  return result;
}

export async function tickOnce(options = {}) {
  const { client, now, timeZone, site, earn, reverse, release, capture, reconcile } = options;
  const tick = { earn: null, sweep: null };
  try {
    tick.earn = await earnOnce({ client, now, timeZone, earn, reverse });
  } catch (error) {
    console.error('⚠️ Wallet earn run failed:', error.message);
  }
  try {
    tick.sweep = await sweepStaleHolds({ client, now, site, release, capture, reconcile });
  } catch (error) {
    console.error('⚠️ Wallet hold sweep failed:', error.message);
  }
  return tick;
}

export function startWalletEarnJob({ intervalMs = 15 * MINUTE } = {}) {
  if (!supabase) return () => {};
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await tickOnce();
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  const first = setTimeout(tick, MINUTE);
  timer.unref?.();
  first.unref?.();
  return () => { clearInterval(timer); clearTimeout(first); };
}
