import {
  NO_CONFIRMED_SEAT_REVIEW_REASON, documentState, hasNoConfirmedSeat, isCancellationUnrecorded, isCommitUnknown, isPaid, ticketState,
  ticketsVoided,
} from './eTicket';
import {
  REFUND_DONE_ACTIONS,
  REFUND_REVIEW_ACTIONS,
  REFUND_STUCK_ACTIONS,
  cancellationMessage,
  refundOutcome,
} from '../../../shared/cancellationOutcome';

/**
 * What a booking's state means to the customer, in one place.
 *
 * My Trips derived its badge from `status` alone and fell back to "Confirmed"
 * for anything it did not recognise, so a held reservation with no ticket, a
 * row flagged for review, and a status nobody had mapped all read as a
 * confirmed trip. Its "Failed" tab matched a status nothing ever writes, and
 * a cancellation whose refund was refused was reported as "cancelled
 * successfully". Everything here reads what the booking record actually says.
 *
 * What happened to the money on a cancellation is decided in
 * shared/cancellationOutcome.js, which the cancel API and the email read too.
 */
export { REFUND_STUCK_ACTIONS, REFUND_DONE_ACTIONS, REFUND_REVIEW_ACTIONS, cancellationMessage };

const cancellationOf = (booking) =>
  booking?.cancellation || booking?.booking_details?.cancellation || booking?.bookingDetails?.cancellation || null;

const reviewOf = (booking) =>
  booking?.needs_review || booking?.booking_details?.needs_review || booking?.bookingDetails?.needs_review || null;

const pnrOf = (booking) => booking?.pnr || booking?.booking_details?.pnr || booking?.bookingDetails?.pnr || null;

/**
 * The review flag the order route writes when the airline left a flight
 * waitlisted, requested, unable or cancelled at commit. There is a PNR, but no
 * confirmed seat. One value, in shared/reviewQueue.js; eTicket.js exports it
 * for the pages, and whether a booking carries it is hasNoConfirmedSeat's to say.
 */
export { NO_CONFIRMED_SEAT_REVIEW_REASON };

/**
 * Whether the booking's payment record says its money went back, in full
 * ('all') or in part ('part'), or null.
 *
 * A booking can be refunded without being cancelled: the Payments tab writes
 * payment_status and nothing else. Every sentence below that spoke of the
 * payment - "Our team is looking after your payment", "Awaiting payment",
 * "Payment received", "do not book this trip again" - was said without
 * reading it, and was false of that booking.
 */
export function paymentReturned(booking) {
  const payment = String(booking?.payment_status ?? booking?.paymentStatus ?? '').toLowerCase();
  if (['refunded', 'reversed'].includes(payment)) return 'all';
  if (payment === 'partially_refunded') return 'part';
  return null;
}

const money = (amount, currency) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
  } catch {
    return `${currency || ''} ${Number(amount).toFixed(2)}`.trim();
  }
};

/**
 * What happened to the money on a cancelled booking, or null for one that is
 * not cancelled.
 *
 * "Refunded" is said only when a reversal happened. The cancellation record's
 * `paymentAction` is what the cancel did, and it outranks `payment_status`: a
 * row can read refunded while the reversal it records failed. Without a record
 * - older cancellations, and the no-refund fallback - a charge still marked paid
 * is a refund nobody has made yet.
 *
 * @returns {null | { key: 'refunded'|'failed'|'review'|'none_due'|'nothing_held'|'pending', label: string, tone: 'success'|'warning'|'danger'|'neutral' }}
 */
