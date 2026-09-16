import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { CHAIN_CLAIM_TTL_MS, liveChainState } from '../../backend/utils/bookingChainClaim.js';

/**
 * A committed chain keeps its claim for as long as it is still working.
 *
 * `persistCommittedPnr` writes `{ state: 'committed', committedAt }`, and
 * `liveChainState` holds the booking for CHAIN_CLAIM_TTL_MS measured from that
 * stamp. The heartbeat renewed only `in_progress` chains, on the assumption
 * that what follows a commit takes seconds.
 *
 * Since the airline-locator patience of #132 it does not. `issueInFreshSessions`
 * retrieves and issues in new sessions until the carrier sends its record
 * locator - to AMADEUS_WS_AIRLINE_LOCATOR_MAX_WAIT_MS, 180 s by default - plus
 * the issue retries after that. From the TTL to the end of that work the
 * booking read as held by nobody. A cancel arriving in the gap retrieved a PNR
 * with no tickets on it yet, so `hadTickets` was false, `decideFlightRefund`
 * answered `refund_all` with no cancellation fee, and the chain issued the
 * ticket seconds later: a live ticket, and the fare handed back in full.
 *
 * The fix renews a committed chain on its own stamp. The heartbeat is cleared
 * in a `finally`, so a chain that ends - either way - stops renewing and the
 * claim ages out exactly as it did before.
 */

const OLD = new Date(Date.now() - 100_000).toISOString();

const rowWith = (gds_chain) => ({
  booking_reference: 'FLT1',
  booking_details: { pnr: 'ABC123', gds: { ticketed: false }, gds_chain },
});

const load = async (rows, options) => {
  vi.resetModules();
  const table = fakeBookingsTable(rows, options);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const { refreshChainClaim } = await import('../../backend/routes/flight.routes.js');
  return { table, refreshChainClaim };
};

const chainOf = (table) => table.row('FLT1').booking_details.gds_chain;

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWTEST');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
});

describe('refreshChainClaim', () => {
  // The bug, exactly: ticketing in fresh sessions outlives the claim.
  it('renews a committed chain that is still issuing the ticket', async () => {
    const { table, refreshChainClaim } = await load([rowWith({ state: 'committed', committedAt: OLD })]);

    expect(await refreshChainClaim('FLT1')).toBe(true);
    expect(chainOf(table).committedAt).not.toBe(OLD);
    expect(chainOf(table).state).toBe('committed');
    // Generous: `load` re-imports flight.routes.js, and under a full-suite run
    // that alone can exceed the 5s default - a timeout, not a behaviour.
  }, 30000);

  it('keeps the booking held, so a cancel arriving mid-issuance is refused', async () => {
    // Committed longer ago than the claim lasts: without a renewal this reads
    // as free, and the cancel path refunds against a ticket about to exist.
    const stale = { state: 'committed', committedAt: new Date(Date.now() - CHAIN_CLAIM_TTL_MS - 5_000).toISOString() };
    expect(liveChainState(stale)).toBeNull();

    const { table, refreshChainClaim } = await load([rowWith(stale)]);
    await refreshChainClaim('FLT1');

    expect(liveChainState(chainOf(table))).toBe('committed');
  });

  it('still renews a running chain on its own stamp', async () => {
    const { table, refreshChainClaim } = await load([rowWith({ state: 'in_progress', startedAt: OLD, attempt: 1 })]);

    expect(await refreshChainClaim('FLT1')).toBe(true);
    expect(chainOf(table).startedAt).not.toBe(OLD);
    expect(chainOf(table).attempt).toBe(1);
  });

  // A renewal must never revive a claim someone else has released or taken.
  it('renews nothing once the chain has failed, queued or been cancelled', async () => {
    for (const state of ['failed', 'queued', 'cancelling']) {
      const { table, refreshChainClaim } = await load([rowWith({ state, startedAt: OLD, committedAt: OLD })]);
      expect(await refreshChainClaim('FLT1'), state).toBe(false);
      expect(chainOf(table).startedAt, state).toBe(OLD);
    }
  });

  it('renews nothing when the stamp moved under it', async () => {
    const { refreshChainClaim } = await load(
      [rowWith({ state: 'committed', committedAt: OLD })],
      // The compare-and-set finds nothing to update: someone else wrote first.
      { fail: ({ patch }) => Boolean(patch) },
    );

    expect(await refreshChainClaim('FLT1')).toBe(false);
  });

  it('renews nothing for a chain with no stamp to compare', async () => {
    const { refreshChainClaim } = await load([rowWith({ state: 'committed' })]);

    expect(await refreshChainClaim('FLT1')).toBe(false);
  });
});
