import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * The booking reads tell the page which tickets a cancel voided.
 *
 * A cancel that voids tickets and then has PNR_Cancel refused leaves the
 * booking's ticket list as it was, and records the void on
 * booking_details.voided_tickets and on its flag. toClientBooking sent the
 * list and not the void, so the pages could only call every recorded ticket
 * issued. It now sends `voided_tickets`: the booking's own list plus every
 * flag's, down the whole chain (a later flag, resolved or not, does not
 * un-void a ticket).
 *
 * Driven through the real cancel handler (only the provider and ARC are
 * stubbed), then the real projection.
 */

const REF = 'FLTVS1';
const A = '125-2412345671';
const B = '125-2412345672';

const row = (details = {}) => ({
  id: 'bk-vs1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 582,
  user_id: null,
  created_at: '2026-09-21T08:00:00Z',
  booking_details: {
    pnr: 'VNUM11',
    order_id: REF,
    customer_email: 'traveler@example.com',
    refundable: true,
    gds: { ticketed: true },
    tickets: [{ number: A, travelerId: '1' }, { number: B, travelerId: '2' }],
    ...details,
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

const refusedAfter = (voidedTickets, unvoidedTickets) => Object.assign(new Error('PNR_Cancel refused'), {
  name: 'BookingChainError', step: 'cancel', pnr: 'VNUM11', committed: true, code: 502,
  technicalError: '999 CANCEL NOT ALLOWED', voidedTickets, unvoidedTickets,
});

const cancelRefused = async (bookingRow, error) => {
  table = fakeBookingsTable([bookingRow], { tables: { price_settings: [], payments: [] } });
  cancelFlightOrder.mockRejectedValueOnce(error);
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const res = createResponse();
  await handleCancelBookingAction(createRequest({ method: 'POST', body: { bookingReference: REF, reason: 'Change of plans', email: 'traveler@example.com' } }), res);
  expect(res.statusCode).toBe(502);
  return table.row(REF);
};

const sent = async (bookingRow) => {
  const { toClientBooking } = await import('../../backend/routes/flight.routes.js');
  return toClientBooking(bookingRow);
};

beforeEach(() => {
  vi.resetModules();
  cancelFlightOrder.mockReset();
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockReset();
  axios.get.mockResolvedValue({
    status: 200,
    data: { status: 'CAPTURED', amount: 582, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: '1', type: 'PAYMENT', amount: 582, currency: 'USD' } }] },
  });
});

describe('a cancel that voided the recorded tickets, then was refused', () => {
  it('sends the voided numbers beside the ticket list', async () => {
    const after = await cancelRefused(row(), refusedAfter([A, B], []));
    const booking = await sent(after);

    expect(booking.voided_tickets).toEqual([A, B]);
    // The list itself is sent as before.
    expect(booking.tickets.map((t) => t.number)).toEqual([A, B]);
  });

  it('adds what every flag in the chain recorded, resolved or not, once each', async () => {
    const booking = await sent(row({
      voided_tickets: [A],
      needs_review: {
        reason: 'a later flag', resolved_at: '2026-09-22T09:00:00Z',
        previous: { reason: 'GDS cancellation failed', cancelFailed: true, voided_tickets: ['1252412345671', B], unvoided_tickets: [] },
      },
    }));

    expect(booking.voided_tickets).toEqual([A, B]);
  });
});

/**
 * Fence: a booking nobody voided is sent as today, with an empty list.
 */
describe('fence: bookings with nothing voided', () => {
  it('a ticketed booking: the same tickets and flag state, and no voided number', async () => {
    const booking = await sent(row());

    expect(booking.voided_tickets ?? []).toEqual([]);
    expect(booking.tickets.map((t) => t.number)).toEqual([A, B]);
    expect(booking.needs_review).toBeNull();
    expect(booking.gds).toEqual({ ticketed: true });
  });

  it('a refused cancel that voided nothing: its flag is sent as before, and nothing is voided', async () => {
    const after = await cancelRefused(row(), Object.assign(new Error('PNR_Cancel refused'), { technicalError: '999 CANCEL NOT ALLOWED' }));
    const booking = await sent(after);

    expect(booking.voided_tickets ?? []).toEqual([]);
    expect(booking.needs_review).toEqual({
      reason: 'GDS cancellation failed; refund withheld to avoid paying out against a live booking',
      no_confirmed_seat: false,
      ticket_numbers_missing: false,
      commit_unknown: false,
      unrecorded_cancellation: false,
    });
  });
});
