import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { buildMessage, selectUnannounced } from '../../backend/jobs/needsReviewAlert.job.js';
import { attentionLabel, attentionOf } from '../../shared/reviewQueue.js';

/**
 * A cancel the airline refused, on a ticketed booking.
 *
 * The cancel handler leaves the booking live and flags it, and tells the
 * customer "Our team has been alerted and will complete it". The flag carried
 * no source and no marker, and the booking still read ticketed, so the Slack
 * alarm skipped it ("ticketed, so done") and so did the desk's Needs-attention
 * list. That includes a void that went through for one ticket and not the
 * other: one traveller's ticket void, the PNR live, and nobody told.
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

const tables = { tables: { price_settings: [], payments: [] } };

describe('a cancel the airline refused, on a ticketed booking', () => {
  it('flags it as a failed cancellation, and the alarm and the desk list both find it (partial void)', async () => {
    table = fakeBookingsTable([flight()], tables);
    cancelFlightOrder.mockRejectedValueOnce(partlyVoided());

    const res = await cancel();

    expect(res.statusCode).toBe(502);
    expect(res.body.error).toMatch(/Our team has been alerted/);
    const row = table.row(REF);
    expect(row.status).toBe('confirmed');
    expect(row.booking_details.needs_review).toMatchObject({
      source: 'cancellation',
      cancelFailed: true,
      voided_tickets: [VOIDED],
      unvoided_tickets: [NOT_VOIDED],
    });
    expect(selectUnannounced([row])).toHaveLength(1);
    const attention = attentionOf(row);
    expect(attention).toMatchObject({ kind: 'cancel_failed' });
    expect(attentionLabel(attention)).toBe('Cancel failed at the airline');
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('is found when nothing was voided too', async () => {
    table = fakeBookingsTable([flight()], tables);
    cancelFlightOrder.mockRejectedValueOnce(Object.assign(new Error('PNR_Cancel refused'), { technicalError: '999 CANCEL NOT ALLOWED' }));

    await cancel();

    const row = table.row(REF);
    expect(row.booking_details.needs_review).toMatchObject({ source: 'cancellation', cancelFailed: true, detail: '999 CANCEL NOT ALLOWED' });
    expect(selectUnannounced([row])).toHaveLength(1);
    expect(attentionOf(row)).toMatchObject({ kind: 'cancel_failed' });
  });

  it('on an unticketed booking goes under its own heading, not "ticket it, or refund it"', async () => {
    table = fakeBookingsTable([flight({ gds: { ticketed: false }, tickets: [] })], tables);
    cancelFlightOrder.mockRejectedValueOnce(Object.assign(new Error('PNR_Cancel refused'), { technicalError: '999 CANCEL NOT ALLOWED' }));

    await cancel();

    const text = buildMessage(selectUnannounced([table.row(REF)]));
    expect(text).toMatch(/cancellation the airline did not carry out/);
    expect(text).not.toMatch(/paid but not ticketed|ticket it, or refund it/);
  });
});

describe('the alarm text for a cancel the airline refused', () => {
  const now = new Date('2026-09-22T10:00:00.000Z');
  const flaggedAt = '2026-09-22T07:00:00.000Z';
  const withFlag = (review, details = {}) => flight({
    ...details,
    needs_review: {
      reason: 'GDS cancellation failed; refund withheld to avoid paying out against a live booking',
      source: 'cancellation',
      cancelFailed: true,
      pnr: 'ABC123',
      at: flaggedAt,
      ...review,
    },
  });
  const at = (fn) => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      return fn();
    } finally {
      vi.useRealTimers();
    }
  };

  it('says the PNR is live, which tickets were voided and which are still live, and not to refund yet', () => {
    const text = at(() => buildMessage([withFlag({
      detail: `voided ${VOIDED} but not ${NOT_VOIDED} - the PNR is left live`,
      voided_tickets: [VOIDED],
      unvoided_tickets: [NOT_VOIDED],
    }, { voided_tickets: [VOIDED] })]));

    expect(text).toBe([
      ':x: *1 cancellation the airline did not carry out*',
      'The customer asked to cancel and was told our team would complete it. '
        + 'The airline did not cancel the PNR, so it is still live, and no refund was made. '
        + 'Cancel the PNR with the airline first. Do NOT refund until it is cancelled: '
        + 'a refund against a live PNR pays out for flights the customer still holds. '
        + 'A traveller whose ticket was voided cannot fly on it.',
      '',
      `*${REF}* — confirmed/paid, 582 USD\n`
        + `PNR ABC123 · ticketed: yes · tickets voided: ${VOIDED} · still live: ${NOT_VOIDED}\n`
        + `airline: voided ${VOIDED} but not ${NOT_VOIDED} - the PNR is left live\n`
        + 'flagged 3h ago',
    ].join('\n\n'));
  });

  it('does not guess which tickets are live when the cancel did not say', () => {
    const text = at(() => buildMessage([withFlag({ detail: '999 CANCEL NOT ALLOWED' })]));
    // Not "still live": no record says so. Nor voided: none of the records says that either.
    expect(text).toMatch(new RegExp(`PNR ABC123 · ticketed: yes · tickets voided: none recorded · not recorded as voided: ${VOIDED}, ${NOT_VOIDED}\n`));
  });

  it('says so when the booking has no tickets', () => {
    const text = at(() => buildMessage([withFlag({ detail: '999 CANCEL NOT ALLOWED' }, { gds: { ticketed: false }, tickets: [] })]));
    expect(text).toMatch(/PNR ABC123 · ticketed: NO · no tickets issued\n/);
  });
});

describe('a failed cancel that a later cancel went on to complete', () => {
  it('is off the alarm and the desk list once the booking reads cancelled', () => {
    const row = flight({
      needs_review: {
        reason: 'GDS cancellation failed; refund withheld to avoid paying out against a live booking',
        source: 'cancellation',
        cancelFailed: true,
        at: '2026-09-21T09:00:00.000Z',
      },
    }, { status: 'cancelled', payment_status: 'refunded' });

    expect(selectUnannounced([row])).toHaveLength(0);
    expect(attentionOf(row)).toBeNull();
  });
});
