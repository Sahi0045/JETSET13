import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { attentionOf } from '../../shared/reviewQueue.js';

/**
 * The reason a refused cancel stores on a booking that was already refunded.
 *
 * The Payments tab refunds without cancelling (it writes payment_status only).
 * When the customer then cancels and the airline refuses, the cancel handler
 * wrote the same flag it writes on a paid booking: "GDS cancellation failed;
 * refund withheld to avoid paying out against a live booking". The desk shows
 * that reason (attentionOf), and it is false here - nothing is withheld, the
 * money already went back. The Slack section says so; the stored reason did
 * not.
 */

const REF = 'FLTRR4';
const LIVE_BOOKING_REASON = 'GDS cancellation failed; refund withheld to avoid paying out against a live booking';

const flight = (over = {}, details = {}) => ({
  id: 'bk-rr4',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 582,
  user_id: null,
  created_at: '2026-09-22T08:00:00Z',
  booking_details: {
    pnr: 'ABC123',
    order_id: REF,
    customer_email: 'traveler@example.com',
    refundable: true,
    gds: { ticketed: false },
    tickets: [],
    ...details,
  },
  ...over,
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
  default: { cancelFlightOrder: (...args) => cancelFlightOrder(...args) },
  providerStatus: () => ({ enabled: true, bookingEnabled: true }),
}));

const cancel = async () => {
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const res = createResponse();
  await handleCancelBookingAction(createRequest({ method: 'POST', body: { bookingReference: REF, reason: 'Change of plans', email: 'traveler@example.com' } }), res);
  return res;
};

const refused = () => Object.assign(new Error('PNR_Cancel refused'), { technicalError: '999 CANCEL NOT ALLOWED' });

/** ARC's order: paid, and - when `refunded` - refunded in full or in part since. */
const arcOrder = (refunded = 0) => ({
  status: 200,
  data: {
    status: refunded ? (refunded >= 582 ? 'REFUNDED' : 'PARTIALLY_REFUNDED') : 'CAPTURED',
    amount: 582,
    currency: 'USD',
    transaction: [
      { result: 'SUCCESS', transaction: { id: '1', type: 'PAYMENT', amount: 582, currency: 'USD' } },
      ...(refunded ? [{ result: 'SUCCESS', transaction: { id: '2', type: 'REFUND', amount: refunded, currency: 'USD' } }] : []),
    ],
  },
});

beforeEach(() => {
  vi.resetModules();
  cancelFlightOrder.mockReset();
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
  axios.get.mockReset();
});

describe('a refused cancel on a booking already refunded', () => {
  it('does not say a refund was withheld when the payment was refunded in full', async () => {
    table = fakeBookingsTable([flight({ payment_status: 'refunded' })], { tables: { price_settings: [], payments: [] } });
    axios.get.mockResolvedValue(arcOrder(582));
    cancelFlightOrder.mockRejectedValueOnce(refused());

    const res = await cancel();

    expect(res.statusCode).toBe(502);
    const row = table.row(REF);
    const review = row.booking_details.needs_review;
    expect(review).toMatchObject({ source: 'cancellation', cancelFailed: true, detail: '999 CANCEL NOT ALLOWED' });
    expect(review.reason).not.toMatch(/withheld/);
    expect(review.reason).toBe('GDS cancellation failed; the payment had already been refunded before this cancel, so this cancel made no refund');
    // What the desk shows.
    expect(attentionOf(row)).toMatchObject({ kind: 'cancel_failed', reason: review.reason });
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('says part was refunded, and the rest withheld, when the payment was refunded in part', async () => {
    table = fakeBookingsTable([flight({ payment_status: 'partially_refunded' })], { tables: { price_settings: [], payments: [] } });
    axios.get.mockResolvedValue(arcOrder(100));
    cancelFlightOrder.mockRejectedValueOnce(refused());

    await cancel();

    const review = table.row(REF).booking_details.needs_review;
    expect(review.reason).toBe('GDS cancellation failed; part of the payment had already been refunded before this cancel, '
      + 'and the rest is withheld to avoid paying out against a live booking');
    expect(axios.put).not.toHaveBeenCalled();
  });
});

/**
 * Fence: the paid booking's reason, and a stored reason, as on main.
 */
describe('fence: the reasons that stay as they are', () => {
  it('a paid booking still reads "refund withheld to avoid paying out against a live booking"', async () => {
    table = fakeBookingsTable([flight()], { tables: { price_settings: [], payments: [] } });
    axios.get.mockResolvedValue(arcOrder(0));
    cancelFlightOrder.mockRejectedValueOnce(refused());

    await cancel();

    const row = table.row(REF);
    expect(row.booking_details.needs_review).toMatchObject({ reason: LIVE_BOOKING_REASON, cancelFailed: true });
    expect(attentionOf(row)).toMatchObject({ kind: 'cancel_failed', reason: LIVE_BOOKING_REASON });
  });

  it('a flag already stored keeps its text under a later refused cancel', async () => {
    const earlier = {
      reason: LIVE_BOOKING_REASON, source: 'cancellation', cancelFailed: true, pnr: 'ABC123', detail: '999 CANCEL NOT ALLOWED', at: '2026-09-21T09:00:00.000Z',
    };
    table = fakeBookingsTable([flight({ payment_status: 'refunded' }, { needs_review: earlier })], { tables: { price_settings: [], payments: [] } });
    axios.get.mockResolvedValue(arcOrder(582));
    cancelFlightOrder.mockRejectedValueOnce(refused());

    await cancel();

    const review = table.row(REF).booking_details.needs_review;
    expect(review.previous).toEqual(earlier);
  });

  it('the stored reason of a refunded row flagged earlier is what the desk shows, unrewritten', () => {
    const row = flight({ payment_status: 'refunded' }, {
      needs_review: { reason: LIVE_BOOKING_REASON, source: 'cancellation', cancelFailed: true, at: '2026-09-21T09:00:00.000Z' },
    });
    expect(attentionOf(row)).toMatchObject({ kind: 'cancel_failed', reason: LIVE_BOOKING_REASON });
  });
});
