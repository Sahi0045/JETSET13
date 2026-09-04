import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Nothing may call a session-setting auth method on the shared Supabase client.
 *
 * supabase-js picks the token for every PostgREST request in
 * `SupabaseClient._getAccessToken()`:
 *
 *     const { data } = await this.auth.getSession();
 *     return data.session?.access_token ?? this.supabaseKey;
 *
 * A client is only the service role while it holds no session.
 * `refreshSession()`, `setSession()` and the `signIn*` family all call
 * `_saveSession()`, so one call on the shared client silently demotes every
 * query in the process to that user, under RLS, until restart.
 *
 * What that looked like in production: `/api/admin/price-settings` served the
 * real configuration for ~10 minutes after each restart and then answered 503
 * "no price_settings row found" forever, with the row plainly present. Worse,
 * `User.findByEmail()` reads through the same client, so once demoted it
 * returned nothing and login answered "Invalid credentials" for correct
 * passwords.
 *
 * `getUser(jwt)` is fine and deliberately not listed: passing an explicit token
 * short-circuits to `_getUser(jwt)` and never saves a session.
 */

// fileURLToPath, not .pathname: this project lives under a path with spaces,
// and .pathname leaves them percent-encoded, so every fs call gets ENOENT.
const BACKEND = fileURLToPath(new URL('../../backend', import.meta.url));

/** Every .js file under backend/, minus the two clients themselves. */
const backendFiles = (dir = BACKEND, acc = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules') backendFiles(full, acc);
    } else if (entry.endsWith('.js')) {
      acc.push(full);
    }
  }
  return acc;
};

// These own their own clients on purpose and never read data through them.
const EXEMPT = ['config/supabaseAuthClient.js', 'routes/supabaseAuth.js'];

const SESSION_SETTERS = /\b(refreshSession|setSession|signInWithPassword|signInWithOAuth|signInWithOtp|signUp)\s*\(/;

describe('the shared supabase client is never demoted to a user session', () => {
  it('no module calls a session-setting auth method on the shared client', () => {
    const offenders = [];

    for (const file of backendFiles()) {
      const rel = file.slice(BACKEND.length + 1);
      if (EXEMPT.some((e) => rel.endsWith(e))) continue;

      const source = readFileSync(file, 'utf8');
      // Only files that import the shared client can misuse it.
      if (!/from\s+['"][^'"]*config\/supabase\.js['"]/.test(source)) continue;

      for (const line of source.split('\n')) {
        if (/supabase\.auth\./.test(line) && SESSION_SETTERS.test(line)) {
          offenders.push(`${rel}: ${line.trim()}`);
        }
      }
    }

    expect(offenders, 'use supabaseAuthClient.js for these').toEqual([]);
  });

  // The reason the exemption above is safe.
  it('the dedicated auth client is not the service role', () => {
    const source = readFileSync(join(BACKEND, 'config/supabaseAuthClient.js'), 'utf8');
    expect(source).toContain('SUPABASE_ANON_KEY');
    expect(source).not.toMatch(/createClient\([^)]*SERVICE_ROLE/);
  });

  // Reading data through the auth client would reintroduce the bug from the
  // other direction: that client DOES hold sessions.
  it('nothing queries tables through the auth client', () => {
    const offenders = [];

    for (const file of backendFiles()) {
      const rel = file.slice(BACKEND.length + 1);
      if (rel.endsWith('config/supabaseAuthClient.js')) continue;

      const source = readFileSync(file, 'utf8');
      const match = source.match(/import\s+(\w+)\s+from\s+['"][^'"]*supabaseAuthClient\.js['"]/);
      if (!match) continue;

      const name = match[1];
      if (new RegExp(`\\b${name}\\.from\\s*\\(`).test(source)) offenders.push(rel);
    }

    expect(offenders, 'use the shared client for data').toEqual([]);
  });
});
