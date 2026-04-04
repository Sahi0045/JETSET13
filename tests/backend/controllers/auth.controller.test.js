/**
 * tests/backend/controllers/auth.controller.test.js
 *
 * Unit tests for backend/controllers/auth.controller.js
 * Covers:  register · login · getMe · forgotPassword · resetPassword · googleLogin
 *
 * All Supabase + axios calls are intercepted by tests/backend/setup.js mocks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequest, createResponse } from '../helpers/express.helpers.js';

// ─── Mocks must be hoisted above imports ─────────────────────
vi.mock('../../../backend/models/user.model.js');
vi.mock('axios');
vi.mock('jsonwebtoken', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    sign:   vi.fn(() => 'mocked-jwt-token'),
    verify: actual.verify,
  };
});

// ─── Imports (after mocks are registered) ────────────────────
import * as AuthController from '../../../backend/controllers/auth.controller.js';
import User from '../../../backend/models/user.model.js';
import axios from 'axios';
import { supabaseMock } from '../setup.js';

// Helper: check returned token is a valid JWT string
const expectValidToken = (token) => {
  expect(typeof token).toBe('string');
  expect(token.length).toBeGreaterThan(10);
};

// ─── Shared fixtures ─────────────────────────────────────────
const MOCK_USER = {
  id:        'user-uuid-001',
  firstName: 'Jane',
  lastName:  'Doe',
  email:     'jane@example.com',
  password:  '$2a$10$hashedPasswordHash',
  role:      'user',
  googleId:  null,
};

// ─────────────────────────────────────────────────────────────
describe('AuthController.register', () => {
  it('returns 400 when required fields are missing', async () => {
    const req = createRequest({ body: { firstName: 'Jane' } });
    const res = createResponse();

    await AuthController.register(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('All fields are required');
  });

  it('returns 400 when email format is invalid', async () => {
    const req = createRequest({
      body: { firstName: 'Jane', lastName: 'Doe', email: 'not-an-email', password: 'password123' },
    });
    const res = createResponse();

    await AuthController.register(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/email/i);
  });

  it('returns 400 when password is too short', async () => {
    const req = createRequest({
      body: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', password: 'abc' },
    });
    const res = createResponse();

    await AuthController.register(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/password/i);
  });

  it('creates a user and returns 201 with token', async () => {
    User.create = vi.fn().mockResolvedValue(MOCK_USER);

    const req = createRequest({
      body: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', password: 'SecureP@ss1' },
    });
    const res = createResponse();

    await AuthController.register(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      id:        MOCK_USER.id,
      firstName: MOCK_USER.firstName,
      email:     MOCK_USER.email,
    });
    expectValidToken(res.body.token);
    expect(User.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'jane@example.com' })
    );
  });

  it('returns 409 when user already exists', async () => {
    User.create = vi.fn().mockRejectedValue(new Error('User with this email already exists'));

    const req = createRequest({
      body: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', password: 'SecureP@ss1' },
    });
    const res = createResponse();

    await AuthController.register(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/already exists/i);
  });
});

// ─────────────────────────────────────────────────────────────
describe('AuthController.login', () => {
  it('returns 400 when credentials are missing', async () => {
    const req = createRequest({ body: { email: 'jane@example.com' } });
    const res = createResponse();

    await AuthController.login(req, res);

    expect(res.statusCode).toBe(400);
  });

  it('returns 401 when user is not found', async () => {
    User.findByEmail = vi.fn().mockResolvedValue(null);

    const req = createRequest({ body: { email: 'nobody@example.com', password: 'pass' } });
    const res = createResponse();

    await AuthController.login(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });

  it('returns 401 when password does not match', async () => {
    User.findByEmail    = vi.fn().mockResolvedValue(MOCK_USER);
    User.matchPassword  = vi.fn().mockResolvedValue(false);

    const req = createRequest({ body: { email: 'jane@example.com', password: 'wrongpass' } });
    const res = createResponse();

    await AuthController.login(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });

  it('returns 200 with JWT on successful login', async () => {
    User.findByEmail   = vi.fn().mockResolvedValue(MOCK_USER);
    User.matchPassword = vi.fn().mockResolvedValue(true);

    const req = createRequest({ body: { email: 'jane@example.com', password: 'SecureP@ss1' } });
    const res = createResponse();

    await AuthController.login(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      id:    MOCK_USER.id,
      email: MOCK_USER.email,
      role:  'user',
    });
    expectValidToken(res.body.token);
  });
});

// ─────────────────────────────────────────────────────────────
describe('AuthController.getMe', () => {
  it('returns 404 when user is not found', async () => {
    User.findById = vi.fn().mockResolvedValue(null);

    const req = createRequest({ user: { id: 'nonexistent-id' } });
    const res = createResponse();

    await AuthController.getMe(req, res);

    expect(res.statusCode).toBe(404);
  });

  it('returns the user profile', async () => {
    User.findById = vi.fn().mockResolvedValue(MOCK_USER);

    const req = createRequest({ user: { id: MOCK_USER.id } });
    const res = createResponse();

    await AuthController.getMe(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      id:        MOCK_USER.id,
      firstName: MOCK_USER.firstName,
      email:     MOCK_USER.email,
    });
    // Password must NEVER be returned
    expect(res.body.password).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
describe('AuthController.forgotPassword', () => {
  it('returns 400 when email is missing', async () => {
    const req = createRequest({ body: {} });
    const res = createResponse();

    await AuthController.forgotPassword(req, res);

    expect(res.statusCode).toBe(400);
  });

  it('returns 200 even when user does not exist (security: no enumeration)', async () => {
    User.findByEmail = vi.fn().mockResolvedValue(null);

    const req = createRequest({ body: { email: 'ghost@example.com' } });
    const res = createResponse();

    await AuthController.forgotPassword(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('inserts reset token and returns 200 when user exists', async () => {
    User.findByEmail = vi.fn().mockResolvedValue(MOCK_USER);

    // Mock supabase .from('password_resets').insert(...)
    const chain = {
      insert:  vi.fn().mockResolvedValue({ data: [{}], error: null }),
    };
    supabaseMock.from.mockReturnValue(chain);

    const req = createRequest({ body: { email: 'jane@example.com' } });
    const res = createResponse();

    await AuthController.forgotPassword(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
describe('AuthController.resetPassword', () => {
  it('returns 400 when fields are missing', async () => {
    const req = createRequest({ body: { email: 'jane@example.com' } });
    const res = createResponse();

    await AuthController.resetPassword(req, res);

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when token is invalid or expired', async () => {
    // Simulate no matching reset entry
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      gt:     vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
    };
    supabaseMock.from.mockReturnValue(chain);

    const req = createRequest({
      body: { email: 'jane@example.com', token: 'bad-token', newPassword: 'NewP@ss1' },
    });
    const res = createResponse();

    await AuthController.resetPassword(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/invalid|expired/i);
  });

  it('updates password and deletes token on success', async () => {
    // Mock: valid reset entry found
    const resetChain = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      gt:     vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data:  { email: 'jane@example.com', token: 'valid-token' },
        error: null,
      }),
    };
    supabaseMock.from.mockReturnValue(resetChain);

    User.findByEmail = vi.fn().mockResolvedValue(MOCK_USER);
    User.update      = vi.fn().mockResolvedValue({ ...MOCK_USER, password: 'newHash' });

    const req = createRequest({
      body: { email: 'jane@example.com', token: 'valid-token', newPassword: 'NewP@ss1!' },
    });
    const res = createResponse();

    await AuthController.resetPassword(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(User.update).toHaveBeenCalledWith(MOCK_USER.id, expect.objectContaining({ password: 'NewP@ss1!' }));
  });
});

// ─────────────────────────────────────────────────────────────
describe('AuthController.googleLogin', () => {
  it('returns 400 when google token is missing', async () => {
    const req = createRequest({ body: {} });
    const res = createResponse();

    await AuthController.googleLogin(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/token/i);
  });

  it('returns 401 when Google token verification fails', async () => {
    axios.get = vi.fn().mockRejectedValue({
      response: { status: 400, data: { error_description: 'Invalid token' }, statusText: 'Bad Request' },
    });

    const req = createRequest({ body: { token: 'bad-google-token' } });
    const res = createResponse();

    await AuthController.googleLogin(req, res);

    expect(res.statusCode).toBe(401);
  });

  it('creates a new user on first Google login', async () => {
    axios.get = vi.fn().mockResolvedValue({
      data: {
        email:       'google.user@gmail.com',
        given_name:  'Google',
        family_name: 'User',
        sub:         'google-sub-123',
      },
    });

    User.findByEmail = vi.fn().mockResolvedValue(null);
    User.create      = vi.fn().mockResolvedValue({
      ...MOCK_USER,
      email:     'google.user@gmail.com',
      firstName: 'Google',
      lastName:  'User',
    });

    const req = createRequest({ body: { token: 'valid-google-id-token' } });
    const res = createResponse();

    await AuthController.googleLogin(req, res);

    expect(res.statusCode).toBe(200);
    expectValidToken(res.body.token);
    expect(res.body.isGoogleAccount).toBe(true);
    expect(User.create).toHaveBeenCalled();
  });

  it('logs in existing Google user without re-creating', async () => {
    const existingGoogleUser = { ...MOCK_USER, googleId: 'google-sub-123' };

    axios.get = vi.fn().mockResolvedValue({
      data: {
        email:       MOCK_USER.email,
        given_name:  'Jane',
        family_name: 'Doe',
        sub:         'google-sub-123',
      },
    });

    User.findByEmail = vi.fn().mockResolvedValue(existingGoogleUser);
    User.create      = vi.fn();

    const req = createRequest({ body: { token: 'valid-google-id-token' } });
    const res = createResponse();

    await AuthController.googleLogin(req, res);

    expect(res.statusCode).toBe(200);
    expect(User.create).not.toHaveBeenCalled();
  });
});
