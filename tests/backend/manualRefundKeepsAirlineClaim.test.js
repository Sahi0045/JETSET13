import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { attentionOf } from '../../shared/reviewQueue.js';

/**
 * Finishing the customer's refund is not claiming the airline's.
 *
 * A cancel whose tickets were past their void window lists them on its review
 * flag for a refund to claim from the airline (needsAirlineRefundClaim). The
 * desk's Finish refund stamped that whole flag resolved - "refund finished by
 * the desk" - once the customer had their money, and "Refund to claim from the
 * airline" left the desk with nothing claimed. The ticket's value stayed with
 * the airline and nobody was left holding the task.
 */

let table = null;

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    ARC_PAY_CONFIG: { ...actual.ARC_PAY_CONFIG, BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw' },
    getArcPayAuthConfig: () => ({ headers: {} }),
    get supabase() { return { from: (...args) => table.from(...args) }; },
  };
});

const now = new Date().toISOString();

// What cancelFlightBooking writes for a non-refundable fare whose ticket is
// past its void window: REFUND_UNDER_REVIEW plus an airline claim.
const cancelled = (needsReview) => ({
  id: 'bk-1',
  booking_reference: 'FLTAC1',
  travel_type: 'flight',
  status: 'cancelled',
  payment_status: 'paid',
  total_amount: 291,
  booking_details: {
    order_id: 'FLTAC1',
    pnr: 'GHI789',
    arc_captured_amount: 291,
    arc_captured_currency: 'USD',
    cancellation: { paymentAction: 'REFUND_UNDER_REVIEW', refundAmount: 0, cancellationFee: 0, amadeusCancelled: true, cancelledAt: now },
    needs_review: needsReview,
  },
});

const withClaim = () => cancelled({
  reason: 'non-refundable fare with tickets past their void window: what the airline returns depends on its fare rules; '
    + 'tickets could not be voided; airline refund must be claimed',
  source: 'cancellation',
  at: now,
  tickets: ['2201234567890'],
});

const withoutClaim = () => cancelled({
  reason: 'the booking records a ticket, but the airline showed none when it was cancelled',
  source: 'cancellation',
  at: now,
});

const payment = { result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 291, currency: 'USD' } };
const refund = { result: 'SUCCESS', transaction: { id: 'r-1', type: 'REFUND', amount: 291, currency: 'USD' } };

// The desk refunds the customer in the ARC portal and presses "Check ARC Pay".
const syncFinishedRefund = async (row) => {
  axios.get.mockResolvedValue({ status: 200, data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [payment, refund] } });
  table = fakeBookingsTable([row]);
  const { settleManualFlightRefund } = await import('../../backend/routes/payment/operations.handlers.js');
  const result = await settleManualFlightRefund(row, { mode: 'sync', adminId: 'admin-1' });
  return { ...result, after: table.row(row.booking_reference) };
};

beforeEach(() => {
  vi.resetModules();
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockReset();
});

describe('Finish refund on a cancelled booking with tickets to claim from the airline', () => {
  it('starts on the desk as a refund to claim from the airline', () => {
    expect(attentionOf(withClaim())?.kind).toBe('airline_refund');
  });

  it('keeps the airline claim on the desk after the customer refund is finished', async () => {
    const { status, after } = await syncFinishedRefund(withClaim());
    expect(status).toBe(200);
    // Nobody has claimed anything from the airline yet.
    expect(after.booking_details.needs_review.resolved_at).toBeUndefined();
    expect(attentionOf(after)?.kind).toBe('airline_refund');
  });

  it('still records the customer refund', async () => {
    const { after } = await syncFinishedRefund(withClaim());
    expect(after.payment_status).toBe('refunded');
    expect(after.booking_details.cancellation).toMatchObject({
      paymentAction: 'FULL_REFUND',
      refundAmount: 291,
      cancellationFee: 0,
      manualRefund: { mode: 'sync', by: 'admin-1', previousPaymentAction: 'REFUND_UNDER_REVIEW' },
    });
  });
});

describe('Finish refund on a cancelled booking with no airline claim', () => {
  it('resolves its flag as before', async () => {
    const { after } = await syncFinishedRefund(withoutClaim());
    expect(after.booking_details.needs_review).toMatchObject({ resolution: 'refund finished by the desk' });
    expect(after.booking_details.needs_review.resolved_at).toBeTruthy();
  });

  it('writes the same payment status and cancellation record as one with a claim', async () => {
    const plain = (await syncFinishedRefund(withoutClaim())).after;
    vi.resetModules();
    const claimed = (await syncFinishedRefund(withClaim())).after;
    const strip = ({ manualRefund: { at: _at, ...manual }, ...rest }) => ({ ...rest, manualRefund: manual });
    expect(claimed.payment_status).toBe(plain.payment_status);
    expect(strip(claimed.booking_details.cancellation)).toEqual(strip(plain.booking_details.cancellation));
  });
});
