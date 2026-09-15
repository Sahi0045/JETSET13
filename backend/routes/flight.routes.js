import express from 'express';
import FlightProvider, { providerStatus } from '../services/flightProvider.js';
import { resolveToIata, searchLocations } from '../services/airportsIndex.js';
import supabase from '../config/supabase.js';
import fetch from 'node-fetch';
import { get as cacheGet, set as cacheSet, withCache, CacheKeys, TTL } from '../services/cache.service.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';
import { protect, admin, optionalProtect } from '../middleware/auth.middleware.js';
import { resolveBookingUserId } from '../utils/bookingOwner.js';
import { handleCancelBookingAction, reverseArcPaymentForOrder, settleManualFlightRefund } from './payment/operations.handlers.js';
import { emailMatchesBooking, isBookingOwner } from '../utils/bookingAccess.js';
import { reconcileBookingPayment } from './payment/checkout.handlers.js';
import { reportError } from '../services/monitoring.js';
import { withBookingPriority } from '../services/amadeusSoap/semaphore.js';
import { getWsConfig } from '../services/amadeusSoap/config.js';
import { recordCouponUse } from '../services/coupon.service.js';
import { crossesBorder } from '../utils/itinerary.js';
import { CHAIN_CLAIM_TTL_MS } from '../utils/bookingChainClaim.js';
import { UNTICKETED_REVIEW_REASON } from '../jobs/needsReviewAlert.job.js';
import { itinerariesFromOffer, returnDateOf } from '../../shared/bookingItineraries.js';
import { flightsKey, travellerNamesKey } from '../utils/tripMatch.js';
import { needsDateOfBirth } from '../../shared/travellerDetails.js';
import { flightSearchLimiter, guestBookingLimiter } from '../middleware/security.js';
import { liveChainState } from '../utils/bookingChainClaim.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Why a search's dates cannot be searched, or null when they can.
 *
 * A departure already gone, or a return before the outbound, went to Amadeus
 * and came back to the customer as "Flight search failed" - or, on the results
 * page, as "No flights found", which reads as if the route had no flights.
 *
 * "Gone" allows a day of slack: the customer's today can still be yesterday in
 * UTC, so only dates before yesterday UTC are refused. Dates this cannot read
 * are left to the provider rather than refused on a guess about their format.
 */
const searchDateProblem = ({ departDate, returnDate }, now = Date.now()) => {
  const isoDate = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? '').trim()) ? String(value).trim() : null);
  const depart = isoDate(departDate);
  const back = isoDate(returnDate);
  const yesterday = new Date(now - DAY_MS).toISOString().slice(0, 10);

  if (depart && depart < yesterday) {
    return { field: 'departDate', message: 'The departure date has already passed. Please choose today or a later date.' };
  }
  if (depart && back && back < depart) {
    return { field: 'returnDate', message: 'The return date is before the departure date. Please choose a return on or after the day you leave.' };
  }
  return null;
};

// Only the fields the handler genuinely requires; passthrough keeps the rest.
const flightSearchSchema = z
  .object({
    from: z.string().min(1, 'from is required'),
    to: z.string().min(1, 'to is required'),
    departDate: z.string().min(1, 'departDate is required'),
  })
  .passthrough()
  .superRefine((body, ctx) => {
    const problem = searchDateProblem(body);
    if (problem) ctx.addIssue({ code: 'custom', path: [problem.field], message: problem.message });
  });

const router = express.Router();

// The unauthenticated endpoints that go to Amadeus on every call get their own
// per-IP budget (security.js has the numbers and why). Here rather than in each
// entry point: all three mount this router, Vercel twice, so it cannot be left
// out of one. A path matches whole segments only - '/search' is not
// '/airports/search', and '/price' is not '/price-analysis'.
//
// `/status` sends Air_FlightInfo to Amadeus, and was left off the first list.
// Deliberately not here: `/airports/search`, which reads the bundled airport
// index in memory and is called as the customer types, and `/analytics/*`,
// `/availabilities`, `/inspiration` and `/price-analysis`, which this WSAP is
// not entitled to - the provider answers them without calling Amadeus. The day
// one of them gets a real implementation, it belongs on this list.
router.use(
  ['/search', '/price', '/upsell', '/fare-rules', '/seatmaps', '/date-prices', '/cheapest-dates', '/calendar-prices', '/status'],
  flightSearchLimiter
);

// Invoke the single orchestrated cancel handler (Amadeus cancel + ARC Pay refund/void +
// DB update + email) in-process — no HTTP self-call, so it works on Vercel serverless.
// Single source of truth for cancellation; returns that handler's response payload + status.
//
// `req` is the caller's own request, because the handler decides who may cancel
// from the session. Called with only a body it saw nobody, so every My Trips and
// admin panel cancel failed there.
async function invokeOrchestratedCancel(bookingReference, reason, req) {
  let payload = null;
  let statusCode = 200;
  const fakeRes = {
    status(code) { statusCode = code; return this; },
    json(body) { payload = body; return this; }
  };
  await handleCancelBookingAction({
    method: 'POST',
    body: { bookingReference, reason },
    user: req?.user,
    headers: req?.headers || {},
    cookies: req?.cookies || {},
  }, fakeRes);
  return { statusCode, payload };
}

// Called when flight ticket issuance FAILS after the customer was already charged.
// Reverses the ARC payment (VOID/REFUND), marks the booking row as cancelled/refunded with
// the failure recorded, and returns an honest error — never fabricates a confirmed booking.
// Responds via `res`; returns the Express response.
// `orderId` is what ARC Pay knows the payment by. Callers pass
// `req.body.orderId || req.body.bookingReference` because the two are the same
// value by convention in both clients, and `reverseArcPaymentForOrder` gives up
// immediately on a falsy one - so a client that omitted `orderId` produced a
// charge with no booking and no automatic reversal.
async function refundOnFulfillmentFailure(res, { orderId, bookingReference, amount, currency = 'USD', errorMsg, status = 502, customerMessage, reason, code }) {
  console.warn('🚑 Ticket not booked after payment — reversing charge. order:', orderId, '| reason:', errorMsg);
  const reversal = await reverseArcPaymentForOrder(orderId, {
    amount,
    currency,
    reason: 'Flight booking failed after payment'
  });
  console.log('💸 Payment reversal result:', reversal.action, '| reversed:', reversal.reversed);

  // Record the failure on the booking row created at hosted-checkout (if any).
  try {
    const ref = bookingReference || orderId;
    if (supabase && ref) {
      const { data: bk } = await supabase
        .from('bookings')
        .select('*')
        .or((r => `booking_reference.eq.${r},booking_details->>order_id.eq.${r}`)(sanitizeRef(ref)))
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (bk) {
        // A reversal the gateway refused - or could not attempt - leaves the
        // customer charged with no booking. Writing that row `cancelled` hid it
        // from the paid-but-not-ticketed alarm, which skips cancelled rows, and
        // nothing ever read `fulfillment_failed`, so the one case that needs a
        // human reached no one. It keeps its status and is flagged instead.
        // Every caller runs after the payment was verified, so "not reversed"
        // means the money is still held.
        const stuck = !reversal.reversed;
        const now = new Date().toISOString();
        await supabase.from('bookings').update({
          ...(stuck ? {} : { status: 'cancelled' }),
          payment_status: reversal.reversed ? 'refunded' : bk.payment_status,
          booking_details: {
            ...bk.booking_details,
            fulfillment_failed: { at: now, error: errorMsg, reversal },
            ...(stuck ? {
              needs_review: {
                reason: 'charge not reversed after the booking failed',
                ticketed: false,
                at: now,
                reversal: { action: reversal.action || null, error: reversal.error || null }
              }
            } : {})
          },
          updated_at: now
        }).eq('id', bk.id);
      }
    }
  } catch (e) {
    console.error('⚠️ Could not update booking after fulfillment failure:', e.message);
  }

  const outcome = reversal.reversed
    ? 'Your payment has been reversed and will return to your original payment method.'
    : 'Your payment could not be reversed automatically. Our team has been alerted and will refund you; if you have not heard from us within 2 business days, call (877) 538-7380.';
  const userMessage = `We could not confirm your flight booking. ${outcome}`;

  // `reason` is what went wrong, in the customer's words; the reversal outcome
  // is always appended from what the gateway actually did. Callers used to
  // pass a finished sentence - "so your payment has been reversed" - that was
  // shown even when the reversal had failed. `status` lets a caller keep its
  // own HTTP status without a second, divergent refund path.
  const shown = customerMessage || (reason ? `${reason} ${outcome}` : userMessage);

  return res.status(status).json({
    success: false,
    bookingFailed: true,
    refunded: reversal.reversed,
    refundAction: reversal.action,                 // VOID | REFUND | ALREADY_REVERSED | NONE | FAILED
    refundAmount: reversal.amount ?? amount ?? null,
    error: shown,                                  // FlightCreateOrders surfaces `.error` first
    message: shown,
    ...(code ? { code } : {}),
    technicalError: errorMsg
  });
}

// The shared client, not a second one built here.
//
// This module used to call createClient itself off the same env vars. That made
// it the only route with its own connection, and - because the shared module is
// what tests mock - made every database path in this file unmockable: a route
// test would build a real client against whatever credentials happened to be in
// the environment. Importing the shared client fixes both.

// Helper function to build the booking row object for insert
/**
 * Merge a patch into a booking's `booking_details` without losing what is there.
 *
 * The row already exists by this point - ARC Pay's hosted checkout upserts it
 * on `booking_reference` before the customer is sent to pay - and it holds the
 * payment session data. A whole-column write would drop that, so this reads,
 * merges and writes back.
 */
/**
 * "DEL" -> "New Delhi", from the bundled dataset.
 *
 * Returns an empty string rather than guessing: a wrong city on a booking
 * confirmation is worse than no city, and the code beside it is always right.
 */
function cityNameFor(code) {
  const iata = String(code ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iata)) return '';
  try {
    const match = searchLocations(iata, 'AIRPORT,CITY', { limit: 1 })?.data?.[0];
    return match?.code === iata ? (match.cityName || '') : '';
  } catch {
    return '';
  }
}

async function patchBookingDetails(bookingReference, patch) {
  if (!supabase || !bookingReference) return null;

  const { data: existing } = await supabase
    .from('bookings')
    .select('booking_details')
    .eq('booking_reference', bookingReference)
    .single();

  const { data, error } = await supabase
    .from('bookings')
    .update({ booking_details: { ...(existing?.booking_details || {}), ...patch } })
    .eq('booking_reference', bookingReference)
    .select()
    .single();

  if (error) {
    console.error('❌ Failed to patch booking_details:', error.message);
    return null;
  }
  return data;
}

/**
 * Record the record locator the moment the GDS returns it.
 *
 * This runs inside the booking chain, between the commit and the ticketing
 * steps, and it is the difference between a booking that can be found later and
 * one that exists only in the airline's system. Everything after it - queueing,
 * issuing, reading ticket numbers - can fail without losing the PNR.
 */
async function persistCommittedPnr({ bookingReference, pnr, tstRefs, priced }) {
  console.log('💾 Recording committed PNR', { bookingReference, pnr });
  return patchBookingDetails(bookingReference, {
    pnr,
    amadeus_order_id: pnr,
    gds: {
      tst_refs: tstRefs || [],
      priced_total: priced?.total ?? null,
      priced_currency: priced?.currency ?? null,
      // Not ticketed yet. The paid-not-ticketed alarm looks for exactly this
      // with a PNR; without it, a booking whose final save failed after the
      // commit was invisible to it - a live reservation nobody was told about.
      // The final save overwrites it with what issuance actually did.
      ticketed: false,
      committed_at: new Date().toISOString()
    },
    gds_chain: { state: 'committed', committedAt: new Date().toISOString() }
  });
}

/**
 * Mark a booking as needing a human.
 *
 * Used when the chain created a real PNR and then failed: the money and the
 * booking are both real but out of step, and no automatic action is safe.
 */
async function flagForReview({ bookingReference, pnr, reason, ticketed, amadeus = null }) {
  console.error('⚠️ Booking needs review', { bookingReference, pnr, reason, ticketed, amadeus });

  const patched = await patchBookingDetails(bookingReference, {
    pnr: pnr || undefined,
    needs_review: {
      reason,
      ticketed: Boolean(ticketed),
      at: new Date().toISOString(),
      // What Amadeus actually said. Without it the row read only "chain failed
      // after commit at issueTicket" and the refusal itself - 2161 PROHIBITED
      // TICKETING CARRIER on every Air India booking - existed only in a dev
      // terminal's scrollback, so a carrier the office may not ticket looked
      // like a code regression. Amadeus error text carries no passenger data.
      ...(amadeus ? { amadeus } : {})
    }
  });

  // The airline holds a real booking, so the row has to say so - and say what
  // kind. Leaving it at 'pending' made a genuine PNR read as an incomplete
  // booking a human might "clean up". Writing 'confirmed' was the opposite
  // lie: an unticketed reservation shown in My Trips as a confirmed trip. Same
  // rule as buildBookingRow - confirmed only once a ticket exists.
  if (supabase && pnr) {
    const status = ticketed ? 'confirmed' : 'pending_ticketing';
    const { error } = await supabase
      .from('bookings')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('booking_reference', bookingReference);
    if (error) console.error('⚠️ Could not record the reviewed booking status:', error.message);
  }

  return patched;
}

/**
 * Has this payment already been booked?
 *
 * `booking_reference` is the ARC Pay order id, so a retried POST /order - a
 * double-click, a client retry, a page refresh - carries the same one. Without
 * this check the second request sells a second set of seats against a single
 * payment.
 */
async function findExistingBooking(bookingReference) {
  if (!supabase || !bookingReference) return null;
  const { data } = await supabase
    .from('bookings')
    .select('id, booking_reference, travel_type, status, payment_status, booking_details, total_amount, user_id')
    .eq('booking_reference', bookingReference)
    .single();
  return data || null;
}

/**
 * A booking/order reference, or null if it is not shaped like one.
 *
 * References are `FLT`+base36 or 6-char Amadeus PNRs — always `[A-Za-z0-9_-]`.
 * Rejecting anything else BEFORE it reaches a Supabase `.or(...)` filter closes
 * the PostgREST filter-injection that let `?userId=x,status.not.eq.zzz` return
 * every row: no `.`, `,`, `(`, `)` or `:` can survive this, so no extra filter
 * term can be smuggled in.
 */
function safeRef(value) {
  const v = String(value ?? '').trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null;
}

/**
 * A reference stripped to `[A-Za-z0-9_-]`, for interpolating into a PostgREST
 * `.or(...)` filter. A valid reference is unchanged; a malicious one loses its
 * `.` `,` `(` `)` `:` and can no longer smuggle in a filter term — it just
 * matches nothing. `__none__` when empty, so the filter never goes malformed.
 */
function sanitizeRef(value) {
  return String(value ?? '').replace(/[^A-Za-z0-9_-]/g, '') || '__none__';
}

/**
 * Staff may read and cancel any booking; a customer only their own.
 *
 * Admins only. `agent` used to be here too, and in `users` that is the visa
 * agents' role - accounts that process visa applications and have nothing to
 * do with flights. It handed every one of them any customer's booking,
 * passports and dates of birth included, and let them past the ownership check
 * on DELETE /order, whose fallback cancelled at the airline with no refund.
 * Travel agents sign in with a token that never becomes `req.user`, and their
 * portal reads its own sales through `agent-stats`, not these routes.
 */
function isStaff(user) {
  return !!user && ['admin', 'superadmin'].includes(user.role);
}

/**
 * Fetch a booking only when `user` is allowed to see it.
 *
 * The booking endpoints reach Supabase with the SERVICE-ROLE key, which
 * bypasses RLS, so ownership has to be enforced here or any authenticated user
 * could read or cancel any other customer's booking by its (guessable,
 * timestamp-derived) reference. Returns `{ booking }` when owned/staff,
 * `{ notFound: true }` otherwise — a non-owner is told 404, never 403, so the
 * endpoint does not even confirm the reference exists.
 */
