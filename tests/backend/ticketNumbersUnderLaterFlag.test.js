import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * A ticketed booking whose numbers never came back, under a refused cancel's
 * flag.
 *
 * The chain flags "ticket_numbers_not_retrieved" on a booking it DID ticket,
 * and the cancel's refund decision reads that flag as "the booking records a
 * ticket": if the cancel's own retrieve then shows no FA line, it holds the
 * refund for review rather than paying out over a live ticket. A refused
 * cancel writes its own flag on top, and the decision read the top flag only -
 * so the next cancel, finding no FA line, refunded in full.
 */

const REF = 'FLTNUM1';
const NUMBERS_MISSING = { reason: 'ticket_numbers_not_retrieved', ticketed: true, expected: 1, got: 0, at: '2026-09-20T10:00:00Z' };
const REFUSED_CANCEL = {
  reason: 'GDS cancellation failed; refund withheld to avoid paying out against a live booking',
  source: 'cancellation',
  cancelFailed: true,
  pnr: 'NUM111',
  at: '2026-09-21T10:00:00Z',
};

// `gds` without its `ticketed` key, as older rows carry it: the flag is the
// only record that a ticket was issued.
const row = (needsReview) => ({
  id: 'bk-num1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  created_at: '2026-09-20T08:00:00Z',
  booking_details: {
    pnr: 'NUM111',
    order_id: REF,
    customer_email: 'jane@example.com',
    refundable: true,
    gds: {},
    tickets: [],
    needs_review: needsReview,
  },
});

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

vi.mock('../../backend/services/flightProvider.js', () => ({
  default: { cancelFlightOrder: (...args) => cancelFlightOrder(...args) },
  providerStatus: () => ({ enabled: true, bookingEnabled: true }),
}));

const cancel = async (bookingRow) => {
  table = fakeBookingsTable([bookingRow], { tables: { price_settings: [], payments: [] } });
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const res = createResponse();
  await handleCancelBookingAction(createRequest({ method: 'POST', body: { bookingReference: REF, reason: 'Change of plans', email: 'jane@example.com' } }), res);
  return res;
};

beforeEach(() => {
  vi.resetModules();
  cancelFlightOrder.mockReset();
  // The PNR cancels, and its retrieve shows no FA line: the case the guard is for.
  cancelFlightOrder.mockResolvedValue({ success: true, cancelled: true, hadTickets: false, tickets: [], voided: false, requiresAirlineRefund: [] });
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
  axios.get.mockReset();
  axios.get.mockResolvedValue({
    status: 200,
    data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: '1', type: 'PAYMENT', amount: 291, currency: 'USD' } }] },
  });
});

describe('the refund decision for a ticketed booking whose numbers never came back', () => {
  it('holds the refund for review with the flag on top (unchanged)', async () => {
    const res = await cancel(row(NUMBERS_MISSING));

    expect(res.body.cancellation.paymentAction).toBe('REFUND_UNDER_REVIEW');
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('holds it too when a refused cancel sits on top of the flag', async () => {
    const res = await cancel(row({ ...REFUSED_CANCEL, previous: NUMBERS_MISSING }));

    expect(res.body.cancellation.paymentAction).toBe('REFUND_UNDER_REVIEW');
    expect(axios.put).not.toHaveBeenCalled();
  });
});

describe('what the booking reads send the page for it', () => {
  it('says the ticket numbers are missing under a later flag', async () => {
    const { toClientBooking } = await import('../../backend/routes/flight.routes.js');

    expect(toClientBooking(row({ ...REFUSED_CANCEL, previous: NUMBERS_MISSING })).needs_review).toEqual({
      reason: REFUSED_CANCEL.reason,
      no_confirmed_seat: false,
      ticket_numbers_missing: true,
      commit_unknown: false,
      unrecorded_cancellation: false,
    });
  });
});
