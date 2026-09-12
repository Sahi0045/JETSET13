import { describe, expect, it } from 'vitest';
import { selectUnannounced, buildMessage } from '../../backend/jobs/needsReviewAlert.job.js';

/**
 * An alert channel is only useful while people still read it.
 *
 * The selection is the whole job: announce a booking that took money and never
 * produced a ticket, exactly once, and never announce one that was already
 * dealt with. The first dry run of this alert flagged FLTMTPRZA5T - cancelled
 * and refunded days earlier - which is the false alarm that gets a channel
 * muted, so that case is pinned here.
 */

const booking = (overrides = {}) => ({
  booking_reference: 'FLT1',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 143.02,
  created_at: new Date().toISOString(),
  booking_details: {
    pnr: 'AMRHOG',
    needs_review: { at: new Date().toISOString(), reason: 'chain failed after commit at issueTicket', ticketed: false },
    ...(overrides.booking_details || {}),
  },
  ...overrides,
});

describe('choosing which stuck bookings to announce', () => {
  it('announces a paid booking with a PNR and no ticket', () => {
    expect(selectUnannounced([booking()])).toHaveLength(1);
  });

  it('ignores a booking that was never flagged', () => {
    expect(selectUnannounced([booking({ booking_details: { needs_review: undefined } })])).toHaveLength(0);
  });

  // Otherwise every run repeats the same alert until someone mutes the channel.
  it('announces each booking only once', () => {
    const already = booking({
      booking_details: { needs_review: { reason: 'x', alerted_at: '2026-09-12T11:42:47Z' } },
    });
    expect(selectUnannounced([already])).toHaveLength(0);
  });

  it('goes quiet once the ticket is issued', () => {
    const ticketedFlag = booking({ booking_details: { gds: { ticketed: true }, needs_review: { reason: 'x' } } });
    const hasTickets = booking({ booking_details: { tickets: [{ number: '057-1234567890' }], needs_review: { reason: 'x' } } });
    expect(selectUnannounced([ticketedFlag, hasTickets])).toHaveLength(0);
  });

  // The real false alarm this filter was written for.
  it('ignores a booking that was already cancelled or refunded', () => {
    const cancelled = booking({ booking_reference: 'FLTMTPRZA5T', status: 'cancelled', payment_status: 'partially_refunded' });
    const refunded = booking({ status: 'confirmed', payment_status: 'refunded' });
    expect(selectUnannounced([cancelled, refunded])).toHaveLength(0);
  });

  it('picks the genuine ones out of a mixed queue', () => {
    const rows = [
      booking({ booking_reference: 'GOOD1' }),
      booking({ booking_reference: 'DONE', status: 'cancelled' }),
      booking({ booking_reference: 'SEEN', booking_details: { needs_review: { alerted_at: '2026-09-12T00:00:00Z' } } }),
      booking({ booking_reference: 'GOOD2' }),
    ];
    expect(selectUnannounced(rows).map((b) => b.booking_reference)).toEqual(['GOOD1', 'GOOD2']);
  });

  it('survives rows with no booking_details at all', () => {
    expect(selectUnannounced([{ booking_reference: 'X' }, null, undefined])).toHaveLength(0);
  });
});

describe('the message', () => {
  it('says what is wrong and names the bookings', () => {
    const text = buildMessage([booking({ booking_reference: 'FLTDE65B4DDB7A44E' })]);
    expect(text).toMatch(/paid but not ticketed/);
    expect(text).toMatch(/FLTDE65B4DDB7A44E/);
    expect(text).toMatch(/AMRHOG/);
  });

  // Alerts get forwarded; passenger data must not ride along.
  it('carries no passenger details', () => {
    const withPassenger = booking();
    withPassenger.booking_details.travelers = [{ firstName: 'Jane', lastName: 'Doe' }];
    withPassenger.passenger_details = [{ firstName: 'Jane', lastName: 'Doe', passportNumber: 'X1234567' }];
    const text = buildMessage([withPassenger]);
    expect(text).not.toMatch(/Jane|Doe|X1234567/);
  });
});
