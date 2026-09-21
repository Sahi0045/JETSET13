/**
 * Announce bookings that took money but never produced a ticket.
 *
 * The booking chain deliberately does NOT refund once the PNR is committed: if
 * ticketing fails after that point it keeps the booking, sets
 * `booking_details.needs_review`, and expects a human to finish the ticket by
 * hand (flight.routes.js, the `committed` branch).
 *
 * Nobody was watching that queue. An audit on 2026-09-12 found two bookings -
 * FLTMTPR74L5 (6 Sep) and FLTDE65B4DDB7A44E (11 Sep) - sitting `confirmed` and
 * `paid` with a PNR and no ticket, unnoticed for days. Booking is disabled in
 * production, so today that costs nothing; once it is live, the same silence is
 * a customer holding a worthless confirmation.
 *
 * Runs inside the API process, like the booking-queue worker, so it works
 * wherever the app is deployed with no extra software or second login.
 *
 * Delivery is a Slack incoming webhook (`ALERT_SLACK_WEBHOOK_URL`): one URL in
 * the environment, no SDK, no OAuth. Without it the job stays asleep rather
 * than failing, so a deploy that has not been given a webhook is not a crash.
 */
import supabase from '../config/supabase.js';
import { postToSlack } from './slackAlert.js';
import { unchangedSince } from '../utils/bookingDetailsGuard.js';
import { queueEnvironment } from '../utils/queueEnvironment.js';
import {
  NO_CONFIRMED_SEAT_REVIEW_REASON, TICKET_NUMBERS_MISSING, flagsInForce, isFailedCancellation, isTicketed,
  isUnrecordedCancellation, needsAirlineRefundClaim, ticketNumbersMissingOf, ticketsOf, unrecordedCancellationOf,
} from '../../shared/reviewQueue.js';

/**
 * Whether the Slack alarms may run in this process: on the stack that names
 * itself production (utils/queueEnvironment.js - not NODE_ENV, which `npm
 * start` sets on any machine), or where ALERT_JOBS=true asks for them by name.
 * Shared with the failed-refund alarm so the two cannot disagree.
 */
export const alarmsMayRun = (env = process.env) => queueEnvironment(env) === 'production' || env.ALERT_JOBS === 'true';

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 60 * 1000;      // let the app finish booting first

const log = (msg, extra = {}) => console.log(`[NeedsReviewAlert] ${msg}`, extra);

/**
 * The flag written on an ordinary unticketed reservation this job announces.
 * It describes the booking as the order route left it, not a new problem, so
 * the route still owes that booking its confirmation email
 * (confirmationEmailOwed in routes/flight.routes.js).
 */
export const UNTICKETED_REVIEW_REASON = 'PNR committed, never ticketed';

/**
 * Which flagged bookings actually deserve waking someone up.
 *
 * Exported and pure so it can be tested without a database, and so the manual
 * script (scripts/alerts/needs-review-watch.mjs) and this job cannot drift
 * apart - the filtering is the part that decides whether an alert channel stays
 * trusted or gets muted.
 *
 * @param {Array<object>} rows - booking rows carrying `booking_details`
 * @returns {Array<object>} the rows worth announcing
 */
