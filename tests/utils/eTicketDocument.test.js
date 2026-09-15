import { describe, expect, it } from 'vitest';
import { canDownloadDocument, documentState, pnrOf } from '../../frontend/src/utils/eTicket';

/**
 * What the downloadable document may call a booking, and whether it is offered.
 *
 * It said "Your seat is held under the PNR below" for every booking without a
 * ticket, and Manage Booking offered it for queued, never-booked, held-as-a-
 * second-payment and unpaid bookings, all printed "PNR: N/A".
 */
describe('documentState', () => {
  it('reads cancelled first, then a ticket, then a PNR', () => {
    expect(documentState({ status: 'cancelled', pnr: 'ABC123', tickets: [{ number: '057-1' }] })).toBe('cancelled');
    expect(documentState({ status: 'confirmed', pnr: 'ABC123', tickets: [{ number: '057-1' }] })).toBe('ticketed');
    expect(documentState({ status: 'pending_ticketing', pnr: 'ABC123', needs_review: { reason: 'ticket_numbers_not_retrieved' } })).toBe('ticket_pending');
    expect(documentState({ status: 'pending_ticketing', pnr: 'ABC123' })).toBe('held');
  });

  it('never calls a booking without a PNR held', () => {
    expect(documentState({ status: 'pending_confirmation' })).toBe('queued');
    expect(documentState({ status: 'pending', queued: true })).toBe('queued');
    expect(documentState({ status: 'pending', payment_status: 'paid' })).toBe('not_booked');
    expect(documentState({ status: 'pending', payment_status: 'unpaid' })).toBe('not_booked');
    expect(documentState({ status: 'pending', payment_status: 'paid', needs_review: { reason: 'possible duplicate payment' } })).toBe('not_booked');
  });

  it('finds the PNR in either shape', () => {
    expect(pnrOf({ booking_details: { pnr: 'ABC123' } })).toBe('ABC123');
    expect(pnrOf({ bookingDetails: { pnr: 'ABC123' } })).toBe('ABC123');
    expect(pnrOf({})).toBeNull();
  });
});

describe('canDownloadDocument', () => {
  it('offers the document only for a booking the airline holds', () => {
    expect(canDownloadDocument({ status: 'pending_ticketing', pnr: 'ABC123' })).toBe(true);
    expect(canDownloadDocument({ status: 'confirmed', pnr: 'ABC123', tickets: [{ number: '057-1' }] })).toBe(true);
    expect(canDownloadDocument({ booking_details: { pnr: 'ABC123' }, status: 'pending_ticketing' })).toBe(true);
  });

  it('offers nothing for a cancelled booking or one without a PNR', () => {
    expect(canDownloadDocument({ status: 'cancelled', pnr: 'ABC123' })).toBe(false);
    expect(canDownloadDocument({ status: 'pending_confirmation', queued: true })).toBe(false);
    expect(canDownloadDocument({ status: 'pending', payment_status: 'paid' })).toBe(false);
    expect(canDownloadDocument({ status: 'pending', payment_status: 'unpaid' })).toBe(false);
    expect(canDownloadDocument(null)).toBe(false);
  });
});
