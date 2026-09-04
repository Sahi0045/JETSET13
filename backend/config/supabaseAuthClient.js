import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * A client for auth operations ONLY — never for reading or writing data.
 *
 * Why this exists, and why nothing may call `supabase.auth.*` on the shared
 * client in `config/supabase.js`:
 *
 * supabase-js resolves the token for every PostgREST request through
 * `SupabaseClient._getAccessToken()`, which is
 *
 *     const { data } = await this.auth.getSession();
 *     return data.session?.access_token ?? this.supabaseKey;
 *
 * So a client only behaves as the service role while it holds no session. The
 * moment anything calls `auth.refreshSession()`, `signInWithPassword()` or
 * `setSession()` on it, that client adopts the user's access token and every
 * subsequent query anywhere in the process runs as that user, under RLS —
 * until the process restarts. `persistSession: false` does not prevent this;
 * it only stops the session being written to storage.
 *
 * Observed in production behaviour: `GET /api/admin/price-settings` returned
 * its real configuration for roughly ten minutes after every restart and then
 * answered 503 "no price_settings row found" indefinitely, while the row was
 * plainly there and a fresh client could read it. The refresh of one signed-in
 * user's session had quietly demoted the shared client, RLS hid the row, and
 * `.single()` reported no rows. Everything the process did afterwards ran as
 * that user.
 *
 * This client uses the anon key, which is the correct credential for the auth
 * endpoints, and holds sessions harmlessly because nothing reads data through
 * it.
 */
const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  throw new Error(
    'Missing Supabase auth configuration: SUPABASE_URL and SUPABASE_ANON_KEY are both required. '
    + 'The anon key is what the auth endpoints expect; do not substitute the service role key here.'
  );
}

const supabaseAuthClient = createClient(supabaseUrl, anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

export default supabaseAuthClient;