export function selectUnannounced(rows = []) {
  return rows.filter((booking) => {
    if (!booking) return false;
    const details = booking.booking_details || {};
    const review = details.needs_review;
    if (review?.alerted_at) return false;         // already announced once

    // A cancellation with a refund still to claim from the airline. It is
    // cancelled and ticketed, so both checks below would skip it - and did.
    if (needsAirlineRefundClaim(booking)) return true;
    // A cancellation carried out but not recorded. A retry that voided the
    // tickets leaves none to claim, and the booking still reads ticketed, so
    // the checks below skipped it: seats and money moved, nobody told.
    if (isUnrecordedCancellation(booking)) return true;
    // A cancel the airline refused. The PNR is live and the customer was told
    // our team had been alerted, but a ticketed booking - one whose void went
    // through for some tickets only, too - was skipped below as done.
    if (isFailedCancellation(booking)) return true;

    // The ticket turned up later, by retry or by hand. Not the chain's own
    // "issued, but the numbers did not all arrive": that row is ticketed by
    // definition, and skipping it here meant nobody was ever told.
    const numbersMissing = review?.reason === TICKET_NUMBERS_MISSING;
    if (!numbersMissing && details.gds?.ticketed === true) return false;
    if (!numbersMissing && Array.isArray(details.tickets) && details.tickets.length > 0) return false;

    // Already dealt with: a cancelled or refunded booking has been resolved and
    // nobody needs paging about it. The first dry run flagged FLTMTPRZA5T -
    // cancelled and refunded days earlier - which is exactly the false alarm
    // that gets an alert channel muted.
    const status = String(booking.status || '').toLowerCase();
    const payment = String(booking.payment_status || '').toLowerCase();
    if (['cancelled', 'refunded'].includes(status)) return false;
    if (['refunded', 'partially_refunded', 'reversed'].includes(payment)) return false;

    // Flagged by the chain or by a human: announce.
    if (review) return true;

    // Not flagged, and this is the case that was invisible: the ordinary
    // outcome while AUTO_TICKET is off. The gateway took the money, the chain
    // committed a PNR, issuance never ran, and the row was written `confirmed`
    // with no flag on it. That is a customer holding a reservation on a
    // ticketing deadline, and it was the MAJORITY case this job could not see.
    return details.gds?.ticketed === false && Boolean(details.pnr) && payment === 'paid';
  });
}

/** One line per booking. No passenger data: alerts get forwarded around. */
export function describeBooking(booking) {
  const details = booking.booking_details || {};
  const review = details.needs_review || {};
  const hours = Math.round((Date.now() - Date.parse(review.at || booking.created_at)) / 36e5);
  const ticketed = (review.ticketed ?? details.gds?.ticketed) === true;
  return [
    `*${booking.booking_reference}* — ${booking.status}/${booking.payment_status}, ${booking.total_amount} USD`,
    `PNR ${details.pnr || 'none'} · ticketed: ${ticketed ? 'yes' : 'NO'}`,
    `reason: ${review.reason || UNTICKETED_REVIEW_REASON} · flagged ${hours}h ago`,
    // The GDS's own words, when the chain recorded them. "failed at
    // issueTicket" alone cannot tell a carrier the office may not ticket from
    // missing passenger documents or a code fault.
    ...(review.amadeus
      ? [`Amadeus ${review.amadeus.operation || ''}: ${review.amadeus.message || review.amadeus.code || 'no detail'}`.replace(/\s+:/, ':')]
      : []),
  ].join('\n');
}

/**
 * A cancelled booking whose tickets still hold value with the airline.
 *
 * Tickets past their same-day void window are not voided by the cancel; their
 * value stays with the airline until it is claimed under the fare rules
 * (payment/operations.handlers.js cancelFlightBooking, which lists them on
 * `needs_review.tickets`). That flag was written and never read: this job
 * skipped cancelled rows, and the failed-refund alarm lists only refunds that
 * failed, so the claim reached nobody.
 *
 * The rule lives in shared/reviewQueue.js, which the admin "Needs attention"
 * list uses too: written twice, the two disagreed, and a claim Slack announced
 * once was missing from the only durable list of them.
 */
export { needsAirlineRefundClaim };