async function loadOwnedBooking(ref, user, { email } = {}) {
  const safe = safeRef(ref);
  if (!supabase || !safe) return { notFound: true };
  const { data } = await supabase
    .from('bookings')
    .select('*')
    .or(`booking_reference.eq.${safe},booking_details->>order_id.eq.${safe},booking_details->>amadeus_order_id.eq.${safe}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { notFound: true };
  if (isStaff(user)) return { booking: data };
  if (isBookingOwner(user?.id, data)) return { booking: data };

  // A guest proves the booking is theirs with the email it was made with, as
  // well as the reference. References are random, but they sit in URLs and
  // emails, so a reference alone is never enough. Guests used to have no way in
  // at all: both booking reads required an account, and a guest booking has
  // no owner, so the confirmation email's link led nowhere.
  if (emailMatchesBooking(email, data)) return { booking: data };
  return { notFound: true };
}

/**
 * Take exclusive ownership of the booking chain for this reference.
 *
 * Checking for an existing PNR is not enough on its own: between two concurrent
 * POSTs neither has a PNR yet, so both pass that check and both sell seats
 * against a single payment. A double-clicked confirm button or a client retry
 * while the first request is still in the chain is all it takes.
 *
 * The claim is one conditional UPDATE, so the database decides the winner - a
 * read-then-write here would just move the race rather than close it. The
 * filter matches only when no claim exists, when the last one finished, or when
 * it is older than the TTL (a crashed request must not lock the reference out).
 *
 * Fails OPEN: if the claim cannot be evaluated the booking proceeds. Refusing a
 * paid booking because a bookkeeping write failed is the worse outcome of the
 * two, and every other guard is still in place.
 */
async function claimBookingChain(bookingReference) {
  if (!supabase || !bookingReference) return { claimed: true };

  const { data: existing } = await supabase
    .from('bookings')
    .select('booking_details')
    .eq('booking_reference', bookingReference)
    .single();

  // No row means hosted checkout never created one; there is nothing to race
  // over and nothing to claim.
  if (!existing) return { claimed: true };

  const details = existing.booking_details || {};
  const chain = details.gds_chain || null;
  const priorStamp = chain?.startedAt ?? null;

  // A cancellation takes this same stamp (utils/bookingChainClaim.js). Once it
  // has finished there is nothing left to book; while it runs, the payment
  // behind this booking is on its way back to the customer. Selling seats in
  // either case is a reservation nobody is paying for.
  if (chain?.state === 'cancelled') {
    console.warn('⛔ Chain refused: the booking was cancelled', bookingReference);
    return { claimed: false, cancelled: true };
  }

  // A claim only blocks while it is live (CHAIN_CLAIM_TTL_MS). One left behind
  // by a killed process must expire, or the reference is locked out forever. A
  // queued booking does not block: taking it over from the queue is exactly
  // what the worker's replay does.
  const held = liveChainState(chain);
  if (held === 'in_progress' || held === 'cancelling') {
    console.warn(held === 'cancelling' ? '⏳ Booking is being cancelled:' : '⏳ Chain already in progress for',
      bookingReference, 'since', priorStamp);
    return { claimed: false, ...(held === 'cancelling' ? { cancelling: true } : {}) };
  }

  const startedAt = new Date().toISOString();
  const attempt = Number(chain?.attempt || 0) + 1;
  // Carried across claims so a booking that keeps missing a slot cannot sit in
  // the durable queue forever.
  const queueAttempts = chain?.queueAttempts ? { queueAttempts: chain.queueAttempts } : {};

  // Compare-and-set on the exact stamp that was just read. Two racing requests
  // read the same prior value and both write conditioned on it; the first
  // update changes it, so the second matches no rows and loses. The check above
  // decides IF the claim is available, this decides WHO gets it - and only the
  // database can decide that.
  //
  // A three-clause `.or()` on the same json path was tried first and is wrong:
  // PostgREST rejects arrow paths inside `or` on an UPDATE with "column
  // bookings.booking_details does not exist", and since this fails open the
  // guard would have been silently absent.
  let update = supabase
    .from('bookings')
    .update({
      // `claimedAt` stays put while the heartbeat moves `startedAt` on: it is how
      // two paid checkouts for one trip tell which claimed first
      // (findDuplicateBooking).
      booking_details: { ...details, gds_chain: { state: 'in_progress', startedAt, claimedAt: startedAt, attempt, ...queueAttempts } },
      updated_at: startedAt,
    })
    .eq('booking_reference', bookingReference);

  update = priorStamp === null
    ? update.is('booking_details->gds_chain->>startedAt', null)
    : update.eq('booking_details->gds_chain->>startedAt', priorStamp);

  const { data, error } = await update.select('booking_reference');

  if (error) {
    // Fails CLOSED. It used to proceed, reasoning that refusing a paid booking
    // over a bookkeeping write was the worse outcome - but two requests that
    // both hit the error both proceeded, and both sold seats against one
    // payment. Stopping loses nothing: the route hands the booking to the
    // durable queue, which runs it again once the database answers.
    console.error('⚠️ Could not take the chain claim:', error.message);
    return { claimed: false, unavailable: true };
  }
  if (!data?.length) {
    console.warn('⏳ Lost the chain claim race for', bookingReference);
    return { claimed: false };
  }
  return { claimed: true, attempt, claimedAt: startedAt };
}

// A booking that cannot get an Amadeus slot is retried this many times by the
// queue worker before it is refunded like any other failure. Each retry only
// runs when a slot is free, so reaching this means Amadeus is saturated for
// minutes, not seconds - and the 30-minute offer staleness limit refunds it
// before then anyway.
const MAX_QUEUE_ATTEMPTS = 10;

/**
 * Hand a paid booking that never got an Amadeus slot to the durable queue.
 *
 * Nothing was sold - the slot wait happens before the first GDS call - so the
 * booking can simply be run again later. Refunding here would turn a
 * few seconds of traffic into a lost customer. The order is kept on the
 * booking row (the same row that already holds these passenger details) so it
 * survives a restart or deploy; backend/jobs/bookingQueue.job.js replays it
 * through this route once a slot is free, and clears it when it is done.
 *
 * Returns false when the booking cannot be queued, and the caller refunds.
 */
/**
 * The order to queue, carrying proof of the payer for its replay.
 *
 * The replay runs with no session. A request that proved the payer by its
 * signed-in account carried no success indicator, so its replay was refused as
 * not the payer, and a paid booking waited in the queue for nothing. Every
 * caller has already proved the payer; the proof added here is the booking
 * row's own indicator, never anything the client sent.
 */
export function orderWithPayerProof(orderBody, details = {}) {
  const proof = details?.success_indicator;
  if (!proof || orderBody?.resultIndicator || orderBody?.transactionId) return orderBody;
  return { ...orderBody, resultIndicator: proof };
}

async function queueBookingForRetry(bookingReference, orderBody) {
  if (!supabase || !bookingReference) return false;

  const { data: row } = await supabase
    .from('bookings')
    .select('booking_details')
    .eq('booking_reference', bookingReference)
    .single();
  // No checkout row means nothing to hold the order against - and nothing
  // that proves a payment, which the chain would refuse on replay anyway.
  if (!row) return false;

  const details = row.booking_details || {};
  const queueAttempts = Number(details.gds_chain?.queueAttempts || 0) + 1;

  const order = orderWithPayerProof(orderBody, details);
  if (queueAttempts > MAX_QUEUE_ATTEMPTS) return false;

  const queuedAt = new Date().toISOString();
  const { error } = await supabase
    .from('bookings')
    .update({
      booking_details: {
        ...details,
        queued_order: order,
        // Local dev and production share one database. Only a worker in the
        // environment that queued a booking may run it - a laptop must never
        // replay a customer's booking, and production must never book a test.
        queued_env: process.env.NODE_ENV || 'development',
        // `startedAt` is what the next claim compares-and-sets on.
        gds_chain: { state: 'queued', startedAt: queuedAt, queuedAt, attempt: details.gds_chain?.attempt, queueAttempts },
      },
      updated_at: queuedAt,
    })
    .eq('booking_reference', bookingReference);

  if (error) {
    console.error('⚠️ Could not queue the booking, refunding instead:', error.message);
    return false;
  }
  return true;
}

/**
 * Tell the customer a queued booking is on its way. 202 + PENDING_CONFIRMATION
 * is the shape both clients already show as a successful, pending booking.
 */
function respondQueued(res, bookingReference) {
  console.warn('📥 No Amadeus slot free - booking queued for retry', bookingReference);
  return res.status(202).json({
    success: true,
    data: { id: bookingReference, pnr: null, status: 'PENDING_CONFIRMATION', bookingReference },
    pnr: null,
    orderId: bookingReference,
    bookingReference,
    queued: true,
    message: 'Your payment is received and your booking is being confirmed with the airline. '
      + 'You will receive your confirmation by email within a few minutes.'
  });
}

/** Release the claim so a later attempt is not blocked by a dead one. */
async function releaseBookingChain(bookingReference, failedStep) {
  return patchBookingDetails(bookingReference, {
    gds_chain: {
      state: 'failed',
      failedStep: failedStep || null,
      finishedAt: new Date().toISOString(),
    },
  });
}

/**
 * Did this request come from whoever paid for the booking?
 *
 * Every refund path in POST /order reverses the payment behind the reference
 * in the body, and the route has no auth middleware. Knowing a reference is not
 * proof of anything - it sits in callback URLs, emails and support tickets.
 * Two things are:
 *
 *   - the signed-in owner of the row, or staff;
 *   - the success indicator ARC issued for this checkout session. ARC hands it
 *     only to the paying browser, on the redirect back, and both clients post
 *     it on as `transactionId` (or `resultIndicator`). The queue stores the
 *     original body, so a replay carries it too.
 */
export function provesPayer(req, booking) {
  const user = req?.user;
  const details = booking?.booking_details || {};
  if (user && (isStaff(user)
    || (booking?.user_id && booking.user_id === user.id)
    || (details.original_user_id && details.original_user_id === user.id))) {
    return true;
  }
  const expected = details.success_indicator;
  const presented = req?.body?.resultIndicator || req?.body?.transactionId;
  return Boolean(expected) && Boolean(presented) && String(presented) === String(expected);
}

/**
 * How often a running chain renews its claim. Well inside CHAIN_CLAIM_TTL_MS,
 * so a live chain never looks abandoned.
 */
const CHAIN_HEARTBEAT_MS = 30_000;

/**
 * Renew the claim of a chain that is still running.
 *
 * The claim expires so a killed request cannot lock a booking out forever. But
 * a live chain slower than the TTL looked exactly as dead: the queue worker, or
 * the customer retrying, took the claim over and ran Air_Sell a second time
 * against one payment. A compare-and-set on the state and the stamp just read,
 * so a renewal can never undo a commit or a release that landed in between.
 */
async function refreshChainClaim(bookingReference) {
  if (!supabase || !bookingReference) return false;
  const { data: row } = await supabase
    .from('bookings')
    .select('booking_details')
    .eq('booking_reference', bookingReference)
    .single();
  const details = row?.booking_details || {};
  const chain = details.gds_chain;
  if (chain?.state !== 'in_progress' || !chain.startedAt) return false;

  const { data } = await supabase
    .from('bookings')
    .update({ booking_details: { ...details, gds_chain: { ...chain, startedAt: new Date().toISOString() } } })
    .eq('booking_reference', bookingReference)
    .eq('booking_details->gds_chain->>state', 'in_progress')
    .eq('booking_details->gds_chain->>startedAt', chain.startedAt)
    .select('booking_reference');
  return Boolean(data?.length);
}

/**
 * Does this request still hold the booking it claimed? Asked by the booking
 * chain just before it commits the PNR.
 *
 * The heartbeat renews a running chain's claim, but its failures were
 * swallowed, and a chain slower than the claim's life looks abandoned either
 * way. A retry, the booking queue or a cancel could then take the booking over
 * while this chain carried on - and both committed a PNR against one payment.
 *
 * Held means the claim is still this request's (same attempt, still in
 * progress), and it is renewed here with a compare-and-set, so nothing can take
 * it over during the commit itself. Lost means someone else has it: don't
 * commit. Unavailable means the database could not say: don't commit either.
 *
 * @returns {Promise<'held'|'lost'|'unavailable'>}
 */
export async function holdChainClaim(bookingReference, attempt) {
  if (!supabase || !bookingReference) return 'held';
  const { data: row, error: readError } = await supabase
    .from('bookings')
    .select('booking_details')
    .eq('booking_reference', bookingReference)
    .single();
  if (readError && readError.code !== 'PGRST116') return 'unavailable';
  if (!row) return 'lost';

  const details = row.booking_details || {};
  const chain = details.gds_chain;
  if (chain?.state !== 'in_progress' || !chain.startedAt) return 'lost';
  if (attempt != null && Number(chain.attempt) !== Number(attempt)) return 'lost';

  const renewedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('bookings')
    .update({ booking_details: { ...details, gds_chain: { ...chain, startedAt: renewedAt } }, updated_at: renewedAt })
    .eq('booking_reference', bookingReference)
    .eq('booking_details->gds_chain->>state', 'in_progress')
    .eq('booking_details->gds_chain->>startedAt', chain.startedAt)
    .select('booking_reference');
  if (error) return 'unavailable';
  return data?.length ? 'held' : 'lost';
}

/**
 * How long a claim on sending a booking's confirmation email holds before a
 * later request may take it over: far longer than a send takes, short enough
 * that a process killed mid-send does not stop the email for good.
 */
const CONFIRMATION_EMAIL_CLAIM_TTL_MS = 5 * 60_000;

/**
 * Review flags that describe a booking the success path confirmed, and emailed,
 * as it stands: the chain's "issued, but the ticket numbers had not surfaced",
 * and the paid-not-ticketed alarm's label for an ordinary unticketed
 * reservation it announced. Any other flag is a booking a human is sorting
 * out, and the success path sends that booking no confirmation.
 */
const EMAILED_REVIEW_REASONS = new Set(['ticket_numbers_not_retrieved', UNTICKETED_REVIEW_REASON]);

/**
 * Does this booking still owe its customer the confirmation email?
 *
 * A retried order - a customer's second click, the booking queue, the
 * abandoned-checkout job - finds the booking done and answers ALREADY_BOOKED.
 * That answer used to send nothing, so a booking whose first email was skipped
 * for want of an address, or failed, never got one. It is owed only what the
 * success path would have sent for the booking as it is now: nothing once it
 * is cancelled or its money returned, nothing for one a human is sorting out
 * for some other reason. The email itself says reservation or confirmation
 * from the row (isUnticketedFlight), exactly as it does on the success path.
 *
 * A booking the order route held for staff after its PNR was committed is owed
 * an email too - the "held" one, see confirmationEmailKind.
 */
export function confirmationEmailOwed(booking) {
  return confirmationEmailKind(booking) !== null;
}

/**
 * The review flags the order route's two 202 "needs review" answers write: the
 * airline holds the seats, and a later step - queueing, ticketing, the final
 * save - failed. Those answers sent no email at all, while the page said one
 * had been sent.
 */
const HELD_REVIEW_REASON_PREFIXES = ['chain failed after commit at ', 'order route failed after commit'];

/**
 * Which email a booking still owes its customer.
 *
 *  - 'confirmation': what the success path sends (reservation or confirmation);
 *  - 'held': "your reservation is held, our team is finishing your ticket", for
 *    a booking the order route held for staff after committing its PNR;
 *  - null: nothing - no booking yet, cancelled, money returned, already sent, or
 *    flagged for a reason a person is handling (a cancellation, say).
 *
 * Both are sent through the one claim in sendConfirmationOnce, so a booking gets
 * one of them, once.
 *
 * @returns {'confirmation'|'held'|null}
 */
export function confirmationEmailKind(booking) {
  const details = booking?.booking_details || {};
  if (!details.pnr) return null;
  if (booking.status === 'cancelled' || ['refunded', 'partially_refunded'].includes(booking.payment_status)) return null;
  if (details.confirmation_email?.state === 'sent') return null;
  const review = details.needs_review;
  if (!review || EMAILED_REVIEW_REASONS.has(review.reason)) return 'confirmation';
  const reason = String(review.reason || '');
  return HELD_REVIEW_REASON_PREFIXES.some((prefix) => reason.startsWith(prefix)) ? 'held' : null;
}

/**
 * Take the right to send a booking's confirmation email.
 *
 * Two retries of one order can arrive together - a double click, the queue and
 * the customer's own browser - and each would send. As in claimBookingChain, a
 * conditional UPDATE on the claim stamp just read decides the winner: both
 * requests write conditioned on the same prior stamp, and the second matches
 * no rows. The same caveat applies too: PostgREST rejects arrow paths inside
 * `or` on an UPDATE, so the condition is a single `is` or `eq`.
 *
 * `failOpen` is for the booking's first send, which went out unconditionally
 * before this claim existed: a bookkeeping failure must not cost the customer
 * that email. A retry fails closed, because a later retry can still send.
 */
async function claimConfirmationEmail(bookingReference, { failOpen = false } = {}) {
  if (!supabase || !bookingReference) return { claimed: failOpen };

  const { data: row, error: readError } = await supabase
    .from('bookings')
    .select('status, booking_details')
    .eq('booking_reference', bookingReference)
    .single();
  if (readError || !row) return { claimed: failOpen, unavailable: true };

  const details = row.booking_details || {};
  const prior = details.confirmation_email || null;
  if (prior?.state === 'sent') return { claimed: false, alreadySent: true };
  const priorStamp = prior?.claimed_at ?? null;
  const heldLive = prior?.state === 'sending' && priorStamp
    && Date.now() - Date.parse(priorStamp) < CONFIRMATION_EMAIL_CLAIM_TTL_MS;
  if (heldLive) return { claimed: false };

  const claimedAt = new Date().toISOString();
  let update = supabase
    .from('bookings')
    .update({
      booking_details: {
        ...details,
        // What was done and when, never to whom: no address is kept here.
        confirmation_email: { state: 'sending', claimed_at: claimedAt, attempt: Number(prior?.attempt || 0) + 1 },
      },
    })
    .eq('booking_reference', bookingReference)
    // The whole column is written back, so a cancellation that landed since the
    // read must make this match nothing rather than be overwritten.
    .eq('status', row.status);
  update = priorStamp === null
    ? update.is('booking_details->confirmation_email->>claimed_at', null)
    : update.eq('booking_details->confirmation_email->>claimed_at', priorStamp);

  const { data, error } = await update.select('booking_reference');
  if (error) {
    console.error('⚠️ Could not claim the confirmation email:', error.message);
    return { claimed: failOpen, unavailable: true };
  }
  if (!data?.length) return { claimed: false };
  return { claimed: true, claimedAt };
}

/** Write down how a claimed send went, while the claim is still this request's. */
async function recordConfirmationEmail(bookingReference, claimedAt, outcome) {
  if (!supabase || !bookingReference || !claimedAt) return;
  const { data: row } = await supabase
    .from('bookings')
    .select('booking_details')
    .eq('booking_reference', bookingReference)
    .single();
  const details = row?.booking_details;
  if (!details) return;
  const { error } = await supabase
    .from('bookings')
    .update({ booking_details: { ...details, confirmation_email: { ...details.confirmation_email, ...outcome, claimed_at: claimedAt } } })
    .eq('booking_reference', bookingReference)
    .eq('booking_details->confirmation_email->>claimed_at', claimedAt);
  if (error) console.error('⚠️ Could not record the confirmation email:', error.message);
}

/**
 * Send a booking's confirmation email unless another request has, or is doing
 * so now. Never throws: an email is never the reason an order request fails.
 */
export async function sendConfirmationOnce(bookingReference, emailData, { failOpen = false } = {}) {
  try {
    if (!emailData?.customerEmail) return { sent: false, reason: 'no-address' };
    const claim = await claimConfirmationEmail(bookingReference, { failOpen });
    if (!claim.claimed) {
      return { sent: false, reason: claim.alreadySent ? 'already-sent' : claim.unavailable ? 'unavailable' : 'in-progress' };
    }

    let sent = false;
    try {
      const { sendBookingNotificationEmails } = await import('../services/emailService.js');
      const result = await sendBookingNotificationEmails(emailData);
      sent = result?.success === true;
      if (sent) console.log('✅ Booking confirmation email sent', { bookingReference });
      else console.warn('⚠️ Booking confirmation email not sent:', result?.error || 'unknown reason');
    } catch (emailError) {
      console.error('❌ Failed to send booking confirmation email:', emailError.message);
    }

    const now = new Date().toISOString();
    await recordConfirmationEmail(bookingReference, claim.claimedAt,
      sent ? { state: 'sent', sent_at: now } : { state: 'failed', failed_at: now });
    return { sent };
  } catch (error) {
    console.error('❌ Confirmation email step failed:', error.message);
    return { sent: false, reason: 'error' };
  }
}

/**
 * Email the customer of a booking the order route has just held for staff.
 *
 * Read back from the row, so the email says what was recorded, and sent through
 * the confirmation's own claim, so a retry or the queue cannot send a second.
 * It is the booking's first chance to email, so it fails open like the success
 * path's first send. Never throws.
 */
async function sendHeldForReviewEmail(bookingReference, body) {
  try {
    const row = await findExistingBooking(bookingReference);
    if (confirmationEmailKind(row) !== 'held') return { sent: false, reason: 'not-owed' };
    return await sendConfirmationOnce(row.booking_reference, confirmationEmailFromRow(row, body), { failOpen: true });
  } catch (error) {
    console.error('❌ Held-booking email step failed:', error.message);
    return { sent: false, reason: 'error' };
  }
}

/**
 * How far back another booking counts as the first payment for the same trip.
 * The second payment page was opened minutes after the first, but the second
 * payment can reach this route much later - the abandoned-checkout job books
 * for up to six hours - and a booking made days ago for the same people on the
 * same flights is no less a duplicate.
 */
const DUPLICATE_LOOKBACK_MS = 30 * DAY_MS;

/** What the customer is told when their payment is held as a second payment for one trip. */
function duplicatePaymentAnswer(bookingReference) {
  const message = 'This payment looks like a second payment for a trip you have already booked, for the same travellers '
    + 'on the same flights, so we have not booked it again. Your other booking is not affected. Our support team will '
    + 'check it and refund this payment. If you did mean to book this trip twice, or have not heard from us within '
    + `2 business days, call (877) 538-7380 with booking reference ${bookingReference}.`;
  return {
    success: false,
    code: 'DUPLICATE_PAYMENT',
    duplicatePayment: true,
    needsReview: true,
    bookingReference,
    error: message,
    message,
  };
}

/**
 * Another booking of this customer's, for the same travellers on the same
 * flights, that is booked or on its way to being booked.
 *
 * "This customer" is the account the checkout was made from, or the email it
 * was made with. "Booked or on its way" is a PNR, a committed or queued chain,
 * or a chain in progress that claimed first - the earlier claim, or the lower
 * reference on a tie. Two paid checkouts racing each other both get here after
 * taking their own claim, so they see each other, and only the later one is
 * held. Same names, not just the same flights: a family can book one flight
 * twice for different people, and nothing here refunds anybody.
 *
 * @returns {Promise<{ duplicateOf: string|null } | { unavailable: true }>}
 */
async function findDuplicateBooking(booking, { travellers, offer, claimedAt, now = Date.now() }) {
  const flights = flightsKey(offer);
  const names = travellerNamesKey(travellers);
  const details = booking.booking_details || {};
  const email = String(details.customer_email || '').trim();
  if (!supabase || !flights || !names || (!booking.user_id && !email)) return { duplicateOf: null };

  const lookups = [
    ...(booking.user_id ? [['user_id', booking.user_id]] : []),
    // In any letter case: checkout stores the address as typed, and the same
    // guest typing "Jane@" once and "jane@" the next time is the same guest.
    // ilike with its wildcards escaped - `_` is common in addresses.
    ...(email ? [['booking_details->>customer_email', email.replace(/[\\%_]/g, (c) => `\\${c}`), 'ilike']] : []),
  ];
  const candidates = new Map();
  for (const [column, value, op = 'eq'] of lookups) {
    const { data, error } = await supabase
      .from('bookings')
      .select('booking_reference, user_id, status, payment_status, created_at, booking_details, passenger_details')
      .eq('travel_type', 'flight')[op](column, value)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      console.error('⚠️ Could not look for a duplicate booking:', error.message);
      return { unavailable: true };
    }
    for (const row of Array.isArray(data) ? data : []) candidates.set(row.booking_reference, row);
  }

  const mine = Date.parse(claimedAt);
  for (const row of candidates.values()) {
    if (row.booking_reference === booking.booking_reference) continue;
    const other = row.booking_details || {};
    const sameCustomer = (booking.user_id && row.user_id === booking.user_id)
      || (email && String(other.customer_email || '').trim().toLowerCase() === email.toLowerCase());
    if (!sameCustomer) continue;
    if (row.status === 'cancelled' || ['refunded', 'partially_refunded'].includes(row.payment_status)) continue;
    // Itself a second payment already held: it is not the booking this one repeats.
    if (other.needs_review?.duplicate_of) continue;
    if (now - Date.parse(row.created_at) > DUPLICATE_LOOKBACK_MS) continue;

    const chain = other.gds_chain || {};
    const booked = Boolean(other.pnr) || Boolean(other.queued_order) || ['committed', 'queued'].includes(chain.state);
    const theirClaim = Date.parse(chain.claimedAt || chain.startedAt);
    const bookingFirst = chain.state === 'in_progress'
      && now - Date.parse(chain.startedAt) < CHAIN_CLAIM_TTL_MS
      && Number.isFinite(theirClaim)
      && (theirClaim < mine || (theirClaim === mine && row.booking_reference < booking.booking_reference));
    if (!booked && !bookingFirst) continue;

    const theirOffer = other.flight_offer || other.pending_booking_data?.bookingData?.originalOffer || other.queued_order?.flightOffer;
    const theirTravellers = (Array.isArray(row.passenger_details) && row.passenger_details.length > 0 ? row.passenger_details : null)
      || other.pending_booking_data?.bookingData?.passengerData
      || other.queued_order?.travelers;
    if (flightsKey(theirOffer) === flights && travellerNamesKey(theirTravellers) === names) {
      return { duplicateOf: row.booking_reference };
    }
  }
  return { duplicateOf: null };
}

/**
 * Put a second payment for one trip in front of a human, and let go of the
 * chain claim this request took: nothing was sold. `needs_review` is what the
 * paid-not-ticketed alarm announces, and what keeps the abandoned-checkout job
 * and a retry of this order from booking it.
 */
async function holdDuplicatePayment(bookingReference, duplicateOf) {
  const at = new Date().toISOString();
  return patchBookingDetails(bookingReference, {
    needs_review: {
      reason: `possible duplicate payment: the same travellers on the same flights are already booked, or being booked, as ${duplicateOf}. `
        + 'Held, not booked: refund it, or book it by hand if the customer meant to book twice.',
      ticketed: false,
      at,
      duplicate_of: duplicateOf,
      source: 'duplicate-payment',
    },
    gds_chain: { state: 'failed', failedStep: 'duplicate-payment', finishedAt: at },
  });
}

/**
 * The confirmation email for a booking already saved, rebuilt from its row for
 * a retry that found it done: the fields the success path sends, in its order
 * of preference for the address.
 */
function confirmationEmailFromRow(booking, body = {}) {
  const {
    // Neither the payment secret nor the checkout's copy of the travellers'
    // documents has any business in an email template.
    success_indicator: _secret,
    pending_booking_data: checkout,
    queued_order: _queued,
    confirmation_email: _record,
    ...details
  } = booking.booking_details || {};
  const offer = details.flight_offer || checkout?.bookingData?.originalOffer || null;
  const segments = offer?.itineraries?.[0]?.segments || [];
  const firstSegment = segments[0] || {};
  const lastSegment = segments[segments.length - 1] || firstSegment;
  const travellers = Array.isArray(body?.travelers) && body.travelers.length > 0
    ? body.travelers
    : (checkout?.bookingData?.passengerData || []);
  const lead = travellers[0] || {};
  const name = `${lead.firstName || lead.name?.firstName || ''} ${lead.lastName || lead.name?.lastName || ''}`.trim();

  return {
    customerEmail: body?.contactInfo?.email || body?.customerEmail || lead.email || details.customer_email || '',
    customerName: name || 'Valued Customer',
    bookingReference: booking.booking_reference,
    bookingType: 'flight',
    // Held for staff: the email says the ticket is being finished by a person,
    // not that the booking is confirmed.
    heldForReview: confirmationEmailKind(booking) === 'held',
    paymentAmount: booking.total_amount || offer?.price?.total || '0',
    currency: details.currency || offer?.price?.currency || 'USD',
    travelDate: details.departure_date_full || firstSegment.departure?.at?.split('T')[0],
    passengers: travellers.length || 1,
    bookingDetails: {
      ...details,
      origin: details.origin || firstSegment.departure?.iataCode,
      destination: details.destination || lastSegment.arrival?.iataCode,
      airline: details.airline_name || offer?.validatingAirlineCodes?.[0],
      // Every leg and flight, so the email shows the return flight and each
      // connection. A booking saved before legs were kept has them rebuilt
      // from its offer.
      itineraries: Array.isArray(details.itineraries) && details.itineraries.length > 0
        ? details.itineraries
        : itinerariesFromOffer(offer),
    },
  };
}

/**
 * The row's `status` is an observation, not a literal.
 *
 * It used to be `'confirmed'` for every booking the chain produced. With
 * AUTO_TICKET off - which is every booking so far - that is a committed PNR
 * sitting on a ticketing deadline, and the database could not tell it apart
 * from a ticketed one; nor could My Trips, the confirmation email, or the
 * paid-but-not-ticketed alarm. A booking is confirmed when a ticket exists.
 * Until then it is `pending_ticketing`: a real reservation, honestly labelled.
 *
 * `payment_status: 'paid'` stays a literal, and is now honest: the order route
 * refuses to reach this function unless the gateway confirmed a capture.
 */
export function buildBookingRow(bookingData, userId) {
  const ticketed = bookingData.ticketed === true
    || bookingData.gds?.ticketed === true
    || (Array.isArray(bookingData.tickets) && bookingData.tickets.length > 0);

  return {
    user_id: userId || null,
    booking_reference: bookingData.bookingReference,
    travel_type: 'flight',
    status: ticketed ? 'confirmed' : 'pending_ticketing',
    total_amount: parseFloat(bookingData.totalAmount) || 0,
    payment_status: 'paid',
    booking_details: {
      // The chain's own verdict that issuance succeeded but the ticket numbers
      // had not surfaced before its retries ran out. It used to be computed,
      // returned in the HTTP body, and never written anywhere - so the one
      // job that watches for it never saw it.
      ...(bookingData.needsReview ? { needs_review: bookingData.needsReview } : {}),
      pnr: bookingData.pnr,
      order_id: bookingData.orderId,
      // Real Amadeus order id — required to cancel the reservation via the GDS
      amadeus_order_id: bookingData.amadeusOrderId || null,
      transaction_id: bookingData.transactionId,
      amount: parseFloat(bookingData.totalAmount) || 0,
      currency: bookingData.currency || 'USD',
      origin: bookingData.origin,
      destination: bookingData.destination,
      departure_date: bookingData.departureDate,
      departure_time: bookingData.departureTime,
      arrival_time: bookingData.arrivalTime,
      airline: bookingData.airline,
      airline_name: bookingData.airlineName,
      flight_number: bookingData.flightNumber,
      duration: bookingData.duration,
      cabin_class: bookingData.cabinClass,
      // Amadeus enriched fields
      departure_terminal: bookingData.departureTerminal || '',
      arrival_terminal: bookingData.arrivalTerminal || '',
      aircraft: bookingData.aircraft || '',
      stops: bookingData.stops ?? 0,
      stop_details: bookingData.stopDetails || [],
      branded_fare: bookingData.brandedFare || null,
      branded_fare_label: bookingData.brandedFareLabel || null,
      operating_carrier: bookingData.operatingCarrier || null,
      operating_airline_name: bookingData.operatingAirlineName || null,
      last_ticketing_date: bookingData.lastTicketingDate || null,
      number_of_bookable_seats: bookingData.numberOfBookableSeats || null,
      // Null when the fare did not say; `|| false` stored "non-refundable".
      refundable: bookingData.refundable ?? null,
      baggage_details: bookingData.baggageDetails || null,
      baggage: bookingData.baggage || null,
      // Fall back to the bundled airports dataset. Amadeus does not return a
      // city name on a flight offer, so these were persisted empty on every
      // booking and the confirmation email and Manage Booking then showed a
      // bare code where "DEL · New Delhi" belongs.
      origin_city: bookingData.originCity || cityNameFor(bookingData.origin),
      destination_city: bookingData.destinationCity || cityNameFor(bookingData.destination),
      departure_date_full: bookingData.departureDateFull || '',
      // Every leg and every flight (shared/bookingItineraries.js). The flat
      // fields above describe the first leg only, so a round trip's return
      // flight was saved nowhere, and a connection only as its first flight
      // number and its last arrival. They stay for the clients that read them.
      itineraries: Array.isArray(bookingData.itineraries) ? bookingData.itineraries : [],
      arrival_date: bookingData.arrivalDate || '',
      price_base: bookingData.priceBase || null,
      price_grand_total: bookingData.priceGrandTotal || null,
      price_fees: bookingData.priceFees || [],
      flight_offer: bookingData.flightOffer,
      // Everything the GDS chain established: office, session, TST references,
      // whether it ticketed and what it priced at.
      gds: bookingData.gds || null,
      tickets: bookingData.tickets || [],
      // Fare breakdown for itemized display & refund support
      fare_breakdown: bookingData.fareBreakdown || null,
      // Store the original userId in booking_details so we can identify the user
      // even if user_id column is null (FK constraint fallback)
      original_user_id: bookingData.userId || null
    },
    passenger_details: bookingData.passengerData || bookingData.passengerDetails || bookingData.travelers || []
  };
}

// Helper to handle duplicate booking_reference
export async function handleDuplicateBookingMerge(bookingData, rowTemplate) {
  console.log('🔄 Booking reference already exists, merging into the checkout row...');

  const { data: existingBooking } = await supabase
    .from('bookings')
    .select('status, user_id, payment_status, total_amount, booking_details')
    .eq('booking_reference', bookingData.bookingReference)
    .single();

  // Every save lands here: hosted checkout creates the row before the customer
  // pays, so the insert always collides. The merge used to overwrite that row
  // with the template, keeping only four session fields. That set user_id to
  // null on a queue replay (no session), so the booking vanished from My
  // Trips; forced a cancelled or refunded row back to a live status; replaced
  // total_amount with the order request's figure; and dropped the payment
  // evidence (arc_transaction_id, arc_captured_amount, payment_reconciled_at),
  // the chain claim, any cancellation record and the customer's email.
  //
  // Now what checkout and the gateway established is kept, and what the chain
  // just learned is laid on top of it.
  const existingDetails = existingBooking?.booking_details || {};
  const mergedDetails = {
    ...existingDetails,
    ...rowTemplate.booking_details,
    original_user_id: rowTemplate.booking_details.original_user_id || existingDetails.original_user_id || null,
  };

  const update = {
    ...rowTemplate,
    booking_details: mergedDetails,
    user_id: existingBooking?.user_id || rowTemplate.user_id || null,
  };
  // Never resurrect a cancelled booking, or re-mark returned money as paid.
  if (existingBooking?.status === 'cancelled') update.status = 'cancelled';
  if (['refunded', 'partially_refunded'].includes(existingBooking?.payment_status)) {
    update.payment_status = existingBooking.payment_status;
  }
  // What checkout asked the gateway to charge, not the order request's figure.
  if (Number(existingBooking?.total_amount) > 0) update.total_amount = existingBooking.total_amount;

  const { data: updatedData, error: updateError } = await supabase
    .from('bookings')
    .update(update)
    .eq('booking_reference', bookingData.bookingReference)
    .select()
    .single();

  if (updateError) {
    console.error('❌ Update with merged data failed:', updateError.message);
    return null;
  }

  console.log('✅ SUCCESS (merged)! Booking updated with ARC Pay data preserved:');
  console.log('   Database ID:', updatedData.id);
  console.log('   Session ID preserved:', mergedDetails.session_id || 'NONE');
  console.log('   Booking Reference:', updatedData.booking_reference);
  return updatedData;
}

// Helper function to save booking to database
async function saveBookingToDatabase(bookingData) {
  if (!supabase) {
    console.error('❌ CRITICAL: Supabase not configured! Bookings will NOT be saved to database!');
    console.error('   Please check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables');
    return null;
  }

  console.log('💾 Attempting to save booking to database...');
  console.log('   User ID:', bookingData.userId || 'NULL (GUEST USER)');
  console.log('   Booking Reference:', bookingData.bookingReference);
  console.log('   PNR:', bookingData.pnr);

  try {
    // First attempt: insert with the provided userId
    const row = buildBookingRow(bookingData, bookingData.userId);
    const { data, error } = await supabase
      .from('bookings')
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error('❌ ERROR saving booking to database:');
      console.error('   Error Code:', error.code);
      console.error('   Error Message:', error.message);
      console.error('   User ID that was attempted:', bookingData.userId || 'null');

      // If duplicate key right away
      if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
        return await handleDuplicateBookingMerge(bookingData, row);
      }

      // If the error is a FK violation (user_id not in auth.users) or RLS policy
      // violation, retry without user_id so the booking is still saved
      if (bookingData.userId && (error.code === '23503' || error.code === '42501' || error.message?.includes('violates foreign key') || error.message?.includes('row-level security'))) {
        console.log('🔄 Retrying booking save without user_id (FK/RLS constraint issue)...');
        const fallbackRow = buildBookingRow(bookingData, null);
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('bookings')
          .insert(fallbackRow)
          .select()
          .single();

        if (fallbackError) {
          // If the fallback hits duplicate key
          if (fallbackError.code === '23505' || fallbackError.message?.includes('duplicate key') || fallbackError.message?.includes('unique constraint')) {
            return await handleDuplicateBookingMerge(bookingData, fallbackRow);
          }
          console.error('❌ Fallback save also failed:', fallbackError.message);
          return null;
        }

        console.log('✅ SUCCESS (fallback)! Booking saved without user_id:');
        console.log('   Database ID:', fallbackData.id);
        console.log('   Original User ID stored in booking_details:', bookingData.userId);
        console.log('   Booking Reference:', fallbackData.booking_reference);
        return fallbackData;
      }

      return null;
    }

    console.log('✅ SUCCESS! Booking saved to database:');
    console.log('   Database ID:', data.id);
    console.log('   User ID:', data.user_id);
    console.log('   Booking Reference:', data.booking_reference);
    return data;
  } catch (err) {
    console.error('❌ EXCEPTION in database save:');
    console.error('   Error:', err.message);
    console.error('   Stack:', err.stack);
    return null;
  }
}



// Common city name to IATA code mapping for resolving non-IATA inputs
const CITY_TO_IATA = {
  // Major international cities
  'new york': 'JFK', 'new delhi': 'DEL', 'los angeles': 'LAX', 'san francisco': 'SFO',
  'chicago': 'ORD', 'miami': 'MIA', 'london': 'LHR', 'paris': 'CDG', 'tokyo': 'NRT',
  'dubai': 'DXB', 'singapore': 'SIN', 'hong kong': 'HKG', 'bangkok': 'BKK',
  'sydney': 'SYD', 'toronto': 'YYZ', 'mumbai': 'BOM', 'bangalore': 'BLR',
  'hyderabad': 'HYD', 'chennai': 'MAA', 'kolkata': 'CCU', 'goa': 'GOI',
  'jaipur': 'JAI', 'ahmedabad': 'AMD', 'pune': 'PNQ', 'kochi': 'COK',
  'beijing': 'PEK', 'shanghai': 'PVG', 'seoul': 'ICN', 'istanbul': 'IST',
  'rome': 'FCO', 'amsterdam': 'AMS', 'frankfurt': 'FRA', 'berlin': 'BER',
  'madrid': 'MAD', 'barcelona': 'BCN', 'kuala lumpur': 'KUL', 'bali': 'DPS',
  'maldives': 'MLE', 'phuket': 'HKT', 'kathmandu': 'KTM', 'colombo': 'CMB',
  'doha': 'DOH', 'abu dhabi': 'AUH', 'riyadh': 'RUH', 'cairo': 'CAI',
  'nairobi': 'NBO', 'johannesburg': 'JNB', 'sao paulo': 'GRU', 'mexico city': 'MEX',
  'dallas': 'DFW', 'houston': 'IAH', 'seattle': 'SEA', 'boston': 'BOS',
  'washington': 'IAD', 'atlanta': 'ATL', 'denver': 'DEN', 'las vegas': 'LAS',
  'orlando': 'MCO', 'philadelphia': 'PHL', 'vancouver': 'YVR', 'melbourne': 'MEL',
  'auckland': 'AKL', 'delhi': 'DEL', 'bombay': 'BOM', 'calcutta': 'CCU',
  'madras': 'MAA', 'bengaluru': 'BLR', 'trivandrum': 'TRV', 'lucknow': 'LKO',
  'chandigarh': 'IXC', 'indore': 'IDR', 'varanasi': 'VNS', 'amritsar': 'ATQ',
  'patna': 'PAT', 'mangalore': 'IXE', 'coimbatore': 'CJB', 'srinagar': 'SXR',
  'udaipur': 'UDR', 'jodhpur': 'JDH',
};

/**
 * Resolve a location string to an IATA code.
 * If it's already 3 uppercase letters, return as-is.
 * Otherwise try the static map, then fall back to Amadeus location search.
 */
const resolveToIATACode = (location) => {
  if (!location) return location;
  if (/^[A-Z]{3}$/.test(location)) return location;

  // Curated overrides first, then the bundled dataset. The WSAP has no
  // location-search operation, so there is no network fallback - an
  // unresolvable place is returned as-is and Amadeus reports it clearly.
  const lower = String(location).toLowerCase().trim();
  if (CITY_TO_IATA[lower]) return CITY_TO_IATA[lower];

  return resolveToIata(location) ?? location;
};

// Transform Amadeus API response to frontend format
const transformAmadeusFlightData = (flights, dictionaries = {}) => {
  if (!flights || flights.length === 0) return [];

  const airlines = dictionaries?.carriers || {};
  const airports = dictionaries?.locations || {};
  const aircraft = dictionaries?.aircraft || {};

  return flights.map((flight, index) => {
    try {
      const firstItinerary = flight.itineraries[0];
      const firstSegment = firstItinerary?.segments?.[0];
      const lastSegment = firstItinerary?.segments?.[firstItinerary.segments.length - 1];

      if (!firstSegment || !lastSegment) {
        console.warn('Invalid flight segment data:', flight);
        return null;
      }

      // Calculate total duration
      let totalDuration = 'Unknown';
      let durationMinutes = null;
      if (firstItinerary?.duration) {
        const durationMatch = firstItinerary.duration.match(/PT(\d+H)?(\d+M)?/);
        if (durationMatch) {
          const hours = durationMatch[1] ? parseInt(durationMatch[1]) : 0;
          const minutes = durationMatch[2] ? parseInt(durationMatch[2]) : 0;
          totalDuration = `${hours}h ${minutes}m`;
          durationMinutes = hours * 60 + minutes;
        }
      }

      // Get airline name
      const carrierCode = firstSegment.carrierCode;
      const airlineName = airlines[carrierCode] || carrierCode;

      // Format departure and arrival
      const departure = {
        time: new Date(firstSegment.departure.at).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }),
        airport: firstSegment.departure.iataCode,
        terminal: firstSegment.departure.terminal || '',
        date: firstSegment.departure.at.split('T')[0]
      };

      const arrival = {
        time: new Date(lastSegment.arrival.at).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }),
        airport: lastSegment.arrival.iataCode,
        terminal: lastSegment.arrival.terminal || '',
        date: lastSegment.arrival.at.split('T')[0]
      };

      // Calculate stops and layover details
      const segments = firstItinerary.segments;
      const stops = Math.max(0, segments.length - 1);

      let stopDetails = [];
      if (stops > 0) {
        stopDetails = segments.slice(0, -1).map((seg, index) => {
          const nextSeg = segments[index + 1];
          const arrivalTime = new Date(seg.arrival.at);
          const departureTime = new Date(nextSeg.departure.at);
          const diffMs = departureTime - arrivalTime;

          const hours = Math.floor(diffMs / 3600000);
          const minutes = Math.floor((diffMs % 3600000) / 60000);
          const durationStr = `${hours}h ${minutes}m`;

          return {
            airport: seg.arrival.iataCode,
            terminal: seg.arrival.terminal || '',
            arrivalAt: seg.arrival.at,
            departureAt: nextSeg.departure.at,
            duration: durationStr,
            waitingTime: durationStr // explicit alias for clarity
          };
        });
      }

      // Get pricing info
      const price = {
        total: flight.price?.total || '0',
        amount: parseFloat(flight.price?.total || 0),
        currency: flight.price?.currency || 'USD',
        base: flight.price?.base || '0',
        grandTotal: flight.price?.grandTotal || flight.price?.total || '0',
        fees: flight.price?.fees || []
      };

      // Get traveler pricing for cabin class
      const travelerPricing = flight.travelerPricings?.[0];
      const fareDetails = travelerPricing?.fareDetailsBySegment?.[0];

      // Check all segments to find the highest cabin class
      const allCabins = travelerPricing?.fareDetailsBySegment?.map(f => f.cabin) || [];
      const cabinPriority = { 'FIRST': 4, 'BUSINESS': 3, 'PREMIUM_ECONOMY': 2, 'ECONOMY': 1 };

      // Null when the fare does not say. Seeding this with 'ECONOMY' meant a
      // fare with no cabin data - or one in a cabin this table does not list -
      // was shown to the customer as Economy.
      const cabinRank = (c) => (c ? (cabinPriority[c] ?? 0.5) : -1);
      const cabin = allCabins.reduce((prev, current) => (cabinRank(current) > cabinRank(prev) ? current : prev), null);

      // Extract branded fare info
      const brandedFare = fareDetails?.brandedFare || null;
      const brandedFareLabel = fareDetails?.brandedFareLabel || null;

      // Extract operating carrier (codeshare info)
      const operatingCarrier = firstSegment.operating?.carrierCode || null;
      const operatingAirlineName = operatingCarrier ? (airlines[operatingCarrier] || operatingCarrier) : null;

      return {
        id: flight.id,
        airline: airlineName,
        airlineCode: carrierCode,
        flightNumber: `${carrierCode}-${firstSegment.number}`,
        price: price,
        duration: totalDuration,
        // The same duration as a number, for sorting. The web app's "Fastest"
        // sort parsed `duration` expecting "PT2H35M", read "2h 35m" as zero
        // for every flight, and sorted nothing.
        durationMinutes,
        departure: departure,
        arrival: arrival,
        stops: stops,
        stopDetails: stopDetails,
        aircraft: aircraft[firstSegment.aircraft?.code] || firstSegment.aircraft?.code || 'Unknown',
        cabin: cabin,
        brandedFare: brandedFare,
        brandedFareLabel: brandedFareLabel,
        operatingCarrier: operatingCarrier,
        operatingAirlineName: operatingAirlineName,
        lastTicketingDate: flight.lastTicketingDate || null,
        numberOfBookableSeats: flight.numberOfBookableSeats || null,
        baggage: fareDetails?.includedCheckedBags?.weight
          ? `${fareDetails.includedCheckedBags.weight} ${fareDetails.includedCheckedBags.weightUnit || 'KG'}`
          : (fareDetails?.includedCheckedBags?.quantity
            ? `${fareDetails.includedCheckedBags.quantity} ${fareDetails.includedCheckedBags.quantity === 1 ? 'Piece' : 'Pieces'}`
            : null),
        baggageDetails: {
          checked: fareDetails?.includedCheckedBags || null,
          cabin: fareDetails?.includedCabinBags || null
        },
        // Refundability as the fare's penalty rules state it, or null when they
        // do not. This read `refundableTaxes` - a tax amount this provider never
        // sets - so every fare was shown as "Non-refundable".
        refundable: flight._ama?.refundable ?? null,
        // Unknown is not "Available".
        seats: flight.numberOfBookableSeats ?? null,
        isUpsellOffer: flight.isUpsellOffer || false,
        // Richer Amadeus fare data surfaced to the UI
        amenities: fareDetails?.amenities || [],
        fareBasis: fareDetails?.fareBasis || null,
        bookingClass: fareDetails?.class || null,
        validatingAirlineCodes: flight.validatingAirlineCodes || [],
        originalOffer: flight // Keep original for booking
      };
    } catch (error) {
      console.error('Error transforming flight offer:', error);
      return null;
    }
  }).filter(Boolean);
};

// Flight search endpoint
router.post('/search', validate({ body: flightSearchSchema }), async (req, res) => {
  try {
    console.log('🔍 Flight search request received:', req.body);

    const { from, to, departDate, returnDate, tripType, travelers } = req.body;

    // Resolve city names to IATA codes (handles cases like "New York" -> "JFK")
    const resolvedFrom = resolveToIATACode(from);
    const resolvedTo = resolveToIATACode(to);
    console.log(`📍 Resolved locations: from="${from}" -> "${resolvedFrom}", to="${to}" -> "${resolvedTo}"`);

    // Prepare search parameters
    const searchParams = {
      from: resolvedFrom,
      to: resolvedTo,
      departDate,
      returnDate: returnDate && returnDate.trim() !== '' ? returnDate : undefined,
      adults: parseInt(req.body.adults || travelers) || 1,
      children: parseInt(req.body.children) || 0,
      infants: parseInt(req.body.infants) || 0,
      max: 50,
      travelClass: req.body.travelClass,
      nonStop: req.body.nonStop === 'true' || req.body.nonStop === true,
      maxPrice: req.body.maxPrice,
      includedAirlineCodes: req.body.includedAirlineCodes,
      excludedAirlineCodes: req.body.excludedAirlineCodes
    };

    console.log('Searching flights with params:', searchParams);

    try {
      // Call real Amadeus API (served from Redis cache when available; passthrough when not)
      const flightCacheKey = CacheKeys.flightSearch(
        searchParams.from,
        searchParams.to,
        `${searchParams.departDate}|${searchParams.returnDate || 'ow'}`,
        `${searchParams.adults}-${searchParams.children}-${searchParams.infants}-${searchParams.travelClass || 'any'}-${searchParams.nonStop ? 'ns' : 'any'}`
      );
      let amadeusResponse = await cacheGet(flightCacheKey);
      if (amadeusResponse) {
        console.log('✅ Flight search served from cache');
      } else {
        amadeusResponse = await FlightProvider.searchFlights(searchParams);
        // Only cache successful, non-empty results — never cache failures/empties
        if (amadeusResponse?.success && amadeusResponse.data?.length) {
          await cacheSet(flightCacheKey, amadeusResponse, TTL.FLIGHT_SEARCH);
        }
      }

      if (!amadeusResponse.success) {
        throw new Error(amadeusResponse.error);
      }

      console.log(`✅ Amadeus API returned ${amadeusResponse.data?.length || 0} flight offers`);

      if (!amadeusResponse.data || amadeusResponse.data.length === 0) {
        return res.json({
          success: true,
          data: [],
          message: 'No flights found for the specified route and date.'
        });
      }

      // Transform Amadeus response to frontend format
      const transformedFlights = transformAmadeusFlightData(
        amadeusResponse.data,
        amadeusResponse.dictionaries
      );

      console.log(`✅ Transformed ${transformedFlights.length} flights for frontend`);
      // Offers that failed to transform used to vanish without a trace: the
      // two counts below disagreed and nothing ever said so.
      const droppedCount = Math.max(0, amadeusResponse.data.length - transformedFlights.length);
      if (droppedCount > 0) {
        console.warn(`⚠️ ${droppedCount} of ${amadeusResponse.data.length} flight offers could not be shown`);
      }

      res.json({
        success: true,
        data: transformedFlights,
        meta: {
          searchParams: searchParams,
          resultCount: transformedFlights.length,
          totalResults: amadeusResponse.data.length,
          droppedCount,
          source: 'amadeus-gds'
        }
      });

    } catch (amadeusError) {
      console.error('❌ Amadeus API error:', amadeusError);

      // A refused request (400) says why in words the customer can act on -
      // "Each infant travels on an adult's lap..." - where every failure used
      // to read "Flight search failed".
      return res.status(amadeusError.code || 500).json({
        success: false,
        error: amadeusError.code === 400 && amadeusError.error ? amadeusError.error : 'Flight search failed',
        details: amadeusError.error || amadeusError.message || 'Unable to search flights at this time',
        code: amadeusError.code || 500
      });
    }
  } catch (error) {
    console.error('❌ Error in flight search:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

// Flight pricing endpoint
router.post('/price', async (req, res) => {
  try {
    console.log('💰 Flight pricing request received');

    const { flightOffer } = req.body;

    if (!flightOffer) {
      return res.status(400).json({
        success: false,
        error: 'Flight offer is required for pricing'
      });
    }

    const pricingResponse = await FlightProvider.priceFlightOffer(flightOffer);

    if (!pricingResponse.success) {
      throw new Error(pricingResponse.error);
    }

    res.json({
      success: true,
      data: pricingResponse.data,
      // Whether the trip crosses a border, from this server's airport index -
      // the one the order route decides a date of birth from. Checkout runs on
      // Vercel, which has no airport index, and asks here instead.
      meta: { international: crossesBorder(pricingResponse.data?.flightOffers?.[0] ?? flightOffer) },
      message: 'Flight priced successfully'
    });

  } catch (error) {
    console.error('❌ Flight pricing error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to price flight'
    });
  }
});

// Branded-fare upsell endpoint — returns alternative fare families for an offer
router.post('/upsell', async (req, res) => {
  try {
    const { flightOffer } = req.body;

    if (!flightOffer) {
      return res.status(400).json({
        success: false,
        error: 'Flight offer is required for upsell'
      });
    }

    const upsellResponse = await FlightProvider.getBrandedFareUpsell(flightOffer);

    // Reuse the standard transform so fare options share the card data shape
    const options = transformAmadeusFlightData(
      upsellResponse.data || [],
      upsellResponse.dictionaries
    );

    res.json({
      success: true,
      data: options,
      meta: { count: options.length }
    });

  } catch (error) {
    console.error('❌ Branded-fare upsell error:', error);
    // The caller still falls back to the fare that was clicked, but a failure is
    // reported as one: a 200 here read as "this flight has no other fares".
    res.status(502).json({
      success: false,
      data: [],
      error: error.error || error.message || 'Fare options are temporarily unavailable'
    });
  }
});

// Date-wise lowest fares for the date strip (cheapest fare per day)
router.post('/date-prices', async (req, res) => {
  try {
    const { from, to, dates, adults, children, infants, travelClass } = req.body;
    if (!from || !to || !Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({ success: false, error: 'from, to and dates[] are required' });
    }

    const cacheKey = CacheKeys.flightBrowse('date-prices', [
      resolveToIATACode(from), resolveToIATACode(to),
      `${adults || 1}-${children || 0}-${infants || 0}-${travelClass || 'any'}`,
      dates.slice().sort().join(','),
    ]);

    const payload = await withCache(cacheKey, TTL.FLIGHT_CALENDAR, () => FlightProvider.getCalendarPrices({
      from, to, adults, children, infants, travelClass, dates,
    }));

    // null means nothing could be priced, so nothing was cached. The strip
    // shows no prices rather than a wrong or stale empty answer.
    if (!payload) {
      return res.json({ success: false, dateWisePrices: {}, lowestPrice: null, error: 'No prices available' });
    }
    res.json(payload);
  } catch (error) {
    console.error('Date prices error:', error?.message);
    // Advisory endpoint: the date strip simply shows no prices rather than
    // failing the page around it.
    res.json({ success: false, dateWisePrices: {}, lowestPrice: null, error: error?.error || error?.message });
  }
});

// Fare rules + extra-bag prices for a chosen flight offer
router.post('/fare-rules', async (req, res) => {
  try {
    const { flightOffer } = req.body;
    if (!flightOffer) {
      return res.status(400).json({ success: false, error: 'flightOffer is required' });
    }

    // Filed rules where we can get them. getFiledFareRules runs informative
    // pricing and Fare_CheckRules in one session and returns the same shape
    // priceFlightOffer does, falling back to the thinner pricing text by
    // itself - so this scraper below is unchanged either way.
    let priced;
    try {
      priced = await FlightProvider.getFiledFareRules(flightOffer);
    } catch (cause) {
      console.warn('Filed fare rules unavailable, falling back to pricing text:', cause?.technicalError || cause?.message);
      priced = await FlightProvider.priceFlightOffer(flightOffer, {
        include: ['detailed-fare-rules', 'bags']
      });
    }

    const included = priced.included || {};

    // Structured extra-baggage options
    const bags = Object.values(included.bags || {}).map((b) => ({
      quantity: b.quantity,
      // A weight allowance and a piece count are different things; the client
      // renders whichever it is given.
      weight: b.weight,
      weightUnit: b.weightUnit,
      name: b.name,
      price: b.price ? { amount: parseFloat(b.price.amount), currency: b.price.currencyCode } : null,
      segmentIds: b.segmentIds || [],
    }));

    // Fare-rule notes (free text) — surface penalty/general categories
    const rulesObj = included['detailed-fare-rules'] || {};
    const fareRules = [];
    Object.values(rulesObj).forEach((r) => {
      const descs = r.fareNotes?.descriptions || [];
      descs.forEach((d) => {
        if (d.text) fareRules.push({ title: d.descriptionType || 'INFORMATION', text: d.text });
      });
    });

    // ===== Derive a structured cancellation/change policy from the PENALTIES text =====
    const penaltyText = fareRules
      .filter((r) => /PENALT|CANCEL|REISSUE|CHANGE|REFUND/i.test((r.title || '') + ' ' + (r.text || '')))
      .map((r) => r.text)
      .join(' \n ')
      .toUpperCase();

    let cancellation = null;
    if (penaltyText) {
      // All "CHARGE <CUR> <amount>" occurrences with their position in the text
      const charges = [];
      const re = /CHARGE\s+([A-Z]{3})\s+([\d,]+(?:\.\d+)?)/g;
      let m;
      while ((m = re.exec(penaltyText)) !== null) {
        charges.push({ currency: m[1], amount: Math.round(parseFloat(m[2].replace(/,/g, ''))), index: m.index });
      }

      const changeIdx = penaltyText.search(/CHANGE|REISSUE|REVALIDATION/);
      const cancelIdx = penaltyText.search(/CANCELLATION|CANCEL\b|REFUND/);

      const nearest = (anchor) => {
        if (anchor < 0 || charges.length === 0) return null;
        // first charge at/after the anchor, else the closest overall
        const after = charges.filter((c) => c.index >= anchor).sort((a, b) => a.index - b.index)[0];
        return after || null;
      };

      // Each fee only from its own mention. The cancellation fee used to fall
      // back to the change fee, and either one to the first charge anywhere in
      // the text - the page then printed a change fee as the cost of cancelling.
      const changeCharge = nearest(changeIdx);
      const cancelCharge = nearest(cancelIdx);

      // Cutoff window, e.g. "TILL 02 HRS" / "WITHIN 4 HOURS" / "4 HOURS BEFORE".
      // Null when the rules do not say: this defaulted to 4 hours, which the
      // page drew as a precise deadline.
      const cutoffMatch = penaltyText.match(/TILL\s+0?(\d{1,2})\s*HRS?/) ||
        penaltyText.match(/WITHIN\s+0?(\d{1,2})\s*H(?:OUR|RS?)/) ||
        penaltyText.match(/0?(\d{1,2})\s*HOURS?\s+(?:BEFORE|PRIOR)/);
      const cutoffHours = cutoffMatch ? parseInt(cutoffMatch[1], 10) : null;

      const isNonRefundable = /NON[\s-]?REFUND/i.test(penaltyText);

      // Refundability as the fare itself states it (null when it does not).
      // This read `refundableTaxes`, a tax amount, as a yes/no answer.
      const refundableFlag = flightOffer._ama?.refundable ?? (isNonRefundable ? false : null);

      cancellation = {
        hasData: charges.length > 0 || cutoffMatch != null,
        // Fall back to the fare's own currency, not a fixed one: offers are
        // priced in the office currency and ARC Pay charges in it.
        currency: (cancelCharge || changeCharge)?.currency || flightOffer.price?.currency || 'USD',
        cutoffHours,
        changeFee: changeCharge?.amount ?? null,
        cancelFee: cancelCharge?.amount ?? null,
        refundable: refundableFlag,
        fareTotal: flightOffer.price ? parseFloat(flightOffer.price.grandTotal || flightOffer.price.total) : null,
        fareCurrency: flightOffer.price?.currency || null,
      };
    }

    res.json({ success: true, bags, fareRules: fareRules.slice(0, 8), cancellation });
  } catch (error) {
    console.error('❌ Fare-rules error:', error);
    // A failure, reported as one. A 200 with empty lists read to every caller
    // as "this fare has no rules or baggage".
    res.status(502).json({ success: false, bags: [], fareRules: [], error: 'Fare rules are temporarily unavailable' });
  }
});

// SeatMap Display — seat map for a chosen flight offer
router.post('/seatmaps', async (req, res) => {
  try {
    const { flightOffer } = req.body;
    if (!flightOffer) {
      return res.status(400).json({ success: false, error: 'flightOffer is required' });
    }

    // First attempt with the offer as received
    let result = await FlightProvider.getSeatMaps(flightOffer);

    // Amadeus offers expire fast — by the time the user reaches the booking page the
    // stored offer is often stale and the seat map comes back empty. Re-price the offer
    // (which returns a freshly validated copy) and retry once.
    if (!result?.data || result.data.length === 0) {
      try {
        const priced = await FlightProvider.priceFlightOffer(flightOffer);
        const refreshed = priced?.data?.flightOffers?.[0];
        if (refreshed) {
          const retry = await FlightProvider.getSeatMaps(refreshed);
          if (retry?.data && retry.data.length > 0) result = retry;
        }
      } catch (repriceErr) {
        console.warn('⚠️ SeatMap re-price retry failed:', repriceErr.error || repriceErr.message);
      }
    }

    res.json(result);
  } catch (error) {
    console.error('❌ SeatMap error:', error);
    // A failure, reported as one - not a 200 meaning "no seat map".
    res.status(502).json({ success: false, data: [], error: 'Seat maps are temporarily unavailable' });
  }
});

// Flight order creation endpoint.
//
// `optionalProtect` never rejects: guests may still book. It just makes the
// signed-in user available, so a customer's own ticket is filed under their
// account instead of being orphaned.
router.post('/order', optionalProtect, async (req, res) => {
  // Hoisted so the outer catch knows what this request had established before
  // it failed: a verified payment gets reversed, a held claim released.
  let payment = null;
  let chainClaimed = false;
  try {
    // ---- Whose payment is this, and is it real? ------------------------------
    //
    // Everything below that moves money - the booking-disabled gate, the offer
    // gates, a failed chain - reverses the charge behind `bookingReference`.
    // Those gates used to run FIRST, before anything checked that a payment
    // existed or that the caller had made it. An unauthenticated POST carrying
    // nothing but another customer's order id reversed that customer's payment
    // and wrote their booking cancelled - even one already holding a PNR,
    // because the PNR check came later as well. With booking disabled in
    // production, any body at all did it.
    //
    // So: find the booking, prove the caller paid for it, settle the
    // idempotent cases, verify the capture with the gateway - and only then let
    // anything refund or book.
    const existing = await findExistingBooking(req.body.bookingReference);
    if (!existing) {
      return res.status(402).json({
        success: false,
        error: 'No payment was found for this booking. Please complete payment before confirming.',
        code: 'PAYMENT_NOT_FOUND'
      });
    }

    if (!provesPayer(req, existing)) {
      console.warn('⛔ Order refused: caller did not prove they made this payment', {
        bookingReference: existing.booking_reference
      });
      return res.status(403).json({
        success: false,
        error: `We could not confirm this payment belongs to you. Please contact support at (877) 538-7380 with booking reference ${existing.booking_reference}.`,
        code: 'PAYER_NOT_VERIFIED'
      });
    }

    if (existing.status === 'cancelled') {
      return res.status(409).json({
        success: false,
        error: 'This booking was cancelled and cannot be completed',
        code: 'BOOKING_CANCELLED'
      });
    }

    // This route books a flight checkout and nothing else. The refund paths
    // below reverse whatever payment sits behind the reference, so the payer of
    // some other kind of booking must be stopped here, before any of them.
    if (existing.travel_type !== 'flight') {
      return res.status(409).json({
        success: false,
        error: 'This is not a flight booking, so it cannot be confirmed here.',
        code: 'NOT_A_FLIGHT_BOOKING'
      });
    }

    // One payment, one booking. A double-clicked confirm button, a client retry
    // or a refreshed callback page all arrive with the same reference; without
    // this the second one sells a second set of seats against a single charge.
    // The answer says what the booking actually is: it used to report
    // CONFIRMED for any row with a PNR, ticketed or not.
    if (existing.booking_details?.pnr) {
      const details = existing.booking_details;
      const tickets = Array.isArray(details.tickets) ? details.tickets : [];
      const ticketed = details.gds?.ticketed === true || tickets.length > 0;
      console.log('↩️ Already booked, returning the stored order', details.pnr);
      // A retry can be the first chance to send a confirmation this booking
      // never got: its first send was skipped for want of an address, or failed.
      // Started after the answer and not awaited, so the email can neither hold
      // up nor fail the customer's retry. Flight routes run on the Lightsail
      // server (vercel.json forwards /api/flights), where work after the answer
      // still finishes; the claim's expiry covers a process that dies mid-send.
      if (confirmationEmailOwed(existing)) {
        res.on?.('finish', () => {
          sendConfirmationOnce(existing.booking_reference, confirmationEmailFromRow(existing, req.body));
        });
      }
      return res.json({
        success: true,
        data: {
          id: details.pnr,
          pnr: details.pnr,
          status: ticketed ? 'CONFIRMED' : 'PENDING_TICKETING',
          bookingReference: existing.booking_reference
        },
        pnr: details.pnr,
        orderId: details.pnr,
        bookingReference: existing.booking_reference,
        mode: 'ALREADY_BOOKED',
        ticketed,
        tickets,
        needsReview: Boolean(details.needs_review),
        savedToDatabase: true,
        message: ticketed ? 'This booking already exists' : 'This booking already exists; its ticket has not been issued yet'
      });
    }

    // A payment already held as a second payment for one trip stays held: a
    // human decides whether to book or refund it (findDuplicateBooking, below).
    if (existing.booking_details?.needs_review?.duplicate_of) {
      return res.status(409).json(duplicatePaymentAnswer(existing.booking_reference));
    }

    // Was this actually paid for? Ask the gateway, not the row. The row's
    // `total_amount` is what the client asked to be charged, written while the
    // row was still unpaid, and `payment_status` alone can be written by paths
    // that never asked ARC. Reconciling also covers the paid customer whose tab
    // died before the browser-driven reconcile ran.
    payment = await reconcileBookingPayment(existing);
    if (!payment.paid) {
      console.warn('⛔ Order refused: payment not captured', {
        bookingReference: existing.booking_reference,
        orderStatus: payment.orderStatus || null,
        reason: payment.error || 'no captured transaction'
      });
      return res.status(402).json({
        success: false,
        error: payment.gatewayUnavailable
          ? 'We could not reach the payment gateway to confirm your payment. Please try again in a minute.'
          : 'Payment for this booking has not been captured. Please complete payment before confirming.',
        code: 'PAYMENT_NOT_CAPTURED',
        ...(payment.gatewayUnavailable ? { retryable: true } : {}),
        ...(payment.orderStatus ? { orderStatus: payment.orderStatus } : {})
      });
    }

    // Booking is staged behind its own flag while the SOAP chain is built, so
    // search can ship first, and it never falls through to a fabricated booking.
    //
    // But this gate does NOT run before the money moves. ARC Pay's hosted
    // checkout completes first and the browser returns here, so by now the
    // customer has already paid. Refusing without reversing that leaves them
    // charged, with no booking and no refund - the exact outcome the flag is
    // meant to avoid. So refund on the way out, the same as any other
    // fulfilment failure.
    if (!providerStatus().bookingEnabled) {
      console.warn('Booking attempted while AMADEUS_WS_BOOKING_ENABLED is false');
      return await refundOnFulfillmentFailure(res, {
        orderId: req.body.orderId || req.body.bookingReference,
        bookingReference: req.body.bookingReference,
        amount: req.body.totalAmount || req.body.amount,
        currency: req.body.flightOffer?.price?.currency
          || req.body.flightOffers?.[0]?.price?.currency
          || 'USD',
        errorMsg: 'booking refused: AMADEUS_WS_BOOKING_ENABLED is false',
        status: 503,
        code: 'BOOKING_DISABLED',
        reason: 'Online booking is temporarily unavailable, so your reservation was not made. Call (877) 538-7380 and we will book it for you by phone.',
      });
    }

    console.log('📋 Flight order creation request received');
    console.log('Request body keys:', Object.keys(req.body));

    const { travelers, contactInfo, totalAmount, amount, fareBreakdown, passengerDetails } = req.body;

    // From the session first, the body only as a fallback. Taking it from the
    // body alone is why confirmed bookings ended up with no user_id and never
    // appeared in the customer's My Trips - see utils/bookingOwner.js.
    const userId = resolveBookingUserId(req);

    // Ensure travelers is always an array (even if empty) to prevent validation errors
    const travelersList = Array.isArray(travelers) ? travelers : (travelers ? [travelers] : []);

    // ---- Which fare? The one checkout verified. -------------------------------
    //
    // Checkout priced the offer with the airline, charged for exactly that, and
    // kept the offer on this row with the figures (`verified_charge`). This
    // route used to book whatever offer the request body carried instead, and
    // the chain then checked the airline's price against that same body offer -
    // so a different, dearer fare posted here was sold against the payment for
    // a cheaper one, held back only by the payment-coverage ratio. The body's
    // offer is no longer read. The queue and abandoned-checkout replays reach
    // this route too, and read the same row.
    const verifiedCharge = existing.booking_details?.verified_charge || null;
    const paidFare = Number(verifiedCharge?.pricedFare?.total);
    const firstOffer = existing.booking_details?.pending_booking_data?.bookingData?.originalOffer || null;
    const currency = verifiedCharge?.pricedFare?.currency || firstOffer?.price?.currency || 'USD';

    console.log('📋 Validating request:', {
      hasVerifiedOffer: Boolean(firstOffer),
      travelersListCount: travelersList.length,
      hasContactInfo: !!contactInfo,
      userId: userId || 'Not provided'
    });

    if (!firstOffer || !Number.isFinite(paidFare) || paidFare <= 0) {
      // Payment already happened - hosted checkout runs before this route - so
      // refusing is a charge with nothing behind it. Reverse it.
      return await refundOnFulfillmentFailure(res, {
        orderId: req.body.orderId || req.body.bookingReference,
        bookingReference: req.body.bookingReference,
        amount: totalAmount || amount,
        currency,
        errorMsg: firstOffer ? 'checkout kept no verified fare for this offer' : 'checkout kept no flight offer for this payment',
        status: 400,
        code: 'OFFER_NOT_VERIFIED',
        reason: 'We could not match your payment to the fare checked at checkout, so the booking was not sent to the airline.',
      });
    }

    /** Count the coupon as used, once a booking exists. Never fails the booking. */
    const noteCouponUse = async () => {
      if (!verifiedCharge.coupon?.id) return;
      try {
        await recordCouponUse(supabase, {
          coupon: verifiedCharge.coupon,
          // The same identity checkout checked the per-customer limit against.
          userId: existing.user_id || null,
          email: existing.booking_details?.customer_email || null,
          bookingReference: existing.booking_reference,
        });
      } catch (couponError) {
        console.error('⚠️ Could not record the coupon use:', couponError.message);
      }
    };

    // A card without itineraries/source/travelerPricings cannot be sold: it is a
    // display object, not an offer. Refuse it rather than sending a request the
    // GDS will reject halfway through.
    const isValidAmadeusOffer = Boolean(
      firstOffer?.itineraries && Array.isArray(firstOffer.itineraries)
      && firstOffer.source && firstOffer.travelerPricings
    );

    if (!isValidAmadeusOffer) {
      console.error('❌ Unbookable offer shape', {
        hasItineraries: Array.isArray(firstOffer?.itineraries),
        hasSource: !!firstOffer?.source,
        hasTravelerPricings: !!firstOffer?.travelerPricings,
      });
      // Same reasoning as above: the customer has paid by the time this route
      // runs, so refusing the offer without reversing the charge leaves them
      // out of pocket with no booking. This was the surviving twin of the
      // booking-disabled gate - one gate was fixed, these two were not.
      return await refundOnFulfillmentFailure(res, {
        orderId: req.body.orderId || req.body.bookingReference,
        bookingReference: req.body.bookingReference,
        amount: req.body.totalAmount || req.body.amount,
        currency: firstOffer?.price?.currency || req.body.currency || 'USD',
        errorMsg: `unbookable offer shape: itineraries=${Array.isArray(firstOffer?.itineraries)} `
          + `source=${!!firstOffer?.source} travelerPricings=${!!firstOffer?.travelerPricings}`,
        status: 400,
        code: 'OFFER_NOT_BOOKABLE',
        reason: 'This fare can no longer be booked, so the booking was not sent to the airline. Please search again.',
      });
    }

    // The payer, cancelled, already-booked and payment checks that used to sit
    // here now run at the very top of the handler - see there for why.

    // The PNR check above cannot catch two requests racing: neither has a PNR
    // yet, so both pass it and both sell seats against one payment. Claim the
    // reference before touching the GDS.
    //
    // Deliberately NOT refunded. The request holding the claim may be seconds
    // from a confirmed booking, and reversing its payment from here would
    // cancel a booking that is about to succeed. The customer is told to wait.
    // Every traveller must be a real, complete person before anything is sold,
    // and there must be exactly as many as the fare was priced for. The mapping
    // below used to fill the gaps with an invented name, birthday, gender and
    // phone number and put them on a real PNR and in the database; and extra
    // travellers added on the review page were booked on the fare of however
    // many the search priced. The review page now refuses to send either, so
    // reaching this means the data was lost or altered after payment.
    //
    // A date of birth is needed for a child or an infant, and for everyone on a
    // trip that crosses a border (shared/travellerDetails.js) - decided from the
    // offer's own airports, not from anything the page sent.
    const international = crossesBorder(firstOffer);
    const typesInFareOrder = (firstOffer.travelerPricings || []).map((t) => t.travelerType);
    const travellerIncomplete = travelersList.length === 0 || travelersList.some(
      (t, index) => !String(t?.firstName || '').trim() || !String(t?.lastName || '').trim() || !t?.gender
        || (!t?.dateOfBirth && needsDateOfBirth({ type: t?.ptc || typesInFareOrder[index], international }))
    );
    const pricedTravellers = Array.isArray(firstOffer.travelerPricings) ? firstOffer.travelerPricings.length : 0;
    // And the same mix of passenger types. A child booked on an adult fare, or
    // an adult on a child's, is a ticket the airline can refuse at check-in.
    // The review page sends each traveller's type; a client that sends none
    // falls back to the offer's order, as before.
    const sentTypes = travelersList.map((t) => t?.ptc).filter(Boolean);
    const pricedTypes = (firstOffer.travelerPricings || []).map((t) => t.travelerType);
    const typeMismatch = sentTypes.length > 0 && (
      sentTypes.length !== travelersList.length
      || [...sentTypes].sort().join() !== [...pricedTypes].sort().join()
    );
    const countMismatch = (pricedTravellers > 0 && travelersList.length !== pricedTravellers) || typeMismatch;
    if (travellerIncomplete || countMismatch) {
      return await refundOnFulfillmentFailure(res, {
        orderId: req.body.orderId || req.body.bookingReference,
        bookingReference: req.body.bookingReference,
        currency: firstOffer?.price?.currency || 'USD',
        errorMsg: travellerIncomplete
          ? 'traveller details incomplete'
          : typeMismatch
            ? `passenger types [${sentTypes}] do not match the fare's [${pricedTypes}]`
            : `offer priced for ${pricedTravellers} travellers, request carries ${travelersList.length}`,
        status: 400,
        code: travellerIncomplete ? 'PASSENGERS_INCOMPLETE' : 'PASSENGER_COUNT_MISMATCH',
        reason: travellerIncomplete
          ? 'Some passenger details were missing, so the booking was not sent to the airline.'
          : 'The number of passengers did not match the fare you paid for, so the booking was not sent to the airline.',
      });
    }

    const claim = await claimBookingChain(req.body.bookingReference);
    if (!claim.claimed && claim.unavailable) {
      // The database could not decide who holds the claim. Nothing was sold, so
      // hand the booking to the durable queue rather than guess. If even that
      // write fails, the row is untouched and the abandoned-checkout job finds
      // it - so neither path refunds.
      if (await queueBookingForRetry(req.body.bookingReference, req.body)) {
        return respondQueued(res, req.body.bookingReference);
      }
      return res.status(503).json({
        success: false,
        error: 'We could not start your booking just now. Your payment is safe - please try again in a minute.',
        code: 'BOOKING_UNAVAILABLE',
        retryable: true
      });
    }
    if (!claim.claimed && claim.cancelled) {
      return res.status(409).json({
        success: false,
        error: 'This booking was cancelled and cannot be completed',
        code: 'BOOKING_CANCELLED'
      });
    }
    if (!claim.claimed) {
      return res.status(409).json({
        success: false,
        // One code for both, so the queue worker waits and looks again rather
        // than emailing a failure: a cancellation that does not go through
        // hands the booking back.
        error: claim.cancelling
          ? 'This booking is being cancelled, so it cannot be confirmed.'
          : 'This booking is already being confirmed. Please wait a moment before trying again.',
        code: 'BOOKING_IN_PROGRESS'
      });
    }
    chainClaimed = true;

    // One trip, one booking. A second paid checkout for the same travellers on
    // the same flights - a double click, the back button or a second tab could
    // each open a second payment page - was booked like any other: two PNRs,
    // two charges. It is held for a human instead, and not refunded
    // automatically, because a family can book one flight twice. Checked after
    // the claim, so of two such payments racing each other only the later one
    // is held (findDuplicateBooking).
    const duplicate = await findDuplicateBooking(existing, {
      travellers: travelersList,
      offer: firstOffer,
      claimedAt: claim.claimedAt,
    });
    if (duplicate.unavailable) {
      // It cannot be told, so it is not booked now. Nothing was sold: the queue
      // runs it again, check and all, once the database answers.
      chainClaimed = false;
      if (await queueBookingForRetry(req.body.bookingReference, req.body)) {
        return respondQueued(res, req.body.bookingReference);
      }
      await releaseBookingChain(req.body.bookingReference, 'duplicate-check');
      return res.status(503).json({
        success: false,
        error: 'We could not start your booking just now. Your payment is safe - please try again in a minute.',
        code: 'BOOKING_UNAVAILABLE',
        retryable: true
      });
    }
    if (duplicate.duplicateOf) {
      console.warn('⛔ Holding a second payment for a trip already booked', {
        bookingReference: existing.booking_reference,
        duplicateOf: duplicate.duplicateOf
      });
      chainClaimed = false;
      if (!(await holdDuplicatePayment(req.body.bookingReference, duplicate.duplicateOf))) {
        // Not recorded, so nobody would be told about it. Let the claim go and
        // ask the customer to try again, which runs the check again.
        reportError(new Error('could not hold a duplicate payment for review'), {
          service: 'flights',
          flow: 'booking',
          bookingReference: req.body.bookingReference,
          duplicateOf: duplicate.duplicateOf
        });
        await releaseBookingChain(req.body.bookingReference, 'duplicate-payment');
        return res.status(503).json({
          success: false,
          error: 'We could not start your booking just now. Your payment is safe - please try again in a minute.',
          code: 'BOOKING_UNAVAILABLE',
          retryable: true
        });
      }
      return res.status(409).json(duplicatePaymentAnswer(existing.booking_reference));
    }

    // Prepare flight order data for Amadeus (only if we have valid Amadeus format)
    // The travelers from frontend are already in correct format: { id, firstName, lastName, dateOfBirth, gender }
    // But Amadeus needs name.firstName and name.lastName
    // No invented phone number. A made-up one is the number the airline would
    // call about a schedule change.
    const contactPhones = contactInfo?.phoneNumber
      ? [{ deviceType: 'MOBILE', countryCallingCode: contactInfo.countryCode || '1', number: String(contactInfo.phoneNumber) }]
      : [];

    const amadeusTravelers = travelersList.map((traveler, idx) => {
      const travelerObj = {
        id: traveler.id || `${idx + 1}`,
        // All validated above: nothing here is filled in.
        dateOfBirth: traveler.dateOfBirth,
        gender: String(traveler.gender).trim().toUpperCase().startsWith('F') ? 'FEMALE' : 'MALE',
        // Checked against the fare above; the chain books each traveller on it.
        ...(traveler.ptc ? { ptc: traveler.ptc } : {}),
        name: {
          firstName: String(traveler.firstName).trim(),
          lastName: String(traveler.lastName).trim()
        },
        contact: contactInfo ? {
          emailAddress: contactInfo.email || travelersList[0]?.email,
          phones: contactPhones
        } : undefined
      };

      // Add passport/document details if provided
      if (traveler.passportNumber || traveler.documentNumber) {
        travelerObj.documents = [{
          documentType: traveler.documentType || 'PASSPORT',
          birthPlace: traveler.birthPlace || '',
          issuanceLocation: traveler.issuanceLocation || '',
          issuanceDate: traveler.issuanceDate || '',
          number: traveler.passportNumber || traveler.documentNumber || '',
          expiryDate: traveler.passportExpiry || traveler.expiryDate || '',
          issuanceCountry: traveler.issuanceCountry || traveler.nationality || '',
          validityCountry: traveler.validityCountry || traveler.nationality || '',
          nationality: traveler.nationality || '',
          holder: true
        }];
      }

      return travelerObj;
    });

    // Price the flight offer before creating order (validates offer is still valid)
    let pricedOffer = firstOffer;
    let repriced = false;
    try {
      console.log('💰 Pricing flight offer before booking...');
      const pricingResult = await withBookingPriority(() => FlightProvider.priceFlightOffer(firstOffer));
      if (pricingResult.success && pricingResult.data?.flightOffers?.[0]) {
        pricedOffer = pricingResult.data.flightOffers[0];
        repriced = true;
        console.log('✅ Flight offer priced successfully, using priced version');
      } else {
        console.log('⚠️ Pricing failed, proceeding with original offer');
      }
    } catch (pricingError) {
      // Already waited the whole booking wait for a slot. The chain would wait
      // that long again and the request would outlive the Vercel proxy, so
      // queue now instead.
      if (pricingError?.slotTimeout && await queueBookingForRetry(req.body.bookingReference, req.body)) {
        return respondQueued(res, req.body.bookingReference);
      }
      console.log('⚠️ Pricing step failed, proceeding with original offer:', pricingError.message || pricingError.error);
    }

    // Not priced again just now: the airline last priced it at checkout. The
    // chain ages a fare from that, not from the search - see its staleness check.
    if (!repriced && verifiedCharge.verifiedAt) {
      pricedOffer = { ...firstOffer, _ama: { ...firstOffer._ama, pricedAt: verifiedCharge.verifiedAt } };
    }

    // The fare went up after the customer paid. The chain would refuse it too,
    // but only after selling the seats; stop before anything is sold. Both
    // figures come from the same informative pricing, so they compare like for
    // like. A fare that came in lower costs the customer nothing and is booked.
    const repricedFare = Number(pricedOffer?.price?.grandTotal ?? pricedOffer?.price?.total);
    if (repriced && Number.isFinite(repricedFare)
      && Math.round(repricedFare * 100) - Math.round(paidFare * 100) > Math.round(getWsConfig().priceTolerance * 100)) {
      await releaseBookingChain(req.body.bookingReference, 'priceCheck');
      return await refundOnFulfillmentFailure(res, {
        orderId: req.body.orderId || req.body.bookingReference,
        bookingReference: req.body.bookingReference,
        amount: totalAmount || amount,
        currency,
        errorMsg: `fare rose after payment: paid for ${paidFare.toFixed(2)}, airline now ${repricedFare.toFixed(2)} ${currency}`,
        status: 409,
        code: 'PRICE_CHANGED',
        reason: 'The airline raised this fare after you paid, so the booking was not made.',
      });
    }

    const flightOrderData = {
      data: {
        type: 'flight-order',
        flightOffers: [pricedOffer],
        travelers: amadeusTravelers,
        ticketingAgreement: {
          option: 'DELAY_TO_CANCEL',
          delay: '6D'
        },
        contacts: [{
          addresseeName: {
            firstName: amadeusTravelers[0]?.name?.firstName,
            lastName: amadeusTravelers[0]?.name?.lastName
          },
          purpose: 'STANDARD',
          phones: contactPhones,
          // The address checkout recorded is the fallback, not a made-up one
          // (the old placeholder was not even this company's domain).
          emailAddress: contactInfo?.email || travelersList[0]?.email || existing.booking_details?.customer_email || undefined
        }]
      }
    };

    // Never log flightOrderData: it carries names, dates of birth and passport
    // numbers. Only the shape of the request is useful in a log.
    console.log('📤 Booking', {
      passengers: amadeusTravelers.length,
      segments: pricedOffer?.itineraries?.reduce((n, i) => n + (i.segments?.length || 0), 0) ?? 0,
      bookingReference: req.body.bookingReference || null
    });

    // Wrap Amadeus service call in try-catch to handle errors gracefully
    let orderResponse;
    // Keep the claim fresh while the chain runs - see refreshChainClaim.
    const heartbeat = setInterval(() => {
      // No longer silent. A renewal that fails is not fatal on its own -
      // holdChainClaim checks again before the commit - but it is worth seeing.
      refreshChainClaim(req.body.bookingReference)
        .then((renewed) => { if (!renewed) console.warn('⚠️ Chain claim not renewed', { bookingReference: req.body.bookingReference }); })
        .catch((error) => console.warn('⚠️ Chain claim renewal failed', { bookingReference: req.body.bookingReference, error: error.message }));
    }, CHAIN_HEARTBEAT_MS);
    heartbeat.unref?.();
    try {
      // The booking lane: the customer has paid, so this goes ahead of searches
      // for an Amadeus slot and may use the slots searches cannot.
      orderResponse = await withBookingPriority(() => FlightProvider.createFlightOrder(flightOrderData, {
        bookingReference: req.body.bookingReference,
        // The fare the customer paid for, as checkout verified it. The chain
        // compares the GDS price against this - not against what they were
        // charged, which includes the admin-configured service fee Amadeus
        // knows nothing about. It used to be the price just re-read above, so
        // a fare that rose after payment matched itself and was sold.
        expectedTotal: paidFare,
        // What checkout charged for that fare - with the fee, less any coupon.
        // The payment must cover exactly this.
        verifiedChargeTotal: Number.isFinite(Number(verifiedCharge.total)) ? Number(verifiedCharge.total) : undefined,
        // Asked just before the PNR is committed, so a chain that lost its
        // claim stops without selling a second PNR - see holdChainClaim.
        beforeCommit: () => holdChainClaim(req.body.bookingReference, claim.attempt),
        // What ARC actually captured, read back from the gateway by the
        // reconcile above - NOT from this request body, and NOT from the row's
        // total_amount, which is what the client asked to be charged before
        // anyone paid. Lets the chain refuse to ticket an underpaid fare.
        paidAmount: Number.isFinite(payment.capturedAmount) ? payment.capturedAmount : undefined,
        // Called the instant a record locator exists, before queueing or
        // ticketing is attempted. Persisting here is what makes a booking
        // recoverable if the rest of the chain, or this process, dies.
        onCommitted: async ({ pnr, tstRefs, priced }) => {
          await persistCommittedPnr({
            bookingReference: req.body.bookingReference,
            pnr,
            tstRefs,
            priced
          });
        }
      }));
      console.log('✅ Amadeus service call completed:', {
        success: orderResponse?.success,
        mode: orderResponse?.mode,
        hasPnr: !!orderResponse?.pnr
      });
    } catch (providerError) {
      console.error('❌ FlightProvider.createFlightOrder threw:', {
        step: providerError?.step,
        committed: providerError?.committed,
        code: providerError?.code,
        reason: providerError?.technicalError ?? providerError?.message
      });

      // Stopped just before the commit because this request no longer holds
      // the booking. Nothing was sold. Another request may be booking it right
      // now, so this one neither refunds nor releases a claim that is not its
      // own.
      if (providerError?.claimLost) {
        return res.status(409).json({
          success: false,
          error: 'This booking is already being confirmed. Please wait a moment before trying again.',
          code: 'BOOKING_IN_PROGRESS'
        });
      }
      // The database could not say who holds it. Queueing is safe even if
      // another request does: every commit asks holdChainClaim first, and the
      // queued state is not "in progress", so only one of them can commit.
      if (providerError?.claimUnavailable) {
        if (await queueBookingForRetry(req.body.bookingReference, req.body)) {
          return respondQueued(res, req.body.bookingReference);
        }
        return res.status(503).json({
          success: false,
          error: 'We could not start your booking just now. Your payment is safe - please try again in a minute.',
          code: 'BOOKING_UNAVAILABLE',
          retryable: true
        });
      }

      // A committed PNR means the airline holds a real booking. Refunding it
      // would leave the customer with a flight they are no longer paying for -
      // and if it was ticketed, with a ticket the airline will still honour.
      // These need a human, not an automatic reversal.
      if (providerError?.committed) {
        await flagForReview({
          bookingReference: req.body.bookingReference,
          pnr: providerError.pnr,
          reason: `chain failed after commit at ${providerError.step}`,
          ticketed: providerError.ticketed,
          amadeus: (providerError.amadeusCode || providerError.technicalError)
            ? {
              operation: providerError.operation || null,
              code: providerError.amadeusCode || null,
              message: providerError.technicalError || null
            }
            : null
        });
        // The airline holds the seats the discount paid for.
        await noteCouponUse();
        reportError(providerError, {
          service: 'amadeus-ws',
          flow: 'booking',
          wsap: providerStatus().wsap ?? null,
          step: providerError.step,
          pnr: providerError.pnr,
          ticketed: providerError.ticketed,
          bookingReference: req.body.bookingReference
        });
        // This answer promises an email; it used to send none.
        await sendHeldForReviewEmail(req.body.bookingReference, req.body);
        return res.status(202).json({
          success: true,
          data: { id: providerError.pnr, pnr: providerError.pnr, status: 'PENDING_CONFIRMATION' },
          pnr: providerError.pnr,
          orderId: providerError.pnr,
          bookingReference: req.body.bookingReference,
          needsReview: true,
          message: 'Your seats are reserved with the airline and our team is finalising your ticket. '
            + 'We will email you as soon as it is issued.'
        });
      }

      // Every Amadeus slot stayed busy for the whole wait, so nothing was sent to
      // the GDS. That is a traffic spike, not a failed booking: queue it and let
      // the worker run it the moment a slot frees, rather than refund a customer
      // who did nothing wrong. The 202 is the shape both clients already treat as
      // a pending-but-successful booking.
      if (providerError?.slotTimeout && !providerError?.committed
        && await queueBookingForRetry(req.body.bookingReference, req.body)) {
        return respondQueued(res, req.body.bookingReference);
      }

      // The customer has already been charged - hosted checkout runs before this
      // route. Never fabricate a booking to paper over a supplier failure:
      // reverse the payment and tell them honestly. This runs in every
      // environment; the previous non-production branch created a mock booking,
      // which is exactly the outcome the production guard exists to prevent.
      // Record what actually failed, not what the customer was shown.
      // `providerError.message` is the mapped, deliberately vague customer text
      // ("Flight service temporarily unavailable"), and storing that as the
      // failure reason leaves a refunded booking with nothing to diagnose from -
      // no operation, no Amadeus code, no step. The customer-facing wording is
      // built separately inside refundOnFulfillmentFailure, so this only
      // enriches the log, the stored `fulfillment_failed`, and `technicalError`.
      // Let a later attempt run. Without this the claim sits at in_progress
      // until the TTL expires, and a customer retrying immediately is told to
      // wait for a chain that already failed.
      await releaseBookingChain(req.body.bookingReference, providerError?.step);

      const failureDetail = [
        providerError?.step && `step=${providerError.step}`,
        providerError?.operation && `op=${providerError.operation}`,
        providerError?.amadeusCode && `amadeusCode=${providerError.amadeusCode}`,
        providerError?.technicalError || providerError?.message || 'Flight booking failed',
      ].filter(Boolean).join(' | ');

      return await refundOnFulfillmentFailure(res, {
        orderId: req.body.orderId || req.body.bookingReference,
        bookingReference: req.body.bookingReference,
        amount: totalAmount || amount,
        currency: firstOffer?.price?.currency || 'USD',
        errorMsg: failureDetail
      });
    } finally {
      clearInterval(heartbeat);
    }

    if (!orderResponse || !orderResponse.success) {
      const errorMsg = orderResponse?.error || 'Amadeus service returned unsuccessful response';
      console.error('❌ Flight order creation failed:', errorMsg);
      {
        return await refundOnFulfillmentFailure(res, {
          orderId: req.body.orderId || req.body.bookingReference,
          bookingReference: req.body.bookingReference,
          amount: totalAmount || amount,
          currency: firstOffer?.price?.currency || 'USD',
          errorMsg
        });
      }
      throw new Error(errorMsg);
    }

    console.log('✅ Flight order created successfully');

    // PRODUCTION: a "successful" MOCK response means no real ticket was issued — reverse the charge.
    if (process.env.NODE_ENV === 'production' && typeof orderResponse.mode === 'string' && orderResponse.mode.toUpperCase().includes('MOCK')) {
      console.error('❌ Amadeus returned a MOCK booking in production (no real ticket):', orderResponse.mode);
      return await refundOnFulfillmentFailure(res, {
        orderId: req.body.orderId || req.body.bookingReference,
        bookingReference: req.body.bookingReference,
        amount: totalAmount || amount,
        currency: firstOffer?.price?.currency || 'USD',
        errorMsg: `No real ticket issued (mode: ${orderResponse.mode})`
      });
    }

    // Counted once the booking exists, not at checkout, where an abandoned
    // payment would use it up. It was never counted at all: a single-use code
    // could be used any number of times.
    await noteCouponUse();

    // Extract flight details for database from the first offer
    const firstItinerary = firstOffer?.itineraries?.[0];
    const firstSegment = firstItinerary?.segments?.[0] || {};
    const lastSegment = firstItinerary?.segments?.[firstItinerary?.segments?.length - 1] || firstSegment;
    const pnrValue = orderResponse.pnr || orderResponse.data?.associatedRecords?.[0]?.reference;
    const orderIdValue = orderResponse.orderId || orderResponse.data?.id;

    // Extract Amadeus enriched fields
    const fareDetails = firstOffer?.travelerPricings?.[0]?.fareDetailsBySegment?.[0];
    const allSegments = firstItinerary?.segments || [];
    const stopsCount = Math.max(0, allSegments.length - 1);
    let stopDetailsList = [];
    if (stopsCount > 0) {
      stopDetailsList = allSegments.slice(0, -1).map((seg, idx) => {
        const nextSeg = allSegments[idx + 1];
        return {
          airport: seg.arrival?.iataCode || '',
          terminal: seg.arrival?.terminal || '',
          duration: ''
        };
      });
    }

    // Save real Amadeus booking to database with all fields
    const dbBooking = await saveBookingToDatabase({
      userId: userId || null,
      bookingReference: req.body.bookingReference || orderIdValue,
      pnr: pnrValue,
      orderId: req.body.orderId || orderIdValue,
      amadeusOrderId: orderIdValue, // the real Amadeus order id (for cancellation)
      // The gateway's transaction id, from the reconcile above. The body's
      // `transactionId` is ARC's success indicator - the secret that proves
      // who paid - and when absent this used to invent a TXN-<timestamp>.
      transactionId: payment?.arcTransactionId || null,
      // What the customer was actually charged, which is the fare plus the
      // admin-configured service fee. Refunds read `total_amount`
      // (operations.handlers.js:270), so writing the fare alone here refunds
      // less than was taken. The fare itself is kept in price_grand_total.
      // What the gateway captured, else what checkout verified - never the
      // request body's figure, which a refund would later read as the truth.
      totalAmount: Number.isFinite(payment?.capturedAmount) ? payment.capturedAmount : (verifiedCharge.total ?? '0'),
      currency,
      origin: firstSegment.departure?.iataCode || '',
      destination: lastSegment.arrival?.iataCode || '',
      departureDate: firstSegment.departure?.at?.split('T')[0] || '',
      departureTime: firstSegment.departure?.at ? new Date(firstSegment.departure.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '',
      arrivalTime: lastSegment.arrival?.at ? new Date(lastSegment.arrival.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '',
      arrivalDate: lastSegment.arrival?.at?.split('T')[0] || '',
      airline: firstSegment.carrierCode || '',
      airlineName: firstOffer?.validatingAirlineCodes?.[0] || firstSegment.carrierCode || '',
      flightNumber: firstSegment.number ? `${firstSegment.carrierCode}${firstSegment.number}` : '',
      duration: firstItinerary?.duration || '',
      cabinClass: fareDetails?.cabin || null,
      departureTerminal: firstSegment.departure?.terminal || '',
      arrivalTerminal: lastSegment.arrival?.terminal || '',
      aircraft: firstSegment.aircraft?.code || '',
      stops: stopsCount,
      stopDetails: stopDetailsList,
      brandedFare: fareDetails?.brandedFare || null,
      brandedFareLabel: fareDetails?.brandedFareLabel || null,
      operatingCarrier: firstSegment.operating?.carrierCode || null,
      operatingAirlineName: firstSegment.operating?.carrierCode || null,
      lastTicketingDate: firstOffer?.lastTicketingDate || null,
      numberOfBookableSeats: firstOffer?.numberOfBookableSeats || null,
      refundable: firstOffer?._ama?.refundable ?? null,
      baggageDetails: {
        checked: fareDetails?.includedCheckedBags || null,
        cabin: fareDetails?.includedCabinBags || null
      },
      baggage: fareDetails?.includedCheckedBags?.weight
        ? `${fareDetails.includedCheckedBags.weight}${fareDetails.includedCheckedBags.weightUnit || 'kg'}`
        : (fareDetails?.includedCheckedBags?.quantity ? `${fareDetails.includedCheckedBags.quantity} Piece(s)` : null),
      priceBase: firstOffer?.price?.base || null,
      priceGrandTotal: firstOffer?.price?.grandTotal || firstOffer?.price?.total || null,
      priceFees: firstOffer?.price?.fees || [],
      fareBreakdown: fareBreakdown || null,
      passengerDetails: passengerDetails || amadeusTravelers.map((t) => ({
        id: t.id,
        firstName: t.name.firstName,
        lastName: t.name.lastName,
        dateOfBirth: t.dateOfBirth,
        gender: t.gender
      })),
      flightOffer: firstOffer,
      // Every leg and flight of the offer booked, return and connections
      // included - the fields above read only the first leg.
      itineraries: itinerariesFromOffer(firstOffer),
      // What the GDS actually did, for reconciliation and for the ticket
      // numbers the customer's document prints.
      gds: orderResponse.gds || null,
      tickets: orderResponse.tickets || [],
      ticketed: orderResponse.ticketed === true,
      // The chain's "issued, but the numbers had not surfaced" verdict. It was
      // returned in the HTTP body and never written, so the alarm that watches
      // `needs_review` could not see it.
      needsReview: orderResponse.needsReview || orderResponse.data?.needsReview || null,
      // `userId` is set once, at the top of this object, from the resolved
      // session. It used to be set a SECOND time here from req.body.userId -
      // and in an object literal the later key wins, so the session-resolved
      // owner was silently thrown away and the client's value used instead.
      // That quietly undid the ownership fix on the main write path: the row
      // landed with user_id null again and vanished from My Trips.
    });

    console.log('📝 Database save result:', dbBooking ? 'Success' : 'Skipped/Failed');

    // --- Send Booking Confirmation Email ---
    if (dbBooking) {
      try {
        const { sendBookingNotificationEmails } = await import('../services/emailService.js');
        console.log('📧 Sending booking confirmation email...');

        // Extract traveler info
        const mainTraveler = (amadeusTravelers && amadeusTravelers.length > 0) ? amadeusTravelers[0] : null;
        const fallbackTraveler = (travelersList && travelersList.length > 0) ? travelersList[0] : null;

        let customerFirstName = 'Valued';
        let customerLastName = 'Customer';

        if (mainTraveler?.name?.firstName) {
          customerFirstName = mainTraveler.name.firstName;
          customerLastName = mainTraveler.name.lastName || '';
        } else if (fallbackTraveler?.firstName) {
          customerFirstName = fallbackTraveler.firstName;
          customerLastName = fallbackTraveler.lastName || '';
        }

        const customerName = `${customerFirstName} ${customerLastName}`.trim();

        // Find a valid email address (avoid empty strings)
        // No placeholder recipient: a confirmation sent to an address we made
        // up was reported as sent while the customer received nothing. The
        // address checkout recorded is the last resort; with none, the
        // customer send is skipped and says so.
        let finalEmail = contactInfo?.email || req.body.customerEmail || '';
        if (!finalEmail && fallbackTraveler?.email) finalEmail = fallbackTraveler.email;
        if (!finalEmail) finalEmail = dbBooking.booking_details?.customer_email || '';

        const bookingEmailData = {
          customerEmail: finalEmail,
          customerName: customerName,
          bookingReference: dbBooking.booking_reference,
          bookingType: 'flight',
          paymentAmount: dbBooking.total_amount || firstOffer?.price?.total || '0',
          currency: dbBooking.currency || firstOffer?.price?.currency || 'USD',
          travelDate: dbBooking.booking_details?.departure_date_full || firstSegment?.departure?.at?.split('T')[0],
          passengers: amadeusTravelers.length || travelersList.length || 1,
          // Hand over the whole row, not three hand-picked fields. Passing
          // only origin/destination/airline left the template with no times,
          // terminals, cabin or flight number, and its `time || code` fallback
          // then printed the airport code where the time belongs — "DEL / DEL".
          bookingDetails: {
            ...(dbBooking.booking_details || {}),
            origin: dbBooking.booking_details?.origin || firstSegment?.departure?.iataCode,
            destination: dbBooking.booking_details?.destination || lastSegment?.arrival?.iataCode,
            airline: dbBooking.booking_details?.airline_name || firstOffer?.validatingAirlineCodes?.[0]
          }
        };

        if (bookingEmailData.customerEmail) {
          // Claimed and recorded on the row (booking_details.confirmation_email),
          // so a retry of this order can tell whether the customer still needs
          // it - see confirmationEmailOwed. This first send fails open: a
          // bookkeeping error must not cost the customer their confirmation.
          await sendConfirmationOnce(dbBooking.booking_reference, bookingEmailData, { failOpen: true });
        } else {
          // Nobody to confirm to. The office is still told about the booking,
          // and nothing is recorded, so a retry that brings an address sends it.
          const emailResult = await sendBookingNotificationEmails(bookingEmailData);
          console.warn('⚠️ Booking confirmation email not sent: no address', {
            officeNotified: emailResult?.adminNotification?.success === true,
          });
        }
      } catch (emailError) {
        console.error('❌ Failed to send booking confirmation email:', emailError.message);
      }
    }
    // ---------------------------------------

    res.json({
      success: true,
      data: orderResponse.data,
      pnr: pnrValue,
      orderId: orderIdValue,
      // Our reference, the one the database, emails and Manage Booking are
      // keyed by. This used to be the PNR, so a successful booking and a
      // queued or already-booked one handed the customer different kinds of
      // reference for the same field.
      bookingReference: dbBooking?.booking_reference || req.body.bookingReference || orderIdValue,
      mode: orderResponse.mode,
      ticketed: orderResponse.ticketed ?? false,
      tickets: orderResponse.tickets || [],
      savedToDatabase: !!dbBooking,
      message: orderResponse.message || 'Flight order created successfully'
    });

  } catch (error) {
    // The request body carries names, dates of birth and passport numbers, so
    // it is never logged. The booking reference is enough to find the request.
    console.error('❌ Flight order creation error:', {
      message: error.message,
      name: error.name,
      bookingReference: req.body?.bookingReference || null
    });
    if (res.headersSent) return;

    // This used to log, answer 500 with the raw exception text, and write
    // nothing: a verified payment kept with no booking, the claim left
    // in_progress for two minutes, and the queue then emailing "our team will
    // contact you about your refund". Now the request cleans up after itself,
    // using what it had established before it failed.
    const ref = req.body?.bookingReference || null;
    try {
      const row = ref ? await findExistingBooking(ref) : null;
      const pnr = row?.booking_details?.pnr;
      if (pnr && row.status !== 'cancelled') {
        // A PNR exists: the airline holds seats. Never refund that
        // automatically - a human decides.
        await flagForReview({
          bookingReference: ref,
          pnr,
          reason: `order route failed after commit: ${String(error.message || error).slice(0, 200)}`,
          ticketed: row.booking_details?.gds?.ticketed === true
        });
        // This answer promises an email; it used to send none.
        await sendHeldForReviewEmail(ref, req.body);
        return res.status(202).json({
          success: true,
          data: { id: pnr, pnr, status: 'PENDING_CONFIRMATION', bookingReference: ref },
          pnr,
          orderId: pnr,
          bookingReference: ref,
          needsReview: true,
          message: 'Your seats are reserved with the airline and our team is completing your booking. '
            + 'We will email you as soon as it is done.'
        });
      }
      if (chainClaimed) await releaseBookingChain(ref, 'unexpected-error');
      if (payment?.paid) {
        return await refundOnFulfillmentFailure(res, {
          orderId: req.body?.orderId || ref,
          bookingReference: ref,
          errorMsg: `order route error: ${String(error.message || error).slice(0, 200)}`,
          status: 500,
          code: 'ORDER_FAILED'
        });
      }
    } catch (recoveryError) {
      console.error('❌ Could not recover from the order error:', recoveryError.message);
    }

    return res.status(500).json({
      success: false,
      error: 'We could not complete your booking. Please contact support at (877) 538-7380 with your booking reference.',
      code: 'ORDER_FAILED'
    });
  }
});

