import { describe, expect, it, vi } from 'vitest';
import { buildMessage, selectUnannounced } from '../../backend/jobs/needsReviewAlert.job.js';
import { attentionLabel, attentionOf } from '../../shared/reviewQueue.js';

/**
 * A schedule change the chain accepted, on a booking it then ticketed.
 *
 * When a segment comes back TK the chain accepts the change (optionCode 13)
 * and the booking is flagged `schedule_changed_by_airline`. The customer still
 * gets the ordinary confirmation (flight.routes.js EMAILED_REVIEW_REASONS), on
 * the understanding that the team tells them the flight was retimed. But the
 * booking is ticketed, and both the desk's Needs-attention list and the Slack
 * alarm skipped every ticketed row whose flag was not the numbers-missing one.
 * Nobody was ever shown it, so nobody told the customer, who could miss a
 * retimed flight holding the searched times.
 */

const at = new Date().toISOString();

// Exactly what buildBookingRow writes: the provider's needsReview, the ticket.
const row = (details = {}, over = {}) => ({
  booking_reference: 'FLTSC1',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 412,
  created_at: at,
  booking_details: {
    pnr: 'ABC123',
    gds: { ticketed: true },
    tickets: [{ number: '075-1234567890', travelerId: '1' }],
    needs_review: { reason: 'schedule_changed_by_airline', statuses: ['TK'], at },
    ...details,
  },
  ...over,
});

describe('a ticketed booking whose schedule the airline changed', () => {
  it('is on the desk, labelled as a schedule change', () => {
    const attention = attentionOf(row());
    expect(attention).toMatchObject({ kind: 'schedule_changed', reason: 'schedule_changed_by_airline', since: at });
    expect(attentionLabel(attention)).toBe('Airline changed the schedule');
  });

  it('is announced in Slack', () => {
    expect(selectUnannounced([row()]).map((booking) => booking.booking_reference)).toEqual(['FLTSC1']);
  });

  it('is announced under its own heading, which says the ticket stands and the customer must be told', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T10:00:00.000Z'));
    try {
      const text = buildMessage([row({ needs_review: { reason: 'schedule_changed_by_airline', statuses: ['TK'], at: '2026-09-22T08:00:00.000Z' } })]);
      expect(text).toBe([
        ':clock3: *1 ticketed booking whose schedule the airline changed*',
        'The airline changed the times of a flight and the change was accepted, and the ticket IS issued. '
          + 'The customer was sent their confirmation, which may still show the times they searched. '
          + 'Check the new times in the PNR and tell the customer. Do NOT reissue and do NOT refund for this: the booking and its ticket stand. '
          + 'If the new times do not suit the customer, handle it as a change or a cancellation.',
        '',
        '*FLTSC1* — confirmed/paid, 412 USD\n'
          + 'PNR ABC123 · segment status: TK\n'
          + 'flagged 2h ago',
      ].join('\n\n'));
      expect(text).not.toMatch(/paid but not ticketed|ticket it, or refund it/);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the ticketed states around it, unchanged', () => {
  it('a ticketed booking with no flag stays off the desk and out of Slack', () => {
    const plain = row({ needs_review: undefined });
    expect(attentionOf(plain)).toBeNull();
    expect(selectUnannounced([plain])).toHaveLength(0);
  });

  it('a schedule change a person resolved stays quiet', () => {
    const resolved = row({ needs_review: { reason: 'schedule_changed_by_airline', statuses: ['TK'], at, resolved_at: at, resolution: 'called the customer' } });
    expect(attentionOf(resolved)).toBeNull();
    expect(selectUnannounced([resolved])).toHaveLength(0);
  });

  it('a schedule change already announced is not announced again, and stays on the desk', () => {
    const announced = row({ needs_review: { reason: 'schedule_changed_by_airline', statuses: ['TK'], at, alerted_at: at } });
    expect(selectUnannounced([announced])).toHaveLength(0);
    expect(attentionOf(announced)?.kind).toBe('schedule_changed');
  });

  it('a cancelled or refunded booking stays quiet', () => {
    expect(attentionOf(row({}, { status: 'cancelled' }))).toBeNull();
    expect(selectUnannounced([row({}, { status: 'cancelled' })])).toHaveLength(0);
    expect(attentionOf(row({}, { payment_status: 'refunded' }))).toBeNull();
    expect(selectUnannounced([row({}, { payment_status: 'refunded' })])).toHaveLength(0);
  });

  it('an unresolved numbers-missing flag is still announced and shown as it was', () => {
    const missing = row({ tickets: [], needs_review: { reason: 'ticket_numbers_not_retrieved', at } });
    expect(selectUnannounced([missing])).toHaveLength(1);
    expect(attentionOf(missing)).toEqual({ kind: 'review', reason: 'ticket_numbers_not_retrieved', since: at });
  });

  it('a resolved numbers-missing flag stays quiet', () => {
    const synced = row({ needs_review: { reason: 'ticket_numbers_not_retrieved', at, resolved_at: at, resolved_by: 'ticket sync' } });
    expect(attentionOf(synced)).toBeNull();
    expect(selectUnannounced([synced])).toHaveLength(0);
  });

  it('an unticketed booking with a schedule change is still "paid but not ticketed"', () => {
    const unticketed = row({ gds: { ticketed: false }, tickets: [] });
    expect(attentionOf(unticketed)).toMatchObject({ kind: 'review', reason: 'schedule_changed_by_airline' });
    expect(buildMessage(selectUnannounced([unticketed]))).toMatch(/paid but not ticketed/);
  });
});
