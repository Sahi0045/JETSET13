import supabase from '../lib/supabase';

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
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}`, ...extra } : { ...extra };
  } catch {
    return { ...extra };
  }
}
