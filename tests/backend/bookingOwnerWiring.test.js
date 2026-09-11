import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The owner resolved from the session must actually reach the database write.
 *
 * `resolveBookingUserId` was correct and unit-tested, and the route called it -
 * yet bookings still landed with user_id null, because the object passed to
 * saveBookingToDatabase set `userId` a second time from `req.body.userId`. In a
 * JS object literal the later key wins, so the session value was discarded and
 * the client's value used instead: the ownership fix was dead on the main write
 * path while every unit test still passed.
 *
 * Reading the source is crude, but it catches exactly that class of silent
 * revert - a stale duplicate key or a route that goes back to trusting the
 * body - which no test of the helper alone can see.
 */

const source = readFileSync(new URL('../../backend/routes/flight.routes.js', import.meta.url), 'utf8');

describe('the booking owner reaches the database write', () => {
  it('resolves the owner from the request, not from the body', () => {
    expect(source).toMatch(/const userId = resolveBookingUserId\(req\)/);
  });

  // The bug: `userId: req.body.userId || null` sitting in the same object.
  it('never passes req.body.userId as the owner', () => {
    expect(source).not.toMatch(/userId:\s*req\.body\.userId/);
  });

  it('destructures the order body without taking userId from it', () => {
    const destructure = source.match(/const \{[^}]*\} = req\.body;/)?.[0] ?? '';
    expect(destructure).not.toMatch(/\buserId\b/);
  });

  // Two keys of the same name in one literal: the later silently wins.
  it('sets the owner exactly once in the saveBookingToDatabase call', () => {
    const call = source.match(/saveBookingToDatabase\(\{[\s\S]*?\n\s{4}\}\);/)?.[0];
    expect(call, 'saveBookingToDatabase call not found').toBeTruthy();
    expect(call.match(/^\s*userId:/gm) ?? []).toHaveLength(1);
  });
});