// Cancel a flight order — delegates to the orchestrated cancel-booking
// handler in payment.routes.js via internal request, which properly handles
// Amadeus cancellation + ARC Pay refund/void + DB update
router.delete('/order/:orderId', protect, async (req, res) => {
  try {
    const { orderId } = req.params;
    console.log(`🗑️ Cancel flight order request: ${orderId}`);

    // Cancelling triggers a real GDS cancel AND an ARC Pay refund. Enforce
    // ownership first — this was callable unauthenticated, so anyone could
    // cancel any booking and move money by guessing its reference.
    const { notFound } = await loadOwnedBooking(orderId, req.user);
    if (notFound) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    // Delegate to the orchestrated cancel: it cancels the real Amadeus order (via the
    // stored amadeus_order_id), refunds/voids via ARC Pay, updates booking status, and
    // persists the full cancellation record. Single source of truth — called in-process
    // (no HTTP self-call) so it also works on Vercel serverless.
    let orchestrated = null;
    try {
      orchestrated = await invokeOrchestratedCancel(orderId, 'Customer cancellation via flight order API', req);
    } catch (invokeError) {
      console.warn('⚠️ Orchestrated cancel failed:', invokeError.message);
    }
    const cancelResult = orchestrated?.payload;

    if (cancelResult?.success) {
      return res.json({
        success: true,
        message: cancelResult.message || `Order ${orderId} cancelled`,
        cancellation: cancelResult.cancellation,
        booking: cancelResult.booking,
        amadeusCancelled: cancelResult.cancellation?.amadeusCancelled ?? false,
        mode: 'ORCHESTRATED_CANCELLATION'
      });
    }

    // A `needsReview` answer is a DECISION, not a malfunction: the airline
    // still holds the booking, so the orchestrator withheld the refund on
    // purpose. Falling through to the fallback below would overwrite that
    // with `status: 'cancelled'` and tell the customer it worked - burying
    // the flag and leaving them believing they have no flight when they do.
    if (cancelResult?.needsReview) {
      console.error('⛔ Cancel needs review; not overriding with the fallback', { orderId });
      return res.status(502).json({
        success: false,
        error: cancelResult.error
          || 'We could not cancel your reservation with the airline. '
            + 'Our team has been alerted - please call (877) 538-7380 if it is urgent.',
        bookingReference: cancelResult.bookingReference,
        needsReview: true,
        mode: 'ORCHESTRATED_CANCELLATION'
      });
    }

    // Every other answer is the orchestrator's decision too, and it stands: a
    // caller it refused (403), a booking already cancelled (400), a write that
    // failed (500). All of these used to fall through to the fallback below,
    // which cancels at the airline and marks the row cancelled with no refund -
    // so the one caller the orchestrator had just turned away still got the
    // booking cancelled, and the customer lost the seat and the money.
    if (cancelResult) {
      console.warn('⚠️ Orchestrated cancel returned error:', cancelResult.error);
      return res.status(orchestrated.statusCode >= 400 ? orchestrated.statusCode : 500).json({
        success: false,
        error: cancelResult.error || 'Unable to cancel the order',
        ...(cancelResult.code ? { code: cancelResult.code } : {}),
        mode: 'ORCHESTRATED_CANCELLATION'
      });
    }

    // Fallback: only for when the orchestrator threw or gave no answer at all.
    // It issues no refund, so it must not claim a cancellation it cannot
    // substantiate.
    let amadeusCancelled = false;
    let bookingRef = orderId;
    if (supabase) {
      try {
        const { data: bk } = await supabase
          .from('bookings')
          .select('booking_reference, booking_details')
          .or((r => `booking_reference.eq.${r},booking_details->>order_id.eq.${r},booking_details->>amadeus_order_id.eq.${r}`)(sanitizeRef(orderId)))
          .limit(1)
          .maybeSingle();
        // `orderId` may be a record locator rather than our own reference, so
        // keep the row's real reference for the needs_review patch below.
        bookingRef = bk?.booking_reference || bookingRef;
        // This cancels at the airline outside the orchestrator's claim. While
        // the chain, the queue or another cancellation holds the booking, that
        // is the race the claim exists to stop, so it waits like everyone else.
        if (liveChainState(bk?.booking_details?.gds_chain)) {
          return res.status(409).json({
            success: false,
            error: 'This booking is being confirmed or cancelled right now. Nothing has been changed; please try again in a few minutes.',
            code: 'BOOKING_BUSY',
            mode: 'FALLBACK_CANCELLATION'
          });
        }
        const amaId = bk?.booking_details?.amadeus_order_id || bk?.booking_details?.order_id || orderId;
        try {
          const r = await FlightProvider.cancelFlightOrder(amaId);
          amadeusCancelled = !!r?.success;
        } catch (e) {
          console.warn('⚠️ Fallback Amadeus cancel failed:', e.error || e.message);
        }
      } catch (lookupErr) {
        console.warn('⚠️ Booking lookup for cancellation failed:', lookupErr.message);
      }

      // Marking the row cancelled while the airline still holds the seats is
      // the worst outcome available here: the customer is told they are
      // cancelled, stops expecting a flight, and no refund was issued either.
      // Only record a cancellation the GDS actually confirmed.
      if (!amadeusCancelled) {
        await patchBookingDetails(bookingRef, {
          needs_review: {
            reason: 'fallback cancel could not reach the GDS; booking may still be live',
            at: new Date().toISOString()
          }
        });
        return res.status(502).json({
          success: false,
          error: 'We could not confirm the cancellation with the airline. '
            + 'Our team has been alerted - please call (877) 538-7380 to complete it.',
          amadeusCancelled: false,
          needsReview: true,
          mode: 'FALLBACK_CANCELLATION'
        });
      }

      const { error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .or((r => `booking_reference.eq.${r},booking_details->>order_id.eq.${r}`)(sanitizeRef(orderId)));

      if (!error) {
        return res.json({
          success: true,
          message: `Order ${orderId} has been cancelled (refund pending manual processing)`,
          amadeusCancelled,
          mode: 'FALLBACK_CANCELLATION'
        });
      }
    }

    return res.status(500).json({
      success: false,
      error: 'Unable to cancel the order'
    });

  } catch (error) {
    console.error('❌ Cancel order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel flight order'
    });
  }
});

