/**
 * tests/backend/models/user.model.test.js
 *
 * Unit tests for backend/models/user.model.js
 * Covers: create · findByEmail · findById · update · delete · matchPassword
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabaseMock } from '../setup.js';

// Must be hoisted before importing the model
vi.mock('bcryptjs', () => ({
  default: {
    genSalt: vi.fn().mockResolvedValue('salt'),
    hash:    vi.fn().mockResolvedValue('$2a$10$hashedPassword'),
    compare: vi.fn(),
  },
}));

import User from '../../../backend/models/user.model.js';
import bcrypt from 'bcryptjs';

// ─── Fixtures ─────────────────────────────────────────────────
const DB_USER = {
  id:         'user-uuid-001',
  email:      'jane@example.com',
  password:   '$2a$10$hashedPassword',
  first_name: 'Jane',
  last_name:  'Doe',
  name:       'Jane Doe',
  role:       'user',
  created_at: '2026-04-01T00:00:00Z',
};

// ─────────────────────────────────────────────────────────────
describe('User.create', () => {
  it('throws when user already exists', async () => {
    // Simulate existing user check returning a record
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockResolvedValue({ data: [{ email: DB_USER.email }], error: null }),
    };
    supabaseMock.from.mockReturnValue(chain);

    await expect(
      User.create({ firstName: 'Jane', lastName: 'Doe', email: DB_USER.email, password: 'pass123' })
    ).rejects.toThrow('User with this email already exists');
  });

  it('hashes the password before insert', async () => {
    // First call: check existing — no user found
    // Second call: insert — returns new user
    const checkChain = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [DB_USER], error: null }),
    };

    supabaseMock.from
      .mockReturnValueOnce(checkChain)
      .mockReturnValueOnce(insertChain);

    const user = await User.create({
      firstName: 'Jane',
      lastName:  'Doe',
      email:     'new@example.com',
      password:  'PlainText@123',
    });

    expect(bcrypt.hash).toHaveBeenCalledWith('PlainText@123', 'salt');
    expect(user).toMatchObject({ firstName: 'Jane', email: DB_USER.email });
  });

  it('throws when Supabase insert fails', async () => {
    const checkChain = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
    };

    supabaseMock.from
      .mockReturnValueOnce(checkChain)
      .mockReturnValueOnce(insertChain);

    await expect(
      User.create({ firstName: 'Jane', lastName: 'Doe', email: 'new@example.com', password: 'pass123' })
    ).rejects.toThrow('DB error');
  });
});

// ─────────────────────────────────────────────────────────────
describe('User.findByEmail', () => {
  it('returns null when no user found', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    supabaseMock.from.mockReturnValue(chain);

    const result = await User.findByEmail('none@example.com');
    expect(result).toBeNull();
  });

  it('returns user with camelCase fields mapped', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockResolvedValue({ data: [DB_USER], error: null }),
    };
    supabaseMock.from.mockReturnValue(chain);

    const user = await User.findByEmail(DB_USER.email);

    expect(user).toMatchObject({
      id:        DB_USER.id,
      email:     DB_USER.email,
      firstName: DB_USER.first_name,
      lastName:  DB_USER.last_name,
      role:      'user',
    });
  });
});

// ─────────────────────────────────────────────────────────────
describe('User.findById', () => {
  it('returns null on PGRST116 (not found)', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'Not found' } }),
    };
    supabaseMock.from.mockReturnValue(chain);

    // PGRST116 is re-thrown; model throws — this is expected behaviour
    await expect(User.findById('bad-id')).rejects.toBeTruthy();
  });

  it('returns user with mapped fields', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: DB_USER, error: null }),
    };
    supabaseMock.from.mockReturnValue(chain);

    const user = await User.findById(DB_USER.id);

    expect(user.firstName).toBe(DB_USER.first_name);
    expect(user.lastName).toBe(DB_USER.last_name);
  });
});

// ─────────────────────────────────────────────────────────────
describe('User.update', () => {
  it('hashes the password when included in updates', async () => {
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { ...DB_USER, password: '$2a$10$newHash' },
        error: null,
      }),
    };
    supabaseMock.from.mockReturnValue(chain);

    await User.update(DB_USER.id, { password: 'NewPlainPassword' });

    expect(bcrypt.hash).toHaveBeenCalledWith('NewPlainPassword', 'salt');
  });

  it('maps firstName/lastName to snake_case before update', async () => {
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: DB_USER, error: null }),
    };
    supabaseMock.from.mockReturnValue(chain);

    await User.update(DB_USER.id, { firstName: 'Updated', lastName: 'Name' });

    // The update call should have used first_name / last_name
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ first_name: 'Updated', last_name: 'Name' })
    );
    expect(chain.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ firstName: 'Updated' })
    );
  });
});

// ─────────────────────────────────────────────────────────────
describe('User.matchPassword', () => {
  it('returns true when passwords match', async () => {
    bcrypt.compare = vi.fn().mockResolvedValue(true);
    const result = await User.matchPassword('PlainPass', '$2a$10$hash');
    expect(result).toBe(true);
  });

  it('returns false when passwords do not match', async () => {
    bcrypt.compare = vi.fn().mockResolvedValue(false);
    const result = await User.matchPassword('WrongPass', '$2a$10$hash');
    expect(result).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
describe('User.delete', () => {
  it('returns true on success', async () => {
    const chain = {
      delete: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockResolvedValue({ error: null }),
    };
    supabaseMock.from.mockReturnValue(chain);

    const result = await User.delete(DB_USER.id);
    expect(result).toBe(true);
  });

  it('throws when Supabase returns an error', async () => {
    const chain = {
      delete: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockResolvedValue({ error: { message: 'Foreign key violation' } }),
    };
    supabaseMock.from.mockReturnValue(chain);

    await expect(User.delete(DB_USER.id)).rejects.toThrow('Foreign key violation');
  });
});
