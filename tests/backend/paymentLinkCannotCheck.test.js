import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * What a payer is told when we could not check an earlier page for their link.
 *
 * Before a new ARC page opens for a payment link, the earlier pages for it are
 * asked about, so a payer who paid and closed the tab is not charged twice.
 * When that check cannot be made - the lookup failed, or ARC answered neither
 * yes nor "never seen" - the answer said "Nothing has been charged". That is
 * exactly when nobody knows: a payer who paid on the earlier page was told
 * they had not. This attempt charged nothing; the earlier one may have.
 */

const LINK_ID = '5a6b7c8d-0000-4000-8000-000000000002';
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

let db = fakeBookingsTable([]);

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    ARC_PAY_CONFIG: { MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw', BASE_URL: 'https://arc.test/api/rest/version/77' },
    getArcPayAuthConfig: () => ({ headers: {} }),
    get supabase() { return { from: (...args) => db.from(...args) }; },
  };
});

const link = { id: LINK_ID, link_token: 'tok-2', status: 'pending', amount: 150, currency: 'USD', booking_type: 'flight', customer_name: 'Sam Lee', customer_email: 'sam@example.com' };

const earlierPage = {
  id: 'pay-old',
  arc_order_id: 'PL-5a6b7c8d-OLDORDER02',
  arc_session_id: 'SESSION-OLD',
  success_indicator: 'SI-OLD',
  payment_status: 'pending',
  amount: 150,
  currency: 'USD',
  metadata: { payment_link_id: LINK_ID, payment_link_token: 'tok-2', order_id: 'PL-5a6b7c8d-OLDORDER02' },
  created_at: minutesAgo(40),
};

const seed = ({ payments = [], fail } = {}) => {
  db = fakeBookingsTable([], { tables: { payment_links: [{ ...link }], payments }, fail });
};

const processLink = async () => {
  const { handleProcessPaymentLink } = await import('../../backend/routes/payment/links.handlers.js');
  const res = createResponse();
  await handleProcessPaymentLink(createRequest({ method: 'POST', body: { token: 'tok-2' } }), res);
  return res;
};

const openedSessions = () => axios.post.mock.calls.filter(([, body]) => body?.apiOperation === 'INITIATE_CHECKOUT');

beforeEach(() => {
  vi.resetModules();
  axios.post.mockReset();
  axios.post.mockResolvedValue({ status: 201, data: { result: 'SUCCESS', session: { id: 'SESSION-NEW' }, successIndicator: 'SI-NEW' } });
  axios.get.mockReset();
  axios.get.mockResolvedValue({ status: 404, data: { result: 'ERROR' } });
});

describe('a payment link whose earlier page could not be checked', () => {
  const expectHonestAnswer = (res) => {
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('PAYMENT_LINK_UNAVAILABLE');
    expect(res.body.error).not.toMatch(/Nothing has been charged/);
    expect(res.body.error).toMatch(/this attempt has not charged you/i);
    expect(res.body.error).toMatch(/do not pay again before contacting us/i);
    expect(res.body.error).toMatch(/\(877\) 538-7380/);
    expect(openedSessions()).toHaveLength(0);
  };

  it('when ARC could not say whether it was paid, does not say nothing was charged', async () => {
    seed({ payments: [earlierPage] });
    axios.get.mockResolvedValue({ status: 503, data: {} });

    expectHonestAnswer(await processLink());
  });

  it('when the earlier pages could not be looked up, does not say nothing was charged', async () => {
    seed({ fail: ({ table, write }) => table === 'payments' && !write });

    expectHonestAnswer(await processLink());
  });

  // Past both checks, an earlier page was confirmed unpaid (or there was none):
  // "nothing has been charged" is true there, and trying again is safe.
  it('still says nothing was charged when only this attempt\'s own records failed', async () => {
    seed({ fail: ({ table, write }) => table === 'bookings' && write?.kind === 'insert' });

    const res = await processLink();

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/Nothing has been charged/);
  });
});
