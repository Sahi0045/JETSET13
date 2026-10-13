import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

const CUSTOMER = { id: '0b7c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4' };
const SITE = 'https://www.jetsetterss.com';
const offer = {
  id: '1',
  itineraries: [{ segments: [{ carrierCode: 'DL', number: '713', departure: { iataCode: 'JFK', at: '2026-11-03T08:00:00' }, arrival: { iataCode: 'LAX' } }] }],
  price: { total: '120.00', currency: 'USD' },
  travelerPricings: [{ travelerId: '1', travelerType: 'ADULT' }],
};
const bookingData = {
  originalOffer: offer,
  passengerData: [{ firstName: 'Jane', lastName: 'Doe', gender: 'female', dateOfBirth: '1990-01-01', type: 'ADULT' }],
  bookingDetails: { contact: { email: 'jane@example.com', phone: '5550100' } },
};

const FULL_PRICE = 122.2;
const cents = (value) => Math.round(value * 100) / 100;
const verdictFor = (coins) => ({
  ok: true,
  charge: { total: cents(FULL_PRICE - coins / 100), walletAmount: coins / 100, walletCoins: coins },
  coupon: null,
  wallet: coins > 0 ? { coins, amount: coins / 100 } : null,
  pricedFare: { total: 120, currency: 'USD' },
});
const cardFor = (coins) => cents(FULL_PRICE - coins / 100).toFixed(2);

const walletError = (code) => Object.assign(new Error(code), { code });
const held = () => vi.fn().mockResolvedValue({ status: 'held', created: true, coins: 5000, balance: 0 });

