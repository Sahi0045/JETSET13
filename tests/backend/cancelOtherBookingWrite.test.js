import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * Cancelling a hotel, cruise or package writes the whole booking_details
 * column back. It spread the copy read at the very start - before the payments
 * lookup, the ARC read and a refund that can take seconds - and wrote it with
 * nothing but `.eq('id')`, so anything written to the booking in that window
 * (a payment reconcile's captured amount and receipt, a review flag) was
 * erased. Every other writer of the column re-reads and pins
 * (utils/bookingDetailsGuard.js); this one did not.
 */

const REF = 'HTLC1';

const hotel = () => ({
  id: 'bk-h1',
  booking_reference: REF,
  travel_type: 'hotel',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 500,
  user_id: null,
  created_at: '2026-09-21T08:00:00Z',
  booking_details: { order_id: REF, customer_email: 'traveler@example.com' },
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

const cancel = async () => {
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const res = createResponse();
  await handleCancelBookingAction(createRequest({ method: 'POST', body: { bookingReference: REF, reason: 'Change of plans', email: 'traveler@example.com' } }), res);
  return res;
};

beforeEach(() => {
  vi.resetModules();
  table = fakeBookingsTable([hotel()], { tables: { price_settings: [], payments: [] } });
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockReset();
});

describe('cancelling a hotel', () => {
  it('keeps what was written to the booking while ARC was refunding it', async () => {
    axios.put.mockImplementation(async () => {
      // A payment reconcile lands while the refund is in flight.
      Object.assign(table.row(REF).booking_details, { arc_captured_amount: 500, arc_receipt: '625923098465' });
      return { status: 200, data: { result: 'SUCCESS' } };
    });

    const res = await cancel();

    expect(res.statusCode).toBe(200);
    const row = table.row(REF);
    expect(row.status).toBe('cancelled');
    expect(row.booking_details.cancellation.paymentAction).toBe('PARTIAL_REFUND');
    expect(row.booking_details.arc_receipt).toBe('625923098465');
    expect(row.booking_details.arc_captured_amount).toBe(500);
  });

  it('still records the cancellation when nothing else wrote meanwhile', async () => {
    axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });

    const res = await cancel();

    expect(res.statusCode).toBe(200);
    expect(table.row(REF).status).toBe('cancelled');
    expect(table.row(REF).booking_details.order_id).toBe(REF);
  });
});
