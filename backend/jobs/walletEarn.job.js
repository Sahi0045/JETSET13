/**
 * Jet Coins on flights, three chores on one tick.
 *
 * Earning: one coin per whole dollar charged to the card, credited once the
 * booking's free-cancellation window has closed, and only while it is still
 * ticketed, paid and not cancelled (a booking ticketed by hand stays
 * pending_ticketing). A booking cancelled inside the window never
 * earns; one refunded later gives its coins back (wallet.service
 * reverseEarnedCoins, called from the refund paths).
 *
 * Stale holds: coins are held before a payment page exists, so a request that
 * dies, or a customer who never pays, leaves a hold behind. Past the time the
 * payment page can be paid, a hold with no booking row goes back, one on a
 * booking with a reservation is kept (captured), a paid checkout with none is
 * put in front of a person, and one on an unpaid checkout goes back only after
 * the gateway has said nothing was paid - by the abandoned-checkout job where it
 * covers the row, by this sweep where it does not.
 *
 * Trip rewards: a trip-reward voucher reserved on a booking is paid into the
 * wallet once its payout date has passed and the booking, read again just
 * before paying, is still ticketed and not cancelled. One whose booking was
 * cancelled or refunded without the reward being voided is voided here on any
 * run, however far off its payout date is, or whether it has none.
 */
import supabase from '../config/supabase.js';
import { captureCoins, earnCoins, payTripVoucher, releaseCoins, reverseEarnedCoins, voidTripReward } from '../services/wallet.service.js';
import { sendEmail } from '../services/emailService.js';
import { generateTripRewardTemplate } from '../services/email/templates.js';
import { isUsableEmail } from '../../shared/email.js';
import { earnedCoinsFor } from '../../shared/jetCoins.js';
import { freeUntilOf } from '../../shared/flightCancelPolicy.js';
import { isTicketed } from '../../shared/reviewQueue.js';
import { officeTimeZoneOf } from '../services/amadeusSoap/config.js';
import { reconcileBookingPayment } from '../routes/payment/checkout.handlers.js';
import { queueEnvironment } from '../utils/queueEnvironment.js';
import { liveChainState, AUTO_COMPLETE_WINDOW_MS } from '../utils/bookingChainClaim.js';
import { PAYABLE_MS, LOOKBACK_MS as CHECKOUT_LOOKBACK_MS, checkoutSite, flagForReview } from './abandonedCheckout.job.js';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const LOOKBACK_MS = 30 * DAY;
const PAGE_SIZE = 500;
const CHUNK = 50;
const EARN_LIMIT = 200;
const REWARD_LIMIT = 200;
const REWARD_VOID_LIMIT = 50;
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

const EARNING_STATUSES = ['confirmed', 'pending_ticketing'];

const earnsCoins = (row, now) => row?.travel_type === 'flight'
  && EARNING_STATUSES.includes(row.status)
  && row.payment_status === 'paid'
  && isTicketed(row.booking_details)
  && liveChainState(row.booking_details?.gds_chain, now) !== 'cancelling';

// Every checkout since the wallet launched records walletCoins (0 when none): older bookings earn nothing retroactively.
const checkedOutWithWallet = (details) => {
  const coins = details?.verified_charge?.walletCoins;
  return coins !== undefined && coins !== null && Number.isFinite(Number(coins));
};

const windowClosed = (row, now, timeZone) => {
  const until = freeUntilOf(row.created_at, timeZone);
  return Boolean(until) && Date.parse(until) <= now;
};

/**
 * Whether a booking earns on a fresh read of it. null when it could not be read.
 */
