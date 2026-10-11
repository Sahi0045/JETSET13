import { describe, expect, it } from 'vitest';
import { cancellationMessage, customerReviewSentence } from '../../shared/cancellationOutcome.js';
import { generateCancellationTemplate } from '../../backend/services/email/templates.js';

/**
 * After a customer's cancel, the page and the email say which rule applied:
 * a kept service fee is called that, not a cancellation fee, and a refund left
 * to our team says why.
 */

const terms = { serviceFeeKept: 12.5, airlinePrice: 287.5, cancellationFee: 50, penalty: 150, penaltyCurrency: 'USD' };
const refunded = (policy) => ({ paymentAction: 'PARTIAL_REFUND', refundAmount: 287.5, cancellationFee: 12.5, currency: 'USD', policy, terms });
const reviewed = (policy, extra = {}) => ({ paymentAction: 'REFUND_UNDER_REVIEW', refundAmount: 0, cancellationFee: 0, currency: 'USD', policy, terms, ...extra });

describe('the message after a customer cancel', () => {
  it('calls a kept service fee a service fee', () => {
    for (const policy of ['not_ticketed', 'free_window']) {
      const message = cancellationMessage({ cancellation: refunded(policy) });
      expect(message).toMatch(/A refund of \$287\.50 is on its way/);
      expect(message).toMatch(/the \$12\.50 service fee is not refundable/);
      expect(message).not.toMatch(/cancellation fee/);
    }
  });

  it('keeps the cancellation fee words for a cancel with no customer policy', () => {
    const message = cancellationMessage({ cancellation: { paymentAction: 'PARTIAL_REFUND', refundAmount: 241, cancellationFee: 50, currency: 'USD' } });
    expect(message).toMatch(/\$50\.00 cancellation fee was kept/);
  });

  it('says why a refund was left to our team', () => {
    expect(cancellationMessage({ cancellation: reviewed('non_refundable') })).toBe(
      'Your booking is cancelled. This fare is non-refundable, so the fare is not returned. '
      + 'Our team checks with the airline for any unused taxes and emails you within 2 business days.',
    );
    expect(cancellationMessage({ cancellation: reviewed('refundable') })).toBe(
      "Your booking is cancelled. This fare is refundable. You get back $287.50 less the airline's cancellation penalty of $150.00 per adult "
      + 'and our $50.00 cancellation fee. The $12.50 service fee is not refundable. '
      + 'Our team confirms the amount with the airline and emails you within 2 business days.',
    );
    expect(cancellationMessage({ cancellation: reviewed('rules_unknown') })).toBe(
      "Your booking is cancelled. We could not read this fare's rules just now. "
      + 'Our team checks them with the airline and emails you within 2 business days to confirm what is returned.',
    );
    expect(cancellationMessage({ cancellation: reviewed('not_voided') })).toBe(
      'Your booking is cancelled. You cancelled within the free cancellation time, so you get back $287.50; the $12.50 service fee is not refundable. '
      + 'The airline could not void the ticket, so our team processes this refund and emails you within 2 business days.',
    );
  });

  it('keeps the general review words for a refund whose answer never came back', () => {
    const message = cancellationMessage({ cancellation: reviewed('free_window', { reversalOutcomeUnknown: true }) });
    expect(message).toMatch(/Our team needs to review the refund/);
    expect(customerReviewSentence(reviewed('free_window'))).toBeNull();
  });
});

describe('the cancellation email after a customer cancel', () => {
  it('lists the kept service fee as not refundable', () => {
    const html = generateCancellationTemplate({
      customerName: 'Jane', bookingReference: 'JTS-1234', ...refunded('free_window'),
    });
    expect(html).toContain('Service fee (not refundable)');
    expect(html).toContain('$12.50');
    expect(html).not.toContain('Cancellation fee');
  });

  it('says why the refund is with our team', () => {
    const html = generateCancellationTemplate({
      customerName: 'Jane', bookingReference: 'JTS-1234', ...reviewed('non_refundable'),
    });
    expect(html).toContain('This fare is non-refundable, so the fare is not returned.');
    expect(html).not.toContain('for example because the fare rules decide');
  });

  it('keeps the general review words without a customer policy', () => {
    const html = generateCancellationTemplate({ customerName: 'Jane', bookingReference: 'JTS-1234', paymentAction: 'REFUND_UNDER_REVIEW', refundAmount: 0 });
    expect(html).toContain('for example because the fare rules decide');
  });
});
