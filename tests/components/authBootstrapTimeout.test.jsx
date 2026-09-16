import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The auth bootstrap must always finish, even when Supabase never answers.
 *
 * Found in a browser on 16 Sep 2026, signed out, going from search results to
 * the review page: the page sat on "Loading your booking details..." for over a
 * minute and never redirected to log in. Both backend calls were healthy from
 * inside that very page - the feature flag in 550ms, /api/auth/supabase-session
 * returning a valid token in 660ms - so nothing on our side was slow.
 *
 * The await that never returned was Supabase's own. auth-js 2.80 wraps
 * getSession in `this._acquireLock(-1, ...)` (GoTrueClient.js:1062), and -1
 * means no acquire timeout at all: the lock is a Web Lock named after the
 * storage key and shared by every tab on the origin, so a tab that holds it
 * holds this one for as long as it likes. `loading` stayed true, and on the
 * review page that is doubly fatal - the spinner is rendered while it is true,
 * AND the effect that sends a signed-out visitor to log in returns early on it.
 * A customer about to pay got a spinner and no way out of it.
 *
 * These render the real provider against a Supabase whose promises never
 * settle, which is exactly what a held lock looks like from here.
 */

const never = () => new Promise(() => {});
const subscription = { data: { subscription: { unsubscribe: () => {} } } };

let getSession;
let setSession;

vi.mock('../../frontend/src/lib/supabase', () => ({
  default: {
    auth: {
      getSession: (...args) => getSession(...args),
      setSession: (...args) => setSession(...args),
      onAuthStateChange: () => subscription,
    },
  },
}));

const { SupabaseAuthProvider, useSupabaseAuth } = await import('../../frontend/src/contexts/SupabaseAuthContext.jsx');

const Probe = () => {
  const { loading, user } = useSupabaseAuth();
  return <div data-testid="probe">{loading ? 'loading' : `settled:${user?.email ?? 'anonymous'}`}</div>;
};

const mount = () => render(<SupabaseAuthProvider><Probe /></SupabaseAuthProvider>);

/** Let the timers run AND let the promises they release be delivered. */
const waitFor = async (ms) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  getSession = never;
  setSession = never;
  global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404, json: async () => ({}) }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a Supabase call that never comes back', () => {
  it('still lets go of the loading state, so the page can render or redirect', async () => {
    const { getByTestId } = mount();

    expect(getByTestId('probe').textContent).toBe('loading');

    await waitFor(8000);

    expect(getByTestId('probe').textContent).toBe('settled:anonymous');
  });

  it('is still loading a moment before the deadline, so a slow answer is not cut off early', async () => {
    const { getByTestId } = mount();

    await waitFor(7000);

    expect(getByTestId('probe').textContent).toBe('loading');
  });

  /**
   * getSession answering and setSession hanging is the same trap one await
   * further down, and it is the likelier one: setSession writes, so it wants
   * the lock for longer.
   */
  it('lets go when it is the re-hydration that hangs, not the first call', async () => {
    getSession = async () => ({ data: { session: null }, error: null });
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'a', refresh_token: 'r' }),
    }));

    const { getByTestId } = mount();
    await waitFor(8000);

    expect(getByTestId('probe').textContent).toBe('settled:anonymous');
  });

  it('says so in the console rather than failing silently', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mount();
    await waitFor(8000);

    expect(warn.mock.calls.flat().join(' ')).toMatch(/did not settle/i);
    warn.mockRestore();
  });
});

describe('the ordinary case, which must not regress', () => {
  it('settles on the session as soon as Supabase answers, not on the deadline', async () => {
    getSession = async () => ({
      data: { session: { access_token: 'tok', user: { email: 'flyer@example.com' } } },
      error: null,
    });

    const { getByTestId } = mount();
    await waitFor(0);

    expect(getByTestId('probe').textContent).toBe('settled:flyer@example.com');
  });

  it('settles when Supabase reports an error instead of hanging', async () => {
    getSession = async () => ({ data: { session: null }, error: { message: 'network down' } });

    const { getByTestId } = mount();
    await waitFor(0);

    expect(getByTestId('probe').textContent).toBe('settled:anonymous');
  });
});
