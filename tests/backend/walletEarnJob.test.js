import { describe, expect, it, vi } from 'vitest';
import { earnOnce, startWalletEarnJob, sweepStaleHolds, tickOnce } from '../../backend/jobs/walletEarn.job.js';
import { settle, PAYABLE_MS, LOOKBACK_MS as CHECKOUT_LOOKBACK_MS } from '../../backend/jobs/abandonedCheckout.job.js';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-10-20T20:00:00Z');
const iso = (ms) => new Date(ms).toISOString();

const booking = (overrides = {}) => ({
  booking_reference: 'FLT1',
  user_id: 'u1',
  status: 'confirmed',
  payment_status: 'paid',
  travel_type: 'flight',
  created_at: iso(NOW - 30 * HOUR),
  booking_details: { verified_charge: { total: 130.38, walletCoins: 0 }, gds: { ticketed: true } },
  ...overrides,
});

/**
 * Just enough of the Supabase query builder to run the jobs' reads against
 * arrays: the filters they use, ordering, ranges, and a thenable result.
 */
function fakeClient({ bookings = [], entries = [], holds = [], errors = {} } = {}) {
  const tables = { bookings, wallet_entries: entries, wallet_holds: holds };
  const reads = [];
  return {
    reads,
    from(table) {
      const filters = [];
      const orders = [];
      let window = null;
      let max = Infinity;
      const run = () => {
        if (errors[table]) return { data: null, error: { message: errors[table] } };
        let rows = (tables[table] || []).filter((row) => filters.every((keep) => keep(row)));
        for (const { column, ascending } of [...orders].reverse()) {
          rows = [...rows].sort((a, b) => (a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : 0) * (ascending ? 1 : -1));
        }
        if (window) rows = rows.slice(window[0], window[1] + 1);
        return { data: rows.slice(0, max), error: null };
      };
      const query = {
        select: () => query,
        eq: (column, value) => { filters.push((row) => row[column] === value); return query; },
        in: (column, values) => { filters.push((row) => values.includes(row[column])); return query; },
        gte: (column, value) => { filters.push((row) => row[column] >= value); return query; },
        lte: (column, value) => { filters.push((row) => row[column] <= value); return query; },
        not: (column, operator, value) => {
          if (operator === 'is' && value === null) filters.push((row) => row[column] !== null && row[column] !== undefined);
          return query;
        },
        order: (column, { ascending = true } = {}) => { orders.push({ column, ascending }); return query; },
        range: (from, to) => { window = [from, to]; return query; },
        limit: (count) => { max = count; return query; },
        maybeSingle: async () => { const result = run(); return { data: result.data?.[0] ?? null, error: result.error }; },
        then: (resolve, reject) => {
          reads.push(table);
          return Promise.resolve(run()).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

const earnEntry = (reference, index = 0) => ({
  id: index + 1,
  kind: 'earn',
  idempotency_key: `earn:${reference}`,
  created_at: iso(NOW - 20 * HOUR),
});

const earnArgs = (client, extra = {}) => ({
  client, now: NOW, timeZone: 'America/Los_Angeles', ...extra,
});

describe('earning Jet Coins', () => {
  it('credits a coin per whole card dollar once the free window has closed', async () => {
    const earn = vi.fn(async () => ({ applied: true }));
    const result = await earnOnce(earnArgs(fakeClient({ bookings: [booking()] }), { earn }));
    expect(earn).toHaveBeenCalledWith(expect.anything(), { userId: 'u1', bookingReference: 'FLT1', coins: 130 });
    expect(result.credited).toBe(1);
  });

  it('waits while the booking can still be cancelled for free', async () => {
    const earn = vi.fn();
    await earnOnce(earnArgs(fakeClient({ bookings: [booking({ created_at: iso(NOW - 1 * HOUR) })] }), { earn }));
    expect(earn).not.toHaveBeenCalled();
  });

  it('skips a booking not ticketed, already earned, or without an owner', async () => {
    const earn = vi.fn();
    const bookings = [
      booking({ booking_reference: 'A', booking_details: { verified_charge: { total: 50, walletCoins: 0 } } }),
      booking({ booking_reference: 'B' }),
      booking({ booking_reference: 'C', user_id: null }),
    ];
    await earnOnce(earnArgs(fakeClient({ bookings, entries: [earnEntry('B')] }), { earn }));
    expect(earn).not.toHaveBeenCalled();
  });

  it('skips a booking that is not confirmed and paid', async () => {
    const earn = vi.fn();
    const bookings = [
      booking({ booking_reference: 'A', status: 'cancelled' }),
      booking({ booking_reference: 'B', payment_status: 'refunded' }),
      booking({ booking_reference: 'C', travel_type: 'hotel' }),
    ];
    await earnOnce(earnArgs(fakeClient({ bookings }), { earn }));
    expect(earn).not.toHaveBeenCalled();
  });

  it('does not credit a booking before a dollar was charged to the card', async () => {
    const earn = vi.fn();
    const bookings = [booking({ booking_details: { verified_charge: { total: 0.4, walletCoins: 0 }, gds: { ticketed: true } } })];
    await earnOnce(earnArgs(fakeClient({ bookings }), { earn }));
    expect(earn).not.toHaveBeenCalled();
  });

  it('credits a booking whose ticket numbers are recorded though gds says nothing', async () => {
    const earn = vi.fn(async () => ({ applied: true }));
    const bookings = [booking({ booking_details: { verified_charge: { total: 20, walletCoins: 0 }, tickets: [{ number: '0572100000001' }] } })];
    await earnOnce(earnArgs(fakeClient({ bookings }), { earn }));
    expect(earn).toHaveBeenCalledTimes(1);
  });

  it('reaches a newer ready booking behind more than a page of bookings already earned', async () => {
    const earn = vi.fn(async () => ({ applied: true }));
    const older = Array.from({ length: 7 }, (_, index) => booking({
      booking_reference: `OLD${index}`,
      created_at: iso(NOW - (10 * DAY) + index * HOUR),
    }));
    const newer = booking({ booking_reference: 'NEW1', created_at: iso(NOW - 26 * HOUR) });
    const entries = older.map((row, index) => earnEntry(row.booking_reference, index));
    const result = await earnOnce(earnArgs(fakeClient({ bookings: [...older, newer], entries }), { earn, pageSize: 3 }));
    expect(earn).toHaveBeenCalledTimes(1);
    expect(earn).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ bookingReference: 'NEW1' }));
    expect(result.credited).toBe(1);
  });

  it('reaches a ready booking behind more than a page of bookings that never qualify', async () => {
    const earn = vi.fn(async () => ({ applied: true }));
    const notTicketed = Array.from({ length: 7 }, (_, index) => booking({
      booking_reference: `NT${index}`,
      created_at: iso(NOW - (10 * DAY) + index * HOUR),
      booking_details: { verified_charge: { total: 50, walletCoins: 0 } },
    }));
    const ready = booking({ booking_reference: 'READY', created_at: iso(NOW - 26 * HOUR) });
    await earnOnce(earnArgs(fakeClient({ bookings: [...notTicketed, ready] }), { earn, pageSize: 3 }));
    expect(earn).toHaveBeenCalledTimes(1);
    expect(earn).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ bookingReference: 'READY' }));
  });

  it('credits at most the limit per run, oldest first, and the rest on the next run', async () => {
    const earn = vi.fn(async () => ({ applied: true }));
    const bookings = Array.from({ length: 5 }, (_, index) => booking({
      booking_reference: `B${index}`,
      created_at: iso(NOW - (5 * DAY) + index * HOUR),
    }));
    const result = await earnOnce(earnArgs(fakeClient({ bookings }), { earn, limit: 2 }));
    expect(result.credited).toBe(2);
    expect(earn.mock.calls.map(([, args]) => args.bookingReference)).toEqual(['B0', 'B1']);
  });

  it('does not spend the limit on bookings already earned', async () => {
    const earn = vi.fn(async () => ({ applied: true }));
    const bookings = Array.from({ length: 4 }, (_, index) => booking({
      booking_reference: `B${index}`,
      created_at: iso(NOW - (5 * DAY) + index * HOUR),
    }));
    const entries = [earnEntry('B0', 0), earnEntry('B1', 1)];
    const result = await earnOnce(earnArgs(fakeClient({ bookings, entries }), { earn, limit: 2 }));
    expect(result.credited).toBe(2);
    expect(earn.mock.calls.map(([, args]) => args.bookingReference)).toEqual(['B2', 'B3']);
  });

  it('does not count a credit the wallet had already made', async () => {
    const earn = vi.fn(async () => ({ applied: false }));
    const reverse = vi.fn();
    const result = await earnOnce(earnArgs(fakeClient({ bookings: [booking()] }), { earn, reverse }));
    expect(result.credited).toBe(0);
    expect(reverse).not.toHaveBeenCalled();
  });

  it('keeps going when one credit fails', async () => {
    const earn = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('down'), { code: 'WALLET_UNAVAILABLE' }))
      .mockResolvedValue({ applied: true });
    const bookings = [
      booking({ booking_reference: 'A', created_at: iso(NOW - 3 * DAY) }),
      booking({ booking_reference: 'B', created_at: iso(NOW - 2 * DAY) }),
    ];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await earnOnce(earnArgs(fakeClient({ bookings }), { earn }));
    warn.mockRestore();
    expect(result.credited).toBe(1);
    expect(earn).toHaveBeenCalledTimes(2);
  });

  it('reads nothing and credits nothing when the bookings cannot be read', async () => {
    const earn = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await earnOnce(earnArgs(fakeClient({ bookings: [booking()], errors: { bookings: 'connection reset' } }), { earn }));
    warn.mockRestore();
    expect(result.credited).toBe(0);
    expect(earn).not.toHaveBeenCalled();
  });

  it('credits nothing when the earned coins cannot be listed', async () => {
    const earn = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await earnOnce(earnArgs(fakeClient({ bookings: [booking()], errors: { wallet_entries: 'connection reset' } }), { earn }));
    warn.mockRestore();
    expect(earn).not.toHaveBeenCalled();
  });
});

