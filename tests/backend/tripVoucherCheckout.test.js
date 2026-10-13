import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyFlightCharge } from '../../backend/services/flightCheckout.service.js';
import { checkoutKey } from '../../backend/utils/tripMatch.js';
import { CHECKOUT_VOUCHER_MESSAGES } from '../../backend/services/wallet.service.js';

const offer = {
  id: '1',
  itineraries: [{ segments: [{ carrierCode: 'DL', number: '713', departure: { iataCode: 'JFK', at: '2026-11-03T08:00:00' }, arrival: { iataCode: 'LAX', at: '2026-11-03T11:05:00' } }] }],
  price: { total: '120.00', currency: 'USD' },
  travelerPricings: [{ travelerId: '1', travelerType: 'ADULT' }],
};
const traveller = { firstName: 'Asha', lastName: 'Rao', gender: 'female', dateOfBirth: '1990-01-01', type: 'ADULT' };
const bookingData = { originalOffer: offer, passengerData: [traveller] };
const VOUCHER = { id: 'v1', code: 'SHUBHAM', coins: 5000, kind: 'trip' };

let rpc;
const clientFor = () => ({
  rpc,
  from: vi.fn((table) => {
    const chain = {};
    for (const op of ['select', 'eq', 'order', 'limit']) chain[op] = vi.fn(() => chain);
    chain.single = vi.fn(async () => ({
      data: table === 'price_settings' ? { settings: { flight_taxes_fees: 1, flight_taxes_fees_percentage: 1 } } : null,
      error: null,
    }));
    chain.maybeSingle = vi.fn(async () => ({ data: table === 'wallets' ? { balance: 5000 } : null, error: null }));
    return chain;
  }),
});
const priceOffer = vi.fn(async () => ({
  price: { total: '120.00', grandTotal: '120.00', currency: 'USD', base: '100.00' },
  _ama: { bookingEnabled: true, international: false },
}));
const verify = (over = {}) => verifyFlightCharge({ client: clientFor(), amount: 122.2, bookingData, userId: 'u1', priceOffer, ...over });

beforeEach(() => {
  rpc = vi.fn(async () => ({ data: VOUCHER, error: null }));
  priceOffer.mockClear();
});

describe('a trip-reward voucher at checkout', () => {
  it('checks the voucher for the signed-in customer and leaves the price alone', async () => {
    const verdict = await verify({ voucherCode: ' shubham ' });

    expect(verdict.ok).toBe(true);
    expect(verdict.voucher).toEqual({ id: 'v1', code: 'SHUBHAM', coins: 5000 });
    expect(verdict.charge.total).toBe(122.2);
    expect(rpc).toHaveBeenCalledWith('check_trip_voucher', { p_user: 'u1', p_code: 'SHUBHAM', p_ref: null });
  });

  it('carries no voucher when none was typed', async () => {
    const verdict = await verify();
    expect(verdict.voucher).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('asks a guest to log in, before the fare is priced', async () => {
    const verdict = await verify({ voucherCode: 'SHUBHAM', userId: null });
    expect(verdict).toMatchObject({ ok: false, status: 401, code: 'LOGIN_REQUIRED', message: 'Please log in to use a voucher. Nothing has been charged.' });
    expect(priceOffer).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('answers each refusal with its code and the customer message, before the fare is priced', async () => {
    for (const code of ['VOUCHER_NOT_FOUND', 'VOUCHER_INACTIVE', 'VOUCHER_NOT_STARTED', 'VOUCHER_EXPIRED', 'VOUCHER_USED_UP', 'VOUCHER_ALREADY_REDEEMED', 'VOUCHER_FIRST_TIME_ONLY', 'VOUCHER_WRONG_KIND']) {
      rpc = vi.fn(async () => ({ data: null, error: { message: code } }));
      const verdict = await verify({ voucherCode: 'SHUBHAM' });
      expect(verdict).toMatchObject({ ok: false, status: 409, code, message: CHECKOUT_VOUCHER_MESSAGES[code] });
    }
    expect(priceOffer).not.toHaveBeenCalled();
  });

  it('points an instant voucher to the wallet', async () => {
    rpc = vi.fn(async () => ({ data: null, error: { message: 'VOUCHER_WRONG_KIND' } }));
    expect((await verify({ voucherCode: 'WELCOME50' })).message).toBe('Redeem this code in Profile → Jet Wallet.');
  });

  it('refuses a malformed code without asking the database', async () => {
    const verdict = await verify({ voucherCode: 'a b' });
    expect(verdict).toMatchObject({ ok: false, status: 409, code: 'VOUCHER_NOT_FOUND' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('says the voucher could not be checked when the database cannot answer', async () => {
    const silence = vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpc = vi.fn(async () => ({ data: null, error: { message: 'connection reset' } }));
    const verdict = await verify({ voucherCode: 'SHUBHAM' });
    expect(verdict).toMatchObject({ ok: false, status: 503, code: 'VOUCHER_UNAVAILABLE' });
    expect(verdict.message).toMatch(/Nothing has been charged/);
    silence.mockRestore();
  });

  it('works beside Jet Coins', async () => {
    const verdict = await verify({ amount: 72.2, walletCoins: 5000, voucherCode: 'SHUBHAM' });
    expect(verdict.ok).toBe(true);
    expect(verdict.wallet).toEqual({ coins: 5000, amount: 50 });
    expect(verdict.voucher.code).toBe('SHUBHAM');
    expect(verdict.charge.total).toBe(72.2);
  });
});

describe('the payment page key and the voucher', () => {
  const base = {
    bookingData: { ...bookingData, bookingDetails: { contact: { email: 'asha@example.com', phone: '5550100' } } },
    customerEmail: 'asha@example.com',
    total: 122.2,
  };

  it('keeps the key it had for a checkout without a voucher', () => {
    expect(checkoutKey({ ...base, voucherCode: '' })).toBe(checkoutKey(base));
    expect(checkoutKey({ ...base, voucherCode: null })).toBe(checkoutKey(base));
  });

  it('makes a page with a voucher a different page', () => {
    expect(checkoutKey({ ...base, voucherCode: 'SHUBHAM' })).not.toBe(checkoutKey(base));
    expect(checkoutKey({ ...base, voucherCode: 'SHUBHAM' })).not.toBe(checkoutKey({ ...base, voucherCode: 'OTHER1' }));
  });

  it('treats the same voucher typed in any case as the same page', () => {
    expect(checkoutKey({ ...base, voucherCode: ' shubham ' })).toBe(checkoutKey({ ...base, voucherCode: 'SHUBHAM' }));
  });

  it('tells a voucher with coins from coins alone', () => {
    expect(checkoutKey({ ...base, walletCoins: 500, voucherCode: 'SHUBHAM' })).not.toBe(checkoutKey({ ...base, walletCoins: 500 }));
  });
});
