import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * The cancel-failed Slack line on a ticketed booking whose ticket numbers were
 * never read back.
 *
 * With no number on the booking and none in the refused cancel's lists, the
 * line said "no tickets issued" - under "Cancel the PNR with the airline
 * first". It never looked at gds.ticketed or the chain's numbers-missing flag,
 * and it had dropped the "ticketed: yes/NO" the other sections show. Staff told
 * there is no ticket could cancel the itinerary and refund in full over live
 * tickets.
 */

const REF = 'FLTTL1';

const flight = (details) => ({
  id: 'bk-tl1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 582,
  user_id: null,
  created_at: '2026-09-20T08:00:00Z',
  booking_details: {
    pnr: 'ABC123',
    order_id: REF,
    customer_email: 'traveler@example.com',
    tickets: [],
    ...details,
  },
});
const NUMBERS_MISSING = { reason: 'ticket_numbers_not_retrieved', ticketed: true, expected: 2, got: 0, at: '2026-09-20T08:05:00Z', alerted_at: '2026-09-20T08:15:00Z' };

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

// A void refused with no ticket lists: what the chain throws for a void that
// failed "for now" twice, a hard void fault, or an undated ticket.
const voidFailed = () => Object.assign(new Error('We could not void the ticket'), {
  name: 'BookingChainError', step: 'voidTicket', pnr: 'ABC123', committed: true, ticketed: true, code: 502,
  technicalError: '1 PROCESSING ERROR - RETRY',
});

const slackLineAfterRefusedCancel = async (row) => {
  table = fakeBookingsTable([row], { tables: { price_settings: [], payments: [] } });
  cancelFlightOrder.mockRejectedValueOnce(voidFailed());
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const res = createResponse();
  await handleCancelBookingAction(createRequest({ method: 'POST', body: { bookingReference: REF, reason: 'Change of plans', email: 'traveler@example.com' } }), res);
  expect(res.statusCode).toBe(502);

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
    data: { status: 'CAPTURED', amount: 582, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: '1', type: 'PAYMENT', amount: 582, currency: 'USD' } }] },
  });
});

describe('the cancel-failed Slack line for a ticketed booking with no ticket numbers', () => {
  it('says it is ticketed, and never "no tickets issued"', async () => {
    const line = await slackLineAfterRefusedCancel(flight({ gds: { ticketed: true }, needs_review: NUMBERS_MISSING }));

    expect(line).toContain('ticketed: yes');
    expect(line).not.toMatch(/no tickets issued/);
    expect(line).toContain('ticket numbers not recorded: read the FA lines');
  });

  it('knows it from the numbers-missing flag under the refused cancel alone', async () => {
    const line = await slackLineAfterRefusedCancel(flight({ gds: {}, needs_review: NUMBERS_MISSING }));

    expect(line).toContain('ticketed: yes');
    expect(line).not.toMatch(/no tickets issued/);
  });

  it('still says "no tickets issued" of a booking with no ticket by any record', async () => {
    const line = await slackLineAfterRefusedCancel(flight({ gds: { ticketed: false } }));

    expect(line).toContain('ticketed: NO · no tickets issued');
  });
});
