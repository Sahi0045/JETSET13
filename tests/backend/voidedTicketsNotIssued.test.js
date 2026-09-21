import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * A ticketed booking whose numbers never came back, whose same-day cancel
 * voided every ticket and then had PNR_Cancel refused.
 *
 * The numbers-missing flag is read past later flags because an issued ticket
 * stays issued - but a void un-issues it. The cancel handler records both
 * voided tickets on the booking and on its flag, and the booking reads sent
 * the page `ticket_numbers_missing: true` all the same: My Trips said "Your
 * ticket has been issued", Manage Booking offered a document saying so, and
 * both tickets were void.
 *
 * Driven through the real cancel handler (only the provider and ARC are
 * stubbed), then the real projection and the real alarm.
 */

const REF = 'FLTVOID1';
const A = '125-2412345671';
const B = '125-2412345672';
const REFUSED = 'GDS cancellation failed; refund withheld to avoid paying out against a live booking';
const NUMBERS_MISSING = { reason: 'ticket_numbers_not_retrieved', ticketed: true, expected: 2, got: 0, at: '2026-09-21T08:05:00Z', alerted_at: '2026-09-21T08:15:00Z' };

const row = (needsReview = NUMBERS_MISSING, details = {}) => ({
  id: 'bk-void1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 582,
  user_id: null,
  created_at: '2026-09-21T08:00:00Z',
  booking_details: {
    pnr: 'VOID11',
    order_id: REF,
    customer_email: 'traveler@example.com',
    refundable: true,
    gds: { ticketed: true },
    tickets: [],
    needs_review: needsReview,
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

/** What the chain throws when the void went through and PNR_Cancel was refused. */
const refusedAfter = (voidedTickets, unvoidedTickets) => Object.assign(new Error('PNR_Cancel refused'), {
  name: 'BookingChainError', step: 'cancel', pnr: 'VOID11', committed: true, code: 502,
  technicalError: '8111 CANCEL NOT ALLOWED', voidedTickets, unvoidedTickets,
});

const cancelRefused = async (bookingRow, error) => {
  table = fakeBookingsTable([bookingRow], { tables: { price_settings: [], payments: [] } });
  cancelFlightOrder.mockRejectedValueOnce(error);
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const res = createResponse();
  await handleCancelBookingAction(createRequest({ method: 'POST', body: { bookingReference: REF, reason: 'Change of plans', email: 'traveler@example.com' } }), res);
  expect(res.statusCode).toBe(502);
  expect(axios.put).not.toHaveBeenCalled();
  return table.row(REF);
};

const projection = async (bookingRow) => {
  const { toClientBooking } = await import('../../backend/routes/flight.routes.js');
  return toClientBooking(bookingRow).needs_review;
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
    data: { status: 'CAPTURED', amount: 582, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: '1', type: 'PAYMENT', amount: 582, currency: 'USD' } }] },
  });
});

describe('a numbers-missing booking whose cancel voided every ticket, then PNR_Cancel was refused', () => {
  it('is no longer sent to the page as holding an issued ticket', async () => {
    const after = await cancelRefused(row(), refusedAfter([A, B], []));

    // What the cancel recorded: both void, on the booking and on its flag.
    expect(after.booking_details.voided_tickets).toEqual([A, B]);
    expect(after.booking_details.needs_review).toMatchObject({ cancelFailed: true, voided_tickets: [A, B], unvoided_tickets: [], previous: { reason: NUMBERS_MISSING.reason } });

    expect(await projection(after)).toEqual({ reason: REFUSED, no_confirmed_seat: false, ticket_numbers_missing: false });
  });

  it('is read the same way once a person resolved the refused cancel', async () => {
    const after = await cancelRefused(row(), refusedAfter([A, B], []));
    after.booking_details.needs_review.resolved_at = '2026-09-22T09:00:00Z';

    expect((await projection(after)).ticket_numbers_missing).toBe(false);
  });
});

// Fence: the states next to it keep today's answers.
describe('the states next to it', () => {
  it('a refused cancel that voided nothing: the ticket is still issued, number pending', async () => {
    const after = await cancelRefused(row(), Object.assign(new Error('PNR_Cancel refused'), { technicalError: '999 CANCEL NOT ALLOWED' }));

    expect((await projection(after)).ticket_numbers_missing).toBe(true);
  });

  it('a void of one ticket of two: the other is still issued, number pending', async () => {
    const after = await cancelRefused(row(), refusedAfter([A], [B]));

    expect((await projection(after)).ticket_numbers_missing).toBe(true);
  });

  it('the flag on top, no cancel: issued, number pending', async () => {
    expect((await projection(row())).ticket_numbers_missing).toBe(true);
  });

  it('a booking with no numbers-missing flag anywhere is not called issued', async () => {
    expect((await projection(row({ reason: 'chain failed after commit at issueTicket', ticketed: false }))).ticket_numbers_missing).toBe(false);
  });

  it('staff are told what the airline record holds, as before: ticketed, both voided, none live', async () => {
    const after = await cancelRefused(row(), refusedAfter([A, B], []));
    const { buildMessage, selectUnannounced } = await import('../../backend/jobs/needsReviewAlert.job.js');
    const line = buildMessage(selectUnannounced([after])).split('\n').find((text) => text.startsWith('PNR VOID11'));

    expect(line).toBe(`PNR VOID11 · ticketed: yes · tickets voided: ${A}, ${B} · still live: none · not every ticket number is recorded: read the FA lines`);
  });

  it('the refund decision still counts the ticket as issued (money path unchanged)', async () => {
    const after = await cancelRefused(row(), refusedAfter([A, B], []));
    const { ticketNumbersMissingOf } = await import('../../shared/reviewQueue.js');

    expect(ticketNumbersMissingOf(after)).toMatchObject({ reason: NUMBERS_MISSING.reason });
  });
});
