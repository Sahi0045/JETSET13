import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { buildMessage, selectUnannounced } from '../../backend/jobs/needsReviewAlert.job.js';
import { attentionLabel, attentionOf } from '../../shared/reviewQueue.js';

/**
 * A cancellation that released the seats and moved the money, then could not
 * write that down.
 *
 * The final write is pinned to the cancellation's own claim. When another
 * request had taken the booking in the meantime - the claim lapses after
 * CHAIN_CLAIM_TTL_MS and nothing renews it - the write matched nothing, and the
 * handler answered 500 having written nothing at all: the booking still read
 * confirmed/paid, with no cancellation record, no review flag, and nothing for
 * either alarm or the admin list to find. The only record was one console line.
 */

const REF = 'FLTU1';

const flight = (details = {}, over = {}) => ({
  id: 'bk-u1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  created_at: '2026-09-21T08:00:00Z',
  booking_details: { pnr: 'ABC123', order_id: REF, customer_email: 'traveler@example.com', gds: { ticketed: false }, ...details },
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

/** While the airline cancel runs, another request takes the booking. */
const takenOverDuringCancel = (gds) => cancelFlightOrder.mockImplementationOnce(async () => {
  table.row(REF).booking_details.gds_chain = { state: 'in_progress', startedAt: '2020-01-01T00:00:00.000Z' };
  return gds;
});

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

describe('a cancellation carried out but not recorded', () => {
  it('leaves a review flag saying what happened, which the alarm and the admin list both find', async () => {
    table = fakeBookingsTable([flight()], { tables: { price_settings: [], payments: [] } });
    takenOverDuringCancel({ success: true, hadTickets: false, voided: false, requiresAirlineRefund: [] });

    const res = await cancel();

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/do not try again/i);
    const row = table.row(REF);
    // The new holder's claim is not overwritten.
    expect(row.booking_details.gds_chain.startedAt).toBe('2020-01-01T00:00:00.000Z');
    expect(row.booking_details.needs_review).toMatchObject({
      source: 'cancellation',
      paymentAction: res.body.cancellation.paymentAction,
    });
    expect(row.booking_details.needs_review.reason).toMatch(/carried out but not recorded/);
    expect(selectUnannounced([row])).toHaveLength(1);
    expect(attentionOf(row)).not.toBeNull();
  });

  it('carries the tickets still to claim from the airline, so a ticketed booking is announced too', async () => {
    table = fakeBookingsTable([flight({ gds: { ticketed: true }, tickets: [{ number: '057-2412345678' }] })], { tables: { price_settings: [], payments: [] } });
    takenOverDuringCancel({ success: true, hadTickets: true, voided: false, requiresAirlineRefund: ['057-2412345678'] });

    const res = await cancel();

    expect(res.statusCode).toBe(500);
    const row = table.row(REF);
    expect(row.booking_details.needs_review.tickets).toEqual(['057-2412345678']);
    expect(selectUnannounced([row])).toHaveLength(1);
  });

  /**
   * The finding's own scenario: a TICKETED booking whose tickets the retry
   * voided. Nothing is left to claim, so the flag carries no tickets - and the
   * alarm then skipped it as "ticketed, so done". Nobody was paged about a
   * booking whose seats and money had moved while its record said neither.
   */
  describe('on a ticketed booking whose tickets were voided', () => {
    const voidedAndTakenOver = async () => {
      table = fakeBookingsTable([flight({ gds: { ticketed: true }, tickets: [{ number: '057-2412345678' }] })], { tables: { price_settings: [], payments: [] } });
      takenOverDuringCancel({ success: true, hadTickets: true, voided: true, requiresAirlineRefund: [] });
      const res = await cancel();
      expect(res.statusCode).toBe(500);
      return table.row(REF);
    };

    it('marks the flag unrecorded, and the alarm announces it', async () => {
      const row = await voidedAndTakenOver();
      expect(row.booking_details.needs_review).toMatchObject({ source: 'cancellation', unrecorded: true, ticketsVoided: true });
      expect(selectUnannounced([row])).toHaveLength(1);
    });

    it('is announced as an unrecorded cancellation, never as "ticket it, or refund it"', async () => {
      const row = await voidedAndTakenOver();
      const text = buildMessage([row]);
      expect(text).toMatch(/cancellation carried out but not recorded/i);
      expect(text).toMatch(/do not cancel or refund it again/i);
      expect(text).not.toMatch(/paid but not ticketed|ticket it, or refund it|refund to claim/i);
    });

    it('is not labelled a refund to claim from the airline in the admin list', async () => {
      const row = await voidedAndTakenOver();
      const attention = attentionOf(row);
      expect(attention).not.toBeNull();
      expect(attention.kind).not.toBe('airline_refund');
      expect(attentionLabel(attention)).toBe('Cancelled, but not recorded');
    });
  });
});
