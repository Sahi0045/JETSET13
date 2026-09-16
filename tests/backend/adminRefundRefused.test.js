import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * The admin panel's "Refund payment", which was the one reversal site in this
 * file that never learned what ARC answers.
 *
 * ARC replies to a refund it refused with HTTP 200 and `result: "FAILURE"`.
 * This handler checked `refundResponse.ok` - the status line alone - so a
 * declined refund was reported to the operator as "Refund processed
 * successfully" and written `refunded`. Every other reversal site here asks
 * `arcSucceeded`.
 *
 * Worse, the writes it made could never land: `refund_amount`, `refund_reason`
 * and `refunded_at` exist in no schema (confirmed against the live table:
 * 42703 undefined_column), so the whole update failed, unchecked - including
 * `payment_status: 'refunded'`. The "already been refunded" guard at the top
 * could therefore never trip, and `alreadyRefunded` - read from that same
 * missing column - was always 0, so the full captured amount could be refunded
 * again on every call. The ceiling now comes from ARC's own transaction list.
 */

let table = fakeBookingsTable([]);

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    ARC_PAY_CONFIG: { ...actual.ARC_PAY_CONFIG, BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw' },
    getArcPayAuthConfig: () => ({ headers: {} }),
    get supabase() { return { from: (...args) => table.from(...args) }; },
  };
});

vi.mock('../../backend/routes/payment/agents.handlers.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireAdmin: async () => true,
  getCaller: async () => ({ id: 'admin-1', role: 'admin' }),
}));

const REF = 'FLT-R1';

const booking = () => ({
  id: 'bk-r1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 291,
  booking_details: { order_id: REF, pnr: 'ABC123' },
});

const payment = (over = {}) => ({
  id: 'pay-1',
  arc_order_id: REF,
  amount: 291,
  currency: 'USD',
  payment_status: 'completed',
  metadata: {},
  ...over,
});

/** An ARC order with one captured payment and whatever refunds are listed. */
const arcOrder = (refunds = [], extra = {}) => ({
  status: 200,
  data: {
    status: 'CAPTURED',
    amount: 291,
    currency: 'USD',
    transaction: [
      { result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 291, currency: 'USD' } },
      ...refunds.map((amount, i) => ({ result: 'SUCCESS', transaction: { id: `rf-${i}`, type: 'REFUND', amount } })),
    ],
    ...extra,
  },
});

const refundWith = async ({ order, putReply, body = { paymentId: 'pay-1', reason: 'Duplicate charge' }, payments }) => {
  table = fakeBookingsTable([booking()], { tables: { payments: payments ?? [payment()] } });
  axios.get.mockResolvedValue(order);
  if (putReply) axios.put.mockResolvedValue(putReply);
  const { handlePaymentRefund } = await import('../../backend/routes/payment/operations.handlers.js');
  const req = createRequest({ method: 'POST', body });
  const res = createResponse();
  await handlePaymentRefund(req, res);
  return res;
};

beforeEach(() => {
  vi.resetModules();
  if (!axios.put) axios.put = vi.fn();
  if (!axios.get) axios.get = vi.fn();
  axios.get.mockReset();
  axios.put.mockReset();
});

describe('admin refund', () => {
  // The bug, exactly.
  it('reports a refund ARC refused as a failure, and records nothing', async () => {
    const res = await refundWith({
      order: arcOrder(),
      putReply: { status: 200, data: { result: 'FAILURE', response: { gatewayCode: 'DECLINED' } } },
    });

    expect(res.body.success).toBe(false);
    expect(res.statusCode).toBe(400);
    expect(String(res.body.error)).toMatch(/refused/i);
    // Nothing may say the money went back.
    expect(table.writes.filter((w) => w.patch?.payment_status === 'refunded')).toHaveLength(0);
    expect(table.row(REF).payment_status).toBe('paid');
  });

  it('never writes a status the payments constraint forbids', async () => {
    await refundWith({
      order: arcOrder(),
      putReply: { status: 200, data: { result: 'FAILURE' } },
    });

    // `refund_pending` is not in the CHECK, and no job ever read it.
    expect(table.writes.map((w) => w.patch?.payment_status)).not.toContain('refund_pending');
    expect(table.writes.some((w) => 'refund_amount' in (w.patch || {}))).toBe(false);
  });

  it('records a refund ARC accepted, against columns that exist', async () => {
    const res = await refundWith({
      order: arcOrder(),
      putReply: { status: 200, data: { result: 'SUCCESS' } },
    });

    expect(res.body.success).toBe(true);
    const write = table.writes.find((w) => w.table === 'payments');
    expect(write.patch.payment_status).toBe('refunded');
    expect(write.patch.metadata.refunds).toHaveLength(1);
    expect(write.patch.metadata.refunds[0].amount).toBe(291);
    // No column the table does not have.
    for (const dead of ['refund_amount', 'refund_reason', 'refunded_at']) {
      expect(dead in write.patch).toBe(false);
    }
  });

  // The booking was found by filtering `bookings.id` on a quotes primary key.
  it('marks the booking this payment belongs to, by its reference', async () => {
    await refundWith({
      order: arcOrder(),
      putReply: { status: 200, data: { result: 'SUCCESS' } },
    });

    expect(table.row(REF).payment_status).toBe('refunded');
  });

  it('refuses a second refund once ARC has already returned it all', async () => {
    const res = await refundWith({ order: arcOrder([291]) });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(String(res.body.error)).toMatch(/already been returned/i);
    // And never asked the gateway to move money again.
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('caps a refund at what the gateway still holds, not at the row amount', async () => {
    // 200 already refunded at ARC; the row still says 291 was paid.
    const res = await refundWith({
      order: arcOrder([200]),
      body: { paymentId: 'pay-1', amount: 291, reason: 'Too much' },
    });

    expect(res.statusCode).toBe(400);
    expect(String(res.body.error)).toMatch(/refundable balance \(91\.00/);
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('moves no money when ARC cannot be read', async () => {
    const res = await refundWith({ order: { status: 503, data: null } });

    expect(res.statusCode).toBe(502);
    expect(res.body.success).toBe(false);
    expect(axios.put).not.toHaveBeenCalled();
  });
});
