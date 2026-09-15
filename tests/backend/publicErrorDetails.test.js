import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Public payment and booking answers carry no internal error text.
 *
 * PR #110 removed it from hosted checkout and the payment-detail reads. The rest
 * still sent the raw exception, database or gateway message to whoever called:
 * the payment router's catch-all, get-pending-booking, reconcile, session
 * create, the guest cancel, payment links, agent login, and the flight order
 * cancel, bookings list and analytics fallbacks. Each is logged server-side;
 * the caller gets the handler's own wording. Admin-only endpoints keep their
 * detail, because the admin panel shows it.
 */

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const REMOVED = {
  'backend/routes/payment.routes.js': ['details: error.message'],
  'backend/routes/payment/checkout.handlers.js': [
    "success: false, error: error.message",
    'details: error.response?.data?.error?.explanation || error.message',
    'details: result.error',
  ],
  'backend/routes/payment/links.handlers.js': [
    "'Failed to get payment link', details",
    'details: error.response?.data || error.message',
  ],
  'backend/routes/payment/agents.handlers.js': ["'Login failed', details"],
  'backend/routes/payment/operations.handlers.js': [
    "'Failed to cancel booking', details",
    'details: updateError.message',
  ],
  'backend/routes/flight.routes.js': [
    'fallback: true, error: error.message',
    'data: [], error: error.message',
    "error.message || 'Failed to cancel flight order'",
    "error.message || 'Failed to fetch bookings'",
  ],
};

describe('public payment and booking answers', () => {
  for (const [path, patterns] of Object.entries(REMOVED)) {
    it(`send no internal error text: ${path}`, () => {
      const text = source(path);
      for (const pattern of patterns) {
        expect(text, `${pattern} must not come back in ${path}`).not.toContain(pattern);
      }
    });
  }
});