// Get flight order details. Answers from the GDS or fails honestly - there is
// no simulated fallback, which is the whole point of this handler.
router.get('/order/:orderId', protect, async (req, res) => {
  const { orderId } = req.params;

  try {
    // Confirm the caller owns this reference before we hand back live GDS data
    // (PNR, traveller names). Without it any authenticated user could retrieve
    // any reservation by reference.
    const { notFound } = await loadOwnedBooking(orderId, req.user);
    if (notFound) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const orderDetails = await FlightProvider.getFlightOrderDetails(orderId);
    return res.json({
      success: true,
      data: orderDetails.data,
      pnr: orderDetails.pnr || orderDetails.data?.associatedRecords?.[0]?.reference,
      orderId,
      message: 'Flight order details retrieved successfully'
    });
  } catch (error) {
    // This used to fall back to a hard-coded DEL-JAI booking for $29.60 with a
    // randomly generated PNR. Someone looking up their own reservation would
    // have been shown an itinerary that does not exist, for a flight they never
    // booked. An honest failure is the only acceptable answer here.
    console.error('❌ Error fetching flight order details:', {
      orderId,
      code: error?.code,
      reason: error?.technicalError ?? error?.message
    });
    return res.status(error?.code === 404 ? 404 : 502).json({
      success: false,
      error: error?.error || 'We could not retrieve this booking right now',
      orderId
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  // Reports configuration presence and the bundled dataset version. Never
  // reports credential values, and deliberately does not call Amadeus: a health
  // check that opened a session would burn WSAP quota on every probe.
  res.json({
    success: true,
    status: 'ok',
    ...providerStatus(),
    timestamp: new Date().toISOString(),
  });
});

// Get a single booking by bookingReference (For Manage Booking page)
// optionalProtect, not protect: a guest may open their booking with the email
// it was made with (x-booking-email). Ownership is still enforced in
// loadOwnedBooking, and anyone else still gets a flat 404. guestBookingLimiter
// caps wrong emails per reference, so that 404 cannot be asked at volume.
router.get('/bookings/:bookingRef', optionalProtect, guestBookingLimiter, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Database not configured'
      });
    }

    // Ownership is enforced here because the service-role key bypasses RLS. A
    // non-owner (or an unparseable reference) gets a flat 404.
    const { booking: data, notFound } = await loadOwnedBooking(req.params.bookingRef, req.user, {
      email: req.get('x-booking-email')
    });
    if (notFound || !data) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    // Built by name from what Manage Booking, the e-ticket and the app read -
    // never by spreading the row. This spread `booking_details` less five
    // payment secrets, and `passenger_details` as stored, so every read handed
    // over passport numbers, the fare and fee workings (`verified_charge`), the
    // GDS office and session (`gds`), the chain's bookkeeping (`gds_chain`,
    // `fulfillment_failed`), the owner's account id, the raw Amadeus offer and
    // the booker's own address - which a traveller who opened a guest booking
    // with their own address could then use to cancel it. A page that needs
    // another field gets it added to toClientBooking, by name.
    //
    // Passport numbers arrive masked except for staff. The stored number is
    // for the airline; nobody opening their booking needs it back.
    const showPassports = isStaff(req.user);
    const formattedBooking = {
      // The camelCase shape the bookings list sends. Manage Booking read
      // camelCase fields that this endpoint never had, so a refreshed page
      // showed "Date N/A" and "--:--".
      ...toClientBooking(data, { showPassports }),
      // The passenger list lives in its own column, not inside booking_details,
      // and was never included here. Manage Booking therefore showed "No
      // passenger information available" whenever it loaded the booking itself
      // — a refresh, or a shared link — and showed it correctly only when My
      // Trips handed the record over through router state.
      travelers: clientTravellers(data.booking_details?.travelers ?? data.passenger_details, { showPassports }),
      passengerData: clientTravellers(data.passenger_details ?? data.booking_details?.travelers, { showPassports }),
      status: data.status,
      payment_status: data.payment_status,
      bookingReference: data.booking_reference,
      type: data.travel_type,
      bookingDate: data.created_at,
      source: 'database'
    };

    res.json({
      success: true,
      data: formattedBooking
    });
  } catch (error) {
    console.error('❌ Get single booking check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve booking'
    });
  }
});

