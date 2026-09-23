import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * What Finish refund offers after a refund by hand left money at ARC Pay.
 *
 * settleManualFlightRefund records what ARC still holds as `stillHeld` when it
 * is more than the fee the cancel kept, and the desk and the admin panel
 * pre-fill refundOwedOf(booking).owed. That took everything still held as
 * "owed back":
 *
 *  - a refund held for a person (REFUND_UNDER_REVIEW) the desk decided 120 of
 *    291 on: 171 pre-filled and called owed, though nothing decided it, and
 *    one press refunded it;
 *  - a refused refund (241 back, a 50 fee kept) the desk finished short with
 *    200: the settle wrote cancellationFee 0 over the fee, so 91 was
 *    pre-filled, and one press sent the kept fee back to the card.
 *
 * Driven through the real handler; every row read is the one it wrote, and the
 * second press sends exactly what the page would fill in.
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

const payment = { result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 291, currency: 'USD' } };
let ledger = [];
const refundedAtArc = () => ledger.reduce((sum, entry) => sum + entry.transaction.amount, 0);

/** ARC takes every REFUND it is sent, and its order then shows it. */
const arcAccepts = async (_url, request) => {
  ledger.push({ result: 'SUCCESS', transaction: { id: `r-${ledger.length + 1}`, type: 'REFUND', amount: Number(request.transaction.amount), currency: 'USD' } });
  return { status: 200, data: { result: 'SUCCESS' } };
};

const cancelled = (cancellation, needsReview) => ({
  id: 'bk-1',
  booking_reference: 'FLTOWED1',
  travel_type: 'flight',
  status: 'cancelled',
  payment_status: 'paid',
  total_amount: 291,
  booking_details: {
    order_id: 'FLTOWED1',
    pnr: 'ABC123',
    arc_captured_amount: 291,
    arc_captured_currency: 'USD',
    cancellation: { amadeusCancelled: true, cancelledAt: '2026-09-22T10:00:00Z', refundAmount: 0, currency: 'USD', ...cancellation },
    ...(needsReview ? { needs_review: needsReview } : {}),
  },
});

let settle = null;
const start = async (row) => {
  table = fakeBookingsTable([row]);
  const { settleManualFlightRefund } = await import('../../backend/routes/payment/operations.handlers.js');
  settle = (options) => settleManualFlightRefund(table.row('FLTOWED1'), { adminId: 'desk-1', ...options });
};
const stored = () => table.row('FLTOWED1');
const reviewQueue = () => import('../../shared/reviewQueue.js');
const bookingStatus = () => import('../../frontend/src/utils/bookingStatus.js');

beforeEach(() => {
  vi.resetModules();
  ledger = [];
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.put.mockImplementation(arcAccepts);
  axios.get.mockReset();
  axios.get.mockImplementation(async () => ({
    status: 200, data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [payment, ...ledger] },
  }));
});

describe('a refund held for a person, part refunded by the desk', () => {
  const heldForReview = () => cancelled(
    { paymentAction: 'REFUND_UNDER_REVIEW', cancellationFee: 0, basis: 'non-refundable fare with tickets past their void window: what the airline returns depends on its fare rules' },
    { reason: 'non-refundable fare with tickets past their void window', source: 'cancellation', at: '2026-09-22T10:00:00Z' },
  );

  it('offers no amount for the rest: nothing decided it is owed', async () => {
    await start(heldForReview());
    expect((await settle({ mode: 'refund', amount: 120 })).status).toBe(200);

    const { refundOwedOf } = await reviewQueue();
    expect(stored().booking_details.cancellation).toMatchObject({ paymentAction: 'PARTIAL_REFUND', refundAmount: 120, stillHeld: 171 });
    expect(refundOwedOf(stored()), 'the 171 nobody decided on is called owed and pre-filled').toBeNull();
  });

  it('is still in front of the desk, with Finish refund, while ARC holds the rest', async () => {
    await start(heldForReview());
    await settle({ mode: 'refund', amount: 120 });

    const { attentionOf } = await reviewQueue();
    const { needsManualRefund } = await bookingStatus();
    expect(attentionOf(stored())).toMatchObject({ kind: 'review' });
    expect(needsManualRefund({ ...stored(), type: 'flight' })).toBe(true);
    expect(refundedAtArc()).toBe(120);
  });
});

