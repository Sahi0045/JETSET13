/**
 * monitoring.js (frontend) — Sentry error reporting.
 * ─────────────────────────────────────────────────────────────
 * No-op unless VITE_SENTRY_DSN is set. Sentry is dynamically imported so it
 * stays out of the main bundle when monitoring isn't configured.
 *
 *   import { initMonitoring, reportError } from '@/lib/monitoring';
 *   initMonitoring();            // call once at startup (main.jsx)
 *   reportError(err, { extra }); // report a caught error
 */

let sentry = null;

export async function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn || sentry) return;
  try {
    const S = await import('@sentry/react');
    S.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || 0),
    });
    sentry = S;
  } catch (err) {
    // Never let monitoring setup break the app.
    console.error('[Monitoring] Sentry init failed:', err);
  }
}

export function reportError(error, context) {
  try {
    if (sentry) sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    /* reporting must never throw */
  }
}
