import React from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * An amount on the flight review page is what the card is charged: US dollars,
 * with the visitor's own currency only as a labelled estimate from live rates.
 */
const fx = vi.hoisted(() => ({ currency: 'INR', rate: 83.5, live: true }));

vi.mock('../../frontend/src/Services/CurrencyService', () => ({
  default: {
    getCurrency: () => fx.currency,
    getExchangeRate: (code) => (code === 'USD' ? 1 : fx.rate),
    hasLiveRates: () => fx.live,
    formatPrice: (amount, code) => `${code} ${Math.round(amount).toLocaleString('en-US')}`,
  },
}));

const { default: ChargeAmount } = await import('../../frontend/src/Components/ChargeAmount.jsx');

const shown = (ui) => {
  const { container } = render(ui);
  return {
    charge: container.querySelector('[data-charge-amount]')?.textContent,
    estimate: container.querySelector('[data-charge-estimate]')?.textContent ?? null,
  };
};

beforeEach(() => {
  fx.currency = 'INR';
  fx.rate = 83.5;
  fx.live = true;
});

describe('ChargeAmount', () => {
  it('shows the dollar amount that is charged, not a conversion', () => {
    expect(shown(<ChargeAmount amount={501.75} />)).toEqual({ charge: 'US$501.75', estimate: null });
  });

  it('adds the estimate in the visitor\'s currency, and says it is one', () => {
    const { charge, estimate } = shown(<ChargeAmount amount={501.75} approximate />);

    expect(charge).toBe('US$501.75');
    expect(estimate).toContain('INR 41,896');
    expect(estimate).toMatch(/estimate/);
  });

  it('shows only dollars while the rates are the hardcoded fallback', () => {
    fx.live = false;
    expect(shown(<ChargeAmount amount={501.75} approximate />)).toEqual({ charge: 'US$501.75', estimate: null });
  });

  it('adds no estimate for a visitor browsing in dollars', () => {
    fx.currency = 'USD';
    expect(shown(<ChargeAmount amount={501.75} approximate />).estimate).toBeNull();
  });
});
