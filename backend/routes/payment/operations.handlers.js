import axios from 'axios';
import fetch from 'node-fetch';
import FlightProvider from '../../services/flightProvider.js';
import { supabase, ARC_PAY_CONFIG, getArcPayAuthConfig } from './arcpay.config.js';
import { getCaller, requireAdmin } from './agents.handlers.js';
import { isBookingStaff } from '../../../shared/staffRoles.js';

/**
 * Gate: the booking desk — admin, super admin or support.
 *
 * Refunds and voids are how support settles a customer's money, so these three
 * handlers ask for the desk rather than for `admin` (shared/staffRoles.js).
 * Everything else an admin can do still asks `requireAdmin`.
 */
async function requireBookingStaff(req, res) {
    const caller = await getCaller(req);
    if (!isBookingStaff(caller?.role) && !isBookingStaff(req.user?.role)) {
        res.status(403).json({ success: false, error: 'Not authorized.' });
        return false;
    }
    return true;
}
import { arcSucceeded, arcFailureSummary } from './payment.helpers.js';
import { resolveBookingUserId } from '../../utils/bookingOwner.js';
import { emailIsBookers, hasBookingOwner, isBookingOwner } from '../../utils/bookingAccess.js';
import { liveChainState } from '../../utils/bookingChainClaim.js';
import { canReachAmadeus } from '../../utils/amadeusReach.js';
import { unchangedSince } from '../../utils/bookingDetailsGuard.js';
import { DEFAULT_PRICE_SETTINGS } from '../../config/priceDefaults.js';
import { cancellationMessage, refundOutcome } from '../../../shared/cancellationOutcome.js';
import {
    ISSUANCE_UNKNOWN, commitUnknownOf, decidedFeeOf, flagInForce, needsAirlineRefundClaim, refundOwedOf, ticketNumbersMissingOf,
} from '../../../shared/reviewQueue.js';
import { reconcileBookingPayment } from './checkout.handlers.js';
import { errorSummary } from '../../utils/errorSummary.js';
import { orderVoided, voidsPayment } from '../../utils/arcTransactions.js';

const sanitizeRef = (v) => String(v ?? '').replace(/[^A-Za-z0-9_-]/g, '') || '__none__';


// ============================================
// CANCEL BOOKING - Orchestrated cancellation
// (Kept in sync with /api/payments.js per PAYMENT_SYSTEM_ARCHITECTURE.txt)
// ============================================
/**
 * One answer for a signed-out caller who may not cancel: no such booking, a
 * guest booking with another email, or a booking that belongs to an account.
 * Those used to answer 404, 403 and LOGIN_REQUIRED - so a reference alone told
 * a stranger whether a booking existed, and whether it was a guest's. The guest
 * lookup limiter counts each of these as a failed attempt.
 */
const refuseSignedOutCaller = (res) => res.status(404).json({
    success: false,
    code: 'BOOKING_NOT_FOUND',
    error: 'We could not find a booking with that reference and email. If you booked while logged in, please log in and try again.',
});

export async function handleCancelBookingAction(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        console.log('🚫 Handling CANCEL-BOOKING operation (Express)');

        const {
            bookingReference,
            email,
            reason = 'Customer request'
        } = req.body;

        if (!bookingReference) {
            return res.status(400).json({
                success: false,
                error: 'bookingReference is required'
            });
        }

        // 1. Look up booking in Supabase
        let booking = null;

        const { data: byRef } = await supabase
            .from('bookings')
            .select('*')
            .eq('booking_reference', bookingReference)
            .single();

        if (byRef) {
            booking = byRef;
        } else {
            // Fall back through the other identifiers a caller might legitimately
            // hold. DELETE /flights/order/:orderId is documented as taking the
            // Amadeus order id, which in this integration IS the record locator -
            // so a cancel by PNR is a normal request, not a malformed one.
            //
            // Without the pnr/amadeus_order_id lookups this returned "Booking not
            // found", and the route quietly fell through to a fallback that
            // cancels at the GDS but never issues the ARC refund. The customer
            // would lose the seat and keep paying for it.
            for (const field of ['order_id', 'pnr', 'amadeus_order_id']) {
                const { data: found } = await supabase
                    .from('bookings')
                    .select('*')
                    .filter(`booking_details->>${field}`, 'eq', bookingReference)
                    .limit(1)
                    .maybeSingle();
                if (found) { booking = found; break; }
            }
        }

        if (!booking) {
            if (!resolveBookingUserId(req)) return refuseSignedOutCaller(res);
            return res.status(404).json({ success: false, error: 'Booking not found' });
        }

        // AUTHORIZATION, before anything about the booking is disclosed. Cancelling
        // releases the seat and moves money:
        //  - staff (admin/superadmin) may cancel any booking;
        //  - a booking that belongs to an account is cancelled by that account,
        //    signed in - an email alone is not enough to cancel someone's trip;
        //  - a booking made as a guest (no owner) by the email of whoever booked
        //    it - the one checkout recorded, or the contact's. A traveller's
        //    address opens the booking in Manage Booking but does not cancel it:
        //    it is whatever the booker typed for that traveller, and a cancel
        //    releases every seat and refunds the booker's card.
        //
        // This compared the request email with `booking.customer_email`, a column
        // the bookings table does not have - checkout writes the address into
        // booking_details - so every customer cancel was refused, signed in or
        // not. The in-process callers (My Trips' DELETE /flights/order and the
        // admin panel) passed no email and no session at all. The other cancel
        // tests' fixtures had the column, which is how it shipped.
        const caller = await getCaller(req);
        const isStaff = [caller?.role, req.user?.role].some(isBookingStaff);
        if (!isStaff) {
            const sessionUserId = resolveBookingUserId(req);
            const owned = hasBookingOwner(booking);
            const allowed = owned ? isBookingOwner(sessionUserId, booking) : emailIsBookers(email, booking);
            if (!allowed) {
                if (!sessionUserId) return refuseSignedOutCaller(res);
                return res.status(403).json({
                    success: false,
                    code: 'NOT_AUTHORIZED',
                    error: owned
                        ? 'Not authorized to cancel this booking'
                        : 'To cancel a booking made without an account, use the email address it was booked with.'
                });
            }
        }

        if (booking.status === 'cancelled') {
            return res.status(400).json({
                success: false,
                error: 'Booking is already cancelled',
                booking: { id: booking.id, reference: booking.booking_reference, status: booking.status }
            });
        }

        console.log('📋 Booking found:', booking.id, 'Status:', booking.status);

        // A row with no travel type predates the column; the supplier cancel has
        // always treated one as a flight.
        const type = booking.travel_type;
        if (type === 'flight' || type == null) {
            // The airline commit never answered (commitUnknownOf): there is no
            // PNR, and nobody knows yet whether the airline holds a
            // reservation. The cancel below would call no airline, reverse the
            // whole payment and mark the booking cancelled - and a cancelled
            // booking leaves the duplicate check, while the airline may still
            // hold it. Every customer cancel comes here (Manage Booking, My
            // Trips, DELETE /flights/order, the payments router); staff go on
            // as before, and the desk keeps the booking (attentionOf).
            if (!isStaff && commitUnknownOf(booking)) {
                const text = 'Our team is checking with the airline whether this booking went through, so it cannot be cancelled online yet. '
                    + 'Nothing has been cancelled or refunded. '
                    + `To cancel it, please call (877) 538-7380 with booking reference ${booking.booking_reference}.`;
                return refuse(res, 409, 'BOOKING_BEING_CHECKED', text, { bookingReference: booking.booking_reference });
            }
            // A reservation is released at the airline, and only Lightsail can
            // reach Amadeus. Manage Booking's cancel came here through the
            // payments router, which runs on Vercel: every cancel of a booking
            // with a PNR ended "could not cancel with the airline", flagged the
            // booking for review and paged Slack, and a guest had no other way
            // to cancel. It is refused here before anything is claimed or
            // written; the flights API (POST /api/flights/order/:ref/cancel)
            // runs this same handler where the airline answers. Asked after the
            // authorization above, so a stranger learns nothing new.
            const reservation = booking.booking_details?.pnr || booking.booking_details?.amadeus_order_id;
            if (reservation && !canReachAmadeus()) {
                const text = 'We could not start the cancellation from here. Nothing has been cancelled or refunded. '
                    + 'Please call (877) 538-7380 and we will cancel it for you.';
                return refuse(res, 409, 'CANCEL_VIA_FLIGHTS_API', text, {
                    bookingReference: booking.booking_reference,
                    cancelEndpoint: `/api/flights/order/${encodeURIComponent(booking.booking_reference)}/cancel`,
                });
            }
            return await cancelFlightBooking(res, booking, { reason, email });
        }
        return await cancelOtherBooking(res, booking, { reason, email });
    } catch (error) {
        console.error('❌ Cancel booking error:', errorSummary(error));
        return res.status(500).json({ success: false, error: 'Failed to cancel booking' });
    }
}

/** A refusal that moved nothing, in the shape both clients read: the site reads `error`, the app `message`. */
const refuse = (res, status, code, text, extra = {}) => res.status(status).json({
    success: false,
    code,
    error: text,
    message: text,
    ...extra,
});

const CANCEL_IN_PROGRESS_TEXT = 'This booking is already being cancelled. Refresh in a minute to see what happened to your payment.';
const STILL_BOOKING_TEXT = 'This booking is still being confirmed with the airline, so it cannot be cancelled yet. '
    + 'Nothing has been cancelled or refunded. Please try again in a few minutes.';

/** The row's booking_details as they are now, or null when they cannot be read. */
async function readBookingDetails(id) {
    try {
        const { data } = await supabase.from('bookings').select('booking_details').eq('id', id).single();
        return data?.booking_details || null;
    } catch {
        return null;
    }
}

/**
 * The admin-configured cancellation fee, from a `price_settings.settings` object.
 *
 * This was `settings.cancellation_fee || 50`, and zero is falsy: an admin who
 * set the fee to 0 still had 50 taken from every refund. Only a missing or
 * unusable value falls back to the default, which is the one the admin panel
 * shows (config/priceDefaults.js).
 */
export function cancellationFeeFrom(settings) {
    const raw = settings?.cancellation_fee;
    if (raw === null || raw === undefined || raw === '') return DEFAULT_PRICE_SETTINGS.cancellation_fee;
    const fee = Number(raw);
    return Number.isFinite(fee) && fee >= 0 ? fee : DEFAULT_PRICE_SETTINGS.cancellation_fee;
}

async function readCancellationFee() {
    try {
        const { data: priceSettings } = await supabase
            .from('price_settings')
            .select('settings')
            .single();
        return cancellationFeeFrom(priceSettings?.settings);
    } catch (error) {
        console.warn('Could not fetch cancellation fee, using default:', error.message);
        return DEFAULT_PRICE_SETTINGS.cancellation_fee;
    }
}

/**
 * Take the booking for this cancellation, or learn that someone else has it.
 *
 * Two cancel requests for one booking - a double-click, the app and the site at
 * once, a retry while the first is still waiting on ARC - both read "not
 * cancelled", and both went on to cancel at the airline and refund. With a fee
 * withheld, two partial refunds can together return more than was owed, and
 * the gateway accepts both.
 *
 * One conditional UPDATE decides, the same compare-and-set as the booking
 * chain's claim (flight.routes.js claimBookingChain) and on the same stamp,
 * `gds_chain.startedAt`, so a cancellation and a chain can never both hold the
 * booking either. The json paths go in `.eq` / `.is` and never inside `.or()`:
 * PostgREST rejects arrow paths inside `or` on an UPDATE, and a claim that
 * errors is a claim nobody holds.
 */
async function claimCancellation(booking, { requireNoReservation = false } = {}) {
    const details = booking.booking_details || {};
    const prior = details.gds_chain || null;
    const priorStamp = prior?.startedAt ?? null;
    const stamp = new Date().toISOString();
    const claimed = {
        ...details,
        gds_chain: { ...(prior || {}), state: 'cancelling', startedAt: stamp, stateBeforeCancel: prior?.state ?? null },
    };

    let update = supabase
        .from('bookings')
        .update({ booking_details: claimed, updated_at: stamp })
        .eq('id', booking.id);
    update = priorStamp === null
        ? update.is('booking_details->gds_chain->>startedAt', null)
        : update.eq('booking_details->gds_chain->>startedAt', priorStamp);
    // A payment void releases nothing at the airline, so it may only take a
    // booking that still has no reservation. A chain that committed a PNR since
    // the booking was read leaves no stamp behind (persistCommittedPnr), which
    // the stamp condition alone would take for "never claimed".
    if (requireNoReservation) update = update.is('booking_details->>pnr', null);

    const { data, error } = await update.select('id');
    if (error) {
        // Fails closed. Nobody knows who holds the booking, and a refund issued
        // on a guess is the double refund this exists to stop.
        console.error('⚠️ Could not take the cancellation claim:', error.message);
        return { claimed: false, error };
    }
    if (!data?.length) return { claimed: false };
    return { claimed: true, stamp, prior, details: claimed };
}

/**
 * Leave a review flag on a booking whose cancellation was carried out - seats
 * released, money moved - but whose record could not be written.
 *
 * That write is pinned to the cancellation's claim, and when another request
 * had taken the booking in the meantime it matched nothing: the booking kept
 * reading as it did before, with no cancellation record and no flag, so
 * neither alarm and not the admin list could find it. The only record was a
 * console line. This flag is written on top of whatever the booking now holds,
 * pinned to that (utils/bookingDetailsGuard.js) so it undoes nobody's write.
 * `tickets` are the ones still to be claimed from the airline, as the
 * cancellation's own review lists them, which is what makes a ticketed booking
 * announced. Returns whether the flag was written.
 */
async function flagUnrecordedCancellation(bookingId, review) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const { data: row, error: readError } = await supabase
            .from('bookings')
            .select('status, payment_status, booking_details')
            .eq('id', bookingId)
            .single();
        if (readError || !row) return false;
        const details = row.booking_details || {};
        const { data: wrote, error: writeError } = await unchangedSince(
            supabase
                .from('bookings')
                .update({
                    booking_details: {
                        ...details,
                        needs_review: { ...review, ...(details.needs_review ? { previous: details.needs_review } : {}) },
                    },
                })
                .eq('id', bookingId),
            row,
        ).select('id');
        if (writeError) return false;
        if (wrote?.length) return true;
    }
    return false;
}

/**
 * Hand the booking back after a cancellation that did not happen, restoring
 * whatever held it before. Conditioned on this cancellation's own stamp, so a
 * release can never undo a claim someone else took after this one expired.
 */
async function releaseCancellation(booking, claim, patch = {}) {
    const current = (await readBookingDetails(booking.id)) || claim.details;
    const { gds_chain: _ours, ...rest } = current;
    // A patch may be worked out from the booking as it now reads, so a flag it
    // writes can keep the one already there (see cancelFlightBooking).
    const extra = typeof patch === 'function' ? patch(current) : patch;
    const { error } = await supabase
        .from('bookings')
        .update({ booking_details: { ...rest, ...(claim.prior ? { gds_chain: claim.prior } : {}), ...extra } })
        .eq('id', booking.id)
        .eq('booking_details->gds_chain->>startedAt', claim.stamp);
    if (error) console.error('⚠️ Could not release the cancellation claim:', error.message);
}

