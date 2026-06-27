/**
 * cache.service.js
 * ─────────────────────────────────────────────────────────────
 * Centralised Redis caching layer for JETSET13.
 * ioredis is already in package.json — just add REDIS_URL to .env
 *
 * Usage:
 *   import { withCache, invalidate, invalidatePattern } from './cache.service.js';
 *
 *   // In a controller:
 *   const results = await withCache(
 *     `flights:${from}:${to}:${date}`,
 *     300,                          // TTL in seconds
 *     () => amadeusService.searchFlights(params)
 *   );
 */

import Redis from 'ioredis';

// ─── Connection ──────────────────────────────────────────────
let redis;

function getRedisClient() {
  if (!redis) {
    // Accept any of the common connection-string names that managed Redis providers
    // (Upstash/Vercel Marketplace, Vercel KV, Render, etc.) may inject — so you don't
    // have to force the value specifically into REDIS_URL. Only accept a real Redis
    // protocol URL (redis:// or rediss://); ignore https REST endpoints like
    // UPSTASH_REDIS_REST_URL, which ioredis can't use.
    const candidates = [
      process.env.REDIS_URL,
      process.env.KV_URL,
      process.env.REDIS_TLS_URL,
      process.env.UPSTASH_REDIS_URL,
      process.env.STORAGE_REDIS_URL,
    ];
    const redisUrl = candidates.find(
      (u) => typeof u === 'string' && /^rediss?:\/\//i.test(u.trim())
    );

    if (!redisUrl) {
      console.warn('[Cache] No Redis URL found (REDIS_URL/KV_URL/...) — caching disabled, all calls pass through.');
      return null;
    }

    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 5) {
          console.error('[Cache] Redis connection failed after 5 retries — disabling cache.');
          redis = null;
          return null; // stop retrying
        }
        return Math.min(times * 200, 2000);
      },
    });

    redis.on('connect',  () => console.log('[Cache] Redis connected ✅'));
    redis.on('error',    (err) => console.error('[Cache] Redis error:', err.message));
    redis.on('close',    () => console.warn('[Cache] Redis connection closed'));
  }
  return redis;
}

// ─── TTL Constants (seconds) ─────────────────────────────────
export const TTL = {
  FLIGHT_SEARCH:      5  * 60,   //  5 minutes
  HOTEL_SEARCH:       5  * 60,   //  5 minutes
  VISA_REQUIREMENTS:  60 * 60,   //  1 hour
  ANALYTICS_DASH:     15 * 60,   // 15 minutes
  USER_PROFILE:       10 * 60,   // 10 minutes
  GEO_LOCATION:       24 * 60 * 60, // 24 hours
  // Home-page "browse" data (cheapest-dates, inspiration, price-analysis, calendar prices).
  // These change slowly, so a long TTL turns "N visits × M Amadeus calls" into
  // "M calls per route per TTL window" — the bulk of the Amadeus cost saving.
  FLIGHT_BROWSE:      12 * 60 * 60, // 12 hours
  FLIGHT_CALENDAR:    6  * 60 * 60, //  6 hours
};

// ─── Core helpers ────────────────────────────────────────────

/**
 * Read from cache; if miss, execute fetchFn, store, and return.
 * Falls back to fetchFn directly when Redis is unavailable.
 *
 * @param {string}   key        - Cache key
 * @param {number}   ttl        - TTL in seconds
 * @param {Function} fetchFn    - Async function that returns fresh data
 * @returns {Promise<any>}
 */
export async function withCache(key, ttl, fetchFn) {
  const client = getRedisClient();

  if (!client) {
    return fetchFn(); // no-op passthrough when Redis is down
  }

  try {
    const cached = await client.get(key);
    if (cached !== null) {
      console.log(`[Cache] HIT: ${key}`);
      return JSON.parse(cached);
    }

    console.log(`[Cache] MISS: ${key}`);
    const data = await fetchFn();

    // Don't cache null / undefined results
    if (data !== null && data !== undefined) {
      await client.setex(key, ttl, JSON.stringify(data));
    }

    return data;
  } catch (err) {
    console.error(`[Cache] Error for key "${key}":`, err.message);
    // Fallback: bypass cache on error
    return fetchFn();
  }
}

/**
 * Invalidate a single cache key.
 * @param {string} key
 */
export async function invalidate(key) {
  const client = getRedisClient();
  if (!client) return;
  try {
    await client.del(key);
    console.log(`[Cache] Invalidated: ${key}`);
  } catch (err) {
    console.error(`[Cache] Invalidation failed for "${key}":`, err.message);
  }
}

/**
 * Invalidate all keys matching a glob pattern.
 * Example: invalidatePattern('flights:JNB:*')
 * ⚠️ Uses SCAN — safe for production (non-blocking).
 *
 * @param {string} pattern - Glob pattern
 */
export async function invalidatePattern(pattern) {
  const client = getRedisClient();
  if (!client) return;

  try {
    let cursor = '0';
    let deleted = 0;

    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;

      if (keys.length > 0) {
        await client.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== '0');

    console.log(`[Cache] Pattern "${pattern}" — ${deleted} key(s) invalidated.`);
  } catch (err) {
    console.error(`[Cache] Pattern invalidation failed for "${pattern}":`, err.message);
  }
}

/**
 * Store a value directly (no fetchFn).
 * @param {string} key
 * @param {any}    value
 * @param {number} ttl   - seconds
 */
export async function set(key, value, ttl) {
  const client = getRedisClient();
  if (!client) return;
  try {
    await client.setex(key, ttl, JSON.stringify(value));
  } catch (err) {
    console.error(`[Cache] Set failed for "${key}":`, err.message);
  }
}

/**
 * Read a value directly.
 * @param {string} key
 * @returns {Promise<any|null>}
 */
export async function get(key) {
  const client = getRedisClient();
  if (!client) return null;
  try {
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error(`[Cache] Get failed for "${key}":`, err.message);
    return null;
  }
}

/**
 * Health check — used in /api/health endpoint.
 * @returns {Promise<{status: string, latencyMs?: number}>}
 */
export async function healthCheck() {
  const client = getRedisClient();
  if (!client) return { status: 'disabled' };

  try {
    const start = Date.now();
    await client.ping();
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}

// ─── Key Builders ─────────────────────────────────────────────
// Centralised key naming — prevents typos across controllers.

export const CacheKeys = {
  flightSearch: (from, to, date, travelers) =>
    `flights:${from}:${to}:${date}:${travelers}`,

  hotelSearch: (city, checkIn, checkOut, guests) =>
    `hotels:${city}:${checkIn}:${checkOut}:${guests}`,

  visaRequirements: (nationality, destination) =>
    `visa:req:${nationality}:${destination}`,

  analyticsData: (period) =>
    `analytics:dashboard:${period}`,

  userProfile: (userId) =>
    `user:profile:${userId}`,

  geoLocation: (ip) =>
    `geo:${ip}`,

  // Generic builder for flight "browse" endpoints (cheapest-dates, inspiration, etc.).
  // Pass a kind + an ordered list of params; undefined/empty parts collapse to '' so
  // the key is stable for the same logical query.
  flightBrowse: (kind, parts = []) =>
    `flights:browse:${kind}:${parts.map((p) => (p === undefined || p === null ? '' : p)).join(':')}`,
};
