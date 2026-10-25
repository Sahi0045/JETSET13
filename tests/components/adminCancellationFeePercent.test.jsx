import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The flight cancellation fee is a percentage of what the customer paid, set
 * in admin. Until one is saved, the fixed fee keeps applying, and the page
 * says so rather than showing an empty box.
 */

const { default: PriceSettings } = await import('../../frontend/src/Pages/Admin/PriceSettings.jsx');

const stored = (over = {}) => ({
  flight_taxes_fees: 25, flight_taxes_fees_percentage: 5, cancellation_fee: 50,
  flight_cancellation_fee: 50, flight_cancellation_fee_percent: null, ...over,
});

const serve = (settings) => {
  const calls = [];
  global.fetch = vi.fn(async (url, init = {}) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ success: true, data: settings }) };
  });
  return calls;
};

const feeInput = () => screen.getByText('Cancellation Fee').parentElement.querySelector('input');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the flight cancellation fee in admin', () => {
  it('is a percentage field that says the fixed fee applies until one is saved', async () => {
    serve(stored());
    render(<PriceSettings />);

    await waitFor(() => expect(screen.getByText('Cancellation Fee')).toBeTruthy());
    expect(screen.getByText('Cancellation Fee').parentElement.textContent).toContain('%');
    expect(screen.getByText(/Until you save a percentage, the fixed \$50\.00 fee applies\./)).toBeTruthy();
  });

  it('shows the saved percentage', async () => {
    serve(stored({ flight_cancellation_fee_percent: 10 }));
    render(<PriceSettings />);

    await waitFor(() => expect(feeInput().value).toBe('10'));
    expect(screen.queryByText(/Until you save a percentage/)).toBeNull();
  });

  it('sends the percentage typed in when saved', async () => {
    const calls = serve(stored());
    render(<PriceSettings />);
    await waitFor(() => expect(screen.getByText('Cancellation Fee')).toBeTruthy());

    fireEvent.change(feeInput(), { target: { value: '12.5' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(calls.some((c) => c.init.method === 'PUT')).toBe(true));
    const body = JSON.parse(calls.find((c) => c.init.method === 'PUT').init.body);
    expect(body.flight_cancellation_fee_percent).toBe(12.5);
  });
});
