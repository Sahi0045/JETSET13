/**
 * Tells JetCRM about every paid booking, ticket, failure and cancellation.
 *
 * Read from the booking rows, like the Slack booking feed and for the same
 * reason: a booking is finished, failed or cancelled on Lightsail or on
 * Vercel, by the customer, the desk or a job. Each event carries a message id
 * made from the booking reference, and the CRM stores a message id once, so
 * re-sending after a restart cannot count anything twice. No table of its own.
 */
import supabase from '../config/supabase.js';
import { readEveryCandidate } from './alarmCandidates.js';
import { alarmsMayRun } from './needsReviewAlert.job.js';
import { feedEventsOf, LOOKBACK_MS } from './bookingFeed.job.js';
import { queueEnvironment } from '../utils/queueEnvironment.js';
import { bookingItineraries } from '../../shared/bookingItineraries.js';
import { isTicketed, ticketsOf } from '../../shared/reviewQueue.js';
import { crmConfig, sendCrmEvents } from '../services/crmClient.js';

const DEFAULT_INTERVAL_MS = 2 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 90 * 1000;

const log = (msg, extra = {}) => console.log(`[CrmFeed] ${msg}`, extra);

const amount = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : null;
};

const routeOf = (booking) => {
  const first = bookingItineraries(booking)[0];
  return first?.origin && first?.destination ? `${first.origin}-${first.destination}` : null;
};

const compact = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== null && value !== undefined && value !== ''));

/**
 * The CRM events a booking row stands for now. A booked trip is a payment, a
 * booking and, once issued, a ticket; a cancellation is the cancel and, when
 * money went back, a refund.
 */
export function crmEventsOf(booking) {
  const details = booking?.booking_details || {};
  const who = compact({
    userId: booking?.user_id ? String(booking.user_id) : null,
    traits: compact({ email: details.customer_email, name: details.customer_name }),
  });
  if (!who.userId && !who.traits?.email) return [];

  const base = compact({
    bookingRef: booking.booking_reference,
    product: booking.travel_type || 'flight',
    route: routeOf(booking),
    pnr: details.pnr,
  });
  const event = (name, key, at, properties = {}) => ({
    messageId: `booking:${key}`, event: name, timestamp: at || booking.updated_at || booking.created_at, ...who, properties: compact({ ...base, ...properties }),
  });

  return feedEventsOf(booking).flatMap(({ kind, key, at }) => {
    if (kind === 'booked') {
      return [
        event('Payment Succeeded', `${key}:paid`, details.paid_at || at, { amountUsd: amount(booking.total_amount) }),
        event('Booked', key, at),
        ...(isTicketed(details) ? [event('Ticketed', `${key}:ticketed`, at, { tickets: ticketsOf(details).length || null })] : []),
      ];
    }
    if (kind === 'failed') return [event('Booking Failed', key, at)];
    const cancellation = details.cancellation || {};
    const refunded = amount(cancellation.refundAmount);
    return [
      event('Cancelled', key, at),
      ...(refunded ? [event('Refunded', `${key}:refunded`, at, { amountUsd: refunded })] : []),
    ];
  });
}

export async function runOnce({ env = process.env, now = Date.now(), sent = new Set(), send = sendCrmEvents } = {}) {
  if (!crmConfig(env)) return { skipped: 'CRM not configured' };
  const since = new Date(now - LOOKBACK_MS).toISOString();
  const { data, error } = await readEveryCandidate(() => supabase
    .from('bookings')
    .select('booking_reference, user_id, travel_type, status, payment_status, total_amount, created_at, updated_at, booking_details')
    .gte('updated_at', since)
    .order('created_at', { ascending: true }), log);
  if (error) throw new Error(`could not read bookings: ${error.message}`);

  const events = (data || []).flatMap(crmEventsOf).filter((event) => !sent.has(event.messageId));
  if (events.length === 0) return { sent: 0 };
  await send(events, { env });
  for (const event of events) sent.add(event.messageId);
  return { sent: events.length };
}

export function startCrmFeedJob({ intervalMs = DEFAULT_INTERVAL_MS, env = process.env } = {}) {
  if (!supabase) return { stop: () => {} };
  if (!crmConfig(env)) {
    log('asleep: set CRM_ENDPOINT and CRM_SERVER_KEY to report bookings to JetCRM');
    return { stop: () => {} };
  }
  // Local development shares production's database: a laptop running this
  // would report production's bookings.
  if (!alarmsMayRun(env)) {
    log(`asleep: this is '${queueEnvironment(env)}', not production (set ALERT_JOBS=true to run it here)`);
    return { stop: () => {} };
  }

  const sent = new Set();
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runOnce({ env, sent });
      if (result.sent) log(`reported ${result.sent} event(s)`);
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
  log(`started - every ${Math.round(intervalMs / 1000)} s`);
  return { stop: () => { clearTimeout(first); clearInterval(timer); }, tick };
}
