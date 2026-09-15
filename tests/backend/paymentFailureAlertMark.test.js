import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * The failed-refund alarm stamps `alerted_at` onto the whole booking_details
 * column. It wrote a copy read before posting to Slack, so a refund the desk
 * finished meanwhile - or any other change - could be undone by the stamp.
 */

const failed = (over = {}) => ({
  booking_reference: 'FLTA1',
  status: 'cancelled',
  payment_status: 'paid',
  total_amount: 291,
  ...over,
  booking_details: {
    pnr: 'ABC123',
    cancellation: { paymentAction: 'REFUND_FAILED', refundAmount: 0, cancelledAt: '2026-09-14T10:00:00Z' },
    ...(over.booking_details || {}),
  },
});

const load = async (rows) => {
  vi.resetModules();
  const table = fakeBookingsTable(rows);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const { markAlerted } = await import('../../backend/jobs/paymentFailureAlert.job.js');
  return { table, markAlerted };
};

beforeEach(() => vi.resetModules());

describe('markAlerted', () => {
  it('stamps a booking that has not changed since it was read', async () => {
    const read = failed();
    const { table, markAlerted } = await load([read]);

    await markAlerted([read]);

    expect(table.row('FLTA1').booking_details.cancellation.alerted_at).toBeTruthy();
  });

  it('does not undo a refund recorded while the alert was being posted', async () => {
    const read = failed();
    // What the desk wrote after the alarm read the row.
    const now = failed({
      payment_status: 'refunded',
      booking_details: { cancellation: { paymentAction: 'FULL_REFUND', refundAmount: 291, cancelledAt: '2026-09-14T10:00:00Z' } },
    });
    const { table, markAlerted } = await load([now]);

    await markAlerted([read]);

    const row = table.row('FLTA1');
    expect(row.payment_status).toBe('refunded');
    expect(row.booking_details.cancellation.paymentAction).toBe('FULL_REFUND');
    expect(row.booking_details.cancellation.alerted_at).toBeUndefined();
  });
});
