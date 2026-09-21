import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { buildMessage, selectUnannounced } from '../../backend/jobs/needsReviewAlert.job.js';
import { attentionLabel, attentionOf } from '../../shared/reviewQueue.js';

/**
 * A cancellation carried out but not recorded, and then a later cancel.
 *
 * The unrecorded cancellation is flagged {source: 'cancellation', unrecorded:
 * true}: the seats and the money moved, and the record says neither. A later
 * cancel attempt - by staff or the customer - that fails at the airline writes
 * its own flag and keeps the old one only as `previous`. Everything read the
 * top-level flag alone, so "Cancelled, but not recorded" dropped off the desk
 * list and the alarm, and the later flag's "no refund was made" stood in for a
 * booking whose money had already moved.
 */

const REF = 'FLTU2';

const unrecorded = {
  reason: 'cancellation carried out but not recorded: airline reservation released, payment VOID 291 USD; check the airline and ARC Pay and record it by hand',
  source: 'cancellation',
  unrecorded: true,
  ticketsVoided: true,
  at: '2026-09-21T09:00:00.000Z',
  paymentAction: 'VOID',
  refundAmount: 291,
  alerted_at: '2026-09-21T09:15:00.000Z',
};

const flight = (details = {}, over = {}) => ({
  id: 'bk-u2',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  created_at: '2026-09-21T08:00:00Z',
  booking_details: {
    pnr: 'ABC123',
    order_id: REF,
    customer_email: 'traveler@example.com',
    gds: { ticketed: true },
    tickets: [{ number: '057-2412345678' }],
    needs_review: unrecorded,
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

beforeEach(() => {
  vi.resetModules();
  cancelFlightOrder.mockReset();
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
  axios.get.mockReset();
  axios.get.mockResolvedValue({
    status: 200,
    data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: '1', type: 'PAYMENT', amount: 291, currency: 'USD' } }] },
  });
});

describe('an unrecorded cancellation, after a later cancel failed at the airline', () => {
  const retried = async () => {
    table = fakeBookingsTable([flight()], { tables: { price_settings: [], payments: [] } });
    expect(attentionOf(table.row(REF))).toMatchObject({ kind: 'unrecorded_cancellation' });
    cancelFlightOrder.mockRejectedValueOnce(Object.assign(new Error('PNR_Cancel refused'), { technicalError: '999 CANCEL NOT ALLOWED' }));
    const res = await cancel();
    expect(res.statusCode).toBe(502);
    const row = table.row(REF);
    // The later flag is on top, and the unrecorded one only under it.
    expect(row.booking_details.needs_review.unrecorded).toBeUndefined();
    expect(row.booking_details.needs_review.previous).toMatchObject({ unrecorded: true });
    return row;
  };

  it('is still "Cancelled, but not recorded" on the desk list', async () => {
    const row = await retried();
    const attention = attentionOf(row);

    expect(attention).toMatchObject({ kind: 'unrecorded_cancellation', reason: unrecorded.reason });
    expect(attentionLabel(attention)).toBe('Cancelled, but not recorded');
  });

  it('is announced again, as an unrecorded cancellation with what the first cancel did, and what came after', async () => {
    const row = await retried();

    expect(selectUnannounced([row])).toHaveLength(1);
    const text = buildMessage([row]);
    expect(text).toMatch(/cancellation carried out but not recorded/i);
    expect(text).toMatch(/payment VOID 291 USD/);
    expect(text).toMatch(/since then: GDS cancellation failed; refund withheld .* \(999 CANCEL NOT ALLOWED\)/);
    expect(text).not.toMatch(/did not carry out|no refund was made/);
  });

  it('leaves the desk list once someone resolves the flag on top', async () => {
    const row = await retried();
    row.booking_details.needs_review.resolved_at = '2026-09-22T09:00:00.000Z';

    expect(attentionOf(row)).toBeNull();
  });

  it('is not brought back by a flag below one a person already resolved', () => {
    const row = flight({
      needs_review: {
        reason: 'GDS cancellation failed; refund withheld to avoid paying out against a live booking',
        source: 'cancellation',
        cancelFailed: true,
        at: '2026-09-22T08:00:00.000Z',
        previous: { reason: 'something a person handled', resolved_at: '2026-09-21T12:00:00.000Z', previous: unrecorded },
      },
    });

    expect(attentionOf(row)).toMatchObject({ kind: 'cancel_failed' });
  });
});
