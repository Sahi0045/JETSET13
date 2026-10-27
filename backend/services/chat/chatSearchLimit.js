import { get, set } from '../cache.service.js';

const LIMIT = 10;
const WINDOW_SECONDS = 3600;

const local = new Map();

async function current(key, now) {
  const shared = await get(key);
  const own = local.get(key);
  const live = [shared, own].filter((entry) => entry && entry.resetAt > now);
  return live.reduce((best, entry) => (entry.count > best.count ? entry : best), { count: 0, resetAt: now + WINDOW_SECONDS * 1000 });
}

// Each chat search is a live Amadeus search, counted against the office's
// look-to-book ratio, so a session and an address each get a soft hourly cap.
export async function takeSearchSlot({ sessionId, ip }, now = Date.now()) {
  const keys = [sessionId && `chat:fs:s:${sessionId}`, ip && `chat:fs:ip:${ip}`].filter(Boolean);
  const entries = await Promise.all(keys.map((key) => current(key, now)));
  if (entries.some((entry) => entry.count >= LIMIT)) return false;

  if (local.size > 10000) {
    for (const [key, entry] of local) if (entry.resetAt <= now) local.delete(key);
  }
  await Promise.all(keys.map((key, index) => {
    const next = { count: entries[index].count + 1, resetAt: entries[index].resetAt };
    local.set(key, next);
    return set(key, next, WINDOW_SECONDS);
  }));
  return true;
}