const harness = async ({ rows = [], holdCoins = held(), releaseCoins: releaseOverride, fail } = {}) => {
  const events = [];
  const releaseCoins = releaseOverride ?? vi.fn(async () => {
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    events.push('released');
    return { status: 'released', coins: 5000 };
  });
  const table = fakeBookingsTable(rows, { fail, tables: { wallet_holds: [] } });
  const tablesRead = [];
  const holds = () => table.from('wallet_holds');
  const verifyFlightCharge = vi.fn(async ({ walletCoins }) => verdictFor(Math.floor(Number(walletCoins) || 0)));
  vi.doMock('../../backend/services/flightCheckout.service.js', () => ({ verifyFlightCharge }));
  vi.doMock('../../backend/services/wallet.service.js', () => ({
    holdCoins: async (client, args) => {
      const reply = await holdCoins(client, args);
      if (reply?.created === true) {
        await holds().insert({ booking_reference: args.bookingReference, user_id: args.userId, coins: args.coins, status: 'held' });
      }
      return reply;
    },
    releaseCoins: async (client, ref) => {
      const reply = await releaseCoins(client, ref);
      await holds().update({ status: 'released' }).eq('booking_reference', ref);
      return reply;
    },
  }));
  vi.doMock('../../backend/services/cache.service.js', async () => ({
    ...(await vi.importActual('../../backend/services/cache.service.js')),
    acquireLock: vi.fn(async () => ({ acquired: true, token: 'lock' })),
    releaseLock: vi.fn(async () => {}),
  }));
  vi.doMock('../../backend/routes/payment/arcpay.config.js', async () => {
    const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
    // The database stamps created_at on insert; the fake table does not.
    const from = (name) => {
      tablesRead.push(name);
      const builder = table.from(name);
      const upsert = builder.upsert.bind(builder);
      builder.upsert = (value, options) => upsert({ created_at: new Date().toISOString(), ...value }, options);
      return builder;
    };
    return { ...actual, supabase: { from }, ARC_PAY_CONFIG: { MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw', BASE_URL: 'https://arc.test/api/rest/version/77' } };
  });
  const { handleHostedCheckout } = await import('../../backend/routes/payment/checkout.handlers.js');

  const post = async (body = {}) => {
    const orderId = body.orderId ?? 'FLTCOINS1';
    const walletCoins = body.walletCoins ?? 5000;
    const req = createRequest({
      method: 'POST',
      user: CUSTOMER,
      body: {
        amount: cardFor(walletCoins),
        orderId,
        bookingType: 'flight',
        walletCoins,
        customerEmail: 'jane@example.com',
        returnUrl: `${SITE}/payment/callback?orderId=${orderId}&bookingType=flight`,
        bookingData,
        ...body,
      },
    });
    const res = createResponse();
    const json = res.json.bind(res);
    res.json = (data) => {
      events.push('response');
      return json(data);
    };
    await handleHostedCheckout(req, res);
    return res;
  };
  return { post, table, verifyFlightCharge, holdCoins, releaseCoins, events, holds, tablesRead };
};

const arcPages = () => axios.post.mock.calls.filter(([, sent]) => sent?.apiOperation === 'INITIATE_CHECKOUT');
const openedAPage = () => arcPages().length > 0;
const arcOpens = () => axios.post.mockResolvedValue({ status: 201, data: { result: 'SUCCESS', session: { id: 'S1' }, successIndicator: 'I1' } });

beforeEach(() => {
  vi.resetModules();
  axios.post.mockReset();
});

afterEach(() => {
  vi.doUnmock('../../backend/services/flightCheckout.service.js');
  vi.doUnmock('../../backend/services/wallet.service.js');
  vi.doUnmock('../../backend/services/cache.service.js');
  vi.doUnmock('../../backend/routes/payment/arcpay.config.js');
});

describe('the hosted checkout holds coins', () => {
  it('a hold refused for coins spent in another tab answers WALLET_CHANGED and opens no page', async () => {
    const { post, releaseCoins } = await harness({ holdCoins: vi.fn().mockRejectedValue(walletError('INSUFFICIENT_COINS')) });
    const res = await post();

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('WALLET_CHANGED');
    expect(openedAPage()).toBe(false);
    expect(releaseCoins).not.toHaveBeenCalled();
  });

  it('a reference already holding other coins answers WALLET_CHANGED, and releases nothing that is not ours', async () => {
    const { post, releaseCoins } = await harness({ holdCoins: vi.fn().mockRejectedValue(walletError('HOLD_CONFLICT')) });
    const res = await post();

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('WALLET_CHANGED');
    expect(openedAPage()).toBe(false);
    expect(releaseCoins).not.toHaveBeenCalled();
  });

  it('a wallet that cannot be reached answers WALLET_UNAVAILABLE and opens no page', async () => {
    const { post, releaseCoins } = await harness({ holdCoins: vi.fn().mockRejectedValue(walletError('WALLET_UNAVAILABLE')) });
    const res = await post();

    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('WALLET_UNAVAILABLE');
    expect(res.body.error).toMatch(/Nothing has been charged/);
    expect(openedAPage()).toBe(false);
    expect(releaseCoins).not.toHaveBeenCalled();
  });

  it('a hold that answers anything but held is not a hold, and opens no page', async () => {
    const { post, releaseCoins } = await harness({ holdCoins: vi.fn().mockResolvedValue({ status: 'captured', coins: 5000 }) });
    const res = await post();

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('WALLET_CHANGED');
    expect(openedAPage()).toBe(false);
    expect(releaseCoins).not.toHaveBeenCalled();
  });

  it('holds the coins under the checkout reference and keeps them when the page opens', async () => {
    arcOpens();
    const { post, holdCoins, releaseCoins } = await harness();
    const res = await post();

    expect(res.statusCode).toBe(200);
    expect(holdCoins).toHaveBeenCalledTimes(1);
    expect(holdCoins).toHaveBeenCalledWith(expect.anything(), { userId: CUSTOMER.id, bookingReference: 'FLTCOINS1', coins: 5000 });
    expect(releaseCoins).not.toHaveBeenCalled();
  });

  it('takes the coins before any payment page exists', async () => {
    arcOpens();
    const { post, holdCoins } = await harness();
    await post();

    expect(holdCoins.mock.invocationCallOrder[0]).toBeLessThan(axios.post.mock.invocationCallOrder[0]);
  });

  it('charges the card the verified amount and records the coins on the booking row', async () => {
    arcOpens();
    const { post, table, verifyFlightCharge } = await harness();
    await post();

    expect(verifyFlightCharge).toHaveBeenCalledWith(expect.objectContaining({ walletCoins: 5000, userId: CUSTOMER.id }));
    expect(arcPages()[0][1].order.amount).toBe('72.20');
    const row = table.row('FLTCOINS1');
    expect(row.total_amount).toBe(72.2);
    expect(row.booking_details.verified_charge).toMatchObject({
      total: 72.2,
      walletAmount: 50,
      walletCoins: 5000,
      wallet: { coins: 5000, amount: 50 },
    });
  });

  it('gives the coins back when the payment page could not be opened', async () => {
    axios.post.mockRejectedValue(new Error('ARC down'));
    const { post, releaseCoins, events } = await harness();
    const res = await post();

    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    expect(releaseCoins).toHaveBeenCalledTimes(1);
    expect(releaseCoins).toHaveBeenCalledWith(expect.anything(), 'FLTCOINS1');
    expect(events).toEqual(['released', 'response']);
  });

  it('gives the coins back when the gateway answers without a session', async () => {
    axios.post.mockResolvedValue({ status: 201, data: { result: 'SUCCESS' } });
    const { post, releaseCoins, events } = await harness();
    const res = await post();

    expect(res.statusCode).toBe(500);
    expect(releaseCoins).toHaveBeenCalledTimes(1);
    expect(releaseCoins).toHaveBeenCalledWith(expect.anything(), 'FLTCOINS1');
    expect(events).toEqual(['released', 'response']);
  });

  it('gives the coins back when the booking row could not be written, and hands over no page', async () => {
    arcOpens();
    const { post, releaseCoins, events } = await harness({ fail: ({ write }) => write?.kind === 'upsert' });
    const res = await post();

    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('CHECKOUT_NOT_RECORDED');
    expect(res.body).not.toHaveProperty('checkoutUrl');
    expect(releaseCoins).toHaveBeenCalledTimes(1);
    expect(releaseCoins).toHaveBeenCalledWith(expect.anything(), 'FLTCOINS1');
    expect(events).toEqual(['released', 'response']);
  });

  it('answers as it would have even when the coins cannot be given back, and tries once', async () => {
    axios.post.mockRejectedValue(new Error('ARC down'));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { post, releaseCoins } = await harness({ releaseCoins: vi.fn().mockRejectedValue(walletError('WALLET_UNAVAILABLE')) });
    const res = await post();

    expect(releaseCoins).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Failed to create hosted checkout');
    expect(errors.mock.calls.flat().join(' ')).toMatch(/could not be released/);
    errors.mockRestore();
  });

  it('touches no coins for a checkout that uses none', async () => {
    arcOpens();
    const { post, holdCoins, releaseCoins, table } = await harness();
    const res = await post({ walletCoins: 0 });

    expect(res.statusCode).toBe(200);
    expect(holdCoins).not.toHaveBeenCalled();
    expect(releaseCoins).not.toHaveBeenCalled();
    expect(table.row('FLTCOINS1').booking_details.verified_charge.wallet).toBeNull();
  });

  it('touches no coins when the checkout fails with none held', async () => {
    axios.post.mockRejectedValue(new Error('ARC down'));
    const { post, holdCoins, releaseCoins } = await harness();
    await post({ walletCoins: 0 });

    expect(holdCoins).not.toHaveBeenCalled();
    expect(releaseCoins).not.toHaveBeenCalled();
  });
});

describe('a second checkout on a reference that already holds its coins', () => {
  const otherPhone = { ...bookingData, bookingDetails: { contact: { email: 'jane@example.com', phone: '5550199' } } };

  it.each([
    ['a repeat of the hold', { status: 'held', created: false, coins: 5000 }],
    ['a reply that does not say it made the hold', { status: 'held', coins: 5000 }],
  ])('never gives back the coins behind the first request\'s live page: %s', async (_name, repeat) => {
    arcOpens();
    const holdCoins = vi.fn()
      .mockResolvedValueOnce({ status: 'held', created: true, coins: 5000, balance: 0 })
      .mockResolvedValueOnce(repeat);
    const { post, releaseCoins, table } = await harness({ holdCoins });
    const first = await post({ orderId: 'FLTCOINS1' });
    expect(first.statusCode).toBe(200);

    axios.post.mockReset();
    axios.post.mockRejectedValue(new Error('ARC down'));
    const second = await post({ orderId: 'FLTCOINS1', bookingData: otherPhone });

    expect(holdCoins).toHaveBeenCalledTimes(2);
    expect(arcPages()).toHaveLength(1);
    expect(second.statusCode).toBe(500);
    expect(releaseCoins).not.toHaveBeenCalled();
    expect(table.row('FLTCOINS1').booking_details.verified_charge.wallet).toEqual({ coins: 5000, amount: 50 });
  });

  it('gives nothing back either when it opens a page of its own', async () => {
    arcOpens();
    const holdCoins = vi.fn()
      .mockResolvedValueOnce({ status: 'held', created: true, coins: 5000, balance: 0 })
      .mockResolvedValueOnce({ status: 'held', created: false, coins: 5000 });
    const { post, releaseCoins } = await harness({ holdCoins });
    await post({ orderId: 'FLTCOINS1' });
    const second = await post({ orderId: 'FLTCOINS1', bookingData: otherPhone });

    expect(second.statusCode).toBe(200);
    expect(releaseCoins).not.toHaveBeenCalled();
  });
});

describe('a stored coin checkout is handed back only while its coins are still held', () => {
  const retry = async (harnessOptions, spoil) => {
    arcOpens();
    const setup = await harness(harnessOptions);
    const first = await setup.post({ orderId: 'FLTCOINS1' });
    expect(first.statusCode).toBe(200);
    await spoil?.(setup);

    axios.post.mockClear();
    setup.holdCoins.mockClear();
    const second = await setup.post({ orderId: 'FLTCOINS2' });
    return { ...setup, second };
  };

  it('hands the page back when the hold is still held for those coins', async () => {
    const { second, holdCoins, tablesRead } = await retry();

    expect(second.body).toMatchObject({ reused: true, orderId: 'FLTCOINS1' });
    expect(openedAPage()).toBe(false);
    expect(holdCoins).not.toHaveBeenCalled();
    expect(tablesRead).toContain('wallet_holds');
  });

  it.each([
    ['released', async ({ holds }) => { await holds().update({ status: 'released' }).eq('booking_reference', 'FLTCOINS1'); }],
    ['captured', async ({ holds }) => { await holds().update({ status: 'captured' }).eq('booking_reference', 'FLTCOINS1'); }],
    ['held for other coins', async ({ holds }) => { await holds().update({ coins: 3000 }).eq('booking_reference', 'FLTCOINS1'); }],
    ['not there at all', async ({ holds }) => { await holds().delete().eq('booking_reference', 'FLTCOINS1'); }],
  ])('opens a new page and a new hold when the hold is %s', async (_name, spoil) => {
    const { second, holdCoins } = await retry({}, spoil);

    expect(second.statusCode).toBe(200);
    expect(second.body.reused).toBeUndefined();
    expect(second.body.orderId).toBe('FLTCOINS2');
    expect(openedAPage()).toBe(true);
    expect(holdCoins).toHaveBeenCalledTimes(1);
    expect(holdCoins).toHaveBeenCalledWith(expect.anything(), { userId: CUSTOMER.id, bookingReference: 'FLTCOINS2', coins: 5000 });
  });

  it('opens a new page and a new hold when the hold cannot be read', async () => {
    const unreadable = ({ table: name, write, patch }) => name === 'wallet_holds' && !write && !patch;
    arcOpens();
    const { post, holdCoins } = await harness({ fail: unreadable });
    await post({ orderId: 'FLTCOINS1' });

    axios.post.mockClear();
    holdCoins.mockClear();
    const second = await post({ orderId: 'FLTCOINS2' });

    expect(second.body.reused).toBeUndefined();
    expect(openedAPage()).toBe(true);
    expect(holdCoins).toHaveBeenCalledTimes(1);
  });

  it('never reads the wallet holds for a checkout that used no coins', async () => {
    arcOpens();
    const { post, tablesRead } = await harness();
    await post({ orderId: 'FLTCOINS1', walletCoins: 0, amount: '122.20' });
    const second = await post({ orderId: 'FLTCOINS2', walletCoins: 0, amount: '122.20' });

    expect(second.body).toMatchObject({ reused: true, orderId: 'FLTCOINS1' });
    expect(tablesRead).not.toContain('wallet_holds');
  });
});

describe('a retry of a trip whose payment page is open with coins held', () => {
  it('is handed the page it already has, and holds no coins a second time', async () => {
    arcOpens();
    const { post, holdCoins, verifyFlightCharge, releaseCoins } = await harness();
    const first = await post({ orderId: 'FLTCOINS1' });
    expect(first.statusCode).toBe(200);

    axios.post.mockClear();
    const second = await post({ orderId: 'FLTCOINS2' });

    expect(second.statusCode).toBe(200);
    expect(second.body).toMatchObject({ success: true, reused: true, orderId: 'FLTCOINS1', sessionId: 'S1' });
    expect(openedAPage()).toBe(false);
    expect(holdCoins).toHaveBeenCalledTimes(1);
    expect(holdCoins).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ bookingReference: 'FLTCOINS1' }));
    expect(verifyFlightCharge).toHaveBeenCalledTimes(1);
    expect(releaseCoins).not.toHaveBeenCalled();
  });

  it('is not handed that page with different coins, which is a different total', async () => {
    arcOpens();
    const { post, holdCoins, releaseCoins } = await harness();
    await post({ orderId: 'FLTCOINS1', walletCoins: 5000 });

    axios.post.mockClear();
    const second = await post({ orderId: 'FLTCOINS2', walletCoins: 1000 });

    expect(second.statusCode).toBe(200);
    expect(second.body.reused).toBeUndefined();
    expect(second.body.orderId).toBe('FLTCOINS2');
    expect(openedAPage()).toBe(true);
    expect(arcPages()[0][1].order.amount).toBe('112.20');
    expect(holdCoins).toHaveBeenCalledTimes(2);
    expect(holdCoins).toHaveBeenLastCalledWith(expect.anything(), { userId: CUSTOMER.id, bookingReference: 'FLTCOINS2', coins: 1000 });
    expect(releaseCoins).not.toHaveBeenCalled();
  });

  it('is not handed a coin page by a checkout that uses no coins', async () => {
    arcOpens();
    const { post, holdCoins, table } = await harness();
    await post({ orderId: 'FLTCOINS1', walletCoins: 5000 });

    axios.post.mockClear();
    const second = await post({ orderId: 'FLTCOINS2', walletCoins: 0, amount: '122.20' });

    expect(second.body.reused).toBeUndefined();
    expect(second.body.orderId).toBe('FLTCOINS2');
    expect(openedAPage()).toBe(true);
    expect(holdCoins).toHaveBeenCalledTimes(1);
    expect(table.row('FLTCOINS2').booking_details.verified_charge.wallet).toBeNull();
  });
});

describe('the coins a payment page holds outlast the page', () => {
  it('stays shorter than the time a checkout waits before its coins are given back', async () => {
    const { CHECKOUT_REUSE_WINDOW_MS, ARC_PAGE_TIMEOUT_SECONDS } = await import('../../backend/routes/payment/checkout.handlers.js');
    const { PAYABLE_MS } = await import('../../backend/jobs/abandonedCheckout.job.js');

    expect(CHECKOUT_REUSE_WINDOW_MS).toBeLessThan(ARC_PAGE_TIMEOUT_SECONDS * 1000);
    expect(CHECKOUT_REUSE_WINDOW_MS).toBeLessThan(PAYABLE_MS);
  });
});