export function refundStatus(booking) {
  if (String(booking?.status || '').toLowerCase() !== 'cancelled') return null;

  const cancellation = cancellationOf(booking) || {};
  // A cancel recorded cancelled by hand (cancellationRecordedByHandOf): the
  // record is what its flag says the cancel did, and the hand cancel writes
  // the status alone, so a payment status reading returned was written by
  // something that moved the money since. When the cancel itself returned
  // nothing, that is read first.
  const returnedSince = cancellation.recordedByHand === true && refundOutcome(cancellation) !== 'refunded'
    && Boolean(paymentReturned(booking));
  if (cancellation.paymentAction && !returnedSince) {
    switch (refundOutcome(cancellation)) {
      case 'stuck': return { key: 'failed', label: 'Refund not processed', tone: 'danger' };
      case 'review': return { key: 'review', label: 'Refund under review', tone: 'warning' };
      case 'fee_covers': return { key: 'none_due', label: 'No refund due', tone: 'neutral' };
      case 'nothing_held': return { key: 'nothing_held', label: 'Nothing to refund', tone: 'neutral' };
      case 'refunded': {
        const amount = Number(cancellation.refundAmount);
        const currency = cancellation.currency || booking?.currency;
        return { key: 'refunded', label: amount > 0 ? `Refunded ${money(amount, currency)}` : 'Refunded', tone: 'success' };
      }
      default: break;
    }
  }

  const payment = String(booking?.payment_status ?? booking?.paymentStatus ?? '').toLowerCase();
  if (payment === 'refunded') return { key: 'refunded', label: 'Refunded', tone: 'success' };
  if (payment === 'partially_refunded') return { key: 'refunded', label: 'Partly refunded', tone: 'success' };
  if (['paid', 'completed', 'partial'].includes(payment)) return { key: 'pending', label: 'Refund pending', tone: 'warning' };
  return null;
}

/**
 * A cancelled flight whose refund the desk has to finish by hand: it failed, is
 * under review, or was never made. The admin panel offers "Finish refund" for
 * exactly these.
 */
export function needsManualRefund(booking) {
  const type = String(booking?.type ?? booking?.travel_type ?? '').toLowerCase();
  if (type && type !== 'flight') return false;
  // A partial refund that left money with the gateway which the cancel did not
  // keep as its fee. It reads "Refunded", but the desk still owes the rest, so
  // the button stays until it is returned (`stillHeld`, recorded by the manual
  // refund).
  if (String(booking?.status || '').toLowerCase() === 'cancelled' && Number(cancellationOf(booking)?.stillHeld) > 0) return true;
  return ['failed', 'review', 'pending'].includes(refundStatus(booking)?.key);
}

/** Flagged for review, and neither cancelled nor ticketed since. */
const flaggedOpen = (booking) => Boolean(reviewOf(booking))
  && String(booking?.status || '').toUpperCase() !== 'CANCELLED' && ticketState(booking) !== 'issued';

/** Does someone need to act on this booking? */
export function needsAttention(booking) {
  const status = String(booking?.status || '').toUpperCase();
  if (status === 'FAILED') return true;
  if (['failed', 'review', 'pending'].includes(refundStatus(booking)?.key)) return true;
  // A flight refunded without being cancelled (paymentReturned) waits on
  // nobody: its flag stays, and it was badged "Needs attention" and listed
  // under Failed while the same booking unflagged read "Refunded". Its
  // sentence still says what happened (attentionMessage).
  const isFlight = String(booking?.type || booking?.travel_type || '').toLowerCase() === 'flight';
  if (isFlight && paymentReturned(booking)) return false;
  // Issued, its number not read back (ticketState 'pending'), waits on nobody
  // either: a booking held after its ticket was issued was badged "Needs
  // attention" and listed under Failed, over a live ticket. It gets the
  // "Ticket issued" badge, and its sentence still says the number is on its
  // way (attentionMessage).
  return flaggedOpen(booking) && ticketState(booking) !== 'pending';
}

/**
 * The sentence under a booking that needs attention, or null. Each case says
 * only what the record shows: a held reservation is not a failed booking, and
 * a refund under review is not a refund that failed.
 */
