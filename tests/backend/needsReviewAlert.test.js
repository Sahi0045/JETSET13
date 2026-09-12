import { beforeEach, describe, expect, it, vi } from 'vitest';
import { selectUnannounced, buildMessage, runOnce } from '../../backend/jobs/needsReviewAlert.job.js';
import { supabaseMock } from './setup.js';

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

  // "failed at issueTicket" alone made a carrier the office may not ticket look
  // like a code regression. The GDS's own words settle it at a glance.
  it('quotes what Amadeus said when the chain recorded it', () => {
    const text = buildMessage([booking({
      booking_details: {
        needs_review: {
          at: new Date().toISOString(),
          reason: 'chain failed after commit at issueTicket',
          ticketed: false,
          amadeus: { operation: 'DocIssuance_IssueTicket', code: '2161', message: '2161 PROHIBITED TICKETING CARRIER - RE-ENTER TICKETING CARRIER' },
        },
      },
    })]);
    expect(text).toMatch(/Amadeus DocIssuance_IssueTicket: 2161 PROHIBITED TICKETING CARRIER/);
  });

  it('adds no Amadeus line when nothing was recorded', () => {
    expect(buildMessage([booking()])).not.toMatch(/Amadeus/);
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

/**
 * `runOnce` is what both callers use: the scheduled job in the API process and
 * scripts/alerts/needs-review-watch.mjs, which is a thin wrapper around it so a
 * manual check cannot drift from the automatic one.
 *
 * The case worth pinning is the dry run. A booking is announced exactly once -
 * `alerted_at` sees to that - so a dry run that posted, or that stamped the
 * row, would silently spend the single alert a stuck booking gets and the real
 * run would then stay quiet about it forever.
 */
describe('running the check once', () => {
  const flagged = () => [booking({ booking_reference: 'FLTSTUCK1' })];

  const mockRows = (rows) => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
    };
    supabaseMock.from.mockReturnValue(chain);
    return chain;
  };

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' }),
    );
  });

  it('a dry run reports what it would send', async () => {
    mockRows(flagged());
    const result = await runOnce({ webhookUrl: 'https://hooks.slack.test/x', dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.wouldAnnounce).toEqual(['FLTSTUCK1']);
    expect(result.message).toMatch(/FLTSTUCK1/);
  });

  it('a dry run sends nothing and stamps nothing', async () => {
    const chain = mockRows(flagged());
    await runOnce({ webhookUrl: 'https://hooks.slack.test/x', dryRun: true });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(chain.update).not.toHaveBeenCalled();
  });

  // So the queue can be checked from a laptop holding no production secrets.
  it('a dry run needs no webhook', async () => {
    mockRows(flagged());
    const result = await runOnce({ webhookUrl: '', dryRun: true });
    expect(result.skipped).toBeUndefined();
    expect(result.dryRun).toBe(true);
  });

  it('a real run posts once to the webhook and marks the booking', async () => {
    const chain = mockRows(flagged());
    const result = await runOnce({ webhookUrl: 'https://hooks.slack.test/x' });
    expect(result.announced).toBe(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://hooks.slack.test/x');
    expect(JSON.parse(init.body).text).toMatch(/FLTSTUCK1/);
    expect(chain.update).toHaveBeenCalled();
  });

  it('refuses to announce with no webhook configured', async () => {
    mockRows(flagged());
    const result = await runOnce({ webhookUrl: '' });
    expect(result.skipped).toMatch(/ALERT_SLACK_WEBHOOK_URL/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('stays quiet when the queue is clear', async () => {
    mockRows([]);
    const result = await runOnce({ webhookUrl: 'https://hooks.slack.test/x' });
    expect(result.announced).toBe(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

/**
 * The case the alarm could not see - and it was the majority case.
 *
 * With AUTO_TICKET off, every booking the chain produces is a paid, committed
 * PNR that issuance never touched. The row was written `confirmed` with no
 * flag on it, so a job keyed on `needs_review` never looked. That is a
 * customer holding a reservation on a ticketing deadline, believing they hold
 * a ticket. The only trace is `gds.ticketed: false` beside a PNR.
 */
describe('a paid PNR that issuance never touched', () => {
  const unflagged = (over = {}) => ({
    booking_reference: 'FLTPNRONLY',
    status: 'pending_ticketing',
    payment_status: 'paid',
    total_amount: 143.02,
    created_at: new Date().toISOString(),
    booking_details: { pnr: 'AMRHOG', gds: { ticketed: false }, ...over },
  });

  const mockRows = (rows) => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
    };
    supabaseMock.from.mockReturnValue(chain);
    return chain;
  };

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' }),
    );
  });

  it('is announced even though nothing flagged it', () => {
    expect(selectUnannounced([unflagged()])).toHaveLength(1);
  });

  // No capture, no money at stake - an abandoned checkout, not a stuck booking.
  it('is ignored when the payment was never captured', () => {
    expect(selectUnannounced([{ ...unflagged(), payment_status: 'unpaid' }])).toHaveLength(0);
  });

  // Nothing was committed at the GDS, so nothing is being held.
  it('is ignored without a PNR', () => {
    expect(selectUnannounced([unflagged({ pnr: undefined })])).toHaveLength(0);
  });

  it('is ignored once ticketed', () => {
    expect(selectUnannounced([unflagged({ gds: { ticketed: true } })])).toHaveLength(0);
  });

  it('is ignored when the flag is merely absent and ticketing is unknown', () => {
    // `gds.ticketed` undefined is not the same as false: nothing is asserted.
    expect(selectUnannounced([unflagged({ gds: {} })])).toHaveLength(0);
  });

  // Announcing it writes the flag it never had, so from then on it is one
  // class - flagged, and stamped - and is never announced twice.
  it('is announced once and then carries a reason and a stamp', async () => {
    const chain = mockRows([unflagged()]);
    const first = await runOnce({ webhookUrl: 'https://hooks.slack.test/x' });
    expect(first.announced).toBe(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    const written = chain.update.mock.calls[0][0].booking_details.needs_review;
    expect(written.reason).toMatch(/never ticketed/);
    expect(written.ticketed).toBe(false);
    expect(written.alerted_at).toBeTruthy();

    // The stamped row is quiet next time.
    expect(selectUnannounced([{ ...unflagged(), booking_details: { ...unflagged().booking_details, needs_review: written } }])).toHaveLength(0);
  });

  it('describes it honestly in the message', () => {
    const text = buildMessage([unflagged()]);
    expect(text).toMatch(/FLTPNRONLY/);
    expect(text).toMatch(/ticketed: NO/);
    expect(text).toMatch(/never ticketed/);
  });
});
