import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { generateAdminCancellationTemplate, generateCancellationTemplate } from '../../backend/services/email/templates.js';

/**
 * The office's cancellation email for a cancel whose refund was SENT to ARC Pay
 * and never answered (reversalOutcomeUnknown, since the 23 Sep audit).
 *
 * The audit taught Slack (paymentFailureAlert) and the admin toast
 * (adminCancelOutcome) that this is not "no refund was made": refunded again
 * by hand, the customer is paid twice. sendCancellationEmail handed the office
 * email the paymentAction alone, and generateAdminCancellationTemplate read
 * every REFUND_UNDER_REVIEW as a refund that was not processed, with the fee
 * "retained" and nothing "to refund" - the statement the audit removed
 * everywhere else.
 */

const booking = () => ({
  id: 'uuid-1',
  booking_reference: 'FLT123',
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 291,
  booking_details: { pnr: 'ABC123', order_id: 'FLT123', customer_email: 'traveler@example.com' },
  user_id: null,
});

const supabaseFor = (row) => {
  const chain = () => {
    const c = {
      select: vi.fn(() => c), update: vi.fn(() => c), insert: vi.fn(() => c), eq: vi.fn(() => c), is: vi.fn(() => c),
      neq: vi.fn(() => c), or: vi.fn(() => c), filter: vi.fn(() => c), order: vi.fn(() => c), limit: vi.fn(() => c),
      single: vi.fn().mockResolvedValue({ data: row, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: (resolve) => resolve({ data: [row], error: null }),
    };
    return c;
  };
  return { from: vi.fn(() => chain()) };
};

let client = supabaseFor(booking());
const cancelFlightOrder = vi.fn();
const sendCancellationNotificationEmails = vi.fn(async () => ({ success: true }));

vi.mock('../../backend/routes/payment/arcpay.config.js', () => ({
  get supabase() { return client; },
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

beforeEach(() => {
  vi.resetModules();
  client = supabaseFor(booking());
  sendCancellationNotificationEmails.mockClear();
  // Voided the same day: the fee applies, so the cancel sends a REFUND less the fee.
  cancelFlightOrder.mockResolvedValue({ success: true, hadTickets: true, voided: true, requiresAirlineRefund: [] });
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockResolvedValue({
    status: 200,
    data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 291, currency: 'USD' } }] },
  });
  // The REFUND goes out; the socket drops before ARC's answer comes back.
  axios.put.mockRejectedValue(new Error('socket hang up'));
});

const cancel = async () => {
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const res = createResponse();
  await handleCancelBookingAction(createRequest({ method: 'POST', body: { bookingReference: 'FLT123', reason: 'test', email: 'traveler@example.com' } }), res);
  return res;
};

/** The email as a person reads it: tags gone, whitespace collapsed. */
const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

describe('the office email for a refund ARC Pay never answered', () => {
  it('does not tell the office the refund was not processed', async () => {
    const res = await cancel();

    expect(res.body.cancellation).toMatchObject({ paymentAction: 'REFUND_UNDER_REVIEW', reversalOutcomeUnknown: true });
    expect(sendCancellationNotificationEmails).toHaveBeenCalledTimes(1);

    const [sent] = sendCancellationNotificationEmails.mock.calls[0];
    const officeHtml = generateAdminCancellationTemplate(sent);

    expect.soft(sent.reversalOutcomeUnknown, 'the email is not told the outcome is unknown').toBe(true);
    expect(officeHtml, 'office told NOT PROCESSED of a refund that may have gone through').not.toMatch(/not processed/i);
  });

  it('says the outcome is unknown and to check ARC Pay first, with no figures that say nothing went back', async () => {
    await cancel();
    const [sent] = sendCancellationNotificationEmails.mock.calls[0];
    const text = textOf(generateAdminCancellationTemplate(sent));

    expect(text).toMatch(/outcome unknown/i);
    expect(text).toMatch(/Check ARC Pay/);
    expect(text).toMatch(/do not refund by hand/i);
    expect(text).not.toMatch(/retained/i);
    expect(text).not.toMatch(/To refund/);
    expect(text).not.toMatch(/\$0\.00/);
  });

  it('leaves the customer\'s email as it was', async () => {
    await cancel();
    const [sent] = sendCancellationNotificationEmails.mock.calls[0];
    const withFlag = generateCancellationTemplate(sent);
    const { reversalOutcomeUnknown: _unknown, ...withoutFlag } = sent;
    expect(withFlag).toBe(generateCancellationTemplate(withoutFlag));
    expect(withFlag).toMatch(/Being reviewed by our team/);
  });
});

describe('the office email beside it', () => {
  const office = (data) => textOf(generateAdminCancellationTemplate({ bookingReference: 'FLT123', customerName: 'Jane', currency: 'USD', ...data }));

  it('still flags a refund held on purpose as action required', () => {
    const text = office({ paymentAction: 'REFUND_UNDER_REVIEW', refundAmount: 0, cancellationFee: 0 });
    expect(text).toMatch(/action required/i);
    expect(text).toMatch(/NOT PROCESSED \(REFUND_UNDER_REVIEW\)/);
  });

  it('still flags a refund ARC Pay refused as action required', () => {
    const text = office({ paymentAction: 'REFUND_FAILED', refundAmount: 0, cancellationFee: 50 });
    expect(text).toMatch(/Refund not processed - action required/);
    expect(text).toMatch(/NOT PROCESSED \(REFUND_FAILED\)/);
  });

  it('still reports a refund that went through', () => {
    const text = office({ paymentAction: 'PARTIAL_REFUND', refundAmount: 241, cancellationFee: 50 });
    expect(text).toMatch(/Refund due/);
    expect(text).toMatch(/\$241\.00/);
    expect(text).not.toMatch(/unknown/i);
  });
});
