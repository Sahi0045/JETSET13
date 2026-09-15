import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * holdChainClaim: does this request still hold the booking, just before the
 * chain commits its PNR?
 *
 * The heartbeat's failures were swallowed and a slow chain looked abandoned, so
 * a retry or the queue could take the booking over while the first chain went
 * on to commit - two PNRs against one payment.
 */

const OLD = new Date(Date.now() - 5 * 60_000).toISOString();

const rowWith = (gds_chain) => ({ booking_reference: 'FLT1', booking_details: { success_indicator: 'SI-1', gds_chain } });

const load = async (rows, options) => {
  vi.resetModules();
  const table = fakeBookingsTable(rows, options);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const { holdChainClaim } = await import('../../backend/routes/flight.routes.js');
  return { table, holdChainClaim };
};

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWTEST');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
});

describe('holdChainClaim', () => {
  it('holds a claim that is still this attempt, and renews it for the commit', async () => {
    const { table, holdChainClaim } = await load([rowWith({ state: 'in_progress', startedAt: OLD, attempt: 1 })]);

    expect(await holdChainClaim('FLT1', 1)).toBe('held');
    expect(table.row('FLT1').booking_details.gds_chain.startedAt).not.toBe(OLD);
    expect(table.row('FLT1').booking_details.gds_chain.attempt).toBe(1);
  });

  it('has lost a claim a later attempt took over', async () => {
    const { table, holdChainClaim } = await load([rowWith({ state: 'in_progress', startedAt: OLD, attempt: 2 })]);

    expect(await holdChainClaim('FLT1', 1)).toBe('lost');
    // And leaves the other attempt's claim exactly as it was.
    expect(table.row('FLT1').booking_details.gds_chain.startedAt).toBe(OLD);
  });

  it('has lost a booking that is being cancelled, queued or already committed', async () => {
    for (const state of ['cancelling', 'queued', 'committed', 'failed']) {
      const { holdChainClaim } = await load([rowWith({ state, startedAt: OLD, attempt: 1 })]);
      expect(await holdChainClaim('FLT1', 1), state).toBe('lost');
    }
  });

  it('cannot say when the database does not answer', async () => {
    const { holdChainClaim } = await load([rowWith({ state: 'in_progress', startedAt: OLD, attempt: 1 })], { fail: () => true });

    expect(await holdChainClaim('FLT1', 1)).toBe('unavailable');
  });
});
