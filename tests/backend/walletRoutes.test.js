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

  const CAPTURED = { data: { status: 'captured' }, error: null };
  const returnCall = () => supabaseMock.rpc.mock.calls.find(([name]) => name === 'wallet_return');

  it('lets staff return coins on a booking, once per press', async () => {
    supabaseMock.rpc.mockResolvedValueOnce(CAPTURED)
      .mockResolvedValueOnce({ data: { status: 'captured', coins: 2000 }, error: null })
      .mockResolvedValueOnce({ data: { coins: 0 }, error: null });
    const res = await run(staffReturn, { body: { bookingReference: 'FLT1', coins: 2000, reason: 'refund' }, user: { id: 's1', role: 'support' } });
    expect(supabaseMock.rpc.mock.calls.map(([name]) => name)).toEqual(['wallet_capture', 'wallet_return', 'wallet_reverse_earn']);
    expect(returnCall()[1]).toMatchObject({ p_ref: 'FLT1', p_coins: 2000 });
    expect(returnCall()[1].p_reason).toMatch(/^desk-/);
    expect(res.body.data.coins).toBe(2000);
  });

  it('captures a hold still held before it returns, so only the coins typed go back', async () => {
    supabaseMock.rpc.mockResolvedValueOnce(CAPTURED)
      .mockResolvedValueOnce({ data: { status: 'captured', coins: 1000, applied: true }, error: null })
      .mockResolvedValueOnce({ data: { coins: 0 }, error: null });
    const res = await run(staffReturn, { body: { bookingReference: 'FLT1', coins: 1000 }, user: { id: 's1', role: 'support' } });
    expect(supabaseMock.rpc.mock.calls[0]).toEqual(['wallet_capture', { p_ref: 'FLT1' }]);
    expect(supabaseMock.rpc.mock.calls[1][0]).toBe('wallet_return');
    expect(supabaseMock.rpc.mock.calls[1][1].p_coins).toBe(1000);
    expect(res.body.data.coins).toBe(1000);
  });

  it('moves nothing, and says so, when the hold cannot be captured', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseMock.rpc.mockResolvedValueOnce({ data: null, error: { message: 'connection reset' } });
    const res = await run(staffReturn, { body: { bookingReference: 'FLT1', coins: 1000 }, user: { id: 's1', role: 'support' } });
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/Nothing changed/);
    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseMock.rpc.mock.calls[0][0]).toBe('wallet_capture');
    silence.mockRestore();
  });

  it('records the staff member and the reason on the return', async () => {
    supabaseMock.rpc.mockResolvedValueOnce(CAPTURED)
      .mockResolvedValueOnce({ data: { status: 'captured', coins: 2000 }, error: null })
      .mockResolvedValueOnce({ data: { coins: 0 }, error: null });
    await run(staffReturn, { body: { bookingReference: 'FLT1', coins: 2000, reason: '  Customer called, flight cancelled  ' }, user: { id: 's1', role: 'support' } });
    expect(returnCall()[1]).toMatchObject({ p_note: 'staff s1: Customer called, flight cancelled' });
    expect(returnCall()[1].p_reason).toMatch(/^desk-\d+$/);
  });

  it('names the desk when staff give no reason, and caps a long one', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { status: 'captured', coins: 0 }, error: null });
    await run(staffReturn, { body: { bookingReference: 'FLT1', coins: 2000, reason: '   ' }, user: { id: 's1', role: 'support' } });
    const notes = () => supabaseMock.rpc.mock.calls.filter(([name]) => name === 'wallet_return').map(([, args]) => args.p_note);
    expect(notes()[0]).toBe('staff s1: Returned by the support desk');
    await run(staffReturn, { body: { bookingReference: 'FLT1', coins: 2000, reason: 'x'.repeat(500) }, user: { id: 's1', role: 'support' } });
    expect(notes()[1]).toBe(`staff s1: ${'x'.repeat(200)}`);
  });

  it('does not say nothing changed when the coins went back but the earned ones could not be taken back', async () => {
    supabaseMock.rpc.mockResolvedValueOnce(CAPTURED)
      .mockResolvedValueOnce({ data: { status: 'captured', coins: 2000 }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'connection reset' } });
    const res = await run(staffReturn, { body: { bookingReference: 'FLT1', coins: 2000 }, user: { id: 's1', role: 'support' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({ coins: 2000, earnedReversed: false });
    expect(res.body.message).toMatch(/earned/i);
    expect(res.body.message).not.toMatch(/nothing changed/i);
  });
});