async function earnsNow(client, bookingReference, now) {
  const { data, error } = await client.from('bookings')
    .select('travel_type, status, payment_status, booking_details')
    .eq('booking_reference', bookingReference)
    .maybeSingle();
  if (error || !data) return null;
  return earnsCoins(data, now);
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
      .in('status', EARNING_STATUSES)
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
      if (!row.user_id || coins <= 0 || !checkedOutWithWallet(row.booking_details) || !earnsCoins(row, now) || !windowClosed(row, now, timeZone)) {
        result.skipped += 1;
        continue;
      }

      /**
       * A cancel reverses earned coins and only then writes `cancelled`; a
       * credit landing in between would never be taken back. So the booking is
       * read fresh just before it is credited, and one being cancelled waits.
       */
      const earnsBefore = await earnsNow(client, row.booking_reference, now);
      if (earnsBefore !== true) {
        result.skipped += 1;
        if (earnsBefore === null) warn('could not confirm a booking still earns before crediting it', { bookingReference: row.booking_reference });
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
      const stands = await earnsNow(client, row.booking_reference, now);
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
  // Only a reservation makes the coins spent. A captured hold can no longer be
  // released, so a paid checkout that was never booked would lose its coins
  // quietly when the abandoned-checkout job refunds it.
  if (details.pnr || isTicketed(details)) return { action: 'capture', reason: 'booked' };
  if (details.queued_order || details.needs_review) return skip('owned-by-queue-or-review');
  if (liveChainState(details.gds_chain, now)) return skip('booking-in-progress');

  const rowSite = checkoutSite(row);
  const age = now - Date.parse(row.created_at);
  // The job books a paid checkout within its auto-complete window and flags it itself after, up to its lookback.
  const coveredByAbandonedCheckout = rowSite === site
    && Boolean(details.success_indicator && details.pending_booking_data)
    && age <= CHECKOUT_LOOKBACK_MS;

  if (row.payment_status === 'paid') {
    if (coveredByAbandonedCheckout) return skip('left-to-abandoned-checkout');
    return rowSite && rowSite !== site ? skip('other-site') : { action: 'flag', reason: 'paid-not-booked' };
  }

  // The gateway can only be asked with this site's own merchant: another
  // site's order reads as "no such order" here, which is not "never paid".
  if (rowSite !== site) return skip(rowSite ? 'other-site' : 'site-unknown');

  if (!Number.isFinite(age)) return skip('time-unreadable');
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
  flag = flagForReview,
} = {}) {
  const result = { released: 0, captured: 0, flagged: 0, failed: 0, skipped: [] };
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

  const flagPaidUnbooked = async (row) => {
    changes += 1;
    const bookingReference = row.booking_reference;
    skip(bookingReference, 'paid-not-booked');
    try {
      const outcome = await flag(row, 'Paid, but not booked, and the Jet Coins it used are still on hold: book it by hand or refund it.');
      if (outcome === 'flagged') result.flagged += 1;
      warn('a paid checkout with no reservation holds coins', { bookingReference, flag: outcome });
    } catch (error) {
      result.failed += 1;
      console.error('⚠️ Wallet: a paid checkout with no reservation could not be flagged', { bookingReference, error: error.message });
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
      if (payment.paid) decision = { action: 'flag', reason: 'paid-at-gateway-not-booked' };
      else if (payment.gatewayUnavailable && !neverSeen) { skip(bookingReference, 'gateway-unavailable'); continue; }
      else if (Number(payment.heldAmount) > 0) { skip(bookingReference, 'money-held-at-gateway'); continue; }
      else decision = { action: 'release', reason: 'not-paid-at-gateway' };
    }

    if (decision.action === 'skip') { skip(bookingReference, decision.reason); continue; }
    if (changes >= limit) { skip(bookingReference, 'run-limit'); continue; }
    if (decision.action === 'flag') await flagPaidUnbooked(row);
    else await apply(bookingReference, decision.action);
  }

  console.log(`🪙 Wallet holds: ${holds.length} past their payment window, ${result.released} released, ${result.captured} kept, ${result.flagged} flagged, ${result.failed} failed`, {
    left: result.skipped.slice(0, 10),
  });
  return result;
}

const REVERSED_PAYMENTS = ['refunded', 'reversed'];
const PAYING_PAYMENTS = ['paid', 'partially_refunded'];

const rewardLost = (row) => row.status === 'cancelled' || REVERSED_PAYMENTS.includes(String(row.payment_status || '').toLowerCase());

/** What the payout does with a trip reward, from a fresh read of its booking. Pure. */
export function tripRewardVerdict(row, now = Date.now()) {
  if (!row) return 'wait';
  if (rewardLost(row)) return 'void';
  if (row.travel_type !== 'flight' || !EARNING_STATUSES.includes(row.status)) return 'wait';
  if (!PAYING_PAYMENTS.includes(String(row.payment_status || '').toLowerCase())) return 'wait';
  const details = row.booking_details || {};
  if (!isTicketed(details) || liveChainState(details.gds_chain, now) === 'cancelling') return 'wait';
  return 'pay';
}

/** Best effort: a failed email is logged and never retried, so nobody is emailed twice. */
export async function sendTripRewardEmail({ client = supabase, reward, booking, send = sendEmail }) {
  try {
    const { data: user } = await client.from('users').select('email, first_name, name').eq('id', reward.user_id).maybeSingle();
    const details = booking?.booking_details || {};
    const to = [user?.email, details.customer_email].find(isUsableEmail);
    if (!to) {
      warn('a trip reward was paid but nobody can be emailed', { bookingReference: booking?.booking_reference });
      return false;
    }
    await send({
      to,
      subject: 'Your Jet Coins have arrived',
      html: generateTripRewardTemplate({
        customerName: user?.first_name || user?.name || '',
        coins: reward.coins,
        code: reward.code,
        bookingReference: booking?.booking_reference,
        origin: details.origin,
        destination: details.destination,
      }),
    });
    return true;
  } catch (error) {
    console.error('⚠️ Wallet: the Jet Coins email could not be sent', { bookingReference: booking?.booking_reference, error: error.message });
    return false;
  }
}

const rewardDueAt = (row) => {
  const at = Date.parse(row.due_at);
  return Number.isFinite(at) ? at : null;
};