describe('which bookings earn', () => {
  const run = (rows, extra = {}) => {
    const earn = vi.fn(async () => ({ applied: true }));
    const done = earnOnce(earnArgs(fakeClient({ bookings: rows }), { earn, ...extra }));
    return { earn, done };
  };

  it('never credits a booking made before checkouts recorded walletCoins', async () => {
    const { earn, done } = run([booking({ booking_details: { verified_charge: { total: 130.38 }, gds: { ticketed: true } } })]);
    await done;
    expect(earn).not.toHaveBeenCalled();
  });

  it('credits a booking whose checkout recorded walletCoins, even 0', async () => {
    const { earn, done } = run([booking()]);
    await done;
    expect(earn).toHaveBeenCalledTimes(1);
  });

  it('credits on the card amount of a booking that also used coins', async () => {
    const { earn, done } = run([booking({ booking_details: { verified_charge: { total: 80.5, walletCoins: 2000 }, gds: { ticketed: true } } })]);
    await done;
    expect(earn).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ coins: 80 }));
  });

  it('credits a booking ticketed by hand, which stays pending_ticketing', async () => {
    const { earn, done } = run([booking({ status: 'pending_ticketing' })]);
    const result = await done;
    expect(earn).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ credited: 1, reversed: 0 });
  });

  it('does not credit a pending_ticketing booking that has no ticket', async () => {
    const { earn, done } = run([booking({ status: 'pending_ticketing', booking_details: { verified_charge: { total: 130.38, walletCoins: 0 } } })]);
    await done;
    expect(earn).not.toHaveBeenCalled();
  });

  it('does not credit a ticketed booking that is cancelled or still pending', async () => {
    const { earn, done } = run([booking({ booking_reference: 'A', status: 'cancelled' }), booking({ booking_reference: 'B', status: 'pending' })]);
    await done;
    expect(earn).not.toHaveBeenCalled();
  });

  it('does not credit a booking that is being cancelled', async () => {
    const { earn, done } = run([booking({ booking_details: {
      verified_charge: { total: 130.38, walletCoins: 0 }, gds: { ticketed: true }, gds_chain: { state: 'cancelling', startedAt: iso(NOW - 30_000) },
    } })]);
    await done;
    expect(earn).not.toHaveBeenCalled();
  });

  it('credits a booking whose cancel claim has long expired', async () => {
    const { earn, done } = run([booking({ booking_details: {
      verified_charge: { total: 130.38, walletCoins: 0 }, gds: { ticketed: true }, gds_chain: { state: 'cancelling', startedAt: iso(NOW - HOUR) },
    } })]);
    await done;
    expect(earn).toHaveBeenCalledTimes(1);
  });
});

