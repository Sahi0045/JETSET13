import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * Finishing a cancelled flight's refund by hand.
 *
 * When the automatic refund failed, or was held for review, the booking read
 * "Refund not processed" in My Trips. The desk refunded the card in the ARC
 * portal and the booking went on saying the refund never happened: nothing in
 * the admin panel could refund a flight booking or record one. The amounts
 * recorded come from ARC Pay, never from what an admin types.
 */

let table = null;

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    ARC_PAY_CONFIG: { ...actual.ARC_PAY_CONFIG, BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw' },
    getArcPayAuthConfig: () => ({ headers: {} }),
    get supabase() { return { from: (...args) => table.from(...args) }; },
  };
});

const cancelledFlight = (over = {}) => ({
  id: 'bk-1',
  booking_reference: 'FLTR1',
  travel_type: 'flight',
  status: 'cancelled',
  payment_status: 'paid',
  total_amount: 291,
  ...over,
  booking_details: {
    order_id: 'FLTR1',
    arc_captured_amount: 291,
    arc_captured_currency: 'USD',
    cancellation: { paymentAction: 'REFUND_FAILED', refundAmount: 0, cancellationFee: 0, cancelledAt: '2026-09-14T10:00:00Z' },
    needs_review: { reason: 'charge not reversed after the cancel' },
    ...(over.booking_details || {}),
  },
});

const payment = { result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 291, currency: 'USD' } };
const refundOf = (amount) => ({ result: 'SUCCESS', transaction: { id: `r-${amount}`, type: 'REFUND', amount, currency: 'USD' } });
const order = (...refunds) => ({ status: 200, data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [payment, ...refunds] } });

const settle = async (row, options) => {
  table = fakeBookingsTable([row]);
  const { settleManualFlightRefund } = await import('../../backend/routes/payment/operations.handlers.js');
  return settleManualFlightRefund(row, options);
};

beforeEach(() => {
  vi.resetModules();
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockReset();
});

describe('settleManualFlightRefund', () => {
  it('refunds what the desk asks, never more than ARC holds, and records what ARC then shows', async () => {
    axios.get.mockResolvedValueOnce(order()).mockResolvedValueOnce(order(refundOf(241)));
    axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });

    const { status, body } = await settle(cancelledFlight(), { mode: 'refund', amount: 241, adminId: 'admin-1' });

    expect(status).toBe(200);
    const [url, request] = axios.put.mock.calls[0];
    expect(url).toContain('/order/FLTR1/transaction/refund-admin-');
    expect(request).toMatchObject({ apiOperation: 'REFUND', transaction: { amount: '241.00', currency: 'USD' } });

    const row = table.row('FLTR1');
    expect(row.payment_status).toBe('partially_refunded');
    expect(row.booking_details.cancellation).toMatchObject({
      paymentAction: 'PARTIAL_REFUND', refundAmount: 241, cancellationFee: 50,
      manualRefund: { mode: 'refund', amount: 241, by: 'admin-1', previousPaymentAction: 'REFUND_FAILED' },
    });
    expect(row.booking_details.needs_review.resolved_at).toBeTruthy();
    expect(body.message).toMatch(/refund of \$241\.00/);
  });

  it('records a refund made in the ARC portal without moving any money', async () => {
    axios.get.mockResolvedValue(order(refundOf(291)));

    const { status } = await settle(cancelledFlight(), { mode: 'sync' });

    expect(status).toBe(200);
    expect(axios.put).not.toHaveBeenCalled();
    const row = table.row('FLTR1');
    expect(row.payment_status).toBe('refunded');
    expect(row.booking_details.cancellation).toMatchObject({ paymentAction: 'FULL_REFUND', refundAmount: 291, cancellationFee: 0 });
  });

  it('changes nothing when ARC shows no refund yet', async () => {
    axios.get.mockResolvedValue(order());

    const { status, body } = await settle(cancelledFlight(), { mode: 'sync' });

    expect(status).toBe(409);
    expect(body.code).toBe('NO_REFUND_FOUND');
    expect(table.row('FLTR1').booking_details.cancellation.paymentAction).toBe('REFUND_FAILED');
  });

  it('refuses a refund larger than ARC still holds', async () => {
    axios.get.mockResolvedValue(order(refundOf(100)));

    const { status, body } = await settle(cancelledFlight(), { mode: 'refund', amount: 250 });

    expect(status).toBe(400);
    expect(body.code).toBe('AMOUNT_OVER_HELD');
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('records nothing when ARC refuses the refund', async () => {
    axios.get.mockResolvedValue(order());
    axios.put.mockResolvedValue({ status: 200, data: { result: 'FAILURE' } });

    const { status, body } = await settle(cancelledFlight(), { mode: 'refund', amount: 241 });

    expect(status).toBe(502);
    expect(body.code).toBe('REFUND_REFUSED');
    expect(table.row('FLTR1').booking_details.cancellation.paymentAction).toBe('REFUND_FAILED');
  });

  it('is only for a cancelled flight', async () => {
    expect((await settle(cancelledFlight({ status: 'confirmed' }), { mode: 'sync' })).status).toBe(409);
    expect((await settle(cancelledFlight({ travel_type: 'hotel' }), { mode: 'sync' })).status).toBe(409);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('says so, and changes nothing, when ARC Pay cannot be reached', async () => {
    axios.get.mockRejectedValue(new Error('ECONNRESET'));

    const { status, body } = await settle(cancelledFlight(), { mode: 'refund', amount: 241 });

    expect(status).toBe(503);
    expect(body.code).toBe('GATEWAY_UNAVAILABLE');
    expect(axios.put).not.toHaveBeenCalled();
  });
});
