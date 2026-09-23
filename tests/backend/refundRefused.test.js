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
  // Where checkout writes the email; see cancelRefundGuard.test.js.
  booking_details: { pnr: 'ABC123', order_id: 'FLT123', customer_email: 'traveler@example.com' },
  user_id: null,
});

const supabaseFor = (row) => {
  const updates = [];
  const chain = () => {
    const c = {
      select: vi.fn(() => c),
      update: vi.fn((payload) => { updates.push(payload); return c; }),
      insert: vi.fn(() => c),
      eq: vi.fn(() => c),
      is: vi.fn(() => c),
      neq: vi.fn(() => c),
      or: vi.fn(() => c),
      filter: vi.fn(() => c),
      order: vi.fn(() => c),
      limit: vi.fn(() => c),
      single: vi.fn().mockResolvedValue({ data: row, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      // Writes match the row: the cancellation claim is won.
      then: (resolve) => resolve({ data: [row], error: null }),
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
  // Ticketed and voided the same day: the fee applies and a partial refund is
  // due, so the refund leg is what these tests exercise. When no fee applies
  // the reversal goes through reverseArcPaymentForOrder instead.
  cancelFlightOrder.mockResolvedValue({ success: true, hadTickets: true, voided: true, requiresAirlineRefund: [] });
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  // The gateway holds the full charge.
  axios.get.mockResolvedValue({
    status: 200,
    data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 291, currency: 'USD' } }] },
  });
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
  // Nor as a refusal: the refund may have been made, and REFUND_FAILED told
  // the desk nothing had gone back (cancelRefundReplyWithoutVerdict.test.js).
  it('is not treated as a refund, nor as a refusal', async () => {
    axios.put.mockResolvedValue({ status: 200, data: {} });

    const res = await runCancel();

    expect(res.body.cancellation.paymentAction).toBe('REFUND_UNDER_REVIEW');
    expect(res.body.cancellation.reversalOutcomeUnknown).toBe(true);
    expect(bookingUpdate().payment_status).toBe('paid');
  });
});

/**
 * What a refusal carries back to the caller and into the log.
 *
 * The whole reply was logged with JSON.stringify and handed back as
 * `errorDetails` in the cancel response, which a guest reaches with a booking
 * reference and an email. A gateway transaction reply can carry the order, the
 * card holder's name and the billing address alongside the verdict; only the
 * verdict is anyone's business here.
 */
describe('a refusal that carries the payer with it', () => {
  const refusal = {
    result: 'FAILURE',
    response: { gatewayCode: 'DECLINED', acquirerMessage: 'Do not honour' },
    order: { id: 'FLT123', amount: 291, reference: 'FLT123' },
    billing: { address: { street: '1 Card Holder Lane', city: 'Springfield' } },
    sourceOfFunds: { provided: { card: { nameOnCard: 'JANE CARDHOLDER', number: '512345xxxxxx0008' } } },
    customer: { email: 'jane.cardholder@example.com' },
  };
  const PAYER = ['Card Holder Lane', 'JANE CARDHOLDER', '512345xxxxxx0008', 'jane.cardholder@example.com'];

  const expectNoPayer = (res, logged) => {
    const body = JSON.stringify(res.body);
    const log = JSON.stringify(logged.mock.calls);
    for (const secret of PAYER) {
      expect(body, `${secret} in the response`).not.toContain(secret);
      expect(log, `${secret} in the log`).not.toContain(secret);
    }
    // The verdict is still there for a human to act on.
    expect(res.body.cancellation.errorDetails?.response?.gatewayCode).toBe('DECLINED');
  };

  it('keeps the payer out of a flight cancel response and the log', async () => {
    axios.put.mockResolvedValue({ status: 200, data: refusal });
    const logged = vi.spyOn(console, 'error');

    const res = await runCancel();

    expect(res.body.cancellation.paymentAction).toBe('REFUND_FAILED');
    expectNoPayer(res, logged);
  });

  it('keeps the payer out of a hotel cancel response and the log', async () => {
    axios.put.mockResolvedValue({ status: 200, data: refusal });
    const logged = vi.spyOn(console, 'error');
    supabaseDouble = supabaseFor({ ...booking(), travel_type: 'hotel', booking_details: { order_id: 'FLT123', customer_email: 'traveler@example.com' } });
    const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
    const res = createResponse();
    await handleCancelBookingAction(createRequest({ method: 'POST', body: { bookingReference: 'FLT123', reason: 'test', email: 'traveler@example.com' } }), res);

    expect(res.body.cancellation.paymentAction).toBe('REFUND_FAILED');
    expectNoPayer(res, logged);
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
