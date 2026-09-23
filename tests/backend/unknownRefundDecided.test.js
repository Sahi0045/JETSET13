import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { generateAdminCancellationTemplate } from '../../backend/services/email/templates.js';
import { refundOwedOf } from '../../shared/reviewQueue.js';

/**
 * A cancel whose refund was sent to ARC Pay and never answered
 * (REFUND_UNDER_REVIEW with reversalOutcomeUnknown), on a booking whose
 * tickets were voided the same day: the cancel decided 241 goes back and the
 * 50 fee is kept, and recorded cancellationFee 50.
 *
 * The office email said to check ARC Pay, then "Refund only what it still
 * holds", and named no fee - and if the refund never landed ARC holds 291. The
 * desk's Finish refund filled in the whole 291 too. So the fee went back to the
 * card on the one path where nobody knew what had happened.
 *
 * Driven through the real cancel; the rows read are the ones it writes.
 */

const booking = () => ({
  id: 'uuid-1',
  booking_reference: 'FLT123',
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 291,
  created_at: new Date().toISOString(),
  booking_details: { pnr: 'ABC123', order_id: 'FLT123', customer_email: 'traveler@example.com' },
  user_id: null,
});

const supabaseFor = (row) => {
  const updates = [];
  const chain = () => {
    const c = {
      select: vi.fn(() => c), insert: vi.fn(() => c), eq: vi.fn(() => c), is: vi.fn(() => c),
      neq: vi.fn(() => c), or: vi.fn(() => c), filter: vi.fn(() => c), order: vi.fn(() => c), limit: vi.fn(() => c),
      update: vi.fn((payload) => { updates.push(payload); return c; }),
      single: vi.fn().mockResolvedValue({ data: row, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: (resolve) => resolve({ data: [row], error: null }),
    };
    return c;
  };
  return { client: { from: vi.fn(() => chain()) }, updates };
};

let database = supabaseFor(booking());
const cancelFlightOrder = vi.fn();
const sendCancellationNotificationEmails = vi.fn(async () => ({ success: true }));

vi.mock('../../backend/routes/payment/arcpay.config.js', () => ({
  get supabase() { return database.client; },
  ARC_PAY_CONFIG: { BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT' },
  getArcPayAuthConfig: () => ({ headers: {} }),
}));
vi.mock('../../backend/services/flightProvider.js', () => ({
  default: { cancelFlightOrder: (...args) => cancelFlightOrder(...args) },
  providerStatus: () => ({ enabled: true, bookingEnabled: true }),
}));
vi.mock('../../backend/services/emailService.js', () => ({
  sendCancellationNotificationEmails: (...args) => sendCancellationNotificationEmails(...args),
}));

const ticketsVoided = { success: true, hadTickets: true, voided: true, requiresAirlineRefund: [] };
const neverTicketed = { success: true, hadTickets: false, voided: false, requiresAirlineRefund: [] };

beforeEach(() => {
  vi.resetModules();
  database = supabaseFor(booking());
  sendCancellationNotificationEmails.mockClear();
  cancelFlightOrder.mockReset();
  cancelFlightOrder.mockResolvedValue(ticketsVoided);
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockReset();
  axios.get.mockResolvedValue({
    status: 200,
    data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 291, currency: 'USD' } }] },
  });
  // The reversal goes out; the socket drops before ARC's answer comes back.
  axios.put.mockRejectedValue(new Error('socket hang up'));
});

const cancel = async () => {
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const res = createResponse();
  await handleCancelBookingAction(createRequest({ method: 'POST', body: { bookingReference: 'FLT123', reason: 'test', email: 'traveler@example.com' } }), res);
  return res;
};

/** The row as the cancel left it. */
const rowAfterCancel = () => {
  const written = database.updates.find((update) => update.status === 'cancelled');
  return { ...booking(), ...written };
};

/** The email as a person reads it: tags gone, whitespace collapsed. */
const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const officeText = () => textOf(generateAdminCancellationTemplate(sendCancellationNotificationEmails.mock.calls[0][0]));

