import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { selectUnrefunded } from '../../backend/jobs/paymentFailureAlert.job.js';

/**
 * What a cancelled booking gives back, and what that is decided from.
 *
 *  - The fee was `settings.cancellation_fee || 50`: an admin who set it to 0
 *    still had 50 kept from every refund.
 *  - The fee came off every cancellation - a reservation never ticketed, which
 *    costs the airline nothing to release, included - and a ticket past its
 *    void window on a fare the booking called non-refundable was refunded as
 *    though it were refundable.
 *  - The amount came from the row: `total_amount`, what the client asked
 *    checkout to charge, and `payment_status`, which never hears of a refund
 *    made since. The gateway is now asked first, and only what it holds goes back.
 *  - A payment still `pending` was reversed blind, against an order with nothing
 *    in it. The REFUND or VOID failed, and the payment-failure alarm paged about
 *    a refund owed on money that was never taken.
 */

const flight = (details = {}, over = {}) => ({
  id: 'uuid-1',
  booking_reference: 'FLT123',
  travel_type: 'flight',
  status: 'pending_ticketing',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  booking_details: { pnr: 'ABC123', order_id: 'FLT123', customer_email: 'traveler@example.com', gds: { ticketed: false }, ...details },
  ...over,
});

const pkg = (over = {}) => ({
  id: 'uuid-2',
  booking_reference: 'PKG1',
  travel_type: 'package',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 500,
  user_id: null,
  booking_details: { order_id: 'PKG1', customer_email: 'traveler@example.com' },
  ...over,
});

/** ARC orders, as RETRIEVE_ORDER returns them. */
const arcOrder = (transaction, status = 'CAPTURED') => ({ status: 200, data: { status, currency: 'USD', transaction } });
const pay = (amount, id = 'txn-1') => ({ result: 'SUCCESS', transaction: { id, type: 'PAYMENT', amount, currency: 'USD' } });
const refund = (amount) => ({ result: 'SUCCESS', transaction: { id: 'ref-1', type: 'REFUND', amount, currency: 'USD' } });

/** A Supabase double that answers per table. Every write matches, so the cancellation claim is won. */
const databaseFor = ({ row, settings = null, payment = null }) => {
  const updates = [];
  const from = vi.fn((table) => {
    const c = {};
    for (const m of ['select', 'insert', 'eq', 'is', 'neq', 'or', 'filter', 'order', 'limit']) c[m] = vi.fn(() => c);
    c.update = vi.fn((payload) => { updates.push({ table, payload }); return c; });
    c.single = vi.fn().mockResolvedValue({ data: table === 'price_settings' ? (settings ? { settings } : null) : row, error: null });
    c.maybeSingle = vi.fn().mockResolvedValue({ data: table === 'payments' ? payment : null, error: null });
    c.then = (resolve) => resolve({ data: [row], error: null });
    return c;
  });
  return { client: { from }, updates };
};

const cancelFlightOrder = vi.fn();
let database = databaseFor({ row: flight() });

