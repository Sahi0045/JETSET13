import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';

/**
 * A refund ARC Pay refused, on the row the cancel writes today.
 *
 * The failed-refund alarm was written when a refused refund left the booking
 * `partially_refunded`: its section said "the booking is stored as refunded,
 * so nothing else will ever flag it", and each line "the row reads
 * cancelled/partially_refunded, which is not what happened". Both cancel paths
 * now leave the charge where it was - cancelled/paid, which IS what happened -
 * yet the alarm still said the row lied, over a row that did not. Those clauses
 * now go only with a row that reads refunded; "These need refunding by hand"
 * stays with every one.
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

const closing = () => database.updates.find((u) => u.table === 'bookings' && u.payload.status === 'cancelled')?.payload;
const asRead = (row) => {
  const written = closing();
  return { ...row, status: written.status, payment_status: written.payment_status, booking_details: written.booking_details };
};

const ticketsVoided = { success: true, hadTickets: true, voided: true, requiresAirlineRefund: [] };

beforeEach(() => {
  vi.resetModules();
  cancelFlightOrder.mockReset();
  cancelFlightOrder.mockResolvedValue(ticketsVoided);
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockReset();
  axios.get.mockResolvedValue(arcOrder([pay(291)]));
});

const NOW = new Date('2026-09-23T12:00:00.000Z');
const failedRow = (ref, paymentStatus, over = {}) => ({
  booking_reference: ref,
  status: 'cancelled',
  payment_status: paymentStatus,
  total_amount: 120.5,
  created_at: new Date(NOW.getTime() - 600 * 60_000).toISOString(),
  booking_details: {
    cancellation: {
      cancelledAt: new Date(NOW.getTime() - 300 * 60_000).toISOString(),
      reason: 'customer request', paymentAction: 'REFUND_FAILED', refundAmount: 0, cancellationFee: 50,
    },
  },
  ...over,
});

describe('a refund ARC Pay refused, on the row the cancel writes today', () => {
  it('reads cancelled/paid, and the alarm does not call that a lie', async () => {
    axios.put.mockResolvedValue({ status: 200, data: { result: 'FAILURE' } });
    const row = flight();
    const res = await cancel(row);
    expect(res.body.cancellation.paymentAction).toBe('REFUND_FAILED');
    const read = asRead(row);
    expect(read.payment_status).toBe('paid');

    const { selectUnrefunded, buildMessage } = await alarm();
    expect(selectUnrefunded([read])).toHaveLength(1);
    const message = buildMessage([read]);
    expect(message).not.toMatch(/stored as refunded/);
    expect(message).not.toMatch(/which is not what happened/);
    expect(message).toMatch(/refund never went through/);
    expect(message).toMatch(/These need refunding by hand/);
    expect(message).toMatch(/REFUND_FAILED · the row reads cancelled\/paid/);
  });
});

describe('rows a refused refund left reading refunded keep saying so', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  it('a message of them alone is unchanged, byte for byte', async () => {
    const { buildMessage } = await alarm();
    const message = buildMessage([
      failedRow('FLTA', 'partially_refunded'),
      failedRow('FLTB', 'refunded', { total_amount: 300 }),
    ]);
    vi.useRealTimers();
    expect(message).toBe([
      ':money_with_wings: *2 cancelled bookings where the refund never went through* — 420.50 USD',
      'ARC Pay did not return the money, but the booking is stored as refunded, so nothing else will ever flag it. These need refunding by hand.',
      '',
      '*FLTA* — 120.5 USD taken, 0 returned\nREFUND_FAILED · the row reads cancelled/partially_refunded, which is not what happened\ncancelled 5h ago · customer request',
      '*FLTB* — 300 USD taken, 0 returned\nREFUND_FAILED · the row reads cancelled/refunded, which is not what happened\ncancelled 5h ago · customer request',
    ].join('\n\n'));
  });

  it('beside a row that reads paid, each line says only what is true of it', async () => {
    const { buildMessage } = await alarm();
    const message = buildMessage([failedRow('FLTOLD', 'partially_refunded'), failedRow('FLTNEW', 'paid')]);
    vi.useRealTimers();
    expect(message).toMatch(/1 of them is stored as refunded/);
    expect(message).not.toMatch(/the booking is stored as refunded/);
    expect(message).toMatch(/These need refunding by hand/);
    expect(message).toMatch(/cancelled\/partially_refunded, which is not what happened/);
    expect(message).toMatch(/REFUND_FAILED · the row reads cancelled\/paid\n/);
  });

  it.each(['VOID_FAILED', 'VOID_MISSING_TXN_ID', 'MANUAL_PROCESS_REQUIRED'])('%s on a row that reads paid', async (action) => {
    const row = failedRow('FLTP', 'paid');
    row.booking_details.cancellation.paymentAction = action;
    const { buildMessage } = await alarm();
    const message = buildMessage([row]);
    vi.useRealTimers();
    expect(message).toMatch(/ARC Pay did not return the money\. These need refunding by hand\./);
    expect(message).not.toMatch(/stored as refunded|which is not what happened/);
  });
});
