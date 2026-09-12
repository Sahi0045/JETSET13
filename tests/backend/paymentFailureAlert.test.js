import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  selectUnrefunded,
  buildMessage,
  runOnce,
  FAILED_PAYMENT_ACTIONS,
} from '../../backend/jobs/paymentFailureAlert.job.js';
import { supabaseMock } from './setup.js';

/**
 * A cancellation whose refund failed is the one failure the product actively
 * hides: `payment_status` is set from whether a payment action was attempted,
 * not whether it succeeded, so the booking stores itself as `partially_refunded`
 * while the customer has had nothing back. Nothing else in the system will ever
 * flag it, which is why the selection below is the whole job.
 *
 * The real row this was written against is E2ETEST-MTNHB01H: 82.30 USD taken,
 * 0 returned, paymentAction REFUND_FAILED, sitting since 4 Sep.
 */

const booking = (overrides = {}) => ({
  booking_reference: 'FLT1',
  status: 'cancelled',
  payment_status: 'partially_refunded',
  total_amount: 82.3,
  created_at: new Date().toISOString(),
  booking_details: {
    cancellation: {
      cancelledAt: new Date().toISOString(),
      reason: 'customer request',
      paymentAction: 'REFUND_FAILED',
      refundAmount: 0,
      cancellationFee: 50,
      ...(overrides.cancellation || {}),
    },
    ...(overrides.booking_details || {}),
  },
  ...overrides,
});

describe('choosing which failed refunds to announce', () => {
  it('announces a cancellation whose refund was refused', () => {
    expect(selectUnrefunded([booking()])).toHaveLength(1);
  });

  // Only REFUND_FAILED has ever occurred, but the alarm is written from the
  // handler's branches, not from the one failure already seen.
  it('covers every failing payment action the cancel path can produce', () => {
    for (const action of FAILED_PAYMENT_ACTIONS) {
      const row = booking({ cancellation: { paymentAction: action, refundAmount: 0 } });
      expect(selectUnrefunded([row]), action).toHaveLength(1);
    }
  });

  it('ignores a refund that worked', () => {
    const ok = booking({ cancellation: { paymentAction: 'PARTIAL_REFUND', refundAmount: 32.3 } });
    const voided = booking({ cancellation: { paymentAction: 'VOID', refundAmount: 82.3 } });
    const feeCovered = booking({ cancellation: { paymentAction: 'NO_REFUND_FEE_COVERS', refundAmount: 0 } });
    expect(selectUnrefunded([ok, voided, feeCovered])).toHaveLength(0);
  });

  it('ignores a booking that was never cancelled', () => {
    expect(selectUnrefunded([booking({ booking_details: { cancellation: undefined } })])).toHaveLength(0);
  });

  // Otherwise every run repeats the same alert until someone mutes the channel.
  it('announces each booking only once', () => {
    const already = booking({ cancellation: { paymentAction: 'REFUND_FAILED', refundAmount: 0, alerted_at: '2026-09-12T11:42:47Z' } });
    expect(selectUnrefunded([already])).toHaveLength(0);
  });

  // The legacy HTLMR07MJV4 row: cancelled, unpaid, a cancellation block with no
  // payment action at all. No money was taken, so none is owed.
  it('ignores a cancellation where nothing was ever charged', () => {
    const nothingTaken = booking({ total_amount: 0 });
    const noAction = booking({ cancellation: { paymentAction: undefined, refundAmount: 0 } });
    expect(selectUnrefunded([nothingTaken, noAction])).toHaveLength(0);
  });

  it('goes quiet once someone refunds it by hand', () => {
    const settled = booking({ cancellation: { paymentAction: 'REFUND_FAILED', refundAmount: 82.3 } });
    expect(selectUnrefunded([settled])).toHaveLength(0);
  });

  it('survives rows with no booking_details at all', () => {
    expect(selectUnrefunded([{ booking_reference: 'X' }, null, undefined])).toHaveLength(0);
  });
});

describe('the message', () => {
  it('says what is wrong, names the booking and totals the money', () => {
    const text = buildMessage([booking({ booking_reference: 'E2ETEST-MTNHB01H' })]);
    expect(text).toMatch(/refund never went through/);
    expect(text).toMatch(/E2ETEST-MTNHB01H/);
    expect(text).toMatch(/82\.30 USD/);
    expect(text).toMatch(/REFUND_FAILED/);
  });

  // The point of the alert: the row's own status is misleading.
  it('warns that the booking stores itself as refunded', () => {
    expect(buildMessage([booking()])).toMatch(/stored as refunded|not what happened/);
  });

  // Alerts get forwarded; passenger data must not ride along.
  it('carries no passenger details', () => {
    const withPassenger = booking();
    withPassenger.passenger_details = [{ firstName: 'Jane', lastName: 'Doe', passportNumber: 'X1234567' }];
    withPassenger.booking_details.travelers = [{ firstName: 'Jane', lastName: 'Doe' }];
    expect(buildMessage([withPassenger])).not.toMatch(/Jane|Doe|X1234567/);
  });
});

describe('running the check once', () => {
  const mockRows = (rows) => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
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

  it('a dry run reports what it would send, sending and stamping nothing', async () => {
    const chain = mockRows([booking({ booking_reference: 'FLTOWED' })]);
    const result = await runOnce({ webhookUrl: 'https://hooks.slack.test/x', dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.wouldAnnounce).toEqual(['FLTOWED']);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(chain.update).not.toHaveBeenCalled();
  });

  it('a real run posts once and marks the booking', async () => {
    const chain = mockRows([booking({ booking_reference: 'FLTOWED' })]);
    const result = await runOnce({ webhookUrl: 'https://hooks.slack.test/x' });
    expect(result.announced).toBe(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://hooks.slack.test/x');
    expect(JSON.parse(init.body).text).toMatch(/FLTOWED/);
    expect(chain.update).toHaveBeenCalled();
  });

  it('refuses to announce with no webhook configured', async () => {
    mockRows([booking()]);
    const result = await runOnce({ webhookUrl: '' });
    expect(result.skipped).toMatch(/ALERT_SLACK_WEBHOOK_URL/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('stays quiet when every refund went through', async () => {
    mockRows([booking({ cancellation: { paymentAction: 'PARTIAL_REFUND', refundAmount: 32.3 } })]);
    const result = await runOnce({ webhookUrl: 'https://hooks.slack.test/x' });
    expect(result.announced).toBe(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
