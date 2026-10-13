import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkTripVoucher } from '../../frontend/src/utils/tripVoucher.js';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());

describe('checking a trip voucher from the browser', () => {
  it('asks the wallet with the code uppercased and gives back the voucher', async () => {
    const fetch = vi.fn(async () => json(200, { success: true, data: { kind: 'trip', code: 'SHUBHAM', coins: 5000 } }));
    vi.stubGlobal('fetch', fetch);

    expect(await checkTripVoucher(' shubham ')).toEqual({ ok: true, voucher: { code: 'SHUBHAM', coins: 5000 } });
    expect(String(fetch.mock.calls[0][0])).toMatch(/\/wallet\/voucher-check$/);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ code: 'SHUBHAM' });
  });

  it("passes on the server's words for a refusal", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(409, { success: false, code: 'VOUCHER_WRONG_KIND', error: 'Redeem this code in Profile → Jet Wallet.' })));
    expect(await checkTripVoucher('WELCOME50')).toEqual({ ok: false, code: 'VOUCHER_WRONG_KIND', message: 'Redeem this code in Profile → Jet Wallet.' });
  });

  it('asks a signed-out customer to log in', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(401, { success: false, message: 'Not authorized' })));
    expect(await checkTripVoucher('SHUBHAM')).toEqual({ ok: false, code: 'LOGIN_REQUIRED', message: 'Please log in to use a voucher.' });
  });

  it('never shows raw server text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(500, { success: false, error: 'jwt expired' })));
    expect((await checkTripVoucher('SHUBHAM')).message).toBe('The voucher could not be checked just now. Please try again.');
  });

  it('says so when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await checkTripVoucher('SHUBHAM')).toEqual({ ok: false, code: 'WALLET_UNAVAILABLE', message: 'The voucher could not be checked just now. Please try again.' });
  });
});