/** One line per airline claim. Ticket numbers, never passenger names. */
export function describeAirlineClaim(booking) {
  const details = booking.booking_details || {};
  const review = details.needs_review || {};
  const cancellation = details.cancellation || {};
  const hours = Math.round((Date.now() - Date.parse(review.at || cancellation.cancelledAt || booking.created_at)) / 36e5);
  const tickets = review.tickets || [];
  return [
    `*${booking.booking_reference}* — cancelled, ${booking.payment_status}; customer refund: ${cancellation.paymentAction || 'none recorded'}`,
    `PNR ${details.pnr || 'none'} · ${tickets.length} ticket${tickets.length > 1 ? 's' : ''} to claim: ${tickets.join(', ')}`,
    `flagged ${hours}h ago`,
  ].join('\n');
}

/**
 * One line per ticketed booking whose ticket numbers did not all come back.
 * Expected against got, so the desk knows how many numbers it is looking for;
 * "unknown" when the chain did not record the count, never a guess.
 */
export function describeTicketNumbersMissing(booking) {
  const details = booking.booking_details || {};
  const review = details.needs_review || {};
  const hours = Math.round((Date.now() - Date.parse(review.at || booking.created_at)) / 36e5);
  const expected = Number.isFinite(review.expected) ? review.expected : 'unknown';
  const got = Number.isFinite(review.got) ? review.got : ticketsOf(details).length;
  return [
    `*${booking.booking_reference}* — ${booking.status}/${booking.payment_status}, ${booking.total_amount} USD`,
    `PNR ${details.pnr || 'none'} · ticket numbers expected ${expected}, got ${got}`,
    `flagged ${hours}h ago`,
  ].join('\n');
}

/**
 * A numbers-missing flag with SOME numbers: fewer FA lines than travellers.
 *
 * The chain writes it after an issue the airline accepted whose numbers are
 * still landing, and also when a new session finds a PNR ticketed for only
 * some travellers after our own issue call was refused (bookingChain.js
 * issueInFreshSessions) - it cannot tell the two apart. With no number at all
 * the flag only ever follows an accepted issue (readTicketNumbers), so that
 * one keeps "the ticket IS issued".
 */
export function isPartlyTicketed(booking) {
  const details = booking?.booking_details || {};
  const review = details.needs_review || {};
  const got = Number.isFinite(review.got) ? review.got : ticketsOf(details).length;
  return got > 0 && Number.isFinite(review.expected) && got < review.expected;
}

/**
 * One line per partly ticketed booking, per traveller as far as the booking
 * knows: each FA line by ticket number and PNR passenger reference (never a
 * name - alerts get forwarded), and how many travellers have none.
 */
export function describeTicketNumbersPartial(booking) {
  const details = booking.booking_details || {};
  const review = details.needs_review || {};
  const hours = Math.round((Date.now() - Date.parse(review.at || booking.created_at)) / 36e5);
  const tickets = ticketsOf(details);
  const got = Number.isFinite(review.got) ? review.got : tickets.length;
  const missing = review.expected - got;
  const passenger = (ticket) => {
    const ref = ticket.pnrTravelerId ?? null;
    if (ref == null) return '';
    return String(ref).endsWith('-INF') ? ` (PNR passenger ${String(ref).slice(0, -4)}, infant)` : ` (PNR passenger ${ref})`;
  };
  return [
    `*${booking.booking_reference}* — ${booking.status}/${booking.payment_status}, ${booking.total_amount} USD`,
    `PNR ${details.pnr || 'none'} · ticket numbers expected ${review.expected}, got ${got}`,
    `FA lines (ticketed, do not reissue): ${tickets.map((ticket) => `${ticket.number}${passenger(ticket)}`).join(', ') || 'none recorded'}`,
    `no FA line (check, issue for that passenger only): ${missing} traveller${missing > 1 ? 's' : ''}`,
    `flagged ${hours}h ago`,
  ].join('\n');
}

/**
 * One line per cancellation carried out but not recorded. What the cancel did,
 * as its flag says - the row itself may still read confirmed and paid. The flag
 * may sit under a later one (unrecordedCancellationOf); that one is named too.
 */
