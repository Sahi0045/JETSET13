import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { BOOKING_STORAGE_KEYS, pruneStoredProfile } from '../../frontend/src/utils/bookingStorage.js';

/**
 * Identity documents do not live in a browser.
 *
 * `userData` held the whole profile form - passport number, passport expiry,
 * issuing country, PAN number, date of birth, mobile and address - in
 * localStorage, with no expiry and nothing clearing it but a click on Logout.
 * A government ID and an Indian tax ID, in plaintext, indefinitely, on whatever
 * browser was used. The booking-draft sweep never touched it because `userData`
 * was not one of its keys.
 *
 * None of it needed to be there: the profile is read from the `users` table on
 * every mount of that page, and the cache exists only so the page is not blank
 * for a moment.
 */

const store = () => {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    get size() { return data.size; },
  };
};

const FULL_PROFILE = {
  first_name: 'Asha', last_name: 'Rao', email: 'asha@example.com', role: 'user',
  passport_number: 'P1234567', passport_expiry: '2030-01-01', issuing_country: 'IN',
  pan_number: 'ABCDE1234F', date_of_birth: '1990-01-01', mobile_number: '9876543210',
  address: '1 Example Road', city: 'Mumbai', state: 'MH', nationality: 'Indian',
};

let storage;
beforeEach(() => { storage = store(); });

describe('clearing what an older build left behind', () => {
  it('removes the passport, the PAN and the date of birth', () => {
    storage.setItem('userData', JSON.stringify(FULL_PROFILE));

    pruneStoredProfile(storage);

    const kept = JSON.parse(storage.getItem('userData'));
    expect(kept).not.toHaveProperty('passport_number');
    expect(kept).not.toHaveProperty('passport_expiry');
    expect(kept).not.toHaveProperty('pan_number');
    expect(kept).not.toHaveProperty('date_of_birth');
    expect(kept).not.toHaveProperty('mobile_number');
    expect(kept).not.toHaveProperty('address');
  });

  it('keeps what the cache is actually for', () => {
    storage.setItem('userData', JSON.stringify(FULL_PROFILE));

    pruneStoredProfile(storage);

    expect(JSON.parse(storage.getItem('userData'))).toEqual({
      first_name: 'Asha', last_name: 'Rao', email: 'asha@example.com', role: 'user',
    });
  });

  it('leaves an already-clean cache alone', () => {
    storage.setItem('userData', JSON.stringify({ first_name: 'Asha', email: 'asha@example.com' }));

    expect(pruneStoredProfile(storage)).toBe(false);
  });

  it('throws away something it cannot read rather than leaving it', () => {
    storage.setItem('userData', 'not json');

    pruneStoredProfile(storage);

    expect(storage.getItem('userData')).toBeNull();
  });

  it('does nothing, and never throws, when there is nothing stored', () => {
    expect(() => pruneStoredProfile(storage)).not.toThrow();
    expect(pruneStoredProfile(storage)).toBe(false);
  });

  it('never throws on storage it cannot touch', () => {
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => {}, removeItem: () => {} };

    expect(() => pruneStoredProfile(blocked)).not.toThrow();
  });

  it('runs at app start, so it reaches someone who never opens their profile again', () => {
    const main = readFileSync(path.resolve(process.cwd(), 'frontend/main.jsx'), 'utf8');

    expect(main).toMatch(/pruneStoredProfile\(\)/);
  });

  it('stops the profile page writing them in the first place', () => {
    const page = readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/login/profiledashboard.jsx'), 'utf8');

    expect(page).not.toMatch(/const dataToSave = \{ \.\.\.data \}/);
    expect(page).toMatch(/const CACHEABLE = \[/);
  });
});

/**
 * The flight flow was hardened - a 6 hour age-out and a clear on logout - and
 * the other three product lines were never added to it. A package draft carries
 * every traveller's passport number and expiry; a cruise draft their names and
 * nationalities.
 */
describe('the drafts the sweep covers', () => {
  it('covers every product line, not only flights', () => {
    for (const key of ['pendingHotelBooking', 'pendingCruiseBooking', 'pendingPackageBooking']) {
      expect(BOOKING_STORAGE_KEYS, key).toContain(key);
    }
  });

  /**
   * Written after payment with the booking, the ARC order id and the
   * transaction id. Two of them have no reader anywhere in the app, and the
   * third was removed only if the customer later booked a FLIGHT.
   */
  it('covers the post-payment copies that nothing reads', () => {
    for (const key of ['completedHotelBooking', 'completedPackageBooking', 'completedBooking']) {
      expect(BOOKING_STORAGE_KEYS, key).toContain(key);
    }
  });

  it('still covers the flight ones', () => {
    expect(BOOKING_STORAGE_KEYS).toContain('pendingFlightBooking');
    expect(BOOKING_STORAGE_KEYS).toContain('pendingPaymentSession');
  });
});

/**
 * The session object carries `access_token` and `refresh_token`. Logging it
 * printed a live refresh token to the console of every OAuth sign-in - and the
 * production build strips no console calls, while Sentry's Breadcrumbs
 * integration captures console arguments by default.
 */
describe('what sign-in logs', () => {
  const callback = readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/AuthCallback.jsx'), 'utf8');

  it('never logs the session object', () => {
    expect(callback).not.toMatch(/console\.log\([^)]*data\.session\)/);
  });

  it('logs the email instead, which is enough to say it worked', () => {
    expect(callback).toMatch(/console\.log\('Signed in from hash:', data\.session\.user\?\.email\)/);
    expect(callback).toMatch(/console\.log\('Signed in from code:', data\.session\.user\?\.email\)/);
  });
});

/**
 * A developer page that prints the visitor's own access and refresh tokens into
 * the DOM with a copy button. Not a way into someone else's account - but a
 * page whose whole purpose is to surface a token has no business being routed
 * on the live site.
 */
describe('the auth debug page', () => {
  it('is not routed in a production build', () => {
    const app = readFileSync(path.resolve(process.cwd(), 'frontend/src/app.jsx'), 'utf8');

    expect(app).toMatch(/import\.meta\.env\.DEV && \(\s*<Route path="\/supabase-auth-debug"/);
  });
});
