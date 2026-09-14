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

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
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
    'http://localhost:8081',   // Expo web (Metro)
    'http://localhost:19006',  // Expo web (classic)
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
 * Per-IP limiter for the flight endpoints that reach Amadeus: search, price,
 * upsell, fare rules, seat maps, the three date-price calendars and flight
 * status. They are
 * unauthenticated and each call spends GDS capacity (and the booking lane's
 * slots), so a scraper under the general 300/min could spend all of it here.
 * Applied inside flight.routes.js, which every entry point mounts - so it
 * cannot drift between them, and Vercel's second `/flights` mount has it too.
 *
 * What the site itself sends, one request per line, counted from the pages:
 *  - results page: 1 search; 1 date-prices for the 7-day strip (one request,
 *    seven dates); 1 cheapest-dates (+1 calendar-prices fallback) when the
 *    date picker opens; 1 date-prices per month in the fare calendar; 1 upsell
 *    per "View prices"; 1 search + 1 date-prices per date clicked in the strip.
 *  - review page: 1 price, 2 fare-rules (cancellation card and rules panel),
 *    1 seatmaps, and 1 search if the traveller group changes.
 * A full search-to-review pass is about ten. A hurried customer who clicks
 * every date in the strip, opens fare options on a dozen flights and pages the
 * calendar stays under forty in a minute. 120 is three times that, with room
 * for a household or office sharing one address. RATE_LIMIT_FLIGHT_MAX tunes it.
 *
 * Same in-memory store as the other limiters (see the note at the top of this
 * file): on Vercel each instance counts separately, so the effective limit
 * there is looser, never stricter.
 */
export const flightSearchLimiter = rateLimit({
  windowMs: minutes(1),
  max: Number(process.env.RATE_LIMIT_FLIGHT_MAX || 120),
  standardHeaders: true,
  legacyHeaders: false,
  // `error` is what the flight pages show; `message` matches the other limiters.
  message: {
    success: false,
    code: 'RATE_LIMITED',
    error: 'Too many flight searches from your connection. Please wait a minute and try again.',
    message: 'Too many flight searches from your connection. Please wait a minute and try again.',
  },
});

/** The email a guest offers as proof: the booking lookup's header, or the cancel's body. */
const guestProofEmail = (req) => String(req.get?.('x-booking-email') || req.body?.email || '').trim();

/** The booking that email is offered for: the lookup's path, or the cancel's body. */
const guestProofReference = (req) =>
  String(req.params?.bookingRef || req.body?.bookingReference || '').trim().toUpperCase().slice(0, 64);

/**
 * Wrong guesses at a guest booking's email.
 *
 * A guest opens their booking with its reference and the email it was made with
 * (GET /flights/bookings/:ref, `x-booking-email`) and cancels it the same way
 * (POST /payments?action=cancel-booking, body `email`). Both were bounded only
 * by the general 300/min, and references sit in URLs and emails, so anyone
 * holding one could try hundreds of addresses a minute until one opened it.
 *
 * What counts, and why:
 *  - only a request that presents an email. One without cannot open anybody's
 *    booking, so a signed-in owner, staff, and a guest's first visit to the
 *    link - which asks without an email and is shown the email form - are free;
 *  - only a failed one. A guest who reopens their booking all day is never
 *    throttled, and one who mistypes their address has ten tries in a quarter
 *    of an hour before being asked to wait;
 *  - per address AND reference, not per address. /api/flights is served from
 *    Lightsail behind Vercel's rewrite, where req.ip is a Vercel edge shared by
 *    many visitors (deploy/README.md). A per-address count there would pool
 *    every guest on that edge, so one attacker - or a few typists - would lock
 *    them all out. With the reference in the key a guest shares a count only
 *    with other attempts at their own booking.
 *
 * Refused before the booking is looked up, so a 429 says nothing about whether
 * the reference exists, and a miss is still the same flat 404.
 * RATE_LIMIT_GUEST_BOOKING_MAX tunes it. In-memory like the others: on Vercel,
 * where the cancel runs, each instance counts on its own.
 */
export const guestBookingLimiter = rateLimit({
  windowMs: minutes(15),
  max: Number(process.env.RATE_LIMIT_GUEST_BOOKING_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: (req) => !guestProofEmail(req),
  keyGenerator: (req) => `${ipKeyGenerator(req.ip || '')}|${guestProofReference(req)}`,
  // `error` is what Manage Booking and the cancel dialog show.
  message: {
    success: false,
    code: 'RATE_LIMITED',
    error: 'Too many attempts with the wrong email for this booking. Please wait 15 minutes and try again.',
    message: 'Too many attempts with the wrong email for this booking. Please wait 15 minutes and try again.',
  },
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
