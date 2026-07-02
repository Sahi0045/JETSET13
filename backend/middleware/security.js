/**
 * security.js — shared security middleware.
 * ─────────────────────────────────────────────────────────────
 * Imported by all three Express entry points so protection can't drift
 * between them. P0 ships rate limiting; helmet/compression/CORS-allowlist
 * are added here in P1.
 *
 * NOTE: the default in-memory store is per-instance and resets on restart —
 * fine for a single monolith (Render/Docker). For multi-instance / serverless
 * (Vercel) a shared store (rate-limit-redis on the existing Redis) is needed
 * for accurate global limits; tracked for a later pass.
 */

import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import compression from 'compression';

const minutes = (n) => n * 60 * 1000;

/**
 * Security headers via helmet.
 *
 * Helmet defaults already ship HSTS, X-Content-Type-Options: nosniff,
 * X-Frame-Options, and a Referrer-Policy. A full script-src 'self' + nonce CSP
 * is intentionally NOT enabled here: this SPA loads from many external origins
 * (Google Fonts/GSI, Supabase, Amadeus, ARC Pay/Mastercard, Sentry, the CDN)
 * and a wrong policy silently breaks the UI. Instead we enable only the CSP
 * directives that harden without blocking resource loads — because there is no
 * `default-src`, unspecified resource types (script/style/img/connect/font)
 * stay unrestricted, so nothing breaks:
 *   - frame-ancestors 'self'  → clickjacking protection (complements X-Frame-Options)
 *   - base-uri 'self'         → blocks <base> tag injection
 *   - object-src 'none'       → blocks Flash/plugin/object embedding
 * A tuned, nonce-based script-src remains a follow-up (needs SSR of the nonce).
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      // Disable default-src on purpose (helmet requires an explicit opt-out):
      // unspecified resource types stay unrestricted so the multi-origin SPA
      // doesn't break. We only add hardening directives below.
      'default-src': helmet.contentSecurityPolicy.dangerouslyDisableDefaultSrc,
      'frame-ancestors': ["'self'"],
      'base-uri': ["'self'"],
      'object-src': ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

/** gzip/deflate response compression. */
export const responseCompression = compression();

/**
 * Shared CORS options — an allowlist (never a credentialed "*", which browsers
 * reject anyway). Override via CORS_ORIGIN (comma-separated) or ALLOWED_ORIGIN.
 * Mirrors the logic already used in backend/server.js so all entries agree.
 */
export function buildCorsOptions() {
  const raw = (process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGIN || '').trim();
  const defaults = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://www.jetsetterss.com',
    'https://jetsetterss.com',
  ];
  const origin =
    raw === '*'
      ? true
      : raw
        ? raw.split(',').map((o) => o.trim()).filter(Boolean)
        : defaults;

  return {
    origin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'x-csrf-token'],
    optionsSuccessStatus: 200,
  };
}

/**
 * General API limiter — generous for normal browsing, caps scrapers/abuse.
 * Skips non-/api traffic (static SPA assets) and health checks (uptime pings).
 */
export const apiLimiter = rateLimit({
  windowMs: minutes(1),
  max: Number(process.env.RATE_LIMIT_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !req.path.startsWith('/api') || req.path.startsWith('/api/health'),
  message: { success: false, message: 'Too many requests, please try again shortly.' },
});

/**
 * Stricter limiter for credential endpoints (login/register/OTP) where abuse
 * is brute-force. Kept off the payment routes deliberately — a legitimate
 * multi-step checkout can make several calls and must not be throttled.
 */
export const authLimiter = rateLimit({
  windowMs: minutes(1),
  max: Number(process.env.RATE_LIMIT_AUTH_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, please slow down and try again.' },
});
