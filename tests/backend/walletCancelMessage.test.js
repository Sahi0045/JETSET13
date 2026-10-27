import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cancellationMessage } from '../../shared/cancellationOutcome.js';

/**
 * What the customer is told after a cancel that gave Jet Coins back. The text
 * used to read as if nothing came back whenever the card had nothing to refund.
 */

describe('a cancel that gave Jet Coins back', () => {
  it('says the coins went back when the fee took everything the card held', () => {
    const text = cancellationMessage({
      cancellation: {
        paymentAction: 'NO_REFUND_FEE_COVERS', refundAmount: 0, currency: 'USD', coinsReturned: 28750,
        policy: 'not_ticketed', terms: { serviceFeeKept: 12.5, airlinePrice: 287.5 },
      },
    });
    expect(text).toContain('28,750 Jet Coins ($287.50) went back to your Jet Wallet.');
    expect(text).toMatch(/platform fee covers the card payment, so no card refund is due/);
    expect(text).not.toMatch(/covers the amount paid, so no refund is due/);
  });

  it('says the same of a cancellation fee that covered the card', () => {
    const text = cancellationMessage({ cancellation: { paymentAction: 'NO_REFUND_FEE_COVERS', refundAmount: 0, cancellationFee: 50, coinsReturned: 1200 } });
    expect(text).toMatch(/cancellation fee covers the card payment, so no card refund is due/);
    expect(text).toContain('1,200 Jet Coins ($12.00) went back to your Jet Wallet.');
  });

  it('adds one sentence after the card refund', () => {
    const text = cancellationMessage({
      cancellation: { paymentAction: 'PARTIAL_REFUND', refundAmount: 70, cancellationFee: 2.2, currency: 'USD', coinsReturned: 5000 },
    });
    expect(text).toMatch(/A refund of \$70\.00 is on its way/);
    expect(text.endsWith('5,000 Jet Coins ($50.00) went back to your Jet Wallet.')).toBe(true);
    expect(text.match(/Jet Coins/g)).toHaveLength(1);
  });

  it('does not tell a checkout that was never paid that nothing came back', () => {
    const text = cancellationMessage({ cancellation: { paymentAction: 'NOTHING_TO_REFUND', refundAmount: 0, coinsReturned: 5000 } });
    expect(text).not.toMatch(/nothing to refund/);
    expect(text).toContain('5,000 Jet Coins ($50.00) went back to your Jet Wallet.');
  });

  it('adds the sentence to a refund that is stuck or under review as well', () => {
    for (const paymentAction of ['REFUND_FAILED', 'REFUND_UNDER_REVIEW']) {
      const text = cancellationMessage({ cancellation: { paymentAction, refundAmount: 0, coinsReturned: 5000 } });
      expect(text, paymentAction).toContain('5,000 Jet Coins ($50.00) went back to your Jet Wallet.');
    }
  });
});

describe('a cancel that gave no Jet Coins back', () => {
  it('reads exactly as it did', () => {
    const fee = { paymentAction: 'NO_REFUND_FEE_COVERS', refundAmount: 0, cancellationFee: 50 };
    const nothing = { paymentAction: 'NOTHING_TO_REFUND', refundAmount: 0 };
    for (const coinsReturned of [undefined, 0, '0', null, -5]) {
      expect(cancellationMessage({ cancellation: { ...fee, coinsReturned } }))
        .toBe('Your booking is cancelled. The cancellation fee covers the amount paid, so no refund is due.');
      expect(cancellationMessage({ cancellation: { ...nothing, coinsReturned } }))
        .toBe('Your booking is cancelled. No payment is being held for this booking, so there is nothing to refund.');
    }
  });
});

describe('the Android copy of this file', () => {
  it('imports only from files the app already syncs', () => {
    const source = readFileSync(new URL('../../shared/cancellationOutcome.js', import.meta.url), 'utf8');
    const imports = [...source.matchAll(/^import .* from '(.+)';$/gm)].map((match) => match[1]);
    expect(imports).toEqual(['./flightCancelPolicy.js']);
  });
});
