import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';

/**
 * A cancel of a booking that paid with Jet Coins, end to end through the cancel
 * route: ARC is asked to return the card part it decided, the coins that are
 * owed go back first, and the booking records both.
 */

const NOW = Date.parse('2026-10-11T12:00:00.000Z');
const hoursAgo = (hours) => new Date(NOW - hours * 60 * 60 * 1000).toISOString();

const withCoins = { fare: 120, serviceFee: 2.2, discount: 0, total: 72.2, walletAmount: 50, walletCoins: 5000, wallet: { coins: 5000, amount: 50 } };
const cardOnly = { fare: 287.5, serviceFee: 12.5, discount: 0, total: 300 };

const flight = ({ charge = withCoins, createdAt = hoursAgo(72), details = {}, over = {} } = {}) => ({
  id: 'uuid-1',
  booking_reference: 'FLT300',
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: charge.total,
  user_id: null,
  created_at: createdAt,
  booking_details: {
    pnr: 'ABC123', order_id: 'FLT300', customer_email: 'traveler@example.com', gds: { ticketed: false },
    verified_charge: charge, ...details,
  },
  ...over,
});

const arcOrder = (transaction) => ({ status: 200, data: { status: 'CAPTURED', currency: 'USD', transaction } });
const pay = (amount) => ({ result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount, currency: 'USD' } });

let rpcAnswers;
const rpc = vi.fn(async (name) => rpcAnswers[name] ?? { data: {}, error: null });

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
  return { client: { from, rpc }, updates };
};

const cancelFlightOrder = vi.fn();
let database;

