import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';

/**
 * A refund whose answer never came back is not a refund held on purpose.
 *
 * returnFlightPayment (payment/operations.handlers.js) records
 * REFUND_UNDER_REVIEW for two different things. One is a hold: the cancel
 * could not tell what is owed, so it moved nothing. The other is a reversal it
 * SENT - a VOID, or a REFUND less the fee - that threw mid-request, or found
 * the order reversed by something else a moment before. Whether ARC Pay moved
 * the money there is not known.
 *
 * The failed-refund alarm gave both the held wording: "Nothing was refunded,
 * on purpose", "nothing returned yet", "Check the tickets with the airline
 * first". For the second, all three are false, and the question that matters
 * - did ARC Pay return the money? - was never asked. A person following the
 * alarm could decide an amount and refund it again. The cancel now records
 * that the outcome is unknown, and the alarm says to check ARC Pay first.
 *
 * Driven through the real cancel into the row it writes, then handed to the
 * alarm's own selector and message builder.
 */

const flight = (details = {}, over = {}) => ({
  id: 'uuid-1',
  booking_reference: 'FLT123',
  travel_type: 'flight',
  status: 'pending_ticketing',
  payment_status: 'paid',
  total_amount: 291,
  created_at: new Date().toISOString(),
  user_id: null,
  booking_details: { pnr: 'ABC123', order_id: 'FLT123', customer_email: 'traveler@example.com', gds: { ticketed: false }, ...details },
  ...over,
});

const arcOrder = (transaction, status = 'CAPTURED') => ({ status: 200, data: { status, currency: 'USD', transaction } });
const pay = (amount, id = 'txn-1') => ({ result: 'SUCCESS', transaction: { id, type: 'PAYMENT', amount, currency: 'USD' } });

