import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The order route asks the gateway whether a booking was paid for, before it
 * sells a seat.
 *
 * It used to read `paidAmount` from the row's `total_amount` - the figure the
 * CLIENT asked to be charged when the checkout session was created, written
 * while the row was still `unpaid` - and never looked at `payment_status`.
 * `reconcileBookingPayment` is the single answer to "did ARC capture it, and
 * how much": from the row when the row already knows, from the gateway when it
 * does not, and persisted so the next caller need not ask again.
 */

const updates = [];
const chain = () => {
  const c = {
    select: vi.fn(() => c),
    update: vi.fn((payload) => { updates.push(payload); return c; }),
    eq: vi.fn(() => c),
    or: vi.fn(() => c),
    order: vi.fn(() => c),
    limit: vi.fn(() => c),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return c;
};

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    supabase: { from: vi.fn(() => chain()) },
    ARC_PAY_CONFIG: {
      MERCHANT_ID: 'TESTMERCHANT',
      API_PASSWORD: 'pw',
      BASE_URL: 'https://arc.test/api/rest/version/77',
    },
  };
});

const reconcile = async (row) => {
  const { reconcileBookingPayment } = await import('../../backend/routes/payment/checkout.handlers.js');
  return reconcileBookingPayment(row);
};

const captured = (amount = 291) => ({
  status: 200,
  data: {
    status: 'CAPTURED',
    amount,
    currency: 'USD',
    transaction: [{ result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount, currency: 'USD' } }],
  },
});

const row = (over = {}) => ({
  id: 7,
  booking_reference: 'FLTTEST1',
  status: 'pending',
  payment_status: 'unpaid',
  total_amount: 5000,             // what the client asked for; proves nothing
  booking_details: { order_id: 'FLTTEST1' },
  ...over,
});

beforeEach(() => {
  vi.resetModules();
  updates.length = 0;
});

describe('answering from the row', () => {
  it('a paid row with a recorded capture needs no gateway call', async () => {
    const result = await reconcile(row({
      payment_status: 'paid',
      booking_details: { arc_captured_amount: 291, arc_captured_currency: 'USD', arc_transaction_id: 'txn-1' },
    }));

    expect(result.paid).toBe(true);
    expect(result.capturedAmount).toBe(291);
    expect(result.alreadyReconciled).toBe(true);
    expect(axios.get).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  // That money is no longer available for a booking.
  it('a refunded row is not paid, and is not re-checked', async () => {
    for (const payment_status of ['refunded', 'partially_refunded']) {
      const result = await reconcile(row({ payment_status }));
      expect(result.paid).toBe(false);
      expect(axios.get).not.toHaveBeenCalled();
    }
  });

  it('a cancelled row is not paid', async () => {
    const result = await reconcile(row({ status: 'cancelled', payment_status: 'paid' }));
    expect(result.paid).toBe(false);
    expect(axios.get).not.toHaveBeenCalled();
  });
});

describe('answering from the gateway', () => {
  it('marks an unpaid row paid when ARC shows a capture, and records what was captured', async () => {
    axios.get.mockResolvedValue(captured(291));

    const result = await reconcile(row());

    expect(result.paid).toBe(true);
    expect(result.capturedAmount).toBe(291);
    expect(result.arcTransactionId).toBe('txn-1');
    expect(updates).toHaveLength(1);
    expect(updates[0].payment_status).toBe('paid');
    expect(updates[0].booking_details.arc_captured_amount).toBe(291);
    expect(updates[0].booking_details.arc_captured_currency).toBe('USD');
    expect(updates[0].booking_details.arc_transaction_id).toBe('txn-1');
  });

  // The exploit, from the guard's point of view: the row says 5000, ARC says 291.
  it('reports the captured amount, never the row\'s total_amount', async () => {
    axios.get.mockResolvedValue(captured(291));

    const result = await reconcile(row({ total_amount: 5000 }));

    expect(result.capturedAmount).toBe(291);
    expect(result.capturedAmount).not.toBe(5000);
  });

  it('does not mark paid when ARC shows no capture', async () => {
    axios.get.mockResolvedValue({ status: 200, data: { status: 'PENDING', transaction: [] } });

    const result = await reconcile(row());

    expect(result.paid).toBe(false);
    expect(result.orderStatus).toBe('PENDING');
    expect(updates).toHaveLength(0);
  });

  it('does not mark paid when the gateway cannot be reached', async () => {
    axios.get.mockRejectedValue(new Error('ECONNRESET'));

    const result = await reconcile(row());

    expect(result.paid).toBe(false);
    expect(result.error).toMatch(/gateway/i);
    expect(updates).toHaveLength(0);
  });

  it('does not mark paid on a non-200 from the gateway', async () => {
    axios.get.mockResolvedValue({ status: 500, data: {} });

    const result = await reconcile(row());

    expect(result.paid).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it('a pending row moves to paid; a row the chain has advanced keeps its status', async () => {
    axios.get.mockResolvedValue(captured());

    await reconcile(row({ status: 'pending' }));
    await reconcile(row({ status: 'pending_ticketing' }));

    expect(updates[0].status).toBe('paid');
    expect(updates[1].status).toBe('pending_ticketing');
  });
});

/**
 * Rows reconciled before the captured amount was recorded.
 *
 * They are paid - verified against ARC once already - but carry no amount.
 * Refusing them over a missing number would be the mirror image of the bug
 * this closes: a paid customer told their payment was not found.
 */
describe('a row paid before the amount was recorded', () => {
  const legacyPaid = () => row({
    payment_status: 'paid',
    total_amount: 291,
    booking_details: { order_id: 'FLTTEST1', arc_transaction_id: 'txn-1' },
  });

  it('fills the amount in from the gateway and persists it', async () => {
    axios.get.mockResolvedValue(captured(291));

    const result = await reconcile(legacyPaid());

    expect(result.paid).toBe(true);
    expect(result.capturedAmount).toBe(291);
    expect(updates).toHaveLength(1);
    expect(updates[0].booking_details.arc_captured_amount).toBe(291);
  });

  it('stays paid, on the session amount, when the gateway cannot be reached', async () => {
    axios.get.mockRejectedValue(new Error('ECONNRESET'));

    const result = await reconcile(legacyPaid());

    expect(result.paid).toBe(true);
    expect(result.capturedAmount).toBe(291);
    expect(result.alreadyReconciled).toBe(true);
  });

  it('stays paid but says so when the gateway disagrees with the row', async () => {
    axios.get.mockResolvedValue({ status: 200, data: { status: 'PENDING', transaction: [] } });

    const result = await reconcile(legacyPaid());

    expect(result.paid).toBe(true);
    expect(result.error).toMatch(/no captured transaction/);
  });
});
