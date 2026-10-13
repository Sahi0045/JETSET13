import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseMock } from './setup.js';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { getWallet, redeem, staffReturn } from '../../backend/controllers/wallet.controller.js';

const USER = { id: '0b7c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4', role: 'user' };

const run = async (handler, { body = {}, user = USER } = {}) => {
  const res = createResponse();
  await handler(createRequest({ user, body }), res);
  return res;
};

describe('the customer wallet routes', () => {
  beforeEach(() => { supabaseMock.rpc = vi.fn(); });

  it('redeems a voucher for the signed-in customer, never one named in the body', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { coins: 5000, balance: 5000, code: 'SHUBHAM' }, error: null });
    const res = await run(redeem, { body: { code: ' shubham ', userId: 'someone-else' } });
    expect(supabaseMock.rpc).toHaveBeenCalledWith('redeem_voucher', { p_user: USER.id, p_code: 'SHUBHAM' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({ coins: 5000, balance: 5000, code: 'SHUBHAM' });
  });

  it('answers a used voucher in words, with its code', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'VOUCHER_ALREADY_REDEEMED' } });
    const res = await run(redeem, { body: { code: 'SHUBHAM' } });
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'VOUCHER_ALREADY_REDEEMED', error: 'You have already redeemed this voucher.' });
  });

  it('refuses a malformed code without asking the database', async () => {
    const res = await run(redeem, { body: { code: 'a b' } });
    expect(res.statusCode).toBe(404);
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it('says the wallet is unavailable rather than failing bare', async () => {
    supabaseMock.from.mockImplementationOnce(() => { throw new Error('down'); });
    const res = await run(getWallet);
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('WALLET_UNAVAILABLE');
  });

  it('lets staff return coins on a booking, once per press', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: { status: 'captured', coins: 2000 }, error: null })
      .mockResolvedValueOnce({ data: { coins: 0 }, error: null });
    const res = await run(staffReturn, { body: { bookingReference: 'FLT1', coins: 2000, reason: 'refund' }, user: { id: 's1', role: 'support' } });
    expect(supabaseMock.rpc.mock.calls[0][0]).toBe('wallet_return');
    expect(supabaseMock.rpc.mock.calls[0][1]).toMatchObject({ p_ref: 'FLT1', p_coins: 2000 });
    expect(supabaseMock.rpc.mock.calls[0][1].p_reason).toMatch(/^desk-/);
    expect(supabaseMock.rpc.mock.calls[1][0]).toBe('wallet_reverse_earn');
    expect(res.body.data.coins).toBe(2000);
  });
});