describe('a refused refund less a 50 fee, finished short by hand', () => {
  const refusedLessFee = () => cancelled({ paymentAction: 'REFUND_FAILED', cancellationFee: 50, basis: 'tickets voided the day they were issued' });

  it('offers what the cancel decided is still owed, the fee kept out of it', async () => {
    await start(refusedLessFee());
    expect((await settle({ mode: 'refund', amount: 200 })).status).toBe(200);

    const { refundOwedOf } = await reviewQueue();
    const owed = refundOwedOf(stored());
    expect(owed?.owed, 'the 91 ARC holds, fee included, is pre-filled').toBe(41);
    expect(owed).toMatchObject({ paid: 291, fee: 50, refunded: 200 });
  });

  it('keeps the fee when the rest is sent, and closes the refund there', async () => {
    await start(refusedLessFee());
    await settle({ mode: 'refund', amount: 200 });
    const { refundOwedOf } = await reviewQueue();
    expect((await settle({ mode: 'refund', amount: refundOwedOf(stored()).owed })).status).toBe(200);

    expect(refundedAtArc(), 'the fee the cancel kept went back to the card').toBe(241);
    const { cancellation } = stored().booking_details;
    expect(cancellation).toMatchObject({ refundAmount: 241, cancellationFee: 50 });
    expect(cancellation.stillHeld, 'the kept fee is left "still held", and Finish refund stays offered').toBeUndefined();
    expect(refundOwedOf(stored())).toBeNull();
    const { needsManualRefund } = await bookingStatus();
    expect(needsManualRefund({ ...stored(), type: 'flight' })).toBe(false);
  });
});

describe('beside it', () => {
  it('a refused refund with no fee, finished short: the rest of the whole payment is owed', async () => {
    await start(cancelled({ paymentAction: 'REFUND_FAILED', cancellationFee: 0 }));
    await settle({ mode: 'refund', amount: 241 });

    const { refundOwedOf } = await reviewQueue();
    expect(refundOwedOf(stored())).toMatchObject({ owed: 50, paid: 291, fee: 0, refunded: 241 });
    expect((await settle({ mode: 'refund', amount: 50 })).status).toBe(200);
    expect(stored().booking_details.cancellation).toMatchObject({ paymentAction: 'FULL_REFUND', refundAmount: 291 });
    expect(refundOwedOf(stored())).toBeNull();
  });

  it('a refused refund less the fee, finished in one press: settled, nothing more owed', async () => {
    await start(cancelled({ paymentAction: 'REFUND_FAILED', cancellationFee: 50 }));
    await settle({ mode: 'refund', amount: 241 });

    const { refundOwedOf } = await reviewQueue();
    expect(stored().booking_details.cancellation).toMatchObject({ paymentAction: 'PARTIAL_REFUND', refundAmount: 241, cancellationFee: 50 });
    expect(stored().booking_details.cancellation.stillHeld).toBeUndefined();
    expect(refundOwedOf(stored())).toBeNull();
  });

  it('a row a refund by hand left held, with no record of what the cancel decided: no amount', async () => {
    // Written before the settle kept the decided fee: its cancellationFee may
    // be a fee it wrote over, so the rest cannot be told apart from the fee.
    const { refundOwedOf } = await reviewQueue();
    const older = cancelled({
      paymentAction: 'PARTIAL_REFUND', refundAmount: 200, cancellationFee: 0, stillHeld: 91,
      manualRefund: { mode: 'refund', amount: 200, previousPaymentAction: 'REFUND_FAILED' },
    });
    expect(refundOwedOf(older)).toBeNull();
  });
});
