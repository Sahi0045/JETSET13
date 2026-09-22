/**
 * Reading real ticket data out of a booking — and refusing to invent it.
 *
 * The e-ticket document used to print `732-` followed by ten random digits for
 * every passenger, regenerated on each render, on a page headed "E-Ticket".
 * Ticketing has never once succeeded on this system, so every such number was
 * fiction, and a customer could carry one to an airport and be turned away.
 *
 * The real numbers are already in the booking: `readTickets()` parses them from
 * the PNR's FA elements and the order route persists them to
 * `booking_details.tickets` (flight.routes.js), whose own comment says it is
 * stored "for the ticket numbers ManageBooking currently fabricates". The data
 * was waiting; nothing read it.
 *
 * Ticket shape, from backend/services/amadeusSoap/mappers/flightOrder.js:
 *   { number: '057-2412345678', travelerId: '1'|null,
 *     validatingCarrier: 'AI'|null, issuedOn: '2026-09-04'|null }
 */

import {
  NO_CONFIRMED_SEAT_REVIEW_REASON, commitUnknownOf, liveTicketNumbersMissingOf, noConfirmedSeatOf, unrecordedCancellationForCustomerOf,
  voidedTicketsOf,
} from '../../../shared/reviewQueue';

/**
 * A booking reaches the UI in two different shapes, and both are live:
 *
 *  - via My Trips router state: the raw row from `GET /flights/bookings`
 *    (`select('*')`), so ticket data sits under `booking_details`.
 *  - via `useFlightBooking`: `GET /flights/bookings/:ref`, which spreads
 *    `...booking_details` to the top level.
 *
 * Checking only one path would hide real tickets from genuinely ticketed
 * customers — the mirror image of the bug this file exists to fix.
 */
const TICKET_PATHS = [
  (b) => b?.tickets,
  (b) => b?.booking_details?.tickets,
  (b) => b?.bookingDetails?.tickets,
  (b) => b?.data?.tickets,
];

const REVIEW_PATHS = [
  (b) => b?.needs_review,
  (b) => b?.booking_details?.needs_review,
  (b) => b?.bookingDetails?.needs_review,
];

/**
 * The review flag the order route writes when the airline left a flight
 * waitlisted, requested, unable or cancelled at commit (the chain's step
 * 'segmentStatus'). There is a PNR, but no confirmed seat, and the server will
 * not ticket it. The one value lives in shared/reviewQueue.js, which the route
 * and the alarm read too.
 *
 * Exported here rather than from bookingStatus.js, which imports this file and
 * re-exports it: the document reads it too.
 */
export { NO_CONFIRMED_SEAT_REVIEW_REASON };

/**
 * A state the server worked out for the page, or undefined when this copy of
 * the booking does not carry it.
 *
 * Both booking reads send the review flag cut down to its reason
 * (toClientBooking), and an earlier flag can sit under a later one: a refused
 * cancel writes its own on top of "no confirmed seat". So the server walks the
 * flags (shared/reviewQueue.js flagInForce) and names the state; the top reason
 * alone told the page the seat was held again.
 */
const sentByServer = (bookingData, name) => {
  for (const read of REVIEW_PATHS) {
    const value = read(bookingData)?.[name];
    if (typeof value === 'boolean') return value;
  }
  return undefined;
};

/**
 * Whether the airline left this booking's PNR without a confirmed seat: as the
 * server worked it out, or - for a copy that does not say, such as a raw row -
 * by the same walk over the flags the server makes.
 */
export function hasNoConfirmedSeat(bookingData) {
  return sentByServer(bookingData, 'no_confirmed_seat') ?? Boolean(noConfirmedSeatOf(bookingData));
}

/**
 * Whether the airline commit on this booking never answered, and nobody has
 * found out since: as the server worked it out, or - for a copy that does not
 * say, such as a raw row - by the same walk over the flags (commitUnknownOf).
 *
 * The order page knows it from the answer to the order. Every page after it
 * reads the stored row, which has no PNR, and called it a failed booking.
 */
export function isCommitUnknown(bookingData) {
  return sentByServer(bookingData, 'commit_unknown') ?? Boolean(commitUnknownOf(bookingData));
}

/**
 * Whether a cancel went through - its tickets voided, the reservation
 * released, the money moved - and its record could not be written
 * (payment/operations.handlers.js flagUnrecordedCancellation): as the server
 * worked it out, or - for a copy that does not say, such as a raw row - by the
 * same walk over the flags (unrecordedCancellationForCustomerOf: past a flag a
 * person resolved, until the booking is recorded cancelled).
 *
 * The row still reads confirmed, paid and ticketed, and the flag names no
 * voided number. Read from the row, the void ticket was an issued one, offered
 * as an E-Ticket to a customer told not to try again and to call.
 */
