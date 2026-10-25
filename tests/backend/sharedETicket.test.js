import { describe, expect, it } from 'vitest';
import { canDownloadDocument, isCancelledBooking, ticketState } from '../../shared/eTicket.js';

describe('the ticket rules, read on the server', () => {
  it('says a booking with ticket numbers is issued and can be downloaded', () => {
    const booking = { status: 'confirmed', pnr: '2IZOI8', payment_status: 'paid', tickets: [{ number: '057-7513754072', travelerId: '1' }] };

    expect(ticketState(booking)).toBe('issued');
    expect(canDownloadDocument(booking)).toBe(true);
  });

  it('a cancelled booking is cancelled', () => {
    expect(isCancelledBooking({ status: 'cancelled', pnr: '2IZOI8' })).toBe(true);
  });
});
