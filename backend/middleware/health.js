/**
 * health.js — readiness probe.
 * ─────────────────────────────────────────────────────────────
 * `/api/health` (already defined per-entry) is a cheap liveness check.
 * This adds a deeper readiness check that actually pings dependencies, so
 * load balancers / uptime monitors can tell a degraded instance from a healthy
 * one. Returns 200 when critical deps are up, 503 when they're not.
 */

import supabase from '../config/supabase.js';
import { healthCheck as redisHealth } from '../services/cache.service.js';

export async function readinessHandler(req, res) {
  const checks = {};

  // Supabase is the critical dependency.
  try {
    const { error } = await supabase.from('users').select('count').single();
    checks.supabase = error ? { status: 'error', message: error.message } : { status: 'ok' };
  } catch (e) {
    checks.supabase = { status: 'error', message: e?.message };
  }

  // Redis is optional — healthCheck() returns { status: 'disabled' } when unset.
  checks.redis = await redisHealth();

  const ready = checks.supabase.status === 'ok';
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  });
}

export default readinessHandler;