/**
 * What a cancelled flight owes the customer, from what can actually be known.
 *
 * The fee used to come off every refund. But a reservation that was never
 * ticketed costs the airline nothing to release, and neither does a booking
 * that never reached it; the fee is for cancelling a ticket. And a ticket past
 * its same-day void window was refunded in full less the fee even when the
 * booking said the fare was non-refundable - money the airline will not give
 * back. So:
 *
 *   - nothing held at the gateway          -> nothing to refund, unless the
 *                                             booking says paid and the
 *                                             gateway never held a payment:
 *                                             review
 *   - held less than checkout charged      -> review (part already went back)
 *   - never booked, or a PNR with no ticket -> everything held, no fee
 *   - tickets, all voided the same day      -> everything held, less the fee
 *   - tickets past the void window:
 *       fare recorded refundable           -> everything held, less the fee;
 *                                             the airline refund is claimed
 *       non-refundable, or not recorded    -> review
 *   - the airline and the booking disagree
 *     about a ticket, or the airline did
 *     not say                              -> review
 *
 * "Review" refunds nothing automatically: a person decides what is due, and the
 * customer is told so. Pure, so the rules are testable without a gateway.
 *
 * @returns {{ action: 'nothing_held'|'review'|'refund_all'|'refund_less_fee'|'fee_covers',
 *             fee: number, refundAmount: number, reason: string }}
 */
export function decideFlightRefund({ heldAmount, paidInFull, everCaptured, hasReservation, gds, rowTicketed, issuanceUnknownOnly = false, refundable, fee, rowPaid = false }) {
    const heldCents = Math.round((Number(heldAmount) || 0) * 100);
    const review = (reason) => ({ action: 'review', fee: 0, refundAmount: 0, reason });

    if (heldCents <= 0) {
        // The booking says paid and the gateway never held a payment for it:
        // the row was written by a path that did not ask the gateway, or it
        // points at a different order from the one charged. This closed as
        // "nothing to refund" - a reason neither alarm announces and no admin
        // button acts on - so a customer who was charged was never refunded.
        if (rowPaid && !everCaptured) return review('the booking was marked paid, but the gateway holds no payment for it');
        return {
            action: 'nothing_held',
            fee: 0,
            refundAmount: 0,
            reason: everCaptured ? 'the payment had already been returned at the gateway' : 'the gateway holds no payment for this booking',
        };
    }
    if (!paidInFull) return review('the gateway holds less than checkout charged: part of the payment has already gone back');

    let ticketed = false;
    if (hasReservation) {
        if (gds?.hadTickets === undefined || gds?.hadTickets === null) {
            return review('the airline did not say whether a ticket had been issued');
        }
        ticketed = Boolean(gds.hadTickets);
        if (!ticketed && rowTicketed) {
            // Nothing recorded a ticket - only a DocIssuance nobody saw
            // answered. "The booking records a ticket" was false of it, and
            // staff reading it would dismiss the hold and refund in full.
            return review(issuanceUnknownOnly
                ? 'DocIssuance was never answered and the airline showed no ticket when it was cancelled: check the ticket history before refunding'
                : 'the booking records a ticket, but the airline showed none when it was cancelled');
        }
    } else if (rowTicketed) {
        return review('the booking records a ticket but has no airline reservation');
    }

    if (!ticketed) {
        return {
            action: 'refund_all',
            fee: 0,
            refundAmount: heldCents / 100,
            reason: hasReservation ? 'reservation released before any ticket was issued' : 'never booked with the airline',
        };
    }

    const unvoided = Array.isArray(gds.requiresAirlineRefund) && gds.requiresAirlineRefund.length > 0;
    if (!unvoided && !gds.voided) return review('tickets were issued, but none was voided and none is listed for an airline refund');
    if (unvoided && refundable !== true) {
        return review(refundable === false
            ? 'non-refundable fare with tickets past their void window: what the airline returns depends on its fare rules'
            : 'tickets past their void window, and the booking does not record whether the fare is refundable');
    }

    const feeCents = Math.round(Number(fee) * 100);
    if (!Number.isFinite(feeCents) || feeCents < 0) return review('the cancellation fee could not be read');
    const basis = unvoided ? 'refundable fare; tickets refunded through the airline' : 'tickets voided the day they were issued';
    // No fee configured is a whole refund, not a "partial" one of everything:
    // it goes back as a void where it can, and the row reads refunded.
    if (feeCents === 0) return { action: 'refund_all', fee: 0, refundAmount: heldCents / 100, reason: `${basis}; no cancellation fee is set` };
    const refundCents = heldCents - feeCents;
    if (refundCents <= 0) return { action: 'fee_covers', fee: heldCents / 100, refundAmount: 0, reason: `${basis}; the fee covers the payment` };
    return { action: 'refund_less_fee', fee: feeCents / 100, refundAmount: refundCents / 100, reason: basis };
}