/**
 * A passport number as a customer-facing response carries it: the last three
 * characters, the rest masked. Enough to tell which passport a booking was
 * made on; not enough to use it.
 */
function maskPassport(number) {
  const value = String(number);
  return value.length > 3 ? `${'•'.repeat(value.length - 3)}${value.slice(-3)}` : '•••';
}

// What a page renders about a traveller. Anything else on the stored record -
// frequent-flyer numbers, document issue details, whatever a client posted at
// checkout - stays in the database.
const CLIENT_TRAVELLER_FIELDS = [
  'id', 'travelerId', 'type', 'title', 'firstName', 'lastName', 'gender', 'dateOfBirth',
  'nationality', 'email', 'mobile', 'passportExpiry', 'seatNumber',
];

/** Travellers as a response carries them, with passports masked unless `showPassports`. */
function clientTravellers(list, { showPassports = false } = {}) {
  if (!Array.isArray(list)) return [];
  return list.map((traveller) => {
    const out = Object.fromEntries(
      CLIENT_TRAVELLER_FIELDS.filter((key) => traveller?.[key] != null).map((key) => [key, traveller[key]])
    );
    if (traveller?.passportNumber) {
      out.passportNumber = showPassports ? traveller.passportNumber : maskPassport(traveller.passportNumber);
    }
    return out;
  });
}

