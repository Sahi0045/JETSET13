import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * The cancel-failed Slack line, two refused cancels on: "ticketed: NO" beside
 * a ticket it names as live.
 *
 * The line lists every flag's unvoided tickets under "not recorded as voided",
 * but decided "ticketed: yes/NO" from the LATEST flag's list alone. The row
 * never recorded its ticket; day 1's refused void named it still live, and
 * day 2's refused PNR_Cancel carried no lists. One line then said
 * "ticketed: NO ... not recorded as voided: B".
 *
 * Driven through the real cancel handler twice, then the real alarm.
 */

const REF = 'FLTTE1';
const B = '220-7491174933';

// No record of the ticket on the row: the chain flagged it unticketed, and the
// airline issued B anyway (by hand, before ticket sync recorded it).
const row = () => ({
  id: 'bk-te1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending_ticketing',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  created_at: '2026-09-20T08:00:00Z',
  booking_details: {
    pnr: 'ABC123',
    order_id: REF,
    customer_email: 'traveler@example.com',
    refundable: true,
    gds: { ticketed: false },
    tickets: [],
    needs_review: { reason: 'chain failed after commit at issueTicket', ticketed: false, at: '2026-09-20T08:05:00Z', alerted_at: '2026-09-20T08:15:00Z' },
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

// Day 1: the same-day void of B refused, and the reply numbered it.
const voidRefusedNumbered = () => Object.assign(new Error('We could not void the ticket'), {
  name: 'BookingChainError', step: 'voidTicket', pnr: 'ABC123', committed: true, ticketed: true, code: 502,
  technicalError: '5458 VOID NOT ALLOWED', voidedTickets: [], unvoidedTickets: [B],
});
// Day 2: B is past its void window, so no void runs; PNR_Cancel is refused.
const cancelRefusedNoLists = () => Object.assign(new Error('PNR_Cancel refused'), { technicalError: '999 CANCEL NOT ALLOWED' });

const cancel = async () => {
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const res = createResponse();
  await handleCancelBookingAction(createRequest({ method: 'POST', body: { bookingReference: REF, reason: 'Change of plans', email: 'traveler@example.com' } }), res);
  expect(res.statusCode).toBe(502);
};

const slackLine = async () => {
  const { buildMessage, selectUnannounced } = await import('../../backend/jobs/needsReviewAlert.job.js');
  const selected = selectUnannounced([table.row(REF)]);
  expect(selected).toHaveLength(1);
  return buildMessage(selected).split('\n').find((line) => line.startsWith('PNR ABC123'));
};

beforeEach(() => {
  vi.resetModules();
  cancelFlightOrder.mockReset();
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockReset();
  axios.get.mockResolvedValue({
    status: 200,
    data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: '1', type: 'PAYMENT', amount: 291, currency: 'USD' } }] },
  });
});

describe('a ticket an earlier refused cancel named as live', () => {
  it('keeps the booking "ticketed: yes" after a later refused cancel with no lists', async () => {
    table = fakeBookingsTable([row()], { tables: { price_settings: [], payments: [] } });
    cancelFlightOrder.mockRejectedValueOnce(voidRefusedNumbered());
    await cancel();
    cancelFlightOrder.mockRejectedValueOnce(cancelRefusedNoLists());
    await cancel();

    expect(await slackLine()).toBe(`PNR ABC123 · ticketed: yes · tickets voided: none recorded · not recorded as voided: ${B}`);
    expect(axios.put).not.toHaveBeenCalled();
  });
});

// Fence: the lines next to it are unchanged.
describe('the lines next to it', () => {
  it('day 1 alone: ticketed, nothing voided, B still live', async () => {
    table = fakeBookingsTable([row()], { tables: { price_settings: [], payments: [] } });
    cancelFlightOrder.mockRejectedValueOnce(voidRefusedNumbered());
    await cancel();

    expect(await slackLine()).toBe(`PNR ABC123 · ticketed: yes · tickets voided: none · still live: ${B}`);
  });

  it('two refused cancels on a booking no record calls ticketed: "ticketed: NO · no tickets issued"', async () => {
    table = fakeBookingsTable([row()], { tables: { price_settings: [], payments: [] } });
    cancelFlightOrder.mockRejectedValueOnce(cancelRefusedNoLists());
    await cancel();
    cancelFlightOrder.mockRejectedValueOnce(cancelRefusedNoLists());
    await cancel();

    expect(await slackLine()).toBe('PNR ABC123 · ticketed: NO · no tickets issued');
  });

  it('an empty unvoided list on an earlier flag is not a ticket', async () => {
    const earlier = row();
    earlier.booking_details.needs_review = {
      reason: 'GDS cancellation failed; refund withheld to avoid paying out against a live booking',
      source: 'cancellation', cancelFailed: true, pnr: 'ABC123', at: '2026-09-21T08:00:00Z',
      detail: 'x', voided_tickets: [], unvoided_tickets: [],
      previous: earlier.booking_details.needs_review,
    };
    table = fakeBookingsTable([earlier], { tables: { price_settings: [], payments: [] } });
    cancelFlightOrder.mockRejectedValueOnce(cancelRefusedNoLists());
    await cancel();

    expect(await slackLine()).toBe('PNR ABC123 · ticketed: NO · no tickets issued');
  });
});
