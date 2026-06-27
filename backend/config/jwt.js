/**
 * Centralized JWT secret.
 *
 * SECURITY: there is NO hardcoded/shared fallback secret. The old
 * 'jetset-app-secret-key' literal was the real hole — a known, guessable
 * value means anyone could forge admin/user tokens.
 *
 * Resolution order:
 *   1. process.env.JWT_SECRET  (the correct, persistent secret — set this)
 *   2. a random per-process secret (un-forgeable) + a loud warning.
 *
 * We deliberately do NOT throw at import: this module is pulled in by the auth
 * chain, and throwing here crash-loops the entire server on any env/ordering
 * hiccup. A random fallback keeps the process alive and secure (tokens just
 * won't survive a restart, which surfaces the misconfiguration safely).
 */
import crypto from 'crypto';
import dotenv from 'dotenv';

// Load env from the standard files (no-op if already loaded / missing).
dotenv.config();
dotenv.config({ path: '.env.local' });

let resolvedSecret = process.env.JWT_SECRET;

if (!resolvedSecret || !String(resolvedSecret).trim()) {
  resolvedSecret = crypto.randomBytes(48).toString('hex');
  console.warn(
    '⚠️  [jwt] JWT_SECRET is not set — using a random per-process secret. ' +
    'Auth tokens will be invalidated on every restart. Set JWT_SECRET in your ' +
    'environment (.env locally, Project Settings on Vercel) for stable sessions.'
  );
}

export const JWT_SECRET = resolvedSecret;
export const JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';
export default JWT_SECRET;
