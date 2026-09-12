import { describe, expect, it } from 'vitest';
import {
  resolveTickets,
  ticketState,
  ticketForTraveler,
  issueDate,
  isPaid,
} from '../../frontend/src/utils/eTicket';

/**
 * The document these helpers feed is the one a customer carries to an airport.
 *
 * It used to print `732-` plus ten random digits per passenger, regenerated on
 * every render, headed "E-Ticket" — while ticketing on this system has never
 * once succeeded. So the rule under test is narrow and absolute: show a ticket
 * number only when a real one exists, and never imply one otherwise.
 */

const ticket = (over = {}) => ({
  number: '057-2412345678',
  travelerId: '1',
  validatingCarrier: 'AI',
  issuedOn: '2026-09-04',
  ...over,
});

describe('finding the tickets, whichever shape the booking arrived in', () => {
  // GET /flights/bookings/:ref spreads booking_details to the top level.
  it('reads the flattened shape from the single-booking endpoint', () => {
    expect(resolveTickets({ tickets: [ticket()] })).toHaveLength(1);
  });

  // My Trips hands over the raw row, where booking_details is still nested.
  it('reads the nested shape from My Trips router state', () => {
    expect(resolveTickets({ booking_details: { tickets: [ticket()] } })).toHaveLength(1);
  });

  it('reads the camelCase shape the success page uses', () => {
    expect(resolveTickets({ bookingDetails: { tickets: [ticket()] } })).toHaveLength(1);
  });

  it('returns nothing rather than guessing when there are no tickets', () => {
    expect(resolveTickets({ tickets: [] })).toEqual([]);
    expect(resolveTickets({})).toEqual([]);
    expect(resolveTickets(null)).toEqual([]);
    expect(resolveTickets(undefined)).toEqual([]);
  });
});

describe('the three ticket states', () => {
  it('is issued when a real ticket number exists', () => {
    expect(ticketState({ tickets: [ticket()] })).toBe('issued');
  });

  // The booking chain's real outcome when issuance worked but the numbers had
  // not landed in the PNR before the retries ran out. Saying "not ticketed"
  // here would be as wrong as inventing a number.
  it('is pending when the ticket was issued but its number was not retrieved', () => {
    const booking = { needs_review: { reason: 'ticket_numbers_not_retrieved' } };
    expect(ticketState(booking)).toBe('pending');
    expect(ticketState({ booking_details: booking })).toBe('pending');
  });

  it('is none when the booking holds only a PNR', () => {
    expect(ticketState({ pnr: 'AMRHOG' })).toBe('none');
  });

  // The two bookings sitting paid-with-PNR-and-no-ticket in production.
  it('is none for a booking flagged for any other reason', () => {
    const stuck = { needs_review: { reason: 'chain failed after commit at issueTicket' } };
    expect(ticketState(stuck)).toBe('none');
  });

  it('prefers a real ticket over any review flag', () => {
    const booking = {
      tickets: [ticket()],
      needs_review: { reason: 'ticket_numbers_not_retrieved' },
    };
    expect(ticketState(booking)).toBe('issued');
  });
});

describe('matching a ticket to its passenger', () => {
  const jane = { id: '1', firstName: 'JANE' };
  const john = { id: '2', firstName: 'JOHN' };

  it('matches on the Amadeus traveller reference, not position', () => {
    // Deliberately out of order: position would hand Jane the wrong ticket.
    const tickets = [
      ticket({ travelerId: '2', number: '057-2000000002' }),
      ticket({ travelerId: '1', number: '057-1000000001' }),
    ];
    expect(ticketForTraveler(tickets, jane, 0).number).toBe('057-1000000001');
    expect(ticketForTraveler(tickets, john, 1).number).toBe('057-2000000002');
  });

  it('falls back to position when the reference is absent', () => {
    const tickets = [ticket({ travelerId: null, number: '057-A' })];
    expect(ticketForTraveler(tickets, {}, 0).number).toBe('057-A');
  });

  it('returns null rather than someone else’s ticket', () => {
    expect(ticketForTraveler([], jane, 0)).toBeNull();
    expect(ticketForTraveler(null, jane, 0)).toBeNull();
    // Two passengers, one ticket: the second gets nothing, not the first's.
    expect(ticketForTraveler([ticket({ travelerId: '1' })], john, 1)).toBeNull();
  });
});

describe('the issue date', () => {
  // The backend fixed this exact bug: new Date() made every ticket look issued
  // today, which is the question a void decision turns on.
  it('is the date Amadeus reported, never today', () => {
    expect(issueDate([ticket({ issuedOn: '2026-09-04' })])).toBe('2026-09-04');
  });

  it('is null when unknown, so the document can omit it', () => {
    expect(issueDate([ticket({ issuedOn: null })])).toBeNull();
    expect(issueDate([])).toBeNull();
  });
});

describe('payment confirmation', () => {
  it('is true only for a genuinely paid booking', () => {
    expect(isPaid({ payment_status: 'paid' })).toBe(true);
    expect(isPaid({ payment_status: 'completed' })).toBe(true);
  });

  // It used to print "Payment Confirmed ✅" unconditionally.
  it('is false for anything else, including a failed refund', () => {
    expect(isPaid({ payment_status: 'unpaid' })).toBe(false);
    expect(isPaid({ payment_status: 'partially_refunded' })).toBe(false);
    expect(isPaid({})).toBe(false);
    expect(isPaid(null)).toBe(false);
  });
});
