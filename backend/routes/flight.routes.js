import express from 'express';
import FlightProvider, { providerStatus } from '../services/flightProvider.js';
import { resolveToIata, searchLocations } from '../services/airportsIndex.js';
import supabase from '../config/supabase.js';
import fetch from 'node-fetch';
import { get as cacheGet, set as cacheSet, withCache, CacheKeys, TTL } from '../services/cache.service.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';
import { protect, admin, bookingStaff, optionalProtect } from '../middleware/auth.middleware.js';
import { resolveBookingUserId } from '../utils/bookingOwner.js';
import { handleCancelBookingAction, reverseArcPaymentForOrder, settleManualFlightRefund } from './payment/operations.handlers.js';
import { emailMatchesBooking, isBookingOwner } from '../utils/bookingAccess.js';
import { reconcileBookingPayment } from './payment/checkout.handlers.js';
import { reportError } from '../services/monitoring.js';
import { withBookingPriority } from '../services/amadeusSoap/semaphore.js';
import { describeWsConfig, getWsConfig } from '../services/amadeusSoap/config.js';
import { recordCouponUse } from '../services/coupon.service.js';
import { isFareRefusal } from '../services/flightCheckout.service.js';
import { crossesBorder, touchesUnitedStates } from '../utils/itinerary.js';
import { CHAIN_CLAIM_TTL_MS, MAX_QUEUE_ATTEMPTS } from '../utils/bookingChainClaim.js';
import { queueEnvironment } from '../utils/queueEnvironment.js';
import { unchangedSince } from '../utils/bookingDetailsGuard.js';
import { UNTICKETED_REVIEW_REASON } from '../jobs/needsReviewAlert.job.js';
import { itinerariesFromOffer, returnDateOf } from '../../shared/bookingItineraries.js';
import { flightsKey, travellerNamesKey } from '../utils/tripMatch.js';
import { needsDateOfBirth } from '../../shared/travellerDetails.js';
import { buildFlightOrderBody, orderDataFromCheckoutRow } from '../../shared/flightOrderBody.js';
import { statusChangeRefusal } from '../../shared/bookingStatusChange.js';
import {
  attentionOf, reviewResolution, ticketsOf, isTicketed, NO_CONFIRMED_SEAT_REVIEW_REASON, noConfirmedSeatOf,
  HELD_REVIEW_REASON_PREFIXES, liveTicketNumbersMissingOf, unrecordedCancellationOf, voidedTicketsOf, commitUnknownOf,
  SCHEDULE_CHANGED_REVIEW_REASON,
} from '../../shared/reviewQueue.js';
import { errorSummary } from '../utils/errorSummary.js';
import { flightSearchLimiter, guestBookingLimiter } from '../middleware/security.js';
import { liveChainState } from '../utils/bookingChainClaim.js';
import { isUsableEmail } from '../services/guestBooking.service.js';

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
    // This WSAP's Master Pricer request has no price ceiling. maxPrice was
    // accepted, put in the cache key and never sent, so fares far over the cap
    // came back as if they met it - each through a fresh live search. Neither
    // app sends it (both filter the results they are given), so it is refused
    // rather than pretended.
    if (body.maxPrice !== undefined && body.maxPrice !== null && body.maxPrice !== '') {
      ctx.addIssue({
        code: 'custom',
        path: ['maxPrice'],
        message: 'Flight search cannot filter by price. Leave maxPrice out and filter the results by price instead.',
      });
    }
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
//
// `email` is a guest's proof: the address the booking was made with. Only the
// Manage Booking cancel passes one; the handler checks it.
async function invokeOrchestratedCancel(bookingReference, reason, req, { email } = {}) {
  let payload = null;
  let statusCode = 200;
  const fakeRes = {
    status(code) { statusCode = code; return this; },
    json(body) { payload = body; return this; }
  };
  await handleCancelBookingAction({
    method: 'POST',
    body: { bookingReference, reason, ...(email ? { email } : {}) },
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
//
// `code` is always answered. The calls that passed none - a chain that failed,
// an unsuccessful provider answer, a MOCK booking - answered with no code at
// all, and a client that offers "Try again" unless it sees a terminal code
// offered it for a booking that had just been refunded, or failed to be.
async function refundOnFulfillmentFailure(res, { orderId, bookingReference, amount, currency = 'USD', errorMsg, status = 502, customerMessage, reason, code = 'BOOKING_FAILED' }) {
  console.warn('🚑 Ticket not booked after payment — reversing charge. order:', orderId, '| reason:', errorMsg);
  // Recorded before the gateway is asked, so no other request books this
  // payment while it is on its way back: claimBookingChain and holdChainClaim
  // both refuse a booking with `fulfillment_failed`. The caller has already
  // released its claim, and the reversal takes seconds.
  const failingRef = bookingReference || orderId;
  // Both writes below put back the whole booking_details column from a copy
  // just read, and neither was pinned to it: a record locator a running chain
  // committed in between, a payment reconcile or a review stamp was erased -
  // for the locator, "a reservation nobody can find again". Each is now
  // written only onto the row it was built from (utils/bookingDetailsGuard.js),
  // and a lost race reads again and writes again.
  try {
    if (supabase && failingRef) {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const { data: failing } = await supabase
          .from('bookings')
          .select('id, status, payment_status, booking_details')
          .or((r => `booking_reference.eq.${r},booking_details->>order_id.eq.${r}`)(sanitizeRef(failingRef)))
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!failing || failing.booking_details?.fulfillment_failed) break;
        const { data: written } = await unchangedSince(supabase.from('bookings').update({
          booking_details: {
            ...failing.booking_details,
            fulfillment_failed: { at: new Date().toISOString(), error: errorMsg, reversal: { action: 'IN_PROGRESS' } },
          },
        }).eq('id', failing.id), failing).select('id');
        if (written?.length) break;
      }
    }
  } catch (e) {
    console.error('⚠️ Could not record the failure before reversing the payment:', e.message);
  }
  const reversal = await reverseArcPaymentForOrder(orderId, {
    amount,
    currency,
    reason: 'Flight booking failed after payment'
  });
  console.log('💸 Payment reversal result:', reversal.action, '| reversed:', reversal.reversed);

  // Record the failure on the booking row created at hosted-checkout (if any).
  try {
    const ref = bookingReference || orderId;
    for (let attempt = 1; supabase && ref && attempt <= 3; attempt += 1) {
      const { data: bk } = await supabase
        .from('bookings')
        .select('*')
        .or((r => `booking_reference.eq.${r},booking_details->>order_id.eq.${r}`)(sanitizeRef(ref)))
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!bk) break;
      // A reversal the gateway refused - or could not attempt - leaves the
      // customer charged with no booking. Writing that row `cancelled` hid it
      // from the paid-but-not-ticketed alarm, which skips cancelled rows, and
      // nothing ever read `fulfillment_failed`, so the one case that needs a
      // human reached no one. It keeps its status and is flagged instead.
      // Every caller runs after the payment was verified, so "not reversed"
      // means the money is still held.
      const stuck = !reversal.reversed;
      const now = new Date().toISOString();
      const { data: written } = await unchangedSince(supabase.from('bookings').update({
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
      }).eq('id', bk.id), bk).select('id');
      if (written?.length) break;
      // Out of tries: the outcome - possibly "charge not reversed" - is not on
      // the row, so the alarms cannot see it. Said, not swallowed.
      if (attempt === 3) {
        reportError(new Error('the failed booking outcome could not be recorded: the row kept changing'), {
          where: 'refundOnFulfillmentFailure', bookingReference: ref, reversed: reversal.reversed === true,
        });
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

/**
 * Change part of `booking_details` without losing what landed in between.
 *
 * PostgREST cannot write one key inside a jsonb column, so this reads the
 * column, merges, and writes the whole thing back. It was the ONLY such writer
 * with no compare-and-set - and the one that records the PNR
 * (persistCommittedPnr), flags a booking for review, releases the chain and
 * holds a duplicate payment. A cancellation or a payment reconcile landing
 * between its read and its write was erased, which for the PNR means a
 * reservation nobody can find again.
 *
 * `patch` may be an object, or a function of the details as they were just
 * read, for a caller that needs to merge into a nested key rather than replace
 * it. A write that matches no row lost a race, so it reads and decides again.
 */
export async function patchBookingDetails(bookingReference, patch, { attempts = 3 } = {}) {
  if (!supabase || !bookingReference) return null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const { data: existing, error: readError } = await supabase
      .from('bookings')
      .select('status, payment_status, booking_details')
      .eq('booking_reference', bookingReference)
      .single();

    // A read that failed is not an empty booking.
    //
    // supabase-js does not throw on a transport error - it answers
    // `{ data: null, error }`. The merge base was `existing?.booking_details ||
    // {}` and the pin was `if (existing)`, so ONE blip did both of the wrong
    // things at once: it dropped the compare-and-set AND made the patch the
    // whole column. `persistCommittedPnr` hitting that would leave the row with
    // a PNR and nothing else - no `order_id`, no `success_indicator` (a guest
    // can no longer prove they paid), no `arc_captured_amount`, no
    // `pending_booking_data` - and a queue replay reading no verified offer
    // REVERSES THE CHARGE. Writing nothing is always better than writing that.
    if (readError || !existing) {
      console.error('❌ Not patching booking_details: the booking could not be read', {
        bookingReference, reason: readError?.message ?? 'no row',
      });
      return null;
    }

    const details = existing.booking_details || {};
    const changes = typeof patch === 'function' ? patch(details) : patch;

    let write = unchangedSince(
      supabase
        .from('bookings')
        .update({ booking_details: { ...details, ...changes } })
        .eq('booking_reference', bookingReference),
      existing,
    );

    const { data, error } = await write.select();
    if (error) {
      console.error('❌ Failed to patch booking_details:', error.message);
      return null;
    }
    if (data?.length) return data[0];
    console.warn('↻ booking_details changed while patching; reading again', { bookingReference, attempt });
  }

  console.error('❌ booking_details not patched: the row kept changing', { bookingReference });
  return null;
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
 * The airline's schedule change the chain accepted before it failed, kept under
 * the held flag as `previous` - the flag the provider writes on a booking it
 * completes (amadeusSoap/index.js createFlightOrder), with any flag already on
 * the booking under it in turn, as a later cancel keeps the one before
 * (payment/operations.handlers.js keepingPrevious). Held with the failure as
 * its only flag, the retiming reached nobody: the desk and the alarm find it
 * with scheduleChangeOf, on top or under. Nothing when there was none.
 */
const keepingScheduleChange = (statuses, details) => (Array.isArray(statuses) && statuses.length > 0
  ? {
    previous: {
      reason: SCHEDULE_CHANGED_REVIEW_REASON,
      statuses,
      at: new Date().toISOString(),
      ...(details.needs_review ? { previous: details.needs_review } : {})
    }
  }
  : {});

/**
 * Mark a booking as needing a human.
 *
 * Used when the chain created a real PNR and then failed: the money and the
 * booking are both real but out of step, and no automatic action is safe.
 */
export async function flagForReview({
  bookingReference, pnr, reason, ticketed, tickets = null, amadeus = null, issuance = null, scheduleChanged = null
}) {
  console.error('⚠️ Booking needs review', { bookingReference, pnr, reason, ticketed, issuance, amadeus });

  const patched = await patchBookingDetails(bookingReference, (details) => ({
    pnr: pnr || undefined,
    // The refund decision reads `gds.ticketed` and `tickets` - never
    // `needs_review.ticketed`. A booking held AFTER its ticket was issued wrote
    // only the latter, so `rowTicketed` stayed false and decideFlightRefund's
    // guard - "the booking records a ticket, but the airline showed none when
    // it was cancelled" - could not fire for the very bookings it is for. A
    // later cancel whose retrieve missed the FA elements refunded in full
    // against a live ticket.
    ...(ticketed ? { gds: { ...(details.gds || {}), ticketed: true } } : {}),
    ...(Array.isArray(tickets) && tickets.length > 0 ? { tickets } : {}),
    // The chain has stopped: what it did is being handed to a person. Left
    // `committed`, a retry would be told the booking is still being confirmed.
    ...(details.gds_chain?.state === 'committed'
      ? { gds_chain: { ...details.gds_chain, state: 'finished', finishedAt: new Date().toISOString() } }
      : {}),
    needs_review: {
      reason,
      ticketed: Boolean(ticketed),
      // DocIssuance sent and never answered (bookingChain.js callStep): a
      // ticket may exist that nothing here records. Written as `ticketed:
      // false` alone, the alarm told staff no ticket was issued before ticket
      // sync had read the PNR, and a cancel whose retrieve did not show the FA
      // line yet refunded in full. Beside `ticketed`, not in place of it.
      ...(issuance ? { issuance } : {}),
      at: new Date().toISOString(),
      // What Amadeus actually said. Without it the row read only "chain failed
      // after commit at issueTicket" and the refusal itself - 2161 PROHIBITED
      // TICKETING CARRIER on every Air India booking - existed only in a dev
      // terminal's scrollback, so a carrier the office may not ticket looked
      // like a code regression. Amadeus error text carries no passenger data.
      ...(amadeus ? { amadeus } : {}),
      ...keepingScheduleChange(scheduleChanged, details)
    }
  }));

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
 * The airline reservation a booking row holds: the record locator the chain
 * stored, never a reference the caller chose. Checkout saves a row under
 * whatever reference it is given (booking_reference and order_id), so neither
 * may be sent to the GDS as if it named this booking's PNR.
 */
function pnrOf(booking) {
  const details = booking?.booking_details || {};
  const pnr = String(details.pnr || details.amadeus_order_id || '').trim();
  return pnr || null;
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
  // A failure is recorded before its payment is reversed (refundOnFulfillmentFailure).
  if (details.fulfillment_failed) {
    console.warn('⛔ Chain refused: this booking already failed and its payment is being returned', bookingReference);
    return { claimed: false, failed: true };
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

// A booking that cannot get an Amadeus slot is retried MAX_QUEUE_ATTEMPTS times
// by the queue worker before it is refunded like any other failure
// (utils/bookingChainClaim.js, shared with the worker's own retries).

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

export async function queueBookingForRetry(bookingReference, orderBody) {
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
  // Pinned to the row this was built from. Every sibling writer compares and
  // sets - claimBookingChain, refreshChainClaim, holdChainClaim, and the
  // worker's own retryLater "so a request that has taken the booking since is
  // never undone" - and this one did not. It runs after the claim is held, so
  // it could replace another request's live `in_progress` claim with `queued`
  // and demote a booking that was actively being confirmed.
  let write = supabase
    .from('bookings')
    .update({
      booking_details: {
        ...details,
        queued_order: order,
        // Local dev and production share one database. Only a worker in the
        // environment that queued a booking may run it - a laptop must never
        // replay a customer's booking, and production must never book a test.
        // Named explicitly, not NODE_ENV, which `npm start` sets to production
        // on any machine (utils/queueEnvironment.js).
        queued_env: queueEnvironment(),
        // `startedAt` is what the next claim compares-and-sets on.
        gds_chain: { state: 'queued', startedAt: queuedAt, queuedAt, attempt: details.gds_chain?.attempt, queueAttempts },
      },
      updated_at: queuedAt,
    })
    .eq('booking_reference', bookingReference);
  write = unchangedSince(write, row);

  const { data, error } = await write.select('booking_reference');

  if (error) {
    console.error('⚠️ Could not queue the booking, refunding instead:', error.message);
    return false;
  }
  if (!data?.length) {
    // Someone took the booking between the read above and this write. Saying
    // "queued" would hand the customer a 202 for a booking this request no
    // longer owns, so the caller falls back to refunding - which is refused in
    // turn if the other request has committed a PNR.
    console.warn('⚠️ Not queued: the booking changed hands while it was being queued', { bookingReference });
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
  // The queue count survives the release, as it survives a new claim
  // (claimBookingChain). Dropping it here reset the count every time a queued
  // booking was sent back from a step before the chain, so a booking that kept
  // failing that step was queued again without end instead of reaching
  // MAX_QUEUE_ATTEMPTS.
  let queueAttempts = null;
  if (supabase && bookingReference) {
    const { data: row } = await supabase
      .from('bookings')
      .select('booking_details')
      .eq('booking_reference', bookingReference)
      .single();
    queueAttempts = row?.booking_details?.gds_chain?.queueAttempts ?? null;
  }
  return patchBookingDetails(bookingReference, {
    gds_chain: {
      state: 'failed',
      failedStep: failedStep || null,
      finishedAt: new Date().toISOString(),
      ...(queueAttempts ? { queueAttempts } : {}),
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
 * Is this request the booking queue's own replay (jobs/bookingQueue.job.js)?
 *
 * The worker posts to this process on the loopback address and says so in a
 * header. The header alone is anyone's to send, so it counts only from this
 * machine: on Lightsail every outside request reaches the app from Caddy, never
 * from 127.0.0.1.
 */
export function isQueueReplay(req) {
  const header = typeof req?.get === 'function' ? req.get('x-booking-queue-replay') : req?.headers?.['x-booking-queue-replay'];
  if (header !== '1') return false;
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(String(req?.socket?.remoteAddress || ''));
}

/**
 * What holds this booking right now, read fresh, or null when nothing does.
 *
 * A booking waiting in the queue is not held from the queue's own replay: that
 * replay is the run the queue was waiting for.
 *
 * @returns {Promise<'in_progress'|'queued'|'cancelling'|'committed'|'unavailable'|null>}
 */
async function bookingHolder(req, bookingReference) {
  if (!supabase || !bookingReference) return null;
  const { data, error } = await supabase
    .from('bookings')
    .select('booking_details')
    .eq('booking_reference', bookingReference)
    .single();
  if (error && error.code !== 'PGRST116') return 'unavailable';
  const holder = liveChainState(data?.booking_details?.gds_chain);
  return holder === 'queued' && isQueueReplay(req) ? null : holder;
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
export async function refreshChainClaim(bookingReference) {
  if (!supabase || !bookingReference) return false;
  const { data: row } = await supabase
    .from('bookings')
    .select('booking_details')
    .eq('booking_reference', bookingReference)
    .single();
  const details = row?.booking_details || {};
  const chain = details.gds_chain;

  // A committed chain is renewed too, on its own stamp.
  //
  // The commit used to renew nothing: the claim was measured from `committedAt`
  // and expired CHAIN_CLAIM_TTL_MS later, on the assumption that what follows a
  // commit takes seconds. Since the airline-locator patience of #132 it can take
  // minutes - issuance retries in fresh sessions until the carrier sends its
  // record locator, up to AMADEUS_WS_AIRLINE_LOCATOR_MAX_WAIT_MS (180 s by
  // default) plus the issue retries. From the TTL to the end of that work the
  // booking read as held by nobody, so a cancel arriving in the gap found no
  // tickets yet, refunded in full with no fee, and the chain issued the ticket
  // seconds afterwards: a live ticket and the money given back.
  //
  // The heartbeat is cleared in a `finally`, so a chain that ends - either way -
  // stops renewing and the claim ages out exactly as before.
  const stamp = chain?.state === 'committed' ? 'committedAt' : 'startedAt';
  if ((chain?.state !== 'in_progress' && chain?.state !== 'committed') || !chain[stamp]) return false;

  const { data } = await supabase
    .from('bookings')
    .update({ booking_details: { ...details, gds_chain: { ...chain, [stamp]: new Date().toISOString() } } })
    .eq('booking_reference', bookingReference)
    .eq('booking_details->gds_chain->>state', chain.state)
    .eq(`booking_details->gds_chain->>${stamp}`, chain[stamp])
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
export async function holdChainClaim(bookingReference, attempt, claimedAt) {
  if (!supabase || !bookingReference) return 'held';
  const { data: row, error: readError } = await supabase
    .from('bookings')
    .select('status, booking_details')
    .eq('booking_reference', bookingReference)
    .single();
  if (readError && readError.code !== 'PGRST116') return 'unavailable';
  if (!row) return 'lost';

  const details = row.booking_details || {};
  // Another request's booking failed and its payment is being, or has been,
  // reversed. It releases the claim before the reversal, so a retry could take
  // the claim in between and hold it here - and commit a PNR, and issue a
  // ticket, on a payment already on its way back to the card.
  if (details.fulfillment_failed || row.status === 'cancelled') return 'lost';
  const chain = details.gds_chain;
  if (chain?.state !== 'in_progress' || !chain.startedAt) return 'lost';
  if (attempt != null && Number(chain.attempt) !== Number(attempt)) return 'lost';
  // The attempt number alone cannot tell two claimants apart. A write that
  // spread a copy of the row read before this claim - a payment reconcile, say -
  // put the chain back as it was, the next claimant counted from there, and both
  // held "attempt 1": both were told they still held the booking. The claim's
  // own stamp is unique to it, and the heartbeat never moves it.
  if (claimedAt != null && chain.claimedAt !== claimedAt) return 'lost';

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
// Reasons a person follows up on while the customer still gets their booking
// email: a schedule change is told to the customer by the team, but the
// booking and its ticket are real.
// How long a recorded capture is trusted before the order route asks ARC again.
const PAYMENT_TRUST_MS = 10 * 60 * 1000;

const EMAILED_REVIEW_REASONS = new Set(['ticket_numbers_not_retrieved', UNTICKETED_REVIEW_REASON, 'schedule_changed_by_airline']);

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
 * had been sent. Defined in shared/reviewQueue.js (HELD_REVIEW_REASON_PREFIXES),
 * which the desk and the alarm read to follow the held email up.
 */

/**
 * The flag the committed branch writes when the airline left a segment
 * waitlisted, requested, unable or cancelled at commit (the chain's step
 * 'segmentStatus', bookingChain.js NOT_A_SEAT_AT_COMMIT). The PNR exists but
 * no seat is confirmed, and the server will not ticket it. It matched the held
 * prefix above, so the customer was sent "the airline is holding your seats
 * ... You do not need to do anything" - false. No honest email for this case
 * exists, so none is sent: the flag pages a person, who contacts the customer.
 * Defined in shared/reviewQueue.js, which the alarm reads too.
 */
export { NO_CONFIRMED_SEAT_REVIEW_REASON };

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
  if (review.reason === NO_CONFIRMED_SEAT_REVIEW_REASON) return null;
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
  // Checked, and tried again. The write was pinned to this claim and never
  // asked whether it matched: a whole-column write of booking_details landing
  // while the email went out - a copy read before the claim - left it matching
  // nothing, and the booking stayed owed its confirmation, so every later retry
  // sent it again. Now a lost race reads again and re-applies the outcome,
  // pinned to the row as read (utils/bookingDetailsGuard.js), unless another
  // sender has claimed the email since: that claim is theirs to record.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { data: row } = await supabase
      .from('bookings')
      .select('status, payment_status, booking_details')
      .eq('booking_reference', bookingReference)
      .single();
    const details = row?.booking_details;
    if (!details) return;
    const current = details.confirmation_email || null;
    const ours = current?.claimed_at === claimedAt;
    if (!ours && current?.claimed_at && String(current.claimed_at) > String(claimedAt)) {
      console.warn('Confirmation email outcome not recorded: it was claimed again since', { bookingReference });
      return;
    }
    let write = unchangedSince(
      supabase
        .from('bookings')
        .update({ booking_details: { ...details, confirmation_email: { ...(ours ? current : {}), ...outcome, claimed_at: claimedAt } } })
        .eq('booking_reference', bookingReference),
      row,
    );
    write = current?.claimed_at
      ? write.eq('booking_details->confirmation_email->>claimed_at', current.claimed_at)
      : write.is('booking_details->confirmation_email->>claimed_at', null);
    const { data, error } = await write.select('booking_reference');
    if (error) {
      console.error('⚠️ Could not record the confirmation email:', error.message);
      return;
    }
    if (data?.length) return;
  }
  console.error('Confirmation email outcome not recorded: the booking kept changing', { bookingReference });
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
  return sendOwedConfirmation(bookingReference, body, { only: 'held' });
}

/**
 * Send the email a booking owes its customer (confirmationEmailKind), read
 * back from the row and through the confirmation's own claim, so nothing else
 * sends it a second time. For its first chance to email: it fails open like
 * the success path's first send. `only` limits it to one kind. Never throws.
 */
async function sendOwedConfirmation(bookingReference, body = {}, { only = null } = {}) {
  try {
    const row = await findExistingBooking(bookingReference);
    const kind = confirmationEmailKind(row);
    if (kind === null || (only && kind !== only)) return { sent: false, reason: 'not-owed' };
    return await sendConfirmationOnce(row.booking_reference, confirmationEmailFromRow(row, body), { failOpen: true });
  } catch (error) {
    console.error('❌ Owed booking email step failed:', error.message);
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

/**
 * What happened to a booking's money, as its record says - for an answer that
 * tells the customer.
 *
 * A retry of a booking under review was answered "Your payment is held with
 * this booking ... do not book this trip again" whatever the row said: this
 * branch never read the payment. A flagged row can have been refunded since it
 * was flagged - the Payments tab writes payment_status and nothing else - and
 * for that customer both sentences were false.
 *
 * A cancellation that moved the money and could not record it leaves the row
 * reading paid (flagUnrecordedCancellation), and the customer was told "we will
 * confirm what happened to your payment": neither held nor returned is known.
 *
 * @returns {'held'|'returned'|'partly_returned'|'unconfirmed'}
 */
export function paymentStateOf(booking) {
  const payment = String(booking?.payment_status ?? '').toLowerCase();
  if (['refunded', 'reversed'].includes(payment)) return 'returned';
  if (payment === 'partially_refunded') return 'partly_returned';
  if (unrecordedCancellationOf(booking)) return 'unconfirmed';
  return ['paid', 'completed'].includes(payment) ? 'held' : 'unconfirmed';
}

/**
 * The refusal a retry of a booking under review gets, worded by what its
 * payment record says (paymentStateOf). "Our team is reviewing it" and "If you
 * have not heard from us" are for a payment still held, or one whose fate a
 * person is confirming: a refunded booking is on no desk list and no alarm.
 *
 * `commitUnknown` (commitUnknownOf): the airline commit never answered, and
 * nobody knows yet whether the airline holds the booking. A reload of the
 * order page sends the order again, and the refusal said the booking could
 * not be completed - with nothing against booking the trip again, which is
 * what the customer was told moments before.
 */
function notSentAgainMessage(bookingReference, paymentState, { commitUnknown = false } = {}) {
  const call = `call (877) 538-7380 with booking reference ${bookingReference}`;
  if (paymentState === 'returned') {
    return 'This booking could not be completed, so it was not sent to the airline again. '
      + `Your payment for it has been refunded. If you have any questions, ${call}.`;
  }
  if (paymentState === 'partly_returned') {
    return 'This booking could not be completed, so it was not sent to the airline again. '
      + `Part of your payment for it has been refunded. Please ${call} about the rest.`;
  }
  if (commitUnknown) {
    return 'Our team is checking with the airline whether this booking went through, so it was not sent to the airline again. '
      + 'Nothing more has been charged. Please do not book this trip again in the meantime - we will email you either way. '
      + `If you have not heard from us within 2 business days, ${call}.`;
  }
  return 'This booking could not be completed and our team is reviewing it, so it was not sent to the airline again. '
    + `Nothing more has been charged. If you have not heard from us within 2 business days, ${call}.`;
}

/**
 * What the customer is told when their payment is held as a second payment for
 * one trip - and, on a retry, what became of it since.
 *
 * "Our support team will check it and refund this payment" was said on every
 * retry, including one whose payment staff had already refunded: a retry is
 * answered from the row before the gateway is asked, so the answer is worded
 * by the row's payment record (paymentStateOf). Where it is caught first, the
 * gateway has just confirmed the capture and nothing refunds it: 'held'.
 */
function duplicatePaymentAnswer(bookingReference, paymentState = 'held', { firstCommitUnknown = false } = {}) {
  const call = `call (877) 538-7380 with booking reference ${bookingReference}`;
  const money = paymentState === 'returned' ? `This payment has been refunded. If you have any questions, ${call}.`
    : paymentState === 'partly_returned' ? `Part of this payment has been refunded. Please ${call} about the rest.`
      : paymentState === 'held'
        ? 'Our support team will check it and refund this payment. If you did mean to book this trip twice, or have not '
          + `heard from us within 2 business days, ${call}.`
        : 'Our support team will check what happened to this payment and contact you. If you have not heard from us '
          + `within 2 business days, ${call}.`;
  // The first booking's commit never answered (commitUnknownOf): it is paid
  // for, and nobody knows yet whether it was booked.
  const message = firstCommitUnknown
    ? 'This payment looks like a second payment for a trip you have already paid for, for the same travellers '
      + 'on the same flights, so we have not booked it again. Your first payment is not affected, and our team is still '
      + `checking with the airline whether that booking went through. ${money}`
    : 'This payment looks like a second payment for a trip you have already booked, for the same travellers '
      + `on the same flights, so we have not booked it again. Your other booking is not affected. ${money}`;
  return {
    success: false,
    code: 'DUPLICATE_PAYMENT',
    duplicatePayment: true,
    needsReview: true,
    bookingReference,
    paymentState,
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
 * a commit the airline never answered, or a chain in progress that claimed
 * first - the earlier claim, or the lower reference on a tie. Two paid
 * checkouts racing each other both get here after taking their own claim, so
 * they see each other, and only the later one is held. Same names, not just
 * the same flights: a family can book one flight twice for different people,
 * and nothing here refunds anybody.
 *
 * `firstCommitUnknown`: the booking it repeats is a commit the airline never
 * answered, for the customer's wording (duplicatePaymentAnswer).
 *
 * @returns {Promise<{ duplicateOf: string|null, firstCommitUnknown?: boolean } | { unavailable: true }>}
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
    // A commit that never answered (commitUnknownOf) may be held at the
    // airline. Its row has no PNR and its chain stays 'in_progress', so it
    // counted only for the chain's two-minute claim - after that a second
    // payment for the trip was sent to the airline. It counts until a person
    // finds out.
    const firstCommitUnknown = Boolean(commitUnknownOf(row));
    const booked = Boolean(other.pnr) || Boolean(other.queued_order) || ['committed', 'queued'].includes(chain.state)
      || firstCommitUnknown;
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
      return { duplicateOf: row.booking_reference, firstCommitUnknown };
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
    // The first address that can be delivered to, as the success path picks
    // it. The first one given was taken whatever it held: a typed
    // "jane@gmailcom" was sent the held-for-review email and a retry's owed
    // confirmation, and the address checkout recorded never got them.
    customerEmail: [body?.contactInfo?.email, body?.customerEmail, lead.email, details.customer_email].find(isUsableEmail) || '',
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
const MERGE_TRIES = 3;

/** The bookings table refused the row's owner: a foreign key on user_id, or RLS. */
const ownerRefused = (error) => error?.code === '23503' || error?.code === '42501'
  || /violates foreign key|row-level security/i.test(error?.message || '');

/**
 * A paid booking whose outcome could not be written is reported, not just
 * logged. The route still answers the customer (savedToDatabase: false), so
 * without this a live PNR could sit behind checkout's `pending` row - no
 * itinerary, no travellers, no confirmation email - with nothing said.
 */
const reportMergeFailure = (bookingData, reason) => reportError(
  new Error(`the booking outcome could not be saved: ${reason}`),
  { where: 'handleDuplicateBookingMerge', bookingReference: bookingData.bookingReference, pnr: bookingData.pnr || null },
);

export async function handleDuplicateBookingMerge(bookingData, rowTemplate) {
  console.log('🔄 Booking reference already exists, merging into the checkout row...');

  // Set once the table has refused the template's owner. Checkout saves its row
  // without the owner when `bookings.user_id` refuses the id (a travel agent's
  // token, a legacy login), so that row has none - and the merge put the same
  // refused id straight back, the same foreign key refused it, and the whole
  // save was abandoned. The id is still kept, in booking_details.original_user_id.
  let withoutTemplateOwner = false;

  for (let tries = 0; tries < MERGE_TRIES; tries += 1) {
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
      // The chain is over once its outcome is saved. Left `committed`, the
      // booking read as still being confirmed for a claim's lifetime, and a
      // retry in that window is told to wait rather than shown the booking.
      // A claim renewal already on its way matches `committed` and misses.
      ...(existingDetails.gds_chain?.state === 'committed'
        ? { gds_chain: { ...existingDetails.gds_chain, state: 'finished', finishedAt: new Date().toISOString() } }
        : {}),
    };

    const update = {
      ...rowTemplate,
      booking_details: mergedDetails,
      user_id: existingBooking?.user_id || (withoutTemplateOwner ? null : rowTemplate.user_id) || null,
    };
    // Never resurrect a cancelled booking, or re-mark returned money as paid.
    if (existingBooking?.status === 'cancelled') update.status = 'cancelled';
    if (['refunded', 'partially_refunded'].includes(existingBooking?.payment_status)) {
      update.payment_status = existingBooking.payment_status;
    }
    // What checkout asked the gateway to charge, not the order request's figure.
    if (Number(existingBooking?.total_amount) > 0) update.total_amount = existingBooking.total_amount;

    // Written only onto the row it was merged from. The merge used to be
    // written whatever had landed since the read, so a cancellation that
    // finished in between was overwritten: its record gone, and the cancelled
    // booking back as pending_ticketing. A race this loses is read and merged
    // again (utils/bookingDetailsGuard.js).
    let write = supabase
      .from('bookings')
      .update(update)
      .eq('booking_reference', bookingData.bookingReference);
    if (existingBooking) write = unchangedSince(write, existingBooking);
    const { data: updatedData, error: updateError } = await write.select().single();

    if (updateError?.code === 'PGRST116' && existingBooking) {
      console.warn('↻ The booking changed while it was being saved; merging again', { bookingReference: bookingData.bookingReference });
      continue;
    }
    if (updateError && !withoutTemplateOwner && update.user_id && update.user_id !== existingBooking?.user_id
      && ownerRefused(updateError)) {
      console.warn('The booking owner was refused, merging without one', { bookingReference: bookingData.bookingReference, code: updateError.code });
      withoutTemplateOwner = true;
      continue;
    }
    if (updateError) {
      console.error('❌ Update with merged data failed:', updateError.message);
      reportMergeFailure(bookingData, updateError.message);
      return null;
    }

    console.log('✅ SUCCESS (merged)! Booking updated with ARC Pay data preserved:');
    console.log('   Database ID:', updatedData.id);
    console.log('   Session ID preserved:', mergedDetails.session_id || 'NONE');
    console.log('   Booking Reference:', updatedData.booking_reference);
    return updatedData;
  }

  console.error('❌ Booking not saved: it kept changing while it was being merged', { bookingReference: bookingData.bookingReference });
  reportMergeFailure(bookingData, 'it kept changing while it was being merged');
  return null;
}

// Helper function to save booking to database
export async function saveBookingToDatabase(bookingData) {
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

      // A CHECK violation means the database refuses the shape of the row - a
      // `status` the constraint does not list, say. No retry below can help:
      // the fallback only drops user_id. The route still answers success:true
      // with savedToDatabase:false, so without this the failure is silent - a
      // paid customer with a real PNR, no row and no confirmation email. This
      // is how `pending_ticketing` went unnoticed until it was audited for.
      if (error.code === '23514') {
        reportError(new Error(`the bookings table refused this row: ${error.message}`), {
          where: 'saveBookingToDatabase',
          bookingReference: bookingData.bookingReference,
          pnr: bookingData.pnr,
          status: row.status,
        });
      }

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

  return resolveToIata(location) ?? null;
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
      // Connections, and technical stops within a flight: a plane that lands on
      // the way is a stop to the traveller, and was shown as "Non stop".
      const layoverOf = (arrivalAt, departureAt) => {
        const diffMs = new Date(departureAt) - new Date(arrivalAt);
        if (!Number.isFinite(diffMs)) return '';
        return `${Math.floor(diffMs / 3600000)}h ${Math.floor((diffMs % 3600000) / 60000)}m`;
      };
      const stopDetails = [];
      segments.forEach((seg, index) => {
        for (const tech of seg.stops || []) {
          const duration = tech.arrivalAt && tech.departureAt ? layoverOf(tech.arrivalAt, tech.departureAt) : '';
          stopDetails.push({
            airport: tech.iataCode,
            terminal: '',
            arrivalAt: tech.arrivalAt,
            departureAt: tech.departureAt,
            duration,
            waitingTime: duration,
            technical: true,
          });
        }
        const nextSeg = segments[index + 1];
        if (!nextSeg) return;
        const durationStr = layoverOf(seg.arrival.at, nextSeg.departure.at);
        stopDetails.push({
          airport: seg.arrival.iataCode,
          terminal: seg.arrival.terminal || '',
          arrivalAt: seg.arrival.at,
          departureAt: nextSeg.departure.at,
          duration: durationStr,
          waitingTime: durationStr // explicit alias for clarity
        });
      });
      const stops = stopDetails.length;

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

    // Text that names no place is not searched as a guess. It used to go to
    // Amadeus as typed - or, before that, as the first suggestion for its first
    // word - and the page headed "Flights from San Francisco, CA" listed
    // departures from Ouagadougou.
    const unknownPlace = !/^[A-Z]{3}$/.test(String(resolvedFrom || '')) ? from
      : !/^[A-Z]{3}$/.test(String(resolvedTo || '')) ? to
        : null;
    if (unknownPlace) {
      return res.status(400).json({
        success: false,
        code: 'UNKNOWN_PLACE',
        error: `We could not find "${String(unknownPlace).slice(0, 60)}". Please choose the city or airport from the list as you type.`,
      });
    }

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
      // Every dimension that changes the answer belongs in the key.
      //
      // The airline filters were accepted, forwarded, and genuinely changed the
      // Amadeus request (carrierQualifier M/X) - but were absent from the key,
      // with a 5 minute TTL. A BA-only search therefore poisoned the next
      // unfiltered search of the same route and dates, which then silently
      // missed cheaper carriers; reversed, the filter appeared to do nothing.
      // The unticketable list is in here for the same reason: for up to 5
      // minutes after that env var changes, hidden carriers would keep being
      // served from a key that could not see the change.
      const wsConfig = describeWsConfig();
      const filterKey = searchFilterKey(searchParams, wsConfig.unticketableCarriers, wsConfig.interline);
      const flightCacheKey = CacheKeys.flightSearch(
        searchParams.from,
        searchParams.to,
        `${searchParams.departDate}|${searchParams.returnDate || 'ow'}`,
        `${searchParams.adults}-${searchParams.children}-${searchParams.infants}-${searchParams.travelClass || 'any'}-${searchParams.nonStop ? 'ns' : 'any'}-${filterKey}`
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

    // Checkout asks for the seats to be confirmed before the charge, and only
    // checkout: the review page prices through this route on every load, and a
    // sell for every page view would be a sell for every look. A refusal is a
    // 409, answered below as FARE_UNAVAILABLE, like a fare the airline will not
    // price. See confirmSeats in services/amadeusSoap/bookingChain.js.
    //
    // Never while booking is switched off. The seat check is a GDS write
    // (Air_SellFromRecommendation, then Fare_PricePNRWithBookingClass), and
    // AMADEUS_WS_BOOKING_ENABLED false is the switch that says this deployment
    // makes none. It was gated on the seat-check flag alone, so with booking off
    // every checkout - and any request carrying the flag - sold and released
    // seats at the airline for a checkout that could only end in
    // BOOKING_DISABLED, counted against the office's look-to-book ratio.
    const seatsChecked = req.body.confirmSeats === true
      && providerStatus().seatCheckBeforePayment
      && providerStatus().bookingEnabled === true;
    if (seatsChecked) {
      await FlightProvider.confirmSeats(pricingResponse.data?.flightOffers?.[0] ?? flightOffer);
    }

    res.json({
      success: true,
      data: pricingResponse.data,
      // Whether the trip crosses a border, from this server's airport index -
      // the one the order route decides a date of birth from. Checkout runs on
      // Vercel, which has no airport index, and asks here instead.
      meta: {
        international: crossesBorder(pricingResponse.data?.flightOffers?.[0] ?? flightOffer),
        // Whether a date of birth is needed for everyone, domestic or not (Secure Flight).
        secureFlight: touchesUnitedStates(pricingResponse.data?.flightOffers?.[0] ?? flightOffer),
        seatsConfirmed: seatsChecked,
        // Whether THIS server would book the offer it just priced.
        //
        // The order route refuses a booking when the flag is off, but it runs
        // after ARC has taken the money, so refusing there means charging the
        // customer and reversing it. Checkout has to ask before the charge -
        // and checkout runs on Vercel, whose environment is not the one that
        // books. Reading its own AMADEUS_WS_BOOKING_ENABLED would be reading
        // the wrong host. So the answer rides back with the price, from the
        // host that would do the booking, exactly as `international` does.
        bookingEnabled: providerStatus().bookingEnabled,
      },
      message: 'Flight priced successfully'
    });

  } catch (error) {
    console.error('❌ Flight pricing error:', error);
    // The airline refusing this fare is not an outage, and a retry cannot fix
    // it. Both used to answer 500, so checkout - which prices through this
    // route on Vercel - told the customer to try again in a moment for ever.
    const fareRefused = isFareRefusal(error);
    // An outage keeps its own 5xx and its Retry-After. A wait for an Amadeus
    // slot (503, retry in 2s) and "too many concurrent requests" were both
    // flattened to a bare 500, so nothing downstream could tell "busy, retry
    // shortly" from a failure.
    const ownStatus = Number(error?.code);
    const status = fareRefused ? 409 : (ownStatus >= 500 && ownStatus <= 599 ? ownStatus : 500);
    if (!fareRefused && Number(error?.retryAfter) > 0) res.set('Retry-After', String(error.retryAfter));
    res.status(status).json({
      success: false,
      error: error.message || 'Failed to price flight',
      ...(fareRefused ? { code: 'FARE_UNAVAILABLE' } : {}),
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

    // "We may not ask" is not "this flight has no other fares".
    //
    // getBrandedFareUpsell soft-fails with `{success:false, reason:'not_available'}`
    // rather than throwing, so the catch below was unreachable and this answered
    // 200 `success:true, data:[]` - indistinguishable from an airline that files
    // a single fare family. The client can only tell the difference if we say so.
    if (upsellResponse?.success === false) {
      return res.json({
        success: true,
        data: [],
        meta: { count: 0, available: false, reason: upsellResponse.reason || 'not_available' },
      });
    }

    // Reuse the standard transform so fare options share the card data shape
    const options = transformAmadeusFlightData(
      upsellResponse.data || [],
      upsellResponse.dictionaries
    );

    res.json({
      success: true,
      data: options,
      meta: { count: options.length, available: true }
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

    // Resolved once, and the same codes key the cache AND go to the search. The
    // key used the curated table ("New York" -> JFK) while the search was sent
    // the raw text and the dataset resolved it ("New York" -> NYC, every New
    // York airport), so Newark and LaGuardia fares were served under the JFK
    // key and the strip quoted prices no JFK flight sells. The search page
    // resolves through the same table, so the strip matches the search it
    // links to.
    const origin = resolveToIATACode(from) || from;
    const destination = resolveToIATACode(to) || to;
    const ws = describeWsConfig();
    const cacheKey = CacheKeys.flightBrowse('date-prices', [
      origin, destination,
      `${adults || 1}-${children || 0}-${infants || 0}-${travelClass || 'any'}`,
      dates.slice().sort().join(','),
      // The strip quotes the cheapest fare of the day, so it has to be built
      // under the same rules as the search it links to. Without this the strip
      // kept advertising a blocked carrier's fare for the life of the cache.
      searchFilterKey({}, ws.unticketableCarriers, ws.interline),
    ]);

    const payload = await withCache(cacheKey, TTL.FLIGHT_CALENDAR, () => FlightProvider.getCalendarPrices({
      from: origin, to: destination, adults, children, infants, travelClass, dates,
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
        // Not rounded: a 75.50 penalty was shown to the customer as 76.
        charges.push({ currency: m[1], amount: parseFloat(m[2].replace(/,/g, '')), index: m.index });
      }

      const changeIdx = penaltyText.search(/CHANGE|REISSUE|REVALIDATION/);
      const cancelIdx = penaltyText.search(/CANCELLATION|CANCEL\b|REFUND/);

      // A fee belongs to its own mention, and stops at the next one.
      //
      // This took the first charge at or after its anchor and never stopped at
      // the following anchor, so filed text ordered
      // "CANCELLATION ... NO SHOW ... CHANGES CHARGE USD 200" gave
      // cancelIdx < changeIdx < charge.index and BOTH fees resolved to the same
      // 200: the panel printed "Cancellation fee: $200" for a fare whose rules
      // never stated one. Since the move to filed rules this scraper reads
      // whole CheckRules sections - ~184 lines for a DEL-BOM fare - so the
      // distance between an anchor and an unrelated charge is far larger than
      // it was.
      const anchors = [changeIdx, cancelIdx].filter((i) => i >= 0).sort((a, b) => a - b);
      const nearest = (anchor) => {
        if (anchor < 0 || charges.length === 0) return null;
        const next = anchors.find((i) => i > anchor);
        const within = charges
          .filter((c) => c.index >= anchor && (next === undefined || c.index < next))
          .sort((a, b) => a.index - b.index)[0];
        return within || null;
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

    // A soft-fail is not a stale offer, and re-pricing cannot cure it.
    //
    // getSeatMaps answers `{success:false, reason:'not_available'}` on this
    // WSAP - the entitlement is out of the IBE project's scope - so the retry
    // below fired on EVERY call and spent a live
    // Fare_InformativePricingWithoutPNR transaction before returning the same
    // empty map. On an unauthenticated endpoint that is a free lever on our
    // GDS quota.
    if (result?.success === false) {
      return res.json({ ...result, meta: { available: false, reason: result.reason || 'not_available' } });
    }

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
  // The record locator the chain reported, kept where the outer catch can see
  // it. `orderResponse` is declared inside the try and is block-scoped, so the
  // catch could only ever learn about a commit from the row - and
  // persistCommittedPnr is allowed to fail. A commit whose persist lost its
  // race therefore read as "never booked" and was refunded automatically.
  let committedPnr = null;
  // Whether the chain got as far as issuing. Hoisted for the same reason as the
  // PNR: `orderResponse` is block-scoped to the try, so the outer catch could
  // only ask the ROW whether a ticket exists - and the row says `false` there,
  // because persistCommittedPnr wrote it at the commit. It therefore passed
  // `ticketed: false` for a booking that had a live ticket, and
  // decideFlightRefund's guard ("the booking records a ticket, but the airline
  // showed none") could never fire for it.
  let committedTicketed = false;
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

    // The payment to reverse, if anything below has to: this booking's own ARC
    // order, read from its row. It was `req.body.orderId`, which nothing checked
    // - the payer proof covers `bookingReference` only - so a customer who paid
    // for one booking could post another booking's order id and have that
    // payment voided or refunded while its PNR stood. The same id is what the
    // booking records as its order, for every later cancel and refund.
    const arcOrderId = existing.booking_details?.order_id || existing.booking_reference;

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
    // Not a PNR the airline confirmed a seat on, while a person is still on it:
    // answered as the review below answers it, not "This booking already
    // exists", which the order page renders as "Your seats are reserved".
    // Found under a later flag too: a refused cancel writes its own on top.
    const awaitingSeat = Boolean(noConfirmedSeatOf(existing));
    // Nor a booking a cancel released and could not record
    // (flagUnrecordedCancellation): the row still reads confirmed and ticketed,
    // and its flag names no voided ticket, so it was answered "Booking
    // Confirmed!" with the void number as its ticket - to a customer told not
    // to try again and to call. Answered as the review below answers it, as it
    // already was with no PNR.
    const unrecordedCancel = Boolean(unrecordedCancellationOf(existing));
    if (existing.booking_details?.pnr && !awaitingSeat && !unrecordedCancel) {
      const details = existing.booking_details;
      // Committed and still working: the request that holds this booking is
      // queueing it and issuing the ticket. Answered as it was before the
      // commit - "already being confirmed" - and with no email. The retry used
      // to send the "reservation held, no ticket yet" email here and record it
      // as the booking's one email, so the confirmation the chain sent a moment
      // later, ticket number and all, was refused as already sent.
      if (liveChainState(details.gds_chain) === 'committed') {
        return res.status(409).json({
          success: false,
          error: 'This booking is already being confirmed. Please wait a moment before trying again.',
          code: 'BOOKING_IN_PROGRESS'
        });
      }
      // Less the tickets a cancel voided. A same-day cancel voids every ticket
      // and then can have PNR_Cancel refused, which leaves the row confirmed
      // with gds.ticketed and its ticket list as they were: read alone, they
      // answered ticketed with the void numbers, and the order page said the
      // ticket had been issued. Ticketed only on a live ticket once any was
      // voided; with none voided, as before (a ticket whose number was not
      // read back is still issued).
      // Or on a ticket whose number was never read back and that the voids do
      // not cover (liveTicketNumbersMissingOf, as the booking reads count it).
      // Two travellers, one number read back and voided, the other's void
      // refused: that was answered "its ticket has been voided", and both pages
      // said "not valid for travel" of a booking with a live ticket.
      const voidedTickets = voidedTicketsOf(existing);
      const voidedDigits = new Set(voidedTickets.map((number) => String(number).replace(/\D/g, '')));
      const tickets = (Array.isArray(details.tickets) ? details.tickets : [])
        .filter((ticket) => !voidedDigits.has(String(ticket?.number ?? '').replace(/\D/g, '')));
      const ticketed = tickets.length > 0 || (details.gds?.ticketed === true
        && (voidedTickets.length === 0 || Boolean(liveTicketNumbersMissingOf(existing))));
      const allVoided = !ticketed && voidedTickets.length > 0;
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
        // The numbers a cancel voided, as the booking reads send them
        // (toClientBooking), for the pages' voided wording.
        voided_tickets: voidedTickets,
        needsReview: Boolean(details.needs_review),
        // What the payment record says, as the 409 retry answers carry it. A
        // held PNR refunded from the Payments tab (payment_status alone) was
        // answered like a paid one, and the order page said its seats were
        // held and its payment received.
        paymentState: paymentStateOf(existing),
        savedToDatabase: true,
        message: ticketed ? 'This booking already exists'
          : allVoided ? 'This booking already exists; its ticket has been voided'
            : 'This booking already exists; its ticket has not been issued yet'
      });
    }

    // A payment already held as a second payment for one trip stays held: a
    // human decides whether to book or refund it (findDuplicateBooking, below).
    if (existing.booking_details?.needs_review?.duplicate_of) {
      // Worded by what the first booking is now: a commit still being checked
      // with the airline is paid for, not booked.
      const first = await findExistingBooking(existing.booking_details.needs_review.duplicate_of);
      return res.status(409).json(duplicatePaymentAnswer(existing.booking_reference, paymentStateOf(existing), {
        firstCommitUnknown: Boolean(first && commitUnknownOf(first)),
      }));
    }

    // A booking whose fulfilment already failed, or that a human is sorting
    // out, is never sent to the airline again. After a failure whose reversal
    // also failed, the row keeps its status and is flagged "charge not
    // reversed" - and a retry of this order (the customer's "Try again")
    // checked only the flag above, so it booked the trip on a payment a person
    // was about to refund. The review flags the success path writes itself
    // (EMAILED_REVIEW_REASONS) describe a booking with a PNR, answered above.
    // Refused before the gateway is asked, and nothing is refunded here.
    const failedBefore = existing.booking_details?.fulfillment_failed;
    const review = existing.booking_details?.needs_review;
    if (failedBefore || unrecordedCancel || (review && !EMAILED_REVIEW_REASONS.has(review.reason))) {
      // Said from the row, not assumed: the order page says "your payment is
      // held ... do not book this trip again" only when this says 'held'.
      const paymentState = paymentStateOf(existing);
      const message = notSentAgainMessage(existing.booking_reference, paymentState, {
        commitUnknown: Boolean(commitUnknownOf(existing)),
      });
      return res.status(409).json({
        success: false,
        code: failedBefore ? 'BOOKING_FAILED' : 'BOOKING_NEEDS_REVIEW',
        needsReview: true,
        bookingReference: existing.booking_reference,
        paymentState,
        error: message,
        message,
      });
    }

    // Was this actually paid for? Ask the gateway, not the row. The row's
    // `total_amount` is what the client asked to be charged, written while the
    // row was still unpaid, and `payment_status` alone can be written by paths
    // that never asked ARC. Reconciling also covers the paid customer whose tab
    // died before the browser-driven reconcile ran.
    //
    // Asked afresh when the row's "paid" is not recent. It was taken as the
    // answer whenever it said paid, and a payment returned without the row
    // hearing of it - a reversal whose booking write failed, a void recorded
    // nowhere, a refund made in the ARC portal - was booked later by the queue,
    // the abandoned-checkout job or a retry: a PNR and a ticket against nothing.
    // The customer's own order, moments after the payment page confirmed the
    // capture, still reads that confirmation.
    const reconciledAt = Date.parse(existing.booking_details?.payment_reconciled_at ?? '');
    const staleReconcile = Number.isFinite(reconciledAt) && Date.now() - reconciledAt > PAYMENT_TRUST_MS;
    const replay = Boolean(req.headers?.['x-booking-queue-replay']);
    payment = await reconcileBookingPayment(existing, { fresh: staleReconcile || replay });
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

    // Every refusal from here to the chain claim reverses the payment, and none
    // asked whether another request held the booking. A retry that failed one
    // of them - a lost traveller, booking switched off - refunded a payment
    // that a running chain went on to commit a PNR against, or that the queue
    // was about to book, or refunded in full what a cancellation was returning
    // less its fee. While anything holds the booking, this request neither
    // refunds nor books; read fresh, because the reconcile above can take a
    // while and the row read at the top can be old by now.
    const heldBy = await bookingHolder(req, existing.booking_reference);
    if (heldBy === 'unavailable') {
      return res.status(503).json({
        success: false,
        error: 'We could not start your booking just now. Your payment is safe - please try again in a minute.',
        code: 'BOOKING_UNAVAILABLE',
        retryable: true
      });
    }
    if (heldBy) {
      return res.status(409).json({
        success: false,
        error: heldBy === 'cancelling'
          ? 'This booking is being cancelled, so it cannot be confirmed.'
          : 'This booking is already being confirmed. Please wait a moment before trying again.',
        code: 'BOOKING_IN_PROGRESS'
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
        orderId: arcOrderId,
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

    // ---- Who is travelling? The people checkout verified. --------------------
    //
    // Checkout checked every traveller against the fare before the card was
    // charged - a printable name, a date of birth, a passport valid to the last
    // flight on a trip abroad - and kept them on this row. This route used to
    // book the `travelers` in its own request body instead, and re-check only
    // names, a gender and a date of birth. A body with the same people and no
    // passports passed, the chain sold and committed a PNR, and the airline
    // would not ticket it without the travel document: a charge, a committed
    // PNR and a refund. A body naming anyone else was booked in their names
    // against this payment. So the row's travellers are booked, rebuilt exactly
    // as the order page and the abandoned-checkout job rebuild them
    // (shared/flightOrderBody.js). The body's are used only for a row that holds
    // none, which no checkout since verification began has written.
    const verifiedTravellers = buildFlightOrderBody(orderDataFromCheckoutRow(existing)).passengerDetails;
    const bodyTravellers = Array.isArray(travelers) ? travelers : (travelers ? [travelers] : []);
    const travelersList = verifiedTravellers.length > 0 ? verifiedTravellers : bodyTravellers;

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
        orderId: arcOrderId,
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
        orderId: arcOrderId,
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
    // A US itinerary needs every traveller's date of birth (Secure Flight).
    const secureFlight = touchesUnitedStates(firstOffer);
    const typesInFareOrder = (firstOffer.travelerPricings || []).map((t) => t.travelerType);
    const travellerIncomplete = travelersList.length === 0 || travelersList.some(
      (t, index) => !String(t?.firstName || '').trim() || !String(t?.lastName || '').trim() || !t?.gender
        || (!t?.dateOfBirth && needsDateOfBirth({ type: t?.ptc || typesInFareOrder[index], international, secureFlight }))
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
        orderId: arcOrderId,
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
    if (!claim.claimed && claim.failed) {
      const message = 'This booking could not be completed and our team is reviewing it, so it was not sent to the airline again. '
        + 'Nothing more has been charged. If you have not heard from us within 2 business days, '
        + `call (877) 538-7380 with booking reference ${req.body.bookingReference}.`;
      return res.status(409).json({
        success: false,
        code: 'BOOKING_FAILED',
        needsReview: true,
        bookingReference: req.body.bookingReference,
        error: message,
        message,
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
      return res.status(409).json(duplicatePaymentAnswer(existing.booking_reference, 'held', {
        firstCommitUnknown: duplicate.firstCommitUnknown,
      }));
    }

    // Prepare flight order data for Amadeus (only if we have valid Amadeus format)
    // The travelers from frontend are already in correct format: { id, firstName, lastName, dateOfBirth, gender }
    // But Amadeus needs name.firstName and name.lastName
    // No invented phone number. A made-up one is the number the airline would
    // call about a schedule change.
    const contactPhones = contactInfo?.phoneNumber
      // The calling code as the customer chose it. It fell back to '1', so a
      // phone sent without one became a US number on the PNR - the one the
      // airline calls about a schedule change. Without a code the number goes
      // as typed.
      ? [{ deviceType: 'MOBILE', ...(contactInfo.countryCode ? { countryCallingCode: String(contactInfo.countryCode).replace(/\D/g, '') } : {}), number: String(contactInfo.phoneNumber) }]
      : [];
    // The PNR's contact email (SSR CTCE): the first address that can be
    // delivered to, in the success path's order. The first one given was taken
    // whatever it held, and the CTCE builder drops an address it cannot write,
    // so a typed "jane@gmailcom" left the PNR with no email contact at all -
    // which some airlines refuse to ticket - while checkout had recorded a good
    // one. The address checkout recorded is the fallback, not a made-up one
    // (the old placeholder was not even this company's domain).
    const contactEmail = [
      contactInfo?.email,
      req.body.customerEmail,
      travelersList[0]?.email,
      existing.booking_details?.customer_email,
    ].find(isUsableEmail);

    const amadeusTravelers = travelersList.map((traveler, idx) => {
      const travelerObj = {
        id: traveler.id || `${idx + 1}`,
        // All validated above: nothing here is filled in.
        dateOfBirth: traveler.dateOfBirth,
        gender: String(traveler.gender).trim().toUpperCase().startsWith('F') ? 'FEMALE' : 'MALE',
        // Checked against the fare above; the chain books each traveller on it.
        ...(traveler.ptc ? { ptc: traveler.ptc } : {}),
        ...(traveler.requiresWheelchair === true ? { requiresWheelchair: true } : {}),
        name: {
          firstName: String(traveler.firstName).trim(),
          lastName: String(traveler.lastName).trim()
        },
        contact: contactInfo ? {
          emailAddress: contactEmail,
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
        orderId: arcOrderId,
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
          emailAddress: contactEmail
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
        secureFlight,
        // What checkout charged for that fare - with the fee, less any coupon.
        // The payment must cover exactly this.
        verifiedChargeTotal: Number.isFinite(Number(verifiedCharge.total)) ? Number(verifiedCharge.total) : undefined,
        // Asked just before the PNR is committed, so a chain that lost its
        // claim stops without selling a second PNR - see holdChainClaim.
        beforeCommit: () => holdChainClaim(req.body.bookingReference, claim.attempt, claim.claimedAt),
        // What ARC actually captured, read back from the gateway by the
        // reconcile above - NOT from this request body, and NOT from the row's
        // total_amount, which is what the client asked to be charged before
        // anyone paid. Lets the chain refuse to ticket an underpaid fare.
        paidAmount: Number.isFinite(payment.capturedAmount) ? payment.capturedAmount : undefined,
        // Called the instant a record locator exists, before queueing or
        // ticketing is attempted. Persisting here is what makes a booking
        // recoverable if the rest of the chain, or this process, dies.
        onCommitted: async ({ pnr, tstRefs, priced }) => {
          // In memory first. Persisting can fail - its failure is logged and
          // swallowed by design - and when it does, this is the only thing
          // between a committed PNR and an automatic reversal.
          committedPnr = pnr || committedPnr;
          await persistCommittedPnr({
            bookingReference: req.body.bookingReference,
            pnr,
            tstRefs,
            priced
          });
        }
      }));
      // The moment the chain reports a ticket, in memory, for the same reason
      // `committedPnr` is set the moment a PNR exists: if anything after this
      // throws, the outer catch is the only thing that knows.
      //
      // `ticketed` only - NOT `tickets.length`. Reading `tickets` here moves
      // where a failure to read it lands: heldForReviewEmail's test makes it a
      // throwing getter precisely to simulate "the chain answered, then reading
      // its answer failed", and touching it turned that 202-held into a 502.
      if (orderResponse?.ticketed === true) committedTicketed = true;

      console.log('✅ Amadeus service call completed:', {
        success: orderResponse?.success,
        mode: orderResponse?.mode,
        hasPnr: !!orderResponse?.pnr
      });
    } catch (providerError) {
      // Stop the heartbeat before anything in here writes.
      //
      // `finally` runs after this whole block, so the heartbeat stayed alive
      // across flagForReview, the coupon note, the held-for-review email and
      // the ARC reversal - every one of them a write. That was harmless while
      // refreshChainClaim ignored committed chains; now that it renews them it
      // spreads a snapshot of booking_details taken BEFORE those writes, and it
      // pins only on gds_chain state and committedAt - neither of which
      // flagForReview touches - so the renewal always wins. The review flag,
      // the Amadeus error text and the ticketing verdict would simply vanish
      // from a booking the airline is holding. Cleared here; the `finally`
      // stays as the catch-all for every other exit.
      clearInterval(heartbeat);
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
          // What the chain knows beyond "not ticketed": an issuance nobody saw
          // answered, and a schedule change it accepted before failing.
          issuance: providerError.issuance,
          scheduleChanged: providerError.scheduleChanged,
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
        // The airline confirmed no seat on at least one flight: the chain's own
        // words, and no email. The generic answer below - "Your seats are
        // reserved ... We will email you as soon as it is issued" - and the
        // Reservation Held email were both false of it, and the server will
        // not issue this ticket. The flag above pages a person, who contacts
        // the customer. Not a 2xx, so no client shows its held-seat screen.
        if (providerError.step === 'segmentStatus') {
          const message = providerError.error
            || 'The airline has not confirmed a seat on every flight - our team will contact you';
          return res.status(409).json({
            success: false,
            code: 'BOOKING_NEEDS_REVIEW',
            needsReview: true,
            bookingReference: req.body.bookingReference,
            pnr: providerError.pnr || null,
            // The gateway confirmed the capture above, and a committed PNR is
            // never refunded here: the money is held against it.
            paymentState: payment?.paid === true ? 'held' : 'unconfirmed',
            error: message,
            message
          });
        }
        // This answer promises an email; it used to send none.
        await sendHeldForReviewEmail(req.body.bookingReference, req.body);
        // "Your seats are reserved" is true when a record locator came back.
        // It is NOT true when the commit itself never answered
        // (`committed: 'unknown'`): we do not know whether the airline holds
        // anything, and saying so would be the kind of promise this route has
        // been cleaned of elsewhere.
        const holdsSeats = Boolean(providerError.pnr);
        return res.status(202).json({
          success: true,
          data: { id: providerError.pnr, pnr: providerError.pnr, status: 'PENDING_CONFIRMATION' },
          pnr: providerError.pnr,
          orderId: providerError.pnr,
          bookingReference: req.body.bookingReference,
          needsReview: true,
          message: holdsSeats
            ? 'Your seats are reserved with the airline and our team is finalising your ticket. '
              + 'We will email you as soon as it is issued.'
            : 'Your payment is safe and our team is checking with the airline whether your booking went '
              + 'through. We will email you either way - please do not book again in the meantime.'
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
        orderId: arcOrderId,
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
      // Let the booking go before refunding it, as the thrown-failure path does.
      // Left at in_progress, the refunded booking read as still being confirmed
      // for the claim's lifetime. Not over a committed PNR, whose state the
      // commit recorded.
      if (!committedPnr) await releaseBookingChain(req.body.bookingReference, 'provider-unsuccessful');
      return await refundOnFulfillmentFailure(res, {
        orderId: arcOrderId,
        bookingReference: req.body.bookingReference,
        amount: totalAmount || amount,
        currency: firstOffer?.price?.currency || 'USD',
        errorMsg
      });
    }

    console.log('✅ Flight order created successfully');

    // PRODUCTION: a "successful" MOCK response means no real ticket was issued — reverse the charge.
    if (process.env.NODE_ENV === 'production' && typeof orderResponse.mode === 'string' && orderResponse.mode.toUpperCase().includes('MOCK')) {
      console.error('❌ Amadeus returned a MOCK booking in production (no real ticket):', orderResponse.mode);
      // Released first, for the same reason as the unsuccessful answer above.
      if (!committedPnr) await releaseBookingChain(req.body.bookingReference, 'mock-in-production');
      return await refundOnFulfillmentFailure(res, {
        orderId: arcOrderId,
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

    // The offer as the airline priced it and the chain booked it. The record
    // was written from the search offer, although pricing deliberately
    // replaces fare basis, class, cabin and checked bags per flight
    // (mappers/pricing.js) - so a 50 LB allowance the airline priced was
    // stored, served and printed as the search's 23 KG. Same flights either
    // way: pricing keeps the itineraries.
    const bookedOffer = pricedOffer || firstOffer;
    // The fare checkout verified and charged for. The search quote was
    // recorded instead - with a fee list that is always empty on a search
    // offer - so a fare that moved before checkout was charged at one figure
    // and recorded at another.
    const chargedFare = verifiedCharge?.pricedFare || {};
    const recordedMoney = (value, fallback) => (Number.isFinite(Number(value)) && value !== null && value !== ''
      ? Number(value).toFixed(2) : (fallback || null));

    // Extract flight details for database from the booked offer
    const firstItinerary = bookedOffer?.itineraries?.[0];
    const firstSegment = firstItinerary?.segments?.[0] || {};
    const lastSegment = firstItinerary?.segments?.[firstItinerary?.segments?.length - 1] || firstSegment;
    const pnrValue = orderResponse.pnr || orderResponse.data?.associatedRecords?.[0]?.reference;
    const orderIdValue = orderResponse.orderId || orderResponse.data?.id;

    // Extract Amadeus enriched fields
    const fareDetails = bookedOffer?.travelerPricings?.[0]?.fareDetailsBySegment?.[0];
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
      orderId: arcOrderId,
      amadeusOrderId: orderIdValue, // the real Amadeus order id (for cancellation)
      // The bank's reference for the payment (ARC's `receipt`), from the
      // reconcile above - what the customer is shown as their transaction id.
      // Not ARC's transaction `id`, which counts within the order and is "1"
      // on every first payment. The body's `transactionId` is ARC's success
      // indicator - the secret that proves who paid - and when absent this
      // used to invent a TXN-<timestamp>.
      transactionId: payment?.arcReceipt || null,
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
      refundable: bookedOffer?._ama?.refundable ?? null,
      baggageDetails: {
        checked: fareDetails?.includedCheckedBags || null,
        cabin: fareDetails?.includedCabinBags || null
      },
      baggage: fareDetails?.includedCheckedBags?.weight
        ? `${fareDetails.includedCheckedBags.weight}${fareDetails.includedCheckedBags.weightUnit || 'kg'}`
        : (fareDetails?.includedCheckedBags?.quantity ? `${fareDetails.includedCheckedBags.quantity} Piece(s)` : null),
      priceBase: recordedMoney(chargedFare.base, bookedOffer?.price?.base),
      priceGrandTotal: recordedMoney(chargedFare.total, bookedOffer?.price?.grandTotal || bookedOffer?.price?.total),
      priceFees: bookedOffer?.price?.fees || [],
      fareBreakdown: fareBreakdown || null,
      // Who was booked: the verified travellers, not the request's list.
      passengerDetails: (verifiedTravellers.length > 0 ? verifiedTravellers : passengerDetails) || amadeusTravelers.map((t) => ({
        id: t.id,
        firstName: t.name.firstName,
        lastName: t.name.lastName,
        dateOfBirth: t.dateOfBirth,
        gender: t.gender
      })),
      flightOffer: bookedOffer,
      // Every leg and flight of the offer booked, return and connections
      // included - the fields above read only the first leg.
      itineraries: itinerariesFromOffer(bookedOffer),
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
        // customer send is skipped and says so. An address that cannot be
        // delivered to is passed over: a signed-in customer's mistyped
        // "jane@gmailcom" was sent the email, and the account's address
        // checkout recorded never got it.
        const finalEmail = [
          contactInfo?.email,
          req.body.customerEmail,
          fallbackTraveler?.email,
          dbBooking.booking_details?.customer_email,
        ].find(isUsableEmail) || '';

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
      transactionId: payment?.arcReceipt || null,
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
      // The row first, then what the chain itself reported. Without the
      // fallback, a commit whose persist failed left this reading no PNR, and
      // the branch below - "the airline holds seats, never refund that
      // automatically" - was skipped for exactly the booking it exists for.
      const pnr = row?.booking_details?.pnr || committedPnr;
      // `row` is null whenever findExistingBooking's read failed - which is
      // precisely when `committedPnr` is carrying the branch - so every read of
      // it here has to be optional. It was not, and the TypeError landed in the
      // recovery catch below: a 500 with no review flag and no held-for-review
      // email, for a booking the airline holds.
      if (pnr && row?.status !== 'cancelled') {
        // A PNR exists: the airline holds seats. Never refund that
        // automatically - a human decides.
        await flagForReview({
          bookingReference: ref,
          pnr,
          reason: `order route failed after commit: ${String(error.message || error).slice(0, 200)}`,
          // `committedTicketed` was declared and never assigned, so this read
          // was permanently false: a booking whose ticket HAD been issued was
          // flagged `ticketed: false`, every surface told the customer they had
          // no ticket, and a later cancel could refund in full against a live
          // one. Now set when the chain reports a ticket, and `error.ticketed`
          // covers a failure inside a post-issuance step.
          ticketed: committedTicketed || error?.ticketed === true
            || row?.booking_details?.gds?.ticketed === true
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
          orderId: row?.booking_details?.order_id || row?.booking_reference || ref,
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
    const { booking: owned, notFound } = await loadOwnedBooking(orderId, req.user);
    if (notFound) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    // Delegate to the orchestrated cancel: it cancels the real Amadeus order (via the
    // stored amadeus_order_id), refunds/voids via ARC Pay, updates booking status, and
    // persists the full cancellation record. Single source of truth — called in-process
    // (no HTTP self-call) so it also works on Vercel serverless.
    let orchestrated = null;
    try {
      // The row whose ownership was just proved, by its own reference - not the
      // path value, which may also match other rows by locator.
      orchestrated = await invokeOrchestratedCancel(owned.booking_reference, 'Customer cancellation via flight order API', req);
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
    let bookingRef = owned.booking_reference;
    if (supabase) {
      try {
        // The owned row, read again for its current state. It used to be looked
        // up afresh by the path value against three columns with no owner and
        // no order, so it could be a different customer's row than the one
        // whose ownership was checked above.
        const { data: bk } = await supabase
          .from('bookings')
          .select('booking_reference, booking_details')
          .eq('id', owned.id)
          .maybeSingle();
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
        // Only the reservation this booking stored. It fell back to the row's
        // order_id and then the path value - both the caller's own choice at
        // checkout - so an owned row saved under a stranger's record locator
        // cancelled that stranger's PNR here. With none stored, nothing is
        // cancelled and the booking is flagged below, as for a failed cancel.
        const amaId = pnrOf(bk);
        if (amaId) {
          try {
            const r = await FlightProvider.cancelFlightOrder(amaId);
            amadeusCancelled = !!r?.success;
          } catch (e) {
            console.warn('⚠️ Fallback Amadeus cancel failed:', e.error || e.message);
          }
        }
      } catch (lookupErr) {
        console.warn('⚠️ Booking lookup for cancellation failed:', lookupErr.message);
      }

      // Marking the row cancelled while the airline still holds the seats is
      // the worst outcome available here: the customer is told they are
      // cancelled, stops expecting a flight, and no refund was issued either.
      // Only record a cancellation the GDS actually confirmed.
      if (!amadeusCancelled) {
        // Kept under the new flag, not replaced: a flag written over another
        // without `previous` erased it for every reader - a PNR with no
        // confirmed seat read "your seats are reserved" again. And marked a
        // failed cancellation, as the orchestrated cancel marks its own, so
        // the alarm and the desk find it on a ticketed booking too: the
        // customer is told below that our team has been alerted.
        await patchBookingDetails(bookingRef, (details) => ({
          needs_review: {
            reason: 'fallback cancel could not reach the GDS; booking may still be live',
            source: 'cancellation',
            cancelFailed: true,
            at: new Date().toISOString(),
            ...(details?.needs_review ? { previous: details.needs_review } : {}),
          }
        }));
        return res.status(502).json({
          success: false,
          error: 'We could not confirm the cancellation with the airline. '
            + 'Our team has been alerted - please call (877) 538-7380 to complete it.',
          amadeusCancelled: false,
          needsReview: true,
          mode: 'FALLBACK_CANCELLATION'
        });
      }

      // A cancellation record, as the orchestrated cancel writes one. The row
      // used to be marked cancelled with nothing else: My Trips could not say
      // what happened to the money, the payment-failure alert never saw a
      // refund owed, and Finish refund refused it as not cancelled with the
      // airline. The airline did cancel; no refund was attempted, so the desk
      // is told to finish it.
      const cancelledAt = new Date().toISOString();
      await patchBookingDetails(bookingRef, {
        cancellation: {
          paymentAction: 'REFUND_UNDER_REVIEW',
          refundAmount: 0,
          cancellationFee: 0,
          amadeusCancelled: true,
          cancelledAt,
          reason: 'fallback cancel: the orchestrated cancel gave no answer, so no refund was attempted',
          source: 'fallback',
        },
      });

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

// Cancel a booking from Manage Booking: a signed-in owner by session, a guest by
// the email the booking was made with.
//
// Manage Booking used to cancel through POST /api/payments?action=cancel-booking.
// That router runs on Vercel, which Amadeus does not allow-list, so every cancel
// of a booking with a PNR failed at the airline step, flagged the booking for
// review and paged Slack - and for a guest it was the only way to cancel. This
// path is under /api/flights, which vercel.json forwards to Lightsail, and it
// runs the same orchestrated handler: the same authorization, the same one
// answer for a signed-out caller who may not cancel, and the same response.
//
// optionalProtect, so a signed-in owner is seen; guestBookingLimiter, so wrong
// emails for one reference are capped exactly as on the payments router.
router.post('/order/:bookingRef/cancel', optionalProtect, guestBookingLimiter, async (req, res) => {
  try {
    const { email, reason } = req.body || {};
    const { statusCode, payload } = await invokeOrchestratedCancel(
      req.params.bookingRef,
      String(reason || '').trim().slice(0, 200) || 'Customer request',
      req,
      { email }
    );
    if (!payload) {
      return res.status(500).json({ success: false, error: 'Failed to cancel booking', message: 'Failed to cancel booking' });
    }
    return res.status(statusCode).json(payload);
  } catch (error) {
    console.error('❌ Manage Booking cancel error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to cancel booking', message: 'Failed to cancel booking' });
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
    const { booking, notFound } = await loadOwnedBooking(orderId, req.user);
    if (notFound) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    // The reservation this booking holds, never the path value. Ownership was
    // proved for a row, and the retrieve used to name whatever the URL named:
    // a row saved under another customer's record locator (a checkout owns the
    // reference it is given) retrieved that customer's PNR for its owner.
    const pnr = pnrOf(booking);
    if (!pnr) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const orderDetails = await FlightProvider.getFlightOrderDetails(pnr);
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
 * A flight checkout the customer opened and never paid for: still `pending`, no
 * payment recorded, nothing sent to the airline, and nobody working on it.
 *
 * Hosted checkout creates the booking row before the customer reaches the
 * payment page, so every abandoned payment page left a row, and My Trips listed
 * each one as a trip. A row with any sign of life - a payment, a PNR, a queued
 * order, a review flag, a cancellation - is kept. A payment captured but not yet
 * reconciled reads as unpaid until the abandoned-checkout job asks the gateway,
 * and shows from then.
 */
export function isAbandonedCheckout(booking) {
  if (booking?.travel_type !== 'flight' || String(booking?.status || '').toLowerCase() !== 'pending') return false;
  const payment = String(booking?.payment_status || '').toLowerCase();
  if (['paid', 'completed', 'partial', 'refunded', 'partially_refunded'].includes(payment)) return false;
  const details = booking.booking_details || {};
  return !details.pnr && !details.queued_order && !details.needs_review && !details.cancellation;
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
    // Only the bank's reference. Older rows hold ARC's per-order count ("1"),
    // a success indicator or an invented TXN-<timestamp> in `transaction_id`.
    transactionId: booking.booking_details?.arc_receipt || null,
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
    // Which of those a cancel voided. A cancel that voids and then has
    // PNR_Cancel refused leaves the list as it was, so the pages called every
    // number on it an issued ticket and printed void numbers on an "E-Ticket".
    // The booking's own list plus every flag's (voidedTicketsOf).
    voided_tickets: voidedTicketsOf(booking),
    // The reason is what the e-ticket reads ("ticket_numbers_not_retrieved").
    // The rest of the record is for the support desk: gateway errors, reversal
    // attempts, the GDS detail.
    //
    // A state an earlier flag set can sit under a later one (flagInForce), and
    // the page sees only this top reason, so it is worked out here and sent by
    // name. Sent as the top reason alone, a PNR with no confirmed seat read
    // "Your seats are reserved" again once a refused cancel flagged it.
    needs_review: booking.booking_details?.needs_review
      ? {
        reason: booking.booking_details.needs_review.reason ?? null,
        no_confirmed_seat: Boolean(noConfirmedSeatOf(booking)),
        // Issued, but the numbers have not reached us: "not issued" was false.
        // Not once a cancel voided those tickets: "issued" was false then.
        ticket_numbers_missing: Boolean(liveTicketNumbersMissingOf(booking)),
        // The airline commit never answered, and nobody has found out since
        // (commitUnknownOf). Read from the reason alone, it was a booking
        // with no PNR like any failed one, and every page said it had failed.
        commit_unknown: Boolean(commitUnknownOf(booking)),
      }
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

    // A checkout opened and never paid for is not a trip (isAbandonedCheckout).
    const transformedBookings = (data || [])
      .filter((row) => !isAbandonedCheckout(row))
      .map((row) => toClientBooking(row));

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

    // The calendar samples one-way fares a few days either side of the date,
    // with no stop or trip-length filter - Fare_MasterPricerCalendar, which
    // could do more, is barred on this WSAP (getCheapestFlightDates). These
    // three were validated into the cache key and then dropped, so a non-stop
    // request was answered with connecting fares as if they were non-stop.
    // Neither app sends them; the one-way question both apps ask is answered.
    const unsupported = nonStop === 'true' ? 'non-stop flights'
      : duration ? 'trip length'
        : oneWay === 'false' ? 'round trips'
          : null;
    if (unsupported) {
      return res.status(400).json({
        success: false,
        error: `The cheapest-dates calendar cannot filter by ${unsupported}; it samples one-way fares only.`,
      });
    }

    console.log(`💰 Cheapest dates: ${origin} → ${destination}`);
    const ws = describeWsConfig();
    const cacheKey = CacheKeys.flightBrowse('cheapest-dates', [
      origin, destination, departureDate, viewBy || 'DATE',
      // The cheapest day is quoted under the rules search sells by. Without
      // this a carrier just added to AMADEUS_WS_UNTICKETABLE_CARRIERS - or an
      // interline pair just blocked - was advertised for the twelve hours of
      // the cache. See /date-prices.
      searchFilterKey({}, ws.unticketableCarriers, ws.interline),
    ]);
    const result = await withCache(cacheKey, TTL.FLIGHT_BROWSE, async () => {
      const r = await FlightProvider.getCheapestFlightDates(origin, destination, {
        departureDate,
        oneWay: true,
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

    // Resolved once and used for both the key and the search, as /date-prices
    // does and for the same reason: the key read "New York" as JFK while the
    // search read it as NYC.
    const from = resolveToIATACode(origin) || origin;
    const to = resolveToIATACode(destination) || destination;
    const ws = describeWsConfig();

    // Redis-backed, replacing an in-process Map that was per-instance and lost
    // on every restart - and on Vercel, on every cold start.
    const cacheKey = CacheKeys.flightBrowse('calendar-prices', [
      from, to, dates.slice().sort().join(','),
      // The cheapest fare of the day, under the rules search sells by: without
      // this a carrier or interline pair just blocked went on being quoted for
      // the life of the cache. See /date-prices.
      searchFilterKey({}, ws.unticketableCarriers, ws.interline),
    ]);

    const payload = await withCache(cacheKey, TTL.FLIGHT_CALENDAR, () => FlightProvider.getCalendarPrices({
      from, to, adults: 1, dates,
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
        // Details for the expandable view, with the secrets taken out.
        bookingDetails: adminSafeDetails(booking.booking_details),
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
/**
 * `booking_details` with the things nobody needs in a browser taken out.
 *
 * The admin panel received this column raw, and it carries `success_indicator`
 * - the secret `provesPayer` accepts as proof of payment on POST /order and the
 * cancel routes - along with `pending_booking_data`, which is the entire
 * checkout body including passport numbers, and the GDS session. Anyone holding
 * an admin token, or any XSS in the panel, could confirm or reverse arbitrary
 * orders with it. `handleGetPendingBooking` and `toClientBooking` already
 * refuse to hand it out; this path had not caught up.
 *
 * Named removals rather than an allow-list: the panel's expandable view shows
 * whatever a booking happens to carry, and an allow-list here would quietly
 * blank fields staff rely on.
 */
function adminSafeDetails(details) {
  if (!details || typeof details !== 'object') return details;
  const {
    success_indicator: _indicator,
    pending_booking_data: _pending,
    queued_order: _queued,
    gds_session: _session,
    ...safe
  } = details;
  return safe;
}

/**
 * The part of a search that changes the answer but was not in the cache key.
 *
 * The airline filters are accepted, forwarded, and genuinely change the Amadeus
 * request (carrierQualifier M/X) - and were absent from the key, with a five
 * minute TTL. So a BA-only search poisoned the next unfiltered search of the
 * same route and dates, which then silently missed every other carrier;
 * reversed, the filter appeared to do nothing at all. The blocked-carrier list
 * is here for the same reason: for five minutes after that setting changes, a
 * key that cannot see it keeps serving results built under the old one.
 */
export function searchFilterKey(params = {}, unticketable = [], interline = {}) {
  return [
    [].concat(params.includedAirlineCodes || []).filter(Boolean).join('+') || 'any',
    [].concat(params.excludedAirlineCodes || []).filter(Boolean).join('+') || 'none',
    params.maxPrice || 'nomax',
    [].concat(unticketable || []).join('') || 'none',
    // The interline policy decides which offers exist at all, so a cached
    // answer built under the old one must not be served under the new. Seen in
    // a browser: after B6-LH was blocked, the date strip went on advertising
    // its fare - the cheapest on the day, and one we would no longer sell -
    // because the calendar's key did not know the policy had changed.
    interline?.blockAll ? 'noIL' : ([].concat(interline?.blocked || []).join('+') || 'allIL'),
  ].join('|');
}

function normalizeBookingRow(b) {
  const amount = b.total_amount || b.booking_details?.amount || b.booking_details?.flight_offer?.price?.total || 0;
  let customerName = 'N/A', customerEmail = '', customerPhone = '';
  if (Array.isArray(b.passenger_details) && b.passenger_details.length) {
    const p = b.passenger_details[0];
    customerName = `${p.firstName || p.first_name || ''} ${p.lastName || p.last_name || ''}`.trim() || 'N/A';
    customerEmail = p.email || '';
    // Checkout stores the number the customer gave as `mobile`; the desk could
    // see an email address and no way to ring anybody.
    customerPhone = p.mobile || p.phone || p.phoneNumber || '';
  } else if (b.booking_details?.guest_info) {
    const g = b.booking_details.guest_info;
    customerName = `${g.firstName || g.first_name || ''} ${g.lastName || g.last_name || ''}`.trim() || customerName;
    customerEmail = g.email || '';
  } else if (b.booking_details?.contact?.email) {
    customerEmail = b.booking_details.contact.email;
  }
  // The address checkout actually charged and emails, when the traveller form
  // left its optional email box empty.
  customerEmail = customerEmail || b.booking_details?.customer_email || '';
  customerPhone = customerPhone || b.booking_details?.contact?.phone || '';
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
    bookingDate: b.created_at, customerName, customerEmail, customerPhone,
    service,
    bookingDetails: adminSafeDetails(d), passengerDetails: b.passenger_details, isPackage: false,
    arcOrderId: d.arc_order_id || d.order_id || b.booking_reference,
    // The desk's own fields. The panel showed a "PNR:" line this row never
    // carried, and never showed why a booking was flagged or which tickets a
    // cancelled one still has to claim back - all of which Slack had named.
    pnr: d.pnr || null,
    ticketed: isTicketed(d),
    ticketNumbers: ticketsOf(d).map((ticket) => ticket.number),
    attention: attentionOf(b),
    reviewResolution: reviewResolution(b),
    // The airline commit never answered (commitUnknownOf): the desk resolves
    // it with what the airline said, and a record locator if it holds it
    // (resolve-review).
    commitUnknown: Boolean(commitUnknownOf(b)),
    // Being booked, waiting in the queue, or being cancelled right now
    // (utils/bookingChainClaim.js). The panel hides Void for such a booking, as
    // the server refuses it; worked out here, where the claim's lifetime is known.
    bookingBusy: Boolean(liveChainState(d.gds_chain)) || Boolean(d.queued_order && !d.pnr),
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
router.get('/admin-bookings-all', protect, bookingStaff, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ success: false, error: 'Database not configured' });
    const { type, status, payment_status, search, attention, page = 1, limit = 50 } = req.query;

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
    // The Slack queue, as a list. `attention=open` is what the support page
    // opens on; `attention=handled` is what the desk has already dealt with.
    if (attention === 'open') rows = rows.filter((b) => b.attention);
    if (attention === 'handled') rows = rows.filter((b) => b.reviewResolution);
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
//
// This wrote whatever status it was sent. Marking a paid flight with a PNR
// cancelled released nothing, refunded nothing, and then hid it from Cancel &
// Refund, from Void and from both alarms; marking an unticketed reservation
// confirmed told the customer it was ticketed. A status set by hand now has to
// describe the booking (shared/bookingStatusChange.js), and cancelling anything
// that holds seats or money goes through Cancel & Refund.
router.put('/admin-bookings/:id', protect, bookingStaff, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    const { id } = req.params;
    const { status, payment_status, notes } = req.body || {};

    // What happened to the money is written by whatever moved it - Cancel &
    // Refund, Void, Finish refund, the gateway reconcile. A typed `refunded`
    // silenced the failed-refund alarm with nothing returned.
    if (payment_status !== undefined) {
      const text = 'The payment status follows what the payment gateway did, so it cannot be set by hand. '
        + 'Use Cancel & Refund, Void or Finish refund.';
      return res.status(400).json({ success: false, code: 'PAYMENT_STATUS_READ_ONLY', error: text, message: text });
    }

    const { data: booking, error: readError } = await supabase.from('bookings').select('*').eq('id', id).single();
    if (readError && readError.code !== 'PGRST116') {
      return res.status(500).json({ success: false, error: 'Could not read the booking' });
    }
    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    const changesStatus = Boolean(status) && status !== booking.status;
    if (changesStatus) {
      const details = booking.booking_details || {};
      const problem = statusChangeRefusal({
        type: booking.travel_type,
        status: booking.status,
        paymentStatus: booking.payment_status,
        details,
        busy: Boolean(liveChainState(details.gds_chain)) || Boolean(details.queued_order && !details.pnr),
      }, status);
      if (problem) {
        return res.status(problem.httpStatus).json({ success: false, code: problem.code, error: problem.message, message: problem.message });
      }
    }

    const updateData = {};
    if (changesStatus) updateData.status = status;
    if (notes) updateData.admin_notes = notes;
    updateData.updated_at = new Date().toISOString();

    let update = supabase
      .from('bookings')
      .update(updateData)
      .eq('id', id);
    // Conditioned on the status the decision was made from, so a cancellation
    // or a booking chain that lands in between is not overwritten.
    if (changesStatus) update = update.eq('status', booking.status);
    const { data, error } = await update.select().single();

    if (error?.code === 'PGRST116') {
      const text = 'This booking changed while you were editing it. Nothing has been changed; refresh it and try again.';
      return res.status(409).json({ success: false, code: 'BOOKING_CHANGED', error: text, message: text });
    }
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
router.post('/admin-bookings/:id/cancel', protect, bookingStaff, async (req, res) => {
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
router.post('/admin-bookings/:id/refund', protect, bookingStaff, async (req, res) => {
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

/** What the desk found out about a commit the airline never answered. */
const COMMIT_OUTCOMES = ['not_held', 'held'];

const refuseResolve = (res, status, code, text) => res.status(status).json({ success: false, code, error: text, message: text });

/** What the desk is told when its write lost a race (unchangedSince matched nothing). */
const BOOKING_CHANGED_TEXT = 'This booking changed while you were recording it. Nothing has been recorded; reload it and try again.';

/**
 * The desk found the airline holds a booking whose commit never answered:
 * write its record locator on the row as the chain records a commit
 * (persistCommittedPnr, then flagForReview on a stopped chain) - the locator,
 * not ticketed, the chain finished, pending ticketing - so it reads as held,
 * counts as booked for the duplicate check, and is followed up like any paid
 * reservation that was never ticketed: the desk list and the alarm show it
 * under the flag they give such a booking (UNTICKETED_REVIEW_REASON), and
 * ticket sync reads its ticket once it is issued by hand. What the desk found
 * is kept under that flag, resolved.
 *
 * Written only onto the row as read (unchangedSince), in one update with the
 * status: a cancel or anything else that landed in between makes it match
 * nothing, and nothing is written.
 *
 * @returns {Promise<{ pnr: string } | { refused: true, status: number, code: string, text: string }>}
 */
async function recordHeldAtAirline(booking, { note, at, by, pnr: given }) {
  const refused = (status, code, text) => ({ refused: true, status, code, text });
  const details = booking.booking_details || {};
  if (details.pnr) {
    return refused(409, 'HELD_NOT_ALLOWED', `This booking already has a record locator (${details.pnr}), so there is nothing to record as held.`);
  }
  if (!commitUnknownOf(booking)) {
    return refused(409, 'HELD_NOT_ALLOWED', 'Only a booking whose airline commit never answered can be recorded as held here.');
  }
  if (['cancelled', 'refunded'].includes(String(booking.status || '').toLowerCase())
    || ['refunded', 'partially_refunded', 'reversed'].includes(String(booking.payment_status || '').toLowerCase())) {
    return refused(409, 'HELD_NOT_ALLOWED', 'This booking has been cancelled or refunded, so it cannot be recorded as held. '
      + 'If the airline holds a reservation for it, cancel that reservation with the airline, then record it as not held with what you did.');
  }
  const pnr = String(given ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(pnr)) {
    return refused(400, 'PNR_INVALID', 'A record locator is 6 letters and digits, like ABC123.');
  }
  if (liveChainState(details.gds_chain)) {
    return refused(409, 'BOOKING_BUSY', 'This booking is being booked or cancelled right now. Nothing has been recorded; please try again in a few minutes.');
  }
  // Another booking's locator, typed by mistake, would have ticket sync read
  // that customer's tickets onto this booking and email them to this customer.
  const { data: others, error: lookupError } = await supabase
    .from('bookings').select('booking_reference').eq('booking_details->>pnr', pnr).limit(1);
  if (lookupError) return refused(500, 'LOOKUP_FAILED', 'Could not check the record locator. Nothing has been recorded; please try again.');
  if (others?.length) {
    return refused(409, 'PNR_IN_USE', `Record locator ${pnr} is already on booking ${others[0].booking_reference}, so it was not recorded on this one. `
      + 'Check the locator with the airline.');
  }

  const { data: written, error } = await unchangedSince(
    supabase
      .from('bookings')
      .update({
        status: 'pending_ticketing',
        booking_details: {
          ...details,
          pnr,
          amadeus_order_id: pnr,
          gds: { ...(details.gds || {}), ticketed: false },
          gds_chain: { ...(details.gds_chain || {}), state: 'finished', finishedAt: at },
          needs_review: {
            reason: UNTICKETED_REVIEW_REASON,
            ticketed: false,
            at,
            previous: { ...details.needs_review, resolved_at: at, resolved_by: by, resolution: note, outcome: 'held', pnr },
          },
        },
        updated_at: at,
      })
      .eq('id', booking.id),
    booking,
  ).select('id');
  if (error) return refused(500, 'WRITE_FAILED', 'Could not record it. Nothing has been recorded; please try again.');
  if (!written?.length) return refused(409, 'BOOKING_CHANGED', BOOKING_CHANGED_TEXT);
  return { pnr };
}

/**
 * POST /api/flights/admin-bookings/:id/resolve-review — "I have dealt with this".
 *
 * The alarms announce a booking once and stamp `alerted_at`; nothing ever took
 * the flag off again, so a booking someone had already ticketed by hand looked
 * exactly like one nobody had touched, for ever. This records who dealt with it,
 * when, and what they did, and takes it out of the desk's queue.
 *
 * It changes no money and no booking status: those have their own routes, which
 * write their own records. A booking with nothing to resolve is refused rather
 * than silently stamped.
 */
router.post('/admin-bookings/:id/resolve-review', protect, bookingStaff, async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ success: false, error: 'Database not configured' });

    const note = String(req.body?.note ?? '').trim();
    if (!note) {
      const text = 'Please say what you did, so the next person knows.';
      return res.status(400).json({ success: false, code: 'NOTE_REQUIRED', error: text, message: text });
    }

    const { data: booking, error: readError } = await supabase
      .from('bookings').select('*').eq('id', req.params.id).single();
    if (readError && readError.code !== 'PGRST116') {
      return res.status(500).json({ success: false, error: 'Could not read the booking' });
    }
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });

    const details = booking.booking_details || {};
    if (details.needs_review?.resolved_at) {
      const text = 'This booking was already marked as handled.';
      return res.status(409).json({ success: false, code: 'ALREADY_RESOLVED', error: text, message: text });
    }
    if (!attentionOf(booking)) {
      const text = 'There is nothing to handle on this booking.';
      return res.status(409).json({ success: false, code: 'NOTHING_TO_RESOLVE', error: text, message: text });
    }

    const at = new Date().toISOString();
    const by = req.user?.email || req.user?.id || 'staff';

    // A commit the airline never answered (commitUnknownOf) is resolved with
    // what the airline said. "Handled" alone read as "did not go through" on
    // every page and to the duplicate check - false whenever the airline did
    // hold it, and the record locator the desk had just been given was
    // written nowhere, so nothing could ticket it.
    const commitUnknown = Boolean(commitUnknownOf(booking));
    const outcome = req.body?.outcome ?? null;
    if (commitUnknown && !COMMIT_OUTCOMES.includes(outcome)) {
      return refuseResolve(res, 400, 'OUTCOME_REQUIRED',
        'Say what the airline told you: that it does not hold this booking, or that it does, with its record locator.');
    }
    if (outcome === 'held') {
      const held = await recordHeldAtAirline(booking, { note, at, by, pnr: req.body?.pnr });
      if (held.refused) return refuseResolve(res, held.status, held.code, held.text);
      console.log('✅ Commit that never answered recorded as held by the desk:', { reference: booking.booking_reference, pnr: held.pnr, by });
      // The customer was told "we will email you either way", and nothing
      // did: the booking now owes the email any paid reservation gets
      // (confirmationEmailOwed), which only a reload of the order page or the
      // e-ticket much later would have sent. Sent here, read back from the row
      // as written, through the confirmation's own claim, so a reload cannot
      // send it again. Its first chance to email, so it fails open like the
      // success path's first send. Never throws.
      const email = await sendOwedConfirmation(booking.booking_reference);
      return res.json({
        success: true, resolvedAt: at, resolvedBy: by, note, outcome: 'held', pnr: held.pnr, emailed: email.sent === true,
        message: `Recorded as held at the airline under ${held.pnr}. It now waits to be ticketed.`,
      });
    }

    // Pinned to the row as read (unchangedSince), as recordHeldAtAirline is.
    // The whole column is written back from the copy read above, and filtered
    // by id alone it put back anything written in between: a "held" recorded
    // by someone else a moment earlier lost its record locator, and the
    // booking was left pending_ticketing with no PNR; a ticket that ticket
    // sync had just recorded was lost the same way.
    const { data: written, error } = await unchangedSince(
      supabase
        .from('bookings')
        .update({
          booking_details: {
            ...details,
            // Created when it is missing: the alarm names paid-but-not-ticketed
            // bookings that were never flagged, and those need a record too.
            needs_review: {
              ...(details.needs_review || { reason: 'PNR committed, never ticketed', ticketed: false, at }),
              resolved_at: at,
              resolved_by: by,
              resolution: note,
              ...(commitUnknown ? { outcome: 'not_held' } : {}),
            },
          },
          updated_at: at,
        })
        .eq('id', booking.id),
      booking,
    ).select('id');

    if (error) return res.status(500).json({ success: false, error: 'Could not record it' });
    if (!written?.length) return refuseResolve(res, 409, 'BOOKING_CHANGED', BOOKING_CHANGED_TEXT);

    console.log('✅ Booking marked handled by the desk:', { reference: booking.booking_reference, by });
    return res.json({ success: true, resolvedAt: at, resolvedBy: by, note, message: 'Marked as handled' });
  } catch (error) {
    console.error('❌ Resolve review error:', errorSummary(error));
    return res.status(500).json({ success: false, error: 'Could not record it' });
  }
});

export default router;
