import express from 'express';
import axios from 'axios';

const router = express.Router();

// Currencies the app supports (USD base)
const SUPPORTED = ['USD', 'INR', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'JPY', 'THB'];

// Static fallback (only used if the live FX API is unreachable)
const FALLBACK_RATES = {
  USD: 1, INR: 83.35, EUR: 0.92, GBP: 0.79, AED: 3.67,
  SGD: 1.34, AUD: 1.53, CAD: 1.36, JPY: 149.5, THB: 35.5,
};

// In-memory cache (shared across requests on this instance)
let cache = { rates: null, fetchedAt: 0, source: null };
const TTL_MS = 60 * 60 * 1000; // refresh hourly

async function fetchLiveRates() {
  // Primary: open.er-api.com (free, no key, USD base)
  try {
    const r = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 8000 });
    if (r.data?.result === 'success' && r.data.rates) {
      const rates = { USD: 1 };
      SUPPORTED.forEach((c) => { if (r.data.rates[c] != null) rates[c] = r.data.rates[c]; });
      return { rates, source: 'open.er-api.com', updated: r.data.time_last_update_utc };
    }
  } catch (e) {
    console.warn('⚠️ open.er-api.com FX fetch failed:', e.message);
  }
  // Fallback: frankfurter (ECB, no key) — limited currency set
  try {
    const symbols = SUPPORTED.filter((c) => c !== 'USD').join(',');
    const r = await axios.get(`https://api.frankfurter.dev/v1/latest?base=USD&symbols=${symbols}`, { timeout: 8000 });
    if (r.data?.rates) {
      const rates = { USD: 1, ...r.data.rates };
      return { rates, source: 'frankfurter.dev', updated: r.data.date };
    }
  } catch (e) {
    console.warn('⚠️ frankfurter FX fetch failed:', e.message);
  }
  return null;
}

// GET /api/currency/rates — live USD-based exchange rates (cached hourly)
router.get('/rates', async (req, res) => {
  try {
    const now = Date.now();
    if (cache.rates && now - cache.fetchedAt < TTL_MS) {
      return res.json({ success: true, base: 'USD', rates: cache.rates, fetchedAt: cache.fetchedAt, source: cache.source, cached: true });
    }

    const live = await fetchLiveRates();
    if (live) {
      cache = { rates: live.rates, fetchedAt: now, source: live.source };
      return res.json({ success: true, base: 'USD', rates: live.rates, fetchedAt: now, source: live.source, updated: live.updated, cached: false });
    }

    // Couldn't reach any FX API — serve last cache if we have one, else static fallback
    if (cache.rates) {
      return res.json({ success: true, base: 'USD', rates: cache.rates, fetchedAt: cache.fetchedAt, source: cache.source, stale: true });
    }
    return res.json({ success: false, base: 'USD', rates: FALLBACK_RATES, source: 'fallback' });
  } catch (error) {
    console.error('❌ Currency rates error:', error);
    res.json({ success: false, base: 'USD', rates: cache.rates || FALLBACK_RATES, source: 'fallback' });
  }
});

export default router;
