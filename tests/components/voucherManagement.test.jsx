import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const adminFetch = vi.fn();
vi.mock('../../frontend/src/utils/adminAuth', () => ({
  adminFetch: (...a) => adminFetch(...a),
  readAdminResponse: async (response) => response.json(),
}));
vi.mock('../../frontend/src/Pages/Admin/shell/RefreshContext', () => ({ useRegisterRefresh: () => {} }));

import VoucherManagement from '../../frontend/src/Pages/Admin/VoucherManagement.jsx';

const answer = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

describe('admin vouchers page', () => {
  beforeEach(() => adminFetch.mockReset());

  it('lists vouchers with their value and use', async () => {
    adminFetch.mockResolvedValue(answer({ success: true, data: [
      { id: 'v1', code: 'SHUBHAM', coins: 5000, redemptions_count: 3, max_redemptions: 100, is_active: true, valid_from: null, valid_until: null },
    ] }));
    render(<VoucherManagement />);
    expect(await screen.findByText('SHUBHAM')).toBeTruthy();
    expect(screen.getByText('$50.00')).toBeTruthy();
    expect(screen.getByText('3 / 100')).toBeTruthy();
  });

  it('creates a voucher from the form, showing the coins it gives', async () => {
    adminFetch.mockResolvedValueOnce(answer({ success: true, data: [] }))
      .mockResolvedValueOnce(answer({ success: true, data: { id: 'v2', code: 'WELCOME' } }, 201))
      .mockResolvedValueOnce(answer({ success: true, data: [] }));
    render(<VoucherManagement />);
    fireEvent.click(await screen.findByRole('button', { name: 'New voucher' }));
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'welcome' } });
    fireEvent.change(screen.getByLabelText('Value (USD)'), { target: { value: '50' } });
    expect(screen.getByText('= 5,000 Jet Coins')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create voucher' }));
    await waitFor(() => expect(adminFetch.mock.calls[1][1].method).toBe('POST'));
    expect(JSON.parse(adminFetch.mock.calls[1][1].body)).toMatchObject({ code: 'WELCOME', valueUsd: 50 });
  });

  it('shows the server refusal', async () => {
    adminFetch.mockResolvedValueOnce(answer({ success: true, data: [] }))
      .mockResolvedValueOnce(answer({ success: false, error: 'A voucher with this code already exists.' }, 409));
    render(<VoucherManagement />);
    fireEvent.click(await screen.findByRole('button', { name: 'New voucher' }));
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'TAKEN' } });
    fireEvent.change(screen.getByLabelText('Value (USD)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create voucher' }));
    expect(await screen.findByText('A voucher with this code already exists.')).toBeTruthy();
  });

  it('says the voucher list could not be loaded, rather than that there are none', async () => {
    adminFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<VoucherManagement />);
    expect(await screen.findByText('The server could not be reached. Try again.')).toBeTruthy();
    expect(screen.queryByText('No vouchers yet.')).toBeNull();
  });

  it('shows the form error when the save never reaches the server, and lets the admin try again', async () => {
    adminFetch.mockResolvedValueOnce(answer({ success: true, data: [] })).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<VoucherManagement />);
    fireEvent.click(await screen.findByRole('button', { name: 'New voucher' }));
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'WELCOME' } });
    fireEvent.change(screen.getByLabelText('Value (USD)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create voucher' }));
    expect(await screen.findByText('The server could not be reached. Try again.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create voucher' }).disabled).toBe(false);
  });

  it('switches a voucher off and shows the new state', async () => {
    const voucher = { id: 'v1', code: 'SHUBHAM', coins: 5000, redemptions_count: 0, max_redemptions: null, is_active: true };
    adminFetch.mockResolvedValueOnce(answer({ success: true, data: [voucher] }))
      .mockResolvedValueOnce(answer({ success: true, data: { ...voucher, is_active: false } }))
      .mockResolvedValueOnce(answer({ success: true, data: [{ ...voucher, is_active: false }] }));
    render(<VoucherManagement />);
    fireEvent.click(await screen.findByRole('button', { name: 'Switch off SHUBHAM' }));
    await waitFor(() => expect(adminFetch.mock.calls[1][1].method).toBe('PUT'));
    expect(adminFetch.mock.calls[1][0]).toMatch(/vouchers\/v1$/);
    expect(JSON.parse(adminFetch.mock.calls[1][1].body)).toEqual({ isActive: false });
    expect(await screen.findByRole('button', { name: 'Switch on SHUBHAM' })).toBeTruthy();
    expect(screen.getByText('SHUBHAM is off.')).toBeTruthy();
  });

  it('shows why a switch failed, and reloads the list anyway', async () => {
    const voucher = { id: 'v1', code: 'SHUBHAM', coins: 5000, redemptions_count: 0, max_redemptions: null, is_active: true };
    adminFetch.mockResolvedValueOnce(answer({ success: true, data: [voucher] }))
      .mockResolvedValueOnce(answer({ success: false, error: 'Voucher not found.' }, 404))
      .mockResolvedValueOnce(answer({ success: true, data: [] }));
    render(<VoucherManagement />);
    fireEvent.click(await screen.findByRole('button', { name: 'Switch off SHUBHAM' }));
    expect(await screen.findByText('Voucher not found.')).toBeTruthy();
    await waitFor(() => expect(adminFetch).toHaveBeenCalledTimes(3));
    expect(await screen.findByText('No vouchers yet.')).toBeTruthy();
    expect(screen.getByText('Voucher not found.')).toBeTruthy();
  });

  it('locks the code and value of a voucher customers have redeemed, and says why', async () => {
    adminFetch.mockResolvedValue(answer({ success: true, data: [
      { id: 'v1', code: 'SHUBHAM', coins: 5000, redemptions_count: 3, max_redemptions: 100, is_active: true },
      { id: 'v2', code: 'FRESH', coins: 1000, redemptions_count: 0, max_redemptions: null, is_active: true },
    ] }));
    render(<VoucherManagement />);
    fireEvent.click((await screen.findAllByRole('button', { name: /^Edit/ }))[0]);
    expect(screen.getByLabelText('Code').disabled).toBe(true);
    expect(screen.getByLabelText('Value (USD)').disabled).toBe(true);
    expect(screen.getByText(/cannot be changed/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getAllByRole('button', { name: /^Edit/ })[1]);
    expect(screen.getByLabelText('Code').disabled).toBe(false);
    expect(screen.getByLabelText('Value (USD)').disabled).toBe(false);
  });

  it('saves an edit with a PUT to that voucher', async () => {
    const voucher = { id: 'v1', code: 'SHUBHAM', coins: 5000, redemptions_count: 0, max_redemptions: null, is_active: true, valid_from: null, valid_until: '2027-01-31T23:59:59.999Z', note: 'launch' };
    adminFetch.mockResolvedValueOnce(answer({ success: true, data: [voucher] }))
      .mockResolvedValueOnce(answer({ success: true, data: voucher }))
      .mockResolvedValueOnce(answer({ success: true, data: [voucher] }));
    render(<VoucherManagement />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit SHUBHAM' }));
    expect(screen.getByLabelText('Ends').value).toBe('2027-01-31');
    fireEvent.change(screen.getByLabelText('Value (USD)'), { target: { value: '75.50' } });
    expect(screen.getByText('= 7,550 Jet Coins')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save voucher' }));
    await waitFor(() => expect(adminFetch.mock.calls[1][1].method).toBe('PUT'));
    expect(adminFetch.mock.calls[1][0]).toMatch(/vouchers\/v1$/);
    expect(JSON.parse(adminFetch.mock.calls[1][1].body)).toEqual({
      code: 'SHUBHAM', valueUsd: 75.5, maxRedemptions: '', validFrom: '', validUntil: '2027-01-31', note: 'launch',
    });
  });

  it('lists who redeemed a voucher, and shows an error when that cannot be loaded', async () => {
    const voucher = { id: 'v1', code: 'SHUBHAM', coins: 5000, redemptions_count: 1, max_redemptions: 100, is_active: true };
    adminFetch.mockResolvedValueOnce(answer({ success: true, data: [voucher] }))
      .mockResolvedValueOnce(answer({ success: true, data: [{ id: 'r1', coins: 5000, createdAt: '2026-10-13T10:00:00.000Z', userId: 'u1', email: 'ada@example.com' }] }))
      .mockResolvedValueOnce(answer({ success: false, error: 'Redemptions could not be loaded.' }, 503));
    render(<VoucherManagement />);
    const who = await screen.findByRole('button', { name: 'Who used SHUBHAM' });
    fireEvent.click(who);
    expect(await screen.findByText('ada@example.com')).toBeTruthy();
    expect(adminFetch.mock.calls[1][0]).toMatch(/vouchers\/v1\/redemptions$/);
    fireEvent.click(who);
    expect(await screen.findByText('Redemptions could not be loaded.')).toBeTruthy();
    expect(screen.queryByText('Nobody has redeemed it yet.')).toBeNull();
  });
});
