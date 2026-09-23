import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * Finish refund (settleManualFlightRefund, mode 'refund') when ARC Pay takes
 * the REFUND and the answer never comes back - the socket drops after ARC has
 * processed it.
 *
 * The cancel path has treated exactly this as "outcome unknown" since the
 * 23 Sep audit (returnFlightPayment: sent, no answer, ARC Pay may have
 * refunded). The desk's own refund did not: refundArcAmount turned a thrown
 * request into a plain failure, the desk was told ARC Pay had refused it and to
 * try again, and the booking was handed back at once - so the retry sent the
 * money a second time.
 *
 * The case: a non-refundable fare past its void window, held for review; the
 * desk decides 120 of the 291 goes back (the taxes).
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

const heldForReview = (cancellation = {}) => ({
  id: 'bk-1',
  booking_reference: 'FLTR1',
  travel_type: 'flight',
  status: 'cancelled',
  payment_status: 'paid',
  total_amount: 291,
  booking_details: {
    order_id: 'FLTR1',
    pnr: 'ABC123',
    arc_captured_amount: 291,
    arc_captured_currency: 'USD',
    cancellation: {
      paymentAction: 'REFUND_UNDER_REVIEW', refundAmount: 0, cancellationFee: 0, amadeusCancelled: true,
      cancelledAt: '2026-09-22T10:00:00Z',
      ...cancellation,
    },
    needs_review: {
      reason: 'non-refundable fare with tickets past their void window: what the airline returns depends on its fare rules',
      source: 'cancellation',
      at: '2026-09-22T10:00:00Z',
    },
  },
});

const payment = { result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 291, currency: 'USD' } };
const refundOf = (amount, id) => ({ result: 'SUCCESS', transaction: { id, type: 'REFUND', amount, currency: 'USD' } });
const orderWith = (...later) => ({ status: 200, data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [payment, ...later] } });

/** ARC's ledger, as it really is, behind every RETRIEVE_ORDER. */
let ledger = [];
const lands = (id) => async (_url, request) => {
  ledger.push(refundOf(Number(request.transaction.amount), id));
  throw new Error('socket hang up');
};
const answered = (id) => async (_url, request) => {
  ledger.push(refundOf(Number(request.transaction.amount), id));
  return { status: 200, data: { result: 'SUCCESS' } };
};

const settleFor = async (row) => {
  table = fakeBookingsTable([row]);
  const { settleManualFlightRefund } = await import('../../backend/routes/payment/operations.handlers.js');
  return (options) => settleManualFlightRefund(table.row('FLTR1'), { adminId: 'desk-1', ...options });
};

const refundedAtArc = () => ledger.reduce((sum, t) => sum + t.transaction.amount, 0);

beforeEach(() => {
  vi.resetModules();
  ledger = [];
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockReset();
  axios.get.mockImplementation(async () => orderWith(...ledger));
});