describe('an unanswered cancel refund that meant to keep a 50 fee', () => {
  it('the office email says what the cancel decided: 241 back, the 50 fee kept', async () => {
    const res = await cancel();
    expect(res.body.cancellation).toMatchObject({ paymentAction: 'REFUND_UNDER_REVIEW', reversalOutcomeUnknown: true, cancellationFee: 50 });

    const text = officeText();
    expect(text, 'the fee the cancel keeps is not named').toMatch(/\$50\.00 cancellation fee/);
    expect(text, 'what the cancel decided goes back is not named').toMatch(/\$241\.00/);
    expect(text, 'told to refund what ARC holds, fee included').not.toMatch(/Refund only what it still holds/);
    // Still an unknown outcome, not a refund that was not made.
    expect(text).toMatch(/Do not refund by hand yet/);
    expect(text).not.toMatch(/retained/i);
    expect(text).not.toMatch(/To refund/);
    expect(text).not.toMatch(/\$0\.00/);
  });

  it('the desk offers what the cancel decided, not the whole payment', async () => {
    await cancel();
    expect(refundOwedOf(rowAfterCancel())).toMatchObject({ owed: 241, paid: 291, fee: 50 });
  });

  it('the Slack alarm names what the cancel decided beside "check ARC Pay"', async () => {
    await cancel();
    const { buildMessage } = await import('../../backend/jobs/paymentFailureAlert.job.js');
    const message = buildMessage([rowAfterCancel()]);
    expect(message).toMatch(/may or may not have gone through/);
    expect(message).toMatch(/241\.00 USD owed \(291\.00 paid less the 50\.00 cancellation fee the cancel kept\)/);
    expect(message).not.toMatch(/Refund by hand only what it still holds/);
  });
});

describe('beside it', () => {
  it('an unanswered reversal of the whole payment: the office is told the whole payment', async () => {
    cancelFlightOrder.mockResolvedValue(neverTicketed);
    const res = await cancel();
    expect(res.body.cancellation).toMatchObject({ paymentAction: 'REFUND_UNDER_REVIEW', reversalOutcomeUnknown: true, cancellationFee: 0 });

    const text = officeText();
    expect(text).toMatch(/whole payment, \$291\.00/);
    expect(text).not.toMatch(/cancellation fee/);
    expect(refundOwedOf(rowAfterCancel())).toMatchObject({ owed: 291, fee: 0 });
  });

  it('a refund held on purpose has no decided amount', () => {
    const held = {
      status: 'cancelled', payment_status: 'paid', total_amount: 291,
      booking_details: { arc_captured_amount: 291, cancellation: { paymentAction: 'REFUND_UNDER_REVIEW', refundAmount: 0, cancellationFee: 0 } },
    };
    expect(refundOwedOf(held)).toBeNull();
  });

  it('an unanswered refund recorded before the cancel said so is not given one', () => {
    // Its outcome is known only from the flag's reason (paymentFailureAlert
    // reads it there); nothing on the record says an amount was decided.
    const legacy = {
      status: 'cancelled', payment_status: 'paid', total_amount: 291,
      booking_details: {
        arc_captured_amount: 291,
        cancellation: { paymentAction: 'REFUND_UNDER_REVIEW', refundAmount: 0, cancellationFee: 50 },
        needs_review: { reason: 'refund request did not complete: socket hang up', source: 'cancellation' },
      },
    };
    expect(refundOwedOf(legacy)).toBeNull();
  });

  it('the office email for a refund held on purpose is unchanged', () => {
    const text = textOf(generateAdminCancellationTemplate({
      bookingReference: 'FLT123', customerName: 'Jane', currency: 'USD', paymentAction: 'REFUND_UNDER_REVIEW', refundAmount: 0, cancellationFee: 0,
    }));
    expect(text).toMatch(/NOT PROCESSED \(REFUND_UNDER_REVIEW\)/);
    expect(text).not.toMatch(/meant to return/);
  });
});