export function describeUnrecordedCancellation(booking) {
  const details = booking.booking_details || {};
  const latest = details.needs_review || {};
  const review = unrecordedCancellationOf(booking) || latest;
  const hours = Math.round((Date.now() - Date.parse(review.at || booking.created_at)) / 36e5);
  const tickets = review.tickets || [];
  return [
    `*${booking.booking_reference}* — the record reads ${booking.status}/${booking.payment_status}, ${booking.total_amount} USD`,
    `PNR ${details.pnr || 'none'} · payment ${review.paymentAction || 'unknown'} ${review.refundAmount ?? 0} USD`
      + ` · tickets voided: ${review.ticketsVoided === true ? 'yes' : 'no'}`
      + (tickets.length ? ` · to claim from the airline: ${tickets.join(', ')}` : ''),
    ...(latest !== review
      ? [`since then: ${latest.reason || 'flagged again'}${latest.detail ? ` (${latest.detail})` : ''}`]
      : []),
    `flagged ${hours}h ago`,
  ].join('\n');
}

const ticketDigits = (number) => String(number ?? '').replace(/\D/g, '');

/** Ticket numbers from several lists, each once, in the order first seen. */
const unionTickets = (...lists) => {
  const seen = new Set();
  return lists.flatMap((list) => (Array.isArray(list) ? list : [])).filter((number) => {
    const digits = ticketDigits(number);
    if (!digits || seen.has(digits)) return false;
    seen.add(digits);
    return true;
  });
};

/**
 * One line per cancellation the airline did not carry out. Which tickets were
 * voided and which are still live, as the cancels recorded them; when the
 * latest did not say, what is known not to be voided is listed as such, never
 * guessed live or void.
 *
 * Voided is every ticket ANY attempt voided: the booking's own list (the
 * cancel handler adds each attempt's voids to booking_details.voided_tickets)
 * and the lists on every flag in the chain. It read the latest flag alone, and
 * a later refused cancel that voided nothing writes a flag with no lists: Slack
 * said "tickets voided: none recorded · on the booking: A, B" of two void
 * tickets, and a person working by hand could claim their value from the
 * airline, or under-refund a fare whose tickets were void.
 */
export function describeFailedCancellation(booking) {
  const details = booking.booking_details || {};
  const review = details.needs_review || {};
  const hours = Math.round((Date.now() - Date.parse(review.at || booking.created_at)) / 36e5);
  // A void is a fact about the ticket, so resolved flags count too.
  const flags = flagsInForce(booking, { pastResolved: true });
  const voided = unionTickets(details.voided_tickets, ...flags.map((flag) => flag.voided_tickets));
  const voidedDigits = new Set(voided.map(ticketDigits));
  const notVoided = (list) => list.filter((number) => !voidedDigits.has(ticketDigits(number)));
  // Whether a ticket was issued, by any record of it. With no number on the
  // booking and none in the cancel's lists, this printed "no tickets issued"
  // of a booking the chain ticketed and could not read the numbers back for
  // (ticket_numbers_not_retrieved, found under the refused cancel's flag too):
  // staff told there is no ticket could cancel and refund in full over live
  // tickets. A void is of an issued ticket, so it counts.
  const numbersMissing = Boolean(ticketNumbersMissingOf(booking));
  const ticketed = isTicketed(details) || numbersMissing || flags.some((flag) => flag.ticketed === true)
    || voided.length > 0 || (Array.isArray(review.unvoided_tickets) && review.unvoided_tickets.length > 0);
  let tickets;
  if (Array.isArray(review.unvoided_tickets)) {
    // This attempt's own report: every ticket on the PNR it did not void.
    tickets = `tickets voided: ${voided.join(', ') || 'none'} · still live: ${notVoided(review.unvoided_tickets).join(', ') || 'none'}`;
  } else {
    const others = notVoided(unionTickets(ticketsOf(details).map((ticket) => ticket.number), ...flags.map((flag) => flag.unvoided_tickets)));
    tickets = voided.length || others.length
      ? `tickets voided: ${voided.join(', ') || 'none recorded'} · not recorded as voided: ${others.join(', ') || 'none'}`
      : ticketed ? 'ticket numbers not recorded: read the FA lines' : 'no tickets issued';
  }
  // Numbers the chain could not read back are missing from every list above.
  const incomplete = numbersMissing && tickets.startsWith('tickets voided') ? ' · not every ticket number is recorded: read the FA lines' : '';
  return [
    `*${booking.booking_reference}* — ${booking.status}/${booking.payment_status}, ${booking.total_amount} USD`,
    `PNR ${details.pnr || review.pnr || 'none'} · ticketed: ${ticketed ? 'yes' : 'NO'} · ${tickets}${incomplete}`,
    `airline: ${review.detail || 'no detail recorded'}`,
    `flagged ${hours}h ago`,
  ].join('\n');
}