describe('a booking cancelled while its coins are being credited', () => {
  it('takes the coins back when the booking is no longer confirmed', async () => {
    const rows = [booking()];
    const earn = vi.fn(async () => {
      rows[0] = { ...rows[0], status: 'cancelled' };
      return { applied: true };
    });
    const reverse = vi.fn(async () => 130);
    const result = await earnOnce(earnArgs(fakeClient({ bookings: rows }), { earn, reverse }));
    expect(reverse).toHaveBeenCalledWith(expect.anything(), 'FLT1');
    expect(result).toMatchObject({ credited: 0, reversed: 1 });
  });

  it('takes the coins back when the booking is no longer ticketed', async () => {
    const rows = [booking()];
    const earn = vi.fn(async () => {
      rows[0] = { ...rows[0], booking_details: { verified_charge: { total: 130.38, walletCoins: 0 }, gds: { ticketed: false } } };
      return { applied: true };
    });
    const reverse = vi.fn(async () => 130);
    await earnOnce(earnArgs(fakeClient({ bookings: rows }), { earn, reverse }));
    expect(reverse).toHaveBeenCalledWith(expect.anything(), 'FLT1');
  });

  it('takes the coins back when the booking was refunded meanwhile', async () => {
    const rows = [booking()];
    const earn = vi.fn(async () => {
      rows[0] = { ...rows[0], payment_status: 'refunded' };
      return { applied: true };
    });
    const reverse = vi.fn(async () => 130);
    await earnOnce(earnArgs(fakeClient({ bookings: rows }), { earn, reverse }));
    expect(reverse).toHaveBeenCalledTimes(1);
  });

  it('does not credit a booking found being cancelled on the read just before crediting', async () => {
    const client = fakeClient({ bookings: [booking()] });
    const from = client.from.bind(client);
    client.from = (table) => {
      const query = from(table);
      if (table === 'bookings') {
        query.maybeSingle = async () => ({
          data: booking({ booking_details: { verified_charge: { total: 130.38, walletCoins: 0 }, gds: { ticketed: true }, gds_chain: { state: 'cancelling', startedAt: iso(NOW - 1000) } } }),
          error: null,
        });
      }
      return query;
    };
    const earn = vi.fn();
    const result = await earnOnce(earnArgs(client, { earn }));
    expect(earn).not.toHaveBeenCalled();
    expect(result.credited).toBe(0);
  });

  it('does not credit when the booking cannot be read just before crediting, and says so', async () => {
    const client = fakeClient({ bookings: [booking()] });
    const from = client.from.bind(client);
    client.from = (table) => {
      const query = from(table);
      if (table === 'bookings') query.maybeSingle = async () => ({ data: null, error: { message: 'timeout' } });
      return query;
    };
    const earn = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await earnOnce(earnArgs(client, { earn }));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    expect(earn).not.toHaveBeenCalled();
  });

  it('takes the coins back when a cancel claimed the booking while it was credited', async () => {
    const rows = [booking()];
    const earn = vi.fn(async () => {
      rows[0] = { ...rows[0], booking_details: { ...rows[0].booking_details, gds_chain: { state: 'cancelling', startedAt: iso(NOW) } } };
      return { applied: true };
    });
    const reverse = vi.fn(async () => 130);
    const result = await earnOnce(earnArgs(fakeClient({ bookings: rows }), { earn, reverse }));
    expect(reverse).toHaveBeenCalledWith(expect.anything(), 'FLT1');
    expect(result).toMatchObject({ credited: 0, reversed: 1 });
  });

  it('leaves the coins when a booking moves to pending_ticketing after being credited', async () => {
    const rows = [booking()];
    const earn = vi.fn(async () => {
      rows[0] = { ...rows[0], status: 'pending_ticketing' };
      return { applied: true };
    });
    const reverse = vi.fn();
    await earnOnce(earnArgs(fakeClient({ bookings: rows }), { earn, reverse }));
    expect(reverse).not.toHaveBeenCalled();
  });

  it('leaves the coins when the booking still stands', async () => {
    const reverse = vi.fn();
    const result = await earnOnce(earnArgs(fakeClient({ bookings: [booking()] }), { earn: async () => ({ applied: true }), reverse }));
    expect(reverse).not.toHaveBeenCalled();
    expect(result).toMatchObject({ credited: 1, reversed: 0 });
  });

  it('does not take the coins back when the booking cannot be read again, and says so', async () => {
    const client = fakeClient({ bookings: [booking()] });
    let reads = 0;
    const from = client.from.bind(client);
    client.from = (table) => {
      const query = from(table);
      if (table === 'bookings') {
        const read = query.maybeSingle;
        query.maybeSingle = async () => {
          reads += 1;
          return reads === 1 ? read() : { data: null, error: { message: 'timeout' } };
        };
      }
      return query;
    };
    const reverse = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await earnOnce(earnArgs(client, { earn: async () => ({ applied: true }), reverse }));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    expect(reads).toBe(2);
    expect(reverse).not.toHaveBeenCalled();
  });

  it('says so when the coins cannot be taken back, and carries on', async () => {
    const rows = [booking({ booking_reference: 'A', created_at: iso(NOW - 3 * DAY) }), booking({ booking_reference: 'B', created_at: iso(NOW - 2 * DAY) })];
    const earn = vi.fn(async (_client, { bookingReference }) => {
      const index = rows.findIndex((row) => row.booking_reference === bookingReference);
      rows[index] = { ...rows[index], status: 'cancelled' };
      return { applied: true };
    });
    const reverse = vi.fn().mockRejectedValueOnce(Object.assign(new Error('down'), { code: 'WALLET_UNAVAILABLE' })).mockResolvedValue(10);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await earnOnce(earnArgs(fakeClient({ bookings: rows }), { earn, reverse }));
    expect(error).toHaveBeenCalled();
    error.mockRestore();
    expect(reverse).toHaveBeenCalledTimes(2);
    expect(result.reversed).toBe(1);
  });
});