describe('a desk refund ARC Pay took but never answered', () => {
  it('is not reported as refused, and a second press does not send the money again', async () => {
    const settle = await settleFor(heldForReview());
    axios.put.mockImplementationOnce(lands('r-1'));

    const first = await settle({ mode: 'refund', amount: 120 });

    // What the desk is told about the money.
    expect.soft(first.body.error, 'the desk is told ARC Pay refused a refund it made').not.toMatch(/did not accept/i);

    // The desk presses again.
    axios.put.mockImplementationOnce(answered('r-2'));
    await settle({ mode: 'refund', amount: 120 });

    expect(refundedAtArc(), 'the customer was sent the desk\'s 120 twice').toBe(120);
  });

  it('tells the desk the outcome is unknown and to check ARC Pay before anything else', async () => {
    const settle = await settleFor(heldForReview());
    axios.put.mockImplementationOnce(lands('r-1'));

    const { status, body } = await settle({ mode: 'refund', amount: 120 });

    expect(status).toBe(502);
    expect(body.code).toBe('REFUND_UNANSWERED');
    expect(body.error).toMatch(/no answer/i);
    expect(body.error).toMatch(/Check ARC Pay/);
    expect(body.error).not.toMatch(/Nothing was recorded|try again/i);
    // The booking keeps the unanswered refund, so the next press can ask ARC about it.
    const cancellation = table.row('FLTR1').booking_details.cancellation;
    expect(cancellation.unansweredRefund).toMatchObject({ amount: 120, currency: 'USD', refundedBefore: 0 });
    expect(cancellation.paymentAction).toBe('REFUND_UNDER_REVIEW');
  });

  it('is recorded by Check ARC Pay, which sends nothing', async () => {
    const settle = await settleFor(heldForReview());
    axios.put.mockImplementationOnce(lands('r-1'));
    await settle({ mode: 'refund', amount: 120 });

    const { status } = await settle({ mode: 'sync' });

    expect(status).toBe(200);
    expect(axios.put).toHaveBeenCalledTimes(1);
    const cancellation = table.row('FLTR1').booking_details.cancellation;
    expect(cancellation).toMatchObject({ paymentAction: 'PARTIAL_REFUND', refundAmount: 120, stillHeld: 171 });
    expect(cancellation.unansweredRefund).toBeUndefined();
    expect(cancellation.manual_refund_claim).toBeUndefined();
  });

  it('is not sent again while ARC Pay does not show it yet', async () => {
    const settle = await settleFor(heldForReview());
    // Sent; nothing back; ARC's ledger does not show it (yet).
    axios.put.mockRejectedValueOnce(new Error('socket hang up'));
    await settle({ mode: 'refund', amount: 120 });

    const second = await settle({ mode: 'refund', amount: 120 });

    expect(second.status).toBe(409);
    expect(second.body.code).toBe('REFUND_UNANSWERED');
    expect(axios.put).toHaveBeenCalledTimes(1);
    expect(table.row('FLTR1').booking_details.cancellation.unansweredRefund).toMatchObject({ amount: 120 });
  });

  it('stays on the booking when Check ARC Pay finds nothing yet', async () => {
    const settle = await settleFor(heldForReview());
    axios.put.mockRejectedValueOnce(new Error('socket hang up'));
    await settle({ mode: 'refund', amount: 120 });

    const { status, body } = await settle({ mode: 'sync' });

    expect(status).toBe(409);
    expect(body.error).toMatch(/does not show the refund of 120\.00 USD/);
    expect(table.row('FLTR1').booking_details.cancellation.unansweredRefund).toMatchObject({ amount: 120 });
  });

  it('stays on the booking when Check ARC Pay records only an older refund', async () => {
    // 50 went back before the unanswered 120 was sent; ARC shows the 50 alone.
    ledger = [refundOf(50, 'r-0')];
    const settle = await settleFor(heldForReview({
      unansweredRefund: { amount: 120, currency: 'USD', transactionId: 'refund-admin-1', at: new Date().toISOString(), by: 'desk-1', refundedBefore: 50 },
    }));

    const { status } = await settle({ mode: 'sync' });

    expect(status).toBe(200);
    const cancellation = table.row('FLTR1').booking_details.cancellation;
    expect(cancellation).toMatchObject({ paymentAction: 'PARTIAL_REFUND', refundAmount: 50 });
    expect(cancellation.unansweredRefund).toMatchObject({ amount: 120 });
    // And a refund press still sends nothing while it may land.
    expect((await settle({ mode: 'refund', amount: 120 })).body.code).toBe('REFUND_UNANSWERED');
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('can be sent again once ARC Pay has long shown nothing of it', async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    const settle = await settleFor(heldForReview({
      unansweredRefund: { amount: 120, currency: 'USD', transactionId: 'refund-admin-1', at: tenMinutesAgo, by: 'desk-1', refundedBefore: 0 },
    }));
    axios.put.mockImplementationOnce(answered('r-2'));

    const { status } = await settle({ mode: 'refund', amount: 120 });

    expect(status).toBe(200);
    expect(axios.put).toHaveBeenCalledTimes(1);
    expect(refundedAtArc()).toBe(120);
    const cancellation = table.row('FLTR1').booking_details.cancellation;
    expect(cancellation).toMatchObject({ paymentAction: 'PARTIAL_REFUND', refundAmount: 120 });
    expect(cancellation.unansweredRefund).toBeUndefined();
  });

  it('treats a server error from ARC Pay as no answer, not as a refusal', async () => {
    const settle = await settleFor(heldForReview());
    axios.put.mockResolvedValueOnce({ status: 504, data: 'gateway timeout' });

    const { body } = await settle({ mode: 'refund', amount: 120 });

    expect(body.code).toBe('REFUND_UNANSWERED');
  });
});

describe('a desk refund ARC Pay answered', () => {
  it('refused: says so, records nothing, and lets the desk try again at once', async () => {
    const settle = await settleFor(heldForReview());
    axios.put.mockResolvedValueOnce({ status: 200, data: { result: 'FAILURE', response: { gatewayCode: 'DECLINED' } } });

    const first = await settle({ mode: 'refund', amount: 120 });

    expect(first.status).toBe(502);
    expect(first.body.code).toBe('REFUND_REFUSED');
    const cancellation = table.row('FLTR1').booking_details.cancellation;
    expect(cancellation.unansweredRefund).toBeUndefined();
    expect(cancellation.manual_refund_claim).toBeUndefined();

    axios.put.mockImplementationOnce(answered('r-2'));
    const second = await settle({ mode: 'refund', amount: 120 });
    expect(second.status).toBe(200);
    expect(refundedAtArc()).toBe(120);
  });

  it('with an error reply: a refusal too', async () => {
    const settle = await settleFor(heldForReview());
    axios.put.mockResolvedValueOnce({ status: 400, data: { result: 'ERROR', error: { cause: 'INVALID_REQUEST', explanation: 'bad amount' } } });

    const { body } = await settle({ mode: 'refund', amount: 120 });

    expect(body.code).toBe('REFUND_REFUSED');
  });

  it('accepted: records it as before', async () => {
    const settle = await settleFor(heldForReview());
    axios.put.mockImplementationOnce(answered('r-1'));

    const { status } = await settle({ mode: 'refund', amount: 120 });

    expect(status).toBe(200);
    expect(table.row('FLTR1').booking_details.cancellation).toMatchObject({ paymentAction: 'PARTIAL_REFUND', refundAmount: 120 });
  });
});