/** Carry out a refund decision at ARC. Never moves more than the decision says. */
async function returnFlightPayment(decision, { arcOrderId, currency, reason }) {
    switch (decision.action) {
        case 'nothing_held':
            return { paymentAction: 'NOTHING_TO_REFUND', refundAmount: 0, cancellationFee: 0 };
        case 'review':
            return { paymentAction: 'REFUND_UNDER_REVIEW', refundAmount: 0, cancellationFee: 0 };
        case 'fee_covers':
            return { paymentAction: 'NO_REFUND_FEE_COVERS', refundAmount: 0, cancellationFee: decision.fee, paymentProcessed: true };
        case 'refund_all': {
            // A void first where the charge has not settled - nothing moves and
            // nothing is lost to the card network - else a refund of what is left.
            const reversal = await reverseArcPaymentForOrder(arcOrderId, { currency, reason: `Cancellation: ${reason}` });
            if (reversal.action === 'VOID') {
                return { paymentAction: 'VOID', refundAmount: decision.refundAmount, cancellationFee: 0, paymentProcessed: true, refundTransactionId: reversal.transactionId };
            }
            if (reversal.action === 'REFUND') {
                return { paymentAction: 'FULL_REFUND', refundAmount: reversal.amount, cancellationFee: 0, paymentProcessed: true, refundTransactionId: reversal.transactionId };
            }
            if (reversal.action === 'FAILED' && reversal.details) {
                return { paymentAction: 'REFUND_FAILED', refundAmount: 0, cancellationFee: 0, errorDetails: reversal.details };
            }
            // The order could not be read, it had been reversed by something else
            // in the last few seconds, or the request broke mid-flight. Whether
            // money moved is not known here, so nobody is told either way.
            //
            // Said outright: REFUND_UNDER_REVIEW is also the code for a refund
            // held on purpose, and the alarm told this one "nothing was
            // refunded, on purpose - check the tickets with the airline", when
            // the question is whether ARC Pay moved the money.
            return {
                paymentAction: 'REFUND_UNDER_REVIEW',
                refundAmount: 0,
                cancellationFee: 0,
                reviewReason: `automatic reversal ended ${reversal.action}: ${reversal.error || 'no detail'}`,
                reversalOutcomeUnknown: true,
            };
        }
        case 'refund_less_fee': {
            // Per ARC Pay: a REFUND on the same order, a new transaction id, the
            // amount to return. No separate charge for the fee - less goes back.
            const authConfig = getArcPayAuthConfig();
            const refundTxnId = `refund-cancel-${Date.now()}`;
            const refundUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${arcOrderId}/transaction/${refundTxnId}`;
            console.log('💸 Issuing cancellation REFUND:', decision.refundAmount.toFixed(2), '(fee:', decision.fee, ')');
            try {
                const refundResponse = await axios.put(refundUrl, {
                    apiOperation: 'REFUND',
                    transaction: {
                        amount: decision.refundAmount.toFixed(2),
                        currency,
                        reference: `Cancel refund (fee: ${decision.fee}): ${reason}`.substring(0, 40)
                    }
                }, { headers: authConfig.headers, validateStatus: () => true });

                // Status code alone is not an answer: ARC returns 200 with
                // result FAILURE for a refund it refused.
                if (arcSucceeded(refundResponse)) {
                    return { paymentAction: 'PARTIAL_REFUND', refundAmount: decision.refundAmount, cancellationFee: decision.fee, paymentProcessed: true, refundTransactionId: refundTxnId };
                }
                console.error('❌ ARC Pay REFUND failed:', refundResponse?.status, arcFailureSummary(refundResponse?.data));
                return { paymentAction: 'REFUND_FAILED', refundAmount: 0, cancellationFee: decision.fee, errorDetails: arcFailureSummary(refundResponse?.data) };
            } catch (error) {
                console.error('❌ ARC Pay REFUND did not complete:', error.message);
                // Sent, or about to be, and no answer: ARC Pay may have refunded.
                return {
                    paymentAction: 'REFUND_UNDER_REVIEW',
                    refundAmount: 0,
                    cancellationFee: decision.fee,
                    reviewReason: `refund request did not complete: ${error.message}`,
                    reversalOutcomeUnknown: true,
                };
            }
        }
        default:
            return { paymentAction: 'REFUND_UNDER_REVIEW', refundAmount: 0, cancellationFee: 0, reviewReason: `no refund rule for ${decision.action}` };
    }
}

/** A ticket number as digits, so "125-2412345671" and "1252412345671" are one ticket. */
const ticketDigits = (number) => String(number ?? '').replace(/\D/g, '');

/** The ticket numbers in `earlier`, then those in `later` not already among them. */
const unionTickets = (earlier = [], later = []) => {
    const seen = new Set();
    return [...(Array.isArray(earlier) ? earlier : []), ...(Array.isArray(later) ? later : [])]
        .filter((number) => {
            const digits = ticketDigits(number);
            if (!digits || seen.has(digits)) return false;
            seen.add(digits);
            return true;
        });
};

/**
 * The review flag already on a booking, kept under a new one as `previous`.
 *
 * A later cancel wrote its own flag over the one before, and the one before is
 * where a partial void said which tickets it voided ("voided X but not Y - the
 * PNR is left live") - lost at the moment a person needed it. Same shape as
 * flagUnrecordedCancellation's.
 */
const keepingPrevious = (details) => (details?.needs_review ? { previous: details.needs_review } : {});

/**
 * Cancel a flight: take the booking, learn what the gateway holds, release the
 * seats, then return what the tickets and the fare say is owed - in that order,
 * and once.
 */
async function cancelFlightBooking(res, booking, { reason, email }) {
    const details = booking.booking_details || {};
    const bookingReference = booking.booking_reference;

    // 1. Nothing else may hold the booking.
    //
    // A cancel used to be accepted while the booking chain was still running,
    // or while the booking waited in the durable queue for an Amadeus slot. It
    // refunded the customer and marked the row cancelled, and the chain - which
    // had read the row before that - went on to commit a real PNR: seats held
    // against a payment that had just been returned. The chain's claim lasts
    // CHAIN_CLAIM_TTL_MS and is renewed while it runs, so this clears itself.
    //
    // A committed chain is still issuing the ticket and saving the booking
    // (utils/bookingChainClaim.js), so a cancel waits for it too.
    const holder = liveChainState(details.gds_chain);
    if (holder === 'in_progress' || holder === 'queued' || holder === 'committed') {
        return refuse(res, 409, 'BOOKING_IN_PROGRESS', STILL_BOOKING_TEXT, { bookingReference });
    }
    if (holder === 'cancelling') {
        return refuse(res, 409, 'CANCEL_IN_PROGRESS', CANCEL_IN_PROGRESS_TEXT, { bookingReference });
    }

    const claim = await claimCancellation(booking);
    if (claim.error) {
        return refuse(res, 503, 'CANCEL_UNAVAILABLE',
            'We could not start the cancellation just now. Nothing has been cancelled. Please try again in a minute.',
            { bookingReference, retryable: true });
    }
    if (!claim.claimed) {
        // Lost the race. Say to what: the chain, or another cancellation.
        const holderNow = liveChainState((await readBookingDetails(booking.id))?.gds_chain);
        return holderNow === 'in_progress' || holderNow === 'queued' || holderNow === 'committed'
            ? refuse(res, 409, 'BOOKING_IN_PROGRESS', STILL_BOOKING_TEXT, { bookingReference })
            : refuse(res, 409, 'CANCEL_IN_PROGRESS', CANCEL_IN_PROGRESS_TEXT, { bookingReference });
    }

    // 2. What does the gateway actually hold?
    //
    // The refund used to be worked out from the row: `payment_status` decided
    // whether to refund and `total_amount` how much. That amount is what the
    // client asked checkout to charge, written before anyone paid, and the row
    // never hears of a refund made since - an admin's, or an earlier reversal.
    // Asked before the seats go, so a gateway that cannot be reached leaves the
    // booking exactly as it was. A payment still `pending` is asked about too,
    // rather than reversed blind: a REFUND or VOID against an order with nothing
    // in it only ever failed, and paged the payment alarm about money that was
    // never taken.
    let payment;
    try {
        payment = await reconcileBookingPayment({ ...booking, booking_details: claim.details }, { fresh: true });
    } catch (error) {
        payment = { gatewayUnavailable: true, error: error.message };
    }

    const pnr = details.pnr || details.amadeus_order_id || null;
    // An order ARC says it does not have was never paid: the checkout was opened
    // and left. With no reservation and a row that agrees nothing was paid, that
    // is an answer, not an outage.
    const neverPaid = payment.gatewayUnavailable && [400, 404].includes(payment.gatewayStatus)
        && !pnr && ['unpaid', 'pending', null, undefined].includes(booking.payment_status);
    if (neverPaid) {
        payment = { paid: false, heldAmount: 0, everCaptured: false };
    } else if (payment.gatewayUnavailable) {
        await releaseCancellation(booking, claim);
        return refuse(res, 503, 'PAYMENT_GATEWAY_UNAVAILABLE',
            'We could not reach our payment provider to confirm what was paid, so nothing has been cancelled yet. '
            + 'Please try again in a few minutes.',
            { bookingReference, retryable: true });
    }

    // 3. Release the seats, before any money moves.
    //
    // A flight booking is cancelled by RECORD LOCATOR, and the PNR is the only
    // identifier the GDS knows: order_id and booking_reference are ours, and
    // passing one of those cancels nothing. This used to call the Self-Service
    // REST client, whose host has had no DNS since August: every flight
    // cancellation threw, was swallowed, and the refund ran against a
    // reservation that was still live.
    let gds = null;
    if (pnr) {
        let supplierError = null;
        try {
            gds = await FlightProvider.cancelFlightOrder(pnr);
        } catch (error) {
            supplierError = error;
            console.warn('⚠️ Supplier (flight) cancellation error:', error.error || error.message);
        }

        // A refund without a released seat is money out AND a flight the
        // customer can still board. So if the airline still has the booking,
        // stop and put it in front of a human rather than paying out against a
        // live ticket - and hand the booking back, so it can be tried again.
        if (!gds?.success) {
            console.error('❌ Refusing to refund: the airline still holds this booking', {
                bookingReference,
                pnr,
                reason: supplierError?.technicalError || supplierError?.error || supplierError?.message || 'cancel returned no success'
            });
            // A void that went through for some tickets and not the others
            // (bookingChain.js partialVoid). Which is which goes on the flag for
            // the desk, and the voided ones on the booking itself: a cancel on a
            // later day finds every ticket past its void window and would list
            // the voided one as a refund to claim from the airline - money that
            // already came back with the void.
            const voidedNow = Array.isArray(supplierError?.voidedTickets) ? supplierError.voidedTickets : [];
            // null when the chain could not tell which tickets are still live -
            // a void whose last reply named no document. That is unknown, not
            // "none": written as [] it made the Slack line read "still live:
            // none" over a live ticket. Left off the flag, the alarm lists the
            // booking's tickets that are not recorded as voided instead.
            const unvoidedNow = Array.isArray(supplierError?.unvoidedTickets) ? supplierError.unvoidedTickets : null;
            // The desk shows this reason. "Refund withheld" is true of a paid
            // booking, and false of one the Payments tab had already refunded
            // (it writes payment_status only): nothing was withheld, the money
            // had gone back. Read from the same field the Slack alarm splits
            // these on (needsReviewAlert.job.js refundedBefore), so the two
            // agree. Flags already stored keep their text.
            const paymentBefore = String(booking.payment_status || '').toLowerCase();
            const reason = ['refunded', 'reversed'].includes(paymentBefore)
                ? 'GDS cancellation failed; the payment had already been refunded before this cancel, so this cancel made no refund'
                : paymentBefore === 'partially_refunded'
                    ? 'GDS cancellation failed; part of the payment had already been refunded before this cancel, '
                        + 'and the rest is withheld to avoid paying out against a live booking'
                    : 'GDS cancellation failed; refund withheld to avoid paying out against a live booking';
            await releaseCancellation(booking, claim, (current) => {
                const voidedSoFar = unionTickets(current?.voided_tickets, voidedNow);
                return {
                    ...(voidedSoFar.length ? { voided_tickets: voidedSoFar } : {}),
                    needs_review: {
                        reason,
                        // Said outright, so the alarm and the desk list find it
                        // on a ticketed booking too (isFailedCancellation). With
                        // neither, "ticketed, so done" skipped it, while the
                        // customer was told below that our team had been alerted.
                        source: 'cancellation',
                        cancelFailed: true,
                        pnr,
                        detail: supplierError?.technicalError || supplierError?.message || null,
                        ...(voidedNow.length || unvoidedNow?.length
                            ? { voided_tickets: voidedNow, ...(unvoidedNow ? { unvoided_tickets: unvoidedNow } : {}) }
                            : {}),
                        at: new Date().toISOString(),
                        ...keepingPrevious(current),
                    }
                };
            });
            const text = 'We could not cancel your reservation with the airline. '
                + 'Our team has been alerted and will complete it - please call (877) 538-7380 if it is urgent.';
            return res.status(502).json({ success: false, error: text, message: text, bookingReference, needsReview: true });
        }
        console.log('🧳 Supplier cancellation (flight): success' + (gds.voided ? ', tickets voided' : ''));
    }

    // 4. What is owed, and 5. return it.
    //
    // A ticket an earlier attempt voided is not a refund to claim from the
    // airline. On a later day every ticket is past its void window, so the
    // chain lists the voided one with the rest; its value came back with the
    // void. Left out here, and if that leaves none, the tickets were voided.
    const voidedEarlier = Array.isArray(details.voided_tickets) ? details.voided_tickets : [];
    const voidedDigits = new Set(voidedEarlier.map(ticketDigits));
    const listedForClaim = gds?.requiresAirlineRefund || [];
    const requiresAirlineRefund = listedForClaim.filter((number) => !voidedDigits.has(ticketDigits(number)));
    const settled = gds && requiresAirlineRefund.length < listedForClaim.length
        ? { ...gds, requiresAirlineRefund, voided: true }
        : gds;
    const tickets = Array.isArray(details.tickets) ? details.tickets : [];
    const recordedTicket = details.gds?.ticketed === true || tickets.length > 0
        || Boolean(ticketNumbersMissingOf(booking));
    const issuanceUnknown = Boolean(flagInForce(booking, (review) => review.issuance === ISSUANCE_UNKNOWN));
    const decision = decideFlightRefund({
        heldAmount: payment.heldAmount,
        paidInFull: payment.paid === true,
        everCaptured: payment.everCaptured === true,
        hasReservation: Boolean(pnr),
        gds: settled,
        // The numbers-missing flag under a refused cancel's flag too: the
        // ticket was issued whatever flag sits on top now.
        //
        // And a DocIssuance nobody saw answered (flight.routes.js flagForReview
        // `issuance`): a ticket may exist, and a retrieve that shows none may
        // have been read before its FA line landed. It refunded in full; it
        // now goes to a person. Not past a flag a person resolved: they read
        // the PNR.
        rowTicketed: recordedTicket || issuanceUnknown,
        issuanceUnknownOnly: issuanceUnknown && !recordedTicket,
        refundable: details.refundable,
        fee: await readCancellationFee(),
        rowPaid: booking.payment_status === 'paid',
    });
    const currency = payment.capturedCurrency || details.currency || 'USD';
    const returned = await returnFlightPayment(decision, {
        arcOrderId: details.order_id || bookingReference,
        currency,
        reason,
    });
    console.log('💰 Cancellation refund:', returned.paymentAction, returned.refundAmount, '-', decision.reason);

    const now = new Date().toISOString();
    const reviewReasons = [
        decision.action === 'review' ? decision.reason : null,
        returned.reviewReason || null,
        // A ticket past its same-day void window still holds value, and that
        // value is with the airline. It is ours to reclaim under the fare rules;
        // it does not settle itself by cancelling.
        requiresAirlineRefund.length ? 'tickets could not be voided; airline refund must be claimed' : null,
    ].filter(Boolean);

    const cancellationResult = {
        bookingId: booking.id,
        bookingReference,
        amadeusCancelled: Boolean(gds?.success),
        ticketsVoided: Boolean(settled?.voided),
        requiresAirlineRefund,
        paymentProcessed: Boolean(returned.paymentProcessed),
        paymentAction: returned.paymentAction,
        refundAmount: returned.refundAmount,
        cancellationFee: returned.cancellationFee,
        currency,
        needsReview: reviewReasons.length > 0,
        ...(returned.reversalOutcomeUnknown ? { reversalOutcomeUnknown: true } : {}),
        ...(returned.refundTransactionId ? { refundTransactionId: returned.refundTransactionId } : {}),
        ...(returned.errorDetails !== undefined ? { errorDetails: returned.errorDetails } : {}),
    };

    // The money's state, not the attempt's. A refund the gateway refused, or one
    // left for review, leaves the charge where it was; money the gateway had
    // already returned before this cancel is returned money.
    const paymentStatus = ['VOID', 'FULL_REFUND'].includes(returned.paymentAction) ? 'refunded'
        : returned.paymentAction === 'PARTIAL_REFUND' ? 'partially_refunded'
            : returned.paymentAction === 'NOTHING_TO_REFUND' && payment.everCaptured ? 'refunded'
                : payment.paid === true ? 'paid'
                    : booking.payment_status;

    // Read back rather than spread the copy from the start: reconcile has
    // written the captured amount to the row since.
    const current = (await readBookingDetails(booking.id)) || claim.details;
    const { data: updated, error: updateError } = await supabase
        .from('bookings')
        .update({
            status: 'cancelled',
            payment_status: paymentStatus,
            booking_details: {
                ...current,
                // Left behind, finished. The order route reads it and refuses to
                // book even if it read the row before this write.
                gds_chain: { ...(claim.prior || {}), state: 'cancelled', startedAt: claim.stamp, cancelledAt: now },
                cancellation: {
                    cancelledAt: now,
                    reason,
                    amadeusCancelled: cancellationResult.amadeusCancelled,
                    paymentAction: cancellationResult.paymentAction,
                    refundAmount: cancellationResult.refundAmount,
                    cancellationFee: cancellationResult.cancellationFee || 0,
                    netRefund: cancellationResult.refundAmount || 0,
                    currency,
                    ticketsVoided: cancellationResult.ticketsVoided,
                    // Why this amount, for the support desk.
                    basis: decision.reason,
                    // A reversal sent with no answer back, not a hold: whoever
                    // picks this up checks ARC Pay before refunding anything.
                    ...(cancellationResult.reversalOutcomeUnknown ? { reversalOutcomeUnknown: true } : {}),
                },
                ...(reviewReasons.length
                    ? {
                        needs_review: {
                            reason: reviewReasons.join('; '),
                            source: 'cancellation',
                            at: now,
                            ...(requiresAirlineRefund.length ? { tickets: requiresAirlineRefund } : {}),
                            // Voided before, so not among the tickets to claim.
                            ...(voidedEarlier.length ? { voided_tickets: voidedEarlier } : {}),
                            ...keepingPrevious(current),
                        }
                    }
                    : {})
            },
            updated_at: now,
        })
        .eq('id', booking.id)
        // Pinned to OUR claim, the way releaseCancellation pins its own.
        //
        // `claimCancellation` stamps once and there is no heartbeat, so
        // `liveChainState` releases a 'cancelling' claim after
        // CHAIN_CLAIM_TTL_MS. A cancel that runs long - a fresh ARC reconcile,
        // a WSAP session of several calls, then the refund - loses its claim
        // while still working, and this write would otherwise land `cancelled`
        // and `refunded` over a PNR that another request committed in the
        // meantime.
        .eq('booking_details->gds_chain->>startedAt', claim.stamp)
        .select('id');

    // Matching nothing means someone else holds the booking now. That is the
    // same situation as a failed write - the seats are released and the money
    // has moved - so it takes the same answer rather than reporting success.
    const lostTheClaim = !updateError && !(updated?.length);
    if (updateError || lostTheClaim) {
        // The seats are released and the money has done whatever it did; only
        // the record failed. Trying again would find nothing to cancel, so the
        // customer is told not to, and what happened travels with the answer.
        console.error('❌ Cancellation carried out but not recorded', {
            bookingReference,
            paymentAction: cancellationResult.paymentAction,
            error: updateError ? updateError.message : 'the booking moved to another request mid-cancel',
        });
        const flagged = await flagUnrecordedCancellation(booking.id, {
            reason: `cancellation carried out but not recorded: ${gds?.success ? 'airline reservation released' : 'no airline reservation'}, `
                + `payment ${cancellationResult.paymentAction} ${cancellationResult.refundAmount || 0} ${currency}; `
                + 'check the airline and ARC Pay and record it by hand',
            source: 'cancellation',
            // Said outright, so the alarm announces it even on a ticketed
            // booking. A retry that voided the tickets leaves none to claim,
            // and "ticketed, so done" kept exactly that booking from anyone.
            unrecorded: true,
            ticketsVoided: cancellationResult.ticketsVoided,
            at: now,
            paymentAction: cancellationResult.paymentAction,
            refundAmount: cancellationResult.refundAmount || 0,
            ...(requiresAirlineRefund.length ? { tickets: requiresAirlineRefund } : {}),
        }).catch(() => false);
        if (!flagged) console.error('❌ Could not flag the unrecorded cancellation for review either', { bookingReference });
        const text = 'Your cancellation was processed, but we could not save it. Please do not try again - '
            + 'call (877) 538-7380 and we will confirm what happened to your payment.';
        return res.status(500).json({ success: false, error: text, message: text, cancellation: cancellationResult });
    }

    // With the details read back after reconcile, so what the office is told
    // was decided is worked out from what ARC captured, as the desk's is.
    await sendCancellationEmail({ ...booking, booking_details: current }, email, cancellationResult);
    console.log('✅ Booking cancelled:', booking.id, cancellationResult.paymentAction);

    return res.status(200).json({
        success: true,
        message: cancellationMessage({ cancellation: cancellationResult }),
        cancellation: cancellationResult,
        booking: {
            id: booking.id,
            reference: bookingReference,
            status: 'cancelled',
            previousStatus: booking.status,
            refundAmount: cancellationResult.refundAmount,
            cancellationFee: cancellationResult.cancellationFee,
            netRefund: (cancellationResult.refundAmount || 0),
            paymentAction: cancellationResult.paymentAction
        }
    });
}

/**
 * A cancelled flight whose cancel found no payment to return, and whose money
 * nothing has settled since: the one cancellation a later payment can land on.
 * A row with no travel type is a flight, as the cancel above reads it.
 */
export function cancelledWithNothingTaken(booking) {
    return booking?.status === 'cancelled'
        && (booking.travel_type == null || booking.travel_type === 'flight')
        && booking.booking_details?.cancellation?.paymentAction === 'NOTHING_TO_REFUND'
        && !['refunded', 'partially_refunded', 'reversed'].includes(String(booking.payment_status || '').toLowerCase());
}

/**
 * A payment made on a checkout's payment page after the checkout was cancelled.
 *
 * Cancel & Refund closes a checkout ARC has no order for as NOTHING_TO_REFUND
 * (cancelFlightBooking, `neverPaid`). Its payment page is still open - ARC
 * keeps it for ARC_PAGE_TIMEOUT_SECONDS, and nothing here can close it - so
 * the customer can still pay. That payment landed on a cancelled row: the
 * order route refused it before asking the gateway, reconcile answers a
 * cancelled row without asking, and neither alarm, the desk list nor the
 * abandoned-checkout job reads a cancellation that took nothing. The money
 * stayed at ARC and nobody was told.
 *
 * This asks the gateway afresh and, when it now holds money, makes the
 * cancellation say so: REFUND_UNDER_REVIEW, which the payment alarm announces,
 * the desk lists with its Finish refund button and My Trips explains, and a
 * `cancellation` flag on top. Nothing is refunded here. A person returns it
 * with Finish refund, which takes its own claim, so the money moves once.
 *
 * Called by the order route when the payer comes back, and by the
 * abandoned-checkout job when they do not. A second caller finds the
 * cancellation no longer NOTHING_TO_REFUND and writes nothing.
 *
 * @returns {Promise<null | { held: number, currency?: string, recorded?: boolean, alreadyRecorded?: boolean } | { gatewayUnavailable: true }>}
 *   null for any other booking, without asking the gateway; `held: 0` when
 *   ARC holds nothing (a 400 or 404 is ARC saying it has no such order).
 */
export async function recordPaymentAfterCancel(booking, { reconcile = reconcileBookingPayment } = {}) {
    if (!cancelledWithNothingTaken(booking)) return null;

    let payment;
    try {
        payment = await reconcile(booking, { fresh: true });
    } catch (error) {
        payment = { gatewayUnavailable: true, error: error.message };
    }
    if (payment.gatewayUnavailable) {
        return [400, 404].includes(payment.gatewayStatus) ? { held: 0 } : { gatewayUnavailable: true };
    }
    const held = roundCents(payment.heldAmount || 0);
    if (!(held > 0)) return { held: 0 };

    const details = booking.booking_details || {};
    const currency = payment.capturedCurrency || details.currency || 'USD';
    const reason = `paid after it was cancelled: ARC Pay holds ${held.toFixed(2)} ${currency} taken on the payment page after `
        + 'the checkout was cancelled with nothing to refund. No booking was made; return it with Finish refund.';

    // Pinned to the row as read (utils/bookingDetailsGuard.js), and read again
    // after a lost race: reconcile has just written the capture to it.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const { data: current, error: readError } = await supabase
            .from('bookings')
            .select('status, payment_status, travel_type, booking_details')
            .eq('id', booking.id)
            .single();
        if (readError || !current) break;
        if (!cancelledWithNothingTaken(current)) return { held, currency, recorded: false, alreadyRecorded: true };

        const currentDetails = current.booking_details || {};
        const now = new Date().toISOString();
        const { data: wrote, error: writeError } = await unchangedSince(
            supabase
                .from('bookings')
                .update({
                    payment_status: 'paid',
                    booking_details: {
                        ...currentDetails,
                        cancellation: {
                            ...currentDetails.cancellation,
                            paymentAction: 'REFUND_UNDER_REVIEW',
                            paidAfterCancel: { at: now, amount: held, currency },
                        },
                        needs_review: { reason, source: 'cancellation', at: now, ...keepingPrevious(currentDetails) },
                    },
                    updated_at: now,
                })
                .eq('id', booking.id),
            { status: current.status, payment_status: current.payment_status, booking_details: currentDetails },
        ).select('id');
        if (writeError) break;
        if (wrote?.length) {
            console.error('💳 Payment taken on a cancelled checkout, held for the desk to return', {
                bookingReference: booking.booking_reference, held, currency,
            });
            return { held, currency, recorded: true };
        }
    }
    console.error('❌ Payment taken on a cancelled checkout could not be recorded', { bookingReference: booking.booking_reference, held, currency });
    return { held, currency, recorded: false };
}

/**
 * Whether ARC holds anything on an order that a refund or a void could return.
 *
 * Read-only. A booking or payment still `pending` has usually never been paid -
 * the checkout was opened and left - and reversing it anyway sent a REFUND or a
 * VOID at an order with nothing in it. That ended REFUND_FAILED or
 * VOID_MISSING_TXN_ID, and the payment-failure alarm then paged about a refund
 * owed on money that was never taken. But `pending` can also be a capture the
 * row never heard about, so the gateway is asked rather than the row believed.
 *
 * @returns {Promise<{ reachable: boolean, holdsPayment?: boolean, orderStatus?: string|null, httpStatus?: number|null }>}
 */
export async function inspectArcOrder(orderId) {
    if (!orderId) return { reachable: false };
    try {
        const orderUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${orderId}`;
        const resp = await axios.get(orderUrl, { headers: getArcPayAuthConfig().headers, validateStatus: () => true });
        if (resp?.status !== 200 || !resp.data) return { reachable: false, httpStatus: resp?.status ?? null };

        const txns = Array.isArray(resp.data.transaction) ? resp.data.transaction : [];
        const succeeded = (t) => t.result === 'SUCCESS' || t.response?.gatewayCode === 'APPROVED';
        const sumOf = (list) => list.reduce((sum, t) => sum + (Number(t.transaction?.amount) || 0), 0);
        const taken = txns.filter((t) => succeeded(t) && ['PAYMENT', 'CAPTURE', 'AUTHORIZATION'].includes(t.transaction?.type));
        const captured = sumOf(txns.filter((t) => succeeded(t) && ['PAYMENT', 'CAPTURE'].includes(t.transaction?.type)));
        const refunded = sumOf(txns.filter((t) => t.transaction?.type === 'REFUND' && t.result === 'SUCCESS'));
        const voided = orderVoided(resp.data);
        const fullyRefunded = captured > 0 && refunded + 0.01 >= captured;

        return { reachable: true, orderStatus: resp.data.status || null, holdsPayment: taken.length > 0 && !voided && !fullyRefunded };
    } catch (error) {
        return { reachable: false, error: error.message };
    }
}

/**
 * Hotels, cruises and packages. Their cancel is unchanged except where it was
 * wrong for everyone: the fee setting is honoured when it is 0, and a payment
 * still `pending` is checked with the gateway before anything is reversed.
 *
 * They have no supplier-side cancel: there is no hotel supplier behind this API
 * at all (the Enterprise WSAP is AIR-only), so a booking here was taken through
 * another channel and exists only in our database. Cancelling it is a database
 * update and a refund.
 */
async function cancelOtherBooking(res, booking, { reason, email }) {
    const cancellationResult = {
        bookingId: booking.id,
        bookingReference: booking.booking_reference,
        amadeusCancelled: false,
        paymentProcessed: false,
        refundAmount: null,
        paymentAction: null,
        cancellationFee: 0
    };

    // Process cancellation fee and refund/void via ARC Pay
    const cancellationFee = await readCancellationFee();
    let netRefundAmount = 0;

    if (['paid', 'completed', 'authorized', 'pending', 'partial'].includes(booking.payment_status) || booking.payment_id) {
        try {
            const { data: payment } = await supabase
                .from('payments')
                .select('*')
                .or(`quote_id.eq.${booking.id},id.eq.${booking.payment_id || 'none'}`)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            // CRITICAL: Use the ARC Pay order ID (FLT...), NOT the Supabase UUID
            const arcPayOrderId = payment
                ? (booking.booking_details?.order_id || payment.arc_order_id || booking.booking_reference || payment.id)
                : (booking.booking_details?.order_id || booking.booking_reference);

            // Asked, not reversed blind - see inspectArcOrder. A gateway that
            // cannot be reached leaves the old path in place: its attempt fails
            // the same way, and a failure nobody could verify is worth a page.
            let nothingToReverse = false;
            if (booking.payment_status === 'pending' || payment?.payment_status === 'pending') {
                const arcOrder = await inspectArcOrder(arcPayOrderId);
                nothingToReverse = arcOrder.reachable && !arcOrder.holdsPayment;
                if (nothingToReverse) console.log('🔍 Pending payment holds nothing at the gateway; no reversal for', arcPayOrderId);
            }

            if (nothingToReverse) {
                cancellationResult.paymentAction = 'NOTHING_TO_REFUND';
                cancellationResult.refundAmount = 0;
                cancellationResult.cancellationFee = 0;
            } else if (payment) {
                const authConfig = getArcPayAuthConfig();
                const originalAmount = parseFloat(payment.amount || booking.total_amount || 0);
                netRefundAmount = Math.max(0, originalAmount - cancellationFee);
                console.log('🔑 ARC Pay Order ID for refund/void:', arcPayOrderId);

                if (payment.payment_status === 'completed' || payment.payment_status === 'paid') {
                    // === COMPLETED PAYMENT: Issue partial REFUND (original - fee) ===
                    // Per ARC Pay docs: REFUND uses same orderId, new transactionId, amount to refund
                    // No separate PAY for fee — just refund less than the full amount
                    if (netRefundAmount > 0) {
                        const refundTxnId = `refund-${Date.now()}`;
                        const refundUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${arcPayOrderId}/transaction/${refundTxnId}`;

                        console.log('💸 Issuing partial REFUND:', netRefundAmount.toFixed(2), '(original:', originalAmount, '- fee:', cancellationFee, ')');
                        const refundResponse = await axios.put(refundUrl, {
                            apiOperation: 'REFUND',
                            transaction: {
                                amount: netRefundAmount.toFixed(2),
                                currency: payment.currency || 'USD',
                                reference: `Cancel refund (fee: ${cancellationFee}): ${reason}`.substring(0, 40)
                            }
                        }, { headers: authConfig.headers, validateStatus: () => true });

                        // Status code alone is not an answer: ARC returns 200 with
                        // result FAILURE for a refund it refused.
                        if (arcSucceeded(refundResponse)) {
                            const refundData = refundResponse.data;
                            console.log('✅ ARC Pay REFUND successful:', refundData.result);
                            cancellationResult.paymentProcessed = true;
                            cancellationResult.paymentAction = 'PARTIAL_REFUND';
                            cancellationResult.refundAmount = netRefundAmount;
                            cancellationResult.cancellationFee = cancellationFee;
                            // payments.payment_status CHECK allows only pending|processing|completed|failed|refunded.
                            // Record the partial nature in metadata; status maps to the valid 'refunded'.
                            const { error: refundDbErr } = await supabase.from('payments').update({
                                payment_status: 'refunded',
                                metadata: { ...payment.metadata, refund: { transactionId: refundTxnId, amount: netRefundAmount, fee: cancellationFee, partial: true, reason, at: new Date().toISOString() } }
                            }).eq('id', payment.id);
                            if (refundDbErr) console.error('⚠️ payments refund-status update failed:', refundDbErr.message);
                        } else {
                            console.error('❌ ARC Pay REFUND failed:', refundResponse.status, arcFailureSummary(refundResponse.data));
                            cancellationResult.paymentAction = 'REFUND_FAILED';
                            cancellationResult.refundAmount = 0;
                            cancellationResult.cancellationFee = cancellationFee;
                            cancellationResult.errorDetails = arcFailureSummary(refundResponse.data);
                        }
                    } else {
                        // Cancellation fee >= original amount → no refund due
                        console.log('💰 No refund due: cancellation fee (', cancellationFee, ') >= amount (', originalAmount, ')');
                        cancellationResult.paymentProcessed = true;
                        cancellationResult.paymentAction = 'NO_REFUND_FEE_COVERS';
                        cancellationResult.refundAmount = 0;
                        cancellationResult.cancellationFee = Math.min(cancellationFee, originalAmount);
                        // 'cancelled' is not a valid payments status. The money was kept as the fee,
                        // so leave payment_status as-is (completed) and record the cancellation in metadata.
                        const { error: feeDbErr } = await supabase.from('payments').update({
                            metadata: { ...payment.metadata, cancellation: { paymentAction: 'NO_REFUND_FEE_COVERS', fee: cancellationFee, reason, at: new Date().toISOString() } }
                        }).eq('id', payment.id);
                        if (feeDbErr) console.error('⚠️ payments cancellation-metadata update failed:', feeDbErr.message);
                    }
                } else if (payment.payment_status === 'pending' || payment.payment_status === 'authorized') {
                    // === AUTHORIZED/PENDING: VOID the full transaction ===
                    // Per ARC Pay docs: VOID requires transaction.targetTransactionId (the original PAY txn ID)
                    // Partial void is NOT supported — must void the full amount
                    let targetTxnId = payment.arc_transaction_id;

                    // If we don't have the original transaction ID, try to retrieve the order to find it
                    if (!targetTxnId) {
                        try {
                            const orderUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${arcPayOrderId}`;
                            const orderResp = await axios.get(orderUrl, { headers: authConfig.headers, validateStatus: () => true });
                            if (orderResp.status === 200) {
                                const orderData = orderResp.data;
                                // Find the last successful PAY or AUTHORIZE transaction
                                const txns = orderData.transaction || [];
                                const payTxn = txns.find(t => t.transaction?.type === 'PAYMENT' || t.transaction?.type === 'AUTHORIZATION');
                                targetTxnId = payTxn?.transaction?.id || txns[txns.length - 1]?.transaction?.id;
                                console.log('🔍 Retrieved target transaction ID from order:', targetTxnId);
                            }
                        } catch (orderErr) {
                            console.warn('⚠️ Could not retrieve order to find transaction ID:', orderErr.message);
                        }
                    }

                    if (targetTxnId) {
                        const voidTxnId = `void-${Date.now()}`;
                        const voidUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${arcPayOrderId}/transaction/${voidTxnId}`;

                        console.log('🚫 Issuing VOID for transaction:', targetTxnId);
                        const voidResp = await axios.put(voidUrl, {
                            apiOperation: 'VOID',
                            transaction: {
                                targetTransactionId: targetTxnId,
                                reference: `Cancellation: ${reason}`.substring(0, 40)
                            }
                        }, { headers: authConfig.headers, validateStatus: () => true });

                        if (arcSucceeded(voidResp)) {
                            const voidData = voidResp.data;
                            console.log('✅ ARC Pay VOID successful:', voidData.result);
                            cancellationResult.paymentProcessed = true;
                            cancellationResult.paymentAction = 'VOID';
                            // What the gateway says it returned, not what the row
                            // said was paid. This figure is printed to the customer
                            // verbatim - "A refund of $X is on its way" - and the row
                            // amount is what the client asked to be charged, which is
                            // not always what ARC captured.
                            const voidedAmount = Number(
                                voidData?.transaction?.amount ?? voidData?.order?.amount ?? NaN,
                            );
                            if (!Number.isFinite(voidedAmount)) {
                                console.warn('⚠️ VOID reply carried no amount; falling back to the recorded total', {
                                    bookingReference: booking?.booking_reference,
                                });
                            }
                            cancellationResult.refundAmount = Number.isFinite(voidedAmount) ? voidedAmount : originalAmount;
                            cancellationResult.cancellationFee = 0; // No fee on void (not settled yet)
                            // 'voided' is not a valid payments status; map to 'refunded' (funds fully
                            // returned) and record paymentAction:'VOID' in metadata to distinguish it.
                            const { error: voidDbErr } = await supabase.from('payments').update({
                                payment_status: 'refunded',
                                metadata: { ...payment.metadata, void: { transactionId: voidTxnId, targetTxnId, paymentAction: 'VOID', reason, at: new Date().toISOString() } }
                            }).eq('id', payment.id);
                            if (voidDbErr) console.error('⚠️ payments void-status update failed:', voidDbErr.message);
                        } else {
                            console.error('❌ ARC Pay VOID failed:', voidResp.status);
                            cancellationResult.paymentAction = 'VOID_FAILED';
                            cancellationResult.refundAmount = 0;
                            cancellationResult.cancellationFee = 0; // Void failed, fee is not strictly determined but typically no fee applies yet
                        }
                    } else {
                        console.error('❌ Cannot void: no target transaction ID found');
                        cancellationResult.paymentAction = 'VOID_MISSING_TXN_ID';
                    }
                }
            } else {
                // No payment record found — direct booking via hosted checkout
                console.log('⚠️ No payment record found, using booking data for refund');
                const originalAmount = parseFloat(booking.total_amount || 0);
                const netRefundAmount = Math.max(0, originalAmount - cancellationFee);
                console.log('🔑 ARC Pay Order ID (from booking):', arcPayOrderId, 'Amount:', originalAmount, 'Net refund:', netRefundAmount);

                if (netRefundAmount > 0) {
                    const authConfig = getArcPayAuthConfig();
                    const refundTxnId = `refund-cancel-${Date.now()}`;
                    const refundUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${arcPayOrderId}/transaction/${refundTxnId}`;
                    console.log('💸 Issuing REFUND (no payment record):', netRefundAmount.toFixed(2));

                    const refundResp = await axios.put(refundUrl, {
                        apiOperation: 'REFUND',
                        transaction: {
                            amount: netRefundAmount.toFixed(2),
                            currency: 'USD',
                            reference: `Cancel refund (fee: ${cancellationFee}): ${reason}`.substring(0, 40)
                        }
                    }, { headers: authConfig.headers, validateStatus: () => true });

                    if (arcSucceeded(refundResp)) {
                        console.log('✅ ARC Pay REFUND successful (no payment record)');
                        cancellationResult.paymentProcessed = true;
                        cancellationResult.paymentAction = 'PARTIAL_REFUND';
                        cancellationResult.refundAmount = netRefundAmount;
                        cancellationResult.cancellationFee = cancellationFee;
                        cancellationResult.refundTransactionId = refundTxnId;
                    } else {
                        console.error('❌ ARC Pay REFUND failed:', refundResp.status, arcFailureSummary(refundResp.data));
                        cancellationResult.paymentAction = 'REFUND_FAILED';
                        cancellationResult.refundAmount = 0;
                        cancellationResult.cancellationFee = cancellationFee;
                        cancellationResult.errorDetails = arcFailureSummary(refundResp.data);
                    }
                } else {
                    cancellationResult.paymentProcessed = true;
                    cancellationResult.paymentAction = 'NO_REFUND_FEE_COVERS';
                    cancellationResult.refundAmount = 0;
                    cancellationResult.cancellationFee = Math.min(cancellationFee, originalAmount);
                }
            }
        } catch (paymentError) {
            console.warn('⚠️ Payment refund/void error:', paymentError.message);
            // Fallback: mark as refund pending with cancellation fee noted
            cancellationResult.refundAmount = 0;
            cancellationResult.cancellationFee = cancellationFee;
            cancellationResult.paymentAction = 'MANUAL_PROCESS_REQUIRED';
        }
    }

    // 4. Update booking status
    // DB constraint: payment_status IN ('unpaid','partial','paid','refunded','partially_refunded')
    //
    // Read again, merge into THAT, and pin the write. This spread the copy read
    // at the start - before the payments lookup, the ARC read and a refund that
    // can take seconds - and wrote it back with only `.eq('id')`, so anything
    // written to the booking meanwhile (a reconcile's captured amount and
    // receipt, a review flag) was erased. Every other writer of this column
    // pins with unchangedSince; a write that loses reads again and merges.
    const cancellation = {
        cancelledAt: new Date().toISOString(),
        reason,
        amadeusCancelled: false,
        paymentAction: cancellationResult.paymentAction,
        refundAmount: cancellationResult.refundAmount,
        cancellationFee: cancellationResult.cancellationFee || 0,
        netRefund: (cancellationResult.refundAmount || 0),
        ticketsVoided: false
    };
    let updateError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const { data: current, error: readError } = await supabase
            .from('bookings')
            .select('status, payment_status, booking_details')
            .eq('id', booking.id)
            .single();
        if (readError || !current) {
            updateError = readError || new Error('the booking could not be read back');
            break;
        }
        const { data: written, error: writeError } = await unchangedSince(
            supabase
                .from('bookings')
                .update({
                    status: 'cancelled',
                    // The money's state, not the attempt's. A refund the gateway
                    // refused leaves the charge exactly where it was - `paid` - yet
                    // this used to write `partially_refunded` regardless, so a
                    // customer who was never paid back read as settled in the admin
                    // panel and in My Trips. Only a reversal that actually happened
                    // changes the payment state.
                    payment_status: cancellationResult.paymentProcessed ?
                        (cancellationResult.paymentAction === 'PARTIAL_REFUND' ? 'partially_refunded' : 'refunded') :
                        current.payment_status,
                    booking_details: { ...(current.booking_details || {}), cancellation }
                })
                .eq('id', booking.id),
            current,
        ).select('id');
        if (writeError) { updateError = writeError; break; }
        if (written?.length) { updateError = null; break; }
        updateError = new Error('the booking changed while its cancellation was being recorded');
    }

    if (updateError) {
        console.error('❌ Could not update the cancelled booking:', updateError.message);
        return res.status(500).json({ success: false, error: 'Failed to update booking status' });
    }

    await sendCancellationEmail(booking, email, cancellationResult);
    console.log('✅ Booking cancelled successfully:', booking.id);

    return res.status(200).json({
        success: true,
        message: cancellationMessage({ cancellation: cancellationResult }),
        cancellation: cancellationResult,
        booking: {
            id: booking.id,
            reference: booking.booking_reference,
            status: 'cancelled',
            previousStatus: booking.status,
            refundAmount: cancellationResult.refundAmount,
            cancellationFee: cancellationResult.cancellationFee,
            netRefund: (cancellationResult.refundAmount || 0),
            paymentAction: cancellationResult.paymentAction
        }
    });
}