/**
 * What checkout charged for a flight, as a receipt shows it: the airline's
 * fare, the service fee, any coupon discount, and the total, in USD (ARC Pay
 * settles only in USD). Null when checkout recorded no verified charge.
 *
 * The confirmation page printed "Base Fare" as the total less taxes, which
 * folded the fee and the discount into the fare. The rest of `verified_charge`
 * - the fee workings per traveller type, the coupon record, when the fare was
 * priced - stays in the database.
 */
function chargeBreakdownOf(charge) {
  const total = Number(charge?.total);
  if (!charge || !Number.isFinite(total)) return null;
  const figure = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  return {
    fare: figure(charge.fare ?? charge.pricedFare?.total),
    serviceFee: figure(charge.serviceFee),
    discount: figure(charge.discount),
    total,
    currency: 'USD',
    couponCode: charge.coupon?.code || null,
  };
}

// Get all bookings from database (for My Trips page)
/**
 * A bookings row as My Trips and Manage Booking consume it.
 *
 * Exported so the shape is testable: the list used to omit `cancellation`,
 * `tickets`, `needs_review`, `gds` and `payment_status`, so Manage Booking
 * had to guess - a cancelled row whose refund the gateway had refused rendered
 * "Processing Refund - In Progress", and the e-ticket helper could not tell a
 * held reservation from an issued ticket. Snake_case on those mirrors what the
 * single-booking endpoint used to send.
 *
 * It is also the allow-list for both booking reads: every field is named, and
 * the nested records (travellers, `needs_review`, `gds`) are cut down to what a
 * page uses. `showPassports` is for staff only.
 */
