/**
 * Reading ARC Pay's transaction list.
 *
 * ARC Pay runs on the Mastercard gateway, which names a void by what it voids:
 * VOID_PAYMENT, VOID_CAPTURE, VOID_AUTHORIZATION. Every check here looked for
 * `type === 'VOID'`, which the gateway never sends - a voided order on the test
 * merchant (FLT75794D31F0F14F, 16 Sep 2026) reads PAYMENT then VOID_PAYMENT - so
 * a voided payment was counted as money still held.
 *
 * VOID_REFUND is not here: it undoes a refund, which puts money back.
 */
const VOIDS_OF_MONEY_TAKEN = new Set(['VOID', 'VOID_PAYMENT', 'VOID_CAPTURE', 'VOID_AUTHORIZATION']);

const succeeded = (t) => t?.result === 'SUCCESS' || t?.response?.gatewayCode === 'APPROVED';

/** A successful void of a payment, capture or authorisation. */
export const voidsPayment = (t) => succeeded(t) && VOIDS_OF_MONEY_TAKEN.has(String(t?.transaction?.type ?? '').toUpperCase());

/**
 * Whether ARC says this order's payment was voided: a successful void in its
 * transactions, or the order itself CANCELLED, which is what a voided order
 * reports.
 */
export const orderVoided = (order) => String(order?.status ?? '').toUpperCase() === 'CANCELLED'
  || (Array.isArray(order?.transaction) && order.transaction.some(voidsPayment));
