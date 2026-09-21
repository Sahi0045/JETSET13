import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';

/**
 * POST /api/payments?action=session-create opened a real session on the live
 * merchant for anyone who asked, with no login, and handed back ARC's whole
 * reply. Nothing calls it: the web app, the mobile app and the backend all open
 * payment pages through hosted checkout, a quote or a payment link, each of
 * which creates its own session with an order behind it.
 */

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    ARC_PAY_CONFIG: { MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw', BASE_URL: 'https://arc.test/api/rest/version/77' },
  };
});

beforeEach(() => {
  vi.resetModules();
  axios.post.mockReset();
  axios.post.mockResolvedValue({ status: 201, data: { result: 'SUCCESS', merchant: 'TESTMERCHANT', session: { id: 'SESSION-BARE', version: '1' } } });
});

describe('session-create', () => {
  it('opens no session on the merchant, for anyone', async () => {
    const { handleSessionCreate } = await import('../../backend/routes/payment/checkout.handlers.js');
    for (const user of [null, { id: 'u-1', role: 'user' }]) {
      const res = createResponse();
      await handleSessionCreate(createRequest({ method: 'POST', user }), res);

      expect(res.statusCode).toBe(410);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body)).not.toContain('SESSION-BARE');
    }
    expect(axios.post).not.toHaveBeenCalled();
  });
});