export function isCancellationUnrecorded(bookingData) {
  return sentByServer(bookingData, 'unrecorded_cancellation') ?? Boolean(unrecordedCancellationForCustomerOf(bookingData));
}

/** Whether the booking was cancelled, from whichever shape it arrived in. */
export function isCancelledBooking(bookingData) {
  return [bookingData?.status, bookingData?.bookingDetails?.status, bookingData?.booking_details?.status, bookingData?.data?.status]
    .some((status) => String(status ?? '').toUpperCase() === 'CANCELLED');
}

/** Every ticket on the booking, from whichever shape it arrived in. */
export function resolveTickets(bookingData) {
  for (const read of TICKET_PATHS) {
    const found = read(bookingData);
    if (Array.isArray(found) && found.length > 0) return found;
  }
  return [];
}

const ticketDigits = (number) => String(number ?? '').replace(/\D/g, '');

/**
 * The ticket numbers a cancel voided, as digits: what the server sent
 * (toClientBooking's `voided_tickets`), and - for a copy that does not carry
 * it, such as a raw row - the same walk over the booking and its flags the
 * server makes (voidedTicketsOf).
 *
 * A cancel that voids and then has PNR_Cancel refused leaves the ticket list
 * as it was. Read alone, the list made every void ticket an issued one.
 */
export function voidedTicketDigits(bookingData) {
  const sent = Array.isArray(bookingData?.voided_tickets) ? bookingData.voided_tickets : [];
  return new Set([...sent, ...voidedTicketsOf(bookingData)].map(ticketDigits).filter(Boolean));
}

/** Whether this ticket is one a cancel voided (voidedTicketDigits). */
export const isVoidedTicket = (ticket, voided) => Boolean(ticket?.number) && voided.has(ticketDigits(ticket.number));

/**
 * The booking's tickets less the ones a cancel voided. A booking nobody
 * cancelled has none voided, and gets its whole list, as before.
 */
export function liveTickets(bookingData) {
  const voided = voidedTicketDigits(bookingData);
  return resolveTickets(bookingData).filter((ticket) => !isVoidedTicket(ticket, voided));
}

/**
 * Three states, not two.
 *
 * `pending` is the case the booking chain actually produces: issuance
 * succeeded, but the numbers had not surfaced in the PNR before the retries ran
 * out, so it records `needs_review.reason = 'ticket_numbers_not_retrieved'`.
 * Telling that customer "not ticketed" would be as wrong as inventing a number
 * for them — their ticket exists.
 *
 * And one ahead of all three: `cancelled`. A cancelled booking's tickets were
 * voided or refunded with the airline, but their numbers stay on the record -
 * which is how the document went on printing them, headed "E-Ticket", after the
 * trip was cancelled. So is a booking whose cancel went through and could not
 * be recorded (isCancellationUnrecorded): the row still says confirmed, and
 * its tickets are just as void.
 *
 * @returns {'cancelled'|'issued'|'pending'|'none'}
 */
export function ticketState(bookingData) {
  if (isCancelledBooking(bookingData) || isCancellationUnrecorded(bookingData)) return 'cancelled';
  // A ticket a cancel voided is not an issued ticket: nobody can fly on it.
  // With every one voided the booking reads as the numbers-missing booking
  // whose tickets were voided does - not issued, and not pending.
  if (liveTickets(bookingData).length > 0) return 'issued';

  // Under a refused cancel's flag too (sentByServer): the ticket was issued
  // whatever flag sits on top now, and the top reason alone read "none" - but
  // not once a cancel voided it (liveTicketNumbersMissingOf).
  const numbersMissing = sentByServer(bookingData, 'ticket_numbers_missing') ?? Boolean(liveTicketNumbersMissingOf(bookingData));
  if (numbersMissing) return 'pending';

  return 'none';
}

/**
 * Every ticket the booking held was voided by a cancel, and the booking is not
 * cancelled: the airline refused to cancel the reservation after the void.
 * No ticket is valid, none is pending, and none is "being issued" - the
 * sentences a booking with no ticket gets are false of it.
 */
export function ticketsVoided(bookingData) {
  return ticketState(bookingData) === 'none' && voidedTicketDigits(bookingData).size > 0;
}

