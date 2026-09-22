import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMessage, runOnce, selectUnrefunded } from '../../backend/jobs/paymentFailureAlert.job.js';
import { supabaseMock } from './setup.js';

/**
 * A cancel that HELD the refund is not a refund that failed.
 *
 * decideFlightRefund (payment/operations.handlers.js) refuses to move money
 * when it cannot tell safely what is owed - the booking records a ticket the
 * airline no longer shows, a non-refundable fare past its void window - and
 * records REFUND_UNDER_REVIEW. The row stays cancelled/paid, which is true.
 * The failed-refund alarm announced it with the failed-refund wording: "the
 * booking is stored as refunded ... These need refunding by hand", and "the
 * row reads cancelled/paid, which is not what happened". Both false, and the
 * second is an instruction to refund what may be a live ticket. Why the cancel
 * held it was never printed.
 */

const now = new Date().toISOString();

const held = (over = {}) => ({
  booking_reference: 'FLTRV1',
  status: 'cancelled',
  payment_status: 'paid',
  total_amount: 540,
  created_at: now,
  booking_details: {
    pnr: 'JKL012',
    gds: { ticketed: true },
    cancellation: {
      cancelledAt: now,
      reason: 'Customer request',
      paymentAction: 'REFUND_UNDER_REVIEW',
      refundAmount: 0,
      basis: 'the booking records a ticket, but the airline showed none when it was cancelled',
    },
    ...(over.booking_details || {}),
  },
  ...over,
});

const failed = (over = {}) => ({
  booking_reference: 'FLTRF1',
  status: 'cancelled',
  payment_status: 'partially_refunded',
  total_amount: 82.3,
  created_at: now,
  booking_details: {
    cancellation: { cancelledAt: now, reason: 'customer request', paymentAction: 'REFUND_FAILED', refundAmount: 0 },
  },
  ...over,
});

describe('a refund the cancel held for a person', () => {
  it('is still announced', () => {
    expect(selectUnrefunded([held()]).map((b) => b.booking_reference)).toEqual(['FLTRV1']);
  });

  it('is not described as a refund that failed, nor as a row that lies', () => {
    const message = buildMessage([held()]);
    expect(message).not.toMatch(/refunding by hand/);
    expect(message).not.toMatch(/stored as refunded|which is not what happened|refund never went through/);
  });

  it('says why it was held, and that the ticket is checked with the airline first', () => {
    const message = buildMessage([held()]);
    expect(message).toMatch(/FLTRV1/);
    expect(message).toMatch(/the airline showed none when it was cancelled/);
    expect(message).toMatch(/airline/i);
    expect(message).toMatch(/decide/);
  });

  // The cancel writes its fullest reason onto its own review flag: the decision
  // AND anything returnFlightPayment added (a reversal that ended unknown).
  it('prefers the reason on the cancellation\'s own review flag', () => {
    const row = held({
      booking_details: {
        cancellation: {
          paymentAction: 'REFUND_UNDER_REVIEW', refundAmount: 0, cancelledAt: now,
          basis: 'reservation released before any ticket was issued',
        },
        needs_review: { source: 'cancellation', reason: 'automatic reversal ended NONE: order not found', at: now },
      },
    });
    expect(buildMessage([row])).toMatch(/automatic reversal ended NONE: order not found/);
  });
});

describe('the refunds that did fail keep today\'s wording', () => {
  it.each(['REFUND_FAILED', 'VOID_FAILED', 'VOID_MISSING_TXN_ID', 'MANUAL_PROCESS_REQUIRED'])('%s', (action) => {
    const row = failed({ booking_details: { cancellation: { cancelledAt: now, paymentAction: action, refundAmount: 0 } } });
    const message = buildMessage([row]);
    expect(message).toMatch(/refund never went through/);
    expect(message).toMatch(/stored as refunded/);
    expect(message).toMatch(/These need refunding by hand/);
    expect(message).toMatch(/which is not what happened/);
    expect(message).toMatch(/82\.30 USD/);
  });

  it('one message carries both, each under its own heading', () => {
    const message = buildMessage([failed(), held()]);
    const [failedPart, heldPart] = message.split(/refund is held/);
    expect(failedPart).toMatch(/FLTRF1/);
    expect(failedPart).toMatch(/These need refunding by hand/);
    expect(failedPart).not.toMatch(/FLTRV1/);
    expect(heldPart).toMatch(/FLTRV1/);
    expect(heldPart).not.toMatch(/FLTRF1|refunding by hand/);
  });
});

describe('each is announced once', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' }));
  });

  const mockRows = (rows) => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: rows, error: null }),
      limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
    };
    supabaseMock.from.mockReturnValue(chain);
    return chain;
  };

  it('posts one message for a held and a failed refund, and stamps both', async () => {
    const chain = mockRows([failed(), held()]);
    const result = await runOnce({ webhookUrl: 'https://hooks.slack.test/x' });
    expect(result.announced).toBe(2);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(chain.update).toHaveBeenCalledTimes(2);
  });

  it('an already announced held refund stays quiet', () => {
    const row = held();
    row.booking_details.cancellation.alerted_at = now;
    expect(selectUnrefunded([row])).toHaveLength(0);
  });
});
