import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cancellationMessage } from '../../shared/cancellationOutcome.js';

/**
 * The customer's cancellation email for a booking that used Jet Coins.
 *
 * It never heard about the coins: a card payment of $1.00 under a $2.20 fee
 * read "No refund is due: the cancellation fee is equal to or more than the
 * amount paid" while 12,000 coins went back to the wallet - not what the page
 * the customer had just seen said. The email says it in the page's words.
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

const customerHtml = () => sent.find((message) => message.to?.[0] === 'traveller@example.com')?.html || '';

const feeCovers = {
  customerEmail: 'traveller@example.com', customerName: 'Ada Lovelace', bookingReference: 'FLT123', bookingType: 'flight', currency: 'USD',
  paymentAction: 'NO_REFUND_FEE_COVERS', refundAmount: 0, cancellationFee: 2.2, coinsReturned: 12000,
};
const lessFee = {
  ...feeCovers, paymentAction: 'PARTIAL_REFUND', refundAmount: 70, cancellationFee: 2.2, coinsReturned: 5000,
};

beforeEach(() => {
  sent.length = 0;
  vi.stubEnv('RESEND_API_KEY', 're_test_key');
  vi.resetModules();
});

describe('the cancellation email of a booking that used Jet Coins', () => {
  it('does not say no refund is due when the fee covered the card and coins went back', async () => {
    const { sendCancellationNotificationEmails } = await import('../../backend/services/emailService.js');

    await sendCancellationNotificationEmails(feeCovers);

    const html = customerHtml();
    expect(html).not.toMatch(/No refund is due/);
    expect(html).not.toMatch(/equal to or more than the amount paid/);
    expect(html).toContain('The cancellation fee covers the card payment, so no card refund is due.');
    expect(html).toContain('12,000 Jet Coins ($120.00) went back to your Jet Wallet.');
  });

  it('names the coins that went back beside the card refund', async () => {
    const { sendCancellationNotificationEmails } = await import('../../backend/services/emailService.js');

    await sendCancellationNotificationEmails(lessFee);

    const html = customerHtml();
    expect(html).toContain('$70.00');
    expect(html).toContain('5,000 Jet Coins ($50.00) went back to your Jet Wallet.');
  });

  it('says what the page says', async () => {
    const { generateCancellationTemplate } = await import('../../backend/services/email/templates.js');

    for (const data of [feeCovers, lessFee]) {
      const page = cancellationMessage({ cancellation: data });
      const html = generateCancellationTemplate(data);
      const coinWords = page.slice(page.indexOf(`${data.coinsReturned.toLocaleString('en-US')} Jet Coins`));
      expect(html).toContain(coinWords);
    }
    expect(cancellationMessage({ cancellation: feeCovers })).toContain('The cancellation fee covers the card payment, so no card refund is due.');
  });
});
