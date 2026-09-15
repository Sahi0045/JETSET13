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
const voidOf = () => ({ result: 'SUCCESS', transaction: { id: 'v-1', type: 'VOID', targetTransactionId: 'txn-1', currency: 'USD' } });
const order = (...later) => ({ status: 200, data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [payment, ...later] } });

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
      paymentAction: 'PARTIAL_REFUND', refundAmount: 241,
      manualRefund: { mode: 'refund', amount: 241, by: 'admin-1', previousPaymentAction: 'REFUND_FAILED' },
    });
    expect(row.booking_details.cancellation.manual_refund_claim).toBeUndefined();
    expect(body.message).toMatch(/refund of \$241\.00/);
  });

  // The cancel set no fee, so the 50 ARC still holds is owed, not kept. It was
  // recorded as "a cancellation fee was kept", and Finish refund disappeared.
  it('records money still held apart from any fee, and leaves the review open', async () => {
    axios.get.mockResolvedValueOnce(order()).mockResolvedValueOnce(order(refundOf(241)));
    axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });

    const { status, body } = await settle(cancelledFlight(), { mode: 'refund', amount: 241 });

    expect(status).toBe(200);
    const cancellation = table.row('FLTR1').booking_details.cancellation;
    expect(cancellation).toMatchObject({ cancellationFee: 0, stillHeld: 50 });
    expect(table.row('FLTR1').booking_details.needs_review.resolved_at).toBeUndefined();
    expect(body.message).not.toMatch(/fee was kept/);
  });

  it('records the rest as the fee when that is what the cancel decided to keep', async () => {
    axios.get.mockResolvedValueOnce(order()).mockResolvedValueOnce(order(refundOf(241)));
    axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
    const feeDecided = cancelledFlight({ booking_details: { cancellation: { paymentAction: 'REFUND_FAILED', refundAmount: 0, cancellationFee: 50 } } });

    const { status } = await settle(feeDecided, { mode: 'refund', amount: 241 });

    expect(status).toBe(200);
    const row = table.row('FLTR1');
    expect(row.booking_details.cancellation).toMatchObject({ paymentAction: 'PARTIAL_REFUND', refundAmount: 241, cancellationFee: 50 });
    expect(row.booking_details.cancellation.stillHeld).toBeUndefined();
    expect(row.booking_details.needs_review.resolved_at).toBeTruthy();
  });

  it('records a refund made in the ARC portal without moving any money', async () => {
    axios.get.mockResolvedValue(order(refundOf(291)));

    const { status } = await settle(cancelledFlight(), { mode: 'sync' });

    expect(status).toBe(200);
    expect(axios.put).not.toHaveBeenCalled();
    const row = table.row('FLTR1');
    expect(row.payment_status).toBe('refunded');
    expect(row.booking_details.cancellation).toMatchObject({ paymentAction: 'FULL_REFUND', refundAmount: 291, cancellationFee: 0 });
    expect(row.booking_details.needs_review.resolved_at).toBeTruthy();
  });

  // A VOID returns the whole capture and records no REFUND. It read as "ARC Pay
  // shows no refund", so a voided payment could never be recorded.
  it('records a payment voided at ARC as returned in full', async () => {
    axios.get.mockResolvedValue(order(voidOf()));

    const { status } = await settle(cancelledFlight(), { mode: 'sync' });

    expect(status).toBe(200);
    const row = table.row('FLTR1');
    expect(row.payment_status).toBe('refunded');
    expect(row.booking_details.cancellation).toMatchObject({ paymentAction: 'VOID', refundAmount: 291, cancellationFee: 0 });
  });

  it('changes nothing when ARC shows no refund yet', async () => {
    axios.get.mockResolvedValue(order());

    const { status, body } = await settle(cancelledFlight(), { mode: 'sync' });

    expect(status).toBe(409);
    expect(body.code).toBe('NO_REFUND_FOUND');
    const cancellation = table.row('FLTR1').booking_details.cancellation;
    expect(cancellation.paymentAction).toBe('REFUND_FAILED');
    expect(cancellation.manual_refund_claim).toBeUndefined();
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
    expect(table.row('FLTR1').booking_details.cancellation.manual_refund_claim).toBeUndefined();
  });

  // A 5xx is ARC failing, not ARC saying there is no payment.
  it('treats an ARC server error as unavailable, not as "no payment"', async () => {
    axios.get.mockResolvedValue({ status: 502, data: { error: 'bad gateway' } });

    const { status, body } = await settle(cancelledFlight(), { mode: 'sync' });

    expect(status).toBe(503);
    expect(body.code).toBe('GATEWAY_UNAVAILABLE');
  });
});

describe('before any money moves', () => {
  it('will not refund a booking the airline never confirmed cancelled', async () => {
    const stillLive = cancelledFlight({ booking_details: { pnr: 'ABC123', cancellation: { paymentAction: 'REFUND_FAILED', refundAmount: 0, amadeusCancelled: false } } });

    const { status, body } = await settle(stillLive, { mode: 'refund', amount: 241 });

    expect(status).toBe(409);
    expect(body.code).toBe('AIRLINE_NOT_CANCELLED');
    expect(axios.get).not.toHaveBeenCalled();
    expect(axios.put).not.toHaveBeenCalled();
    expect(table.writes).toEqual([]);
  });

  it('refunds one the airline released', async () => {
    axios.get.mockResolvedValueOnce(order()).mockResolvedValueOnce(order(refundOf(291)));
    axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
    const released = cancelledFlight({ booking_details: { pnr: 'ABC123', cancellation: { paymentAction: 'REFUND_FAILED', refundAmount: 0, amadeusCancelled: true } } });

    const { status } = await settle(released, { mode: 'refund', amount: 291 });

    expect(status).toBe(200);
    expect(table.row('FLTR1').payment_status).toBe('refunded');
  });

  it('lets one desk member refund at a time', async () => {
    axios.get.mockResolvedValue(order());
    axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
    table = fakeBookingsTable([cancelledFlight()]);
    const { settleManualFlightRefund } = await import('../../backend/routes/payment/operations.handlers.js');
    const row = table.row('FLTR1');

    const results = await Promise.all([
      settleManualFlightRefund(JSON.parse(JSON.stringify(row)), { mode: 'refund', amount: 291, adminId: 'a' }),
      settleManualFlightRefund(JSON.parse(JSON.stringify(row)), { mode: 'refund', amount: 291, adminId: 'b' }),
    ]);

    const codes = results.map((r) => r.body.code || r.status).sort();
    expect(codes).toContain('REFUND_IN_PROGRESS');
    expect(axios.put).toHaveBeenCalledTimes(1);
  });

  it('is not held up by a claim a closed tab left behind', async () => {
    axios.get.mockResolvedValue(order(refundOf(291)));
    const leftBehind = cancelledFlight({
      booking_details: {
        cancellation: { paymentAction: 'REFUND_FAILED', refundAmount: 0, manual_refund_claim: { claimedAt: new Date(Date.now() - 10 * 60_000).toISOString(), by: 'a' } },
      },
    });

    const { status } = await settle(leftBehind, { mode: 'sync' });

    expect(status).toBe(200);
    expect(table.row('FLTR1').booking_details.cancellation.manual_refund_claim).toBeUndefined();
  });
});