vi.mock('../../backend/routes/payment/arcpay.config.js', () => ({
  get supabase() { return database.client; },
  ARC_PAY_CONFIG: { BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw' },
  getArcPayAuthConfig: () => ({ headers: {} }),
}));
vi.mock('../../backend/services/flightProvider.js', () => ({
  default: { cancelFlightOrder: (...args) => cancelFlightOrder(...args) },
  providerStatus: () => ({ enabled: true, bookingEnabled: true }),
}));

const handlers = () => import('../../backend/routes/payment/operations.handlers.js');

const cancel = async (row, { settings, payment } = {}) => {
  database = databaseFor({ row, settings, payment });
  const { handleCancelBookingAction } = await handlers();
  const req = createRequest({ method: 'POST', body: { bookingReference: row.booking_reference, reason: 'test', email: 'traveler@example.com' } });
  const res = createResponse();
  await handleCancelBookingAction(req, res);
  return res;
};

/** The ARC writes, by operation. */
const sent = (operation) => axios.put.mock.calls.map(([, body]) => body).filter((body) => body.apiOperation === operation);
/** The write that closes the cancellation on the booking row. */
const closing = () => database.updates.find((u) => u.table === 'bookings' && u.payload.status === 'cancelled')?.payload;

const ticketsVoided = { success: true, hadTickets: true, voided: true, requiresAirlineRefund: [] };
const pastVoidWindow = { success: true, hadTickets: true, voided: false, requiresAirlineRefund: ['057-2412345678'] };
const neverTicketed = { success: true, hadTickets: false, voided: false, requiresAirlineRefund: [] };

beforeEach(() => {
  vi.resetModules();
  cancelFlightOrder.mockReset();
  cancelFlightOrder.mockResolvedValue(neverTicketed);
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
  axios.get.mockReset();
  axios.get.mockResolvedValue(arcOrder([pay(291)]));
});

describe('the cancellation fee setting', () => {
  it('honours a fee the admin set to 0', async () => {
    const { cancellationFeeFrom } = await handlers();
    expect(cancellationFeeFrom({ cancellation_fee: 0 })).toBe(0);
    expect(cancellationFeeFrom({ cancellation_fee: '0' })).toBe(0);
    expect(cancellationFeeFrom({ cancellation_fee: 75 })).toBe(75);
  });

  it('falls back to the default only when nothing usable is set', async () => {
    const { cancellationFeeFrom } = await handlers();
    for (const settings of [null, {}, { cancellation_fee: null }, { cancellation_fee: '' }, { cancellation_fee: -5 }, { cancellation_fee: 'abc' }]) {
      expect(cancellationFeeFrom(settings)).toBe(50);
    }
  });
});

describe('decideFlightRefund', () => {
  const base = {
    heldAmount: 291, paidInFull: true, everCaptured: true, hasReservation: true,
    gds: neverTicketed, rowTicketed: false, refundable: null, fee: 50,
  };
  const decide = async (over) => (await handlers()).decideFlightRefund({ ...base, ...over });

  it('returns everything, with no fee, for a reservation released before a ticket existed', async () => {
    expect(await decide({})).toMatchObject({ action: 'refund_all', fee: 0, refundAmount: 291 });
  });

  it('returns everything, with no fee, for a booking that never reached the airline', async () => {
    expect(await decide({ hasReservation: false, gds: null })).toMatchObject({ action: 'refund_all', fee: 0, refundAmount: 291 });
  });

  it('keeps the fee for tickets voided the day they were issued', async () => {
    expect(await decide({ gds: ticketsVoided })).toMatchObject({ action: 'refund_less_fee', fee: 50, refundAmount: 241 });
  });

  it('returns everything for voided tickets when no fee is set', async () => {
    expect(await decide({ gds: ticketsVoided, fee: 0 })).toMatchObject({ action: 'refund_all', fee: 0, refundAmount: 291 });
  });

  it('refunds nothing when the fee covers what is held', async () => {
    expect(await decide({ gds: ticketsVoided, fee: 300 })).toMatchObject({ action: 'fee_covers', fee: 291, refundAmount: 0 });
  });

  it('keeps the fee for a refundable fare past its void window', async () => {
    expect(await decide({ gds: pastVoidWindow, refundable: true })).toMatchObject({ action: 'refund_less_fee', fee: 50, refundAmount: 241 });
  });

  it('leaves a non-refundable fare past its void window to a person', async () => {
    const decision = await decide({ gds: pastVoidWindow, refundable: false });
    expect(decision.action).toBe('review');
    expect(decision.reason).toMatch(/non-refundable/);
  });

  it('does not guess when the booking does not record whether the fare is refundable', async () => {
    const decision = await decide({ gds: pastVoidWindow, refundable: null });
    expect(decision.action).toBe('review');
    expect(decision.reason).toMatch(/does not record/);
  });

  it('does not guess when the airline and the booking disagree about a ticket', async () => {
    expect((await decide({ rowTicketed: true })).action).toBe('review');
    expect((await decide({ gds: { success: true } })).action).toBe('review');
    expect((await decide({ hasReservation: false, gds: null, rowTicketed: true })).action).toBe('review');
  });

  it('has nothing to refund when the gateway holds nothing', async () => {
    const decision = await decide({ heldAmount: 0 });
    expect(decision).toMatchObject({ action: 'nothing_held', refundAmount: 0, fee: 0 });
    expect(decision.reason).toMatch(/already been returned/);
  });

  it('leaves a payment that is partly back already to a person', async () => {
    expect((await decide({ heldAmount: 191, paidInFull: false })).action).toBe('review');
  });

  it('works in cents', async () => {
    expect(await decide({ heldAmount: 100.1, gds: ticketsVoided, fee: 33.33 })).toMatchObject({ refundAmount: 66.77 });
  });
});

describe('cancelling a flight', () => {
  it('refunds what the gateway captured, never the row\'s total_amount', async () => {
    cancelFlightOrder.mockResolvedValue(ticketsVoided);

    const res = await cancel(flight({}, { total_amount: 250 }));

    expect(res.statusCode).toBe(200);
    expect(sent('REFUND')).toHaveLength(1);
    expect(sent('REFUND')[0].transaction.amount).toBe('241.00');
  });

  it('asks the gateway before it releases the seats', async () => {
    const order = [];
    axios.get.mockImplementation(async () => { order.push('gateway'); return arcOrder([pay(291)]); });
    cancelFlightOrder.mockImplementation(async () => { order.push('airline'); return neverTicketed; });

    await cancel(flight());

    expect(order[0]).toBe('gateway');
    expect(order).toContain('airline');
  });

  it('returns everything, with no fee, when no ticket was ever issued', async () => {
    const res = await cancel(flight());

    expect(sent('VOID')).toHaveLength(1);
    expect(sent('VOID')[0].transaction.targetTransactionId).toBe('txn-1');
    expect(res.body.cancellation).toMatchObject({ paymentAction: 'VOID', refundAmount: 291, cancellationFee: 0 });
    expect(closing().payment_status).toBe('refunded');
    expect(res.body.message).toMatch(/A refund of \$291\.00/);
    expect(res.body.message).not.toMatch(/fee was kept/);
  });

  it('refunds the full amount held when the void is refused', async () => {
    axios.put
      .mockResolvedValueOnce({ status: 200, data: { result: 'FAILURE' } })
      .mockResolvedValueOnce({ status: 200, data: { result: 'SUCCESS' } });

    const res = await cancel(flight());

    expect(sent('REFUND')[0].transaction.amount).toBe('291.00');
    expect(res.body.cancellation).toMatchObject({ paymentAction: 'FULL_REFUND', refundAmount: 291 });
  });

  it('honours an admin fee of 0 on a ticketed booking', async () => {
    cancelFlightOrder.mockResolvedValue(ticketsVoided);

    const res = await cancel(flight(), { settings: { cancellation_fee: 0 } });

    expect(res.body.cancellation).toMatchObject({ paymentAction: 'VOID', cancellationFee: 0, refundAmount: 291 });
    expect(closing().payment_status).toBe('refunded');
  });

  it('keeps the fee the admin set', async () => {
    cancelFlightOrder.mockResolvedValue(ticketsVoided);

    const res = await cancel(flight(), { settings: { cancellation_fee: 75 } });

    expect(sent('REFUND')[0].transaction.amount).toBe('216.00');
    expect(res.body.cancellation).toMatchObject({ paymentAction: 'PARTIAL_REFUND', cancellationFee: 75, refundAmount: 216 });
    expect(res.body.message).toMatch(/\$75\.00 cancellation fee was kept/);
  });

  it('refunds nothing automatically on a non-refundable fare past its void window, and says a person will', async () => {
    cancelFlightOrder.mockResolvedValue(pastVoidWindow);

    const res = await cancel(flight({ refundable: false, tickets: [{ number: '057-2412345678', travelerId: '1' }], gds: { ticketed: true } }));

    expect(res.statusCode).toBe(200);
    expect(axios.put).not.toHaveBeenCalled();
    expect(res.body.cancellation.paymentAction).toBe('REFUND_UNDER_REVIEW');
    expect(res.body.cancellation.needsReview).toBe(true);
    const written = closing();
    expect(written.payment_status).toBe('paid');
    expect(written.booking_details.needs_review.reason).toMatch(/non-refundable/);
    expect(written.booking_details.needs_review.tickets).toEqual(['057-2412345678']);
    expect(res.body.message).toMatch(/review the refund/);
    expect(res.body.message).not.toMatch(/on its way/);
  });

  it('refunds a refundable fare past its void window less the fee, and flags the airline claim', async () => {
    cancelFlightOrder.mockResolvedValue(pastVoidWindow);

    const res = await cancel(flight({ refundable: true, gds: { ticketed: true } }));

    expect(res.body.cancellation).toMatchObject({ paymentAction: 'PARTIAL_REFUND', refundAmount: 241, cancellationFee: 50 });
    expect(closing().payment_status).toBe('partially_refunded');
    expect(closing().booking_details.needs_review.reason).toMatch(/airline refund must be claimed/);
  });

  it('does not refund a booking that records a ticket the airline did not show', async () => {
    const res = await cancel(flight({ tickets: [{ number: '057-2412345678' }], gds: { ticketed: true } }));

    expect(axios.put).not.toHaveBeenCalled();
    expect(res.body.cancellation.paymentAction).toBe('REFUND_UNDER_REVIEW');
  });

  it('attempts no reversal when the gateway already returned the money', async () => {
    axios.get.mockResolvedValue(arcOrder([pay(291), refund(291)]));

    const res = await cancel(flight());

    expect(axios.put).not.toHaveBeenCalled();
    expect(res.body.cancellation.paymentAction).toBe('NOTHING_TO_REFUND');
    expect(closing().payment_status).toBe('refunded');
    expect(res.body.message).toMatch(/nothing to refund/);
  });

  it('does not refund the whole again when part of it already went back', async () => {
    axios.get.mockResolvedValue(arcOrder([pay(291), refund(100)]));

    const res = await cancel(flight());

    expect(axios.put).not.toHaveBeenCalled();
    expect(res.body.cancellation.paymentAction).toBe('REFUND_UNDER_REVIEW');
  });

  it('cancels a checkout that was never paid without reversing anything', async () => {
    axios.get.mockResolvedValue({ status: 404, data: { error: { cause: 'INVALID_REQUEST' } } });

    const res = await cancel(flight({ pnr: undefined, gds: undefined }, { status: 'pending', payment_status: 'unpaid' }));

    expect(res.statusCode).toBe(200);
    expect(cancelFlightOrder).not.toHaveBeenCalled();
    expect(axios.put).not.toHaveBeenCalled();
    expect(res.body.cancellation.paymentAction).toBe('NOTHING_TO_REFUND');
    expect(closing().payment_status).toBe('unpaid');
  });

  it('refunds an unpaid-looking checkout the gateway shows was paid after all', async () => {
    const res = await cancel(flight({ pnr: undefined, gds: undefined }, { status: 'pending', payment_status: 'unpaid' }));

    expect(sent('VOID')).toHaveLength(1);
    expect(res.body.cancellation.paymentAction).toBe('VOID');
  });

  it('tells the customer one thing when the refund is refused', async () => {
    cancelFlightOrder.mockResolvedValue(ticketsVoided);
    axios.put.mockResolvedValue({ status: 200, data: { result: 'FAILURE' } });

    const res = await cancel(flight());

    expect(res.body.cancellation.paymentAction).toBe('REFUND_FAILED');
    expect(res.body.message).toMatch(/did not go through/);
    expect(res.body.message).not.toMatch(/successfully/i);
    expect(closing().payment_status).toBe('paid');
  });
});

describe('a pending payment on another kind of booking', () => {
  // No payment row and an order holding nothing: the refund the old path sent
  // could only fail, and paged about money that was never taken.
  it('reverses nothing when the gateway holds nothing', async () => {
    axios.get.mockResolvedValue(arcOrder([], 'INITIATED'));

    const res = await cancel(pkg({ payment_status: 'pending' }));

    expect(res.statusCode).toBe(200);
    expect(axios.put).not.toHaveBeenCalled();
    expect(res.body.cancellation.paymentAction).toBe('NOTHING_TO_REFUND');
    expect(closing().payment_status).toBe('pending');
  });

  it('does not void a pending payment row that has no transaction behind it', async () => {
    axios.get.mockResolvedValue(arcOrder([], 'INITIATED'));

    const res = await cancel(pkg({ payment_status: 'paid' }), {
      payment: { id: 'pay-1', payment_status: 'pending', amount: 500, arc_order_id: 'PKG1' },
    });

    expect(sent('VOID')).toHaveLength(0);
    expect(res.body.cancellation.paymentAction).toBe('NOTHING_TO_REFUND');
    expect(res.body.cancellation.paymentAction).not.toBe('VOID_MISSING_TXN_ID');
  });

  it('still refunds a pending booking the gateway shows was paid', async () => {
    axios.get.mockResolvedValue(arcOrder([pay(500)]));

    const res = await cancel(pkg({ payment_status: 'pending' }));

    expect(sent('REFUND')).toHaveLength(1);
    expect(res.body.cancellation.paymentAction).toBe('PARTIAL_REFUND');
  });

  it('is not asked about when the booking is already paid - that path is unchanged', async () => {
    const res = await cancel(pkg());

    expect(axios.get).not.toHaveBeenCalled();
    expect(sent('REFUND')[0].transaction.amount).toBe('450.00');
    expect(res.body.cancellation.paymentAction).toBe('PARTIAL_REFUND');
  });
});

describe('the payment-failure alarm', () => {
  const cancelled = (paymentAction) => ({
    booking_reference: 'X', total_amount: 291, booking_details: { cancellation: { paymentAction, refundAmount: 0 } },
  });

  it('pages about a refund left for review - nothing else would', () => {
    expect(selectUnrefunded([cancelled('REFUND_UNDER_REVIEW')])).toHaveLength(1);
  });

  it('stays quiet when there was nothing to refund', () => {
    expect(selectUnrefunded([cancelled('NOTHING_TO_REFUND')])).toHaveLength(0);
  });
});
