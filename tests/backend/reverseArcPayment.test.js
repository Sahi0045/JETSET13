import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Reversing a charge after a booking failed.
 *
 * Two things this used to get wrong, both on the path every booking takes
 * today (booking is disabled in production, so every order ends here):
 *
 *  1. The amount came from the caller. Every call site passed
 *     `req.body.totalAmount`, which the client controls; with the VOID leg
 *     refused (already settled) and the REFUND leg running, a client that
 *     posted 1.00 against a 900.00 charge was refunded 1.00 and the row
 *     written `refunded`.
 *  2. HTTP 2xx was read as "money moved". ARC answers a refund it refused with
 *     200 and `result: "FAILURE"`. The VOID leg also accepted a reply with no
 *     `result` at all.
 */

vi.mock('../../backend/routes/payment/arcpay.config.js', () => ({
  supabase: { from: vi.fn() },
  ARC_PAY_CONFIG: { BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT' },
  getArcPayAuthConfig: () => ({ headers: {} }),
}));
vi.mock('../../backend/services/flightProvider.js', () => ({
  default: {},
  providerStatus: () => ({ enabled: true, bookingEnabled: true }),
}));

const reverse = async (orderId, opts) => {
  const { reverseArcPaymentForOrder } = await import('../../backend/routes/payment/operations.handlers.js');
  return reverseArcPaymentForOrder(orderId, opts);
};

/** RETRIEVE_ORDER showing one captured PAYMENT of `amount`. */
const orderWithCapture = (amount = 900) => ({
  status: 200,
  data: {
    status: 'CAPTURED',
    amount,
    transaction: [{ result: 'SUCCESS', transaction: { id: 'pay-1', type: 'PAYMENT', amount } }],
  },
});

const ok = { status: 200, data: { result: 'SUCCESS' } };
const refused = { status: 200, data: { result: 'FAILURE', response: { gatewayCode: 'DECLINED' } } };

/** The body of the n-th PUT ARC received. */
const putBody = (n) => axios.put.mock.calls[n][1];

beforeEach(() => {
  vi.resetModules();
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockResolvedValue(orderWithCapture(900));
});

describe('which amount is returned', () => {
  it('refunds what the gateway captured, not what the caller said', async () => {
    axios.put.mockResolvedValueOnce(refused).mockResolvedValueOnce(ok);   // VOID refused, REFUND ok

    const result = await reverse('FLT1', { amount: 1 });

    expect(result.reversed).toBe(true);
    expect(result.action).toBe('REFUND');
    expect(result.amount).toBe(900);
    expect(putBody(1).apiOperation).toBe('REFUND');
    expect(putBody(1).transaction.amount).toBe('900.00');
  });

  it('refunds the captured amount when the caller passes nothing at all', async () => {
    axios.put.mockResolvedValueOnce(refused).mockResolvedValueOnce(ok);

    const result = await reverse('FLT1', {});

    expect(result.amount).toBe(900);
    expect(putBody(1).transaction.amount).toBe('900.00');
  });

  it('ignores a caller amount that overstates the capture too', async () => {
    axios.put.mockResolvedValueOnce(refused).mockResolvedValueOnce(ok);

    const result = await reverse('FLT1', { amount: 5000 });

    expect(result.amount).toBe(900);
  });
});

describe('what counts as reversed', () => {
  it('a VOID the gateway accepted is a reversal', async () => {
    axios.put.mockResolvedValueOnce(ok);

    const result = await reverse('FLT1', {});

    expect(result.reversed).toBe(true);
    expect(result.action).toBe('VOID');
    expect(axios.put).toHaveBeenCalledTimes(1);
  });

  // The old escape hatch: `|| !voidResp.data?.result` made a reply with no
  // verdict count as a successful void.
  it('a VOID reply with no result is not a reversal - it falls through to REFUND', async () => {
    axios.put.mockResolvedValueOnce({ status: 200, data: {} }).mockResolvedValueOnce(ok);

    const result = await reverse('FLT1', {});

    expect(result.action).toBe('REFUND');
    expect(axios.put).toHaveBeenCalledTimes(2);
  });

  // The bug: 200 + FAILURE used to be reported as reversed:true.
  it('a REFUND the gateway refused is NOT a reversal', async () => {
    axios.put.mockResolvedValueOnce(refused).mockResolvedValueOnce(refused);

    const result = await reverse('FLT1', { amount: 900 });

    expect(result.reversed).toBe(false);
    expect(result.action).toBe('FAILED');
    expect(result.details).toEqual(refused.data);
  });

  it('a REFUND reply with no result is not a reversal either', async () => {
    axios.put.mockResolvedValueOnce(refused).mockResolvedValueOnce({ status: 200, data: {} });

    const result = await reverse('FLT1', {});

    expect(result.reversed).toBe(false);
  });

  it('a non-2xx is not a reversal even if the body claims success', async () => {
    axios.put.mockResolvedValueOnce({ status: 500, data: { result: 'SUCCESS' } })
      .mockResolvedValueOnce({ status: 500, data: { result: 'SUCCESS' } });

    const result = await reverse('FLT1', {});

    expect(result.reversed).toBe(false);
  });
});

/**
 * An earlier partial refund is not a full reversal.
 *
 * Any successful REFUND on the order used to count as "already reversed", so a
 * cancellation that withheld a fee - or any small goodwill refund - made a
 * later full reversal report success having returned nothing more.
 */
describe('an order that was partly refunded before', () => {
  const partlyRefunded = (captured, refunded) => ({
    status: 200,
    data: {
      status: 'CAPTURED',
      amount: captured,
      transaction: [
        { result: 'SUCCESS', transaction: { id: 'pay-1', type: 'PAYMENT', amount: captured } },
        { result: 'SUCCESS', transaction: { id: 'ref-1', type: 'REFUND', amount: refunded } },
      ],
    },
  });

  it('refunds only what is left, and skips the VOID that can no longer work', async () => {
    axios.get.mockResolvedValue(partlyRefunded(900, 50));
    axios.put.mockResolvedValueOnce(ok);

    const result = await reverse('FLT1', {});

    expect(result.reversed).toBe(true);
    expect(result.action).toBe('REFUND');
    expect(result.amount).toBe(850);
    expect(axios.put).toHaveBeenCalledTimes(1);
    expect(putBody(0).apiOperation).toBe('REFUND');
    expect(putBody(0).transaction.amount).toBe('850.00');
  });

  it('is already reversed only when the refunds cover the capture', async () => {
    axios.get.mockResolvedValue(partlyRefunded(900, 900));

    const result = await reverse('FLT1', {});

    expect(result.action).toBe('ALREADY_REVERSED');
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('treats a successful VOID as fully reversed', async () => {
    axios.get.mockResolvedValue({
      status: 200,
      data: {
        status: 'CAPTURED',
        transaction: [
          { result: 'SUCCESS', transaction: { id: 'pay-1', type: 'PAYMENT', amount: 900 } },
          { result: 'SUCCESS', transaction: { id: 'void-1', type: 'VOID' } },
        ],
      },
    });

    const result = await reverse('FLT1', {});

    expect(result.action).toBe('ALREADY_REVERSED');
    expect(axios.put).not.toHaveBeenCalled();
  });
});

describe('nothing to reverse', () => {
  it('reports NONE when the order shows no captured transaction', async () => {
    axios.get.mockResolvedValue({ status: 200, data: { status: 'PENDING', transaction: [] } });

    const result = await reverse('FLT1', {});

    expect(result.reversed).toBe(false);
    expect(result.action).toBe('NONE');
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('reports NONE when the order cannot be retrieved', async () => {
    axios.get.mockResolvedValue({ status: 404, data: null });

    const result = await reverse('FLT1', {});

    expect(result.reversed).toBe(false);
    expect(result.action).toBe('NONE');
  });
});
