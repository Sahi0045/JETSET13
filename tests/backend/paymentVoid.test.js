import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * The admin panel's "Void payment" never leaves an airline booking behind.
 *
 * It had no reservation check, no chain claim and no airline step. On a flight
 * with a PNR it reversed the payment and wrote the booking cancelled and
 * refunded - so the paid-not-ticketed alarm and the failed-refund alarm both
 * skipped it - while the seats stayed live. A reply with no result at all
 * counted as a successful void, and the booking was rewritten from the copy
 * read at the start, undoing anything written while ARC answered.
 */

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

vi.mock('../../backend/routes/payment/agents.handlers.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requireAdmin: async () => true,
  getCaller: async () => ({ id: 'admin-1', role: 'admin' }),
}));

const REF = 'FLTV1';

const flight = (details = {}, over = {}) => ({
  id: 'bk-v1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 291,
  created_at: '2026-09-15T08:00:00Z',
  ...over,
  booking_details: { order_id: REF, customer_email: 'booker@example.com', ...details },
});

const capturedOrder = () => ({
  status: 200,
  data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 291, currency: 'USD' } }] },
});

const voidWith = async (rows, options) => {
  table = fakeBookingsTable(rows, { tables: { payments: [] }, ...options });
  const { handlePaymentVoid } = await import('../../backend/routes/payment/operations.handlers.js');
  const req = createRequest({ method: 'POST', body: { bookingReference: REF, reason: 'Duplicate payment' } });
  const res = createResponse();
  await handlePaymentVoid(req, res);
  return res;
};

const expectNothingMoved = () => {
  expect(axios.get).not.toHaveBeenCalled();
  expect(axios.put).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.resetModules();
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
  axios.get.mockReset();
  axios.get.mockResolvedValue(capturedOrder());
});

describe('voiding a flight payment', () => {
  it('is refused for a flight with an airline reservation, before anything moves', async () => {
    const res = await voidWith([flight({ pnr: 'ABC123', gds: { ticketed: false } }, { status: 'pending_ticketing' })]);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('USE_CANCEL_AND_REFUND');
    expect(res.body.error).toMatch(/Cancel & Refund/);
    expectNothingMoved();
    expect(table.writes).toEqual([]);
  });

  it('waits while the booking is being made, or waits in the queue', async () => {
    const running = flight({ gds_chain: { state: 'in_progress', startedAt: new Date().toISOString(), attempt: 1 } });
    const queued = flight({ queued_order: { bookingReference: REF }, gds_chain: { state: 'queued', startedAt: new Date().toISOString() } });

    for (const row of [running, queued]) {
      axios.get.mockClear();
      const res = await voidWith([row]);
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('BOOKING_BUSY');
      expectNothingMoved();
      expect(table.writes).toEqual([]);
    }
  });

  it('voids a checkout that never reached the airline, and leaves the booking finished', async () => {
    const res = await voidWith([flight()]);

    expect(res.statusCode).toBe(200);
    const [url, body] = axios.put.mock.calls[0];
    expect(url).toContain(`/order/${REF}/transaction/void-admin-`);
    expect(body).toMatchObject({ apiOperation: 'VOID', transaction: { targetTransactionId: 'txn-1' } });

    const row = table.row(REF);
    expect(row.status).toBe('cancelled');
    expect(row.payment_status).toBe('refunded');
    expect(row.booking_details.cancellation).toMatchObject({ paymentAction: 'VOID', refundAmount: 291, cancellationFee: 0 });
    // A late order attempt is refused, not booked against a void.
    expect(row.booking_details.gds_chain.state).toBe('cancelled');
  });

  it('does not take a booking a PNR reached after it was read', async () => {
    const res = await voidWith([flight()], {
      // The chain commits, and leaves no claim stamp, between the handler's
      // read and its claim.
      fail: ({ patch }) => {
        if (patch?.booking_details?.gds_chain?.state === 'cancelling') {
          table.row(REF).booking_details.pnr = 'NEW999';
          table.row(REF).booking_details.gds_chain = { state: 'committed', committedAt: new Date().toISOString() };
        }
        return false;
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('BOOKING_BUSY');
    expectNothingMoved();
    expect(table.row(REF).status).toBe('pending');
    expect(table.row(REF).booking_details.gds_chain.state).toBe('committed');
  });

  it('counts a reply with no result as a failed void, and hands the booking back', async () => {
    axios.put.mockResolvedValue({ status: 200, data: {} });

    const res = await voidWith([flight({ gds_chain: { state: 'failed', startedAt: '2026-09-15T07:00:00.000Z', failedStep: 'sell' } })]);

    expect(res.statusCode).toBe(400);
    const row = table.row(REF);
    expect(row.status).toBe('pending');
    expect(row.payment_status).toBe('paid');
    expect(row.booking_details.cancellation).toBeUndefined();
    expect(row.booking_details.gds_chain).toEqual({ state: 'failed', startedAt: '2026-09-15T07:00:00.000Z', failedStep: 'sell' });
  });

  it('keeps what was written to the booking while ARC answered', async () => {
    axios.put.mockImplementation(async () => {
      table.row(REF).booking_details.payment_reconciled_at = '2026-09-15T08:05:00Z';
      return { status: 200, data: { result: 'SUCCESS' } };
    });

    const res = await voidWith([flight()]);

    expect(res.statusCode).toBe(200);
    expect(table.row(REF).booking_details.payment_reconciled_at).toBe('2026-09-15T08:05:00Z');
  });
});

describe('voiding another kind of payment', () => {
  it('still voids a paid hotel, and still needs ARC to say SUCCESS', async () => {
    const hotel = flight({}, { travel_type: 'hotel', status: 'confirmed' });

    expect((await voidWith([hotel])).statusCode).toBe(200);
    expect(table.row(REF).status).toBe('cancelled');

    axios.put.mockResolvedValue({ status: 200, data: { result: 'FAILURE' } });
    const refused = await voidWith([hotel]);
    expect(refused.statusCode).toBe(400);
    expect(table.row(REF).status).toBe('confirmed');
  });
});
