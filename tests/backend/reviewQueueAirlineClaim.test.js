import { describe, expect, it } from 'vitest';
import { attentionOf, attentionLabel } from '../../shared/reviewQueue.js';
import { needsAirlineRefundClaim } from '../../backend/jobs/needsReviewAlert.job.js';

/**
 * The admin "Needs attention" list and the Slack alarm have to agree about
 * which cancelled bookings owe a refund claim to the airline.
 *
 * shared/reviewQueue.js says its rules are the alarm's own, so the panel lists
 * exactly what Slack announced. They were not. The alarm asks the cancellation
 * which tickets it could not void - `needs_review.tickets`, written from
 * `requiresAirlineRefund` (payment/operations.handlers.js) - while the panel
 * asked whether the booking had ticket numbers recorded at all.
 *
 * Those differ exactly when it matters. When the chain issued tickets but could
 * not read their numbers back it flags `ticket_numbers_not_retrieved` and
 * leaves `tickets` empty (bookingChain.js); cancelled past the void window, the
 * cancel's own retrieve finds the tickets and lists them for a claim. Slack
 * announced it once and stamped it; the panel said nothing needed doing - and
 * the Slack message was then the only trace of a ticket's full value sitting
 * with the airline.
 */

const cancelled = (details) => ({ status: 'cancelled', payment_status: 'paid', booking_details: details });

// Tickets past the void window, whose numbers the booking never recorded.
const unvoidedUnrecorded = cancelled({
  pnr: 'BMPUST',
  tickets: [],
  gds: { ticketed: true },
  needs_review: {
    reason: 'tickets could not be voided; airline refund must be claimed',
    source: 'cancellation',
    at: '2026-09-18T10:00:00Z',
    tickets: ['220-7491175301', '220-7491175302'],
  },
});

// Every ticket voided; the review is about a refund the gateway refused.
const voidedRefundRefused = cancelled({
  pnr: 'BMPUST',
  tickets: [{ number: '220-7491175301' }],
  gds: { ticketed: true },
  needs_review: {
    reason: 'automatic reversal ended REFUND_FAILED: declined',
    source: 'cancellation',
    at: '2026-09-18T10:00:00Z',
  },
});

describe('a cancelled booking with tickets to claim from the airline', () => {
  it('is on the list even when the booking never recorded their numbers', () => {
    expect(attentionOf(unvoidedUnrecorded)).toMatchObject({
      kind: 'airline_refund',
      tickets: ['220-7491175301', '220-7491175302'],
      since: '2026-09-18T10:00:00Z',
    });
  });

  it('is on the list exactly when the alarm announces it', () => {
    for (const booking of [unvoidedUnrecorded, voidedRefundRefused]) {
      expect(attentionOf(booking)?.kind === 'airline_refund', booking.booking_details.needs_review.reason)
        .toBe(needsAirlineRefundClaim(booking));
    }
  });
});

describe('a cancelled booking flagged for another reason', () => {
  /**
   * Nothing is owed by the airline here - every ticket was voided - so it is
   * not a claim. It still asked for a person (the refund did not go through),
   * so it stays on the list, under its own reason rather than a claim's.
   */
  it('is not called a refund to claim from the airline', () => {
    const attention = attentionOf(voidedRefundRefused);

    expect(attention?.kind).not.toBe('airline_refund');
    expect(attentionLabel(attention)).not.toMatch(/airline/i);
    expect(attention).toMatchObject({ kind: 'review', reason: /REFUND_FAILED/ });
  });

  it('leaves the list once the desk has dealt with it', () => {
    const done = cancelled({
      ...voidedRefundRefused.booking_details,
      needs_review: { ...voidedRefundRefused.booking_details.needs_review, resolved_at: '2026-09-19T09:00:00Z' },
    });
    expect(attentionOf(done)).toBeNull();
  });
});
