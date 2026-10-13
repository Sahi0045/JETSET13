import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * A void reverses the whole payment, so a booking that paid with Jet Coins gets
 * every coin back with it - and the booking says so, so the desk does not offer
 * to return them a second time.
 */

let table = fakeBookingsTable([]);
const rpc = vi.fn();

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    ARC_PAY_CONFIG: { ...actual.ARC_PAY_CONFIG, BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw' },
    getArcPayAuthConfig: () => ({ headers: {} }),
    get supabase() { return { from: (...args) => table.from(...args), rpc: (...args) => rpc(...args) }; },
  };
});

vi.mock('../../backend/routes/payment/agents.handlers.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireAdmin: async () => true,
  getCaller: async () => ({ id: 'admin-1', role: 'admin' }),
}));

const REF = 'FLTV2';

const flight = (details = {}) => ({
  id: 'bk-v2',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 72.2,
  created_at: '2026-09-15T08:00:00Z',
  booking_details: { order_id: REF, customer_email: 'booker@example.com', ...details },
});

const coinsBooking = (coins = 5000) => flight({ verified_charge: { total: 72.2, walletAmount: coins / 100, walletCoins: coins, wallet: { coins } } });

const capturedOrder = () => ({
  status: 200,
  data: { status: 'CAPTURED', amount: 72.2, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 72.2, currency: 'USD' } }] },
});

const voidWith = async (rows) => {
  table = fakeBookingsTable(rows, { tables: { payments: [] } });
  const { handlePaymentVoid } = await import('../../backend/routes/payment/operations.handlers.js');
  const res = createResponse();
  await handlePaymentVoid(createRequest({ method: 'POST', body: { bookingReference: REF, reason: 'Duplicate payment' } }), res);
  return res;
};

beforeEach(() => {
  vi.resetModules();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: { status: 'released', coins: 5000 }, error: null });
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
  axios.get.mockReset();
  axios.get.mockResolvedValue(capturedOrder());
});

describe('voiding a payment made partly with Jet Coins', () => {
  it('gives every coin back after ARC voids, and records how many', async () => {
    const res = await voidWith([coinsBooking()]);

    expect(res.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('wallet_return');
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_ref: REF, p_reason: 'void' });
    expect(table.row(REF).booking_details.cancellation).toMatchObject({ paymentAction: 'VOID', coinsReturned: 5000 });
    expect(table.row(REF).booking_details.wallet_issue).toBeUndefined();
  });

  it('asks for the coins only after the void went through', async () => {
    axios.put.mockResolvedValue({ status: 200, data: { result: 'FAILURE' } });

    const res = await voidWith([coinsBooking()]);

    expect(res.statusCode).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('marks the booking for the desk when the coins could not be returned, and still voids', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });

    const res = await voidWith([coinsBooking()]);

    expect(res.statusCode).toBe(200);
    expect(table.row(REF).payment_status).toBe('refunded');
    expect(table.row(REF).booking_details.cancellation.coinsReturned).toBeUndefined();
    expect(table.row(REF).booking_details.wallet_issue).toMatchObject({ kind: 'return_failed', coins: 5000, reason: 'void' });
    silence.mockRestore();
  });

  it('does not touch the wallet for a booking that used no coins', async () => {
    const res = await voidWith([flight()]);

    expect(res.statusCode).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
    expect(table.row(REF).booking_details.cancellation.coinsReturned).toBeUndefined();
  });
});
