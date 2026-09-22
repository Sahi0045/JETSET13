import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attentionOf } from '../../shared/reviewQueue.js';

/**
 * A booking held BEFORE its ticket was issued, then ticketed later.
 *
 * flagForReview writes the held flag with `ticketed: false`; a person tickets
 * the PNR by hand, and ticket sync (the unticketed population) records the
 * tickets, sets gds.ticketed and SENDS the e-ticket email. It leaves
 * needs_review alone - only the numbers-missing flag is resolved there.
 *
 * The rule that surfaces a held flag on a ticketed booking (openTicketedFlagOf)
 * read "the booking is ticketed now" as "held after its ticket was issued", so
 * this booking went back on the desk as "Ticketed, customer not sent it" and to
 * Slack as "was NOT sent their confirmation" - after the e-ticket had gone out.
 * Only the flag's own `ticketed` says which of the two happened.
 * heldAfterTicketAlert.test.js keeps the other side: held after issue, shown.
 */

let rows = [];

vi.mock('../../backend/routes/flight.routes.js', () => ({
  patchBookingDetails: vi.fn(async (reference, patch) => {
    const row = rows.find((r) => r.booking_reference === reference);
    if (!row) return null;
    const changes = typeof patch === 'function' ? patch(row.booking_details) : patch;
    row.booking_details = { ...row.booking_details, ...changes };
    return row;
  }),
}));

const at = '2026-09-22T09:00:00.000Z';
const travellers = [{ id: '1', firstName: 'Asha', lastName: 'Rao', ptc: 'ADULT', email: 'flyer@example.com' }];

const held = (reason, over = {}) => ({
  booking_reference: 'FLT-HELD',
  status: 'pending_ticketing',
  payment_status: 'paid',
  total_amount: 300,
  created_at: at,
  passenger_details: travellers,
  booking_details: {
    pnr: 'HLD123',
    customer_email: 'flyer@example.com',
    gds: { ticketed: false },
    // the held email went out ("our team is finishing your ticket")
    confirmation_email: { state: 'sent' },
    needs_review: { reason, ticketed: false, at, ...over },
  },
});

const provider = () => ({
  getFlightOrderDetails: vi.fn(async () => ({
    success: true,
    data: {
      tickets: [{ number: '220-7491175301', travelerId: '2', validatingCarrier: 'LH', issuedOn: '2026-09-22' }],
      travelers: [{ id: '2', name: { firstName: 'ASHA', lastName: 'RAO' } }],
    },
  })),
});

let job;
let alarm;

beforeEach(async () => {
  rows = [];
  job = await import('../../backend/jobs/ticketSync.job.js');
  alarm = await import('../../backend/jobs/needsReviewAlert.job.js');
});

describe('held before issuance, then ticketed by hand and synced', () => {
  for (const reason of ['chain failed after commit at issueTicket', 'chain failed after commit at queue', 'order route failed after commit: boom']) {
    it(`${reason}: the e-ticket went out, so the desk does not say "customer not sent it"`, async () => {
      rows.push(held(reason, { alerted_at: at }));
      const sendEmail = vi.fn(async () => ({ success: true }));
      const result = await job.syncOne(rows[0], { provider: provider(), sendEmail });
      expect(result).toMatchObject({ outcome: 'recorded', emailed: true });
      expect(sendEmail).toHaveBeenCalledTimes(1);
      const synced = rows[0];
      expect(synced.booking_details.gds.ticketed).toBe(true);
      expect(synced.booking_details.needs_review.reason).toBe(reason);
      const attention = attentionOf(synced);
      expect(attention).toBeNull();
    });

    it(`${reason}: not yet announced when synced: Slack does not say "was NOT sent their confirmation"`, async () => {
      rows.push(held(reason));
      const sendEmail = vi.fn(async () => ({ success: true }));
      await job.syncOne(rows[0], { provider: provider(), sendEmail });
      expect(sendEmail).toHaveBeenCalledTimes(1);
      const picked = alarm.selectUnannounced(rows);
      const text = alarm.buildMessage(picked);
      expect(text).not.toMatch(/was NOT sent\s+their confirmation/);
      expect(picked).toHaveLength(0);
    });
  }
});
