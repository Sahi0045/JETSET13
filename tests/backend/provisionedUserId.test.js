import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A provisioned user's id is their Supabase auth uid.
 *
 * `User.create` inserted with no `id`, so the row took the table default: a
 * fresh uuid unrelated to `auth.users`. `bookings.user_id` REFERENCES
 * auth.users(id), and `autoProvisionSupabaseUser` runs whenever a valid
 * Supabase token has no `public.users` row - so the id it produced could not
 * satisfy that foreign key.
 *
 * The checkout upsert then failed as a whole and was caught as non-blocking:
 * the customer paid at ARC, **no booking row existed**, POST /order answered
 * PAYMENT_NOT_FOUND, and the abandoned-checkout job could not find them either
 * because it reads `bookings`. Money captured, nothing recorded.
 *
 * The `handle_new_user` trigger and the legacy reconcile migration cover users
 * created through the normal signup path; this provisioning path is the one
 * neither of them reaches.
 */

const inserted = [];

const chain = () => {
  const c = {
    select: vi.fn(() => c),
    eq: vi.fn(() => c),
    insert: vi.fn((rows) => { inserted.push(...rows); return c; }),
    update: vi.fn(() => c),
    single: vi.fn(async () => ({ data: null, error: null })),
    then: (resolve) => resolve({ data: inserted.slice(-1), error: null }),
  };
  return c;
};

vi.mock('../../backend/config/supabase.js', () => ({
  default: { from: vi.fn(() => chain()) },
}));

const AUTH_UID = '9f1c7a52-0b3e-4d21-8a44-2c6b5e0f1234';

beforeEach(() => {
  inserted.length = 0;
  vi.resetModules();
});

describe('User.create', () => {
  // The bug, exactly.
  it('writes the id it is given, so it can match auth.users', async () => {
    const { default: User } = await import('../../backend/models/user.model.js');

    await User.create({
      id: AUTH_UID,
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      password: 'irrelevant',
    }).catch(() => {});

    expect(inserted[0]?.id, 'the row must carry the auth uid').toBe(AUTH_UID);
  });

  // Signup has no auth uid to hand over; the table default is right there.
  it('leaves the id to the database when none is given', async () => {
    const { default: User } = await import('../../backend/models/user.model.js');

    await User.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      password: 'irrelevant',
    }).catch(() => {});

    expect(inserted[0]).toBeTruthy();
    expect('id' in inserted[0], 'no id key at all, not an explicit null').toBe(false);
  });
});

describe('auto-provisioning from a Supabase token', () => {
  it('provisions with the token sub as the row id', async () => {
    const created = [];
    vi.doMock('../../backend/models/user.model.js', () => ({
      default: {
        create: vi.fn(async (args) => { created.push(args); return { id: args.id, email: args.email }; }),
        findByEmail: vi.fn(async () => null),
      },
    }));

    const middleware = await import('../../backend/middleware/auth.middleware.js');
    const provision = middleware.autoProvisionSupabaseUser
      ?? middleware.default?.autoProvisionSupabaseUser;

    // Exported for this test; if it is not, the assertion below documents why
    // it needs to be rather than silently passing.
    expect(typeof provision, 'autoProvisionSupabaseUser must be reachable to be tested').toBe('function');

    await provision({
      email: 'ada@example.com',
      sub: AUTH_UID,
      iss: 'https://qqmagqwumjipdqvxbiqu.supabase.co/auth/v1',
      user_metadata: { first_name: 'Ada', last_name: 'Lovelace' },
    });

    expect(created[0]?.id).toBe(AUTH_UID);
  });
});
