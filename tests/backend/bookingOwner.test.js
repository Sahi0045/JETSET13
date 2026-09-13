import { describe, expect, it } from 'vitest';
import { resolveBookingUserId } from '../../backend/utils/bookingOwner.js';

/**
 * A booking with no user_id never appears in My Trips - the page asks for the
 * signed-in user's bookings and nothing else links a row to an account. That is
 * how confirmed, ticketed bookings went missing: ownership came only from the
 * request body, and checkout never sent it.
 */

const SESSION_ID = '11111111-2222-4333-8444-555555555555';
const BODY_ID = '99999999-8888-4777-8666-555555555555';

describe('resolving who owns a booking', () => {
  it('uses the signed-in user from the verified session', () => {
    expect(resolveBookingUserId({ user: { id: SESSION_ID }, body: {} })).toBe(SESSION_ID);
  });

  // The body is client-supplied: a request must not be able to file someone
  // else's booking under its own account, or its own under someone else's.
  it('prefers the session over whatever the body claims', () => {
    expect(resolveBookingUserId({ user: { id: SESSION_ID }, body: { userId: BODY_ID } })).toBe(SESSION_ID);
  });

  // The body is never an owner. A guest request carrying someone else's user
  // id used to file its booking - passenger data, cancel and refund rights -
  // under that account.
  it('never takes the owner from the body, even a well-formed user id', () => {
    expect(resolveBookingUserId({ body: { userId: BODY_ID } })).toBeNull();
  });

  it('ignores a body value that is not a user id', () => {
    for (const junk of ['x,status.not.eq.zzz', '', 'null', '1 OR 1=1', 42, {}]) {
      expect(resolveBookingUserId({ body: { userId: junk } })).toBeNull();
    }
  });

  it('ignores a session id that is not a user id, and does not fall back to the body', () => {
    expect(resolveBookingUserId({ user: { id: 'not-a-uuid' }, body: { userId: BODY_ID } })).toBeNull();
  });

  // A real guest checkout stays a guest booking rather than throwing.
  it('returns null for a genuine guest', () => {
    expect(resolveBookingUserId({ body: {} })).toBeNull();
    expect(resolveBookingUserId({})).toBeNull();
    expect(resolveBookingUserId(undefined)).toBeNull();
  });
});
