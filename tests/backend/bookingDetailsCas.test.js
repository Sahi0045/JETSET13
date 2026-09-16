import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * Writing part of `booking_details` without erasing what landed in between.
 *
 * PostgREST cannot change one key inside a jsonb column, so every writer reads
 * the column, changes its part and writes the whole thing back. `unchangedSince`
 * exists to pin those writes to the row they were built from - and
 * `patchBookingDetails` was the one writer that never used it. It is also the
 * writer that records the PNR (persistCommittedPnr), flags a booking for review,
 * releases the chain and holds a duplicate payment. A cancellation or a payment
 * reconcile landing between its read and its write was simply erased, and for
 * the PNR that means a reservation the airline holds that nobody can find again.
 *
 * `queueBookingForRetry` had the same gap on `gds_chain`, while every sibling -
 * claimBookingChain, refreshChainClaim, holdChainClaim and the worker's own
 * retryLater - compares and sets.
 */

const REF = 'FLTCAS1';

const row = (details = {}) => ({
  id: 'bk-1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  booking_details: { order_id: REF, success_indicator: 'SI-1', ...details },
});

const load = async (rows, { staleRead = null } = {}) => {
  vi.resetModules();
  const table = fakeBookingsTable(rows);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  // `staleRead` hands the first read a copy of the row as it was, while the
  // table already holds someone else's write: exactly a lost race.
  let reads = 0;
  supabase.from.mockImplementation((name) => {
    const chain = table.from(name);
    if (!staleRead) return chain;
    const single = chain.single;
    chain.single = async () => {
      reads += 1;
      const answer = await single();
      return reads === 1 ? { data: staleRead, error: null } : answer;
    };
    return chain;
  });
  const routes = await import('../../backend/routes/flight.routes.js');
  return { table, ...routes };
};

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWTEST');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
});

describe('patchBookingDetails', () => {
  // Generous: `load` does vi.resetModules() and re-imports flight.routes.js,
  // which alone can take seconds. The default 5s timeout made this case fail
  // for its import cost rather than its behaviour, which is worthless as
  // evidence in either direction.
  it('merges its part and leaves the rest of the column alone', async () => {
    const { table, patchBookingDetails } = await load([row({ customer_email: 'a@example.com' })]);

    const saved = await patchBookingDetails(REF, { pnr: 'ABC123' });

    expect(saved).toBeTruthy();
    expect(table.row(REF).booking_details.pnr).toBe('ABC123');
    expect(table.row(REF).booking_details.customer_email).toBe('a@example.com');
  }, 30000);

  // The bug, exactly: a write that landed between the read and the write used
  // to be spread away by the stale copy.
  it('does not erase a write that landed while it was being built', async () => {
    const { table, patchBookingDetails } = await load([row()]);
    let injected = false;

    const saved = await patchBookingDetails(REF, () => {
      if (!injected) {
        injected = true;
        // Someone else records a cancellation after our read, before our write.
        table.row(REF).booking_details.cancellation = { cancelledAt: '2026-09-16T00:00:00Z' };
      }
      return { pnr: 'ABC123' };
    });

    expect(saved).toBeTruthy();
    expect(table.row(REF).booking_details.pnr, 'our change still lands').toBe('ABC123');
    expect(table.row(REF).booking_details.cancellation?.cancelledAt, 'and theirs survives')
      .toBe('2026-09-16T00:00:00Z');
  });

  it('gives up rather than clobber when the row will not settle', async () => {
    const { table, patchBookingDetails } = await load([row()]);

    const saved = await patchBookingDetails(REF, () => {
      // A writer that never stops: every attempt loses its race.
      table.row(REF).booking_details.pnr = `RACE${Math.random()}`;
      return { needs_review: { reason: 'x', at: new Date().toISOString() } };
    }, { attempts: 2 });

    expect(saved).toBeNull();
    expect(table.row(REF).booking_details.needs_review, 'nothing half-written').toBeUndefined();
  });
});

describe('flagForReview', () => {
  /**
   * `decideFlightRefund` reads `gds.ticketed` and `tickets` - never
   * `needs_review.ticketed`. A booking held AFTER its ticket was issued wrote
   * only the latter, so `rowTicketed` stayed false and the guard "the booking
   * records a ticket, but the airline showed none" could not fire: a later
   * cancel whose retrieve missed the FA elements refunded in full against a
   * live ticket.
   */
  it('records the ticket where the refund decision looks for it', async () => {
    const { table, flagForReview } = await load([row({ gds: { tst_refs: ['1'], ticketed: false } })]);

    await flagForReview({
      bookingReference: REF,
      pnr: 'ABC123',
      reason: 'chain failed after commit at readTickets',
      ticketed: true,
    });

    const details = table.row(REF).booking_details;
    expect(details.gds.ticketed).toBe(true);
    expect(details.needs_review.ticketed).toBe(true);
    // And the rest of `gds` is not replaced wholesale.
    expect(details.gds.tst_refs).toEqual(['1']);
  });

  it('leaves the ticketing verdict alone when no ticket was issued', async () => {
    const { table, flagForReview } = await load([row({ gds: { ticketed: false } })]);

    await flagForReview({
      bookingReference: REF,
      pnr: 'ABC123',
      reason: 'chain failed after commit at issueTicket',
      ticketed: false,
    });

    expect(table.row(REF).booking_details.gds.ticketed).toBe(false);
    expect(table.row(REF).booking_details.needs_review.ticketed).toBe(false);
  });
});

describe('queueBookingForRetry', () => {
  it('queues a booking nobody else has taken', async () => {
    const { table, queueBookingForRetry } = await load([row()]);

    expect(await queueBookingForRetry(REF, { bookingReference: REF })).toBe(true);
    expect(table.row(REF).booking_details.gds_chain.state).toBe('queued');
  });

  // The bug: it wrote `queued` over whatever claim it found, so a request that
  // had taken the booking since was silently demoted.
  it('refuses to queue over a claim taken since it read the row', async () => {
    const mine = row({ gds_chain: { state: 'in_progress', startedAt: '2026-09-16T00:00:00Z', attempt: 1 } });
    const theirs = row({ gds_chain: { state: 'in_progress', startedAt: '2026-09-16T00:05:00Z', attempt: 2 } });
    const { table, queueBookingForRetry } = await load([theirs], { staleRead: mine });

    expect(await queueBookingForRetry(REF, { bookingReference: REF })).toBe(false);
    // Their claim is untouched.
    expect(table.row(REF).booking_details.gds_chain.startedAt).toBe('2026-09-16T00:05:00Z');
    expect(table.row(REF).booking_details.gds_chain.state).toBe('in_progress');
  });
});
