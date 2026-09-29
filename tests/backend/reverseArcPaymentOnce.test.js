import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * One automatic reversal per order, and never a call to ARC without a limit.
 *
 * The VOID and REFUND went under `void-fail-<now>` and `refund-fail-<now>`, new
 * on every call, so two requests reversing one order at once - a double "Try
 * again", or the customer's order racing the abandoned-checkout job - each
 * sent their own. ARC refuses a transaction id it has already seen on an
 * order, so ids made from the reason and the order let the gateway itself
 * refuse the second. That refusal is not "nothing went back": the order is
 * asked whether the transaction under that id succeeded.
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

const captured = { result: 'SUCCESS', transaction: { id: 'pay-1', type: 'PAYMENT', amount: 900 } };
const order = (...more) => ({ status: 200, data: { status: 'CAPTURED', amount: 900, transaction: [captured, ...more] } });

const ok = { status: 200, data: { result: 'SUCCESS' } };
const refused = { status: 400, data: { result: 'ERROR', error: { cause: 'INVALID_REQUEST', explanation: 'Transaction with the same ID already exists' } } };

/** The transaction id in the n-th PUT's URL. */
const putTransactionId = (n) => axios.put.mock.calls[n][0].split('/transaction/')[1];

beforeEach(() => {
  vi.resetModules();
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockReset();
  axios.get.mockResolvedValue(order());
});

describe('the transaction ids', () => {
  it('are made from the reason and the order, so ARC refuses a second reversal for the same reason', async () => {
    axios.put.mockResolvedValueOnce({ status: 200, data: { result: 'FAILURE' } }).mockResolvedValueOnce(ok);

    const result = await reverse('FLT75794D31F0F14F', {});

    expect(result.reversed).toBe(true);
    expect(putTransactionId(0)).toBe('void-fail-FLT75794D31F0F14F');
    expect(putTransactionId(1)).toBe('refund-fail-FLT75794D31F0F14F');
  });

  it('name the reason they were given', async () => {
    axios.put.mockResolvedValueOnce(ok);

    await reverse('FLTSECOND2', { once: 'duplicate' });

    expect(putTransactionId(0)).toBe('void-duplicate-FLTSECOND2');
  });

  it('are the same on a second call for the same order and reason', async () => {
    axios.put.mockResolvedValue({ status: 200, data: { result: 'FAILURE' } });

    await reverse('FLT1', {});
    await reverse('FLT1', {});

    const ids = axios.put.mock.calls.map(([url]) => url.split('/transaction/')[1]);
    expect(new Set(ids)).toEqual(new Set(['void-fail-FLT1', 'refund-fail-FLT1']));
  });
});

describe('a refusal of an id another request already used', () => {
  it('is a REFUND that went through, not "both failed"', async () => {
    axios.get
      .mockResolvedValueOnce(order())    // this request's look before reversing
      .mockResolvedValueOnce(order())    // after the VOID was refused: no void under its id
      .mockResolvedValueOnce(order(      // asked again after ARC refused the REFUND's id
        { result: 'SUCCESS', transaction: { id: 'refund-fail-FLT1', type: 'REFUND', amount: 900 } },
      ));
    axios.put
      .mockResolvedValueOnce({ status: 200, data: { result: 'FAILURE' } })   // VOID: already settled
      .mockResolvedValueOnce(refused);                                       // REFUND: id already used

    const result = await reverse('FLT1', {});

    expect(result).toMatchObject({ reversed: true, action: 'ALREADY_REVERSED', amount: 900 });
  });

  it('is a VOID that went through, and no REFUND is sent after it', async () => {
    axios.get
      .mockResolvedValueOnce(order())
      .mockResolvedValueOnce(order({ result: 'SUCCESS', transaction: { id: 'void-fail-FLT1', type: 'VOID_PAYMENT', targetTransactionId: 'pay-1' } }));
    axios.put.mockResolvedValueOnce(refused);

    const result = await reverse('FLT1', {});

    expect(result).toMatchObject({ reversed: true, action: 'ALREADY_REVERSED' });
    expect(axios.put).toHaveBeenCalledTimes(1);
  });

  it('is still a refusal when the order shows no such transaction succeeded', async () => {
    axios.put.mockResolvedValueOnce({ status: 200, data: { result: 'FAILURE' } }).mockResolvedValueOnce(refused);

    const result = await reverse('FLT1', {});

    expect(result).toMatchObject({ reversed: false, action: 'FAILED', refused: true });
  });
});

describe('every call to ARC', () => {
  it('has a time limit', async () => {
    axios.put.mockResolvedValueOnce({ status: 200, data: { result: 'FAILURE' } }).mockResolvedValueOnce(ok);

    await reverse('FLT1', {});

    for (const [, options] of axios.get.mock.calls) expect(options.timeout).toBe(30000);
    for (const [, , options] of axios.put.mock.calls) expect(options.timeout).toBe(30000);
  });

  it('that times out leaves the outcome unknown, not refused', async () => {
    const timeout = Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' });
    axios.put.mockRejectedValueOnce(timeout);

    const result = await reverse('FLT1', {});

    expect(result.reversed).toBe(false);
    expect(result.refused).toBeUndefined();
  });
});