vi.mock('../../backend/routes/payment/arcpay.config.js', () => ({
  get supabase() { return database.client; },
  ARC_PAY_CONFIG: { BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw' },
  getArcPayAuthConfig: () => ({ headers: {} }),
}));
vi.mock('../../backend/services/flightProvider.js', () => ({
  default: {
    cancelFlightOrder: (...args) => cancelFlightOrder(...args),
    getBookedFeeTable: vi.fn(),
  },
  providerStatus: () => ({ enabled: true, bookingEnabled: true }),
}));

const handlers = () => import('../../backend/routes/payment/operations.handlers.js');

const cancel = async (row, { user = null, settings } = {}) => {
  database = databaseFor({ row, settings });
  const { handleCancelBookingAction } = await handlers();
  const req = createRequest({ method: 'POST', user, body: { bookingReference: row.booking_reference, reason: 'test', email: 'traveler@example.com' } });
  const res = createResponse();
  await handleCancelBookingAction(req, res);
  return res;
};

const sent = (operation) => axios.put.mock.calls.map(([, body]) => body).filter((body) => body.apiOperation === operation);
const closing = () => database.updates.find((u) => u.table === 'bookings' && u.payload.status === 'cancelled')?.payload;
const rpcNames = () => rpc.mock.calls.map(([name]) => name);
const returnedCoins = () => rpc.mock.calls.find(([name]) => name === 'wallet_return')?.[1].p_coins;

const neverTicketed = { success: true, hadTickets: false, voided: false, requiresAirlineRefund: [] };
const ticketsVoided = { success: true, hadTickets: true, voided: true, requiresAirlineRefund: [] };

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  rpc.mockClear();
  rpcAnswers = {
    wallet_capture: { data: { status: 'captured' }, error: null },
    wallet_return: { data: { status: 'captured', coins: 5000 }, error: null },
    wallet_reverse_earn: { data: { coins: 0 }, error: null },
    wallet_release: { data: { status: 'released', coins: 5000 }, error: null },
  };
  cancelFlightOrder.mockReset();
  cancelFlightOrder.mockResolvedValue(neverTicketed);
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
  axios.get.mockReset();
  axios.get.mockResolvedValue(arcOrder([pay(72.2)]));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a customer cancel of a booking that used coins', () => {
  it('gives the coins back first and asks ARC for the rest, and records both', async () => {
    const res = await cancel(flight());

    expect(sent('REFUND')[0].transaction.amount).toBe('70.00');
    expect(rpcNames()).toEqual(['wallet_capture', 'wallet_return', 'wallet_reverse_earn']);
    expect(rpc).toHaveBeenCalledWith('wallet_return', { p_ref: 'FLT300', p_coins: 5000, p_reason: 'cancel', p_note: null });
    expect(res.body.cancellation).toMatchObject({ paymentAction: 'PARTIAL_REFUND', refundAmount: 70, coinsReturned: 5000, needsReview: false });
    expect(closing().booking_details.cancellation).toMatchObject({ coinsReturned: 5000, coinsOwed: 5000, coinsKept: 0 });
    expect(closing().booking_details.cancellation).not.toHaveProperty('coinsInReview');
    expect(closing().booking_details.needs_review).toBeUndefined();
  });

  it('tells the cancellation email the coins that went back', async () => {
    const { sendCancellationNotificationEmails } = await import('../../backend/services/emailService.js');

    await cancel(flight());

    expect(sendCancellationNotificationEmails).toHaveBeenCalledTimes(1);
    expect(sendCancellationNotificationEmails.mock.calls[0][0]).toMatchObject({ paymentAction: 'PARTIAL_REFUND', refundAmount: 70, coinsReturned: 5000 });
  });

  it('records the airline price on what the customer paid in all: $72.20 and 5,000 coins, with a $2.20 fee, is $120.00', async () => {
    await cancel(flight());

    expect(closing().booking_details.cancellation.terms).toMatchObject({ serviceFeeKept: 2.2, airlinePrice: 120 });
  });

  it('keeps the whole service fee in the terms when the card held less than the fee', async () => {
    const charge = { fare: 287.5, serviceFee: 12.5, discount: 0, total: 1, walletAmount: 299, walletCoins: 29900, wallet: { coins: 29900, amount: 299 } };
    axios.get.mockResolvedValue(arcOrder([pay(1)]));
    rpcAnswers.wallet_return = { data: { status: 'captured', coins: 28750 }, error: null };

    const res = await cancel(flight({ charge }));

    expect(axios.put).not.toHaveBeenCalled();
    expect(returnedCoins()).toBe(28750);
    expect(res.body.cancellation).toMatchObject({ paymentAction: 'NO_REFUND_FEE_COVERS', coinsReturned: 28750, coinsOwed: 28750, coinsKept: 1150 });
    expect(closing().booking_details.cancellation).toMatchObject({ coinsReturned: 28750, coinsOwed: 28750, coinsKept: 1150 });
    expect(closing().booking_details.cancellation.terms).toMatchObject({ serviceFeeKept: 12.5, airlinePrice: 287.5 });
  });

  it('leaves the coins to the desk, and says nothing was returned, when the cancel goes to review', async () => {
    cancelFlightOrder.mockResolvedValue(ticketsVoided);

    const res = await cancel(flight({ createdAt: hoursAgo(30), details: { gds: { ticketed: true }, tickets: [{ number: '057-2412345678' }] } }));

    expect(rpcNames()).not.toContain('wallet_return');
    expect(res.body.cancellation).toMatchObject({ paymentAction: 'REFUND_UNDER_REVIEW', coinsReturned: 0, coinsOwed: 0, coinsKept: 0, coinsInReview: true });
    expect(closing().booking_details.cancellation.coinsInReview).toBe(true);
  });

  it('flags the booking for the desk when the coins could not go back, and still cancels', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    rpcAnswers.wallet_return = { data: null, error: { message: 'connection reset' } };

    const res = await cancel(flight());

    expect(res.statusCode).toBe(200);
    expect(sent('REFUND')[0].transaction.amount).toBe('70.00');
    expect(res.body.cancellation).toMatchObject({ needsReview: true, coinsReturned: 0 });
    expect(closing().booking_details.needs_review.reason)
      .toMatch(/Jet Coins \(5,000\) could not be returned automatically: return them with Return Jet Coins/);
    silence.mockRestore();
  });

  it('names the coins that were owed, and records them, when a fee-covers return fails', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    const charge = { fare: 287.5, serviceFee: 12.5, discount: 0, total: 1, walletAmount: 299, walletCoins: 29900, wallet: { coins: 29900, amount: 299 } };
    axios.get.mockResolvedValue(arcOrder([pay(1)]));
    rpcAnswers.wallet_return = { data: null, error: { message: 'connection reset' } };

    const res = await cancel(flight({ charge }));

    const reason = closing().booking_details.needs_review.reason;
    expect(reason).toMatch(/Jet Coins \(28,750\) could not be returned automatically/);
    expect(reason).not.toMatch(/29,900/);
    expect(res.body.cancellation).toMatchObject({ coinsReturned: 0, coinsOwed: 28750, coinsKept: 1150 });
    expect(closing().booking_details.cancellation).toMatchObject({ coinsReturned: 0, coinsOwed: 28750, coinsKept: 1150 });
    silence.mockRestore();
  });

  it('flags the booking when the earned coins could not be taken back, and records the coins that went back', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    rpcAnswers.wallet_reverse_earn = { data: null, error: { message: 'connection reset' } };

    const res = await cancel(flight());

    expect(res.body.cancellation).toMatchObject({ needsReview: true, coinsReturned: 5000 });
    expect(closing().booking_details.needs_review.reason).toMatch(/earned on this booking could not be taken back/);
    silence.mockRestore();
  });
});

