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

import { NO_CONFIRMED_SEAT_REVIEW_REASON, liveTicketNumbersMissingOf, noConfirmedSeatOf } from '../../../shared/reviewQueue';

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
 * trip was cancelled.
 *
 * @returns {'cancelled'|'issued'|'pending'|'none'}
 */
export function ticketState(bookingData) {
  if (isCancelledBooking(bookingData)) return 'cancelled';
  if (resolveTickets(bookingData).length > 0) return 'issued';

  // Under a refused cancel's flag too (sentByServer): the ticket was issued
  // whatever flag sits on top now, and the top reason alone read "none" - but
  // not once a cancel voided it (liveTicketNumbersMissingOf).
  const numbersMissing = sentByServer(bookingData, 'ticket_numbers_missing') ?? Boolean(liveTicketNumbersMissingOf(bookingData));
  if (numbersMissing) return 'pending';

  return 'none';
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
 * @returns {'cancelled'|'ticketed'|'ticket_pending'|'held'|'no_confirmed_seat'|'queued'|'not_booked'}
 */
export function documentState(bookingData) {
  const tickets = ticketState(bookingData);
  if (tickets === 'cancelled') return 'cancelled';
  if (tickets === 'issued') return 'ticketed';
  if (pnrOf(bookingData)) {
    if (tickets === 'pending') return 'ticket_pending';
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
 */
export function canDownloadDocument(bookingData) {
  return ['ticketed', 'ticket_pending', 'held'].includes(documentState(bookingData));
}

/** Whether the money is actually confirmed, rather than assumed. */
export function isPaid(bookingData) {
  const status = String(
    bookingData?.payment_status ?? bookingData?.paymentStatus ?? '',
  ).toLowerCase();
  return status === 'paid' || status === 'completed';
}
