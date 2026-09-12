import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';

/**
 * A refund the gateway refused, on the customer-initiated cancel path.
 *
 * ARC answers a refused refund with HTTP 200 and `result: "FAILURE"`. The
 * cancel handler used to check only the status code, log
 * "✅ REFUND successful: FAILURE", record `PARTIAL_REFUND`, and write the
 * booking `partially_refunded`. The customer was told a refund was on its
 * way. Nothing had moved, and nothing would ever retry it.
 *
 * Harness mirrors cancelRefundGuard.test.js: the GDS releases the seat, so
 * the refund leg runs; only the gateway's answer differs.
 */

const booking = () => ({
  id: 'uuid-1',
  booking_reference: 'FLT123',
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 291,
  booking_details: { pnr: 'ABC123', order_id: 'FLT123' },
  customer_email: 'traveler@example.com',
});

const supabaseFor = (row) => {
  const updates = [];
  const chain = () => {
    const c = {
      select: vi.fn(() => c),
      update: vi.fn((payload) => { updates.push(payload); return c; }),
      insert: vi.fn(() => c),
      eq: vi.fn(() => c),
      or: vi.fn(() => c),
      filter: vi.fn(() => c),
      order: vi.fn(() => c),
      limit: vi.fn(() => c),
      single: vi.fn().mockResolvedValue({ data: row, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    return c;
  };
  return { client: { from: vi.fn(() => chain()) }, updates };
};

const cancelFlightOrder = vi.fn();
let supabaseDouble = supabaseFor(booking());

vi.mock('../../backend/routes/payment/arcpay.config.js', () => ({
  get supabase() { return supabaseDouble.client; },
  ARC_PAY_CONFIG: { BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT' },
  getArcPayAuthConfig: () => ({ headers: {} }),
}));
vi.mock('../../backend/services/flightProvider.js', () => ({
  default: { cancelFlightOrder: (...args) => cancelFlightOrder(...args) },
  providerStatus: () => ({ enabled: true, bookingEnabled: true }),
}));

const runCancel = async () => {
  supabaseDouble = supabaseFor(booking());
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const req = createRequest({ method: 'POST', body: { bookingReference: 'FLT123', reason: 'test', email: 'traveler@example.com' } });
  const res = createResponse();
  await handleCancelBookingAction(req, res);
  return res;
};

/** The write that closes the cancellation on the bookings row. */
const bookingUpdate = () => supabaseDouble.updates.find((u) => u.status === 'cancelled');

beforeEach(() => {
  vi.resetModules();
  cancelFlightOrder.mockReset();
  cancelFlightOrder.mockResolvedValue({ success: true });
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
});

describe('when the gateway refuses the refund', () => {
  beforeEach(() => {
    axios.put.mockResolvedValue({ status: 200, data: { result: 'FAILURE', response: { gatewayCode: 'DECLINED' } } });
  });

  it('records the refund as failed, not partial', async () => {
    const res = await runCancel();

    expect(res.body.cancellation.paymentAction).toBe('REFUND_FAILED');
    expect(res.body.cancellation.refundAmount).toBe(0);
  });

  // The known blocker beneath the status-code bug: the row's payment state
  // was chosen from whether a refund was ATTEMPTED, not whether it worked.
  it('leaves the payment state as paid - the money did not move', async () => {
    await runCancel();

    const written = bookingUpdate();
    expect(written).toBeTruthy();
    expect(written.payment_status).toBe('paid');
    expect(written.payment_status).not.toBe('partially_refunded');
  });

  it('still cancels the booking itself - the seat was released', async () => {
    await runCancel();

    expect(bookingUpdate().status).toBe('cancelled');
  });

  it('keeps the gateway\'s reason so a human can act on it', async () => {
    const res = await runCancel();

    expect(res.body.cancellation.errorDetails?.response?.gatewayCode).toBe('DECLINED');
  });
});

describe('when the gateway answers 200 with no verdict', () => {
  it('is not treated as a refund', async () => {
    axios.put.mockResolvedValue({ status: 200, data: {} });

    const res = await runCancel();

    expect(res.body.cancellation.paymentAction).toBe('REFUND_FAILED');
    expect(bookingUpdate().payment_status).toBe('paid');
  });
});

describe('when the gateway accepts the refund', () => {
  it('records a partial refund and the row reflects it', async () => {
    axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });

    const res = await runCancel();

    expect(res.body.cancellation.paymentAction).toBe('PARTIAL_REFUND');
    expect(res.body.cancellation.refundAmount).toBeGreaterThan(0);
    expect(bookingUpdate().payment_status).toBe('partially_refunded');
  });
});
