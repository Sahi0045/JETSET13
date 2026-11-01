/**
 * Posts every new booking, failed booking and cancellation to the alerts
 * channel, once each.
 *
 * Read from the booking rows, not sent from the code that changes them: a
 * booking is finished, failed or cancelled on Lightsail or on Vercel, by the
 * customer, the desk or a job, and the webhook lives only on Lightsail. What
 * was posted is kept in `booking_alert_log`, never on the booking row, so the
 * feed cannot race the booking chain's own writes.
 */
import supabase from '../config/supabase.js';
import { postToSlack } from './slackAlert.js';
import { readEveryCandidate } from './alarmCandidates.js';
import { alarmsMayRun } from './needsReviewAlert.job.js';
import { queueEnvironment } from '../utils/queueEnvironment.js';
import { bookingItineraries, itinerariesFromOffer, multiCityRoute, returnDateOf, tripTypeOf } from '../../shared/bookingItineraries.js';
import { TICKET_REFUSED_REASON, isTicketed, ticketsOf } from '../../shared/reviewQueue.js';

const DEFAULT_INTERVAL_MS = 60 * 1000;
const FIRST_RUN_DELAY_MS = 60 * 1000;
export const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const STALE_CLAIM_MS = 10 * 60 * 1000;
export const LOG_TABLE = 'booking_alert_log';

const log = (msg, extra = {}) => console.log(`[BookingFeed] ${msg}`, extra);

const timeOf = (value) => {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
};

const isFlight = (booking) => (booking?.travel_type || 'flight') === 'flight';

const isTrue = (value) => value === true || value === 'true';

const tookMoneyOrSeats = (cancellation) => cancellation.paymentAction !== 'NOTHING_TO_REFUND'
  || isTrue(cancellation.amadeusCancelled)
  || Number(cancellation.coinsReturned) > 0;

function isBooked(booking) {
  if (booking.status === 'cancelled' || booking.payment_status !== 'paid') return false;
  if (!isFlight(booking)) return true;
  const details = booking.booking_details || {};
  return Boolean(details.pnr) && (details.gds_chain?.state === 'finished' || isTicketed(details));
}

function failureOf(details) {
  if (details.fulfillment_failed) return { at: details.fulfillment_failed.at, why: 'fulfillment' };
  if (details.duplicate_refund) return { at: details.duplicate_refund.at, why: 'duplicate' };
  const cancellation = details.cancellation;
  if (String(cancellation?.reason || '').startsWith(TICKET_REFUSED_REASON)) return { at: cancellation.cancelledAt, why: 'ticket' };
  return null;
}

/**
 * The event a booking row shows now, if any: `failed` (paid, then not booked),
 * `cancelled` (anything was paid or held), or `booked`. A booking cancelled
 * before the feed saw it booked is announced once, as cancelled.
 *
 * @returns {Array<{ key: string, kind: 'booked'|'failed'|'cancelled', at: string|null, booking_reference: string }>}
 */
export function feedEventsOf(booking) {
  const ref = booking?.booking_reference;
  if (!ref) return [];
  const details = booking.booking_details || {};
  const failure = failureOf(details);
  let event = null;
  if (failure) event = { kind: 'failed', at: failure.at };
  else if (booking.status === 'cancelled' && details.cancellation && tookMoneyOrSeats(details.cancellation)) {
    event = { kind: 'cancelled', at: details.cancellation.cancelledAt };
  } else if (isBooked(booking)) {
    event = { kind: 'booked', at: details.gds_chain?.finishedAt || details.paid_at || details.payment_reconciled_at || booking.created_at };
  }
  return event ? [{ ...event, at: event.at || booking.updated_at || null, key: `${ref}:${event.kind}`, booking_reference: ref }] : [];
}

const escape = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const clip = (value, length = 200) => {
  const text = String(value ?? '').trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
};

const money = (amount, currency = 'USD') => {
  const number = Number(amount);
  return Number.isFinite(number) ? `${number.toFixed(2)} ${currency || 'USD'}` : null;
};

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

const flightNumberOf = (segment) => {
  const number = String(segment?.flightNumber || '').trim();
  const carrier = String(segment?.carrierCode || '').trim();
  return number && carrier && !number.startsWith(carrier) ? `${carrier}${number}` : number;
};

const isTestBooking = (details) => /(^|\.)test\./.test(String(details?.gds?.node || ''));

