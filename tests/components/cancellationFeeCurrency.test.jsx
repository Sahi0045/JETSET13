import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The cancellation fee beside a total charged in US dollars.
 *
 * Airlines file their penalties in their own currency: on PDT (28 Sep 2026)
 * DEL-EWR fares from Delta, Air France and KLM said USD 300, Virgin INR 14000,
 * LOT EUR 150. The panel printed the filed amount as it came, so the review
 * page read "Cancellation fee: €500" over "Total Amount US$4,038.77" and the
 * customer was left to work out what €500 costs them.
 */
const fx = vi.hoisted(() => ({ rates: { USD: 1, EUR: 0.85, INR: 88 }, live: true }));

vi.mock('../../frontend/src/Services/CurrencyService', () => ({
  default: {
    getExchangeRate: (code) => fx.rates[code] || 1,
    hasLiveRates: () => fx.live,
  },
}));

const { default: FlightCancellationPolicy } = await import('../../frontend/src/Pages/Common/flights/FlightCancellationPolicy.jsx');

const withFee = (cancelFee, currency) => ({
  status: 'ready',
  data: {
    fareRules: [],
    cancellation: { hasData: true, cutoffHours: null, cancelFee, changeFee: null, currency, refundable: false, fareCurrency: 'USD' },
  },
});

const panel = (rules) => render(
  <FlightCancellationPolicy flightOffer={{ id: '1' }} fromCode="DEL" toCode="EWR" departureAt="2026-10-01T02:35:00" rules={rules} />,
);

beforeEach(() => {
  fx.live = true;
});

describe('a cancellation fee the airline filed in another currency', () => {
  it('is shown in US dollars at the live rate, with the airline\'s own amount beside it', () => {
    panel(withFee(500, 'EUR'));

    // 500 / 0.85 = 588.24
    expect(screen.getAllByText('about US$588').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/€500/).length).toBeGreaterThan(0);
    expect(screen.queryByText('€500')).toBeNull();
  });

  it('keeps the airline\'s amount, labelled as its currency, when the rates are not live', () => {
    fx.live = false;
    panel(withFee(500, 'EUR'));

    expect(screen.queryByText(/US\$/)).toBeNull();
    expect(screen.getAllByText(/€500/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/in euros/).length).toBeGreaterThan(0);
  });

  it('converts a rupee fee the same way', () => {
    panel(withFee(14000, 'INR'));

    // 14000 / 88 = 159.09
    expect(screen.getAllByText('about US$159').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/₹14,000/).length).toBeGreaterThan(0);
  });
});

describe('a cancellation fee filed in US dollars', () => {
  it('reads US$, as the total does', () => {
    panel(withFee(300, 'USD'));

    expect(screen.getAllByText('US$300').length).toBeGreaterThan(0);
    expect(screen.queryByText(/about/)).toBeNull();
  });
});