const ticketNumbersMissing = (booking) => !needsAirlineRefundClaim(booking)
  && booking?.booking_details?.needs_review?.reason === TICKET_NUMBERS_MISSING;

// A PNR the airline confirmed no seat on (the chain's step 'segmentStatus').
const noConfirmedSeat = (booking) => !needsAirlineRefundClaim(booking)
  && booking?.booking_details?.needs_review?.reason === NO_CONFIRMED_SEAT_REVIEW_REASON;

export function buildMessage(bookings) {
  // Its own section before anything else: the seats and the money moved and
  // the record says neither. Under "paid but not ticketed" it read "ticket it,
  // or refund it" - a second refund of money already returned.
  const unrecorded = bookings.filter(isUnrecordedCancellation);
  // A cancel the airline refused: under "paid but not ticketed" it read
  // "ticket it, or refund it" - a refund against a live PNR.
  const cancelFailed = bookings.filter((booking) => !isUnrecordedCancellation(booking) && isFailedCancellation(booking));
  const rest = bookings.filter((booking) => !isUnrecordedCancellation(booking) && !isFailedCancellation(booking));
  const claims = rest.filter(needsAirlineRefundClaim);
  // A ticketed booking whose numbers did not arrive is NOT "paid but not
  // ticketed". Listed under that heading it read "no ticket was issued ...
  // ticket it, or refund it" beside "ticketed: yes" - an instruction to issue a
  // second ticket against one payment, or refund a live ticket.
  // Only some travellers with a number is not "the ticket IS issued": a
  // traveller with no FA line may hold no ticket (isPartlyTicketed).
  const numbersMissing = rest.filter((booking) => ticketNumbersMissing(booking) && !isPartlyTicketed(booking));
  const partlyTicketed = rest.filter((booking) => ticketNumbersMissing(booking) && isPartlyTicketed(booking));
  // Nor is a PNR with no confirmed seat. Under that heading it read "ticket it,
  // or refund it": ticketing issues a ticket for a seat the airline has not
  // given, and a refund with the PNR still live leaves its confirmed flights
  // held with nothing paid for them.
  const seatless = rest.filter(noConfirmedSeat);
  const unticketed = rest.filter((booking) => !needsAirlineRefundClaim(booking) && !ticketNumbersMissing(booking)
    && !noConfirmedSeat(booking));
  const sections = [];
  if (unrecorded.length) {
    sections.push(
      `:warning: *${unrecorded.length} cancellation${unrecorded.length > 1 ? 's' : ''} carried out but not recorded*`,
      'The airline reservation was released and the payment action below was taken, but the booking record could not be written. '
        + 'Check the airline and ARC Pay and record what happened by hand. Do not cancel or refund it again until you have: '
        + 'the money may already have gone back.',
      '',
      ...unrecorded.map(describeUnrecordedCancellation),
    );
  }
  if (cancelFailed.length) {
    sections.push(
      `:x: *${cancelFailed.length} cancellation${cancelFailed.length > 1 ? 's' : ''} the airline did not carry out*`,
      'The customer asked to cancel and was told our team would complete it. '
        + 'The airline did not cancel the PNR, so it is still live, and no refund was made. '
        + 'Cancel the PNR with the airline first. Do NOT refund until it is cancelled: '
        + 'a refund against a live PNR pays out for flights the customer still holds. '
        + 'A traveller whose ticket was voided cannot fly on it.',
      '',
      ...cancelFailed.map(describeFailedCancellation),
    );
  }
  if (seatless.length) {
    sections.push(
      `:no_entry: *${seatless.length} booking${seatless.length > 1 ? 's' : ''} paid, with no confirmed seat from the airline*`,
      'The airline has not confirmed a seat on every flight (waitlisted, requested, unable or cancelled at commit). '
        + 'The PNR is live, nothing is ticketed, and the customer has paid and was told a person will contact them. '
        + 'Do NOT ticket this PNR: that issues a ticket for a seat the airline has not given. '
        + 'Secure the seat with the airline, or cancel the PNR and then refund. '
        + 'Do not refund while the PNR is live: its confirmed flights would stay held with nothing paid for them.',
      '',
      ...seatless.map(describeBooking),
    );
  }
  if (unticketed.length) {
    sections.push(
      `:rotating_light: *${unticketed.length} booking${unticketed.length > 1 ? 's' : ''} paid but not ticketed*`,
      'The customer has paid and no ticket was issued. Each one needs a human: ticket it, or refund it.',
      '',
      ...unticketed.map(describeBooking),
    );
  }
  if (numbersMissing.length) {
    sections.push(
      `:ticket: *${numbersMissing.length} booking${numbersMissing.length > 1 ? 's' : ''} ticketed, ticket numbers not read back*`,
      'The ticket IS issued: the airline accepted the issue, the customer has paid and holds a live ticket. '
        + 'Only the ticket numbers did not reach us. Read them from the PNR (its FA lines) and record them on the booking. '
        + 'Do NOT reissue and do NOT refund: a second ticket charges the fare twice, and a refund leaves a live ticket unpaid for.',
      '',
      ...numbersMissing.map(describeTicketNumbersMissing),
    );
  }
  if (partlyTicketed.length) {
    sections.push(
      `:busts_in_silhouette: *${partlyTicketed.length} booking${partlyTicketed.length > 1 ? 's' : ''} with ticket numbers for only some travellers*`,
      'Some travellers have an FA line (a ticket) on the PNR and some do not. The numbers may still be landing, '
        + 'or the ticket was issued for only some of them: this is also flagged when our own issue call was refused. '
        + 'A traveller with an FA line IS ticketed: do NOT reissue them, a second ticket charges the fare twice. '
        + 'A traveller with no FA line may NOT be ticketed: check the PNR, and issue for that passenger only. '
        + 'Do NOT refund: the travellers with a ticket hold live tickets.',
      '',
      ...partlyTicketed.map(describeTicketNumbersPartial),
    );
  }
  if (claims.length) {
    sections.push(
      `:airplane_departure: *${claims.length} cancelled booking${claims.length > 1 ? 's' : ''} with a refund to claim from the airline*`,
      'These tickets were past their void window when the booking was cancelled, so the airline still holds their value. '
        + 'Claim each refund under the fare rules.',
      '',
      ...claims.map(describeAirlineClaim),
    );
  }
  return sections.join('\n\n');
}

