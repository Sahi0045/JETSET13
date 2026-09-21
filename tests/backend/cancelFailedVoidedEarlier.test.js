import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * The cancel-failed Slack line on a later day's refused cancel.
 *
 * The cancel handler adds each attempt's voided tickets to
 * booking_details.voided_tickets and keeps the earlier flag, with its lists,
 * under the new one. The alarm read the latest flag's lists only - and a later
 * refused cancel that voided nothing writes a flag with none. So Slack said
 * "tickets voided: none recorded · on the booking: A, B" of a ticket the
 * booking records as void: staff could claim its value from the airline, or
 * under-refund a fare whose tickets were void.
 *
 * Driven through the real cancel handler (the flight provider throws what the
 * booking chain throws) and the real alarm selection and text.
 */

const REF = 'FLTVE1';
const A = '125-2412345671';
const B = '125-2412345672';

const flight = () => ({
  id: 'bk-ve1',
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
    refundable: true,
    gds: { ticketed: true },
    tickets: [{ number: A }, { number: B }],
  },
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

// What the booking chain throws.
const chainError = (props) => Object.assign(new Error(props.error || 'cancel failed'), {
  name: 'BookingChainError', pnr: 'ABC123', committed: true, ticketed: true, code: 502, ...props,
});
// Day 1: the void went through for A and was refused for B.
const partlyVoided = () => chainError({
  step: 'voidTicket',
  error: 'We could not void the ticket',
  technicalError: `5458 VOID NOT ALLOWED; voided ${A} but not ${B} - the PNR is left live`,
  voidedTickets: [A],
  unvoidedTickets: [B],
});
// Day 1: both voided, then PNR_Cancel refused.
const voidedThenRefused = () => chainError({
  step: 'cancel',
  technicalError: `999 CANCEL NOT ALLOWED; tickets voided ${A}, ${B} - the PNR is left live`,
  voidedTickets: [A, B],
  unvoidedTickets: [],
});
// Day 2: both past the void window, so no void runs, and PNR_Cancel is refused again.
const refusedAgain = () => chainError({ step: 'cancel', technicalError: '999 CANCEL NOT ALLOWED' });

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
    data: { status: 'CAPTURED', amount: 582, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: '1', type: 'PAYMENT', amount: 582, currency: 'USD' } }] },
  });
  table = fakeBookingsTable([flight()], { tables: { price_settings: [], payments: [] } });
});

describe('the cancel-failed Slack line after a later day\'s refused cancel', () => {
  it('day 1 partial void, day 2 refused: A is named voided and B not voided, never A as live', async () => {
    cancelFlightOrder.mockRejectedValueOnce(partlyVoided()).mockRejectedValueOnce(refusedAgain());

    expect((await cancel()).statusCode).toBe(502);
    expect((await cancel()).statusCode).toBe(502);

    // The day-2 flag names no ticket; the booking records A as void.
    const row = table.row(REF);
    expect(row.booking_details.needs_review.voided_tickets).toBeUndefined();
    expect(row.booking_details.voided_tickets).toEqual([A]);

    const line = await slackLine();
    expect(line).toContain(`tickets voided: ${A}`);
    expect(line).toContain(`not recorded as voided: ${B}`);
    expect(line).not.toMatch(/voided: none recorded|on the booking/);
    expect(line.slice(line.indexOf('not recorded as voided'))).not.toContain(A);
  });

  it('both voided on day 1, refused on both days: both named voided, none left', async () => {
    cancelFlightOrder.mockRejectedValueOnce(voidedThenRefused()).mockRejectedValueOnce(refusedAgain());

    await cancel();
    await cancel();

    const line = await slackLine();
    expect(line).toContain(`tickets voided: ${A}, ${B} · not recorded as voided: none`);
    expect(axios.put).not.toHaveBeenCalled();
  });
});
