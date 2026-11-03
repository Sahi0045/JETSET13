import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signUp = vi.fn();
const getSession = vi.fn();
vi.mock('../../frontend/src/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ user: null, loading: false, error: null, signUp, signIn: vi.fn(), signInWithOAuth: vi.fn() }),
}));
vi.mock('../../frontend/src/lib/supabase', () => ({
  default: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: () => getSession(),
    },
  },
}));
vi.mock('../../frontend/src/utils/googleIdentity', () => ({
  renderGoogleButton: vi.fn(() => Promise.resolve(false)),
  exchangeGoogleCredential: vi.fn(),
}));

const { default: SupabaseSignup } = await import('../../frontend/src/Pages/Common/login/SupabaseSignup.jsx');
const { default: ForgotPassword } = await import('../../frontend/src/Pages/Common/login/ForgotPassword.jsx');
const { default: ResetPassword } = await import('../../frontend/src/Pages/Common/login/ResetPassword.jsx');

/**
 * The sign-in page is brand teal. Sign-up was sky blue and titled "Sign Up
 * with Supabase", and the forgot and reset password pages were a dark navy
 * "Security Portal" in royal blue with an admin address as the example email.
 * The owner asked for them in brand teal (3 Nov 2026): they now share the
 * sign-in page's frame and styles.
 */

const PAGES = ['SupabaseSignup.jsx', 'ForgotPassword.jsx', 'ResetPassword.jsx'];
const source = (file) => readFileSync(path.join(process.cwd(), 'frontend/src/Pages/Common/login', file), 'utf8');

const hexToRgb = (hex) => {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(1, 7);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const isBlue = ([r, g, b]) => {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  if (!d) return false;
  const s = d / (1 - Math.abs(max + min - 1));
  const h = max === rr ? ((gg - bb) / d + 6) % 6 : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
  return h * 60 >= 197 && h * 60 <= 260 && s > 0.3;
};

const page = (Page) => render(<MemoryRouter><Page /></MemoryRouter>);

beforeEach(() => {
  signUp.mockReset();
  getSession.mockResolvedValue({ data: { session: null } });
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
});

afterEach(() => {
  window.location.hash = '';
});

describe('the sign-up and password pages', () => {
  it.each(PAGES)('%s uses no blue, in its own colours or Tailwind classes', (file) => {
    const text = source(file);
    const hexes = [...text.matchAll(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi)].map(([hex]) => hex).filter((hex) => isBlue(hexToRgb(hex)));

    expect(hexes).toEqual([]);
    expect(text).not.toMatch(/\b(?:bg|text|border|ring|shadow|from|to|via)-(?:blue|indigo|sky)-\d/);
    expect(text).not.toMatch(/login\.css/);
  });

  it('sign-up sits in the teal sign-in frame, says what it is, and names no vendor', () => {
    const { container } = page(SupabaseSignup);

    expect(container.querySelector('.jsl-page .jsl-hero')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeTruthy();
    expect(container.textContent).not.toMatch(/supabase/i);
  });

  it('sign-up still checks the form and creates the account', async () => {
    page(SupabaseSignup);
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('First name is required')).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();

    signUp.mockResolvedValue({ data: {}, error: null });
    fireEvent.change(screen.getByLabelText('First name'), { target: { name: 'firstName', value: 'Asha' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { name: 'lastName', value: 'Rao' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { name: 'email', value: 'asha@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { name: 'password', value: 'longenough1' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { name: 'confirmPassword', value: 'longenough1' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(signUp).toHaveBeenCalledWith('asha@example.com', 'longenough1', {
      first_name: 'Asha', last_name: 'Rao', full_name: 'Asha Rao',
    }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/check your email/i));
  });

  it('forgot password sits in the teal frame and does not suggest an admin address', async () => {
    const { container } = page(ForgotPassword);
    const email = screen.getByLabelText('Email address');

    expect(container.querySelector('.jsl-page .jsl-hero')).toBeTruthy();
    expect(email.getAttribute('placeholder')).toBe('you@example.com');

    fireEvent.change(email, { target: { value: 'asha@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/sent a password reset link/));
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ email: 'asha@example.com' });
  });

  it('reset password sits in the teal frame and offers a new link when this one has expired', () => {
    window.location.hash = '#error=access_denied&error_code=otp_expired';
    const { container } = page(ResetPassword);

    expect(container.querySelector('.jsl-page .jsl-hero')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/expired/);
    expect(screen.getByRole('link', { name: 'Request a new reset link' }).getAttribute('href')).toBe('/forgot-password');
  });

  it('reset password asks for the new password twice once the link checks out', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    page(ResetPassword);

    await waitFor(() => expect(screen.getByLabelText('New password')).toBeTruthy());
    expect(screen.getByLabelText('Confirm new password')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('New password'), { target: { name: 'newPassword', value: 'short' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { name: 'confirmPassword', value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    expect(screen.getByRole('alert').textContent).toBe('Password must be at least 8 characters long.');
  });
});
