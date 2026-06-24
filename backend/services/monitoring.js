/**
 * monitoring.js — centralized error-reporting abstraction.
 * ─────────────────────────────────────────────────────────────
 * A thin, provider-agnostic wrapper so the rest of the codebase can call
 * `reportError(err)` without knowing whether a provider is wired up.
 *
 * Today it logs and no-ops on the remote side. In P2 `initSentry()` attaches
 * the real Sentry client; nothing else in the codebase needs to change.
 *
 * `reportError()` is intentionally crash-proof — it must never throw, because
 * it is called from the error handler and the process crash guards.
 */

let provider = null; // set by initSentry() in P2

export function isMonitoringEnabled() {
  return Boolean(provider);
}

/**
 * Initialize the monitoring provider (Sentry) when SENTRY_DSN is set.
 * No-op otherwise, so local/dev and unconfigured deploys just work.
 * Safe to call at boot from every entry point; runs async, never throws.
 */
export async function initMonitoring() {
  if (provider) return provider;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return null;

  try {
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
    });
    provider = Sentry;
    console.log('[Monitoring] Sentry initialized ✅');
    return provider;
  } catch (err) {
    console.error('[Monitoring] Failed to init Sentry:', err?.message);
    return null;
  }
}

/** Allow the P2 Sentry wiring to register itself without circular imports. */
export function _setProvider(p) {
  provider = p;
}

/**
 * Report an error to the monitoring provider and always log it locally.
 * @param {Error|any} error
 * @param {object} [context] - extra tags/metadata for triage
 */
export function reportError(error, context = {}) {
  try {
    if (provider && typeof provider.captureException === 'function') {
      provider.captureException(error, { extra: context });
    }
  } catch {
    // Reporting must never throw or mask the original error.
  }
}
