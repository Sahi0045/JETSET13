import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The customer's cancellation email is built from what the cancel sends the
 * mailer, so the rule that applied has to reach the template through it.
 */

vi.unmock('../../backend/services/emailService.js');

const sent = [];

vi.mock('resend', () => ({
  Resend: class {
    constructor() {
      this.emails = { send: vi.fn(async (message) => { sent.push(message); return { data: { id: 'msg-1' }, error: null }; }) };
    }
  },
}));

const terms = { serviceFeeKept: 12.5, airlinePrice: 287.5, cancellationFee: 50, penalty: null, penaltyCurrency: null };
const cancellation = (over) => ({
  customerEmail: 'traveller@example.com', customerName: 'Ada Lovelace', bookingReference: 'FLT123', bookingType: 'flight', currency: 'USD', ...over,
});
const customerHtml = () => sent.find((message) => message.to?.[0] === 'traveller@example.com')?.html || '';

beforeEach(() => {
  sent.length = 0;
  vi.stubEnv('RESEND_API_KEY', 're_test_key');
  vi.resetModules();
});

describe('the customer cancellation email, as sent', () => {
  it('calls a kept service fee a service fee', async () => {
    const { sendCancellationNotificationEmails } = await import('../../backend/services/emailService.js');

    await sendCancellationNotificationEmails(cancellation({
      paymentAction: 'PARTIAL_REFUND', refundAmount: 287.5, cancellationFee: 12.5, policy: 'free_window', terms,
    }));

    expect(customerHtml()).toContain('Service fee (not refundable)');
    expect(customerHtml()).not.toContain('Cancellation fee');
  });

  it('says why a refund is with our team', async () => {
    const { sendCancellationNotificationEmails } = await import('../../backend/services/emailService.js');

    await sendCancellationNotificationEmails(cancellation({
      paymentAction: 'REFUND_UNDER_REVIEW', refundAmount: 0, cancellationFee: 0, policy: 'non_refundable', terms,
    }));

    expect(customerHtml()).toContain('This fare is non-refundable, so the fare is not returned.');
  });

  it('keeps the general review words for a refund whose answer never came back', async () => {
    const { sendCancellationNotificationEmails } = await import('../../backend/services/emailService.js');

    await sendCancellationNotificationEmails(cancellation({
      paymentAction: 'REFUND_UNDER_REVIEW', refundAmount: 0, cancellationFee: 12.5, policy: 'non_refundable', terms, reversalOutcomeUnknown: true,
    }));

    expect(customerHtml()).toContain('for example because the fare rules decide');
  });
});
