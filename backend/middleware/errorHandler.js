/**
 * errorHandler.js — shared 404 + central error-handling middleware.
 * ─────────────────────────────────────────────────────────────
 * Extracted from the per-entry copies so all three Express entry points
 * (server.js, backend/server.js, backend/api/index.js) behave identically.
 * Mount AFTER all routes:
 *
 *   app.use(notFoundHandler);   // 404 for unmatched routes
 *   app.use(errorHandler);      // central error handler (4 args)
 */

import { reportError } from '../services/monitoring.js';
import logger from '../services/logger.js';

const isDev = () => process.env.NODE_ENV === 'development';

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
    path: req.path,
    method: req.method,
  });
}

// eslint-disable-next-line no-unused-vars — Express requires the 4-arg signature.
export function errorHandler(err, req, res, next) {
  // If the response has already started streaming, defer to Express' default.
  if (res.headersSent) return next(err);

  const status = err?.status || err?.statusCode || 500;

  logger.error(
    {
      err: { message: err?.message, stack: isDev() ? err?.stack : undefined },
      status,
      path: req?.path,
      method: req?.method,
    },
    'request error',
  );

  // Report genuine server faults (5xx) to monitoring; skip noisy client 4xx.
  if (status >= 500) {
    reportError(err, { path: req?.path, method: req?.method });
  }

  // CORS rejections surface as a clear 403 instead of an opaque 500.
  if (err?.message?.includes('Not allowed by CORS')) {
    return res.status(403).json({
      success: false,
      message: 'CORS error: Origin not allowed',
    });
  }

  res.status(status).json({
    success: false,
    message: err?.message || 'Internal server error',
    stack: isDev() ? err?.stack : undefined,
  });
}