/**
 * The ticket belonging to one passenger, or null when that cannot be known.
 *
 * The booking stores each ticket against the id of the traveller it belongs to
 * (`travelerId`; the PNR's own passenger reference is kept as `pnrTravelerId`).
 *
 * An infant on a lap has no passenger number of its own on a PNR, so its ticket
 * points at its adult. Tickets saved before that was read carry the adult's
 * reference on both - and matching the first one found gave the adult either
 * number, while the infant, matching nothing, was handed whichever ticket sat
 * at its position: someone else's. So:
 *
 *  - two tickets naming one traveller could be either's, and neither is shown;
 *  - a ticket is taken by position only when no ticket names anybody at all.
 */
export function ticketForTraveler(tickets, traveler, index) {
  if (!Array.isArray(tickets) || tickets.length === 0) return null;

  const ref = traveler?.id ?? traveler?.travelerId ?? String(index + 1);
  const theirs = tickets.filter(
    (t) => t?.travelerId != null && String(t.travelerId) === String(ref),
  );
  if (theirs.length === 1) return theirs[0];
  if (theirs.length > 1) return null;

  const anyNamed = tickets.some((t) => t?.travelerId != null || t?.pnrTravelerId != null);
  return anyNamed ? null : (tickets[index] ?? null);
}

/**
 * The date Amadeus says the ticket was issued — never today's date.
 *
 * The backend hit this exact bug and left a note about it: using `new Date()`
 * "made every ticket look issued today, which is exactly the question the void
 * decision turns on". The document had the same bug and nobody had fixed it.
 */
export function issueDate(tickets) {
  return tickets.find((t) => t?.issuedOn)?.issuedOn ?? null;
}

/** The airline reference (PNR), from whichever shape the booking arrived in. */
export function pnrOf(bookingData) {
  return bookingData?.pnr || bookingData?.booking_details?.pnr || bookingData?.bookingDetails?.pnr || null;
}

/**
 * What the downloadable document may truthfully call this booking.
 *
 * The document said "Your seat is held under the PNR below" whenever no ticket
 * existed - over "PNR: N/A" for a booking still in the queue, one never sent to
 * the airline, one held back as a second payment, and one never paid for. Only
 * a PNR holds a seat.
 *
 * And not every PNR does: one the airline left without a confirmed seat
 * (hasNoConfirmedSeat) printed "Your seat is held under the PNR below" too.
 *
 * And not a PNR whose tickets a cancel voided (ticketsVoided): "Your seat is
 * held ... We will email your e-ticket once it is issued" was false of it.
 *
 * @returns {'cancelled'|'ticketed'|'ticket_pending'|'tickets_voided'|'held'|'no_confirmed_seat'|'queued'|'not_booked'}
 */
export function documentState(bookingData) {
  const tickets = ticketState(bookingData);
  if (tickets === 'cancelled') return 'cancelled';
  if (tickets === 'issued') return 'ticketed';
  if (pnrOf(bookingData)) {
    if (tickets === 'pending') return 'ticket_pending';
    if (ticketsVoided(bookingData)) return 'tickets_voided';
    return hasNoConfirmedSeat(bookingData) ? 'no_confirmed_seat' : 'held';
  }
  const status = String(bookingData?.status ?? '').toLowerCase();
  return bookingData?.queued === true || status === 'pending_confirmation' ? 'queued' : 'not_booked';
}

/**
 * Whether Manage Booking offers the document at all: only for a booking the
 * airline holds. Without a PNR there is nothing to carry - no ticket and no
 * reservation - and a PDF headed "Booking Confirmation" says otherwise. Nor
 * with a PNR the airline confirmed no seat on: there is no seat to prove.
 *
 * Nor a held seat whose payment went back: the Payments tab refunds without
 * cancelling, and the PDF said "Your seat is held under the PNR below. We will
 * email your e-ticket once it is issued" - no ticket is issued on it.
 *
 * Nor one whose tickets a cancel voided ('tickets_voided', left out below):
 * it was offered as an "E-Ticket" of the void numbers. Nor one whose cancel
 * went through and could not be recorded ('cancelled', isCancellationUnrecorded).
 */
export function canDownloadDocument(bookingData) {
  const state = documentState(bookingData);
  const payment = String(bookingData?.payment_status ?? bookingData?.paymentStatus ?? '').toLowerCase();
  if (state === 'held' && ['refunded', 'partially_refunded', 'reversed'].includes(payment)) return false;
  return ['ticketed', 'ticket_pending', 'held'].includes(state);
}

/** Whether the money is actually confirmed, rather than assumed. */
export function isPaid(bookingData) {
  const status = String(
    bookingData?.payment_status ?? bookingData?.paymentStatus ?? '',
  ).toLowerCase();
  return status === 'paid' || status === 'completed';
}