export function toClientBooking(booking, { showPassports = false } = {}) {
  // Get amount from total_amount column or from booking_details or from flight_offer
  const amount = booking.total_amount ||
    booking.booking_details?.amount ||
    booking.booking_details?.flight_offer?.price?.total ||
    0;

  // Every leg and flight of a flight booking. One saved before legs were kept
  // has them rebuilt from its stored offer - the airline's segments only, no
  // traveller data - so its return flight shows too.
  const savedLegs = booking.booking_details?.itineraries;
  const legs = booking.travel_type !== 'flight' ? []
    : Array.isArray(savedLegs) && savedLegs.length > 0 ? savedLegs
      : itinerariesFromOffer(booking.booking_details?.flight_offer
        || booking.booking_details?.pending_booking_data?.bookingData?.originalOffer);

  return {
    id: booking.id,
    type: booking.travel_type,
    bookingReference: booking.booking_reference,
    status: booking.status,
    totalAmount: parseFloat(amount) || 0,
    amount: parseFloat(amount) || 0, // Add both for compatibility
    currency: booking.booking_details?.currency || booking.booking_details?.flight_offer?.price?.currency || 'USD',
    paymentStatus: booking.payment_status,
    bookingDate: booking.created_at,
    // Core booking_details
    pnr: booking.booking_details?.pnr,
    orderId: booking.booking_details?.order_id,
    amadeusOrderId: booking.booking_details?.amadeus_order_id || booking.booking_details?.order_id || null,
    transactionId: booking.booking_details?.transaction_id,
    origin: booking.booking_details?.origin,
    destination: booking.booking_details?.destination,
    departureDate: booking.booking_details?.departure_date,
    departureTime: booking.booking_details?.departure_time,
    arrivalTime: booking.booking_details?.arrival_time,
    arrivalDate: booking.booking_details?.arrival_date,
    airline: booking.booking_details?.airline,
    airlineName: booking.booking_details?.airline_name,
    flightNumber: booking.booking_details?.flight_number,
    duration: booking.booking_details?.duration,
    cabinClass: booking.booking_details?.cabin_class,
    // Amadeus enriched fields
    departureTerminal: booking.booking_details?.departure_terminal || '',
    arrivalTerminal: booking.booking_details?.arrival_terminal || '',
    aircraft: booking.booking_details?.aircraft || '',
    stops: booking.booking_details?.stops ?? 0,
    stopDetails: booking.booking_details?.stop_details || [],
    brandedFare: booking.booking_details?.branded_fare || null,
    brandedFareLabel: booking.booking_details?.branded_fare_label || null,
    operatingCarrier: booking.booking_details?.operating_carrier || null,
    operatingAirlineName: booking.booking_details?.operating_airline_name || null,
    lastTicketingDate: booking.booking_details?.last_ticketing_date || null,
    numberOfBookableSeats: booking.booking_details?.number_of_bookable_seats || null,
    refundable: booking.booking_details?.refundable ?? null,
    baggageDetails: booking.booking_details?.baggage_details || null,
    baggage: booking.booking_details?.baggage || null,
    originCity: booking.booking_details?.origin_city || '',
    destinationCity: booking.booking_details?.destination_city || '',
    priceBase: booking.booking_details?.price_base || null,
    priceGrandTotal: booking.booking_details?.price_grand_total || null,
    priceFees: booking.booking_details?.price_fees || [],
    fareBreakdown: booking.booking_details?.fare_breakdown || null,
    // What checkout verified and charged, by name - see chargeBreakdownOf.
    chargeBreakdown: chargeBreakdownOf(booking.booking_details?.verified_charge),
    // Every leg and flight - see `legs` above. The flat fields describe the
    // first leg only and stay for the clients that read them.
    itineraries: legs,
    returnDate: returnDateOf(legs) || null,
    // Travelers, cut down to what a page renders; passports masked for all but staff.
    travelers: clientTravellers(booking.passenger_details, { showPassports }),
    // Cruise-specific fields
    cruiseName: booking.booking_details?.cruise_name || '',
    cruiseImage: booking.booking_details?.cruise_image || '',
    cruiseDepartureDate: booking.booking_details?.departure_date || '',
    cruiseReturnDate: booking.booking_details?.return_date || '',
    cruiseDeparture: booking.booking_details?.departure || '',
    cruiseArrival: booking.booking_details?.arrival || '',
    cruiseDuration: booking.booking_details?.duration || '',
    basePrice: booking.booking_details?.base_price || 0,
    taxesAndFees: booking.booking_details?.taxes_and_fees || 0,
    portCharges: booking.booking_details?.port_charges || 0,
    // Hotel-specific fields (surfaced so My Trips can show name/dates and
    // classify Upcoming/Past by check-in date on both web and app)
    hotelName: booking.booking_details?.hotel_name || '',
    hotelImage: booking.booking_details?.hotel_image || '',
    location: booking.booking_details?.location || '',
    hotelDestination: booking.booking_details?.location || '',
    checkinDate: booking.booking_details?.check_in_date || '',
    checkoutDate: booking.booking_details?.check_out_date || '',
    roomType: booking.booking_details?.room_type || '',
    guests: booking.booking_details?.guests || null,
    hotelGuests: booking.booking_details?.guests || null,
    nights: booking.booking_details?.nights || null,
    pricePerNight: booking.booking_details?.price_per_night || null,
    // Outcome fields - see the doc comment above.
    payment_status: booking.payment_status,
    // Paid, and waiting in the durable queue for an Amadeus slot: nothing has
    // been sent to the airline. Without it the confirmation page called this
    // "Reservation Held - your seats are reserved". Only the fact of it: the
    // stored order carries passport numbers and stays in the database.
    queued: Boolean(booking.booking_details?.queued_order) && !booking.booking_details?.pnr,
    cancellation: booking.booking_details?.cancellation || null,
    tickets: booking.booking_details?.tickets || [],
    // The reason is what the e-ticket reads ("ticket_numbers_not_retrieved").
    // The rest of the record is for the support desk: gateway errors, reversal
    // attempts, the GDS detail.
    needs_review: booking.booking_details?.needs_review
      ? { reason: booking.booking_details.needs_review.reason ?? null }
      : null,
    // Whether the GDS ticketed. The rest is the office id, the GDS session and
    // TST references, which no page reads.
    gds: booking.booking_details?.gds
      ? { ticketed: booking.booking_details.gds.ticketed ?? null }
      : null
  };
}

router.get('/bookings', protect, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Database not configured'
      });
    }

    const { type } = req.query;

    // The user is taken from the verified session, NEVER from the query string.
    // A client-supplied `userId` was both an access-control hole (pass anyone's
    // id, get their bookings) and a PostgREST filter-injection sink
    // (`?userId=x,status.not.eq.zzz` returned the whole table). `req.user.id`
    // comes from a verified JWT and is a trusted UUID.
    const userId = req.user.id;
    if (!/^[0-9a-fA-F-]{36}$/.test(String(userId))) {
      return res.status(400).json({ success: false, error: 'Invalid session' });
    }

    let query = supabase.from('bookings').select('*');

    if (type) {
      query = query.eq('travel_type', type);
    }

    // Own bookings, plus the original_user_id fallback for rows where an FK
    // constraint prevented storing user_id directly.
    query = query.or(`user_id.eq.${userId},booking_details->>original_user_id.eq.${userId}`);

    // Order by created_at descending (newest first). Bounded: every row carries
    // a full booking_details blob, and My Trips shows a list - nobody scrolls
    // past a few hundred, and an unbounded read gets slower forever.
    query = query.order('created_at', { ascending: false }).limit(200);

    const { data, error } = await query;

    if (error) {
      console.error('❌ Error fetching bookings:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch bookings'
      });
    }

    const transformedBookings = (data || []).map(toClientBooking);

    console.log(`✅ Fetched ${transformedBookings.length} bookings from database`);

    res.json({
      success: true,
      data: transformedBookings,
      count: transformedBookings.length
    });

  } catch (error) {
    console.error('❌ Error fetching bookings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bookings'
    });
  }
});

// ===== FLIGHT ANALYTICS ENDPOINTS =====

// Most Booked Destinations
router.get('/analytics/booked', async (req, res) => {
  try {
    const { origin, period } = req.query;

    if (!origin) {
      return res.status(400).json({ success: false, error: 'Origin city code is required' });
    }

    console.log(`📊 Analytics: Most booked from ${origin}`);
    const result = await FlightProvider.getMostBookedDestinations(origin, period);

    res.json({
      success: result.success,
      data: result.data || [],
      meta: result.meta
    });
  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.json({ success: true, data: [], fallback: true });
  }
});

// Most Traveled Destinations
router.get('/analytics/traveled', async (req, res) => {
  try {
    const { origin, period } = req.query;

    if (!origin) {
      return res.status(400).json({ success: false, error: 'Origin city code is required' });
    }

    console.log(`📊 Analytics: Most traveled from ${origin}`);
    const result = await FlightProvider.getMostTraveledDestinations(origin, period);

    res.json({
      success: result.success,
      data: result.data || [],
      meta: result.meta
    });
  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.json({ success: true, data: [], fallback: true });
  }
});

// Busiest Travel Period
router.get('/analytics/busiest', async (req, res) => {
  try {
    const { origin, year, direction } = req.query;

    if (!origin) {
      return res.status(400).json({ success: false, error: 'Origin city code is required' });
    }

    console.log(`📈 Analytics: Busiest period for ${origin}`);
    const result = await FlightProvider.getBusiestTravelPeriod(origin, year, direction || 'DEPARTING');

    res.json({
      success: result.success,
      data: result.data || [],
      meta: result.meta
    });
  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.json({ success: true, data: [], fallback: true });
  }
});


// Cheapest Flight Dates
router.get('/cheapest-dates', async (req, res) => {
  try {
    const { origin, destination, departureDate, oneWay, duration, nonStop, viewBy } = req.query;

    if (!origin || !destination) {
      return res.status(400).json({ success: false, error: 'Origin and destination are required' });
    }

    console.log(`💰 Cheapest dates: ${origin} → ${destination}`);
    const cacheKey = CacheKeys.flightBrowse('cheapest-dates', [origin, destination, departureDate, viewBy || 'DATE', oneWay, nonStop, duration]);
    const result = await withCache(cacheKey, TTL.FLIGHT_BROWSE, async () => {
      const r = await FlightProvider.getCheapestFlightDates(origin, destination, {
        departureDate,
        oneWay: oneWay === 'true',
        duration: duration ? parseInt(duration) : undefined,
        nonStop: nonStop === 'true',
        viewBy: viewBy || 'DATE'
      });
      // Only cache successful, non-empty responses — never cache failures/empties.
      return (r && r.success && Array.isArray(r.data) && r.data.length) ? r : null;
    });

    const out = result || { success: true, data: [], fallback: true };
    res.json({
      success: out.success,
      data: out.data || [],
      dictionaries: out.dictionaries,
      meta: out.meta
    });
  } catch (error) {
    console.error('❌ Cheapest dates error:', error);
    res.json({ success: true, data: [], fallback: true });
  }
});

