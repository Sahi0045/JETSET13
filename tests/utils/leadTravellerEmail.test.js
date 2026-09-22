import { describe, expect, it } from 'vitest';
import { travellerProblems } from '../../frontend/src/utils/travellerChecks.js';

/**
 * The lead traveller's email on the review page.
 *
 * It was checked for a guest only. A signed-in customer's typed address went
 * through as it was, so "jane@gmailcom" became the booking's contact email and
 * the confirmation was sent there instead of to the account's address. An
 * address that is typed now has to be usable, for everyone; a signed-in
 * customer can still leave it blank and get the account's address.
 */

const lead = { type: 'ADULT', firstName: 'Jane', lastName: 'Doe', gender: 'female', mobile: '5550100', countryCode: '+1' };
const domestic = { index: 0, international: false, travelDate: '2026-11-15', lastDate: '2026-11-15' };
const SIGNED_IN_PROBLEM = 'Enter the email address in full, like name@example.com, or leave it blank to use your account\'s email.';
const GUEST_PROBLEM = 'Enter an email address. Your ticket is sent there, and it is how you find this booking without an account.';

describe('a signed-in customer', () => {
  it('is asked to correct a typed address that is not usable', () => {
    expect(travellerProblems({ ...lead, email: 'jane@gmailcom' }, { ...domestic, contactEmail: 'jane@gmailcom' }))
      .toEqual([SIGNED_IN_PROBLEM]);
  });

  it('may leave it blank', () => {
    expect(travellerProblems(lead, domestic)).toEqual([]);
    expect(travellerProblems({ ...lead, email: '  ' }, { ...domestic, contactEmail: '  ' })).toEqual([]);
  });

  it('may type a usable one', () => {
    expect(travellerProblems({ ...lead, email: 'jane.work@example.com' }, { ...domestic, contactEmail: 'jane.work@example.com' })).toEqual([]);
  });

  it('is not asked about a second traveller\'s email', () => {
    expect(travellerProblems({ ...lead, email: 'tom@examplecom' }, { ...domestic, index: 1 })).toEqual([]);
  });
});

describe('a guest', () => {
  it('is asked for an email as before, blank or not usable', () => {
    expect(travellerProblems(lead, { ...domestic, bookingAsGuest: true })).toEqual([GUEST_PROBLEM]);
    expect(travellerProblems({ ...lead, email: 'jane@gmailcom' }, { ...domestic, bookingAsGuest: true, contactEmail: 'jane@gmailcom' }))
      .toEqual([GUEST_PROBLEM]);
    expect(travellerProblems({ ...lead, email: 'jane@example.com' }, { ...domestic, bookingAsGuest: true, contactEmail: 'jane@example.com' })).toEqual([]);
  });
});