describe('a checkout never paid', () => {
  const row = {
    booking_reference: 'FLT9',
    created_at: iso(NOW - 4 * HOUR),
    booking_details: { verified_charge: { wallet: { coins: 5000 } } },
  };

  it('gives its coins back once it can no longer be paid', async () => {
    const release = vi.fn(async () => ({ status: 'released', coins: 5000 }));
    const outcome = await settle(row, { now: NOW, reconcile: async () => ({ paid: false }), release });
    expect(outcome).toEqual({ outcome: 'not-paid', final: true });
    expect(release).toHaveBeenCalledWith('FLT9');
  });

  it('keeps them while the payment page could still be paid', async () => {
    const release = vi.fn();
    await settle({ ...row, created_at: iso(NOW - 1 * HOUR) }, { now: NOW, reconcile: async () => ({ paid: false }), release });
    expect(release).not.toHaveBeenCalled();
  });

  it('gives them back when the gateway has never heard of the order', async () => {
    const release = vi.fn(async () => ({ status: 'released', coins: 5000 }));
    const outcome = await settle(row, { now: NOW, reconcile: async () => ({ paid: false, gatewayUnavailable: true, gatewayStatus: 404 }), release });
    expect(outcome).toEqual({ outcome: 'not-paid', final: true });
    expect(release).toHaveBeenCalledWith('FLT9');
  });

  it('keeps them while the gateway cannot be reached', async () => {
    const release = vi.fn();
    const outcome = await settle(row, { now: NOW, reconcile: async () => ({ paid: false, gatewayUnavailable: true, gatewayStatus: 503 }), release });
    expect(outcome).toEqual({ outcome: 'gateway-unavailable', final: false });
    expect(release).not.toHaveBeenCalled();
  });

  it('keeps them while the gateway still holds money for the order', async () => {
    const release = vi.fn();
    const outcome = await settle(row, { now: NOW, reconcile: async () => ({ paid: false, heldAmount: 40, everCaptured: true }), release });
    expect(outcome.outcome).toBe('not-paid');
    expect(release).not.toHaveBeenCalled();
  });

  it('asks about it again when the coins could not be released', async () => {
    const release = vi.fn(async () => null);
    const outcome = await settle(row, { now: NOW, reconcile: async () => ({ paid: false }), release });
    expect(outcome).toEqual({ outcome: 'not-paid', final: false });
  });

  it('does not call it settled when the coins were already captured by a booking, and reports it', async () => {
    const release = vi.fn(async () => ({ status: 'captured', coins: 0 }));
    const report = vi.fn();
    const outcome = await settle(row, { now: NOW, reconcile: async () => ({ paid: false }), release, report });
    expect(outcome).toEqual({ outcome: 'not-paid', final: false });
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][1]).toMatchObject({ bookingReference: 'FLT9', status: 'captured' });
  });

  it('is settled when the hold was already released or never existed', async () => {
    const report = vi.fn();
    for (const status of ['released', 'none']) {
      const release = vi.fn(async () => ({ status, coins: 0 }));
      const outcome = await settle(row, { now: NOW, reconcile: async () => ({ paid: false }), release, report });
      expect(outcome).toEqual({ outcome: 'not-paid', final: true });
    }
    expect(report).not.toHaveBeenCalled();
  });

  it('does not touch the wallet for a checkout that used no coins', async () => {
    const release = vi.fn();
    const outcome = await settle({ ...row, booking_details: { verified_charge: { total: 100 } } }, { now: NOW, reconcile: async () => ({ paid: false }), release });
    expect(outcome).toEqual({ outcome: 'not-paid', final: true });
    expect(release).not.toHaveBeenCalled();
  });
});

