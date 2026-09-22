import { describe, expect, it, vi } from 'vitest';
import { buildMessage, selectUnannounced } from '../../backend/jobs/needsReviewAlert.job.js';
import { attentionLabel, attentionOf } from '../../shared/reviewQueue.js';
import { confirmationEmailKind } from '../../backend/routes/flight.routes.js';

/**
 * A booking the order route held for a person AFTER its ticket was issued.
 *
 * When the order route fails after commit (its outer catch, or the chain
 * failing at a step past issuance), flagForReview writes `order route failed
 * after commit: ...` or `chain failed after commit at <step>` with `ticketed:
 * true`, which sets `gds.ticketed`. The customer is sent "Reservation held -
 * our team is finishing your ticket" (confirmationEmailKind 'held') and never
 * the real confirmation. Both the desk and the Slack alarm skipped the row as
 * "ticketed, so done", so the team that promised to finish it was never told:
 * the customer held a live ticket and an email saying it was not done.
 */

const at = new Date().toISOString();

const row = (review, details = {}, over = {}) => ({
  booking_reference: 'FLTHT1',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 300,
  created_at: at,
  booking_details: {
    pnr: 'DEF456',
    gds: { ticketed: true },
    needs_review: { ticketed: true, at, ...review },
    ...details,
  },
  ...over,
});

const routeFailed = row({ reason: 'order route failed after commit: boom' });
const chainFailed = row({ reason: 'chain failed after commit at retrieve' }, { tickets: [{ number: '220-1234567890' }] });

describe('a ticketed booking the order route held for a person', () => {
  it('was sent the held email, promising our team will finish it', () => {
    expect(confirmationEmailKind(routeFailed)).toBe('held');
    expect(confirmationEmailKind(chainFailed)).toBe('held');
  });

  it('is on the desk, labelled as a ticket the customer has not been sent', () => {
    for (const booking of [routeFailed, chainFailed]) {
      const attention = attentionOf(booking);
      expect(attention).toMatchObject({ kind: 'held_ticketed', reason: booking.booking_details.needs_review.reason, since: at });
      expect(attentionLabel(attention)).toBe('Ticketed, customer not sent it');
    }
  });

  it('is announced in Slack', () => {
    expect(selectUnannounced([routeFailed, chainFailed])).toHaveLength(2);
  });

  it('is announced under its own heading: the ticket is issued, send the customer their e-ticket', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T10:00:00.000Z'));
    try {
      const text = buildMessage([row({ reason: 'order route failed after commit: boom', at: '2026-09-22T09:00:00.000Z' })]);
      expect(text).toBe([
        ':envelope: *1 ticketed booking held after its ticket was issued*',
        'The ticket IS issued, but the order route stopped after it and held the booking for a person. '
          + 'The customer was told their reservation is held and our team is finishing their ticket, and was NOT sent '
          + 'their confirmation. Check the booking against the PNR (its FA lines) and record any ticket number missing, '
          + 'then send the customer their e-ticket and confirmation. Do NOT reissue and do NOT refund: the customer holds a live ticket.',
        '',
        '*FLTHT1* — confirmed/paid, 300 USD\n'
          + 'PNR DEF456 · ticketed: yes\n'
          + 'reason: order route failed after commit: boom · flagged 1h ago',
      ].join('\n\n'));
      expect(text).not.toMatch(/paid but not ticketed|ticket it, or refund it/);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the held states around it, unchanged', () => {
  it('held before any ticket was issued: still "paid but not ticketed"', () => {
    const unticketed = row({ reason: 'chain failed after commit at issueTicket', ticketed: false }, { gds: { ticketed: false } },
      { status: 'pending_ticketing' });
    expect(confirmationEmailKind(unticketed)).toBe('held');
    expect(attentionOf(unticketed)).toMatchObject({ kind: 'review', reason: 'chain failed after commit at issueTicket' });
    expect(buildMessage(selectUnannounced([unticketed]))).toMatch(/paid but not ticketed/);
  });

  it('resolved by a person: quiet', () => {
    const handled = row({ reason: 'order route failed after commit: boom', resolved_at: at, resolution: 'e-ticket sent' });
    expect(attentionOf(handled)).toBeNull();
    expect(selectUnannounced([handled])).toHaveLength(0);
  });

  it('already announced: not announced again, still on the desk', () => {
    const announced = row({ reason: 'order route failed after commit: boom', alerted_at: at });
    expect(selectUnannounced([announced])).toHaveLength(0);
    expect(attentionOf(announced)?.kind).toBe('held_ticketed');
  });

  it('cancelled or refunded: quiet', () => {
    const cancelled = row({ reason: 'order route failed after commit: boom' }, {}, { status: 'cancelled' });
    const refunded = row({ reason: 'order route failed after commit: boom' }, {}, { payment_status: 'refunded' });
    expect(attentionOf(cancelled)).toBeNull();
    expect(attentionOf(refunded)).toBeNull();
    expect(selectUnannounced([cancelled, refunded])).toHaveLength(0);
  });

  it('a ticketed booking with no flag, or a flag the ticket settled, stays off the desk and out of Slack', () => {
    const plain = row({}, { needs_review: undefined });
    const ticketedLater = row({ reason: 'PNR committed, never ticketed', ticketed: false });
    for (const booking of [plain, ticketedLater]) {
      expect(attentionOf(booking)).toBeNull();
      expect(selectUnannounced([booking])).toHaveLength(0);
    }
  });

  // The seatless reason shares the held prefix, and is never ticketed by us.
  it('a no-confirmed-seat flag on a ticketed row is not called held', () => {
    const seatless = row({ reason: 'chain failed after commit at segmentStatus' });
    expect(attentionOf(seatless)).toBeNull();
    expect(selectUnannounced([seatless])).toHaveLength(0);
  });
});
