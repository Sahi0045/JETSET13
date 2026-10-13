import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock('../../frontend/src/utils/apiHelper', () => ({ apiGet: (...a) => apiGet(...a), apiPost: (...a) => apiPost(...a) }));

import JetWalletPanel from '../../frontend/src/Pages/Common/login/JetWalletPanel.jsx';

const answer = (body, ok = true) => ({ ok, json: async () => body });
const wallet = (data) => answer({ success: true, data: { balance: 0, balanceUsd: 0, held: 0, entries: [], pending: [], ...data } });

describe('trip rewards in the Jet Wallet tab', () => {
  beforeEach(() => { apiGet.mockReset(); apiPost.mockReset(); });

  it('lists the rewards still to come, with when they arrive', async () => {
    apiGet.mockResolvedValue(wallet({ pending: [{ bookingReference: 'FLT1', code: 'SHUBHAM', coins: 5000, dueAt: '2026-11-05T00:00:00.000Z' }] }));
    render(<JetWalletPanel />);

    expect(await screen.findByText('Coming after your trip')).toBeTruthy();
    expect(screen.getByText('5,000 coins arrive after your trip FLT1, due 5 Nov')).toBeTruthy();
    expect(screen.getByText('Voucher SHUBHAM')).toBeTruthy();
  });

  it('gives no date for a reward whose payout date is not known yet', async () => {
    apiGet.mockResolvedValue(wallet({ pending: [{ bookingReference: 'FLT2', code: 'SHUBHAM', coins: 5000, dueAt: null }] }));
    render(<JetWalletPanel />);
    expect(await screen.findByText('5,000 coins arrive after your trip FLT2')).toBeTruthy();
  });

  it('shows nothing to come when nothing is coming', async () => {
    apiGet.mockResolvedValue(wallet({ balance: 100 }));
    render(<JetWalletPanel />);
    await screen.findByText('100');
    expect(screen.queryByText('Coming after your trip')).toBeNull();
  });

  it('words a trip payout in the history with its trip', async () => {
    apiGet.mockResolvedValue(wallet({ balance: 5000, entries: [
      { id: 9, kind: 'voucher', coins: 5000, note: 'SHUBHAM', booking_reference: 'FLT1', created_at: '2026-11-18T00:15:00Z' },
      { id: 8, kind: 'voucher', coins: 1000, note: 'WELCOME', booking_reference: null, created_at: '2026-11-01T10:00:00Z' },
    ] }));
    render(<JetWalletPanel />);
    expect(await screen.findByText('Voucher SHUBHAM: trip FLT1')).toBeTruthy();
    expect(screen.getByText('Voucher WELCOME')).toBeTruthy();
  });

  it('points a trip voucher typed here to checkout', async () => {
    apiGet.mockResolvedValue(wallet({}));
    apiPost.mockResolvedValue(answer({ success: false, code: 'VOUCHER_WRONG_KIND', error: 'Use this code at checkout when you book a flight.' }, false));
    render(<JetWalletPanel />);
    fireEvent.change(await screen.findByLabelText('Voucher code'), { target: { value: 'SHUBHAM' } });
    fireEvent.click(screen.getByRole('button', { name: 'Redeem' }));
    expect(await screen.findByText('Use this code at checkout when you book a flight.')).toBeTruthy();
  });
});