describe('a cancel of a checkout that was never paid', () => {
  it('releases the coins it held', async () => {
    axios.get.mockResolvedValue({ status: 404, data: { error: { cause: 'INVALID_REQUEST' } } });

    const res = await cancel(flight({ details: { pnr: undefined, gds: undefined }, over: { status: 'pending', payment_status: 'unpaid' } }));

    expect(res.statusCode).toBe(200);
    expect(rpcNames()).toEqual(['wallet_release']);
    expect(res.body.cancellation).toMatchObject({ paymentAction: 'NOTHING_TO_REFUND', coinsReturned: 5000 });
  });

  it('leaves the coins to the desk when they were already spent and nothing is held on the card', async () => {
    axios.get.mockResolvedValue({ status: 404, data: { error: { cause: 'INVALID_REQUEST' } } });
    rpcAnswers.wallet_release = { data: { status: 'captured', coins: 0 }, error: null };

    const res = await cancel(flight({ details: { pnr: undefined, gds: undefined }, over: { status: 'pending', payment_status: 'unpaid' } }));

    expect(res.statusCode).toBe(200);
    expect(res.body.cancellation).toMatchObject({ paymentAction: 'NOTHING_TO_REFUND', coinsReturned: 0, needsReview: true, coinsInReview: true });
    expect(closing().booking_details.cancellation).toMatchObject({ coinsReturned: 0, coinsInReview: true });
    expect(closing().booking_details.needs_review.reason)
      .toMatch(/Jet Coins \(5,000\) could not be returned automatically: return them with Return Jet Coins/);
  });
});

describe('a booking that used no coins', () => {
  it('stores the terms it always stored and moves no coins, except taking back what it earned', async () => {
    axios.get.mockResolvedValue(arcOrder([pay(300)]));

    const res = await cancel(flight({ charge: cardOnly }));

    expect(rpcNames()).toEqual(['wallet_reverse_earn']);
    expect(closing().booking_details.cancellation.terms).toEqual({
      serviceFeeKept: 12.5, airlinePrice: 287.5, cancellationFee: 50, penalty: null, penaltyCurrency: null,
    });
    expect(res.body.cancellation.coinsReturned).toBe(0);
    expect(closing().booking_details.cancellation).not.toHaveProperty('coinsOwed');
    expect(closing().booking_details.cancellation).not.toHaveProperty('coinsKept');
    expect(closing().booking_details.cancellation).not.toHaveProperty('coinsInReview');
    const { sendCancellationNotificationEmails } = await import('../../backend/services/emailService.js');
    expect(sendCancellationNotificationEmails.mock.calls[0][0]).not.toHaveProperty('coinsReturned');
  });

  it('is not held up by a wallet that cannot be reached', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    axios.get.mockResolvedValue(arcOrder([pay(300)]));
    rpcAnswers.wallet_reverse_earn = { data: null, error: { message: 'connection reset' } };

    const res = await cancel(flight({ charge: cardOnly }));

    expect(res.statusCode).toBe(200);
    expect(res.body.cancellation).toMatchObject({ paymentAction: 'PARTIAL_REFUND', needsReview: false });
    expect(closing().booking_details.needs_review).toBeUndefined();
    silence.mockRestore();
  });
});