/** The customer's cancellation email. Never fails the cancellation. */
async function sendCancellationEmail(booking, email, cancellationResult) {
    try {
        const { sendCancellationNotificationEmails } = await import('../../services/emailService.js');
        console.log('📧 Sending cancellation confirmation email...');

        // Extract email from passenger_details if available
        let passengerEmail = null;
        if (Array.isArray(booking.passenger_details) && booking.passenger_details.length > 0) {
            passengerEmail = booking.passenger_details[0]?.email || booking.passenger_details[0]?.contact?.emailAddress;
        }

        // No placeholder recipient. This fell back to test@jetsetterss.com, so a
        // booking with no address on file had its "customer" confirmation sent to
        // an inbox nobody reads, and reported as sent. With no address the send
        // is skipped, and the log says so.
        const customerEmail = booking.customer_email || booking.booking_details?.customer_email || passengerEmail || email || '';
        if (!customerEmail) {
            console.warn('⚠️ Cancellation email not sent: the booking has no customer address', { bookingReference: booking.booking_reference });
            return;
        }

        const decided = cancellationResult.reversalOutcomeUnknown
            ? refundOwedOf({ ...booking, booking_details: { ...(booking.booking_details || {}), cancellation: cancellationResult } })
            : null;
        const cancelEmailData = {
            customerEmail,
            customerName: booking.customer_name || (Array.isArray(booking.passenger_details) && booking.passenger_details[0]?.firstName ? `${booking.passenger_details[0].firstName} ${booking.passenger_details[0].lastName || ''}`.trim() : 'Valued Customer'),
            bookingReference: booking.booking_reference,
            bookingType: booking.travel_type || 'flight',
            refundAmount: cancellationResult.refundAmount,
            cancellationFee: cancellationResult.cancellationFee,
            // What actually happened to the money. Without it the email
            // promised "refund due ... 5-10 business days" on every
            // cancellation, including the ones where the gateway refused.
            paymentAction: cancellationResult.paymentAction,
            // A refund sent and never answered is not one that was not made:
            // the office email must not tell the desk to refund it by hand.
            ...(cancellationResult.reversalOutcomeUnknown ? { reversalOutcomeUnknown: true } : {}),
            // ...and if ARC Pay shows it never landed, what goes back is what
            // the cancel decided - the figure the desk fills in - not what ARC
            // holds, which includes the fee the cancel keeps.
            ...(decided ? { decidedRefund: decided.owed } : {}),
            currency: cancellationResult.currency || 'USD'
        };

        const emailResult = await sendCancellationNotificationEmails(cancelEmailData);
        if (emailResult.success) {
            console.log('✅ Cancellation email sent successfully');
        } else {
            console.warn('⚠️ Cancellation email sent with issues:', emailResult.error);
        }
    } catch (emailError) {
        console.error('❌ Failed to send cancellation email:', emailError.message);
    }
}

