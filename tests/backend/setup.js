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
    // Service-role admin surface. Password recovery goes through
    // `admin.generateLink`, because Supabase Auth is where the password the
    // login form checks actually lives.
    admin: {
      generateLink:   vi.fn(),
      listUsers:      vi.fn(),
      updateUserById: vi.fn(),
    },
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
// `sendEmail` and the default export matter as much as the named senders:
// email.routes.js imports the module default and calls `emailService.sendEmail`,
// so omitting them made every route email throw inside the route's own
// try/catch - the test still passed, for the wrong reason, having sent nothing.
const sendEmailMock = vi.fn().mockResolvedValue({ id: 'email-mock-id' });
const emailServiceMock = {
  sendEmail: sendEmailMock,
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ id: 'email-mock-id' }),
  sendBookingConfirmationEmail: vi.fn().mockResolvedValue({ id: 'email-mock-id' }),
  sendApplicationApprovedEmail: vi.fn().mockResolvedValue({ id: 'email-mock-id' }),
  sendApplicationRejectedEmail: vi.fn().mockResolvedValue({ id: 'email-mock-id' }),
  sendStatusUpdateEmail: vi.fn().mockResolvedValue({ id: 'email-mock-id' }),
  sendCancellationNotificationEmails: vi.fn().mockResolvedValue({ id: 'email-mock-id' }),
  sendSubscriptionEmails: vi.fn().mockResolvedValue({ id: 'email-mock-id' }),
  sendContactNotificationEmails: vi.fn().mockResolvedValue({ id: 'email-mock-id' }),
};

vi.mock('../../backend/services/emailService.js', () => ({
  ...emailServiceMock,
  default: emailServiceMock,
}));

// ─── Redis / Cache mock ───────────────────────────────────────
//
// Only the parts that touch Redis are stubbed. `CacheKeys` and `TTL` are taken
// from the real module, because they are pure functions and constants - the
// real module's Redis client is built lazily inside getRedisClient(), so
// importing it connects to nothing.
//
// They used to be hand-copied here, and drifted twice. First the copy stopped
// at three key builders, so any route reaching for CacheKeys.flightBrowse threw
// a TypeError, hit its own catch and soft-failed - the test passed for entirely
// the wrong reason. Then the real keys gained the GDS fingerprint that stops a
// PDT price being served to a customer after cutover, and the copy did not, so
// the change was invisible to every test that mattered. A copy of a thing is
// not the thing.
vi.mock('../../backend/services/cache.service.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    withCache: vi.fn((key, ttl, fn) => fn()),  // passthrough in tests
    invalidate: vi.fn().mockResolvedValue(undefined),
    invalidatePattern: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    healthCheck: vi.fn().mockResolvedValue({ status: 'disabled' }),
  };
});

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

// The recorded Amadeus fixtures are mostly Air India bookings from PDT, and AI
// is on the default list of carriers the office cannot ticket, so every one of
// them would be refused before reaching the code under test. The list is off
// for the suite; tests/backend/amadeusSoap/unticketableCarriers.test.js sets it.
process.env.AMADEUS_WS_UNTICKETABLE_CARRIERS ??= '';

// ─── Reset between tests ──────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});
