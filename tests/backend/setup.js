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
  TTL: { FLIGHT_SEARCH: 300, HOTEL_SEARCH: 300, VISA_REQUIREMENTS: 3600 },
  CacheKeys: {
    flightSearch: (f, t, d, p) => `flights:${f}:${t}:${d}:${p}`,
    hotelSearch:  (c, ci, co, g) => `hotels:${c}:${ci}:${co}:${g}`,
    visaRequirements: (n, d) => `visa:req:${n}:${d}`,
  },
}));

// ─── JWT mock helpers ─────────────────────────────────────────
export const TEST_JWT_SECRET = 'test-secret-key';
process.env.JWT_SECRET = TEST_JWT_SECRET;
process.env.JWT_EXPIRE  = '1h';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.NODE_ENV = 'test';

// ─── Reset between tests ──────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});
