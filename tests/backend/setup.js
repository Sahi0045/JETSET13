/**
 * tests/backend/setup.js
 * Setup file for ALL backend (node environment) tests.
 * Mocks Supabase, external HTTP clients, and email service globally.
 */

import { vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

// ─── Supabase mock ───────────────────────────────────────────
// Every model uses supabase from '../config/supabase.js'
// We mock it once here so individual tests can override per-method.

const mockSupabaseChain = () => {
  const chain = {
    select:  vi.fn().mockReturnThis(),
    insert:  vi.fn().mockReturnThis(),
    update:  vi.fn().mockReturnThis(),
    delete:  vi.fn().mockReturnThis(),
    upsert:  vi.fn().mockReturnThis(),
    eq:      vi.fn().mockReturnThis(),
    ilike:   vi.fn().mockReturnThis(),
    gt:      vi.fn().mockReturnThis(),
    lt:      vi.fn().mockReturnThis(),
    gte:     vi.fn().mockReturnThis(),
    lte:     vi.fn().mockReturnThis(),
    order:   vi.fn().mockReturnThis(),
    limit:   vi.fn().mockReturnThis(),
    range:   vi.fn().mockReturnThis(),
    // Used by the booking-chain claim's compare-and-set. Missing methods make a
    // mocked chain throw mid-route, which reads as a route bug rather than a
    // gap in the mock, so mirror the real builder.
    is:      vi.fn().mockReturnThis(),
    neq:     vi.fn().mockReturnThis(),
    or:      vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single:  vi.fn().mockResolvedValue({ data: null, error: null }),
    // Final resolution — tests override this per-case
    then:    undefined,
  };
  // Make the chain itself thenable so await works on it
  chain[Symbol.toStringTag] = 'MockSupabaseQuery';
  return chain;
};

export const supabaseMock = {
  from: vi.fn(() => mockSupabaseChain()),
  auth: {
    signUp:          vi.fn(),
    signInWithPassword: vi.fn(),
    signOut:         vi.fn(),
    getUser:         vi.fn(),
    getSession:      vi.fn(),
  },
  storage: {
    from: vi.fn(() => ({
      upload:   vi.fn().mockResolvedValue({ data: {}, error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://cdn.test/file.pdf' } }),
    })),
  },
};

vi.mock('../../backend/config/supabase.js', () => ({
  default: supabaseMock,
}));

// The auth-only client. Mocked for the same reason as the shared one: it
// throws at import when its credentials are absent, and CI has no
// SUPABASE_ANON_KEY. Its `auth` is deliberately separate from supabaseMock's -
// a test that asserts nothing calls auth on the SHARED client would pass
// trivially if both pointed at the same object.
vi.mock('../../backend/config/supabaseAuthClient.js', () => ({
  default: {
    auth: {
      refreshSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      setSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: vi.fn(),
    },
  },
}));

// ─── Axios mock (Google token verify, Amadeus) ───────────────
vi.mock('axios', () => ({
  default: {
    get:  vi.fn(),
    post: vi.fn(),
  },
}));

// ─── Email service mock (prevent real sends in tests) ────────
vi.mock('../../backend/services/emailService.js', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ id: 'email-mock-id' }),
  sendBookingConfirmationEmail: vi.fn().mockResolvedValue({ id: 'email-mock-id' }),
  sendApplicationApprovedEmail: vi.fn().mockResolvedValue({ id: 'email-mock-id' }),
  sendApplicationRejectedEmail: vi.fn().mockResolvedValue({ id: 'email-mock-id' }),
  sendStatusUpdateEmail: vi.fn().mockResolvedValue({ id: 'email-mock-id' }),
}));

// ─── Redis / Cache mock ───────────────────────────────────────
vi.mock('../../backend/services/cache.service.js', () => ({
  withCache: vi.fn((key, ttl, fn) => fn()),  // passthrough in tests
  invalidate: vi.fn().mockResolvedValue(undefined),
  invalidatePattern: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue(null),
  healthCheck: vi.fn().mockResolvedValue({ status: 'disabled' }),
  // Mirrors the real module's surface. It previously stopped at three TTLs and
  // three key builders, so any route reaching for CacheKeys.flightBrowse threw
  // a TypeError, hit its own catch and soft-failed - the test still passed, for
  // entirely the wrong reason. Keep this in step with cache.service.js.
  TTL: {
    FLIGHT_SEARCH: 300,
    HOTEL_SEARCH: 300,
    VISA_REQUIREMENTS: 3600,
    ANALYTICS_DASH: 900,
    USER_PROFILE: 600,
    GEO_LOCATION: 86400,
    FLIGHT_BROWSE: 43200,
    FLIGHT_CALENDAR: 21600,
  },
  CacheKeys: {
    flightSearch: (f, t, d, p) => `flights:${f}:${t}:${d}:${p}`,
    hotelSearch:  (c, ci, co, g) => `hotels:${c}:${ci}:${co}:${g}`,
    visaRequirements: (n, d) => `visa:req:${n}:${d}`,
    analyticsData: (period) => `analytics:dashboard:${period}`,
    userProfile: (id) => `user:profile:${id}`,
    geoLocation: (ip) => `geo:${ip}`,
    flightBrowse: (kind, parts = []) => `flights:browse:${kind}:${parts.join(':')}`,
  },
}));

// ─── JWT mock helpers ─────────────────────────────────────────
export const TEST_JWT_SECRET = 'test-secret-key';
process.env.JWT_SECRET = TEST_JWT_SECRET;
process.env.JWT_EXPIRE  = '1h';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.NODE_ENV = 'test';

// ─── Config required at import time ───────────────────────────
// Several modules validate configuration at module scope and throw when it is
// absent - arcpay.config.js and backend/config/supabase.js both do, by design,
// so a misconfigured deploy fails at boot rather than mid-payment. That makes
// them a hard import-time dependency of anything downstream: flight.routes.js
// imports the payment handlers for the refund-on-fulfilment-failure path, so it
// cannot even be loaded without these. A developer .env supplies them locally,
// which is why their absence only ever surfaced in CI.
//
// These are placeholders. Every outbound call is mocked; nothing here reaches a
// real gateway, and no value is a credential.
process.env.SUPABASE_URL ??= 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
process.env.SUPABASE_ANON_KEY ??= 'test-anon-key';
process.env.ARC_PAY_MERCHANT_ID ??= 'TESTMERCHANT';
process.env.ARC_PAY_API_PASSWORD ??= 'test-api-password';
process.env.ARC_PAY_BASE_URL ??= 'https://api.test.arcpay.invalid/api/rest/version/77';

// ─── Reset between tests ──────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});
