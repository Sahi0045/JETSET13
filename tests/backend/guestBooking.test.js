import { describe, expect, it, vi } from 'vitest';
import {
  GUEST_FLIGHT_BOOKING_FLAG,
  isGuestFlightBookingEnabled,
  isUsableEmail,
} from '../../backend/services/guestBooking.service.js';

/**
 * Guest flight booking is an admin switch (Feature Flags). It fails closed: the
 * one thing that lets a signed-out customer pay is a stored "on". A missing row,
 * a read error or an outage asks them to log in - the behaviour before the
 * switch existed - and never lets a guest through.
 */

const clientAnswering = (maybeSingle) => {
  const calls = { table: null, eq: [] };
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn((column, value) => {
      calls.eq.push([column, value]);
      return chain;
    }),
    maybeSingle: vi.fn(maybeSingle),
  };
  const client = {
    from: vi.fn((table) => {
      calls.table = table;
      return chain;
    }),
  };
  return { client, calls };
};

describe('isGuestFlightBookingEnabled', () => {
  it('is on when an admin stored it on, read from the flag_name column', async () => {
    const { client, calls } = clientAnswering(async () => ({ data: { enabled: true }, error: null }));

    expect(await isGuestFlightBookingEnabled(client)).toBe(true);
    expect(calls.table).toBe('feature_flags');
    expect(calls.eq).toContainEqual(['flag_name', GUEST_FLIGHT_BOOKING_FLAG]);
  });

  it.each([
    ['no row', { data: null, error: null }],
    ['a stored off', { data: { enabled: false }, error: null }],
    ['a value that is not true', { data: { enabled: 'true' }, error: null }],
    ['a read error', { data: { enabled: true }, error: { message: 'permission denied' } }],
  ])('is off with %s', async (_label, answer) => {
    const { client } = clientAnswering(async () => answer);

    expect(await isGuestFlightBookingEnabled(client)).toBe(false);
  });

  it('is off when the database cannot be reached', async () => {
    const { client } = clientAnswering(async () => {
      throw new Error('fetch failed');
    });

    expect(await isGuestFlightBookingEnabled(client)).toBe(false);
  });
});

describe('isUsableEmail', () => {
  it.each(['guest@example.com', '  Guest@Example.co.uk  '])('accepts %j', (value) => {
    expect(isUsableEmail(value)).toBe(true);
  });

  it.each([undefined, null, '', '   ', 'guest', 'guest@', 'guest@example', 'a guest@example.com'])('refuses %j', (value) => {
    expect(isUsableEmail(value)).toBe(false);
  });
});
