import { describe, expect, it } from 'vitest';
import { arcSucceeded } from '../../backend/routes/payment/payment.helpers.js';

/**
 * One helper, four reversal sites, one question: did the gateway actually move
 * the money?
 *
 * ARC (MPGS) answers a refund it refused with HTTP 200 and `result: "FAILURE"`.
 * Every reversal site used to check only the status code, so a declined refund
 * was logged "✅ REFUND successful: FAILURE", the booking was written
 * `refunded`, and the customer was told their money was on its way. Nothing
 * had moved. This is the check all four sites now share.
 */
describe('arcSucceeded', () => {
  it('is true only for a 2xx whose body says SUCCESS', () => {
    expect(arcSucceeded({ status: 200, data: { result: 'SUCCESS' } })).toBe(true);
    expect(arcSucceeded({ status: 201, data: { result: 'SUCCESS' } })).toBe(true);
  });

  // The bug, exactly.
  it('is false for a 200 that carries FAILURE', () => {
    expect(arcSucceeded({ status: 200, data: { result: 'FAILURE' } })).toBe(false);
    expect(arcSucceeded({
      status: 200,
      data: { result: 'FAILURE', response: { gatewayCode: 'DECLINED' } },
    })).toBe(false);
  });

  // Deliberately strict. A 2xx with no verdict is not a success: failing this
  // way leaves the money recorded as still held, which a human can fix; the
  // other way tells a customer they were paid back when they were not.
  it('is false for a 2xx with no result at all', () => {
    expect(arcSucceeded({ status: 200, data: {} })).toBe(false);
    expect(arcSucceeded({ status: 200, data: null })).toBe(false);
    expect(arcSucceeded({ status: 200 })).toBe(false);
  });

  it('is false for any non-2xx even when the body claims success', () => {
    expect(arcSucceeded({ status: 400, data: { result: 'SUCCESS' } })).toBe(false);
    expect(arcSucceeded({ status: 500, data: { result: 'SUCCESS' } })).toBe(false);
    expect(arcSucceeded({ status: 302, data: { result: 'SUCCESS' } })).toBe(false);
  });

  it('survives garbage without throwing', () => {
    expect(arcSucceeded(undefined)).toBe(false);
    expect(arcSucceeded(null)).toBe(false);
    expect(arcSucceeded({})).toBe(false);
    expect(arcSucceeded({ status: 'ok', data: { result: 'SUCCESS' } })).toBe(false);
  });
});