export function attentionMessage(booking) {
  const refund = refundStatus(booking);
  if (refund) {
    if (refund.key === 'failed') {
      return 'The refund for this cancellation did not go through automatically, so nothing has been returned to your card yet. '
        + 'Our team has been alerted and will refund you.';
    }
    if (refund.key === 'review') {
      return 'Our team is reviewing the refund for this cancellation and will email you within 2 business days to confirm what is returned to your card.';
    }
    if (refund.key === 'pending') {
      return 'This booking is cancelled, but no refund has been recorded for it yet. Our team will check it and email you.';
    }
    return null;
  }
  // A cancel that went through and could not be recorded
  // (isCancellationUnrecorded). The row reads confirmed, paid and ticketed,
  // and the customer was told the cancellation was processed, not to try
  // again, and to call. Read before anything that reads the row's payment or
  // tickets: neither says what happened - except a payment written returned
  // since (paymentReturned), which was still told our team would confirm what
  // happened to the money.
  if (isCancellationUnrecorded(booking)) {
    const moneyBack = paymentReturned(booking);
    return 'Your cancellation went through, but our record of it is still being updated, so this booking may not show as cancelled yet. '
      + (moneyBack === 'all' ? 'It is not valid for travel, and your payment for it has been refunded - please do not try again. '
        : moneyBack === 'part' ? 'It is not valid for travel. Part of your payment for it has been refunded, and our team will confirm what happened to the rest - please do not try again. '
          : 'It is not valid for travel. Our team will confirm what happened to your payment - please do not try again. ')
      + 'If you have any questions, call (877) 538-7380 with your booking reference.';
  }
  if (!needsAttention(booking) && !flaggedOpen(booking)) return null;
  // Said from the payment record: a flagged booking refunded since reads
  // refunded, and "our team is looking after your payment" was false of it.
  const returned = paymentReturned(booking);
  // A ticket was issued (ticketState 'pending': its number not read back), so
  // the booking was completed; money went back on it. Read before the
  // sentences below, which said "This booking was not completed" of it.
  if (returned && ticketState(booking) === 'pending') {
    return `Your ticket has been issued, and ${returned === 'all' ? 'your payment' : 'part of your payment'} for it has been refunded. `
      + 'Its ticket number has not reached us; if you need it, or have any questions, call (877) 538-7380 with your booking reference.';
  }
  if (returned === 'all') {
    return 'This booking was not completed, and your payment for it has been refunded. '
      + 'If you have any questions, call (877) 538-7380 with your booking reference.';
  }
  if (returned === 'part') {
    return 'This booking was not completed. Part of your payment for it has been refunded; '
      + 'please call (877) 538-7380 with your booking reference about the rest.';
  }
  // The airline commit never answered (isCommitUnknown), and nobody knows yet
  // whether it holds a reservation. Read as any booking with no PNR, this said
  // the booking had failed and nothing against booking again - the opposite of
  // what the order page told the customer when they paid, and a second booking
  // of the trip is a second charge.
  if (isCommitUnknown(booking)) {
    return 'Your payment is safe and our team is checking with the airline whether your booking went through. '
      + 'We will email you either way - please do not book this trip again in the meantime.';
  }
  // A PNR is not a seat: "your seats are reserved" was false of this one. And
  // a second trip bought meanwhile is not caught as a duplicate. Read through
  // hasNoConfirmedSeat, not the top flag: a refused cancel flags it again on top.
  if (hasNoConfirmedSeat(booking)) {
    return 'The airline has not confirmed a seat on every flight, so no ticket has been issued. Our team will contact you. '
      + 'Please do not book this trip again in the meantime.';
  }
  // Issued, with its number not read back (ticketState 'pending'): "your
  // ticket has not been issued yet" sat beside "Issued, number pending" and a
  // document saying the ticket was issued.
  if (ticketState(booking) === 'pending') {
    return 'Your ticket has been issued, but its ticket number has not reached us yet. Our team is getting it from the airline.';
  }
  // Every ticket voided by a cancel the airline then refused (ticketsVoided).
  // "Your ticket has not been issued yet. Our team is working on it" promised
  // a ticket nobody will issue, of one that was voided. The customer was told
  // when it was refused that our team has been alerted and will complete it.
  if (ticketsVoided(booking)) {
    return 'Your ticket has been voided and is not valid for travel. The cancellation has not been completed with the airline yet; '
      + 'our team has been alerted and will complete it. If it is urgent, call (877) 538-7380 with your booking reference.';
  }
  // A held PNR the customer asked to cancel, whose cancel the airline refused
  // (documentState 'cancel_pending'). "Your ticket has not been issued yet.
  // Our team is working on it" promised a ticket nobody will issue, to a
  // customer told when it was refused that our team would complete it.
  if (documentState(booking) === 'cancel_pending') {
    return 'Your cancellation has not been completed with the airline yet. Our team has been alerted and will complete it, '
      + 'and no ticket will be issued on this booking. If it is urgent, call (877) 538-7380 with your booking reference.';
  }
  return pnrOf(booking)
    ? 'Your seats are reserved, but your ticket has not been issued yet. Our team is working on it and will email you.'
    : 'Your booking could not be completed with the airline. Our team is looking after your payment and will email you.';
}

