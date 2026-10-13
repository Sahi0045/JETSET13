import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock('../../frontend/src/utils/apiHelper', () => ({ apiGet: (...a) => apiGet(...a), apiPost: (...a) => apiPost(...a) }));

import JetWalletPanel from '../../frontend/src/Pages/Common/login/JetWalletPanel.jsx';

const answer = (body, ok = true) => ({ ok, json: async () => body });
const wallet = (data) => answer({ success: true, data: { balance: 0, balanceUsd: 0, held: 0, entries: [], ...data } });

describe('the Jet Wallet tab', () => {
  beforeEach(() => { apiGet.mockReset(); apiPost.mockReset(); });

  it('shows the balance in coins and dollars, and the history', async () => {
    apiGet.mockResolvedValue(answer({ success: true, data: { balance: 5000, balanceUsd: 50, held: 0, entries: [
      { id: 1, kind: 'voucher', coins: 5000, note: 'SHUBHAM', created_at: '2026-10-13T10:00:00Z' },
    ] } }));
    render(<JetWalletPanel />);
    expect(await screen.findByText('5,000')).toBeTruthy();
    expect(screen.getByText('$50.00')).toBeTruthy();
    expect(screen.getByText('Voucher SHUBHAM')).toBeTruthy();
    expect(screen.getByText('+5,000')).toBeTruthy();
    expect(apiGet).toHaveBeenCalledWith('wallet');
  });

  it('words every kind of entry for the customer and shows coins taken out with a minus', async () => {
    apiGet.mockResolvedValue(wallet({ balance: 900, entries: [
      { id: 6, kind: 'earn_reversal', coins: -300, booking_reference: 'FLT3', note: null, created_at: '2026-10-13T10:05:00Z' },
      { id: 5, kind: 'earn', coins: 300, booking_reference: 'FLT3', note: null, created_at: '2026-10-13T10:04:00Z' },
      { id: 4, kind: 'return', coins: 800, booking_reference: 'FLT2', note: null, created_at: '2026-10-13T10:03:00Z' },
      { id: 3, kind: 'release', coins: 500, booking_reference: 'FLT1', note: null, created_at: '2026-10-13T10:02:00Z' },
      { id: 2, kind: 'hold', coins: -500, booking_reference: 'FLT1', note: null, created_at: '2026-10-13T10:01:00Z' },
    ] }));
    render(<JetWalletPanel />);
    expect(await screen.findByText('Earned coins taken back, booking FLT3 refunded')).toBeTruthy();
    expect(screen.getByText('Earned on booking FLT3')).toBeTruthy();
    expect(screen.getByText('Returned from booking FLT2')).toBeTruthy();
    expect(screen.getByText('Returned, payment not completed for FLT1')).toBeTruthy();
    expect(screen.getByText('Used on booking FLT1')).toBeTruthy();
    expect(screen.getByText('−300')).toBeTruthy();
    expect(screen.getByText('−500')).toBeTruthy();
    expect(screen.getByText('+800')).toBeTruthy();
  });

  it('never prints a note on an entry that is not a voucher', async () => {
    apiGet.mockResolvedValue(wallet({ balance: 800, entries: [
      { id: 4, kind: 'return', coins: 800, booking_reference: 'FLT2', note: 'staff 6f1c: internal reason', created_at: '2026-10-13T10:03:00Z' },
    ] }));
    const { container } = render(<JetWalletPanel />);
    await screen.findByText('Returned from booking FLT2');
    expect(container.textContent).not.toContain('staff');
    expect(container.textContent).not.toContain('internal reason');
  });

  it('says coins held for a checkout are set aside, not spent', async () => {
    apiGet.mockResolvedValue(wallet({ balance: 4500, balanceUsd: 45, held: 500 }));
    render(<JetWalletPanel />);
    expect(await screen.findByText(/500 coins set aside for a checkout in progress/)).toBeTruthy();
    expect(screen.queryByText(/spent/i)).toBeNull();
  });

  it('shows no set-aside line when nothing is held', async () => {
    apiGet.mockResolvedValue(wallet({ balance: 4500, balanceUsd: 45, held: 0 }));
    render(<JetWalletPanel />);
    await screen.findByText('4,500');
    expect(screen.queryByText(/set aside/)).toBeNull();
  });

  it('says so when there are no coins yet', async () => {
    apiGet.mockResolvedValue(wallet({}));
    render(<JetWalletPanel />);
    expect(await screen.findByText(/No coins yet/)).toBeTruthy();
  });

  it('says so when the wallet cannot be loaded', async () => {
    apiGet.mockResolvedValue(answer({ success: false, code: 'WALLET_UNAVAILABLE', error: 'down' }, false));
    render(<JetWalletPanel />);
    expect(await screen.findByText('Your Jet Wallet could not be loaded just now. Please try again.')).toBeTruthy();
  });

  it('redeems a voucher and shows the new balance', async () => {
    apiGet.mockResolvedValueOnce(answer({ success: true, data: { balance: 0, balanceUsd: 0, held: 0, entries: [] } }))
      .mockResolvedValueOnce(answer({ success: true, data: { balance: 5000, balanceUsd: 50, held: 0, entries: [] } }));
    apiPost.mockResolvedValue(answer({ success: true, data: { coins: 5000, balance: 5000, code: 'SHUBHAM' } }));
    render(<JetWalletPanel />);
    fireEvent.change(await screen.findByLabelText('Voucher code'), { target: { value: 'shubham' } });
    fireEvent.click(screen.getByRole('button', { name: 'Redeem' }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('wallet/redeem', { code: 'SHUBHAM' }));
    expect(await screen.findByText(/5,000 Jet Coins added/)).toBeTruthy();
    expect(await screen.findByText('$50.00')).toBeTruthy();
    expect(screen.getByLabelText('Voucher code').value).toBe('');
  });

  it('keeps the new balance on screen when the reload after a redeem fails', async () => {
    apiGet.mockResolvedValueOnce(wallet({}))
      .mockRejectedValueOnce(new Error('network'));
    apiPost.mockResolvedValue(answer({ success: true, data: { coins: 5000, balance: 5000, code: 'SHUBHAM' } }));
    render(<JetWalletPanel />);
    fireEvent.change(await screen.findByLabelText('Voucher code'), { target: { value: 'SHUBHAM' } });
    fireEvent.click(screen.getByRole('button', { name: 'Redeem' }));
    expect(await screen.findByText(/5,000 Jet Coins added/)).toBeTruthy();
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('5,000')).toBeTruthy();
    expect(screen.getByText('$50.00')).toBeTruthy();
  });

  it('says why a voucher was refused', async () => {
    apiGet.mockResolvedValue(answer({ success: true, data: { balance: 0, balanceUsd: 0, held: 0, entries: [] } }));
    apiPost.mockResolvedValue(answer({ success: false, error: 'You have already redeemed this voucher.' }, false));
    render(<JetWalletPanel />);
    fireEvent.change(await screen.findByLabelText('Voucher code'), { target: { value: 'SHUBHAM' } });
    fireEvent.click(screen.getByRole('button', { name: 'Redeem' }));
    expect(await screen.findByText('You have already redeemed this voucher.')).toBeTruthy();
  });

  it('shows the too-many-tries message when the server rate-limits wrong codes', async () => {
    apiGet.mockResolvedValue(wallet({}));
    apiPost.mockResolvedValue(answer({ success: false, code: 'RATE_LIMITED', error: 'Too many voucher attempts. Please wait 15 minutes and try again.' }, false));
    render(<JetWalletPanel />);
    fireEvent.change(await screen.findByLabelText('Voucher code'), { target: { value: 'WRONG' } });
    fireEvent.click(screen.getByRole('button', { name: 'Redeem' }));
    expect(await screen.findByText('Too many voucher attempts. Please wait 15 minutes and try again.')).toBeTruthy();
  });

  it('gives a plain message when the answer is not JSON', async () => {
    apiGet.mockResolvedValue(wallet({}));
    apiPost.mockResolvedValue({ ok: false, status: 502, json: async () => { throw new SyntaxError('Unexpected token <'); } });
    render(<JetWalletPanel />);
    fireEvent.change(await screen.findByLabelText('Voucher code'), { target: { value: 'SHUBHAM' } });
    fireEvent.click(screen.getByRole('button', { name: 'Redeem' }));
    expect(await screen.findByText('The voucher could not be redeemed just now. Please try again.')).toBeTruthy();
  });

  it('does not post an empty code', async () => {
    apiGet.mockResolvedValue(wallet({}));
    render(<JetWalletPanel />);
    await screen.findByLabelText('Voucher code');
    expect(screen.getByRole('button', { name: 'Redeem' }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Voucher code'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Redeem' }).disabled).toBe(true);
    expect(apiPost).not.toHaveBeenCalled();
  });
});
