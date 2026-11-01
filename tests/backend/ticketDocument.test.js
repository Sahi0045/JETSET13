import { describe, expect, it } from 'vitest';
import { documentNoticeOf, documentTitleOf, paymentReturned } from '../../shared/ticketDocument.js';

const ticketed = { status: 'confirmed', pnr: '2IZOI8', payment_status: 'paid', tickets: [{ number: '057-7513754072', travelerId: '1' }] };

describe('what the travel document is called and says', () => {
  it('a ticketed booking is an e-ticket with no notice', () => {
    expect(documentTitleOf(ticketed)).toBe('E-Ticket');
    expect(documentNoticeOf(ticketed)).toBeNull();
  });

  it('a cancelled booking is a cancelled booking', () => {
    expect(documentTitleOf({ ...ticketed, status: 'cancelled' })).toBe('Cancelled Booking');
  });

  it('a booking held without a ticket is a confirmation that says it is not a ticket', () => {
    const held = { status: 'confirmed', pnr: '2IZOI8', payment_status: 'paid', tickets: [] };

    expect(documentTitleOf(held)).toBe('Booking Confirmation');
    expect(documentNoticeOf(held)?.title).toMatch(/not a ticket/);
  });

  it('knows a payment that went back', () => {
    expect(paymentReturned({ payment_status: 'refunded' })).toBe('all');
    expect(paymentReturned({ paymentStatus: 'partially_refunded' })).toBe('part');
    expect(paymentReturned({ payment_status: 'paid' })).toBeNull();
  });
});
