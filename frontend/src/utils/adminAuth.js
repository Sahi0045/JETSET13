/**
 * Auth headers for the admin panel's `fetch` calls.
 *
 * The auth cutover moved sessions to httpOnly cookies (`jt_access`, with
 * `jt_csrf` alongside for double-submit). Nothing writes `adminToken`,
 * `token` or `supabase_token` to localStorage any more — but every admin page
 * still read one of those and bailed out when it found nothing:
 *
 *     const token = localStorage.getItem('adminToken') || ...;
 *     if (!token) { setLoading(false); return; }
 *
 * So a signed-in admin saw an empty dashboard — zeros everywhere, no requests
 * made at all — with one console line as the only clue. The backend was fine
 * throughout: `protect` prefers the cookie and only falls back to Bearer.
 *
 * These helpers send the cookie (the caller must pass `credentials: 'include'`)
 * and still forward a Bearer token if one happens to exist, so any client that
 * does hold one keeps working.
 */

const readCookie = (name) => {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
};

/** A legacy/mobile bearer token, if this client still has one. Usually null. */
export const getStoredToken = () => {
  try {
    return localStorage.getItem('adminToken')
      || localStorage.getItem('token')
      || localStorage.getItem('supabase_token')
      || null;
  } catch {
    // Private browsing and blocked site data both throw on access.
    return null;
  }
};

/**
 * Headers for an admin request.
 *
 * `x-csrf-token` is required by the backend for cookie-authenticated requests
 * that change state; it is harmless on a GET, so it is always included when the
 * cookie is present rather than making every call site decide.
 */
export const adminHeaders = (extra = {}) => {
  const token = getStoredToken();
  const csrf = readCookie('jt_csrf');

  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    ...extra,
  };
};

/**
 * `fetch` with the admin session attached.
 *
 * `credentials: 'include'` is the part that actually authenticates now — omit
 * it and the cookie never leaves the browser.
 */
export const adminFetch = (url, options = {}) => fetch(url, {
  ...options,
  credentials: 'include',
  headers: adminHeaders(options.headers),
});

/**
 * Read an admin API response, and treat a dead session as a dead session.
 *
 * The client-side gate is `adminUser` in localStorage, which never expires. The
 * credential is an httpOnly cookie, which does. When the cookie lapsed the
 * panel kept rendering — the flag was still there — while every call came back
 * 401/403. Pages then checked `result.success`, found it absent, and showed
 * their empty state: Bookings said "No Bookings Found" against a full database,
 * and cancelling reported "Failed to cancel booking" with no reason.
 *
 * So an expired session was indistinguishable from an empty system or a broken
 * feature. This clears the stale flags and sends the admin back to log in,
 * which is the only thing that actually fixes it.
 *
 * @param {Response} response
 * @returns {Promise<object>} the parsed body
 * @throws {Error} with `.sessionExpired` when the session is gone
 */
export const readAdminResponse = async (response) => {
  if (response.status === 401 || response.status === 403) {
    try {
      localStorage.removeItem('adminUser');
      localStorage.removeItem('isSuperAdmin');
      localStorage.removeItem('isAuthenticated');
    } catch {
      // Private browsing throws on access; the redirect below still applies.
    }
    const error = new Error('Your admin session has expired. Please sign in again.');
    error.sessionExpired = true;
    throw error;
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) {
    // Backends here answer with `error` on some routes and `message` on others.
    throw new Error(body?.error || body?.message || `Request failed (${response.status})`);
  }
  return body;
};
