import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * Two Pay presses for one trip at the same moment open one payment page.
 *
 * Checkout hands back a page it already opened for the same trip, but the
 * page's row is written only once ARC has answered - up to a minute after the
 * press. Two tabs, two devices or a retry pressing Pay inside that minute both
 * found no page, both opened one, and a customer who finished both was
 * charged twice. The second press now waits for the first and is handed its
 * page.
 */

const CUSTOMER = { id: '0b7c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4' };
const SITE = 'https://www.jetsetterss.com';

const offer = {
  id: '1',
  itineraries: [{ segments: [{ carrierCode: 'LH', number: '401', departure: { iataCode: 'JFK', at: '2026-10-04T18:00:00' }, arrival: { iataCode: 'FRA' } }] }],
  price: { total: '400.00', currency: 'USD' },
  travelerPricings: [{ travelerId: '1', travelerType: 'ADULT' }],
};
const passengers = [
  { firstName: 'Jane', lastName: 'Doe', gender: 'female', dateOfBirth: '1990-01-01', type: 'ADULT', passportNumber: 'X1234567' },
];
const bookingData = { originalOffer: offer, passengerData: passengers, bookingDetails: { contact: { email: 'jane@example.com', phone: '5550100' } } };

const verified = { ok: true, charge: { total: 402 }, coupon: null, pricedFare: { total: 400, currency: 'USD' } };

/** A lock every "server" shares, as Redis is. */
const makeLocks = () => {
  const held = new Map();
  return {
    held,
    acquireLock: vi.fn(async (key) => {
      if (held.has(key)) return { held: true };
      const token = `t${held.size + 1}${Math.random()}`;
      held.set(key, token);
      return { acquired: true, token };
    }),
    releaseLock: vi.fn(async (key, token) => {
      if (held.get(key) === token) held.delete(key);
    }),
  };
};

let locks;

const loadCheckout = async ({ table, lockMock }) => {
  vi.doMock('../../backend/services/flightCheckout.service.js', () => ({ verifyFlightCharge: vi.fn().mockResolvedValue(verified) }));
  vi.doMock('../../backend/services/cache.service.js', () => lockMock);
  vi.doMock('../../backend/routes/payment/arcpay.config.js', async () => {
    const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
    // The database stamps created_at on insert; the fake table does not.
    const from = (name) => {
      const builder = table.from(name);
      const upsert = builder.upsert.bind(builder);
      builder.upsert = (value, options) => upsert({ created_at: new Date().toISOString(), ...value }, options);
      return builder;
    };
    return {
      ...actual,
      supabase: { from },
      ARC_PAY_CONFIG: { MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw', BASE_URL: 'https://arc.test/api/rest/version/77' },
    };
  });
  return import('../../backend/routes/payment/checkout.handlers.js');
};

const press = async (handleHostedCheckout, orderId) => {
  const req = createRequest({
    method: 'POST',
    user: CUSTOMER,
    body: {
      amount: '402.00',
      orderId,
      bookingType: 'flight',
      customerEmail: 'jane@example.com',
      returnUrl: `${SITE}/payment/callback?orderId=${orderId}&bookingType=flight`,
      bookingData,
    },
  });
  const res = createResponse();
  await handleHostedCheckout(req, res);
  return res;
};

const pagesOpened = () => axios.post.mock.calls.filter(([, sent]) => sent?.apiOperation === 'INITIATE_CHECKOUT').length;

beforeEach(() => {
  vi.resetModules();
  locks = makeLocks();
  axios.post.mockReset();
  // ARC takes a moment to open the page, so the two presses overlap.
  let n = 0;
  axios.post.mockImplementation(async () => {
    n += 1;
    const id = `SESSION-${n}`;
    await new Promise((resolve) => setTimeout(resolve, 60));
    return { status: 201, data: { result: 'SUCCESS', session: { id }, successIndicator: `SECRET-${n}` } };
  });
});

afterEach(() => {
  vi.doUnmock('../../backend/services/flightCheckout.service.js');
  vi.doUnmock('../../backend/services/cache.service.js');
  vi.doUnmock('../../backend/routes/payment/arcpay.config.js');
});

describe('two Pay presses for one trip at the same moment', () => {
  it('open one payment page, and the second press is handed it', async () => {
    const table = fakeBookingsTable([]);
    const { handleHostedCheckout } = await loadCheckout({ table, lockMock: locks });

    const [first, second] = await Promise.all([
      press(handleHostedCheckout, 'FLTTABONE1'),
      press(handleHostedCheckout, 'FLTTABTWO2'),
    ]);

    expect(pagesOpened()).toBe(1);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    const opened = [first.body, second.body].find((body) => !body.reused);
    const handedBack = [first.body, second.body].find((body) => body.reused);
    expect(handedBack).toBeDefined();
    expect(handedBack.orderId).toBe(opened.orderId);
    expect(handedBack.checkoutUrl).toBe(opened.checkoutUrl);
  });

  it('lets go of the lock, so the next checkout of the trip is not kept waiting', async () => {
    const table = fakeBookingsTable([]);
    const { handleHostedCheckout } = await loadCheckout({ table, lockMock: locks });

    await press(handleHostedCheckout, 'FLTTABONE1');

    expect(locks.held.size).toBe(0);
    expect(locks.releaseLock).toHaveBeenCalledTimes(1);
  });
});

describe('when the first checkout is still running after the wait', () => {
  it('refuses the second with a message, and opens nothing', async () => {
    const table = fakeBookingsTable([]);
    const busy = { acquireLock: vi.fn(async () => ({ held: true })), releaseLock: vi.fn() };
    const handlers = await loadCheckout({ table, lockMock: busy });
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    try {
      const pending = press(handlers.handleHostedCheckout, 'FLTTABTWO2');
      await vi.advanceTimersByTimeAsync(handlers.CHECKOUT_LOCK_WAIT_MS + 1000);
      const res = await pending;

      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('CHECKOUT_IN_PROGRESS');
      expect(res.body.error).toMatch(/already opening in another tab/);
      expect(pagesOpened()).toBe(0);
      expect(busy.releaseLock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('with no Redis to lock with', () => {
  it('opens the page as it always did', async () => {
    const table = fakeBookingsTable([]);
    const none = { acquireLock: vi.fn(async () => ({ unavailable: true })), releaseLock: vi.fn() };
    const { handleHostedCheckout } = await loadCheckout({ table, lockMock: none });

    const res = await press(handleHostedCheckout, 'FLTTABONE1');

    expect(res.statusCode).toBe(200);
    expect(pagesOpened()).toBe(1);
  });
});

describe('the lock key', () => {
  it('is one trip for one customer, whatever else differs, and nothing when a part is missing', async () => {
    const { checkoutLockKey } = await loadCheckout({ table: fakeBookingsTable([]), lockMock: locks });

    const key = checkoutLockKey({ userId: CUSTOMER.id, bookingData });
    expect(key).toMatch(/^lock:flight-checkout:[0-9a-f]{64}$/);
    // A different phone number is the same trip opened twice.
    expect(checkoutLockKey({ userId: CUSTOMER.id, bookingData: { ...bookingData, bookingDetails: { contact: { phone: '999' } } } })).toBe(key);
    // Another customer's identical trip is not.
    expect(checkoutLockKey({ userId: 'someone-else', bookingData })).not.toBe(key);
    expect(checkoutLockKey({ userId: CUSTOMER.id, bookingData: { ...bookingData, passengerData: [] } })).toBeNull();
  });
});
