import { describe, expect, it, vi } from 'vitest';
import { buildMessage, selectUnannounced } from '../../backend/jobs/needsReviewAlert.job.js';
import { attentionOf } from '../../shared/reviewQueue.js';

/**
 * The one review flag issuance raises was invisible to both of its readers.
 *
 * When DocIssuance_IssueTicket answers OK but the ticket numbers do not all
 * surface in the PNR, the booking chain records `gds.ticketed: true` - the
 * ticket exists - and `needs_review.reason = 'ticket_numbers_not_retrieved'`
 * so somebody finds the numbers. Both the Slack alarm and the desk's "Needs
 * attention" list skipped every ticketed row before looking at the flag, so
 * nobody was ever told, and the e-ticket promised a number that never came.
 */

const at = new Date().toISOString();

const row = (details = {}) => ({
  booking_reference: 'FLTTICKETS1',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 1500.2,
  created_at: at,
  booking_details: {
    pnr: 'BMPUST',
    gds: { ticketed: true },
    tickets: [],
    needs_review: { reason: 'ticket_numbers_not_retrieved', at },
    ...details,
  },
});

describe('a ticketed booking whose ticket numbers did not all arrive', () => {
  it('is announced when none of the numbers arrived', () => {
    expect(selectUnannounced([row()])).toHaveLength(1);
    expect(attentionOf(row())).toMatchObject({ kind: 'review', reason: 'ticket_numbers_not_retrieved' });
  });

  it('is announced when only some of them did', () => {
    const partial = row({
      tickets: [{ number: '220-7491175301' }],
      needs_review: { reason: 'ticket_numbers_not_retrieved', expected: 4, got: 1, at },
    });
    expect(selectUnannounced([partial])).toHaveLength(1);
    expect(attentionOf(partial)).toMatchObject({ kind: 'review', reason: 'ticket_numbers_not_retrieved' });
  });

  it('is announced once, and leaves the list once someone resolves it', () => {
    expect(selectUnannounced([row({ needs_review: { reason: 'ticket_numbers_not_retrieved', at, alerted_at: at } })])).toHaveLength(0);
    expect(attentionOf(row({ needs_review: { reason: 'ticket_numbers_not_retrieved', at, resolved_at: at } }))).toBeNull();
  });

  it('is not announced once the booking is cancelled or refunded', () => {
    expect(selectUnannounced([{ ...row(), status: 'cancelled' }])).toHaveLength(0);
    expect(attentionOf({ ...row(), payment_status: 'refunded' })).toBeNull();
  });

  // Every other flag on a ticketed booking still means the ticket turned up.
  it('changes nothing for a ticketed booking flagged for any other reason', () => {
    const other = row({ needs_review: { reason: 'chain failed after commit at queue', at } });
    expect(selectUnannounced([other])).toHaveLength(0);
    expect(attentionOf(other)).toBeNull();
  });
});

/**
 * What the alarm TELLS staff about such a booking.
 *
 * Round 1 made these rows reach the alarm, but buildMessage put them under
 * "paid but not ticketed - no ticket was issued ... ticket it, or refund it",
 * beside a line reading "ticketed: yes". Following that heading issues a
 * second ticket against the same payment, or refunds a live ticket. The
 * numbers are on the PNR; the job is to read them, nothing else.
 */
describe('the alarm text for a ticketed booking whose numbers did not arrive', () => {
  const now = new Date('2026-09-22T10:00:00.000Z');
  const flaggedAt = '2026-09-22T07:00:00.000Z';

  it('has its own section, says the ticket is issued, shows expected vs got, and forbids reissue or refund', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const text = buildMessage([row({
        tickets: [{ number: '2207491175301' }],
        needs_review: { reason: 'ticket_numbers_not_retrieved', expected: 4, got: 1, at: flaggedAt },
      })]);
      expect(text).toBe([
        ':ticket: *1 booking ticketed, ticket numbers not read back*',
        'The ticket IS issued: the airline accepted the issue, the customer has paid and holds a live ticket. '
          + 'Only the ticket numbers did not reach us. Read them from the PNR (its FA lines) and record them on the booking. '
          + 'Do NOT reissue and do NOT refund: a second ticket charges the fare twice, and a refund leaves a live ticket unpaid for.',
        '',
        '*FLTTICKETS1* — confirmed/paid, 1500.2 USD\n'
          + 'PNR BMPUST · ticket numbers expected 4, got 1\n'
          + 'flagged 3h ago',
      ].join('\n\n'));
      expect(text).not.toMatch(/not ticketed|no ticket was issued|ticket it, or refund it/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('says it does not know how many were expected rather than inventing a number', () => {
    expect(buildMessage([row()])).toMatch(/PNR BMPUST · ticket numbers expected unknown, got 0/);
  });

  it('keeps an unticketed booking in the ticket-it-or-refund-it section, apart from this one', () => {
    const unticketed = {
      booking_reference: 'FLTNOTICKET',
      status: 'confirmed',
      payment_status: 'paid',
      total_amount: 900,
      created_at: at,
      booking_details: { pnr: 'ABC123', gds: { ticketed: false }, needs_review: { reason: 'chain failed after commit at issueTicket', at } },
    };
    const text = buildMessage([unticketed, row()]);
    const [notTicketed, numbersMissing = ''] = text.split(':ticket:');
    expect(notTicketed).toMatch(/paid but not ticketed/);
    expect(notTicketed).toMatch(/FLTNOTICKET/);
    expect(notTicketed).not.toMatch(/FLTTICKETS1/);
    expect(numbersMissing).toMatch(/FLTTICKETS1/);
    expect(numbersMissing).not.toMatch(/FLTNOTICKET/);
  });
});
