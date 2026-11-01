import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * How many Jet Coins one flight booking may use is set in admin, as bands of
 * airline fare: under $50 up to $1, ..., $250 and over up to $5 by default.
 */

const { default: PriceSettings } = await import('../../frontend/src/Pages/Admin/PriceSettings.jsx');

const stored = (over = {}) => ({
  flight_taxes_fees: 1, flight_taxes_fees_percentage: 2, cancellation_fee: 50,
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

const bandValues = () => screen.getAllByRole('row').slice(1).map((row) => [...row.querySelectorAll('input')].map((input) => input.value));
const saved = (calls) => JSON.parse(calls.find((c) => c.init.method === 'PUT').init.body);
const save = () => fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Jet Coins per booking in admin', () => {
  it('shows the saved bands', async () => {
    serve(stored({ flight_coin_bands: [{ from: 0, usd: 1 }, { from: 80, usd: 2.5 }] }));
    render(<PriceSettings />);

    await waitFor(() => expect(bandValues()).toEqual([['0', '1'], ['80', '2.5']]));
    expect(screen.getByRole('table', { name: 'Jet Coins per flight booking' })).toBeTruthy();
  });

  it('shows the default bands when none are saved', async () => {
    serve(stored());
    render(<PriceSettings />);

    await waitFor(() => expect(bandValues()).toEqual([['0', '1'], ['50', '2'], ['100', '3'], ['150', '4'], ['250', '5']]));
    expect(screen.getByText(/Example: a \$120 fare can use up to \$3\.00 of coins\./)).toBeTruthy();
  });

  it('sends the bands as typed when saved', async () => {
    const calls = serve(stored());
    render(<PriceSettings />);
    await waitFor(() => expect(bandValues()).toHaveLength(5));

    fireEvent.change(screen.getByLabelText('Band 2 coins up to'), { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove band 5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add band' }));
    fireEvent.change(screen.getByLabelText('Band 5 fare from'), { target: { value: '400' } });
    fireEvent.change(screen.getByLabelText('Band 5 coins up to'), { target: { value: '7' } });
    save();

    await waitFor(() => expect(calls.some((c) => c.init.method === 'PUT')).toBe(true));
    expect(saved(calls).flight_coin_bands).toEqual([
      { from: 0, usd: 1 }, { from: 50, usd: 2.5 }, { from: 100, usd: 3 }, { from: 150, usd: 4 }, { from: 400, usd: 7 },
    ]);
  });

  it('says why bands cannot be saved, and sends nothing', async () => {
    const calls = serve(stored());
    render(<PriceSettings />);
    await waitFor(() => expect(bandValues()).toHaveLength(5));

    fireEvent.change(screen.getByLabelText('Band 3 fare from'), { target: { value: '40' } });
    save();

    expect(await screen.findByText('Jet Coins per booking: Band 3 must start at a higher price than band 2. Nothing was saved.')).toBeTruthy();
    expect(calls.some((c) => c.init.method === 'PUT')).toBe(false);
  });

  it('does not read an empty box as $0', async () => {
    const calls = serve(stored());
    render(<PriceSettings />);
    await waitFor(() => expect(bandValues()).toHaveLength(5));

    fireEvent.change(screen.getByLabelText('Band 2 coins up to'), { target: { value: '' } });
    save();

    expect(await screen.findByText(/Jet Coins per booking: Band 2: the price and the coins must be dollars and cents/)).toBeTruthy();
    expect(calls.some((c) => c.init.method === 'PUT')).toBe(false);
  });
});