/**
 * The badge for a booking card.
 * @returns {{label: string, tone: 'success'|'warning'|'danger'|'neutral'}}
 */
export function bookingStatusBadge(booking) {
  const status = String(booking?.status || '').toLowerCase();
  const isFlight = String(booking?.type || booking?.travel_type || '').toLowerCase() === 'flight';

  if (status === 'cancelled') return { label: 'Cancelled', tone: 'danger' };
  if (needsAttention(booking)) return { label: 'Needs attention', tone: 'warning' };

  if (isFlight) {
    const tickets = ticketState(booking);
    if (tickets === 'issued') return { label: 'Ticketed', tone: 'success' };
    if (tickets === 'pending') return { label: 'Ticket issued', tone: 'success' };
    // Refunded without being cancelled (paymentReturned): not being confirmed,
    // not a held reservation, and not awaiting a payment it already made.
    const returned = paymentReturned(booking);
    if (returned) return { label: returned === 'all' ? 'Refunded' : 'Partly refunded', tone: 'neutral' };
    // Paid, and waiting in the queue for an Amadeus slot: nothing has been sent
    // to the airline yet, so it is neither a reservation nor a failure.
    if (!pnrOf(booking) && (booking?.queued === true || status === 'pending_confirmation')) {
      return { label: 'Being confirmed', tone: 'neutral' };
    }
    // A PNR without a ticket is a reservation on a deadline, not a finished
    // trip. Older rows carry 'confirmed' or 'paid' for exactly this state.
    if (pnrOf(booking) || ['pending_ticketing', 'confirmed', 'paid'].includes(status)) {
      return { label: 'Ticket pending', tone: 'warning' };
    }
    if (status === 'pending') {
      // A payment the gateway confirmed, for a booking the airline has not
      // seen: the customer paid and closed the tab before it was sent.
      return isPaid(booking) ? { label: 'Paid, not booked yet', tone: 'warning' } : { label: 'Awaiting payment', tone: 'neutral' };
    }
  } else {
    if (status === 'confirmed') return { label: 'Confirmed', tone: 'success' };
    if (status === 'paid') return { label: 'Paid', tone: 'success' };
    if (status === 'pending') return { label: 'Pending', tone: 'neutral' };
  }

  // Never "Confirmed" for a state nobody mapped.
  return {
    label: status ? status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Status unavailable',
    tone: 'neutral',
  };
}

/**
 * Whether a trip whose date has passed may be called completed.
 *
 * My Trips said "Trip Completed" under every past travel date, including a
 * reservation never ticketed, a booking still queued and a checkout never paid
 * for. A flight booked here is completed only once a ticket was issued; a trip
 * our team booked from a quote, or any other kind of booking, only once it was
 * confirmed or paid. A cancelled booking never is.
 */
export function isCompletedTrip(booking) {
  const status = String(booking?.status || '').toLowerCase();
  if (status === 'cancelled') return false;
  const type = String(booking?.type ?? booking?.travel_type ?? '').toLowerCase();
  if (type === 'flight' && !booking?.quoteId && !booking?.inquiryId) {
    return ['issued', 'pending'].includes(ticketState(booking));
  }
  return ['confirmed', 'paid'].includes(status);
}
