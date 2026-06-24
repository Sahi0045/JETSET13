/**
 * processGuards.js — process-level resilience.
 * ─────────────────────────────────────────────────────────────
 * Without these, a single stray promise rejection (an Amadeus/Supabase call
 * that rejects in a path with no .catch) can silently crash — or zombie — the
 * whole Node process. This module:
 *
 *   • catches `unhandledRejection` / `uncaughtException`, logs + reports them
 *   • shuts down gracefully on SIGTERM/SIGINT — stop accepting connections,
 *     drain in-flight requests, then exit (mirrors the pattern already used in
 *     backend/jobs/content-indexing.js:269)
 *
 * Install once per process, after the HTTP server is created so it can be
 * drained. On Vercel (serverless) there is no long-lived server — pass no
 * `server` and only the rejection/exception reporters are installed.
 */

import { reportError } from '../services/monitoring.js';
import defaultLogger from '../services/logger.js';

let guardsInstalled = false;
let shuttingDown = false;

export function installProcessGuards({ server = null, logger = defaultLogger, onShutdown } = {}) {
  if (guardsInstalled) return;
  guardsInstalled = true;

  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(`Unhandled rejection: ${reason}`);
    logger.error('[processGuards] Unhandled promise rejection:', err);
    reportError(err, { kind: 'unhandledRejection' });
    // Deliberately do NOT exit: one rejected promise shouldn't take the whole
    // server down, but it must be visible and reported instead of swallowed.
  });

  process.on('uncaughtException', (err) => {
    logger.error('[processGuards] Uncaught exception:', err);
    reportError(err, { kind: 'uncaughtException' });
    // An uncaught exception leaves the process in an undefined state — drain
    // and exit non-zero so the platform (Render/PM2/Docker) restarts cleanly.
    gracefulShutdown('uncaughtException', { server, logger, onShutdown, exitCode: 1 });
  });

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM', { server, logger, onShutdown, exitCode: 0 }));
  process.on('SIGINT', () => gracefulShutdown('SIGINT', { server, logger, onShutdown, exitCode: 0 }));
}

function gracefulShutdown(reason, { server, logger = console, onShutdown, exitCode = 0 }) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.warn(`[processGuards] Shutting down (${reason})…`);

  // Backstop: if draining hangs, force-exit so we never wedge forever.
  const forceTimer = setTimeout(() => {
    logger.error('[processGuards] Graceful shutdown timed out — forcing exit.');
    process.exit(exitCode || 1);
  }, 10000);
  forceTimer.unref();

  const finish = async () => {
    try {
      if (typeof onShutdown === 'function') await onShutdown();
    } catch (e) {
      logger.error('[processGuards] onShutdown hook failed:', e);
    }
    clearTimeout(forceTimer);
    process.exit(exitCode);
  };

  if (server && typeof server.close === 'function') {
    server.close(() => {
      logger.warn('[processGuards] HTTP server closed — no longer accepting connections.');
      finish();
    });
  } else {
    finish();
  }
}
