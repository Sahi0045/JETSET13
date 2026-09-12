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
 * @returns {'issued'|'pending'|'none'}
 */
export function ticketState(bookingData) {
  if (resolveTickets(bookingData).length > 0) return 'issued';

  for (const read of REVIEW_PATHS) {
    if (read(bookingData)?.reason === 'ticket_numbers_not_retrieved') return 'pending';
  }

  return 'none';
}

/**
 * The ticket belonging to one passenger.
 *
 * Amadeus associates a ticket with a traveller by reference (`travelerId`, the
 * 1-based PNR passenger number). Position is the fallback, not the rule: with
 * several passengers the array order is not guaranteed to match the display
 * order, and handing someone else's ticket number to a traveller is its own
 * kind of wrong.
 */
export function ticketForTraveler(tickets, traveler, index) {
  if (!Array.isArray(tickets) || tickets.length === 0) return null;

  const ref = traveler?.id ?? traveler?.travelerId ?? String(index + 1);
  const byRef = tickets.find(
    (t) => t?.travelerId != null && String(t.travelerId) === String(ref),
  );

  return byRef ?? tickets[index] ?? null;
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

/** Whether the money is actually confirmed, rather than assumed. */
export function isPaid(bookingData) {
  const status = String(
    bookingData?.payment_status ?? bookingData?.paymentStatus ?? '',
  ).toLowerCase();
  return status === 'paid' || status === 'completed';
}