// ============================================
// ADMIN PAYMENT MANAGEMENT HANDLERS
// These handle refund, void, and status retrieval
// from the admin panel (InquiryDetail.jsx)
// ============================================

/**
 * How long one desk member's hold on refunding a payment lasts: far longer
 * than a gateway read and a refund take, short enough that a closed tab does
 * not lock the payment for good. The same as the flight manual refund's.
 */
const PAYMENT_REFUND_CLAIM_TTL_MS = 5 * 60_000;
const PAYMENT_REFUND_CLAIM = 'metadata->refund_claim->>claimedAt';

/**
 * Take a payment's refund for one desk member, or learn that someone else has
 * it. Two admins pressing Refund both read ARC's ceiling - 291 captured,
 * nothing refunded - both passed it, and ARC took both refunds, each under its
 * own transaction id: 582 back on a 291 charge. A compare-and-set on the claim
 * stamp decides, as claimManualRefund does for a cancelled flight.
 */
async function claimPaymentRefund(payment, adminId) {
    const prior = payment.metadata?.refund_claim?.claimedAt ?? null;
    if (prior && Date.now() - Date.parse(prior) < PAYMENT_REFUND_CLAIM_TTL_MS) return { claimed: false };

    const stamp = new Date().toISOString();
    const metadata = { ...(payment.metadata || {}), refund_claim: { claimedAt: stamp, by: adminId } };
    let update = supabase.from('payments').update({ metadata }).eq('id', payment.id);
    update = prior === null ? update.is(PAYMENT_REFUND_CLAIM, null) : update.eq(PAYMENT_REFUND_CLAIM, prior);
    const { data, error } = await update.select('id');
    if (error) return { claimed: false, error };
    if (!data?.length) return { claimed: false };
    return { claimed: true, stamp, metadata };
}

/** Let go of a refund claim that moved no money. Conditioned on its own stamp. */
async function releasePaymentRefund(paymentId, claim) {
    const { refund_claim: _mine, ...metadata } = claim.metadata;
    const { error } = await supabase
        .from('payments')
        .update({ metadata })
        .eq('id', paymentId)
        .eq(PAYMENT_REFUND_CLAIM, claim.stamp);
    if (error) console.error('⚠️ Could not release the payment refund claim:', error.message);
}

export async function handlePaymentRefund(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // AUTHORIZATION: refunds are an admin/staff operation. This handler is
    // dispatched from the public `?action=` router with NO `protect` middleware,
    // so it must gate itself — previously it did not, leaving an unauthenticated
    // ARC Pay refund endpoint reachable by anyone.
    if (!(await requireBookingStaff(req, res))) return;

    // Held from before ARC is read until the refund is recorded, and handed
    // back on every way out that moved no money.
    let claim = null;
    let claimedPaymentId = null;
    const giveBack = async () => {
        const held = claim;
        claim = null;
        if (held) await releasePaymentRefund(claimedPaymentId, held);
    };

    try {
        console.log('💰 Handling PAYMENT-REFUND operation');
        const { paymentId, amount, reason = 'Admin initiated refund' } = req.body;

        if (!paymentId) {
            return res.status(400).json({ success: false, error: 'paymentId is required' });
        }

        // Look up payment in Supabase
        const { data: payment, error: fetchError } = await supabase
            .from('payments')
            .select('*')
            .eq('id', paymentId)
            .single();

        if (fetchError || !payment) {
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }

        // Deliberately not a row-status check. Until this handler was fixed its
        // writes all failed with 42703, so `payment_status` never became
        // 'refunded' and this guard never ran. Now that the write lands, a
        // guard on the row would refuse the REMAINDER of a partial refund -
        // $100 returned out of $291 would lock the other $191 away for good.
        // What is still refundable is a question only the gateway can answer,
        // and it is asked below against ARC's own transaction list.
        if (payment.payment_status === 'refunded' && !payment.metadata?.refunds?.length) {
            return res.status(400).json({ success: false, error: 'Payment has already been refunded' });
        }

        const refundAmount = parseFloat(amount || payment.amount || 0);
        if (isNaN(refundAmount) || refundAmount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid refund amount' });
        }
        const taken = await claimPaymentRefund(payment, (await getCaller(req))?.id ?? req.user?.id ?? null);
        if (taken.error) {
            return res.status(503).json({ success: false, code: 'REFUND_UNAVAILABLE', error: 'Could not start the refund just now. Nothing has been refunded; try again.' });
        }
        if (!taken.claimed) {
            return res.status(409).json({
                success: false,
                code: 'REFUND_IN_PROGRESS',
                error: 'Someone is refunding this payment right now. Nothing has been refunded; refresh in a few minutes to see what they recorded.',
            });
        }
        claim = taken;
        claimedPaymentId = payment.id;

        // CRITICAL: Use the ARC Pay order ID (FLT...), NOT the Supabase UUID
        const arcOrderId = payment.arc_order_id || paymentId;
        console.log('🔑 ARC Pay Order ID for refund:', arcOrderId, '(Supabase ID:', paymentId, ')');
        const authConfig = getArcPayAuthConfig();

        // Never refund more than the gateway still holds, asked of the gateway.
        //
        // The ceiling used to be `payment.amount - payment.refund_amount`, and
        // `refund_amount` is a column that exists in no schema: it read
        // undefined every time, so `alreadyRefunded` was always 0 and the full
        // captured amount could be refunded again on every call. ARC's own
        // transaction list is the only honest source - the same one
        // reverseArcPaymentForOrder reads.
        const orderUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${arcOrderId}`;
        const orderResp = await axios.get(orderUrl, { headers: authConfig.headers, validateStatus: () => true });
        if (orderResp.status !== 200 || !orderResp.data) {
            await giveBack();
            return res.status(502).json({
                success: false,
                error: `Could not read this payment from ARC Pay (${orderResp.status}). Nothing has been refunded.`,
            });
        }
        const txns = Array.isArray(orderResp.data.transaction) ? orderResp.data.transaction : [];
        // One test of success for every transaction type. Reading captures
        // loosely (`result` OR `gatewayCode`) while reading refunds strictly
        // meant a reversal ARC reported only through `gatewayCode` raised the
        // captured side and reduced nothing - so the ceiling came back at the
        // full capture and the money could go out twice.
        const succeeded = (t) => t.result === 'SUCCESS' || t.response?.gatewayCode === 'APPROVED';
        const sumOf = (list) => list.reduce((sum, t) => sum + (parseFloat(t.transaction?.amount) || 0), 0);

        // The SUM of captures, not the last one. reconcileBookingPayment and
        // inspectArcOrder both sum; taking a single transaction refused a
        // legitimate full refund on an order captured in two parts.
        // `AUTHORIZATION` is deliberately absent: an authorisation is money
        // held, not taken, and nothing can be refunded against it.
        const captured = txns.filter((t) => succeeded(t) && ['PAYMENT', 'CAPTURE'].includes(t.transaction?.type));
        const capturedAmount = Math.round(sumOf(captured) * 100) / 100;
        const alreadyRefunded = Math.round(sumOf(txns.filter((t) => succeeded(t) && t.transaction?.type === 'REFUND')) * 100) / 100;
        const alreadyVoided = txns.some(voidsPayment);

        // Fail CLOSED when the gateway's answer cannot be read.
        //
        // This used to fall back to `orderResp.data.amount ?? payment.amount` -
        // the row's own figure, which is exactly the source this check exists to
        // stop trusting - and both guards below were gated on
        // `capturedAmount > 0`, so a body carrying no recognisable transaction
        // list skipped them entirely and sent any admin-typed amount to ARC with
        // no ceiling at all. A 200 with `{}` is truthy, so the 502 above does
        // not catch it.
        if (capturedAmount <= 0) {
            await giveBack();
            return res.status(502).json({
                success: false,
                error: 'ARC Pay did not report a captured payment for this order, so there is no balance to refund against. '
                    + 'Check the order in ARC Pay before retrying.',
            });
        }
        if (alreadyVoided || alreadyRefunded + 0.01 >= capturedAmount) {
            await giveBack();
            return res.status(400).json({
                success: false,
                error: 'This payment has already been returned in full.',
            });
        }
        const refundCeiling = Math.max(0, Math.round((capturedAmount - alreadyRefunded) * 100) / 100);
        if (refundAmount > refundCeiling + 0.001) {
            await giveBack();
            return res.status(400).json({
                success: false,
                error: `Refund amount exceeds the refundable balance (${refundCeiling.toFixed(2)} ${payment.currency || 'USD'})`,
            });
        }
        // Does this refund exhaust what the gateway holds? Decides whether the
        // rows below read `refunded` or `partially_refunded`.
        const returnsEverything = refundAmount + 0.01 >= refundCeiling;

        const refundTxnId = `refund-admin-${Date.now()}`;
        const refundUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${arcOrderId}/transaction/${refundTxnId}`;

        // From the refund request on, money may have moved, so the claim is no
        // longer handed back on the way out. A request that breaks mid-flight
        // leaves it to expire rather than letting a second refund go out while
        // nobody knows what happened to the first. Only ARC's refusal - money
        // known not to have moved - releases it below.
        const heldClaim = claim;
        claim = null;

        // `refundResponse.ok` used to decide this. ARC answers a refund it
        // refused with HTTP 200 and `result: "FAILURE"`, so a declined refund
        // was written `refunded`, reported to the operator as "Refund processed
        // successfully", and never retried - the customer was never paid. Every
        // other reversal site in this file asks arcSucceeded; this one did not.
        const refundResponse = await axios.put(refundUrl, {
            apiOperation: 'REFUND',
            transaction: {
                amount: refundAmount.toFixed(2),
                currency: payment.currency || 'USD',
                reference: `Admin refund: ${reason}`.substring(0, 40)
            }
        }, { headers: authConfig.headers, validateStatus: () => true });

        if (!arcSucceeded(refundResponse)) {
            await releasePaymentRefund(claimedPaymentId, heldClaim);
            console.error('❌ ARC Pay refund refused:', refundResponse.status, arcFailureSummary(refundResponse.data));
            // Nothing is written. `refund_pending` is not a value the payments
            // CHECK constraint allows and no job ever read it, so recording it
            // only told the operator a refund was under way that nothing would
            // ever carry out.
            return res.status(400).json({
                success: false,
                error: 'ARC Pay refused the refund. Nothing has been refunded - check the order in ARC Pay before trying again.',
                details: arcFailureSummary(refundResponse.data)
            });
        }

        // Only columns this table has. The old write named refund_amount,
        // refund_reason and refunded_at, none of which exist, so the whole
        // update failed with 42703 - unchecked - and even
        // `payment_status: 'refunded'` never landed. The "already been
        // refunded" guard above could therefore never trip, and the same
        // payment could be refunded over and over.
        const refundedAt = new Date().toISOString();
        // The money has moved. The claim is cleared by the write that records
        // the refund; if that write fails it is left to expire, so nobody
        // refunds again while the refund is recorded by hand.
        const { refund_claim: _claim, ...kept } = heldClaim.metadata;
        const { data: paymentWritten, error: paymentUpdateError } = await supabase.from('payments').update({
            // Only once the gateway holds nothing more. Writing 'refunded' for a
            // PARTIAL refund made the guard above refuse every later call, so
            // the remainder could never be returned - and told reconcile and the
            // cancel guard that money still held had already gone back.
            // `payments.payment_status` has no 'partially_refunded' value in its
            // CHECK, so a partial leaves the status alone and records the amount
            // in metadata, which is where the history lives.
            ...(returnsEverything ? { payment_status: 'refunded' } : {}),
            metadata: {
                ...kept,
                refunds: [
                    ...(kept.refunds || []),
                    { amount: refundAmount, reason, transactionId: refundTxnId, at: refundedAt, by: 'admin' }
                ]
            },
            updated_at: refundedAt
        }).eq('id', paymentId).eq(PAYMENT_REFUND_CLAIM, heldClaim.stamp).select('id');
        // Matching nothing means the claim was lost while ARC answered: the
        // refund happened and this row does not say so.
        const paymentWriteError = paymentUpdateError
            || (!paymentWritten?.length ? new Error('the payment changed hands before the refund was recorded') : null);

        // The booking this payment belongs to, found the way it is actually
        // linked. This used to filter `bookings.id` by `payment.quote_id` - a
        // quotes primary key - so it matched nothing, or something unrelated.
        // `bookings` has no quote_id, payment_id or inquiry_id column; the ARC
        // order id is the booking reference.
        let bookingWriteError = null;
        if (payment.arc_order_id) {
            const { error } = await supabase.from('bookings')
                // `bookings.payment_status` DOES allow partially_refunded
                // (migrations/add_partially_refunded_status.sql), so the row can
                // say what actually happened.
                .update({
                    payment_status: returnsEverything ? 'refunded' : 'partially_refunded',
                    updated_at: refundedAt,
                })
                .eq('booking_reference', payment.arc_order_id);
            bookingWriteError = error || null;
        }

        if (paymentWriteError || bookingWriteError) {
            console.error('❌ Refund went through at ARC Pay but was not recorded:',
                paymentWriteError?.message || bookingWriteError?.message);
            return res.status(500).json({
                success: false,
                code: 'RECORD_FAILED',
                error: 'The refund went through at ARC Pay, but it could not be recorded here. Do not send it again - record it by hand.',
                refund: { paymentId, amount: refundAmount, transactionId: refundTxnId }
            });
        }

        console.log('✅ Refund processed successfully:', paymentId);
        return res.json({
            success: true,
            message: 'Refund processed successfully',
            refund: {
                paymentId,
                amount: refundAmount,
                transactionId: refundTxnId,
                status: 'refunded'
            }
        });
    } catch (error) {
        console.error('❌ Payment refund error:', errorSummary(error));
        // Handed back only if the refund was never requested: `claim` is
        // cleared just before it is.
        await giveBack().catch(() => {});
        return res.status(500).json({ success: false, error: 'Failed to process refund', details: error.message });
    }
}