function tripLine(booking) {
  const details = booking.booking_details || {};
  if (!isFlight(booking)) {
    return [details.cruise_name || booking.travel_type, details.departure_date && `sails ${details.departure_date}`, details.duration]
      .filter(Boolean).map(escape).join(' · ');
  }
  const saved = bookingItineraries(booking);
  const pending = details.pending_booking_data || {};
  const legs = saved.length ? saved : itinerariesFromOffer(pending.flightData?.originalOffer || pending.bookingData?.originalOffer);
  const type = tripTypeOf(legs);
  const first = legs[0];
  const segment = first?.segments?.[0];
  const route = type === 'multiCity'
    ? multiCityRoute(legs)
    : first?.origin && first?.destination ? `${first.origin} ${type === 'roundTrip' ? '⇄' : '→'} ${first.destination}` : '';
  const departs = [segment?.departureDate || details.departure_date, segment?.departureTime].filter(Boolean).join(' ');
  const returns = type === 'roundTrip' ? returnDateOf(legs) : '';
  const flights = [...new Set(legs.flatMap((leg) => leg.segments || []).map(flightNumberOf).filter(Boolean))];
  const travellers = Number(details.verified_charge?.passengers);
  return [
    route,
    departs && `departs ${departs}`,
    returns && `returns ${returns}`,
    flights.join(', '),
    details.cabin_class && String(details.cabin_class).toLowerCase().replace(/_/g, ' '),
    travellers > 0 && plural(travellers, 'traveller'),
  ].filter(Boolean).map(escape).join(' · ');
}

const PAYMENT_ACTION = {
  VOID: 'payment voided, all of it back',
  REFUND: 'refunded',
  PARTIAL_REFUND: 'partly refunded',
  REFUND_UNDER_REVIEW: 'held for a person to decide',
  NOTHING_TO_REFUND: 'nothing was paid',
  REFUND_FAILED: '*refund FAILED*',
  ALREADY_REVERSED: 'already reversed',
  IN_PROGRESS: 'being returned',
};

function header(booking, emoji, title) {
  const test = isTestBooking(booking.booking_details) ? ' · :test_tube: _test booking (Amadeus test system)_' : '';
  return `${emoji} *${title}* — *${escape(booking.booking_reference)}*${test}`;
}

function bookedMessage(booking) {
  const details = booking.booking_details || {};
  const charge = details.verified_charge || {};
  const paid = money(details.arc_captured_amount ?? booking.total_amount, details.arc_captured_currency || details.currency);
  const tickets = ticketsOf(details).length;
  const ticketed = !isFlight(booking) ? null
    : isTicketed(details) ? `ticketed (${plural(tickets || 1, 'ticket')})` : '*not ticketed yet*';
  const extras = [
    charge.coupon?.code && `coupon ${charge.coupon.code}${Number(charge.discount) > 0 ? ` (−${money(charge.discount)})` : ''}`,
    Number(charge.walletCoins) > 0 && `${charge.walletCoins} Jet Coins used (${money(charge.walletAmount)})`,
    details.trip_reward?.code && `trip reward ${details.trip_reward.code}: ${money(Number(details.trip_reward.coins) / 100)} in coins after the trip`,
  ].filter(Boolean).map(escape);
  return [
    header(booking, ':white_check_mark:', isFlight(booking) ? 'New flight booking' : `New ${escape(booking.travel_type)} booking`),
    tripLine(booking),
    [paid && `paid ${paid}`, details.pnr && `PNR ${escape(details.pnr)}`, ticketed].filter(Boolean).join(' · '),
    extras.join(' · '),
  ].filter(Boolean).join('\n');
}

function failedMessage(booking) {
  const details = booking.booking_details || {};
  const failure = failureOf(details);
  let what;
  let refund;
  if (failure.why === 'ticket') {
    const cancellation = details.cancellation;
    what = cancellation.reason;
    refund = `${money(cancellation.refundAmount, cancellation.currency) || 'nothing'} back to the customer (${PAYMENT_ACTION[cancellation.paymentAction] || cancellation.paymentAction})`;
  } else {
    const record = failure.why === 'duplicate' ? details.duplicate_refund : details.fulfillment_failed.reversal || {};
    what = failure.why === 'duplicate'
      ? `a second payment for a trip already booked as ${details.needs_review?.duplicate_of || 'another booking'}`
      : details.fulfillment_failed.error;
    refund = record.reversed
      ? `${money(record.amount ?? booking.total_amount) || 'the payment'} back to the customer (${PAYMENT_ACTION[record.action] || record.action || 'reversed'})`
      : `*not returned (${record.action || 'no reversal'}): refund it by hand*`;
  }
  return [
    header(booking, ':rotating_light:', 'Booking failed after payment'),
    [tripLine(booking), details.pnr && `PNR ${escape(details.pnr)}`].filter(Boolean).join(' · '),
    `what happened: ${escape(clip(what) || 'not recorded')}`,
    `money: ${refund}`,
  ].filter(Boolean).join('\n');
}

function cancelledMessage(booking) {
  const details = booking.booking_details || {};
  const cancellation = details.cancellation;
  const fee = Number(cancellation.cancellationFee) > 0 ? `${money(cancellation.cancellationFee, cancellation.currency)} kept as the fee` : null;
  const coins = Number(cancellation.coinsReturned) > 0 ? `${cancellation.coinsReturned} Jet Coins returned` : null;
  return [
    header(booking, ':x:', 'Booking cancelled'),
    [tripLine(booking), details.pnr && `PNR ${escape(details.pnr)}`].filter(Boolean).join(' · '),
    `reason: ${escape(clip(cancellation.reason) || 'not given')}`,
    [
      `refund ${money(cancellation.refundAmount, cancellation.currency) || 'none'} (${PAYMENT_ACTION[cancellation.paymentAction] || escape(cancellation.paymentAction || 'unknown')})`,
      fee,
      coins,
      isFlight(booking) && (isTrue(cancellation.ticketsVoided) ? 'tickets voided' : isTicketed(details) ? 'tickets not voided' : null),
    ].filter(Boolean).join(' · '),
  ].filter(Boolean).join('\n');
}

