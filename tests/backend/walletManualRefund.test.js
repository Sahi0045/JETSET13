import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * Finish refund and the Jet Coins a booking earned.
 *
 * Every customer cancel after the free window goes to the desk, and the desk's
 * refund took nothing back: the booking was refunded and its earned coins
 * stayed in the wallet. A refund that returns money takes them back, as a
 * cancel that refunds does; a failure to take them back never changes the
 * refund, and a press that returns no money takes nothing.
 */

let table = null;
const rpc = vi.fn();

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    ARC_PAY_CONFIG: { ...actual.ARC_PAY_CONFIG, BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw' },
    getArcPayAuthConfig: () => ({ headers: {} }),
    get supabase() { return { from: (...args) => table.from(...args), rpc }; },
  };
});

const cancelledFlight = () => ({
  id: 'bk-1',
  booking_reference: 'FLTR1',
  travel_type: 'flight',
  status: 'cancelled',
  payment_status: 'paid',
  total_amount: 291,
  booking_details: {
    order_id: 'FLTR1',
    arc_captured_amount: 291,
    arc_captured_currency: 'USD',
    cancellation: { paymentAction: 'REFUND_UNDER_REVIEW', refundAmount: 0, cancellationFee: 50, cancelledAt: '2026-10-12T10:00:00Z' },
    needs_review: { reason: 'fare rules decide the refund', source: 'cancellation', at: '2026-10-12T10:00:00Z' },
  },
});

const payment = { result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 291, currency: 'USD' } };
const refundOf = (amount) => ({ result: 'SUCCESS', transaction: { id: `r-${amount}`, type: 'REFUND', amount, currency: 'USD' } });
const order = (...later) => ({ status: 200, data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [payment, ...later] } });

const settle = async (options) => {
  const row = cancelledFlight();
  table = fakeBookingsTable([row]);
  const { settleManualFlightRefund } = await import('../../backend/routes/payment/operations.handlers.js');
  return settleManualFlightRefund(row, options);
};

const reversals = () => rpc.mock.calls.filter(([name]) => name === 'wallet_reverse_earn');

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.parse('2026-10-13T09:00:00.000Z'));
  rpc.mockReset();
  rpc.mockResolvedValue({ data: { coins: 241 }, error: null });
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Finish refund and the coins a booking earned', () => {
  it('takes back the earned coins when the refund returns money', async () => {
    axios.get.mockResolvedValueOnce(order()).mockResolvedValueOnce(order(refundOf(241)));
    axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });

    const { status } = await settle({ mode: 'refund', amount: 241, adminId: 'admin-1' });

    expect(status).toBe(200);
    expect(reversals()).toEqual([['wallet_reverse_earn', { p_ref: 'FLTR1' }]]);
  });

  it('takes them back when ARC already shows the refund, made in the ARC portal', async () => {
    axios.get.mockResolvedValue(order(refundOf(291)));

    const { status } = await settle({ mode: 'sync' });

    expect(status).toBe(200);
    expect(axios.put).not.toHaveBeenCalled();
    expect(reversals()).toEqual([['wallet_reverse_earn', { p_ref: 'FLTR1' }]]);
  });

  it('answers and records the refund exactly the same when the earned coins could not be taken back', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });

    axios.get.mockResolvedValueOnce(order()).mockResolvedValueOnce(order(refundOf(241)));
    const reversed = await settle({ mode: 'refund', amount: 241, adminId: 'admin-1' });
    const recorded = table.row('FLTR1');

    vi.resetModules();
    rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    axios.get.mockResolvedValueOnce(order()).mockResolvedValueOnce(order(refundOf(241)));
    const notReversed = await settle({ mode: 'refund', amount: 241, adminId: 'admin-1' });

    expect(reversals()).toHaveLength(2);
    expect(notReversed).toEqual(reversed);
    expect(table.row('FLTR1')).toEqual(recorded);
    silence.mockRestore();
  });

  it('takes nothing back when the press returns no money', async () => {
    axios.get.mockResolvedValue(order());
    const nothingYet = await settle({ mode: 'sync' });
    expect(nothingYet.body.code).toBe('NO_REFUND_FOUND');

    axios.get.mockResolvedValue(order());
    axios.put.mockResolvedValue({ status: 200, data: { result: 'FAILURE', error: { cause: 'REQUEST_REJECTED' } } });
    const refused = await settle({ mode: 'refund', amount: 241 });
    expect(refused.body.code).toBe('REFUND_REFUSED');

    expect(reversals()).toEqual([]);
  });
});