/**
 * Stamp the bookings so the next run stays quiet about them.
 *
 * This wrote back the copy of each row read before the Slack post, whole, so
 * anything written in between - a running chain's final save, a cancellation
 * record - was undone by an alarm. Each booking is read again, and the stamp
 * written only if nothing that matters has moved since
 * (utils/bookingDetailsGuard.js); a race it loses is read and tried again.
 */
const MARK_TRIES = 3;

async function markAlerted(bookings) {
  for (const booking of bookings) {
    let marked = false;
    let lastError = null;
    for (let tries = 0; tries < MARK_TRIES && !marked; tries += 1) {
      const { data: fresh, error: readError } = await supabase
        .from('bookings')
        .select('status, payment_status, booking_details')
        .eq('booking_reference', booking.booking_reference)
        .single();
      if (readError || !fresh) {
        lastError = readError;
        break;
      }
      const details = fresh.booking_details || {};
      if (details.needs_review?.alerted_at) {
        marked = true;
        break;
      }
      const now = new Date().toISOString();
      // A row announced for the unflagged reason gets a flag written as it is
      // announced, so from here on it is one class: flagged, and stamped.
      const review = details.needs_review
        || { reason: UNTICKETED_REVIEW_REASON, ticketed: false, at: now };
      const { data, error } = await unchangedSince(
        supabase
          .from('bookings')
          .update({ booking_details: { ...details, needs_review: { ...review, alerted_at: now } } })
          .eq('booking_reference', booking.booking_reference),
        fresh,
      ).select('booking_reference');
      if (error) {
        lastError = error;
        break;
      }
      marked = Boolean(data?.length);
    }
    if (!marked) log('announced but could not mark', { booking: booking.booking_reference, error: lastError?.message || 'the booking kept changing' });
  }
}