export async function payTripRewardsOnce({
  client = supabase,
  now = Date.now(),
  pay = payTripVoucher,
  voidReward = voidTripReward,
  notify = sendTripRewardEmail,
  limit = REWARD_LIMIT,
  voidLimit = REWARD_VOID_LIMIT,
  pageSize = PAGE_SIZE,
} = {}) {
  const result = { paid: 0, voided: 0, waiting: 0, failed: 0 };
  let pending;
  try {
    pending = (await readAll(() => client.from('voucher_redemptions')
      .select('booking_reference, user_id, coins, due_at')
      .eq('status', 'pending')
      .order('booking_reference', { ascending: true }), pageSize))
      .filter((row) => row.booking_reference);
  } catch (error) {
    warn('trip rewards could not be read', { error: error.message });
    return result;
  }
  if (!pending.length) return result;

  const handled = new Set();
  const voided = new Set();
  const voidOne = async (bookingReference) => {
    let outcome;
    try {
      outcome = await voidReward(client, bookingReference);
    } catch (voidError) {
      outcome = { ok: false, status: 'error' };
      console.error('⚠️ Wallet: a trip reward could not be voided', { bookingReference, error: voidError.message });
    }
    if (outcome?.status === 'void') {
      result.voided += 1;
      voided.add(bookingReference);
    } else if (!outcome?.ok) {
      result.failed += 1;
    }
  };

  const due = pending
    .filter((row) => rewardDueAt(row) !== null && rewardDueAt(row) <= now)
    .sort((a, b) => (rewardDueAt(a) - rewardDueAt(b)) || (a.booking_reference < b.booking_reference ? -1 : 1));

  let attempts = 0;
  for (const { booking_reference: bookingReference } of due) {
    if (attempts >= limit) break;
    handled.add(bookingReference);
    const { data: booking, error } = await client.from('bookings')
      .select('booking_reference, user_id, travel_type, status, payment_status, booking_details')
      .eq('booking_reference', bookingReference)
      .maybeSingle();
    if (error || !booking) {
      result.waiting += 1;
      warn('the booking behind a due trip reward could not be read', { bookingReference });
      continue;
    }
    const verdict = tripRewardVerdict(booking, now);
    if (verdict === 'wait') {
      result.waiting += 1;
      continue;
    }
    attempts += 1;
    if (verdict === 'void') {
      await voidOne(bookingReference);
      continue;
    }
    let outcome;
    try {
      outcome = await pay(client, bookingReference);
    } catch (payError) {
      result.failed += 1;
      console.error('⚠️ Wallet: a trip reward could not be paid; the next run tries again', { bookingReference, code: payError.code });
      continue;
    }
    if (outcome?.status !== 'paid' || outcome.applied !== true) continue;
    result.paid += 1;
    try {
      await notify({ client, reward: outcome, booking });
    } catch (notifyError) {
      console.error('⚠️ Wallet: the Jet Coins email could not be sent', { bookingReference, error: notifyError.message });
    }
  }

  /**
   * A reward whose void failed at cancel time stays pending, and the pass above
   * reaches it only once it is due: one with a payout date years off, or none,
   * would hold its voucher until then. Light columns, a chunk at a time.
   */
  try {
    const open = pending.filter((row) => !handled.has(row.booking_reference)).map((row) => row.booking_reference);
    let voids = 0;
    scan: for (const refs of chunksOf(open, CHUNK)) {
      const { data, error } = await client.from('bookings')
        .select('booking_reference, status, payment_status')
        .in('booking_reference', refs);
      if (error) {
        warn('bookings behind pending trip rewards could not be read', { error: error.message });
        continue;
      }
      for (const row of data || []) {
        if (!rewardLost(row)) continue;
        if (voids >= voidLimit) break scan;
        voids += 1;
        await voidOne(row.booking_reference);
      }
    }
  } catch (clearError) {
    warn('pending trip rewards could not be cleared', { error: clearError.message });
  }

  const undated = pending.filter((row) => rewardDueAt(row) === null && !voided.has(row.booking_reference)).length;
  if (undated) warn('trip rewards with no payout date stay pending until one is set', { count: undated });

  if (result.paid || result.voided || result.failed) {
    console.log(`🪙 Trip rewards: ${result.paid} paid, ${result.voided} voided, ${result.failed} failed, ${result.waiting} waiting`);
  }
  return result;
}

export async function tickOnce(options = {}) {
  const { client, now, timeZone, site, earn, reverse, release, capture, reconcile, pay, voidReward, notify } = options;
  const tick = { earn: null, sweep: null, rewards: null };
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
  try {
    tick.rewards = await payTripRewardsOnce({ client, now, pay, voidReward, notify });
  } catch (error) {
    console.error('⚠️ Trip reward payout failed:', error.message);
  }
  return tick;
}

export function startWalletEarnJob({ intervalMs = 15 * MINUTE, env = process.env } = {}) {
  if (!supabase) return { stop: () => {} };

  // It writes to every customer's wallet, so a laptop on the shared database must not run it.
  if (queueEnvironment(env) !== 'production' && env.WALLET_JOB !== 'true') {
    console.log('[WalletEarn] asleep: set WALLET_JOB=true to run it outside production');
    return { stop: () => {} };
  }

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
  return { stop: () => { clearInterval(timer); clearTimeout(first); }, tick };
}
