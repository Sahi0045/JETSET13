import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * A customer who asked to cancel inside the free window keeps it when the cancel
 * could not finish then: the airline refused the cancel, or the payment
 * gateway could not be reached. Their retry later, or our team finishing it,
 * is judged from when they first asked.
 */

const REF = 'FLTASK1';
const BOOKED = Date.parse('2026-10-10T12:00:00.000Z');
const atHour = (hours) => BOOKED + hours * 60 * 60 * 1000;

const row = () => ({
  id: 'bk-ask1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 300,
  user_id: null,
  created_at: new Date(BOOKED).toISOString(),
  booking_details: {
    pnr: 'ASK123', order_id: REF, customer_email: 'jane@example.com',
    gds: { ticketed: true }, tickets: [{ number: '057-2412345678' }],
    verified_charge: { fare: 287.5, serviceFee: 12.5, discount: 0, total: 300 },
  },
});

let table = fakeBookingsTable([]);

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    ARC_PAY_CONFIG: { ...actual.ARC_PAY_CONFIG, BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw' },
    getArcPayAuthConfig: () => ({ headers: {} }),
    get supabase() { return { from: (...args) => table.from(...args) }; },
  };
});

const cancelFlightOrder = vi.fn();
vi.mock('../../backend/services/flightProvider.js', () => ({
  default: {
    cancelFlightOrder: (...args) => cancelFlightOrder(...args),
    getBookedFeeTable: async () => ({ currency: 'USD', change: { before: { allowed: false } }, refund: { before: { allowed: false, amount: 0 } } }),
  },
  providerStatus: () => ({ enabled: true, bookingEnabled: true }),
}));

const handlers = () => import('../../backend/routes/payment/operations.handlers.js');

const cancel = async ({ user = null, system = false } = {}) => {
  const { handleCancelBookingAction, SYSTEM_CANCEL } = await handlers();
  const req = createRequest({ method: 'POST', user, body: { bookingReference: REF, reason: 'Change of plans', email: 'jane@example.com' } });
  if (system) req[SYSTEM_CANCEL] = true;
  const res = createResponse();
  await handleCancelBookingAction(req, res);
  return res;
};

const captured = { status: 200, data: { status: 'CAPTURED', amount: 300, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: '1', type: 'PAYMENT', amount: 300, currency: 'USD' } }] } };
const voided = { success: true, hadTickets: true, voided: true, requiresAirlineRefund: [] };
const refunds = () => axios.put.mock.calls.map(([, body]) => body).filter((body) => body.apiOperation === 'REFUND');

/** At hour 15 (11 PM New York) the airline refuses the cancel: nothing is cancelled or refunded. */
const refusedAtHour15 = async () => {
  vi.setSystemTime(atHour(15));
  cancelFlightOrder.mockRejectedValueOnce(Object.assign(new Error('PNR_Cancel refused'), { technicalError: 'refused' }));
  const first = await cancel();
  expect(first.statusCode).toBe(502);
};

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['Date'] });
  table = fakeBookingsTable([row()], { tables: { price_settings: [{ settings: { cancellation_fee: 50 } }], payments: [] } });
  cancelFlightOrder.mockReset();
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS', transaction: { id: '2' } } });
  axios.get.mockReset();
  axios.get.mockResolvedValue(captured);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a customer who asked inside the free window', () => {
  it('keeps them on a retry after the airline refused the first cancel', async () => {
    await refusedAtHour15();
    expect(table.row(REF).booking_details.customer_cancel_requested_at).toBe(new Date(atHour(15)).toISOString());

    vi.setSystemTime(atHour(25));
    cancelFlightOrder.mockResolvedValueOnce(voided);
    const retry = await cancel();

    expect(retry.body.cancellation).toMatchObject({ policy: 'free_window', refundAmount: 287.5 });
    expect(refunds()[0].transaction.amount).toBe('287.50');
  });

  it('keeps them on a retry after the payment gateway could not be reached', async () => {
    vi.setSystemTime(atHour(15));
    axios.get.mockResolvedValueOnce({ status: 500, data: {} });
    const first = await cancel();
    expect(first.statusCode).toBe(503);

    vi.setSystemTime(atHour(25));
    cancelFlightOrder.mockResolvedValueOnce(voided);
    const retry = await cancel();

    expect(retry.body.cancellation).toMatchObject({ policy: 'free_window', refundAmount: 287.5 });
  });

  it('keeps them when our team finishes the cancel', async () => {
    await refusedAtHour15();

    vi.setSystemTime(atHour(30));
    cancelFlightOrder.mockResolvedValueOnce(voided);
    const staff = await cancel({ user: { id: 'staff-1', role: 'admin' } });

    expect(staff.body.cancellation).toMatchObject({ policy: 'free_window', refundAmount: 287.5 });
  });

  it('is not what a cancel the server asks for itself goes by', async () => {
    await refusedAtHour15();

    vi.setSystemTime(atHour(30));
    cancelFlightOrder.mockResolvedValueOnce(voided);
    const system = await cancel({ system: true });

    expect(system.body.cancellation.policy).toBeUndefined();
    expect(system.body.cancellation).toMatchObject({ refundAmount: 250, cancellationFee: 50 });
  });

  it('is what the quote goes by', async () => {
    await refusedAtHour15();

    vi.setSystemTime(atHour(30));
    const { quoteCustomerCancel } = await handlers();
    const quote = await quoteCustomerCancel(table.row(REF), { client: { from: (...args) => table.from(...args) } });

    expect(quote).toMatchObject({ policy: 'free_window', refundAmount: 287.5 });
  });
});

describe('a customer who first asked after the free window', () => {
  it('is judged from that first request, though 24 hours had not passed', async () => {
    vi.setSystemTime(atHour(17));
    cancelFlightOrder.mockRejectedValueOnce(Object.assign(new Error('PNR_Cancel refused'), { technicalError: 'refused' }));
    await cancel();

    vi.setSystemTime(atHour(27));
    cancelFlightOrder.mockResolvedValueOnce(voided);
    const retry = await cancel();

    expect(retry.body.cancellation).toMatchObject({ policy: 'non_refundable', paymentAction: 'REFUND_UNDER_REVIEW' });
  });
});