export async function runOnce({ webhookUrl = process.env.ALERT_SLACK_WEBHOOK_URL, dryRun = false } = {}) {
  // A dry run asks the database what it would say and stops there, so it needs
  // no webhook - that is the whole point of being able to check by hand from a
  // laptop that has no production secrets.
  if (!webhookUrl && !dryRun) return { skipped: 'no ALERT_SLACK_WEBHOOK_URL' };

  // Two shapes of "took money, produced no ticket": rows the chain or a human
  // flagged, and the ordinary outcome while AUTO_TICKET is off - a paid,
  // committed PNR that issuance never touched. The second is the one that
  // was invisible: it carries no flag, only `gds.ticketed: false` and a PNR.
  const { data, error } = await supabase
    .from('bookings')
    .select('booking_reference, status, payment_status, total_amount, created_at, booking_details')
    .or('booking_details->needs_review.not.is.null,and(booking_details->gds->>ticketed.eq.false,booking_details->>pnr.not.is.null)')
    // Announced rows keep their flag, so without this the 200 oldest were read
    // every run: once 200 flagged rows existed, no new one was ever seen.
    .is('booking_details->needs_review->>alerted_at', null)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) throw new Error(`could not read bookings: ${error.message}`);

  const stuck = selectUnannounced(data || []);
  if (stuck.length === 0) return { announced: 0 };

  const message = buildMessage(stuck);

  // Nothing sent, nothing stamped: a booking gets announced exactly once, and a
  // dry run must not be what spends it.
  if (dryRun) {
    return {
      announced: 0,
      dryRun: true,
      wouldAnnounce: stuck.map((b) => b.booking_reference),
      message,
    };
  }

  await postToSlack(message, webhookUrl);
  await markAlerted(stuck);
  log(`announced ${stuck.length} booking(s)`, { refs: stuck.map((b) => b.booking_reference) });
  return { announced: stuck.length };
}

export function startNeedsReviewAlertJob({ intervalMs = DEFAULT_INTERVAL_MS, env = process.env } = {}) {
  if (!supabase) return { stop: () => {} };

  if (!env.ALERT_SLACK_WEBHOOK_URL) {
    log('asleep: set ALERT_SLACK_WEBHOOK_URL to turn on paid-but-not-ticketed alerts');
    return { stop: () => {} };
  }

  // Production only, unless asked for by name. Local development and
  // production share the database, and each booking is announced exactly
  // once: a laptop with the webhook in its environment would post production's
  // bookings and stamp `alerted_at` on them, and production's own run would
  // then say nothing about them, ever. The webhook alone was the only gate.
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
