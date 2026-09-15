import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { buildMessage, selectUnannounced } from '../../backend/jobs/needsReviewAlert.job.js';

/**
 * A refund still to be claimed from the airline reaches someone.
 *
 * A cancel whose tickets were past their same-day void window, on a refundable
 * fare, refunds the customer and writes `needs_review` listing the tickets
 * whose value the airline still holds. Nothing read it: the paid-not-ticketed
 * alarm skipped cancelled (and ticketed) rows, and the failed-refund alarm
 * lists only refunds that failed. The money was ours to claim, and no one knew.
 */

let table = fakeBookingsTable([]);
const cancelFlightOrder = vi.fn();

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    ARC_PAY_CONFIG: { ...actual.ARC_PAY_CONFIG, BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw' },
    getArcPayAuthConfig: () => ({ headers: {} }),
    get supabase() { return { from: (...args) => table.from(...args) }; },
  };
});

vi.mock('../../backend/services/flightProvider.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: new Proxy(actual.default, {
      get: (target, key) => (key === 'cancelFlightOrder' ? (...args) => cancelFlightOrder(...args) : target[key]),
    }),
  };
});

const claimRow = (review = {}, over = {}) => ({
  booking_reference: 'FLTCLAIM1',
  status: 'cancelled',
  payment_status: 'partially_refunded',
  total_amount: 291,
  created_at: new Date().toISOString(),
  passenger_details: [{ firstName: 'Jane', lastName: 'Doe', passportNumber: 'X1234567' }],
  ...over,
  booking_details: {
    pnr: 'ABC123',
    gds: { ticketed: true },
    tickets: [{ number: '057-1234567890' }],
    cancellation: { paymentAction: 'PARTIAL_REFUND', refundAmount: 241, cancellationFee: 50, cancelledAt: new Date().toISOString() },
    needs_review: {
      reason: 'tickets could not be voided; airline refund must be claimed',
      source: 'cancellation',
      at: new Date().toISOString(),
      tickets: ['0571234567890'],
      ...review,
    },
    ...(over.booking_details || {}),
  },
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
    data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 291, currency: 'USD' } }] },
  });
});

describe('an airline refund still to be claimed', () => {
  it('is announced, although the booking is cancelled and ticketed', () => {
    expect(selectUnannounced([claimRow()])).toHaveLength(1);
  });

  it('is announced once', () => {
    expect(selectUnannounced([claimRow({ alerted_at: '2026-09-15T08:00:00Z' })])).toHaveLength(0);
  });

  it('does not wake anyone for a cancelled booking with nothing to claim', () => {
    const settled = claimRow({ tickets: [] });
    const otherReview = claimRow({ source: undefined, tickets: undefined, reason: 'GDS cancellation failed' });
    expect(selectUnannounced([settled, otherReview])).toHaveLength(0);
  });

  it('gets its own section, naming the tickets and not the passengers', () => {
    const unticketed = {
      booking_reference: 'FLTSTUCK1',
      status: 'pending_ticketing',
      payment_status: 'paid',
      total_amount: 143,
      created_at: new Date().toISOString(),
      booking_details: { pnr: 'AMRHOG', needs_review: { reason: 'chain failed after commit at issueTicket', at: new Date().toISOString() } },
    };

    const onlyClaims = buildMessage([claimRow()]);
    expect(onlyClaims).toMatch(/refund to claim from the airline/);
    expect(onlyClaims).toMatch(/FLTCLAIM1/);
    expect(onlyClaims).toMatch(/0571234567890/);
    expect(onlyClaims).not.toMatch(/paid but not ticketed/);
    expect(onlyClaims).not.toMatch(/Jane|Doe|X1234567/);

    const mixed = buildMessage([unticketed, claimRow()]);
    expect(mixed).toMatch(/1 booking paid but not ticketed/);
    expect(mixed).toMatch(/1 cancelled booking with a refund to claim from the airline/);
  });

  it('is what a cancel of a ticket past its void window leaves for the alarm', async () => {
    table = fakeBookingsTable([{
      id: 'bk-c1',
      booking_reference: 'FLTCLAIM1',
      travel_type: 'flight',
      status: 'confirmed',
      payment_status: 'paid',
      total_amount: 291,
      user_id: null,
      created_at: new Date().toISOString(),
      booking_details: {
        pnr: 'ABC123',
        order_id: 'FLTCLAIM1',
        customer_email: 'booker@example.com',
        refundable: true,
        gds: { ticketed: true },
        tickets: [{ number: '057-1234567890' }],
      },
    }], { tables: { price_settings: [{ settings: { cancellation_fee: 50 } }] } });
    cancelFlightOrder.mockResolvedValue({ success: true, hadTickets: true, voided: false, requiresAirlineRefund: ['0571234567890'] });

    const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
    const res = createResponse();
    await handleCancelBookingAction(createRequest({ method: 'POST', body: { bookingReference: 'FLTCLAIM1', email: 'booker@example.com' } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.cancellation.paymentAction).toBe('PARTIAL_REFUND');
    const row = table.row('FLTCLAIM1');
    expect(row.status).toBe('cancelled');
    expect(selectUnannounced([row])).toHaveLength(1);
  });
});