describe('holds left behind', () => {
  const hold = (reference, overrides = {}) => ({
    booking_reference: reference, user_id: 'u1', coins: 500, status: 'held', created_at: iso(NOW - 4 * HOUR), ...overrides,
  });
  const checkout = (reference, overrides = {}) => ({
    id: `id-${reference}`,
    booking_reference: reference,
    status: 'pending',
    payment_status: 'unpaid',
    total_amount: 100,
    created_at: iso(NOW - 4 * HOUR),
    ...overrides,
    booking_details: {
      order_id: reference,
      success_indicator: 'SUCCESS',
      pending_booking_data: { returnUrl: `https://www.jetsetterss.com/payment/callback?orderId=${reference}` },
      verified_charge: { wallet: { coins: 500 } },
      ...(overrides.booking_details || {}),
    },
  });
  const sweepWith = (extra, client) => {
    const deps = {
      release: vi.fn(async () => ({ status: 'released', coins: 500 })),
      capture: vi.fn(async () => ({ status: 'captured' })),
      reconcile: vi.fn(async () => ({ paid: false })),
      flag: vi.fn(async () => 'flagged'),
    };
    const run = () => sweepStaleHolds({ client, now: NOW, site: 'site', ...deps, ...extra });
    return { deps, run };
  };

  it('gives coins back when the checkout never produced a booking row', async () => {
    const { deps, run } = sweepWith({}, fakeClient({ holds: [hold('GONE1')] }));
    const result = await run();
    expect(deps.release).toHaveBeenCalledWith(expect.anything(), 'GONE1');
    expect(deps.capture).not.toHaveBeenCalled();
    expect(result.released).toBe(1);
  });

  it('leaves a hold alone until its payment page can no longer be paid', async () => {
    const { deps, run } = sweepWith({}, fakeClient({ holds: [hold('NEW1', { created_at: iso(NOW - PAYABLE_MS + 60_000) })] }));
    await run();
    expect(deps.release).not.toHaveBeenCalled();
  });

  it('only looks at holds still held', async () => {
    const { deps, run } = sweepWith({}, fakeClient({ holds: [hold('A', { status: 'captured' }), hold('B', { status: 'released' })] }));
    await run();
    expect(deps.release).not.toHaveBeenCalled();
    expect(deps.capture).not.toHaveBeenCalled();
  });

  it('captures the coins of a paid booking that has a reservation', async () => {
    const bookings = [checkout('PAID1', { payment_status: 'paid', booking_details: { pnr: 'ABC123' } })];
    const { deps, run } = sweepWith({}, fakeClient({ holds: [hold('PAID1')], bookings }));
    const result = await run();
    expect(deps.capture).toHaveBeenCalledWith(expect.anything(), 'PAID1');
    expect(deps.release).not.toHaveBeenCalled();
    expect(result.captured).toBe(1);
  });

  describe('a paid checkout with no reservation', () => {
    const past = { created_at: iso(NOW - CHECKOUT_LOOKBACK_MS - DAY) };

    it('is left alone, neither captured nor flagged, while the abandoned-checkout job still covers it', async () => {
      for (const age of [4 * HOUR, 7 * HOUR, 3 * DAY]) {
        const bookings = [checkout('PAID1', { payment_status: 'paid', created_at: iso(NOW - age) })];
        const { deps, run } = sweepWith({}, fakeClient({ holds: [hold('PAID1', { created_at: iso(NOW - age) })], bookings }));
        const result = await run();
        expect(deps.capture).not.toHaveBeenCalled();
        expect(deps.release).not.toHaveBeenCalled();
        expect(deps.flag).not.toHaveBeenCalled();
        expect(result.skipped).toEqual([{ bookingReference: 'PAID1', reason: 'left-to-abandoned-checkout' }]);
      }
    });

    it('is flagged once the job no longer covers it, and not again', async () => {
      const row = checkout('PAID2', { payment_status: 'paid', ...past });
      const holdRow = hold('PAID2', past);
      const flag = vi.fn(async () => 'flagged');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const first = await sweepWith({ flag }, fakeClient({ holds: [holdRow], bookings: [row] })).run();
      const flagged = { ...row, booking_details: { ...row.booking_details, needs_review: { reason: 'x' } } };
      await sweepWith({ flag }, fakeClient({ holds: [holdRow], bookings: [flagged] })).run();
      warn.mockRestore();
      expect(flag).toHaveBeenCalledTimes(1);
      expect(first.flagged).toBe(1);
    });

    it('is flagged when the job cannot cover it (no success indicator) at any age', async () => {
      const bookings = [checkout('PAID5', { payment_status: 'paid', booking_details: { success_indicator: undefined } })];
      const { deps, run } = sweepWith({}, fakeClient({ holds: [hold('PAID5')], bookings }));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await run();
      warn.mockRestore();
      expect(deps.flag).toHaveBeenCalledTimes(1);
    });

    it('keeps its coins on hold and puts it in front of a person', async () => {
      const bookings = [checkout('PAID2', { payment_status: 'paid', ...past })];
      const { deps, run } = sweepWith({}, fakeClient({ holds: [hold('PAID2', past)], bookings }));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await run();
      warn.mockRestore();
      expect(deps.capture).not.toHaveBeenCalled();
      expect(deps.release).not.toHaveBeenCalled();
      expect(deps.reconcile).not.toHaveBeenCalled();
      expect(deps.flag).toHaveBeenCalledTimes(1);
      expect(deps.flag).toHaveBeenCalledWith(expect.objectContaining({ booking_reference: 'PAID2' }), expect.stringContaining('Paid, but not booked'));
      expect(result).toMatchObject({ captured: 0, released: 0, flagged: 1 });
      expect(result.skipped).toEqual([{ bookingReference: 'PAID2', reason: 'paid-not-booked' }]);
    });

    it('is not flagged again once a person has been asked to look', async () => {
      const bookings = [checkout('PAID3', { payment_status: 'paid', ...past, booking_details: { needs_review: { reason: 'x' } } })];
      const { deps, run } = sweepWith({}, fakeClient({ holds: [hold('PAID3', past)], bookings }));
      await run();
      expect(deps.flag).not.toHaveBeenCalled();
      expect(deps.capture).not.toHaveBeenCalled();
    });

    it('is not flagged while a booking chain is running on it, or the queue has it', async () => {
      const bookings = [
        checkout('RUN1', { payment_status: 'paid', booking_details: { gds_chain: { state: 'in_progress', startedAt: iso(NOW - 30_000) } } }),
        checkout('QUE1', { payment_status: 'paid', booking_details: { queued_order: { a: 1 } } }),
      ];
      const { deps, run } = sweepWith({}, fakeClient({ holds: [hold('RUN1'), hold('QUE1')], bookings }));
      await run();
      expect(deps.flag).not.toHaveBeenCalled();
    });

    it('is not flagged from another site', async () => {
      const bookings = [checkout('LOCALPAID', { payment_status: 'paid', ...past, booking_details: { pending_booking_data: { returnUrl: 'http://localhost:5173/payment/callback' } } })];
      const { deps, run } = sweepWith({}, fakeClient({ holds: [hold('LOCALPAID', past)], bookings }));
      await run();
      expect(deps.flag).not.toHaveBeenCalled();
    });

    it('says so when it could not be flagged, and carries on', async () => {
      const bookings = [checkout('PAID4', { payment_status: 'paid', ...past })];
      const flag = vi.fn().mockRejectedValue(new Error('down'));
      const { deps, run } = sweepWith({ flag }, fakeClient({ holds: [hold('PAID4', past), hold('GONE2', { created_at: iso(NOW - 4 * HOUR + 1000) })], bookings }));
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await run();
      error.mockRestore();
      warn.mockRestore();
      expect(result.failed).toBe(1);
      expect(deps.release).toHaveBeenCalledWith(expect.anything(), 'GONE2');
    });
  });

  it('captures the coins of a booking that has a PNR', async () => {
    const bookings = [checkout('PNR1', { booking_details: { pnr: 'ABC123' } })];
    const { deps, run } = sweepWith({}, fakeClient({ holds: [hold('PNR1')], bookings }));
    await run();
    expect(deps.capture).toHaveBeenCalledWith(expect.anything(), 'PNR1');
    expect(deps.release).not.toHaveBeenCalled();
  });

  it('captures the coins of a booking that is ticketed', async () => {
    const bookings = [checkout('TKT1', { status: 'confirmed', booking_details: { gds: { ticketed: true } } })];
    const { deps, run } = sweepWith({}, fakeClient({ holds: [hold('TKT1')], bookings }));
    await run();
    expect(deps.capture).toHaveBeenCalledWith(expect.anything(), 'TKT1');
  });

  it('never asks the gateway about a booking it captures', async () => {
    const bookings = [checkout('PAID1', { payment_status: 'paid', booking_details: { pnr: 'ABC123' } })];
    const { deps, run } = sweepWith({}, fakeClient({ holds: [hold('PAID1')], bookings }));
    await run();
    expect(deps.reconcile).not.toHaveBeenCalled();
  });

  it('leaves an unpaid checkout to the abandoned-checkout job, which asks the gateway', async () => {
    const bookings = [checkout('UNPAID1')];
    const { deps, run } = sweepWith({}, fakeClient({ holds: [hold('UNPAID1')], bookings }));
    const result = await run();
    expect(deps.reconcile).not.toHaveBeenCalled();
    expect(deps.release).not.toHaveBeenCalled();
    expect(deps.capture).not.toHaveBeenCalled();
    expect(result.skipped).toEqual([{ bookingReference: 'UNPAID1', reason: 'left-to-abandoned-checkout' }]);
  });

  it('leaves another site\'s checkout alone, however old', async () => {
    const bookings = [checkout('LOCAL1', {
      created_at: iso(NOW - 9 * DAY),
      booking_details: { pending_booking_data: { returnUrl: 'http://localhost:5173/payment/callback?orderId=LOCAL1' } },
    })];
    const { deps, run } = sweepWith({}, fakeClient({ holds: [hold('LOCAL1', { created_at: iso(NOW - 9 * DAY) })], bookings }));
    const result = await run();
    expect(deps.reconcile).not.toHaveBeenCalled();
    expect(deps.release).not.toHaveBeenCalled();
    expect(result.skipped[0].reason).toBe('other-site');
  });

  it('leaves a checkout alone when it cannot tell which site took it', async () => {
    const bookings = [checkout('NOSITE1', { created_at: iso(NOW - 9 * DAY), booking_details: { pending_booking_data: {} } })];
    const { deps, run } = sweepWith({}, fakeClient({ holds: [hold('NOSITE1', { created_at: iso(NOW - 9 * DAY) })], bookings }));
    await run();
    expect(deps.reconcile).not.toHaveBeenCalled();
    expect(deps.release).not.toHaveBeenCalled();
  });

  describe('an unpaid checkout the abandoned-checkout job no longer covers', () => {
    const old = { created_at: iso(NOW - CHECKOUT_LOOKBACK_MS - DAY) };
    const oldHold = hold('OLD1', old);
    const oldRow = () => checkout('OLD1', old);

    it('gives the coins back only after the gateway says nothing was paid', async () => {
      const { deps, run } = sweepWith({}, fakeClient({ holds: [oldHold], bookings: [oldRow()] }));
      const result = await run();
      expect(deps.reconcile).toHaveBeenCalledTimes(1);
      expect(deps.release).toHaveBeenCalledWith(expect.anything(), 'OLD1');
      expect(result.released).toBe(1);
    });

    it('gives them back when the gateway never heard of the order (404)', async () => {
      const reconcile = vi.fn(async () => ({ paid: false, gatewayUnavailable: true, gatewayStatus: 404 }));
      const release = vi.fn(async () => ({ status: 'released', coins: 500 }));
      await sweepStaleHolds({ client: fakeClient({ holds: [oldHold], bookings: [oldRow()] }), now: NOW, site: 'site', reconcile, release, capture: vi.fn() });
      expect(release).toHaveBeenCalledWith(expect.anything(), 'OLD1');
    });

    it('keeps them when the gateway cannot be reached', async () => {
      const reconcile = vi.fn(async () => ({ paid: false, gatewayUnavailable: true, gatewayStatus: 503 }));
      const release = vi.fn();
      const result = await sweepStaleHolds({ client: fakeClient({ holds: [oldHold], bookings: [oldRow()] }), now: NOW, site: 'site', reconcile, release, capture: vi.fn() });
      expect(release).not.toHaveBeenCalled();
      expect(result.skipped[0].reason).toBe('gateway-unavailable');
    });

    it('keeps them when the gateway still holds money for the order', async () => {
      const reconcile = vi.fn(async () => ({ paid: false, heldAmount: 25, everCaptured: true }));
      const release = vi.fn();
      const result = await sweepStaleHolds({ client: fakeClient({ holds: [oldHold], bookings: [oldRow()] }), now: NOW, site: 'site', reconcile, release, capture: vi.fn() });
      expect(release).not.toHaveBeenCalled();
      expect(result.skipped[0].reason).toBe('money-held-at-gateway');
    });

    it('keeps them and puts it in front of a person when the gateway says it was paid but nothing was booked', async () => {
      const reconcile = vi.fn(async () => ({ paid: true }));
      const release = vi.fn();
      const capture = vi.fn();
      const flag = vi.fn(async () => 'flagged');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await sweepStaleHolds({ client: fakeClient({ holds: [oldHold], bookings: [oldRow()] }), now: NOW, site: 'site', reconcile, release, capture, flag });
      warn.mockRestore();
      expect(capture).not.toHaveBeenCalled();
      expect(release).not.toHaveBeenCalled();
      expect(flag).toHaveBeenCalledWith(expect.objectContaining({ booking_reference: 'OLD1' }), expect.stringContaining('Paid, but not booked'));
      expect(result.flagged).toBe(1);
    });

    it('asks the gateway about only a few checkouts a run', async () => {
      const holds = Array.from({ length: 4 }, (_, index) => hold(`OLD${index}`, old));
      const bookings = holds.map((row) => checkout(row.booking_reference, old));
      const reconcile = vi.fn(async () => ({ paid: false }));
      const release = vi.fn(async () => ({ status: 'released', coins: 500 }));
      const result = await sweepStaleHolds({ client: fakeClient({ holds, bookings }), now: NOW, site: 'site', reconcile, release, capture: vi.fn(), gatewayAsks: 2 });
      expect(reconcile).toHaveBeenCalledTimes(2);
      expect(result.released).toBe(2);
      expect(result.skipped.filter((entry) => entry.reason === 'gateway-asks-used')).toHaveLength(2);
    });
  });

  it('asks about a checkout the job cannot see (no success indicator) once it is old enough to be final', async () => {
    const bookings = [checkout('NOIND1', { booking_details: { success_indicator: undefined }, created_at: iso(NOW - 7 * HOUR) })];
    const reconcile = vi.fn(async () => ({ paid: false }));
    const release = vi.fn(async () => ({ status: 'released', coins: 500 }));
    await sweepStaleHolds({ client: fakeClient({ holds: [hold('NOIND1', { created_at: iso(NOW - 7 * HOUR) })], bookings }), now: NOW, site: 'site', reconcile, release, capture: vi.fn() });
    expect(release).toHaveBeenCalledWith(expect.anything(), 'NOIND1');
  });

  it('does not ask about such a checkout before the job\'s own booking window has passed', async () => {
    const bookings = [checkout('NOIND2', { booking_details: { success_indicator: undefined } })];
    const reconcile = vi.fn(async () => ({ paid: false }));
    const release = vi.fn();
    await sweepStaleHolds({ client: fakeClient({ holds: [hold('NOIND2')], bookings }), now: NOW, site: 'site', reconcile, release, capture: vi.fn() });
    expect(reconcile).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it.each([
    ['one being booked from the queue', { booking_details: { queued_order: { a: 1 } } }, 'owned-by-queue-or-review'],
    ['one a person has been asked to look at', { booking_details: { needs_review: { reason: 'x' } } }, 'owned-by-queue-or-review'],
    ['one whose booking chain is running', { booking_details: { gds_chain: { state: 'in_progress', startedAt: iso(NOW - 30_000) } } }, 'booking-in-progress'],
    ['a cancelled booking', { status: 'cancelled' }, 'cancelled-or-refunded'],
    ['a refunded booking', { payment_status: 'refunded' }, 'cancelled-or-refunded'],
    ['a partly refunded booking', { payment_status: 'partially_refunded', booking_details: { pnr: 'ABC123' } }, 'cancelled-or-refunded'],
  ])('leaves %s alone and says so', async (_label, overrides, reason) => {
    const { deps, run } = sweepWith({}, fakeClient({ holds: [hold('X1')], bookings: [checkout('X1', overrides)] }));
    const result = await run();
    expect(deps.release).not.toHaveBeenCalled();
    expect(deps.capture).not.toHaveBeenCalled();
    expect(result.skipped).toEqual([{ bookingReference: 'X1', reason }]);
  });

  it('does not treat a booking it could not read as having no row', async () => {
    const { deps, run } = sweepWith({}, fakeClient({ holds: [hold('A')], bookings: [], errors: { bookings: 'connection reset' } }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await run();
    warn.mockRestore();
    expect(deps.release).not.toHaveBeenCalled();
    expect(result.skipped).toEqual([{ bookingReference: 'A', reason: 'booking-unreadable' }]);
  });

  it('does nothing when the holds cannot be read', async () => {
    const { deps, run } = sweepWith({}, fakeClient({ errors: { wallet_holds: 'connection reset' } }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await run();
    warn.mockRestore();
    expect(deps.release).not.toHaveBeenCalled();
    expect(result).toMatchObject({ released: 0, captured: 0 });
  });

  it('works through at most the limit of changes a run, and reaches holds behind ones it leaves alone', async () => {
    const left = Array.from({ length: 4 }, (_, index) => hold(`LEFT${index}`, { created_at: iso(NOW - 5 * HOUR - index * 1000) }));
    const gone = Array.from({ length: 3 }, (_, index) => hold(`GONE${index}`, { created_at: iso(NOW - 4 * HOUR - index * 1000) }));
    const bookings = left.map((row) => checkout(row.booking_reference));
    const { deps, run } = sweepWith({ limit: 2, pageSize: 3 }, fakeClient({ holds: [...left, ...gone], bookings }));
    const result = await run();
    expect(deps.release).toHaveBeenCalledTimes(2);
    expect(result.released).toBe(2);
  });

  it('counts a failed release, carries on, and never throws', async () => {
    const release = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('down'), { code: 'WALLET_UNAVAILABLE' }))
      .mockResolvedValue({ status: 'released', coins: 500 });
    const { run } = sweepWith({ release }, fakeClient({ holds: [hold('A'), hold('B', { created_at: iso(NOW - 4 * HOUR + 1000) })] }));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await run();
    error.mockRestore();
    expect(result).toMatchObject({ released: 1, failed: 1 });
  });

  it('does not count a hold that was captured while it ran', async () => {
    const release = vi.fn(async () => ({ status: 'captured', coins: 0 }));
    const { run } = sweepWith({ release }, fakeClient({ holds: [hold('A')] }));
    const result = await run();
    expect(result.released).toBe(0);
  });
});

describe('the periodic run', () => {
  it('sweeps holds even when earning fails, and never throws', async () => {
    const release = vi.fn(async () => ({ status: 'released', coins: 500 }));
    const client = fakeClient({
      bookings: [booking()],
      holds: [{ booking_reference: 'GONE1', user_id: 'u1', coins: 500, status: 'held', created_at: iso(NOW - 4 * HOUR) }],
      errors: { wallet_entries: 'connection reset' },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(tickOnce({ client, now: NOW, timeZone: 'America/Los_Angeles', site: 'site', earn: vi.fn(), release })).resolves.toBeDefined();
    warn.mockRestore();
    error.mockRestore();
    expect(release).toHaveBeenCalledWith(expect.anything(), 'GONE1');
  });

  it('earns even when the sweep fails', async () => {
    const earn = vi.fn(async () => ({ applied: true }));
    const client = fakeClient({ bookings: [booking()], errors: { wallet_holds: 'connection reset' } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await tickOnce({ client, now: NOW, timeZone: 'America/Los_Angeles', site: 'site', earn });
    warn.mockRestore();
    expect(earn).toHaveBeenCalledTimes(1);
  });
});

describe('starting the job', () => {
  const productionEnv = { BOOKING_QUEUE_ENV: 'production' };

  it('sleeps outside production unless asked for by name', () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const job = startWalletEarnJob({ env: {} });
      expect(vi.getTimerCount()).toBe(0);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('WALLET_JOB=true'));
      expect(() => job.stop()).not.toThrow();
      startWalletEarnJob({ env: { NODE_ENV: 'production' } });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      log.mockRestore();
      vi.useRealTimers();
    }
  });

  it('runs in production', () => {
    vi.useFakeTimers();
    try {
      const job = startWalletEarnJob({ env: productionEnv });
      expect(vi.getTimerCount()).toBe(2);
      job.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('runs outside production when WALLET_JOB is true, and stop clears both timers', () => {
    vi.useFakeTimers();
    try {
      const job = startWalletEarnJob({ env: { WALLET_JOB: 'true' } });
      expect(vi.getTimerCount()).toBe(2);
      job.stop();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
