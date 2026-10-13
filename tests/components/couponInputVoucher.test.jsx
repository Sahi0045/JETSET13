import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ user: { id: 'user-1' }, loading: false }) }));
vi.mock('../../frontend/src/Components/Price', () => ({ default: ({ amount }) => <span>{`$${amount}`}</span> }));

const { default: CouponInput } = await import('../../frontend/src/components/CouponInput.jsx');
const { default: ArcPayService } = await import('../../frontend/src/Services/ArcPayService.js');
const { readCancelledCheckout } = await import('../../frontend/src/utils/cancelledCheckout.js');

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const coupons = { requests: [] };

beforeEach(() => {
  coupons.requests = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    const body = JSON.parse(init?.body || '{}');
    coupons.requests.push(body);
    return body.code === 'SAVE20'
      ? json(200, { success: true, coupon: { id: 'c-1', code: 'SAVE20' }, discountAmount: 20, finalTotal: 190 })
      : json(404, { success: false, message: 'Invalid or expired coupon code.' });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const apply = (code) => {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
};

describe('the plain coupon box, on every page but flights', () => {
  it('asks for a coupon and never tries a voucher', async () => {
    render(<CouponInput orderTotal={100} bookingType="cruises" />);
    expect(screen.getByPlaceholderText('Enter coupon code')).toBeTruthy();

    apply('SHUBHAM');

    expect(await screen.findByText('Invalid or expired coupon code.')).toBeTruthy();
    expect(coupons.requests).toHaveLength(1);
  });
});

describe('the flight box for coupons and vouchers', () => {
  const voucherBox = (props = {}) => {
    const checkVoucher = props.checkVoucher || vi.fn(async () => ({ ok: true, voucher: { code: 'SHUBHAM', coins: 5000 } }));
    const onVoucherApply = vi.fn();
    const onVoucherRemove = vi.fn();
    const onApply = vi.fn();
    render(<CouponInput orderTotal={210} bookingType="flights" checkVoucher={checkVoucher} onVoucherApply={onVoucherApply} onVoucherRemove={onVoucherRemove} onApply={onApply} {...props} />);
    return { checkVoucher, onVoucherApply, onVoucherRemove, onApply };
  };

  it('tries the code as a coupon first, then as a trip voucher', async () => {
    const { checkVoucher, onVoucherApply } = voucherBox();
    expect(screen.getByPlaceholderText('Coupon or voucher code')).toBeTruthy();

    apply('shubham');

    await waitFor(() => expect(onVoucherApply).toHaveBeenCalledWith({ code: 'SHUBHAM', coins: 5000 }));
    expect(coupons.requests[0]).toMatchObject({ code: 'SHUBHAM', bookingType: 'flights' });
    expect(checkVoucher).toHaveBeenCalledWith('SHUBHAM');
  });

  it('applies a coupon without asking about vouchers', async () => {
    const { checkVoucher, onApply } = voucherBox();

    apply('SAVE20');

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ code: 'SAVE20', discountAmount: 20 })));
    expect(checkVoucher).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Coupon or voucher code').value).toBe('');
  });

  it('shows a coupon and a voucher on their own lines, each with Remove', async () => {
    const { onVoucherRemove } = voucherBox({ voucher: { code: 'SHUBHAM', coins: 5000 } });
    apply('SAVE20');
    await waitFor(() => expect(document.body.textContent).toMatch(/Coupon\s*SAVE20\s*applied/));

    expect(document.body.textContent).toMatch(/Voucher SHUBHAM: 5,000 Jet Coins after your trip/);
    expect(screen.queryByPlaceholderText('Coupon or voucher code')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove voucher SHUBHAM' }));
    expect(onVoucherRemove).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
  });

  it('says why a voucher was refused', async () => {
    const { onVoucherApply } = voucherBox({ checkVoucher: vi.fn(async () => ({ ok: false, code: 'VOUCHER_WRONG_KIND', message: 'Redeem this code in Profile → Jet Wallet.' })) });

    apply('WELCOME50');

    expect(await screen.findByText('Redeem this code in Profile → Jet Wallet.')).toBeTruthy();
    expect(onVoucherApply).not.toHaveBeenCalled();
  });

  it('refuses a second voucher while one is applied', async () => {
    const { checkVoucher } = voucherBox({ voucher: { code: 'SHUBHAM', coins: 5000 } });

    apply('OTHER1');

    expect(await screen.findByText('This booking already has a voucher. Remove it to use a different one.')).toBeTruthy();
    expect(checkVoucher).not.toHaveBeenCalled();
  });
});

describe('the voucher on its way to the payment page and back', () => {
  it('is sent to checkout when there is one', async () => {
    const fetch = vi.fn(async () => json(200, { success: true, checkoutUrl: 'https://arc.test/pay', sessionId: 'S1' }));
    vi.stubGlobal('fetch', fetch);

    await ArcPayService.createHostedCheckout({ amount: 210, orderId: 'FLT1', bookingType: 'flight', voucherCode: 'SHUBHAM' });
    await ArcPayService.createHostedCheckout({ amount: 210, orderId: 'FLT2', bookingType: 'flight' });

    expect(JSON.parse(fetch.mock.calls[0][1].body).voucherCode).toBe('SHUBHAM');
    expect(JSON.parse(fetch.mock.calls[1][1].body)).not.toHaveProperty('voucherCode');
  });

  it('comes back from a cancelled payment page', () => {
    const storage = { getItem: () => JSON.stringify({ selectedFlight: { originalOffer: { id: '1' } }, voucherCode: 'SHUBHAM' }) };
    expect(readCancelledCheckout(storage).voucherCode).toBe('SHUBHAM');
  });
});
