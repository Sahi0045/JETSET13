import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * The review page's cancellation panel for Air India Eco Value on a one-stop
 * DEL-HYD (production, 31 Oct 2026). It said "Refundable: No" and a fee of
 * INR 5000, while the airline refunds before departure for $106 on the trip.
 */
vi.mock('../../frontend/src/Services/CurrencyService', () => ({
  default: { getExchangeRate: (code) => ({ USD: 1, INR: 88 }[code] || 1), hasLiveRates: () => true },
}));

const { default: FlightCancellationPolicy } = await import('../../frontend/src/Pages/Common/flights/FlightCancellationPolicy.jsx');

const rules = {
  status: 'ready',
  data: {
    fareRules: [],
    cancellation: {
      hasData: true,
      cutoffHours: 2,
      cancelFee: 5000,
      changeFee: 3500,
      currency: 'INR',
      fareCurrency: 'USD',
      airlineFees: { cancel: { amount: 106, currency: 'USD' }, change: null },
      refundable: true,
      noShowRefundable: false,
    },
  },
};

describe('the cancellation panel', () => {
  it('shows the airline\'s refund for the trip, and what a no-show loses', () => {
    render(<FlightCancellationPolicy flightOffer={{ id: '1' }} fromCode="DEL" toCode="HYD" departureAt="2026-11-20T11:25:00" rules={rules} />);

    expect(screen.getByText('Yes, for a fee')).toBeTruthy();
    expect(screen.getAllByText('US$106').length).toBeGreaterThan(0);
    expect(screen.getByText('Fare not refunded')).toBeTruthy();
    expect(screen.queryByText('Non-refundable')).toBeNull();
  });
});
