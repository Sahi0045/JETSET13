import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';

/**
 * A customer's cancel, end to end through the cancel route: what ARC Pay is
 * asked to return, what the booking records, and when the 24 hours are judged.
 * Staff and server cancels keep the rules they had.
 */

const NOW = Date.parse('2026-10-11T12:00:00.000Z');
const hoursAgo = (hours) => new Date(NOW - hours * 60 * 60 * 1000).toISOString();
const charge = { fare: 287.5, serviceFee: 12.5, discount: 0, total: 300 };

const flight = ({ createdAt = hoursAgo(1), details = {} } = {}) => ({
  id: 'uuid-1',
  booking_reference: 'FLT300',
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 300,
  user_id: null,
  created_at: createdAt,
  booking_details: {
    pnr: 'ABC123', order_id: 'FLT300', customer_email: 'traveler@example.com', gds: { ticketed: false },
    verified_charge: charge, ...details,
  },
});

const arcOrder = (transaction) => ({ status: 200, data: { status: 'CAPTURED', currency: 'USD', transaction } });
const pay = (amount) => ({ result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount, currency: 'USD' } });

const databaseFor = ({ row, settings = { cancellation_fee: 50 } }) => {
  const updates = [];
  const from = vi.fn((table) => {
    const c = {};
    for (const m of ['select', 'insert', 'eq', 'is', 'neq', 'or', 'filter', 'order', 'limit']) c[m] = vi.fn(() => c);
    c.update = vi.fn((payload) => { updates.push({ table, payload }); return c; });
    c.single = vi.fn().mockResolvedValue({ data: table === 'price_settings' ? { settings } : row, error: null });
    c.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    c.then = (resolve) => resolve({ data: [row], error: null });
    return c;
  });
  return { client: { from }, updates };
};

const calls = [];
const cancelFlightOrder = vi.fn();
const getBookedFeeTable = vi.fn();
let database;

