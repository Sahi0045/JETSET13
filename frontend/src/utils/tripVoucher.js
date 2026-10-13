import { apiPost } from './apiHelper';

const UNAVAILABLE = 'The voucher could not be checked just now. Please try again.';

/** The trip-reward voucher for this code, or why not, in words for the customer. */
export async function checkTripVoucher(code) {
  let response;
  try {
    response = await apiPost('wallet/voucher-check', { code: String(code ?? '').trim().toUpperCase() });
  } catch {
    return { ok: false, code: 'WALLET_UNAVAILABLE', message: UNAVAILABLE };
  }
  if (response.status === 401) return { ok: false, code: 'LOGIN_REQUIRED', message: 'Please log in to use a voucher.' };
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (response.ok && body?.success && body.data?.kind === 'trip') {
    return { ok: true, voucher: { code: String(body.data.code), coins: Math.floor(Number(body.data.coins) || 0) } };
  }
  const worded = typeof body?.error === 'string'
    && (String(body.code).startsWith('VOUCHER_') || body.code === 'RATE_LIMITED' || body.code === 'WALLET_UNAVAILABLE');
  return { ok: false, code: body?.code || null, message: worded ? body.error : UNAVAILABLE };
}
