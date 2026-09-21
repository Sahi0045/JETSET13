import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * A void that went through for some tickets of a PNR and not the others.
 *
 * Ticket_CancelDocument answers per document. On a two-ticket PNR it can void
 * one and refuse the other; the chain then leaves the itinerary live and says
 * which were voided (bookingChain.js partialVoid: error.voidedTickets and
 * error.unvoidedTickets). Nothing read those two lists. The cancel handler
 * wrote only the error text, a cancel on a later day listed the ticket voided
 * the day before as one to claim from the airline - a claim for money that
 * already came back with the void - and it overwrote the review flag, losing
 * the "voided X but not Y" detail exactly when a person needed it.
 */

const REF = 'FLTPV1';
const VOIDED = '125-2412345671';
const NOT_VOIDED = '125-2412345672';

const flight = (details = {}, over = {}) => ({
  id: 'bk-pv1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 582,
  user_id: null,
  created_at: '2026-09-21T08:00:00Z',
  booking_details: {
    pnr: 'ABC123',
    order_id: REF,
    customer_email: 'traveler@example.com',
    refundable: true,
    gds: { ticketed: true },
    tickets: [{ number: VOIDED }, { number: NOT_VOIDED }],
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

/** What the chain throws when the void answered for one document of two. */
const partlyVoided = () => Object.assign(new Error('We could not void the ticket'), {
  name: 'BookingChainError',
  step: 'voidTicket',
  pnr: 'ABC123',
  committed: true,
  ticketed: true,
  error: 'We could not void the ticket',
  technicalError: `Ticket_CancelDocument responseType absent status absent; voided ${VOIDED} but not ${NOT_VOIDED} - the PNR is left live`,
  voidedTickets: [VOIDED],
  unvoidedTickets: [NOT_VOIDED],
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
    data: { status: 'CAPTURED', amount: 582, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: '1', type: 'PAYMENT', amount: 582, currency: 'USD' } }] },
  });
});

describe('a cancel whose void went through for only some tickets', () => {
  it('records which tickets were voided and which were not, and leaves the booking live', async () => {
    table = fakeBookingsTable([flight()], { tables: { price_settings: [], payments: [] } });
    cancelFlightOrder.mockRejectedValueOnce(partlyVoided());

    const res = await cancel();

    expect(res.statusCode).toBe(502);
    const row = table.row(REF);
    expect(row.status).toBe('confirmed');
    expect(row.booking_details.needs_review).toMatchObject({
      voided_tickets: [VOIDED],
      unvoided_tickets: [NOT_VOIDED],
    });
    // Kept on the booking itself, where a later cancel reads it.
    expect(row.booking_details.voided_tickets).toEqual([VOIDED]);
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('keeps an earlier review flag under the new one rather than overwriting it', async () => {
    const earlier = {
      reason: 'GDS cancellation failed; refund withheld to avoid paying out against a live booking',
      detail: `voided ${VOIDED} but not ${NOT_VOIDED} - the PNR is left live`,
      voided_tickets: [VOIDED],
      unvoided_tickets: [NOT_VOIDED],
      at: '2026-09-21T09:00:00.000Z',
    };
    table = fakeBookingsTable([flight({ voided_tickets: [VOIDED], needs_review: earlier })], { tables: { price_settings: [], payments: [] } });
    cancelFlightOrder.mockRejectedValueOnce(Object.assign(new Error('PNR_Cancel refused'), { technicalError: '8111 SIMULTANEOUS CHANGES' }));

    await cancel();

    const review = table.row(REF).booking_details.needs_review;
    expect(review.detail).toBe('8111 SIMULTANEOUS CHANGES');
    expect(review.previous).toMatchObject({ detail: earlier.detail, voided_tickets: [VOIDED] });
    expect(table.row(REF).booking_details.voided_tickets).toEqual([VOIDED]);
  });
});

describe('a later cancel of a booking whose tickets were partly voided', () => {
  const earlier = {
    reason: 'GDS cancellation failed; refund withheld to avoid paying out against a live booking',
    detail: `voided ${VOIDED} but not ${NOT_VOIDED} - the PNR is left live`,
    voided_tickets: [VOIDED],
    unvoided_tickets: [NOT_VOIDED],
    at: '2026-09-21T09:00:00.000Z',
  };

  // The next day both tickets are past the void window, so the chain lists
  // both - the voided one included - as tickets to claim from the airline.
  it('does not ask for an airline refund of a ticket already voided', async () => {
    table = fakeBookingsTable([flight({ voided_tickets: [VOIDED], needs_review: earlier })], { tables: { price_settings: [], payments: [] } });
    cancelFlightOrder.mockResolvedValueOnce({ success: true, hadTickets: true, voided: false, requiresAirlineRefund: [VOIDED, NOT_VOIDED] });

    const res = await cancel();

    expect(res.body.cancellation.requiresAirlineRefund).toEqual([NOT_VOIDED]);
    const review = table.row(REF).booking_details.needs_review;
    expect(review.tickets).toEqual([NOT_VOIDED]);
    expect(review.source).toBe('cancellation');
    // The detail that explains it is still there.
    expect(review.previous).toMatchObject({ detail: earlier.detail });
    expect(review.voided_tickets).toEqual([VOIDED]);
  });

  it('treats a booking whose every ticket was voided earlier as voided, not as a ticket nobody accounted for', async () => {
    table = fakeBookingsTable([flight({ voided_tickets: [VOIDED, NOT_VOIDED] })], { tables: { price_settings: [], payments: [] } });
    cancelFlightOrder.mockResolvedValueOnce({ success: true, hadTickets: true, voided: false, requiresAirlineRefund: [VOIDED, NOT_VOIDED] });

    const res = await cancel();

    expect(res.body.cancellation.requiresAirlineRefund).toEqual([]);
    expect(res.body.cancellation.ticketsVoided).toBe(true);
    expect(res.body.cancellation.paymentAction).not.toBe('REFUND_UNDER_REVIEW');
    expect(table.row(REF).booking_details.needs_review?.tickets).toBeUndefined();
  });
});
