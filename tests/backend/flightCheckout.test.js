import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';

/**
 * Checkout charges what the airline prices, not what the page sends.
 *
 * Hosted checkout took `amount` from the body verbatim. The offer rode in the
 * same payload and nothing priced it, so a two-adult booking was charged four
 * fares plus $90 of add-ons that did not exist, and a tampered request could
 * set any figure. Nothing re-priced before payment either.
 */

const rows = {};
const clientFor = () => ({
  from: vi.fn((table) => {
    const c = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'insert', 'update', 'upsert']) c[m] = vi.fn(() => c);
    c.single = vi.fn(async () => ({ data: rows[table] ?? null, error: null }));
    c.maybeSingle = c.single;
    return c;
  }),
});

const offerFor = (passengers) => ({
  id: '1',
  price: { total: '400.00', currency: 'USD' },
  travelerPricings: Array.from({ length: passengers }, (_, i) => ({ travelerId: String(i + 1), travelerType: 'ADULT' })),
});

const bookingFor = (passengers) => ({
  originalOffer: offerFor(passengers),
  passengerData: Array.from({ length: passengers }, (_, i) => ({ firstName: `P${i}`, lastName: 'Doe' })),
});

const pricedAt = (total, currency = 'USD') => vi.fn().mockResolvedValue({ price: { total: String(total), base: '300.00', currency } });

const verify = async (opts) => {
  const { verifyFlightCharge } = await import('../../backend/services/flightCheckout.service.js');
  return verifyFlightCharge({ client: clientFor(), ...opts });
};

beforeEach(() => {
  vi.resetModules();
  for (const key of Object.keys(rows)) delete rows[key];
  rows.price_settings = { settings: { flight_taxes_fees: 1, flight_taxes_fees_percentage: 0 } };
});

describe('verifyFlightCharge', () => {
  it('accepts the airline fare plus the configured fee, charged once', async () => {
    const result = await verify({ amount: 402, bookingData: bookingFor(2), priceOffer: pricedAt(400) });

    expect(result.ok).toBe(true);
    expect(result.charge.total).toBe(402);
  });

  // The page's old arithmetic: 400 x 2 passengers + 2 x fee.
  it('refuses the multiplied amount and says what the right one is', async () => {
    const result = await verify({ amount: 802, bookingData: bookingFor(2), priceOffer: pricedAt(400) });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(result.code).toBe('PRICE_CHANGED');
    expect(result.charge.total).toBe(402);
  });

  it('refuses a tampered low amount', async () => {
    const result = await verify({ amount: 1, bookingData: bookingFor(2), priceOffer: pricedAt(400) });
    expect(result.code).toBe('PRICE_CHANGED');
  });

  // Found before the card is charged, not after.
  it('refuses when the airline fare moved since the search, and returns the new fare', async () => {
    const result = await verify({ amount: 402, bookingData: bookingFor(2), priceOffer: pricedAt(450) });

    expect(result.code).toBe('PRICE_CHANGED');
    expect(result.pricedFare.total).toBe(450);
    expect(result.charge.total).toBe(452);
  });

  it('refuses more travellers than the fare was priced for', async () => {
    const booking = { ...bookingFor(1), passengerData: [{}, {}] };
    const result = await verify({ amount: 401, bookingData: booking, priceOffer: pricedAt(400) });

    expect(result.code).toBe('PASSENGER_COUNT_MISMATCH');
  });

  it('refuses without an offer to price', async () => {
    const result = await verify({ amount: 401, bookingData: {}, priceOffer: pricedAt(400) });
    expect(result.code).toBe('OFFER_MISSING');
  });

  it('fails closed when the airline cannot price the offer', async () => {
    const result = await verify({
      amount: 401, bookingData: bookingFor(1), priceOffer: vi.fn().mockRejectedValue(new Error('amadeus down')),
    });

    expect(result.status).toBe(503);
    expect(result.code).toBe('PRICE_UNAVAILABLE');
  });

  it('refuses a fare the merchant cannot settle', async () => {
    const result = await verify({ amount: 401, bookingData: bookingFor(1), priceOffer: pricedAt(400, 'EUR') });
    expect(result.code).toBe('CURRENCY_UNSUPPORTED');
  });

  it('fails closed without price settings rather than inventing a fee', async () => {
    rows.price_settings = null;
    const result = await verify({ amount: 401, bookingData: bookingFor(1), priceOffer: pricedAt(400) });
    expect(result.code).toBe('PRICE_CONFIG_UNAVAILABLE');
  });

  it('applies a coupon it evaluated itself', async () => {
    rows.coupons = { id: 'c1', code: 'FLY10', discount_type: 'percentage', discount_value: 10, min_order_value: 0, max_uses: null, applicable_to: 'all', is_active: true };

    const result = await verify({ amount: 361.8, bookingData: bookingFor(2), couponCode: 'FLY10', priceOffer: pricedAt(400) });

    expect(result.ok).toBe(true);
    expect(result.charge.discount).toBe(40.2);
    expect(result.coupon.code).toBe('FLY10');
  });

  it('refuses a coupon that does not exist', async () => {
    rows.coupons = null;
    const result = await verify({ amount: 361.8, bookingData: bookingFor(2), couponCode: 'NOPE', priceOffer: pricedAt(400) });
    expect(result.code).toBe('COUPON_INVALID');
  });
});

describe('hosted checkout for a flight', () => {
  const arcSession = { status: 201, data: { result: 'SUCCESS', session: { id: 'S1' }, successIndicator: 'SI' } };

  const run = async (verdict) => {
    vi.doMock('../../backend/services/flightCheckout.service.js', () => ({
      verifyFlightCharge: vi.fn().mockResolvedValue(verdict),
    }));
    vi.doMock('../../backend/routes/payment/arcpay.config.js', async () => {
      const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
      return {
        ...actual,
        supabase: clientFor(),
        ARC_PAY_CONFIG: { MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw', BASE_URL: 'https://arc.test/api/rest/version/77' },
      };
    });
    const { handleHostedCheckout } = await import('../../backend/routes/payment/checkout.handlers.js');
    const req = createRequest({
      method: 'POST',
      body: { amount: '802.00', orderId: 'FLTX1', bookingType: 'flight', bookingData: bookingFor(2) },
    });
    const res = createResponse();
    await handleHostedCheckout(req, res);
    return res;
  };

  beforeEach(() => {
    axios.post.mockReset();
    axios.post.mockResolvedValue(arcSession);
  });

  it('never opens a payment session for an amount the server did not verify', async () => {
    const res = await run({ ok: false, status: 409, code: 'PRICE_CHANGED', message: 'The total is 402.00 USD.', charge: { total: 402 } });

    expect(res.statusCode).toBe(409);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('charges the verified total, not the amount in the request', async () => {
    await run({ ok: true, charge: { total: 402 }, coupon: null, pricedFare: { total: 400, currency: 'USD' } });

    const sent = axios.post.mock.calls.find(([, body]) => body?.apiOperation === 'INITIATE_CHECKOUT')?.[1];
    expect(sent.order.amount).toBe('402.00');
  });
});
