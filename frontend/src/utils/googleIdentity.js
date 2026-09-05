/**
 * Google sign-in that stays on our own domain.
 *
 * `supabase.auth.signInWithOAuth` sends the browser to Google with
 * `redirect_uri = <project>.supabase.co/auth/v1/callback`, and Google names the
 * app behind that URI — so the consent screen reads
 * "to continue to qqmagqwumjipdqvxbiqu.supabase.co". That string cannot be
 * configured away: the redirect really does land on Supabase's domain, and
 * replacing it needs Supabase's paid custom auth domain.
 *
 * Google Identity Services avoids the redirect entirely. The ID token is
 * issued in the page, and `signInWithIdToken` hands it straight to Supabase, so
 * the user never leaves jetsetterss.com and there is no third-party domain for
 * Google to display. It is also faster — no full-page navigation out and back.
 *
 * The same OAuth client is used either way (it already lists our origins), and
 * it is already registered in Supabase's Google provider, so both paths accept
 * each other's tokens. That is what makes the fallback in `signInWithGoogle`
 * safe rather than theoretical.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';

/** The web OAuth client. Public by definition — it ships in the bundle. */
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
  || '465959071632-r387uj408itvmqh4bsp4faadr6po26m1.apps.googleusercontent.com';

let scriptPromise = null;

/** Load the GIS script once, resolving false rather than throwing if blocked. */
const loadGis = () => {
  if (window.google?.accounts?.id) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve) => {
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.google?.accounts?.id)));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(Boolean(window.google?.accounts?.id));
    // Ad blockers and privacy extensions block this host routinely. That is a
    // reason to fall back, not to fail.
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return scriptPromise;
};

/**
 * Nonce pair for replay protection.
 *
 * Google receives the SHA-256 hash and embeds it in the ID token; Supabase gets
 * the raw value and checks it matches. Sending the same value to both would
 * defeat the point.
 */
const createNonce = async () => {
  const raw = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { raw, hashed };
};

/**
 * Ask Google for an ID token in-page.
 *
 * Resolves `null` — never throws — when GIS is unavailable, suppressed, or the
 * user dismisses the prompt, so the caller can fall back to the redirect flow.
 */
export const requestGoogleIdToken = async () => {
  if (!(await loadGis())) return null;

  const { raw, hashed } = await createNonce();

  return new Promise((resolve) => {
    // If Google neither returns a credential nor reports a reason, resolving
    // null keeps the button responsive instead of hanging on a dead promise.
    const timer = setTimeout(() => resolve(null), 20000);
    const done = (value) => { clearTimeout(timer); resolve(value); };

    try {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        nonce: hashed,
        callback: ({ credential }) => done(credential ? { credential, nonce: raw } : null),
      });
      window.google.accounts.id.prompt((notification) => {
        // One Tap can be suppressed by cooldown, an opted-out user, or a
        // browser that blocks third-party storage. All mean "use the fallback".
        if (notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.()) done(null);
      });
    } catch {
      done(null);
    }
  });
};

/**
 * Sign in with Google, preferring the in-page flow.
 *
 * `redirectFallback` runs the existing `signInWithOAuth` path. It is not dead
 * code: One Tap is blocked often enough (extensions, third-party cookie
 * policies, a user who dismissed it recently) that removing the redirect would
 * make sign-in fail for a real slice of visitors.
 */
export const signInWithGoogle = async (supabase, redirectFallback) => {
  const result = await requestGoogleIdToken();

  if (result?.credential) {
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: result.credential,
      nonce: result.nonce,
    });
    if (!error) return { data, error: null, method: 'id_token' };

    // A rejected ID token usually means the client id is missing from the
    // Supabase provider's comma-separated list. The redirect path uses the
    // same client and does not check audience the same way, so it still works.
    console.warn('signInWithIdToken failed, falling back to redirect:', error.message);
  }

  return { ...(await redirectFallback()), method: 'redirect' };
};

/**
 * Render Google's own sign-in button into `container`.
 *
 * This exists because One Tap is not a reliable trigger. `prompt()` is
 * suppressed wherever third-party cookies or FedCM are restricted — Brave and
 * Safari by default, Firefox on strict, and anyone running a content blocker —
 * and a suppressed prompt means falling back to the redirect, which is the
 * whole thing we are trying to avoid. A real click on Google's rendered button
 * opens a popup instead, and works in those browsers.
 *
 * The cost is that the markup is Google's: their branding, their sizing rules.
 * That is the trade for never sending the user to a third-party consent domain.
 *
 * Resolves false when GIS could not render, so the caller can show its own
 * button and keep the redirect path available.
 */
export const renderGoogleButton = async (container, onCredential, options = {}) => {
  if (!container || !(await loadGis())) return false;

  const { raw, hashed } = await createNonce();

  try {
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      nonce: hashed,
      callback: ({ credential }) => {
        if (credential) onCredential({ credential, nonce: raw });
      },
    });

    container.innerHTML = '';
    window.google.accounts.id.renderButton(container, {
      theme: options.theme ?? 'outline',
      size: options.size ?? 'large',
      text: options.text ?? 'signin_with',
      shape: options.shape ?? 'rectangular',
      logo_alignment: 'center',
      width: options.width ?? 260,
    });
    return true;
  } catch {
    return false;
  }
};

/** Exchange a GIS credential for a Supabase session. */
export const exchangeGoogleCredential = async (supabase, { credential, nonce }) =>
  supabase.auth.signInWithIdToken({ provider: 'google', token: credential, nonce });
