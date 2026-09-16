import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A cancellation email the provider refused is a failure, not a send.
 *
 * Resend reports a refused send in `error` - it does not throw. This function
 * returned `{ success: true }` unconditionally and never looked, so the caller
 * logged "✅ Cancellation email sent successfully" for an email that was never
 * delivered.
 *
 * It matters more here than anywhere else in the file: the cancellation email
 * is the ONLY notification a customer gets when their refund could not be
 * completed automatically and a human has to finish it (REFUND_FAILED,
 * REFUND_UNDER_REVIEW). A silent failure leaves them knowing nothing about
 * their money, and leaves nobody aware they were not told.
 *
 * The identical bug was found and fixed for the booking confirmation email in
 * this same file - the note is still there, above `sendBookingConfirmationEmail`
 * - and this path was missed.
 */

// tests/backend/setup.js replaces this whole module with stubs that answer
// `{ id: 'email-mock-id' }`, which is right for routes that merely need an
// email not to throw - and useless here, where the module IS the subject. The
// first version of this file asserted against those stubs and told me nothing.
vi.unmock('../../backend/services/emailService.js');

const sent = [];
let nextResults = [];

vi.mock('resend', () => ({
  Resend: class {
    constructor() {
      this.emails = {
        send: vi.fn(async (message) => {
          sent.push(message);
          return nextResults.shift() ?? { data: { id: 'msg-1' }, error: null };
        }),
      };
    }
  },
}));

const load = async () => {
  vi.resetModules();
  return import('../../backend/services/emailService.js');
};

const cancellation = () => ({
  customerEmail: 'traveller@example.com',
  customerName: 'Ada Lovelace',
  bookingReference: 'FLT123',
  bookingType: 'flight',
  refundAmount: 0,
  cancellationFee: 0,
  currency: 'USD',
  paymentAction: 'REFUND_FAILED',
});

beforeEach(() => {
  sent.length = 0;
  nextResults = [];
  vi.stubEnv('RESEND_API_KEY', 're_test_key');
});

describe('sendCancellationNotificationEmails', () => {
  // The bug, exactly.
  it('reports a refused customer email as a failure', async () => {
    const { sendCancellationNotificationEmails } = await load();
    nextResults = [
      { data: null, error: { message: 'Recipient is on the suppression list' } },
      { data: { id: 'admin-1' }, error: null },
    ];

    const result = await sendCancellationNotificationEmails(cancellation());

    expect(result.success).toBe(false);
    expect(String(result.error)).toMatch(/suppression list/i);
    expect(result.customerEmail.success).toBe(false);
  });

  it('still reports success when the provider accepted it', async () => {
    const { sendCancellationNotificationEmails } = await load();

    const result = await sendCancellationNotificationEmails(cancellation());

    expect(result.success).toBe(true);
    expect(result.customerEmail.success).toBe(true);
    expect(sent).toHaveLength(2); // customer and admin
  });

  // A refused admin copy must not be reported as delivered either, but it does
  // not make the customer's email a failure - they were still told.
  it('separates a refused admin copy from the customer send', async () => {
    const { sendCancellationNotificationEmails } = await load();
    nextResults = [
      { data: { id: 'msg-1' }, error: null },
      { data: null, error: { message: 'Domain not verified' } },
    ];

    const result = await sendCancellationNotificationEmails(cancellation());

    expect(result.success, 'the customer was told').toBe(true);
    expect(result.adminNotification.success, 'the admin was not').toBe(false);
  });

  it('refuses without an address rather than pretending to send', async () => {
    const { sendCancellationNotificationEmails } = await load();

    const result = await sendCancellationNotificationEmails({ ...cancellation(), customerEmail: null });

    expect(result.success).toBe(false);
    expect(sent).toHaveLength(0);
  });
});
