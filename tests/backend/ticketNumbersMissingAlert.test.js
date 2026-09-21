import { describe, expect, it } from 'vitest';
import { selectUnannounced } from '../../backend/jobs/needsReviewAlert.job.js';
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