const databaseFor = ({ row }) => {
  const updates = [];
  const from = vi.fn((table) => {
    const c = {};
    for (const m of ['select', 'insert', 'eq', 'is', 'neq', 'or', 'filter', 'order', 'limit']) c[m] = vi.fn(() => c);
    c.update = vi.fn((payload) => { updates.push({ table, payload }); return c; });
    c.single = vi.fn().mockResolvedValue({ data: table === 'price_settings' ? null : row, error: null });
    c.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
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

const cancel = async (row) => {
  database = databaseFor({ row });
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const req = createRequest({ method: 'POST', body: { bookingReference: row.booking_reference, reason: 'test', email: 'traveler@example.com' } });
  const res = createResponse();
  await handleCancelBookingAction(req, res);
  return res;
};

const alarm = () => import('../../backend/jobs/paymentFailureAlert.job.js');

/** The write that closes the cancellation on the booking row. */
const closing = () => database.updates.find((u) => u.table === 'bookings' && u.payload.status === 'cancelled')?.payload;

/** The row as the alarm would read it back. */
const asRead = (row) => {
  const written = closing();
  return { ...row, status: written.status, payment_status: written.payment_status, booking_details: written.booking_details };
};

const neverTicketed = { success: true, hadTickets: false, voided: false, requiresAirlineRefund: [] };
const ticketsVoided = { success: true, hadTickets: true, voided: true, requiresAirlineRefund: [] };

const HELD_WORDING = [/Nothing was refunded, on purpose/, /nothing returned yet/, /Check the tickets with the airline first/];

const expectUnknownWording = (message) => {
  for (const held of HELD_WORDING) expect(message).not.toMatch(held);
  expect(message).toMatch(/may or may not have gone through/);
  expect(message).toMatch(/Check the order in ARC Pay before anything else/);
  expect(message).toMatch(/Finish refund/);
};

beforeEach(() => {
  vi.resetModules();
  cancelFlightOrder.mockReset();
  cancelFlightOrder.mockResolvedValue(neverTicketed);
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockReset();
  axios.get.mockResolvedValue(arcOrder([pay(291)]));
});

describe('a reversal sent to ARC Pay whose answer never came back', () => {
  it('the void timed out: the cancel records the outcome as unknown, and the alarm says to check ARC Pay', async () => {
    axios.put.mockRejectedValue(new Error('timeout of 30000ms exceeded'));
    const row = flight();
    const res = await cancel(row);

    expect(res.body.cancellation.paymentAction).toBe('REFUND_UNDER_REVIEW');
    expect(res.body.cancellation.reversalOutcomeUnknown).toBe(true);
    expect(closing().booking_details.cancellation.reversalOutcomeUnknown).toBe(true);

    const { selectUnrefunded, buildMessage } = await alarm();
    const read = asRead(row);
    expect(selectUnrefunded([read])).toHaveLength(1);
    const message = buildMessage([read]);
    expectUnknownWording(message);
    expect(message).toMatch(/automatic reversal ended FAILED: timeout/);
  });

  it('the refund less the fee threw mid-request: the same', async () => {
    cancelFlightOrder.mockResolvedValue(ticketsVoided);
    axios.put.mockRejectedValue(new Error('socket hang up'));
    const row = flight();
    const res = await cancel(row);

    expect(res.body.cancellation.paymentAction).toBe('REFUND_UNDER_REVIEW');
    expect(closing().booking_details.cancellation.reversalOutcomeUnknown).toBe(true);

    const { buildMessage } = await alarm();
    const message = buildMessage([asRead(row)]);
    expectUnknownWording(message);
    expect(message).toMatch(/refund request did not complete: socket hang up/);
  });

  it('the order was reversed by something else a moment before: the same', async () => {
    // The cancel's own read finds the payment held; the reversal's read, a
    // moment later, finds the order already refunded.
    axios.get.mockReset();
    axios.get
      .mockResolvedValueOnce(arcOrder([pay(291)]))
      .mockResolvedValue(arcOrder([pay(291)], 'REFUNDED'));
    const row = flight();
    const res = await cancel(row);

    expect(res.body.cancellation.paymentAction).toBe('REFUND_UNDER_REVIEW');
    expect(closing().booking_details.cancellation.reversalOutcomeUnknown).toBe(true);

    const { buildMessage } = await alarm();
    const message = buildMessage([asRead(row)]);
    expectUnknownWording(message);
    expect(message).toMatch(/automatic reversal ended ALREADY_REVERSED/);
  });
});

describe('rows written before the cancel recorded it', () => {
  const now = new Date().toISOString();
  const legacy = (reason) => ({
    booking_reference: 'FLTUNK1',
    status: 'cancelled',
    payment_status: 'paid',
    total_amount: 540,
    created_at: now,
    booking_details: {
      pnr: 'DEF456',
      cancellation: {
        paymentAction: 'REFUND_UNDER_REVIEW', refundAmount: 0, cancellationFee: 0, amadeusCancelled: true, cancelledAt: now,
        reason: 'Customer request', basis: 'tickets voided the day they were issued; no cancellation fee is set',
      },
      needs_review: { reason, source: 'cancellation', at: now },
    },
  });

  it.each([
    'automatic reversal ended FAILED: socket hang up',
    'refund request did not complete: timeout of 30000ms exceeded; tickets could not be voided; airline refund must be claimed',
  ])('are read from the reason on their own review flag: %s', async (reason) => {
    const { selectUnrefunded, buildMessage } = await alarm();
    expect(selectUnrefunded([legacy(reason)])).toHaveLength(1);
    const message = buildMessage([legacy(reason)]);
    expectUnknownWording(message);
    expect(message).toContain(reason);
  });
});

describe('a hold the cancel chose keeps the held wording', () => {
  it('a booking recording a ticket the airline did not show', async () => {
    const row = flight({ gds: { ticketed: true } });
    const res = await cancel(row);

    expect(res.body.cancellation.paymentAction).toBe('REFUND_UNDER_REVIEW');
    expect(axios.put).not.toHaveBeenCalled();
    expect(res.body.cancellation).not.toHaveProperty('reversalOutcomeUnknown');
    expect(closing().booking_details.cancellation).not.toHaveProperty('reversalOutcomeUnknown');

    const { buildMessage } = await alarm();
    const message = buildMessage([asRead(row)]);
    for (const held of HELD_WORDING) expect(message).toMatch(held);
    expect(message).not.toMatch(/may or may not/);
  });

  it('a reversal ARC Pay answered keeps no unknown mark', async () => {
    axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
    const row = flight();
    const res = await cancel(row);

    expect(res.body.cancellation.paymentAction).toBe('VOID');
    expect(closing().booking_details.cancellation).not.toHaveProperty('reversalOutcomeUnknown');
  });

  it('each gets its own section when both are announced together', async () => {
    const now = new Date().toISOString();
    const base = (ref, details) => ({
      booking_reference: ref, status: 'cancelled', payment_status: 'paid', total_amount: 100, created_at: now,
      booking_details: { cancellation: { paymentAction: 'REFUND_UNDER_REVIEW', refundAmount: 0, cancelledAt: now, ...details } },
    });
    const held = base('FLTHELD', { basis: 'the airline did not say whether a ticket had been issued' });
    const unknown = base('FLTUNK', { reversalOutcomeUnknown: true, basis: 'reservation released before any ticket was issued' });

    const { buildMessage } = await alarm();
    const message = buildMessage([held, unknown]);
    const [unknownPart, heldPart] = message.split(/refund is held/);
    expect(unknownPart).toMatch(/FLTUNK/);
    expect(unknownPart).toMatch(/may or may not have gone through/);
    expect(unknownPart).not.toMatch(/FLTHELD|nothing returned yet|on purpose/);
    expect(heldPart).toMatch(/FLTHELD/);
    expect(heldPart).not.toMatch(/FLTUNK/);
  });
});