vi.mock('../../backend/routes/payment/arcpay.config.js', () => ({
  get supabase() { return database.client; },
  ARC_PAY_CONFIG: { BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw' },
  getArcPayAuthConfig: () => ({ headers: {} }),
}));
vi.mock('../../backend/services/flightProvider.js', () => ({
  default: {
    cancelFlightOrder: (...args) => { calls.push('cancel'); return cancelFlightOrder(...args); },
    getBookedFeeTable: (...args) => { calls.push('fee table'); return getBookedFeeTable(...args); },
  },
  providerStatus: () => ({ enabled: true, bookingEnabled: true }),
}));

const handlers = () => import('../../backend/routes/payment/operations.handlers.js');

const cancel = async (row, { user = null, system = false, settings } = {}) => {
  database = databaseFor({ row, settings });
  const { handleCancelBookingAction, SYSTEM_CANCEL } = await handlers();
  const req = createRequest({ method: 'POST', user, body: { bookingReference: row.booking_reference, reason: 'test', email: 'traveler@example.com' } });
  if (system) req[SYSTEM_CANCEL] = true;
  const res = createResponse();
  await handleCancelBookingAction(req, res);
  return res;
};

const sent = (operation) => axios.put.mock.calls.map(([, body]) => body).filter((body) => body.apiOperation === operation);
const closing = () => database.updates.find((u) => u.table === 'bookings' && u.payload.status === 'cancelled')?.payload;

const neverTicketed = { success: true, hadTickets: false, voided: false, requiresAirlineRefund: [] };
const ticketsVoided = { success: true, hadTickets: true, voided: true, requiresAirlineRefund: [] };
const ticketed = { gds: { ticketed: true }, tickets: [{ number: '057-2412345678' }] };
const nonRefundable = { currency: 'USD', change: { before: { allowed: false } }, refund: { before: { allowed: false, amount: 0 } } };
const refundable = { currency: 'USD', change: { before: { allowed: true, amount: 0 } }, refund: { before: { allowed: true, amount: 150 } } };

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  calls.length = 0;
  cancelFlightOrder.mockReset();
  cancelFlightOrder.mockResolvedValue(neverTicketed);
  getBookedFeeTable.mockReset();
  getBookedFeeTable.mockResolvedValue(nonRefundable);
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
  axios.get.mockReset();
  axios.get.mockResolvedValue(arcOrder([pay(300)]));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a customer cancel', () => {
  it('returns the airline price before the ticket is issued and keeps the service fee', async () => {
    const res = await cancel(flight({ createdAt: hoursAgo(72) }));

    expect(sent('REFUND')[0].transaction.amount).toBe('287.50');
    expect(res.body.cancellation).toMatchObject({ paymentAction: 'PARTIAL_REFUND', refundAmount: 287.5, cancellationFee: 12.5, policy: 'not_ticketed' });
    expect(closing().booking_details.cancellation).toMatchObject({ policy: 'not_ticketed', terms: { serviceFeeKept: 12.5, airlinePrice: 287.5 } });
  });

  it('returns the airline price on tickets voided within 24 hours, without reading the fare rules', async () => {
    cancelFlightOrder.mockResolvedValue(ticketsVoided);

    const res = await cancel(flight({ createdAt: hoursAgo(2), details: ticketed }));

    expect(sent('REFUND')[0].transaction.amount).toBe('287.50');
    expect(res.body.cancellation).toMatchObject({ refundAmount: 287.5, policy: 'free_window' });
    expect(getBookedFeeTable).not.toHaveBeenCalled();
  });

  it('refunds nothing automatically on a non-refundable fare after 24 hours, and reads the rules before cancelling', async () => {
    cancelFlightOrder.mockResolvedValue(ticketsVoided);

    const res = await cancel(flight({ createdAt: hoursAgo(30), details: ticketed }));

    expect(calls).toEqual(['fee table', 'cancel']);
    expect(axios.put).not.toHaveBeenCalled();
    expect(res.body.cancellation).toMatchObject({ paymentAction: 'REFUND_UNDER_REVIEW', refundAmount: 0, policy: 'non_refundable' });
    const record = closing().booking_details;
    expect(record.cancellation).toMatchObject({ policy: 'non_refundable', terms: { serviceFeeKept: 12.5 } });
    expect(record.needs_review.reason).toMatch(/non-refundable fare cancelled after 24 hours/);
  });

  it('records the penalty and the flight fee on a refundable fare after 24 hours', async () => {
    cancelFlightOrder.mockResolvedValue(ticketsVoided);
    getBookedFeeTable.mockResolvedValue(refundable);

    const res = await cancel(flight({ createdAt: hoursAgo(30), details: ticketed }), { settings: { cancellation_fee: 50, flight_cancellation_fee: 40 } });

    expect(axios.put).not.toHaveBeenCalled();
    expect(res.body.cancellation).toMatchObject({
      policy: 'refundable', terms: { serviceFeeKept: 12.5, airlinePrice: 287.5, cancellationFee: 40, penalty: 150, penaltyCurrency: 'USD' },
    });
  });

  it('still cancels when the fare rules cannot be read, and leaves the refund to our team', async () => {
    cancelFlightOrder.mockResolvedValue(ticketsVoided);
    getBookedFeeTable.mockRejectedValue(new Error('session refused'));

    const res = await cancel(flight({ createdAt: hoursAgo(30), details: ticketed }));

    expect(res.statusCode).toBe(200);
    expect(closing().status).toBe('cancelled');
    expect(res.body.cancellation).toMatchObject({ paymentAction: 'REFUND_UNDER_REVIEW', policy: 'rules_unknown' });
  });

  it('judges the 24 hours when the customer asked, not when the airline answered', async () => {
    cancelFlightOrder.mockImplementation(async () => {
      vi.setSystemTime(NOW + 20 * 1000);
      return ticketsVoided;
    });

    const res = await cancel(flight({ createdAt: new Date(NOW - (24 * 60 * 60 - 10) * 1000).toISOString(), details: ticketed }));

    expect(res.body.cancellation).toMatchObject({ refundAmount: 287.5, policy: 'free_window' });
  });
});

describe('a staff or server cancel', () => {
  it('keeps today’s rule for staff: voided tickets come back less the flight fee', async () => {
    cancelFlightOrder.mockResolvedValue(ticketsVoided);

    const res = await cancel(flight({ createdAt: hoursAgo(30), details: ticketed }), { user: { id: 'staff-1', role: 'admin' } });

    expect(sent('REFUND')[0].transaction.amount).toBe('250.00');
    expect(res.body.cancellation.policy).toBeUndefined();
    expect(getBookedFeeTable).not.toHaveBeenCalled();
  });

  it('keeps today’s rule for a cancel the server asks for itself', async () => {
    cancelFlightOrder.mockResolvedValue(ticketsVoided);

    const res = await cancel(flight({ createdAt: hoursAgo(30), details: ticketed }), { system: true });

    expect(sent('REFUND')[0].transaction.amount).toBe('250.00');
    expect(res.body.cancellation.policy).toBeUndefined();
  });
});
