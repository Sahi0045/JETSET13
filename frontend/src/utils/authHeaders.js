import supabase from '../lib/supabase';
import { getCookie } from './apiHelper';

/**
 * `Authorization: Bearer <supabase access token>` for calling our own API.
 *
 * Web users authenticate purely through the Supabase client (no server session
 * cookie), so backend routes behind `protect` need the access token sent
 * explicitly. `protect` verifies it via `verifySupabaseToken`. Returns an empty
 * object when there is no session, so anonymous calls simply stay anonymous
 * (and the endpoint answers 401) rather than throwing.
 */
export async function authHeaders(extra = {}) {
  // The session cookie's CSRF pair, whenever the browser holds one. Web
  // customers also carry the httpOnly `jt_access` cookie, and `protect` uses the
  // cookie whenever it is present - which requires this token on anything that
  // changes state. Without it every signed-in customer's DELETE
  // /api/flights/order from My Trips answered 403 "CSRF token mismatch": nobody
  // could cancel a flight there. Harmless on a read.
  const csrf = getCookie('jt_csrf');
  const csrfHeader = csrf ? { 'X-CSRF-Token': csrf } : {};
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}`, ...csrfHeader, ...extra } : { ...csrfHeader, ...extra };
  } catch {
    return { ...csrfHeader, ...extra };
  }
}
