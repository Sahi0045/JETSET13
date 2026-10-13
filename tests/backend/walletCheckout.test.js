import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyFlightCharge } from '../../backend/services/flightCheckout.service.js';
import { checkoutKey } from '../../backend/utils/tripMatch.js';

const offer = {
  id: '1',
  itineraries: [{ segments: [{ carrierCode: 'DL', number: '713', departure: { iataCode: 'JFK', at: '2026-11-03T08:00:00' }, arrival: { iataCode: 'LAX', at: '2026-11-03T11:05:00' } }] }],
  price: { total: '120.00', currency: 'USD' },
  travelerPricings: [{ travelerId: '1', travelerType: 'ADULT' }],
};
const traveller = { firstName: 'Asha', lastName: 'Rao', gender: 'female', dateOfBirth: '1990-01-01', type: 'ADULT' };
const bookingData = { originalOffer: offer, passengerData: [traveller] };

const rows = {};
let walletReads = 0;
let walletError = null;

const clientFor = () => ({
  from: vi.fn((table) => {
    const chain = {};
    for (const op of ['select', 'eq', 'order', 'limit']) chain[op] = vi.fn(() => chain);
    chain.single = vi.fn(async () => ({ data: rows[table] ?? null, error: null }));
    chain.maybeSingle = vi.fn(async () => {
      if (table === 'wallets') {
        walletReads += 1;
        return { data: walletError ? null : rows.wallets ?? null, error: walletError };
      }
      return { data: rows[table] ?? null, error: null };
    });
    return chain;
  }),
});

const priceOffer = vi.fn(async () => ({
  price: { total: '120.00', grandTotal: '120.00', currency: 'USD', base: '100.00' },
  _ama: { bookingEnabled: true, international: false },
}));

const verify = (over = {}) => verifyFlightCharge({
  client: clientFor(), amount: 122.2, bookingData, userId: 'u1', priceOffer, ...over,
});

beforeEach(() => {
  for (const key of Object.keys(rows)) delete rows[key];
  rows.price_settings = { settings: { flight_taxes_fees: 1, flight_taxes_fees_percentage: 1 } };
  rows.wallets = { balance: 5000 };
  walletReads = 0;
  walletError = null;
});

