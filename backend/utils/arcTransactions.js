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

/**
 * How long a call to ARC Pay may take before it is given up as unanswered.
 *
 * `getArcPayAuthConfig` carried this, but the calls pass only its `headers`,
 * so none of them had a limit: a refund ARC never answered held the request
 * past the booking's cancel claim (120 s) or the desk's refund claim (5 min),
 * and a second press could then take the claim and send the refund again.
 * Every flight call that passes it reads a thrown error as "sent, not
 * answered", never as a refusal.
 */
export const ARC_REQUEST_TIMEOUT_MS = 30000;

/**
 * An ARC transaction id for a money movement that must happen at most once per
 * order: `refund-cancel-FLT…`. ARC refuses a transaction id already used on
 * the order, so a second automatic refund for the same reason - a retry, or a
 * request that took over an expired claim - is refused by the gateway itself
 * rather than paid twice. At most 40 characters, as ARC allows.
 */
export const onceOnlyTransactionId = (operation, reason, orderId) =>
  `${operation}-${reason}-${String(orderId).replace(/[^A-Za-z0-9_-]/g, '')}`.slice(0, 40);
