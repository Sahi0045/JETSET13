import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';

/**
 * Cancelling has to release the seat and return the money, in that order.
 *
 * The two halves are separate systems - Amadeus holds the reservation, ARC Pay
 * holds the charge - and the only genuinely bad outcome is refunding while the
 * airline still has the booking: the customer keeps a boardable ticket and gets
 * paid for it. So the supplier cancel runs first and the refund is conditional
 * on it.
 *
 * The reverse gap (seat released, refund failed) is recoverable - the refund can
 * be retried - and is already recorded as refund_pending.
 */

const booking = (overrides = {}) => ({
  id: 'uuid-1',
  booking_reference: 'FLT123',
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 291,
  booking_details: { pnr: 'ABC123', order_id: 'FLT123' },
  ...overrides,
});

/** Minimal Supabase double: `bookings` reads return `row`, everything else is inert. */
const supabaseFor = (row) => {
  const updates = [];
  const chain = () => {
    const c = {
      select: vi.fn(() => c),
      update: vi.fn((payload) => { updates.push(payload); return c; }),
      insert: vi.fn(() => c),
      eq: vi.fn(() => c),
      or: vi.fn(() => c),
      filter: vi.fn(() => c),
      order: vi.fn(() => c),
      limit: vi.fn(() => c),
      single: vi.fn().mockResolvedValue({ data: row, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    return c;
  };
  return { client: { from: vi.fn(() => chain()) }, updates };
};

const cancelFlightOrder = vi.fn();
let supabaseDouble = supabaseFor(booking());

vi.mock('../../backend/routes/payment/arcpay.config.js', () => ({
  get supabase() { return supabaseDouble.client; },
  ARC_PAY_CONFIG: { BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT' },
  getArcPayAuthConfig: () => ({ headers: {} }),
}));

vi.mock('../../backend/services/flightProvider.js', () => ({
  default: { cancelFlightOrder: (...args) => cancelFlightOrder(...args) },
  providerStatus: () => ({ enabled: true, bookingEnabled: true }),
}));

const runCancel = async (row) => {
  supabaseDouble = supabaseFor(row);
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const req = createRequest({ method: 'POST', body: { bookingReference: 'FLT123', reason: 'test' } });
  const res = createResponse();
  await handleCancelBookingAction(req, res);
  return res;
};

beforeEach(() => {
  vi.resetModules();
  cancelFlightOrder.mockReset();
  axios.put?.mockReset?.();
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
});

describe('a booking the airline still holds', () => {
  // The reason this guard exists: the cancel path called the old REST service,
  // whose host has had no DNS since August. Every flight cancellation threw,
  // was swallowed as a warning, and ARC Pay refunded anyway - against a
  // reservation that was still live.
  it('withholds the refund when the GDS cancel throws', async () => {
    cancelFlightOrder.mockRejectedValue(Object.assign(new Error('getaddrinfo ENOTFOUND'), {
      technicalError: 'host unreachable',
    }));

    const res = await runCancel(booking());

    expect(res.statusCode).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.needsReview).toBe(true);
    // The money must not have moved.
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('withholds the refund when the GDS reports no success', async () => {
    cancelFlightOrder.mockResolvedValue({ success: false });

    const res = await runCancel(booking());

    expect(res.statusCode).toBe(502);
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('tells the customer how to reach a human instead of failing silently', async () => {
    cancelFlightOrder.mockRejectedValue(new Error('boom'));
    const res = await runCancel(booking());
    expect(res.body.error).toMatch(/538-7380/);
  });

  it('records the booking for review so it is not simply lost', async () => {
    cancelFlightOrder.mockRejectedValue(new Error('boom'));
    await runCancel(booking());

    const flagged = supabaseDouble.updates.find((u) => u.booking_details?.needs_review);
    expect(flagged).toBeTruthy();
    expect(flagged.booking_details.needs_review.pnr).toBe('ABC123');
  });

  // The GDS cancels by record locator. order_id and booking_reference are ours
  // and cancel nothing.
  it('cancels by record locator, not by our own reference', async () => {
    cancelFlightOrder.mockResolvedValue({ success: true });
    await runCancel(booking());

    expect(cancelFlightOrder).toHaveBeenCalledWith('ABC123');
  });
});

describe('a booking the airline has released', () => {
  it('proceeds to the refund once the GDS cancel succeeds', async () => {
    cancelFlightOrder.mockResolvedValue({ success: true, hadTickets: false });

    const res = await runCancel(booking());

    expect(res.statusCode).not.toBe(502);
    expect(cancelFlightOrder).toHaveBeenCalled();
  });
});

describe('bookings with nothing to release', () => {
  // A cruise or package was never sold through the GDS, so there is no seat to
  // release and withholding the refund would strand the customer.
  it('refunds a package without asking the GDS to cancel anything', async () => {
    const res = await runCancel(booking({ travel_type: 'package', booking_details: { order_id: 'PKG1' } }));

    expect(res.statusCode).not.toBe(502);
    expect(cancelFlightOrder).not.toHaveBeenCalled();
  });

  // A flight that failed before the PNR was committed has no record locator.
  it('refunds a flight that never reached the GDS', async () => {
    const res = await runCancel(booking({ booking_details: { order_id: 'FLT123' } }));

    expect(res.statusCode).not.toBe(502);
    expect(cancelFlightOrder).not.toHaveBeenCalled();
  });
});