export function feedMessage(event, booking) {
  if (event.kind === 'booked') return bookedMessage(booking);
  if (event.kind === 'failed') return failedMessage(booking);
  return cancelledMessage(booking);
}

/** Events within the lookback, oldest first, that the log has not posted or is not posting now. */
async function eventsToPost(now, { dryRun }) {
  const since = new Date(now - LOOKBACK_MS).toISOString();
  const { data, error } = await readEveryCandidate(() => supabase
    .from('bookings')
    .select('booking_reference, travel_type, status, payment_status, total_amount, created_at, updated_at, booking_details')
    .gte('updated_at', since)
    .order('created_at', { ascending: true }), log);
  if (error) throw new Error(`could not read bookings: ${error.message}`);

  const events = (data || [])
    .flatMap((booking) => feedEventsOf(booking).map((event) => ({ ...event, booking })))
    .filter((event) => (timeOf(event.at) ?? 0) >= now - LOOKBACK_MS)
    .sort((a, b) => timeOf(a.at) - timeOf(b.at));
  if (events.length === 0) return [];

  const { data: logged, error: logError } = await supabase
    .from(LOG_TABLE)
    .select('event_key, posted_at, claimed_at')
    .in('event_key', events.map((event) => event.key));
  if (logError) throw new Error(`could not read ${LOG_TABLE}: ${logError.message}`);

  const stale = (logged || []).filter((row) => !row.posted_at && (timeOf(row.claimed_at) ?? 0) < now - STALE_CLAIM_MS);
  if (stale.length && !dryRun) {
    await supabase.from(LOG_TABLE).delete().in('event_key', stale.map((row) => row.event_key)).is('posted_at', null);
  }
  const taken = new Set((logged || []).filter((row) => !stale.includes(row)).map((row) => row.event_key));
  return events.filter((event) => !taken.has(event.key));
}

export async function runOnce({ webhookUrl = process.env.ALERT_SLACK_WEBHOOK_URL, dryRun = false, now = Date.now() } = {}) {
  if (!webhookUrl && !dryRun) return { skipped: 'no ALERT_SLACK_WEBHOOK_URL' };

  const pending = await eventsToPost(now, { dryRun });
  if (pending.length === 0) return { announced: 0 };

  if (dryRun) {
    return {
      announced: 0,
      dryRun: true,
      wouldAnnounce: pending.map((event) => event.key),
      messages: pending.map((event) => feedMessage(event, event.booking)),
    };
  }

  const { data: claimed, error: claimError } = await supabase
    .from(LOG_TABLE)
    .upsert(pending.map((event) => ({ event_key: event.key, booking_reference: event.booking_reference, kind: event.kind })),
      { onConflict: 'event_key', ignoreDuplicates: true })
    .select('event_key');
  if (claimError) throw new Error(`could not claim events: ${claimError.message}`);
  const mine = new Set((claimed || []).map((row) => row.event_key));

  let announced = 0;
  for (const event of pending.filter((candidate) => mine.has(candidate.key))) {
    try {
      await postToSlack(feedMessage(event, event.booking), webhookUrl);
    } catch (error) {
      const unposted = pending.filter((candidate) => mine.has(candidate.key)).slice(announced).map((candidate) => candidate.key);
      await supabase.from(LOG_TABLE).delete().in('event_key', unposted).is('posted_at', null);
      throw error;
    }
    const { error: stampError } = await supabase.from(LOG_TABLE).update({ posted_at: new Date().toISOString() }).eq('event_key', event.key);
    if (stampError) log('posted but could not record it; it may be posted again', { event: event.key, error: stampError.message });
    announced += 1;
  }
  if (announced) log(`announced ${announced} event(s)`, { events: pending.filter((event) => mine.has(event.key)).map((event) => event.key) });
  return { announced };
}

export function startBookingFeedJob({ intervalMs = DEFAULT_INTERVAL_MS, env = process.env } = {}) {
  if (!supabase) return { stop: () => {} };

  if (!env.ALERT_SLACK_WEBHOOK_URL) {
    log('asleep: set ALERT_SLACK_WEBHOOK_URL to post bookings, failures and cancellations');
    return { stop: () => {} };
  }

  // Local development shares production's database: a laptop running this
  // would post production's bookings and log them as posted.
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
  log(`started - every ${Math.round(intervalMs / 1000)} s`);
  return { stop: () => { clearTimeout(first); clearInterval(timer); }, tick };
}
