import { describe, expect, it } from 'vitest';
import { orderVoided, voidsPayment } from '../../backend/utils/arcTransactions.js';

/**
 * What ARC Pay calls a void.
 *
 * The Mastercard gateway ARC Pay runs on names a void by what it voids, and a
 * voided order on the test merchant reads PAYMENT then VOID_PAYMENT, with order
 * status CANCELLED. Every check looked for `type === 'VOID'`.
 */
const txn = (type, result = 'SUCCESS') => ({ result, transaction: { type } });

describe('voidsPayment', () => {
  it.each(['VOID_PAYMENT', 'VOID_CAPTURE', 'VOID_AUTHORIZATION', 'VOID'])('counts a successful %s', (type) => {
    expect(voidsPayment(txn(type))).toBe(true);
  });

  it('does not count a void that failed', () => {
    expect(voidsPayment(txn('VOID_PAYMENT', 'FAILURE'))).toBe(false);
  });

  // It undoes a refund: money goes back to being held.
  it('does not count VOID_REFUND', () => {
    expect(voidsPayment(txn('VOID_REFUND'))).toBe(false);
  });
});

describe('orderVoided', () => {
  it('reads the order ARC recorded on the test merchant as voided', () => {
    expect(orderVoided({ status: 'CANCELLED', transaction: [txn('PAYMENT'), txn('VOID_PAYMENT')] })).toBe(true);
  });

  it('reads a cancelled order as voided even without its transactions', () => {
    expect(orderVoided({ status: 'CANCELLED' })).toBe(true);
  });

  it('does not read a captured or refunded order as voided', () => {
    expect(orderVoided({ status: 'CAPTURED', transaction: [txn('PAYMENT')] })).toBe(false);
    expect(orderVoided({ status: 'REFUNDED', transaction: [txn('PAYMENT'), txn('REFUND')] })).toBe(false);
  });
});
