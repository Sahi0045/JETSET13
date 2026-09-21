import { describe, expect, it, vi } from 'vitest';
import { buildMessage } from '../../backend/jobs/needsReviewAlert.job.js';

/**
 * The numbers-missing alarm when only SOME travellers have a ticket number.
 *
 * The section said "The ticket IS issued: the airline accepted the issue ...
 * Do NOT reissue" for every ticket_numbers_not_retrieved row. The chain also
 * writes that flag when a new session finds fewer tickets on the PNR than
 * travellers after our own issue call was refused (bookingChain.js
 * issueInFreshSessions: "still landing, or issued in part"). Then a traveller
 * with no FA line may hold no ticket at all - a lap infant needing its own FM
 * is the known case - and the desk was told not to issue one.
 *
 * With some numbers, the wording is per traveller: an FA line is a ticket,
 * never reissued; no FA line may be no ticket, issued for that passenger only.
 * With none - only ever after an issue the airline accepted - it is unchanged.
 */

const now = new Date('2026-09-22T10:00:00.000Z');
const flaggedAt = '2026-09-22T07:00:00.000Z';

const row = (details = {}) => ({
  booking_reference: 'FLTPART1',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 1320.5,
  created_at: flaggedAt,
  booking_details: {
    pnr: 'BMPUST',
    gds: { ticketed: true },
    tickets: [
      { number: '220-7491175301', travelerId: '1', pnrTravelerId: '2' },
      { number: '220-7491175302', travelerId: '2', pnrTravelerId: '3' },
    ],
    needs_review: { reason: 'ticket_numbers_not_retrieved', expected: 3, got: 2, at: flaggedAt },
    ...details,
  },
});

const at = (fn) => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  try {
    return fn();
  } finally {
    vi.useRealTimers();
  }
};

describe('the alarm for a booking where only some travellers have a ticket number', () => {
  it('says per traveller: an FA line is a ticket, no FA line may be no ticket', () => {
    const text = at(() => buildMessage([row()]));

    expect(text).toBe([
      ':busts_in_silhouette: *1 booking with ticket numbers for only some travellers*',
      'Some travellers have an FA line (a ticket) on the PNR and some do not. The numbers may still be landing, '
        + 'or the ticket was issued for only some of them: this is also flagged when our own issue call was refused. '
        + 'A traveller with an FA line IS ticketed: do NOT reissue them, a second ticket charges the fare twice. '
        + 'A traveller with no FA line may NOT be ticketed: check the PNR, and issue for that passenger only. '
        + 'Do NOT refund: the travellers with a ticket hold live tickets.',
      '',
      '*FLTPART1* — confirmed/paid, 1320.5 USD\n'
        + 'PNR BMPUST · ticket numbers expected 3, got 2\n'
        + 'FA lines (ticketed, do not reissue): 220-7491175301 (PNR passenger 2), 220-7491175302 (PNR passenger 3)\n'
        + 'no FA line (check, issue for that passenger only): 1 traveller\n'
        + 'flagged 3h ago',
    ].join('\n\n'));
    expect(text).not.toMatch(/The ticket IS issued|the airline accepted the issue/);
  });

  it('names a lap infant\'s ticket as the infant\'s', () => {
    const text = at(() => buildMessage([row({
      tickets: [{ number: '220-7491175301', travelerId: '1', pnrTravelerId: '2' }, { number: '220-7491175303', pnrTravelerId: '2-INF', travelerType: 'HELD_INFANT' }],
      needs_review: { reason: 'ticket_numbers_not_retrieved', expected: 4, got: 2, at: flaggedAt },
    })]));

    expect(text).toMatch(/220-7491175303 \(PNR passenger 2, infant\)/);
    expect(text).toMatch(/no FA line \(check, issue for that passenger only\): 2 travellers/);
  });

  it('keeps the issued, do-not-reissue wording when no number arrived after an accepted issue', () => {
    const text = at(() => buildMessage([row({ tickets: [], needs_review: { reason: 'ticket_numbers_not_retrieved', expected: 3, got: 0, at: flaggedAt } })]));

    expect(text).toMatch(/^:ticket: \*1 booking ticketed, ticket numbers not read back\*/);
    expect(text).toMatch(/The ticket IS issued/);
    expect(text).not.toMatch(/only some travellers/);
  });

  it('puts each booking under its own heading when both kinds are flagged together', () => {
    const none = { ...row({ tickets: [], needs_review: { reason: 'ticket_numbers_not_retrieved', expected: 2, got: 0, at: flaggedAt } }), booking_reference: 'FLTNONE1' };
    const text = at(() => buildMessage([none, row()]));
    const [issued, partial = ''] = text.split(':busts_in_silhouette:');

    expect(issued).toMatch(/FLTNONE1/);
    expect(issued).not.toMatch(/FLTPART1/);
    expect(partial).toMatch(/FLTPART1/);
    expect(partial).not.toMatch(/FLTNONE1/);
  });
});