describe('coins at checkout', () => {
  it('prices coins in and leaves the card the rest', async () => {
    const verdict = await verify({ amount: 72.2, walletCoins: 5000 });

    expect(verdict.ok).toBe(true);
    expect(verdict.wallet).toEqual({ coins: 5000, amount: 50 });
    expect(verdict.charge.total).toBe(72.2);
  });

  it('keeps the coins on the charge itself, where the cancel maths reads them', async () => {
    const { charge } = await verify({ amount: 72.2, walletCoins: 5000 });

    expect(charge.walletAmount).toBe(50);
    expect(charge.walletCoins).toBe(5000);
  });

  it('uses no more coins than the customer holds', async () => {
    rows.wallets = { balance: 1000 };
    const verdict = await verify({ amount: 112.2, walletCoins: 5000 });

    expect(verdict.ok).toBe(true);
    expect(verdict.wallet).toEqual({ coins: 1000, amount: 10 });
  });

  it('asks for the price the coins actually give when the page assumed more coins than there are', async () => {
    rows.wallets = { balance: 1000 };
    const verdict = await verify({ amount: 72.2, walletCoins: 5000 });

    expect(verdict).toMatchObject({ ok: false, status: 409, code: 'PRICE_CHANGED' });
    expect(verdict.charge.total).toBe(112.2);
  });

  it('never takes the card below one dollar', async () => {
    rows.wallets = { balance: 1_000_000 };
    const verdict = await verify({ amount: 1, walletCoins: 1_000_000 });

    expect(verdict.ok).toBe(true);
    expect(verdict.charge.total).toBe(1);
    expect(verdict.wallet).toEqual({ coins: 12120, amount: 121.2 });
  });

  it('takes the coupon off first, and the coins only from what is left', async () => {
    rows.coupons = { id: 'c1', code: 'FLY10', discount_type: 'fixed', discount_value: 22.2, min_order_value: 0, max_uses: null, applicable_to: 'all', is_active: true };
    rows.wallets = { balance: 1_000_000 };
    const verdict = await verify({ amount: 1, couponCode: 'FLY10', walletCoins: 1_000_000 });

    expect(verdict.ok).toBe(true);
    expect(verdict.coupon.code).toBe('FLY10');
    expect(verdict.wallet).toEqual({ coins: 9900, amount: 99 });
    expect(verdict.charge.total).toBe(1);
  });

  it('still refuses a coupon that covers the whole fare, coins or not', async () => {
    rows.coupons = { id: 'c1', code: 'FREE', discount_type: 'percentage', discount_value: 100, min_order_value: 0, max_uses: null, applicable_to: 'all', is_active: true };
    const verdict = await verify({ amount: 0, couponCode: 'FREE', walletCoins: 5000 });

    expect(verdict).toMatchObject({ ok: false, status: 409, code: 'COUPON_INVALID' });
  });

  it('refuses coins without an account', async () => {
    const verdict = await verify({ amount: 72.2, userId: null, walletCoins: 5000 });

    expect(verdict).toMatchObject({ ok: false, status: 401, code: 'LOGIN_REQUIRED' });
    expect(walletReads).toBe(0);
  });

  it('says so when the wallet cannot be read, and charges nothing', async () => {
    walletError = { message: 'down' };
    const verdict = await verify({ amount: 72.2, walletCoins: 5000 });

    expect(verdict).toMatchObject({ ok: false, status: 503, code: 'WALLET_UNAVAILABLE' });
  });

  it('charges the full price when the customer has no coins', async () => {
    rows.wallets = null;
    const verdict = await verify({ amount: 122.2, walletCoins: 5000 });

    expect(verdict.ok).toBe(true);
    expect(verdict.wallet).toBeNull();
    expect(verdict.charge.walletCoins).toBe(0);
  });

  it('checks out with no coins exactly as before', async () => {
    const verdict = await verify({ amount: 122.2 });

    expect(verdict.ok).toBe(true);
    expect(verdict.wallet).toBeNull();
    expect(verdict.charge.total).toBe(122.2);
    expect(walletReads).toBe(0);
  });

  it.each([[0], [-50], ['abc'], [null], [undefined], [0.9]])('does not touch the wallet for %s coins', async (walletCoins) => {
    const verdict = await verify({ amount: 122.2, walletCoins });

    expect(verdict.ok).toBe(true);
    expect(verdict.wallet).toBeNull();
    expect(walletReads).toBe(0);
  });

  it('reads whole coins from a number sent as text', async () => {
    const verdict = await verify({ amount: 72.2, walletCoins: '5000' });

    expect(verdict.wallet).toEqual({ coins: 5000, amount: 50 });
  });

  it('keys a checkout by its coins, so different coins are a different page', () => {
    const base = { bookingData: { ...bookingData, bookingDetails: { contact: { email: 'a@b.c' } } }, customerEmail: 'a@b.c', total: 72.2 };

    expect(checkoutKey({ ...base, walletCoins: 5000 })).not.toBe(checkoutKey({ ...base, walletCoins: 1000 }));
    expect(checkoutKey({ ...base })).toBe(checkoutKey({ ...base, walletCoins: 0 }));
    expect(checkoutKey({ ...base, walletCoins: 5000 })).not.toBe(checkoutKey({ ...base }));
  });

  it('keys a checkout without coins as it always was', () => {
    const base = { bookingData: { ...bookingData, bookingDetails: { contact: { email: 'a@b.c' } } }, customerEmail: 'a@b.c', total: 72.2 };

    expect(JSON.parse(checkoutKey(base))).toHaveLength(8);
    expect(JSON.parse(checkoutKey({ ...base, walletCoins: 5000 }))).toHaveLength(9);
  });
});
