import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FlightFareOptions from '../../frontend/src/Pages/Common/flights/FlightFareOptions.jsx';
import BagSizeLimits from '../../frontend/src/Pages/Common/flights/BagSizeLimits.jsx';
import { AIRLINE_BAG_SIZES, bagSizesOf } from '../../shared/airlineBagSizes.js';

/**
 * Booking.com shows "cabin bag 55 x 40 x 20 cm, max 7 kg" beside each fare.
 * Amadeus sends weights and piece counts and never a size (every raw reply
 * read on 31 Oct 2026), so the sizes are the airlines' own published limits.
 */

const card = (carrier, cabin, aircraft) => render(<BagSizeLimits carrier={carrier} cabin={cabin} aircraft={aircraft} />);

describe('an airline\'s bag size limits', () => {
  it('names each bag\'s size, as the airline publishes it', () => {
    card('AI', 'ECONOMY');
    const sizes = screen.getByTestId('bag-size-limits');
    expect(sizes.textContent).toContain('Cabin bag: 55 × 40 × 20 cm · 7 kg');
    expect(sizes.textContent).toContain('Personal item: 40 × 30 × 20 cm · 3 kg');
    expect(sizes.textContent).toContain('Checked bag: 158 cm in total');
  });

  it('says when one weight covers every cabin item together', () => {
    card('KL', 'ECONOMY');
    expect(screen.getByTestId('bag-size-limits').textContent).toContain('12 kg in total, with the personal item');
  });

  it('takes the smaller bag on SpiceJet\'s Q400s', () => {
    card('SG', 'ECONOMY', 'De Havilland DHC-8 Q400');
    expect(screen.getByTestId('bag-size-limits').textContent).toContain('50 × 35 × 23 cm');
  });

  // Business weights differ from economy's; sizes rarely do.
  it('gives a class the airline published nothing for the economy bag\'s size and no weight', () => {
    expect(bagSizesOf('OS', 'FIRST').cabinBag).toEqual({ cm: [55, 40, 23], in: undefined });
  });

  it('shows nothing for an airline it has not read, rather than a guess', () => {
    const { container } = card('XX', 'ECONOMY');
    expect(container.textContent).toBe('');
  });

  it('names an airline page for every airline', () => {
    for (const entry of Object.values(AIRLINE_BAG_SIZES)) {
      expect(entry.sources.length).toBeGreaterThan(0);
      for (const source of entry.sources) expect(source).toMatch(/^https:\/\//);
    }
  });
});

describe('the choose-your-fare window', () => {
  const flight = {
    id: 'clicked',
    airline: { code: 'AI', name: 'Air India Limited', logo: '' },
    departure: { time: '09:40', airport: 'DEL', terminal: '3', date: 'Fri, 6 Nov' },
    arrival: { time: '11:55', airport: 'HYD', terminal: '' },
    duration: '2h 15m',
    stops: 0,
    cabin: 'ECONOMY',
    price: { amount: 123, total: '123.00', currency: 'USD' },
    baggage: { checked: { weight: 15, weightUnit: 'KG' }, cabin: null },
    originalOffer: { id: 'clicked', travelerPricings: [{ travelerType: 'ADULT', price: { total: '123.00' } }] },
  };
  const fare = (id, label, cabin, total) => ({
    id, brandedFareLabel: label, cabin,
    price: { amount: Number(total), total, currency: 'USD' },
    baggageDetails: { checked: { weight: 15, weightUnit: 'KG' }, cabin: null },
    originalOffer: { id, travelerPricings: [{ travelerType: 'ADULT', price: { total } }] },
  });

  beforeEach(() => {
    localStorage.setItem('userCurrency', 'USD');
    globalThis.fetch = vi.fn((url) => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(String(url).includes('upsell')
        ? { success: true, data: [fare('value', 'ECO VALUE', 'ECONOMY', '123.00'), fare('business', 'BUSINESS VALUE', 'BUSINESS', '420.00')] }
        : { success: true }),
    }));
  });

  it('gives each fare its cabin\'s bag sizes', async () => {
    render(<FlightFareOptions flight={flight} onClose={() => {}} onSelect={() => {}} />);
    await screen.findByText('Business Value');

    const [economy, business] = screen.getAllByTestId('fare-option');
    expect(within(economy).getByTestId('bag-size-limits').textContent).toContain('55 × 40 × 20 cm · 7 kg');
    expect(within(business).getByTestId('bag-size-limits').textContent).toContain('55 × 40 × 20 cm · 10 kg');
  });
});