export async function handlePaymentVoid(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // AUTHORIZATION: voiding a gateway transaction is admin-only. Same reason as
    // handlePaymentRefund — the `?action=` router applies no auth middleware.
    if (!(await requireBookingStaff(req, res))) return;

    // The claim this void holds on a flight booking, when it took one. Handed
    // back on every way out that does not void, so a refused or failed void
    // leaves the booking exactly as it found it.
    let claim = null;
    let claimedBooking = null;
    const giveBack = async () => {
        const held = claim;
        claim = null;
        if (held?.claimed) await releaseCancellation(claimedBooking, held);
    };

    try {
        console.log('🚫 Handling PAYMENT-VOID operation');
        // The admin UI sends `paymentId` = ARC order id (CRZ.../HTL.../FLT...) or booking reference.
        const { paymentId, bookingReference, orderId: orderIdInput, reason = 'Admin initiated void' } = req.body;
        const ref = bookingReference || orderIdInput || paymentId;

        if (!ref) {
            return res.status(400).json({ success: false, error: 'A booking reference or order id is required' });
        }

        // 1. Resolve the booking (source of truth) by reference OR by stored order_id
        const { data: booking } = await supabase
            .from('bookings')
            .select('*')
            .or((r => `booking_reference.eq.${r},booking_details->>order_id.eq.${r}`)(sanitizeRef(ref)))
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        // Legacy: a payments row may exist (keyed by id or arc_order_id)
        const { data: payment } = await supabase
            .from('payments')
            .select('*')
            .or((r => `id.eq.${r},arc_order_id.eq.${r}`)(sanitizeRef(ref)))
            .limit(1)
            .maybeSingle();

        if (!booking && !payment) {
            return res.status(404).json({ success: false, error: 'No booking or payment found for the provided reference' });
        }

        if (booking && (booking.status === 'cancelled' || ['voided', 'refunded', 'partially_refunded'].includes(booking.payment_status))) {
            return res.status(400).json({
                success: false,
                error: 'This booking has already been voided/refunded/cancelled',
                booking: { reference: booking.booking_reference, status: booking.status, payment_status: booking.payment_status }
            });
        }

        // A flight's payment pays for seats. Voiding it released nothing at the
        // airline: on a booking with a PNR the reservation stayed live with
        // nothing paying for it, and the row was written cancelled and refunded,
        // so the paid-not-ticketed alarm and the failed-refund alarm both
        // skipped it. A flight with a reservation is cancelled with Cancel &
        // Refund, which releases the seats before any money moves; one being
        // booked, queued or cancelled right now waits.
        if (booking && (booking.travel_type === 'flight' || booking.travel_type == null)) {
            const details = booking.booking_details || {};
            const reservation = details.pnr || details.amadeus_order_id;
            if (reservation) {
                return refuse(res, 409, 'USE_CANCEL_AND_REFUND',
                    `This flight has an airline reservation (${reservation}). Voiding the payment would leave that reservation live `
                    + 'with nothing paying for it. Use Cancel & Refund, which releases the seats first. Nothing has been changed.',
                    { bookingReference: booking.booking_reference });
            }
            const busyText = 'This booking is being confirmed with the airline or cancelled right now, so its payment cannot be voided. '
                + 'Nothing has been changed. Refresh it in a few minutes and check it before trying again.';
            if (liveChainState(details.gds_chain) || details.queued_order) {
                return refuse(res, 409, 'BOOKING_BUSY', busyText, { bookingReference: booking.booking_reference });
            }
            // Taken the way a cancellation takes it, so the chain cannot start
            // selling seats against the payment while ARC voids it, and a PNR
            // committed since the row was read makes the claim match nothing.
            const taken = await claimCancellation(booking, { requireNoReservation: true });
            if (taken.error) {
                return refuse(res, 503, 'VOID_UNAVAILABLE', 'We could not start the void just now. Nothing has been changed. Try again in a minute.',
                    { bookingReference: booking.booking_reference, retryable: true });
            }
            if (!taken.claimed) {
                return refuse(res, 409, 'BOOKING_BUSY', busyText, { bookingReference: booking.booking_reference });
            }
            claim = taken;
            claimedBooking = booking;
        }

        const arcOrderId = booking?.booking_details?.order_id || payment?.arc_order_id || booking?.booking_reference || ref;
        const authConfig = getArcPayAuthConfig();

        // 2. RETRIEVE_ORDER to (a) verify the order is still voidable and (b) find the target transaction id
        //
        // Both come from ARC or the void does not happen. When the order could
        // not be read this used to void anyway, aimed at an id the rows held -
        // for a hotel or a cruise `booking_details.transaction_id` is the ARC
        // result indicator, not a transaction - on an order whose state nobody
        // had looked at. Refused instead, the way a cancellation refuses when
        // the gateway cannot say what it holds.
        let targetTxnId = null;
        let voidedAmount = null;
        let orderStatus = null;
        let orderRead = false;
        try {
            const orderUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${arcOrderId}`;
            const orderResp = await axios.get(orderUrl, { headers: authConfig.headers, validateStatus: () => true });
            if (orderResp.status === 200 && orderResp.data) {
                orderRead = true;
                orderStatus = orderResp.data.status; // e.g. CAPTURED, AUTHORIZED, REFUNDED, CANCELLED
                const txns = Array.isArray(orderResp.data.transaction) ? orderResp.data.transaction : [];

                // Already voided/cancelled on the gateway?
                const hasVoid = txns.some(voidsPayment);
                if (orderStatus === 'CANCELLED' || hasVoid) {
                    await giveBack();
                    return res.status(400).json({ success: false, error: 'The payment is already voided on the gateway', orderStatus });
                }

                // Find the most recent successful PAYMENT/CAPTURE/AUTHORIZATION to void
                const candidates = txns.filter(t => {
                    const type = t.transaction?.type;
                    const ok = t.result === 'SUCCESS' || t.response?.gatewayCode === 'APPROVED';
                    return ok && ['PAYMENT', 'CAPTURE', 'AUTHORIZATION'].includes(type);
                });
                if (candidates.length) {
                    targetTxnId = candidates[candidates.length - 1].transaction.id;
                    voidedAmount = Number(candidates[candidates.length - 1].transaction.amount) || null;
                }
                console.log('🔍 RETRIEVE_ORDER status:', orderStatus, '| target txn:', targetTxnId);
            } else {
                console.warn('⚠️ RETRIEVE_ORDER non-200:', orderResp.status);
            }
        } catch (retrieveErr) {
            console.warn('⚠️ RETRIEVE_ORDER failed:', retrieveErr.message);
        }

        if (!orderRead) {
            await giveBack();
            return res.status(503).json({
                success: false,
                code: 'GATEWAY_UNAVAILABLE',
                retryable: true,
                error: 'Could not read this payment from ARC Pay, so nothing was voided. Try again in a few minutes.'
            });
        }

        if (!targetTxnId) {
            await giveBack();
            return res.status(400).json({
                success: false,
                error: 'Could not determine the transaction to void. If the payment has settled, use Cancel & Refund instead.'
            });
        }

        // 3. Issue the VOID against the original transaction
        const voidTxnId = `void-admin-${Date.now()}`;
        const voidUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${arcOrderId}/transaction/${voidTxnId}`;
        console.log('🚫 Issuing VOID — order:', arcOrderId, 'target txn:', targetTxnId);

        const voidResponse = await axios.put(voidUrl, {
            apiOperation: 'VOID',
            transaction: {
                targetTransactionId: targetTxnId,
                reference: `Admin void: ${reason}`.substring(0, 40)
            }
        }, { headers: authConfig.headers, validateStatus: () => true });

        // `|| !voidResponse.data?.result` used to sit here: a reply with no
        // result at all counted as a successful void, and the booking was
        // written cancelled and refunded on it. Only SUCCESS is a void.
        if (!arcSucceeded(voidResponse)) {
            console.error('❌ ARC Pay VOID failed:', voidResponse.status, arcFailureSummary(voidResponse.data));
            await giveBack();
            return res.status(400).json({
                success: false,
                error: 'Failed to void payment. It may have already settled — use Cancel & Refund instead.',
                orderStatus,
                details: arcFailureSummary(voidResponse.data)
            });
        }

        console.log('✅ ARC Pay VOID successful:', voidResponse.data?.result || voidResponse.status);
        const voidedAt = new Date().toISOString();

        // 4a. Update the booking (DB payment_status constraint allows 'refunded' — funds fully returned by void)
        //
        // From here the money is back with the customer, so a write that fails,
        // or matches nothing because the booking changed hands while ARC
        // answered, is not a success. It used to be logged and answered "Payment
        // voided successfully", leaving the booking `paid` for money that had
        // gone back - which the order route and the paid-not-ticketed alarm read
        // as a live payment. It is answered the way a refund that could not be
        // recorded is (handlePaymentRefund, RECORD_FAILED).
        let recordError = null;
        if (booking) {
            // Read back rather than spread the row this request started with:
            // reconcile, a chain or a cancellation may have written since, and
            // writing the old copy of the whole column undid them.
            const current = (await readBookingDetails(booking.id)) || claim?.details || booking.booking_details || {};
            let update = supabase.from('bookings').update({
                status: 'cancelled',
                payment_status: 'refunded',
                booking_details: {
                    ...current,
                    // Left finished, as a cancellation leaves it, so a late order
                    // attempt is refused rather than booked against a void.
                    ...(claim ? { gds_chain: { ...(claim.prior || {}), state: 'cancelled', startedAt: claim.stamp, cancelledAt: voidedAt } } : {}),
                    void: {
                        voidTransactionId: voidTxnId,
                        targetTransactionId: targetTxnId,
                        reason,
                        voidedAt
                    },
                    cancellation: {
                        ...(current.cancellation || {}),
                        cancelledAt: voidedAt,
                        reason,
                        paymentAction: 'VOID',
                        refundAmount: voidedAmount ?? (parseFloat(booking.total_amount) || 0),
                        cancellationFee: 0
                    }
                },
                updated_at: voidedAt
            }).eq('id', booking.id);
            // Still this void's booking: nothing may have taken it while ARC answered.
            if (claim) update = update.eq('booking_details->gds_chain->>startedAt', claim.stamp);
            const { data: written, error: bErr } = await update.select('id');
            if (bErr) {
                console.error('⚠️ Booking void-update failed:', bErr.message);
                recordError = `the booking could not be updated (${bErr.message})`;
            } else if (!written?.length) {
                console.error('⚠️ Payment voided, but the booking changed hands before it was recorded', { bookingReference: booking.booking_reference });
                recordError = 'the booking changed hands before the void was recorded';
            }
            claim = null;
        }

        // 4b. Update the legacy payments row if one exists (store void info in metadata JSON — no schema change).
        // NOTE: the payments.payment_status CHECK only allows pending|processing|completed|failed|refunded,
        // so a void is recorded as 'refunded' (funds fully returned); paymentAction:'VOID' in metadata
        // distinguishes it from an actual gateway refund.
        if (payment) {
            const { error: pErr } = await supabase.from('payments').update({
                payment_status: 'refunded',
                metadata: {
                    ...(payment.metadata || {}),
                    void: { transactionId: voidTxnId, targetTransactionId: targetTxnId, reason, voidedAt, paymentAction: 'VOID' }
                }
            }).eq('id', payment.id);
            if (pErr) {
                console.error('⚠️ Payment void-update failed:', pErr.message);
                recordError = recordError || `the payment record could not be updated (${pErr.message})`;
            }
        }

        if (recordError) {
            return res.status(500).json({
                success: false,
                code: 'RECORD_FAILED',
                error: 'The void went through at ARC Pay, but it could not be recorded here. Do not void it again - record it by hand.',
                reason: recordError,
                void: { bookingReference: booking?.booking_reference || ref, orderId: arcOrderId, voidTransactionId: voidTxnId, targetTransactionId: targetTxnId }
            });
        }

        return res.json({
            success: true,
            message: 'Payment voided successfully',
            void: {
                bookingReference: booking?.booking_reference || ref,
                orderId: arcOrderId,
                voidTransactionId: voidTxnId,
                targetTransactionId: targetTxnId,
                status: 'voided'
            }
        });
    } catch (error) {
        console.error('❌ Payment void error:', errorSummary(error));
        await giveBack().catch(() => {});
        return res.status(500).json({ success: false, error: 'Failed to void payment', details: error.message });
    }
}

export async function handlePaymentRetrieve(req, res) {
    // AUTHORIZATION: staff only, like refund and void above. It answers with
    // the full payments row and the live gateway order - cardholder name,
    // billing address, the success indicator - and its only caller is the
    // admin panel's "Check status" button. It was open to anyone with an id.
    if (!(await requireBookingStaff(req, res))) return;

    try {
        console.log('🔍 Handling PAYMENT-RETRIEVE operation');
        const { paymentId } = req.query;

        if (!paymentId) {
            return res.status(400).json({ success: false, error: 'paymentId is required' });
        }

        // Get local payment record
        const { data: payment, error: fetchError } = await supabase
            .from('payments')
            .select('*')
            .eq('id', paymentId)
            .single();

        if (fetchError || !payment) {
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }

        // The order ARC opened for this payment. For a quote that is the row's
        // own id; for a payment link it is `PL-...`, and asking for the row's
        // id 404'd, so the button did nothing for every payment-link payment.
        const arcOrderId = payment.arc_order_id || paymentId;
        let arcPayData = null;
        let arcHttpStatus = null;
        try {
            const authConfig = getArcPayAuthConfig();
            const orderUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${arcOrderId}`;

            const orderResponse = await fetch(orderUrl, {
                method: 'GET',
                headers: authConfig.headers
            });
            arcHttpStatus = orderResponse.status ?? null;
            if (orderResponse.ok) arcPayData = await orderResponse.json();
        } catch (arcError) {
            console.warn('⚠️ Could not retrieve ARC Pay status:', arcError.message);
        }

        // Not asked is not in agreement. This answered success with the row as
        // it was, so the desk read "checked" when ARC had never been reached.
        if (!arcPayData) {
            return res.status(502).json({
                success: false,
                error: `Could not read this payment from ARC Pay${arcHttpStatus ? ` (${arcHttpStatus})` : ''}. Nothing was changed.`,
            });
        }

        // Sync status from ARC Pay to local DB, in values the payments CHECK
        // allows: pending|processing|completed|failed|refunded. This wrote
        // 'partially_refunded' and 'voided', and `last_status_check`, a column
        // the table does not have - so every write failed with 42703 or 23514,
        // unread, and the stale row was returned as if it had been synced.
        //  - a voided order returned everything; the void itself records that
        //    as 'refunded' (handlePaymentVoid), which is only true of a payment
        //    that had been taken;
        //  - a partial refund has no value here; handlePaymentRefund leaves the
        //    status as it is and keeps the history in metadata.
        const arcStatus = arcPayData?.status;
        let localStatus = payment.payment_status;
        if (arcStatus === 'CAPTURED') {
            localStatus = 'completed';
        } else if (arcStatus === 'REFUNDED') {
            localStatus = 'refunded';
        } else if ((arcStatus === 'VOID' || arcStatus === 'CANCELLED') && payment.payment_status === 'completed') {
            localStatus = 'refunded';
        }

        let current = payment;
        if (localStatus !== payment.payment_status) {
            const { data: written, error: writeError } = await supabase.from('payments').update({
                payment_status: localStatus,
                updated_at: new Date().toISOString()
            }).eq('id', paymentId).select('*');
            if (writeError || !written?.length) {
                console.error('❌ Payment status sync failed:', writeError?.message || 'no row matched', { paymentId, arcStatus });
                return res.status(500).json({
                    success: false,
                    error: `ARC Pay shows this payment as ${arcStatus}, but the record here could not be updated.`,
                    payment,
                    orderData: arcPayData
                });
            }
            current = written[0];
        }

        return res.json({
            success: true,
            payment: current,
            orderData: arcPayData
        });
    } catch (error) {
        console.error('❌ Payment retrieve error:', errorSummary(error));
        return res.status(500).json({ success: false, error: 'Failed to retrieve payment', details: error.message });
    }
}

const roundCents = (value) => Math.round(Number(value) * 100) / 100;

/**
 * ARC Pay answered, and the answer is no: a reply it wrote itself - not a
 * gateway or proxy error - whose result is FAILURE or ERROR. Money is known not
 * to have moved. Anything else short of SUCCESS (no reply at all, a 5xx, a
 * PENDING or UNKNOWN result, a reply with no result) says nothing about whether
 * the refund was made.
 */
const arcRefused = (response) => Number(response?.status) < 500
    && ['FAILURE', 'ERROR'].includes(response?.data?.result);

/**
 * REFUND exactly `amount` on an ARC order. Never throws.
 *
 * `refused` only when ARC Pay said no. A request that broke after it was sent,
 * or an answer that is not one, is `ok: false` and not `refused`: the money
 * may have gone back.
 */
async function refundArcAmount(orderId, { amount, currency = 'USD', reason = 'Admin refund' }) {
    const transactionId = `refund-admin-${Date.now()}`;
    try {
        const url = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${orderId}/transaction/${transactionId}`;
        const resp = await axios.put(url, {
            apiOperation: 'REFUND',
            transaction: { amount: amount.toFixed(2), currency, reference: String(reason).substring(0, 40) },
        }, { headers: getArcPayAuthConfig().headers, validateStatus: () => true });
        const ok = arcSucceeded(resp);
        if (!ok) console.error('❌ Admin ARC refund not accepted:', resp?.status, arcFailureSummary(resp?.data));
        return { ok, refused: !ok && arcRefused(resp), transactionId, httpStatus: resp?.status ?? null };
    } catch (error) {
        console.error('❌ Admin ARC refund error:', error.message);
        return { ok: false, refused: false, transactionId, httpStatus: null };
    }
}

/**
 * Finish the refund of a cancelled flight booking by hand, and make the booking
 * say what actually happened.
 *
 * A cancellation whose automatic refund failed, or was held for review, reads
 * "Refund not processed" or "Refund under review" in My Trips and Manage
 * Booking, and pages the payment-failure alert. The desk then refunds the card
 * - in the ARC portal, or nowhere the site could see - and the booking kept
 * saying the refund never happened. The only refund button in the admin panel
 * was for quote payments, and never touched a flight booking.
 *
 * Two modes, and the gateway is the record either way:
 *  - `sync`: the refund was made outside the site. Ask ARC what it refunded and
 *    record that; nothing is moved.
 *  - `refund`: refund `amount` now, never more than ARC still holds, then ask
 *    ARC again and record what it shows.
 * The amounts written come from ARC, never from the admin's typing.
 *
 * @returns {Promise<{ status: number, body: object }>}
 */
/**
 * How long one desk member's hold on finishing a booking's refund lasts: far
 * longer than a refund and two gateway reads take, short enough that a closed
 * tab does not lock the booking for good.
 */
const MANUAL_REFUND_CLAIM_TTL_MS = 5 * 60_000;
const MANUAL_REFUND_CLAIM = 'booking_details->cancellation->manual_refund_claim->>claimedAt';

/**
 * Take the booking's refund for one desk member, or learn that someone else has
 * it. Two admins pressing Finish refund both read "ARC holds 291" and both
 * refunded it. A compare-and-set on the claim stamp decides, as the booking
 * chain's claim does; the write is pinned to the row it read
 * (utils/bookingDetailsGuard.js), so it undoes nothing written since.
 */
async function claimManualRefund(booking, adminId) {
    const { data: row, error: readError } = await supabase
        .from('bookings')
        .select('status, payment_status, booking_details')
        .eq('id', booking.id)
        .single();
    if (readError || !row) return { claimed: false, error: readError || new Error('booking not found') };

    const details = row.booking_details || {};
    const cancellation = details.cancellation || {};
    const prior = cancellation.manual_refund_claim?.claimedAt ?? null;
    if (prior && Date.now() - Date.parse(prior) < MANUAL_REFUND_CLAIM_TTL_MS) return { claimed: false };

    const stamp = new Date().toISOString();
    const claimedDetails = { ...details, cancellation: { ...cancellation, manual_refund_claim: { claimedAt: stamp, by: adminId } } };
    let update = supabase.from('bookings').update({ booking_details: claimedDetails }).eq('id', booking.id);
    update = unchangedSince(update, row);
    update = prior === null ? update.is(MANUAL_REFUND_CLAIM, null) : update.eq(MANUAL_REFUND_CLAIM, prior);
    const { data, error } = await update.select('id');
    if (error) return { claimed: false, error };
    if (!data?.length) return { claimed: false };
    return { claimed: true, stamp, details: claimedDetails };
}

/** Let go of a refund claim that recorded nothing. Conditioned on its own stamp. */
async function releaseManualRefund(booking, claim) {
    const details = await readBookingDetails(booking.id);
    if (!details?.cancellation?.manual_refund_claim) return;
    const { manual_refund_claim: _mine, ...cancellation } = details.cancellation;
    const { error } = await supabase
        .from('bookings')
        .update({ booking_details: { ...details, cancellation } })
        .eq('id', booking.id)
        .eq(MANUAL_REFUND_CLAIM, claim.stamp);
    if (error) console.error('⚠️ Could not release the manual refund claim:', error.message);
}

/**
 * A refund sent from here that ARC Pay never answered, kept on the booking in
 * place of the claim.
 *
 * The claim alone cannot guard it: it lapses in minutes, and after that a
 * press read "ARC holds 171", saw room for another 120 and sent it. So the
 * refund is written down - how much, and what ARC showed as refunded before it
 * - and every later press compares ARC's ledger with that before sending
 * anything. The claim goes in the same write, so Check ARC Pay can run at once.
 * Conditioned on our own claim stamp, as the release is.
 */
async function noteUnansweredRefund(booking, claim, unanswered) {
    const details = await readBookingDetails(booking.id);
    if (!details?.cancellation) return false;
    const { manual_refund_claim: _mine, ...cancellation } = details.cancellation;
    const { data, error } = await supabase
        .from('bookings')
        .update({ booking_details: { ...details, cancellation: { ...cancellation, unansweredRefund: unanswered } } })
        .eq('id', booking.id)
        .eq(MANUAL_REFUND_CLAIM, claim.stamp)
        .select('id');
    if (error || !data?.length) {
        console.error('❌ Could not record the unanswered refund; the claim is left to expire:', error?.message || 'the claim was lost', {
            bookingReference: booking.booking_reference, ...unanswered,
        });
        return false;
    }
    return true;
}

/**
 * ARC could not be asked. A 400 or a 404 is ARC saying it has no such order -
 * an answer. Anything else, a 5xx included, is an outage, and used to read as
 * "ARC Pay shows no payment for this booking".
 */
const gatewayDown = (result) => Boolean(result?.gatewayUnavailable) && ![400, 404].includes(result.gatewayStatus);

/** Whether ARC's reading shows money returned since the unanswered refund was sent. */
const returnedSinceUnanswered = (unanswered, reading) => reading?.voided === true
    || roundCents(reading?.refundedTotal ?? 0) > roundCents(unanswered?.refundedBefore ?? 0) + 0.009;

/**
 * Too soon for ARC's silence about an unanswered refund to mean it never
 * happened: the claim's own lifetime, far longer than a refund takes to appear.
 * A time that cannot be read counts as recent.
 */
const unansweredRecently = (unanswered) => !(Date.now() - Date.parse(unanswered?.at) >= MANUAL_REFUND_CLAIM_TTL_MS);

export async function settleManualFlightRefund(booking, { mode = 'sync', amount, reason = 'Admin refund', adminId = null } = {}) {
    const answer = (status, body) => ({ status, body });
    if (!booking) return answer(404, { success: false, error: 'Booking not found' });
    if (booking.travel_type !== 'flight' || booking.status !== 'cancelled') {
        return answer(409, {
            success: false,
            code: 'NOT_A_CANCELLED_FLIGHT',
            error: 'Only a cancelled flight booking can have its refund finished here.',
        });
    }

    // A refund pays out against the airline booking, so only once the airline
    // has released it. A PNR the cancel never confirmed cancelled - a fallback
    // cancel, a status set by hand, an old void - may still be a flight the
    // customer can board. A sync records a refund already made elsewhere, so it
    // is still recorded; it just does not close the review.
    const initialDetails = booking.booking_details || {};
    const reservation = initialDetails.pnr || initialDetails.amadeus_order_id || null;
    const airlineReleased = !reservation || initialDetails.cancellation?.amadeusCancelled === true;
    if (mode === 'refund' && !airlineReleased) {
        return answer(409, {
            success: false,
            code: 'AIRLINE_NOT_CANCELLED',
            error: `The airline reservation (${reservation}) was never confirmed cancelled, so a refund now could pay out against a flight `
                + 'that is still live. Cancel it with the airline first. Nothing was refunded or changed.',
        });
    }

    const claim = await claimManualRefund(booking, adminId);
    if (claim.error) {
        return answer(503, { success: false, code: 'REFUND_UNAVAILABLE', error: 'Could not start the refund just now. Nothing was refunded or changed; try again.' });
    }
    if (!claim.claimed) {
        return answer(409, {
            success: false,
            code: 'REFUND_IN_PROGRESS',
            error: 'Someone is finishing this booking\'s refund right now. Nothing was refunded or changed; refresh in a few minutes to see what they recorded.',
        });
    }
    const giveUp = async (status, body) => {
        await releaseManualRefund(booking, claim);
        return answer(status, body);
    };
    // Reconcile writes the row from what it is handed: hand it the claimed copy,
    // so the claim is not written away.
    const claimedBooking = { ...booking, booking_details: claim.details };

    const before = await reconcileBookingPayment(claimedBooking, { fresh: true });
    if (gatewayDown(before)) {
        return giveUp(503, { success: false, code: 'GATEWAY_UNAVAILABLE', error: 'Could not reach ARC Pay. Nothing was refunded or changed.' });
    }
    if (!before.everCaptured) {
        return giveUp(409, { success: false, code: 'NOTHING_CAPTURED', error: 'ARC Pay shows no payment for this booking, so there is nothing to refund.' });
    }

    const currency = initialDetails.arc_captured_currency || initialDetails.currency || 'USD';
    let manual = { mode, reason, by: adminId, at: new Date().toISOString() };

    // A refund an earlier press sent and never heard back about (below). ARC's
    // ledger decides it before anything else is sent: money returned since then
    // means it went through - or someone refunded in the portal - and either
    // way nothing more goes out; what ARC shows is recorded, as Check ARC Pay
    // would. Nothing returned, and too soon for that to mean anything: nothing
    // is sent. Nothing returned long after: it never happened.
    const unanswered = claim.details.cancellation?.unansweredRefund || null;
    let sending = mode === 'refund';
    if (sending && unanswered) {
        if (returnedSinceUnanswered(unanswered, before)) {
            sending = false;
            manual = { ...manual, mode: 'sync', earlierUnanswered: unanswered };
        } else if (unansweredRecently(unanswered)) {
            return giveUp(409, {
                success: false,
                code: 'REFUND_UNANSWERED',
                error: `A refund of ${roundCents(unanswered.amount).toFixed(2)} ${unanswered.currency || currency} was sent to ARC Pay `
                    + `at ${unanswered.at} and never answered, and ARC Pay does not show it yet. Nothing was sent now. `
                    + 'Press Check ARC Pay in a few minutes to see whether it went through before sending anything.',
            });
        }
    }

    if (sending) {
        const wanted = roundCents(amount);
        const held = roundCents(before.heldAmount ?? 0);
        if (!Number.isFinite(wanted) || wanted <= 0) {
            return giveUp(400, { success: false, code: 'INVALID_AMOUNT', error: 'Enter the amount to refund.' });
        }
        if (wanted > held + 0.001) {
            return giveUp(400, {
                success: false,
                code: 'AMOUNT_OVER_HELD',
                error: `ARC Pay holds ${held.toFixed(2)} ${currency} for this booking; a refund cannot be more than that.`,
            });
        }
        const orderId = initialDetails.order_id || booking.booking_reference;
        const refund = await refundArcAmount(orderId, { amount: wanted, currency, reason });
        if (refund.refused) {
            return giveUp(502, { success: false, code: 'REFUND_REFUSED', error: 'ARC Pay did not accept the refund. Nothing was recorded; try again or refund in the ARC portal and then sync.' });
        }
        if (!refund.ok) {
            // Sent, and no answer: ARC Pay may have refunded. Not handed back as
            // "not accepted" - that is what sent the same refund twice.
            await noteUnansweredRefund(booking, claim, {
                amount: wanted,
                currency,
                transactionId: refund.transactionId,
                at: new Date().toISOString(),
                by: adminId,
                refundedBefore: roundCents(before.refundedTotal ?? 0),
            });
            return answer(502, {
                success: false,
                code: 'REFUND_UNANSWERED',
                error: `The refund of ${wanted.toFixed(2)} ${currency} was sent to ARC Pay and no answer came back, so it may have gone through. `
                    + 'Do not send it again: press Check ARC Pay first (Sync from ARC in the admin panel), which records what ARC Pay shows.',
            });
        }
        manual = { ...manual, amount: wanted, transactionId: refund.transactionId };
    }

    // What the gateway shows now is what gets recorded. A successful VOID
    // returns the whole capture and records no REFUND, so a voided payment used
    // to read as "no refund found" and could never be recorded.
    const after = await reconcileBookingPayment(claimedBooking, { fresh: true });
    const confirmed = !gatewayDown(after) && Number.isFinite(Number(after.refundedTotal));
    const source = confirmed ? after : before;
    const voided = source.voided === true;
    const returnedTotal = roundCents(voided
        ? source.capturedTotal
        : confirmed ? after.refundedTotal : (before.refundedTotal ?? 0) + (manual.amount ?? 0));
    const held = roundCents(voided ? 0 : confirmed ? (after.heldAmount ?? 0) : Math.max(0, (before.heldAmount ?? 0) - (manual.amount ?? 0)));
    if (!confirmed) manual = { ...manual, unconfirmed: 'ARC Pay could not be asked again after the refund; recorded from the refund it accepted' };

    // An unanswered refund stays on the booking while it may still land: ARC
    // shows nothing returned since it was sent, and it is too soon to say it
    // never went through. Anything else settles it - this press sent a refund
    // ARC accepted, or ARC's ledger now answers for it.
    const stillUnanswered = Boolean(unanswered) && !manual.transactionId
        && unansweredRecently(unanswered) && !returnedSinceUnanswered(unanswered, source);

    if (!(returnedTotal > 0)) {
        return giveUp(409, {
            success: false,
            code: 'NO_REFUND_FOUND',
            error: stillUnanswered
                ? `ARC Pay does not show the refund of ${roundCents(unanswered.amount).toFixed(2)} ${unanswered.currency || currency} `
                    + `sent at ${unanswered.at} yet. Nothing was recorded; check again in a few minutes before sending anything.`
                : 'ARC Pay shows no refund for this booking yet. Refund it first, here or in the ARC portal.',
        });
    }

    // Re-read: reconcile writes the row too, and this must not undo that.
    const currentDetails = (await readBookingDetails(booking.id)) || claim.details;
    const {
        manual_refund_claim: _claim, stillHeld: _before, unansweredRefund: _unanswered, ...previous
    } = currentDetails.cancellation || {};
    const fullyReturned = held <= 0.009;
    // What ARC still holds is a fee only when the cancel decided to keep one and
    // what is held is no more than that fee. Everything held was recorded as
    // "a cancellation fee was kept" - and the Finish refund button went away
    // with money still owed. Now the rest is recorded as still held, and the
    // desk is offered the refund again until it is returned.
    //
    // The fee the cancel DECIDED, carried across every refund by hand
    // (`decidedFee`, shared/reviewQueue.js decidedFeeOf): `cancellationFee`
    // below is what was kept so far, 0 while more than the fee is held, and
    // read back from there the next press lost the fee - it was "owed", and
    // finishing the refund sent it back to the card.
    const decidedFee = decidedFeeOf(previous);
    const intendedFee = decidedFee ?? roundCents(Number(previous.cancellationFee) || 0);
    const feeKept = !fullyReturned && intendedFee > 0 && held <= intendedFee + 0.009;
    const stillHeld = fullyReturned || feeKept ? 0 : held;
    const cancellation = {
        ...previous,
        paymentAction: voided ? 'VOID' : fullyReturned ? 'FULL_REFUND' : 'PARTIAL_REFUND',
        refundAmount: returnedTotal,
        cancellationFee: feeKept ? held : 0,
        ...(decidedFee !== null ? { decidedFee } : {}),
        ...(stillHeld > 0 ? { stillHeld } : {}),
        ...(stillUnanswered ? { unansweredRefund: unanswered } : {}),
        currency,
        manualRefund: { ...manual, previousPaymentAction: previous.paymentAction ?? null },
    };
    // Closed only when nothing more is owed and the airline let the booking go.
    const settled = stillHeld === 0 && airlineReleased;
    // A flag listing tickets to claim from the airline is not closed by the
    // customer's refund: the tickets' value is still with the airline. Stamped
    // here, "Refund to claim from the airline" left the desk with nothing
    // claimed. Whoever makes the claim resolves it.
    const review = currentDetails.needs_review && settled
        && !needsAirlineRefundClaim({ booking_details: currentDetails })
        ? { ...currentDetails.needs_review, resolved_at: manual.at, resolution: 'refund finished by the desk' }
        : currentDetails.needs_review;
    const paymentStatus = fullyReturned ? 'refunded' : 'partially_refunded';

    const { data: written, error: updateError } = await supabase.from('bookings').update({
        payment_status: paymentStatus,
        booking_details: { ...currentDetails, cancellation, ...(review ? { needs_review: review } : {}) },
        updated_at: manual.at,
    }).eq('id', booking.id).eq(MANUAL_REFUND_CLAIM, claim.stamp).select('id');
    if (updateError || !written?.length) {
        console.error('❌ Could not record the manual refund:', updateError?.message || 'the claim was lost');
        return answer(500, {
            success: false,
            code: 'RECORD_FAILED',
            error: mode === 'refund'
                ? 'The refund went through at ARC Pay, but the booking could not be updated. Use Sync to record it.'
                : 'The booking could not be updated. Try again.',
        });
    }

    console.log('💵 Manual refund recorded', { bookingReference: booking.booking_reference, mode, returnedTotal, held, stillHeld });
    return answer(200, {
        success: true,
        message: manual.earlierUnanswered
            ? `ARC Pay shows the refund sent at ${manual.earlierUnanswered.at} went through, so nothing more was sent. ${cancellationMessage({ cancellation })}`
            : cancellationMessage({ cancellation }),
        paymentStatus,
        cancellation,
    });
}

// Reverse a captured ARC payment for an order — used when fulfillment fails AFTER the
// customer was charged (e.g. ticket issuance fails). Issues a VOID if the transaction is
// not yet settled, otherwise a full REFUND. Safe to call even if there is nothing to
// reverse (reports reversed:false rather than throwing). Returns:
//   { reversed: boolean, action: 'VOID'|'REFUND'|'ALREADY_REVERSED'|'NONE'|'FAILED', ... }
export async function reverseArcPaymentForOrder(orderId, { amount, currency = 'USD', reason = 'Booking could not be completed' } = {}) {
    if (!orderId) return { reversed: false, action: 'NONE', error: 'no orderId' };
    const authConfig = getArcPayAuthConfig();
    try {
        // RETRIEVE_ORDER to inspect transactions and find what to reverse.
        const orderUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${orderId}`;
        const orderResp = await axios.get(orderUrl, { headers: authConfig.headers, validateStatus: () => true });
        if (orderResp.status !== 200 || !orderResp.data) {
            return { reversed: false, action: 'NONE', error: `retrieve order failed (${orderResp.status})` };
        }
        const order = orderResp.data;
        const txns = Array.isArray(order.transaction) ? order.transaction : [];

        if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
            return { reversed: true, action: 'ALREADY_REVERSED', orderStatus: order.status };
        }

        // Find the most recent successful capture/authorization to reverse.
        const captured = [...txns].reverse().find(t => {
            const type = t.transaction?.type;
            const ok = t.result === 'SUCCESS' || t.response?.gatewayCode === 'APPROVED';
            return ok && ['PAYMENT', 'CAPTURE', 'AUTHORIZATION'].includes(type);
        });
        if (!captured) {
            return { reversed: false, action: 'NONE', error: 'no captured transaction to reverse' };
        }
        const targetTxnId = captured.transaction.id;
        const capturedAmt = parseFloat(captured.transaction?.amount ?? order.amount ?? 0);

        // Already reversed on the gateway? Only when the money is actually back.
        // This used to answer "reversed" for ANY successful refund on the order,
        // so an earlier partial refund (say the cancellation fee withheld) made
        // a later full reversal report success having returned nothing more.
        // A successful VOID returns everything; refunds are summed against what
        // was captured, and only the remainder is refunded below.
        const voided = orderVoided(order);
        const alreadyRefunded = txns
            .filter(t => t.transaction?.type === 'REFUND' && t.result === 'SUCCESS')
            .reduce((sum, t) => sum + (parseFloat(t.transaction?.amount) || 0), 0);
        if (voided || (capturedAmt > 0 && alreadyRefunded + 0.01 >= capturedAmt)) {
            return { reversed: true, action: 'ALREADY_REVERSED', orderStatus: order.status };
        }

        // 1) Try VOID first (works pre-settlement; no money actually moved, no fee).
        // Only when nothing has been refunded yet: a VOID reverses the whole
        // transaction, which is not possible once part of it has gone back.
        let voidResp = null;
        if (alreadyRefunded === 0) {
            const voidTxnId = `void-fail-${Date.now()}`;
            const voidUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${orderId}/transaction/${voidTxnId}`;
            voidResp = await axios.put(voidUrl, {
                apiOperation: 'VOID',
                transaction: { targetTransactionId: targetTxnId, reference: String(reason).substring(0, 40) }
            }, { headers: authConfig.headers, validateStatus: () => true });
            // `|| !voidResp.data?.result` used to sit here - a reply with no result
            // at all counted as a successful void. It does not.
            if (arcSucceeded(voidResp)) {
                return { reversed: true, action: 'VOID', transactionId: voidTxnId, targetTransactionId: targetTxnId };
            }
        }

        // 2) VOID rejected (likely already settled) → REFUND what is left.
        // Return what the gateway captured - read from the transaction it just
        // showed us - never the caller's figure. Every call site passes
        // `req.body.totalAmount`, which the client controls: with the VOID leg
        // refused (already settled) and this REFUND leg running, a client that
        // posted 1.00 against a 900.00 charge was refunded 1.00 and the row
        // written `refunded`. `amount` stays in the signature and is ignored.
        const refundAmt = Math.round((capturedAmt - alreadyRefunded) * 100) / 100;
        if (amount != null && Number.isFinite(Number(amount)) && Math.abs(Number(amount) - refundAmt) > 0.01) {
            console.warn('⚠️ reversal: caller amount ignored in favour of captured amount', {
                orderId, caller: Number(amount), captured: capturedAmt, alreadyRefunded
            });
        }
        if (refundAmt > 0) {
            const refundTxnId = `refund-fail-${Date.now()}`;
            const refundUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${orderId}/transaction/${refundTxnId}`;
            const refundResp = await axios.put(refundUrl, {
                apiOperation: 'REFUND',
                transaction: { amount: refundAmt.toFixed(2), currency, reference: String(reason).substring(0, 40) }
            }, { headers: authConfig.headers, validateStatus: () => true });
            if (arcSucceeded(refundResp)) {
                return { reversed: true, action: 'REFUND', amount: refundAmt, transactionId: refundTxnId };
            }
            return { reversed: false, action: 'FAILED', error: 'VOID and REFUND both failed', details: arcFailureSummary(refundResp.data) };
        }
        return { reversed: false, action: 'FAILED', error: 'VOID failed and no amount available to refund', details: arcFailureSummary(voidResp?.data) };
    } catch (err) {
        return { reversed: false, action: 'FAILED', error: err.message };
    }
}
