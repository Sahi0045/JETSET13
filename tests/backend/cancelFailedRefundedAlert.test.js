import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * The cancel-failed Slack section, for a booking refunded before its cancel
 * was refused.
 *
 * The Payments tab refunds a payment and writes payment_status alone, so a
 * held PNR can read refunded while its PNR is live. A cancel the airline then
 * refuses is announced - cancellation flags are selected before the refunded
 * check - and the section said "no refund was made ... Do NOT refund until it
 * is cancelled" of every row, without reading payment_status. Staff were told
 * the money had not moved, of money already returned.
 *
 * Driven through the real cancel handler (the provider refuses; ARC shows the
 * payment and its refund), then the real alarm.
 */

const REF = 'FLTCFR1';
const OTHER = 'FLTCFR2';
const HEADING = ':x: *1 cancellation the airline did not carry out*';
const PAID_TEXT = 'The customer asked to cancel and was told our team would complete it. '
  + 'The airline did not cancel the PNR, so it is still live, and no refund was made. '
  + 'Cancel the PNR with the airline first. Do NOT refund until it is cancelled: '
  + 'a refund against a live PNR pays out for flights the customer still holds. '
  + 'A traveller whose ticket was voided cannot fly on it.';

const heldPnr = (reference, paymentStatus) => ({
  id: `bk-${reference}`,
  booking_reference: reference,
  travel_type: 'flight',
  status: 'pending_ticketing',
  payment_status: paymentStatus,
  total_amount: 291,
  user_id: null,
  created_at: '2026-09-21T08:00:00Z',
  booking_details: {
    pnr: `P${reference.slice(-5)}`,
    order_id: reference,
    customer_email: 'traveler@example.com',
    refundable: true,
    gds: { ticketed: false },
    tickets: [],
    needs_review: { reason: 'chain failed after commit at issueTicket', ticketed: false, at: '2026-09-21T08:01:00Z', alerted_at: '2026-09-21T08:15:00Z' },
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

const payment = { result: 'SUCCESS', transaction: { id: '1', type: 'PAYMENT', amount: 291, currency: 'USD' } };
const refund = (amount) => ({ result: 'SUCCESS', transaction: { id: '2', type: 'REFUND', amount, currency: 'USD' } });

/** The refused cancel on each row, then the alarm's message for all of them. */
const alarmAfterRefusedCancels = async (rows, arcTransactions) => {
  table = fakeBookingsTable(rows, { tables: { price_settings: [], payments: [] } });
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  for (const row of rows) {
    axios.get.mockResolvedValueOnce({ status: 200, data: { status: 'CAPTURED', transaction: arcTransactions[row.booking_reference] } });
    cancelFlightOrder.mockRejectedValueOnce(Object.assign(new Error('PNR_Cancel refused'), { technicalError: '999 CANCEL NOT ALLOWED' }));
    const res = createResponse();
    await handleCancelBookingAction(createRequest({ method: 'POST', body: { bookingReference: row.booking_reference, reason: 'Change of plans', email: 'traveler@example.com' } }), res);
    expect(res.statusCode).toBe(502);
  }
  expect(axios.put).not.toHaveBeenCalled();
  const { buildMessage, selectUnannounced } = await import('../../backend/jobs/needsReviewAlert.job.js');
  const after = rows.map((row) => table.row(row.booking_reference));
  expect(after.map((row) => row.payment_status)).toEqual(rows.map((row) => row.payment_status));
  return buildMessage(selectUnannounced(after));
};

beforeEach(() => {
  vi.resetModules();
  cancelFlightOrder.mockReset();
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockReset();
});

describe('a refused cancel on a booking already refunded', () => {
  it('is not announced as "no refund was made", nor with "Do NOT refund until it is cancelled"', async () => {
    const text = await alarmAfterRefusedCancels([heldPnr(REF, 'refunded')], { [REF]: [payment, refund(291)] });

    expect(text).not.toMatch(/no refund was made/);
    expect(text).not.toMatch(/Do NOT refund until it is cancelled/);
    expect(text).toMatch(/already been refunded/);
    expect(text).toMatch(/Do NOT refund it again/);
    expect(text).toContain(`*${REF}* — pending_ticketing/refunded, 291 USD`);
  });

  it('refunded in part: the same, and the line says partially_refunded', async () => {
    const text = await alarmAfterRefusedCancels([heldPnr(REF, 'partially_refunded')], { [REF]: [payment, refund(100)] });

    expect(text).not.toMatch(/no refund was made|Do NOT refund until it is cancelled/);
    expect(text).toMatch(/in full or in part/);
    expect(text).toContain(`*${REF}* — pending_ticketing/partially_refunded, 291 USD`);
  });

  it('beside a paid one, each is under the heading that is true of it', async () => {
    const text = await alarmAfterRefusedCancels(
      [heldPnr(REF, 'refunded'), heldPnr(OTHER, 'paid')],
      { [REF]: [payment, refund(291)], [OTHER]: [payment] },
    );
    const [paidSection, refundedSection] = text.split(':x: *').slice(1);

    expect(paidSection).toContain('no refund was made');
    expect(paidSection).toContain(`*${OTHER}* — pending_ticketing/paid`);
    expect(paidSection).not.toContain(REF);
    expect(refundedSection).toContain('already been refunded');
    expect(refundedSection).toContain(`*${REF}* — pending_ticketing/refunded`);
    expect(refundedSection).not.toContain(OTHER);
  });
});

// Fence: a paid booking keeps today's section, word for word.
describe('a refused cancel on a booking still paid', () => {
  it('keeps "no refund was made" and "Do NOT refund until it is cancelled"', async () => {
    const text = await alarmAfterRefusedCancels([heldPnr(OTHER, 'paid')], { [OTHER]: [payment] });

    expect(text.startsWith([HEADING, PAID_TEXT, ''].join('\n\n'))).toBe(true);
    expect(text).not.toMatch(/already been refunded/);
  });
});
