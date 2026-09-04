/**
 * logger.js — structured application logging via pino.
 * ─────────────────────────────────────────────────────────────
 * Replaces ad-hoc console.* in critical paths with leveled, JSON-structured
 * logs (pretty-printed in development). Secrets are redacted automatically.
 *
 * Migration is intentionally incremental — wire this into new/critical code
 * (error handler, crash guards, payment/auth paths) first; the rest of the
 * console.* calls can be migrated over time.
 *
 *   import logger from './logger.js';
 *   logger.info({ userId }, 'booking created');
 *   logger.error(err, 'payment failed');
 */

import pino from 'pino';

const isDev = process.env.NODE_ENV === 'development';

const baseOptions = {
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  // Never log secrets, even if they slip into a logged object.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      'cardNumber',
      '*.cardNumber',
      'cvv',
      '*.cvv',
      'apiPassword',
      '*.apiPassword',

      // Amadeus SOAP. The envelope carries the WS-Security digest, and a
      // booking envelope carries every passenger's name, date of birth and
      // passport number in plain text.
      'wsse',
      '*.wsse',
      'envelope',
      '*.envelope',
      'securityToken',
      '*.securityToken',

      // Traveller PII. A flight order is the most sensitive payload this
      // service handles: names, dates of birth, passport numbers and contact
      // details, for several people at once.
      'passengerData',
      '*.passengerData',
      'travelers',
      '*.travelers',
      'travellerInfo',
      '*.travellerInfo',
      'documents',
      '*.documents',
      'passportNumber',
      '*.passportNumber',
      'dateOfBirth',
      '*.dateOfBirth',
      'emailAddress',
      '*.emailAddress',
    ],
    censor: '***',
  },
};

// Pretty logs in dev — but never let a missing/broken transport crash the app.
function createLogger() {
  if (isDev) {
    try {
      return pino({
        ...baseOptions,
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
        },
      });
    } catch {
      // pino-pretty unavailable — fall back to plain JSON logs.
      return pino(baseOptions);
    }
  }
  return pino(baseOptions);
}

export const logger = createLogger();

export default logger;
