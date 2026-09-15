import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Headers for calling our own API as the signed-in customer.
 *
 * Web customers carry the httpOnly `jt_access` cookie as well as a Supabase
 * token, and `protect` uses the cookie whenever it is present - which demands
 * the CSRF token on a write. This helper sent only the Bearer token, so My
 * Trips' flight cancel (DELETE /api/flights/order) answered 403 "CSRF token
 * mismatch" for every signed-in customer.
 */

const getSession = vi.fn();
vi.mock('../../frontend/src/lib/supabase', () => ({ default: { auth: { getSession: (...args) => getSession(...args) } } }));

const setCookie = (value) => {
  document.cookie = value === null ? 'jt_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' : `jt_csrf=${value}; path=/`;
};

beforeEach(() => {
  getSession.mockReset();
  vi.resetModules();
});

afterEach(() => setCookie(null));

describe('authHeaders', () => {
  it('sends the CSRF token alongside the Bearer token when the browser holds one', async () => {
    setCookie('csrf-123');
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    const { authHeaders } = await import('../../frontend/src/utils/authHeaders.js');

    expect(await authHeaders({ 'Content-Type': 'application/json' })).toEqual({
      Authorization: 'Bearer tok',
      'X-CSRF-Token': 'csrf-123',
      'Content-Type': 'application/json',
    });
  });

  it('sends no CSRF header without the cookie, and stays anonymous without a session', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const { authHeaders } = await import('../../frontend/src/utils/authHeaders.js');

    expect(await authHeaders({ Accept: 'application/json' })).toEqual({ Accept: 'application/json' });
  });

  it('still sends the CSRF token when the session cannot be read', async () => {
    setCookie('csrf-456');
    getSession.mockRejectedValue(new Error('offline'));
    const { authHeaders } = await import('../../frontend/src/utils/authHeaders.js');

    expect(await authHeaders()).toEqual({ 'X-CSRF-Token': 'csrf-456' });
  });
});