// Calendar prices endpoint - fetches prices for multiple dates with caching
router.post('/calendar-prices', async (req, res) => {
  try {
    const { origin, destination, dates } = req.body;
    if (!origin || !destination || !Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({ success: false, error: 'origin, destination and dates[] are required' });
    }

    // Redis-backed, replacing an in-process Map that was per-instance and lost
    // on every restart - and on Vercel, on every cold start.
    const cacheKey = CacheKeys.flightBrowse('calendar-prices', [
      resolveToIATACode(origin), resolveToIATACode(destination), dates.slice().sort().join(','),
    ]);

    const payload = await withCache(cacheKey, TTL.FLIGHT_CALENDAR, () => FlightProvider.getCalendarPrices({
      from: origin, to: destination, adults: 1, dates,
    }));

    if (!payload) return res.json({ success: false, prices: {}, error: 'No prices available' });
    res.json({ success: payload.success, prices: payload.prices, currency: payload.currency });
  } catch (error) {
    console.error('Calendar prices error:', error?.message);
    res.json({ success: false, prices: {}, error: error?.error || error?.message });
  }
});

// Flight Status
router.get('/status', async (req, res) => {
  try {
    const { carrier, flightNumber, date } = req.query;

    if (!carrier || !flightNumber || !date) {
      return res.status(400).json({ success: false, error: 'Carrier, flightNumber, and date are required' });
    }

    console.log(`✈️ Flight status: ${carrier}${flightNumber} on ${date}`);
    const result = await FlightProvider.getFlightStatus(carrier, flightNumber, date);

    res.json({
      success: result.success,
      data: result.data || [],
      meta: result.meta
    });
  } catch (error) {
    console.error('❌ Flight status error:', error);
    res.json({ success: true, data: [], fallback: true });
  }
});

// Flight Availabilities
router.post('/availabilities', async (req, res) => {
  try {
    const { origin, destination, departureDate } = req.body;

    if (!origin || !destination || !departureDate) {
      return res.status(400).json({ success: false, error: 'Origin, destination, and departureDate are required' });
    }

    console.log(`🎫 Availabilities: ${origin} → ${destination}`);
    const result = await FlightProvider.getFlightAvailabilities({ origin, destination, departureDate });

    res.json({
      success: result.success,
      data: result.data || [],
      dictionaries: result.dictionaries,
      meta: result.meta
    });
  } catch (error) {
    console.error('❌ Availabilities error:', error);
    res.json({ success: true, data: [], fallback: true });
  }
});

// ===== AIRPORT & CITY SEARCH =====

// Airport/City search endpoint (exposed for frontend AirportService)
router.get('/airports/search', async (req, res) => {
  try {
    const { keyword, subType, countryCode, limit } = req.query;

    if (!keyword || keyword.length < 1) {
      return res.status(400).json({ success: false, error: 'keyword is required (min 1 char)' });
    }

    console.log(`🔍 Airport search: "${keyword}"`);
    const result = await FlightProvider.searchLocations(
      keyword,
      subType || 'CITY,AIRPORT',
      { countryCode, limit: parseInt(limit) || 10 }
    );

    res.json({
      success: result.success,
      data: result.data || [],
      meta: result.meta
    });
  } catch (error) {
    console.error('❌ Airport search error:', error);
    res.json({ success: false, data: [], error: 'This information is not available right now.' });
  }
});

// ===== FLIGHT INSPIRATION SEARCH =====

router.get('/inspiration', async (req, res) => {
  try {
    const { origin, departureDate, oneWay, duration, nonStop, maxPrice, viewBy, destination } = req.query;

    if (!origin) {
      return res.status(400).json({ success: false, error: 'Origin is required' });
    }

    console.log(`💡 Inspiration search from ${origin}`);
    const cacheKey = CacheKeys.flightBrowse('inspiration', [origin, departureDate, oneWay, duration, nonStop, maxPrice, viewBy || 'DATE', destination]);
    const result = await withCache(cacheKey, TTL.FLIGHT_BROWSE, async () => {
      const r = await FlightProvider.getFlightInspirations(origin, {
        departureDate,
        oneWay: oneWay === 'true',
        duration: duration ? parseInt(duration) : undefined,
        nonStop: nonStop === 'true',
        maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
        viewBy: viewBy || 'DATE',
        destination
      });
      // Only cache successful, non-empty responses — never cache failures/empties.
      return (r && r.success && Array.isArray(r.data) && r.data.length) ? r : null;
    });

    const out = result || { success: false, data: [] };
    res.json({
      success: out.success,
      data: out.data || [],
      dictionaries: out.dictionaries,
      meta: out.meta
    });
  } catch (error) {
    console.error('❌ Inspiration search error:', error);
    res.json({ success: false, data: [], error: 'This information is not available right now.' });
  }
});

// ===== FLIGHT PRICE ANALYSIS =====

router.get('/price-analysis', async (req, res) => {
  try {
    const { origin, destination, departureDate, currencyCode, oneWay } = req.query;

    if (!origin || !destination || !departureDate) {
      return res.status(400).json({ success: false, error: 'origin, destination, and departureDate are required' });
    }

    console.log(`📊 Price analysis: ${origin} → ${destination} on ${departureDate}`);
    const cacheKey = CacheKeys.flightBrowse('price-analysis', [origin, destination, departureDate, currencyCode || 'USD', oneWay]);
    const result = await withCache(cacheKey, TTL.FLIGHT_BROWSE, async () => {
      const r = await FlightProvider.getFlightPriceAnalysis(origin, destination, departureDate, {
        currencyCode: currencyCode || 'USD',
        oneWay: oneWay === 'true'
      });
      // Only cache successful, non-empty responses — never cache failures/empties.
      return (r && r.success && Array.isArray(r.data) && r.data.length) ? r : null;
    });

    const out = result || { success: false, data: [] };
    res.json({
      success: out.success,
      data: out.data || [],
      meta: out.meta
    });
  } catch (error) {
    console.error('❌ Price analysis error:', error);
    res.json({ success: false, data: [], error: 'This information is not available right now.' });
  }
});

// ============================================
// ADMIN BOOKINGS ENDPOINTS
// For viewing and managing all direct bookings
// ============================================

// GET all bookings for admin (no userId filter)
router.get('/admin-bookings', protect, admin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    const { type, status, payment_status, search, page = 1, limit = 50 } = req.query;

    let query = supabase.from('bookings').select('*', { count: 'exact' });

    if (type && type !== 'all') {
      query = query.eq('travel_type', type);
    }
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (payment_status && payment_status !== 'all') {
      query = query.eq('payment_status', payment_status);
    }
    if (search) {
      query = query.ilike('booking_reference', `%${search}%`);
    }

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('❌ Error fetching admin bookings:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    // Transform bookings for admin view
    const bookings = (data || []).map(booking => {
      const amount = booking.total_amount ||
        booking.booking_details?.amount ||
        booking.booking_details?.flight_offer?.price?.total || 0;

      // Extract customer info from passenger_details or booking_details
      let customerName = 'N/A';
      let customerEmail = '';
      if (booking.passenger_details && Array.isArray(booking.passenger_details) && booking.passenger_details.length > 0) {
        const p = booking.passenger_details[0];
        customerName = `${p.firstName || p.first_name || ''} ${p.lastName || p.last_name || ''}`.trim() || 'N/A';
        customerEmail = p.email || '';
      } else if (booking.booking_details?.contact?.email) {
        customerEmail = booking.booking_details.contact.email;
      }

      return {
        id: booking.id,
        userId: booking.user_id,
        type: booking.travel_type,
        bookingReference: booking.booking_reference,
        status: booking.status,
        totalAmount: parseFloat(amount) || 0,
        currency: booking.booking_details?.currency || 'USD',
        paymentStatus: booking.payment_status,
        bookingDate: booking.created_at,
        customerName,
        customerEmail,
        // Flight fields
        pnr: booking.booking_details?.pnr || '',
        origin: booking.booking_details?.origin || '',
        destination: booking.booking_details?.destination || '',
        departureDate: booking.booking_details?.departure_date || '',
        airline: booking.booking_details?.airline_name || booking.booking_details?.airline || '',
        // Cruise fields
        cruiseName: booking.booking_details?.cruise_name || '',
        cruiseDeparture: booking.booking_details?.departure || '',
        cruiseArrival: booking.booking_details?.arrival || '',
        // Raw details for expandable view
        bookingDetails: booking.booking_details,
        passengerDetails: booking.passenger_details,
        // Payment details for void/refund operations
        arcOrderId: booking.booking_details?.arc_order_id || booking.booking_details?.order_id || booking.booking_reference
      };
    });

    res.json({
      success: true,
      data: bookings,
      count: count || bookings.length,
      page: parseInt(page),
      totalPages: Math.ceil((count || bookings.length) / parseInt(limit))
    });
  } catch (error) {
    console.error('❌ Admin bookings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Unified bookings (flight/hotel/cruise from `bookings` + packages from quotes) ──
// Normalize a `bookings` row to the shared admin shape.
function normalizeBookingRow(b) {
  const amount = b.total_amount || b.booking_details?.amount || b.booking_details?.flight_offer?.price?.total || 0;
  let customerName = 'N/A', customerEmail = '';
  if (Array.isArray(b.passenger_details) && b.passenger_details.length) {
    const p = b.passenger_details[0];
    customerName = `${p.firstName || p.first_name || ''} ${p.lastName || p.last_name || ''}`.trim() || 'N/A';
    customerEmail = p.email || '';
  } else if (b.booking_details?.guest_info) {
    const g = b.booking_details.guest_info;
    customerName = `${g.firstName || g.first_name || ''} ${g.lastName || g.last_name || ''}`.trim() || customerName;
    customerEmail = g.email || '';
  } else if (b.booking_details?.contact?.email) {
    customerEmail = b.booking_details.contact.email;
  }
  const d = b.booking_details || {};
  const service =
    b.travel_type === 'hotel' ? (d.hotel_name || d.location || 'Hotel') :
    b.travel_type === 'cruise' ? (d.cruise_name || `${d.departure || ''}→${d.arrival || ''}`) :
    b.travel_type === 'flight' ? (`${d.origin || ''}${d.origin ? '→' : ''}${d.destination || ''}`.trim() || d.airline_name || 'Flight') :
    (d.destination || '');
  return {
    id: b.id, userId: b.user_id, type: b.travel_type,
    bookingReference: b.booking_reference,
    status: b.status, paymentStatus: b.payment_status,
    totalAmount: parseFloat(amount) || 0, currency: d.currency || 'USD',
    bookingDate: b.created_at, customerName, customerEmail,
    service,
    bookingDetails: d, passengerDetails: b.passenger_details, isPackage: false,
    arcOrderId: d.arc_order_id || d.order_id || b.booking_reference,
  };
}

// Fetch + normalize package "bookings" from the quote system.
async function fetchPackageBookings() {
  const { data: quotes } = await supabase
    .from('quotes')
    .select('id, quote_number, title, total_amount, currency, status, payment_status, inquiry_id, created_at')
    .neq('status', 'draft');
  if (!quotes || !quotes.length) return [];
  const inquiryIds = [...new Set(quotes.map((q) => q.inquiry_id).filter(Boolean))];
  let invById = {};
  if (inquiryIds.length) {
    const { data: inquiries } = await supabase
      .from('inquiries')
      .select('id, customer_name, customer_email, inquiry_type, package_destination, travel_details')
      .in('id', inquiryIds);
    invById = Object.fromEntries((inquiries || []).map((i) => [i.id, i]));
  }
  return quotes.map((q) => {
    const inv = invById[q.inquiry_id] || {};
    const status = q.status === 'paid' ? 'paid' : q.status === 'accepted' ? 'confirmed' : 'pending';
    return {
      id: q.id, type: 'package',
      bookingReference: q.quote_number || `QUOTE-${String(q.id).slice(0, 8)}`,
      status, paymentStatus: q.payment_status === 'completed' ? 'paid' : (q.payment_status || 'unpaid'),
      totalAmount: parseFloat(q.total_amount) || 0, currency: q.currency || 'USD',
      bookingDate: q.created_at,
      customerName: inv.customer_name || 'N/A', customerEmail: inv.customer_email || '',
      service: inv.package_destination || inv.travel_details?.destination || q.title || 'Package',
      isPackage: true, quoteId: q.id, inquiryId: q.inquiry_id,
    };
  });
}

// GET /api/flights/admin-bookings-all — every booking across all four services.
router.get('/admin-bookings-all', protect, admin, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ success: false, error: 'Database not configured' });
    const { type, status, payment_status, search, page = 1, limit = 50 } = req.query;

    let rows = [];
    if (type !== 'package') {
      let q = supabase.from('bookings').select('*');
      if (type && type !== 'all') q = q.eq('travel_type', type);
      const { data, error } = await q.order('created_at', { ascending: false }).limit(2000);
      if (error) throw error;
      rows = (data || []).map(normalizeBookingRow);
    }
    if (!type || type === 'all' || type === 'package') {
      rows = rows.concat(await fetchPackageBookings());
    }

    if (status && status !== 'all') rows = rows.filter((b) => b.status === status);
    if (payment_status && payment_status !== 'all') rows = rows.filter((b) => b.paymentStatus === payment_status);
    if (search) {
      const s = String(search).toLowerCase();
      rows = rows.filter((b) =>
        (b.bookingReference || '').toLowerCase().includes(s) ||
        (b.customerName || '').toLowerCase().includes(s) ||
        (b.customerEmail || '').toLowerCase().includes(s) ||
        (b.service || '').toLowerCase().includes(s));
    }
    rows.sort((a, b) => new Date(b.bookingDate || 0) - new Date(a.bookingDate || 0));

    const count = rows.length;
    const off = (parseInt(page) - 1) * parseInt(limit);
    const data = rows.slice(off, off + parseInt(limit));
    res.json({ success: true, data, count, page: parseInt(page), totalPages: Math.ceil(count / parseInt(limit)) || 1 });
  } catch (error) {
    console.error('❌ Unified bookings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/flights/admin-bookings-stats — real revenue + counts, broken down by service.
router.get('/admin-bookings-stats', protect, admin, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ success: false, error: 'Database not configured' });
    const byType = {};
    const ensure = (t) => (byType[t] = byType[t] || { count: 0, revenue: 0, paid: 0 });
    let totalRevenue = 0, totalBookings = 0, paidBookings = 0, pendingBookings = 0;
    const byStatus = {};

    const { data: bookings } = await supabase
      .from('bookings').select('travel_type, status, payment_status, total_amount');
    for (const b of bookings || []) {
      const t = b.travel_type || 'other';
      ensure(t); byType[t].count += 1; totalBookings += 1;
      byStatus[b.status] = (byStatus[b.status] || 0) + 1;
      if (b.payment_status === 'paid') {
        const amt = parseFloat(b.total_amount) || 0;
        byType[t].revenue += amt; byType[t].paid += 1; totalRevenue += amt; paidBookings += 1;
      } else if (b.payment_status !== 'refunded') pendingBookings += 1;
    }

    const { data: quotes } = await supabase.from('quotes').select('total_amount, status, payment_status').neq('status', 'draft');
    ensure('package');
    for (const q of quotes || []) {
      byType.package.count += 1; totalBookings += 1;
      if (q.payment_status === 'completed' || q.status === 'paid') {
        const amt = parseFloat(q.total_amount) || 0;
        byType.package.revenue += amt; byType.package.paid += 1; totalRevenue += amt; paidBookings += 1;
      } else pendingBookings += 1;
    }

    Object.values(byType).forEach((v) => { v.revenue = +v.revenue.toFixed(2); });
    res.json({
      success: true,
      stats: { totalRevenue: +totalRevenue.toFixed(2), totalBookings, paidBookings, pendingBookings, byType, byStatus },
    });
  } catch (error) {
    console.error('❌ Bookings stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/flights/admin-customers — unified customer list across bookings + inquiries.
router.get('/admin-customers', protect, admin, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ success: false, error: 'Database not configured' });
    const { search } = req.query;

    const map = {}; // email(lower) → aggregate
    const ensure = (email, name, phone) => {
      const key = (email || '').toLowerCase().trim();
      if (!key) return null;
      if (!map[key]) map[key] = { name: name || '', email, phone: phone || '', bookings: 0, spent: 0, inquiries: 0, lastActivity: null };
      const c = map[key];
      if (name && !c.name) c.name = name;
      if (phone && !c.phone) c.phone = phone;
      return c;
    };
    const touch = (c, date) => { if (date && (!c.lastActivity || date > c.lastActivity)) c.lastActivity = date; };

    const { data: bookings } = await supabase.from('bookings').select('*').limit(5000);
    for (const b of bookings || []) {
      const n = normalizeBookingRow(b);
      const phone = b.booking_details?.contact?.phone || b.booking_details?.guest_info?.phone || '';
      const c = ensure(n.customerEmail, n.customerName !== 'N/A' ? n.customerName : '', phone);
      if (c) { c.bookings += 1; if (b.payment_status === 'paid') c.spent += parseFloat(n.totalAmount) || 0; touch(c, b.created_at); }
    }

    const { data: inquiries } = await supabase
      .from('inquiries').select('customer_name, customer_email, customer_phone, created_at').limit(5000);
    for (const i of inquiries || []) {
      const c = ensure(i.customer_email, i.customer_name, i.customer_phone);
      if (c) { c.inquiries += 1; touch(c, i.created_at); }
    }

    let customers = Object.values(map);
    if (search) {
      const s = String(search).toLowerCase();
      customers = customers.filter((c) =>
        (c.name || '').toLowerCase().includes(s) ||
        (c.email || '').toLowerCase().includes(s) ||
        (c.phone || '').includes(s));
    }
    customers.forEach((c) => { c.spent = +c.spent.toFixed(2); });
    customers.sort((a, b) => new Date(b.lastActivity || 0) - new Date(a.lastActivity || 0));

    const totalSpent = customers.reduce((s, c) => s + c.spent, 0);
    res.json({
      success: true,
      data: customers,
      count: customers.length,
      summary: { totalCustomers: customers.length, totalSpent: +totalSpent.toFixed(2) },
    });
  } catch (error) {
    console.error('❌ Admin customers error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT update booking status (admin)
router.put('/admin-bookings/:id', protect, admin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    const { id } = req.params;
    const { status, payment_status, notes } = req.body;

    const updateData = {};
    if (status) updateData.status = status;
    if (payment_status) updateData.payment_status = payment_status;
    if (notes) updateData.admin_notes = notes;
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('bookings')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, data, message: 'Booking updated successfully' });
  } catch (error) {
    console.error('❌ Admin booking update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST cancel booking (admin) — cancel via Amadeus + ARC Pay refund/void + DB update
router.post('/admin-bookings/:id/cancel', protect, admin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    const { id } = req.params;
    const { reason = 'Admin cancellation' } = req.body;

    // Fetch booking
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ success: false, error: 'Booking is already cancelled' });
    }

    // Delegate to the single orchestrated cancel handler (Amadeus cancel + ARC Pay
    // refund/void + DB update + email). No HTTP self-call, so it works on serverless.
    const bookingRef = booking.booking_reference || booking.booking_details?.order_id;
    const { statusCode, payload } = await invokeOrchestratedCancel(bookingRef, reason, req);

    if (!payload?.success) {
      return res.status(statusCode || 500).json(payload || { success: false, error: 'Cancellation failed' });
    }

    console.log('✅ Admin booking cancelled:', id, 'Payment action:', payload.cancellation?.paymentAction);

    res.json({
      success: true,
      message: `Booking ${bookingRef} cancelled successfully`,
      data: {
        bookingId: id,
        bookingReference: bookingRef,
        previousStatus: booking.status,
        newStatus: 'cancelled',
        reason,
        cancellation: payload.cancellation
      }
    });
  } catch (error) {
    console.error('❌ Admin booking cancel error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Finish the refund of a cancelled flight by hand - after a refund that failed
// or was held for review - and record what ARC Pay shows. `mode: 'sync'` reads
// a refund made in the ARC portal; `mode: 'refund'` makes one. See
// settleManualFlightRefund.
router.post('/admin-bookings/:id/refund', protect, admin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }
    const { data: booking } = await supabase.from('bookings').select('*').eq('id', req.params.id).single();
    const { mode, amount, reason } = req.body || {};
    const { status, body } = await settleManualFlightRefund(booking || null, {
      mode: mode === 'refund' ? 'refund' : 'sync',
      amount,
      reason: reason || 'Admin refund',
      adminId: req.user?.id || null,
    });
    return res.status(status).json(body);
  } catch (error) {
    console.error('❌ Admin manual refund error:', error);
    return res.status(500).json({ success: false, error: 'Could not finish the refund' });
  }
});

export default router;
