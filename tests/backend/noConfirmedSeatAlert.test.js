import { describe, expect, it, vi } from 'vitest';
import { buildMessage, selectUnannounced } from '../../backend/jobs/needsReviewAlert.job.js';
import { NO_CONFIRMED_SEAT_REVIEW_REASON } from '../../shared/reviewQueue.js';

/**
 * What the alarm tells staff about a PNR the airline confirmed no seat on.
 *
 * The chain stops at step 'segmentStatus' when a flight comes back from commit
 * waitlisted, requested, unable or cancelled; the order route flags the booking
 * 'chain failed after commit at segmentStatus' so a person is paged. The alarm
 * had no section for it, so it landed under "paid but not ticketed ... ticket
 * it, or refund it". Ticketing that PNR issues a ticket for a seat the airline
 * has not given, and refunding it without cancelling leaves its confirmed
 * flights held with nothing paid for them.
 */

const now = new Date('2026-09-22T10:00:00.000Z');
const flaggedAt = '2026-09-22T07:00:00.000Z';

const noSeat = {
  booking_reference: 'FLTNOSEAT',
  status: 'pending_ticketing',
  payment_status: 'paid',
  total_amount: 812.4,
  created_at: flaggedAt,
  booking_details: {
    pnr: 'XYZ789',
    gds: { ticketed: false },
    needs_review: {
      reason: NO_CONFIRMED_SEAT_REVIEW_REASON,
      ticketed: false,
      at: flaggedAt,
      amadeus: {
        operation: null,
        code: null,
        message: 'segment status HK,HL at commit: HL is not a confirmed seat (waitlisted, requested, unable or cancelled); not accepted or ticketed',
      },
    },
  },
};

const unticketed = {
  booking_reference: 'FLTNOTICKET',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 900,
  created_at: flaggedAt,
  booking_details: { pnr: 'ABC123', gds: { ticketed: false }, needs_review: { reason: 'chain failed after commit at issueTicket', at: flaggedAt } },
};

const at = (fn) => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  try {
    return fn();
  } finally {
    vi.useRealTimers();
  }
};

describe('the alarm for a paid PNR with no confirmed seat', () => {
  it('is the reason the order route writes', async () => {
    const routes = await import('../../backend/routes/flight.routes.js');
    expect(NO_CONFIRMED_SEAT_REVIEW_REASON).toBe(routes.NO_CONFIRMED_SEAT_REVIEW_REASON);
  });

  it('is announced', () => {
    expect(selectUnannounced([noSeat])).toHaveLength(1);
  });

  it('has its own section: do not ticket; secure the seat, or cancel the PNR and then refund', () => {
    const text = at(() => buildMessage([noSeat]));

    expect(text).toBe([
      ':no_entry: *1 booking paid, with no confirmed seat from the airline*',
      'The airline has not confirmed a seat on every flight (waitlisted, requested, unable or cancelled at commit). '
        + 'The PNR is live, nothing is ticketed, and the customer has paid and was told a person will contact them. '
        + 'Do NOT ticket this PNR: that issues a ticket for a seat the airline has not given. '
        + 'Secure the seat with the airline, or cancel the PNR and then refund. '
        + 'Do not refund while the PNR is live: its confirmed flights would stay held with nothing paid for them.',
      '',
      '*FLTNOSEAT* — pending_ticketing/paid, 812.4 USD\n'
        + 'PNR XYZ789 · ticketed: NO\n'
        + 'reason: chain failed after commit at segmentStatus · flagged 3h ago\n'
        + 'Amadeus: segment status HK,HL at commit: HL is not a confirmed seat (waitlisted, requested, unable or cancelled); not accepted or ticketed',
    ].join('\n\n'));
    expect(text).not.toMatch(/ticket it, or refund it|paid but not ticketed/);
  });

  it('keeps an ordinary unticketed booking in the ticket-it-or-refund-it section, apart from this one', () => {
    const text = at(() => buildMessage([unticketed, noSeat]));
    const [seatSection, notTicketed = ''] = text.split(':rotating_light:');

    expect(notTicketed).toMatch(/paid but not ticketed/);
    expect(notTicketed).toMatch(/FLTNOTICKET/);
    expect(notTicketed).not.toMatch(/FLTNOSEAT/);
    expect(seatSection).toMatch(/FLTNOSEAT/);
    expect(seatSection).not.toMatch(/FLTNOTICKET/);
  });
});
