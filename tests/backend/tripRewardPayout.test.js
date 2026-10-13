import { describe, expect, it, vi } from 'vitest';
import { payTripRewardsOnce, sendTripRewardEmail, tickOnce, tripRewardVerdict } from '../../backend/jobs/walletEarn.job.js';

const HOUR = 3600 * 1000;
const NOW = Date.parse('2026-11-20T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();

const reward = (over = {}) => ({ booking_reference: 'FLT1', user_id: 'u1', coins: 5000, status: 'pending', due_at: iso(NOW - HOUR), ...over });
const flown = (over = {}) => ({
  booking_reference: 'FLT1',
  user_id: 'u1',
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  booking_details: { gds: { ticketed: true }, customer_email: 'booker@example.com', origin: 'JFK', destination: 'LHR' },
  ...over,
});
const paid = (over = {}) => ({ status: 'paid', applied: true, coins: 5000, user_id: 'u1', code: 'SHUBHAM', ...over });

/**
 * The slice of the query builder the jobs use, over arrays. `errors` fails a
 * whole table ('bookings') or one of its filters ('bookings.in').
 */
function fakeClient({ voucher_redemptions = [], bookings = [], users = [], wallet_entries = [], wallet_holds = [], errors = {} } = {}) {
  const tables = { voucher_redemptions, bookings, users, wallet_entries, wallet_holds };
  return {
    from(table) {
      const filters = [];
      const orders = [];
      let window = null;
      let max = Infinity;
      let failure = errors[table] || null;
      const run = () => {
        if (failure) return { data: null, error: { message: failure } };
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
        in: (column, values) => {
          if (errors[`${table}.in`]) failure = errors[`${table}.in`];
          filters.push((row) => values.includes(row[column]));
          return query;
        },
        gte: (column, value) => { filters.push((row) => row[column] != null && row[column] >= value); return query; },
        lte: (column, value) => { filters.push((row) => row[column] != null && row[column] <= value); return query; },
        not: (column, operator, value) => {
          if (operator === 'is' && value === null) filters.push((row) => row[column] != null);
          return query;
        },
        order: (column, { ascending = true } = {}) => { orders.push({ column, ascending }); return query; },
        range: (from, to) => { window = [from, to]; return query; },
        limit: (count) => { max = count; return query; },
        maybeSingle: async () => { const result = run(); return { data: result.data?.[0] ?? null, error: result.error }; },
        then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
      };
      return query;
    },
  };
}

const deps = (extra = {}) => ({
  pay: vi.fn(async () => paid()),
  voidReward: vi.fn(async () => ({ ok: true, status: 'void' })),
  notify: vi.fn(async () => true),
  ...extra,
});
const runWith = (client, extra = {}) => {
  const used = deps(extra);
  return { used, result: payTripRewardsOnce({ client, now: NOW, ...used }) };
};

describe('what a due trip reward is worth on a fresh read of its booking', () => {
  it('pays a ticketed flight', () => {
    expect(tripRewardVerdict(flown(), NOW)).toBe('pay');
    expect(tripRewardVerdict(flown({ status: 'pending_ticketing' }), NOW)).toBe('pay');
  });

  it('pays a trip an admin marked completed, still only when paid and ticketed', () => {
    expect(tripRewardVerdict(flown({ status: 'completed' }), NOW)).toBe('pay');
    expect(tripRewardVerdict(flown({ status: 'completed', payment_status: 'partially_refunded' }), NOW)).toBe('pay');
    expect(tripRewardVerdict(flown({ status: 'completed', payment_status: 'unpaid' }), NOW)).toBe('wait');
    expect(tripRewardVerdict(flown({ status: 'completed', booking_details: { gds: { ticketed: false } } }), NOW)).toBe('wait');
  });

  it('voids once the booking is cancelled or the payment went back in full, whatever the case', () => {
    expect(tripRewardVerdict(flown({ status: 'cancelled' }), NOW)).toBe('void');
    expect(tripRewardVerdict(flown({ payment_status: 'refunded' }), NOW)).toBe('void');
    expect(tripRewardVerdict(flown({ payment_status: 'Reversed' }), NOW)).toBe('void');
  });

  it('still pays after a partial refund, whatever the case', () => {
    expect(tripRewardVerdict(flown({ payment_status: 'partially_refunded' }), NOW)).toBe('pay');
    expect(tripRewardVerdict(flown({ payment_status: 'Paid' }), NOW)).toBe('pay');
    expect(tripRewardVerdict(flown({ payment_status: 'PARTIALLY_REFUNDED' }), NOW)).toBe('pay');
  });

  it('waits while the money has not landed in full: a ticketed flight that is unpaid or only partly paid', () => {
    for (const payment_status of ['unpaid', 'partial', 'pending', 'failed', null, undefined]) {
      expect(tripRewardVerdict(flown({ payment_status }), NOW)).toBe('wait');
    }
  });

  it('waits for a booking that cannot be read, is not a flight, is not ticketed, or is being cancelled', () => {
    expect(tripRewardVerdict(null, NOW)).toBe('wait');
    expect(tripRewardVerdict(flown({ travel_type: 'hotel' }), NOW)).toBe('wait');
    expect(tripRewardVerdict(flown({ booking_details: { gds: { ticketed: false } } }), NOW)).toBe('wait');
    expect(tripRewardVerdict(flown({ status: 'pending' }), NOW)).toBe('wait');
    expect(tripRewardVerdict(flown({
      booking_details: { gds: { ticketed: true }, gds_chain: { state: 'cancelling', startedAt: iso(NOW - 1000) } },
    }), NOW)).toBe('wait');
  });
});

describe('paying trip rewards', () => {
  it('pays a due reward once its booking is ticketed, and tells the customer', async () => {
    const client = fakeClient({ voucher_redemptions: [reward()], bookings: [flown()] });
    const { used, result } = runWith(client);

    expect(await result).toEqual({ paid: 1, voided: 0, waiting: 0, failed: 0 });
    expect(used.pay).toHaveBeenCalledWith(client, 'FLT1');
    expect(used.notify).toHaveBeenCalledWith(expect.objectContaining({ reward: paid(), booking: expect.objectContaining({ booking_reference: 'FLT1' }) }));
  });

  it('pays a due reward on a booking an admin marked completed', async () => {
    const client = fakeClient({ voucher_redemptions: [reward()], bookings: [flown({ status: 'completed' })] });
    const { used, result } = runWith(client);

    expect(await result).toEqual({ paid: 1, voided: 0, waiting: 0, failed: 0 });
    expect(used.pay).toHaveBeenCalledWith(client, 'FLT1');
  });

  it('waits for a reward not yet due, and never pays one with no payout date', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = fakeClient({
      voucher_redemptions: [reward({ due_at: iso(NOW + HOUR) }), reward({ booking_reference: 'FLT2', due_at: null })],
      bookings: [flown(), flown({ booking_reference: 'FLT2' })],
    });
    const { used, result } = runWith(client);

    expect(await result).toEqual({ paid: 0, voided: 0, waiting: 0, failed: 0 });
    expect(used.pay).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('voids a reward whose booking was cancelled since it was reserved, and sends no email', async () => {
    const client = fakeClient({ voucher_redemptions: [reward()], bookings: [flown({ status: 'cancelled' })] });
    const { used, result } = runWith(client);

    const done = await result;
    expect(done.voided).toBe(1);
    expect(used.voidReward).toHaveBeenCalledTimes(1);
    expect(used.voidReward).toHaveBeenCalledWith(client, 'FLT1');
    expect(used.pay).not.toHaveBeenCalled();
    expect(used.notify).not.toHaveBeenCalled();
  });

  it('voids a reward whose payment went back in full', async () => {
    const client = fakeClient({ voucher_redemptions: [reward()], bookings: [flown({ payment_status: 'refunded' })] });
    const { used, result } = runWith(client);

    expect((await result).voided).toBe(1);
    expect(used.pay).not.toHaveBeenCalled();
  });

  it('does not pay a ticketed flight whose payment has not landed, and does not void it', async () => {
    const client = fakeClient({
      voucher_redemptions: [reward(), reward({ booking_reference: 'FLT2' })],
      bookings: [flown({ payment_status: 'unpaid' }), flown({ booking_reference: 'FLT2', payment_status: 'partial' })],
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { used, result } = runWith(client);

    expect(await result).toEqual({ paid: 0, voided: 0, waiting: 2, failed: 0 });
    expect(used.pay).not.toHaveBeenCalled();
    expect(used.voidReward).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('waits while the booking is not ticketed, is being cancelled, or cannot be read', async () => {
    const silence = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = fakeClient({
      voucher_redemptions: [reward(), reward({ booking_reference: 'FLT2' }), reward({ booking_reference: 'FLT3' })],
      bookings: [
        flown({ booking_details: { gds: { ticketed: false } } }),
        flown({ booking_reference: 'FLT2', booking_details: { gds: { ticketed: true }, gds_chain: { state: 'cancelling', startedAt: iso(NOW - 1000) } } }),
      ],
    });
    const { used, result } = runWith(client);

    expect(await result).toEqual({ paid: 0, voided: 0, waiting: 3, failed: 0 });
    expect(used.pay).not.toHaveBeenCalled();
    expect(used.voidReward).not.toHaveBeenCalled();
    silence.mockRestore();
  });

  it('leaves a payout that failed for the next run, and sends no email', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = fakeClient({ voucher_redemptions: [reward()], bookings: [flown()] });
    const { used, result } = runWith(client, { pay: vi.fn().mockRejectedValue(Object.assign(new Error('down'), { code: 'WALLET_UNAVAILABLE' })) });

    expect((await result).failed).toBe(1);
    expect(used.notify).not.toHaveBeenCalled();
    silence.mockRestore();
  });

  it('sends no second email for a reward another run already paid', async () => {
    const client = fakeClient({ voucher_redemptions: [reward()], bookings: [flown()] });
    const { used, result } = runWith(client, { pay: vi.fn(async () => paid({ applied: false })) });

    expect((await result).paid).toBe(0);
    expect(used.notify).not.toHaveBeenCalled();
  });

  it('pays at most the run limit', async () => {
    const refs = ['FLT1', 'FLT2', 'FLT3'];
    const client = fakeClient({
      voucher_redemptions: refs.map((ref) => reward({ booking_reference: ref })),
      bookings: refs.map((ref) => flown({ booking_reference: ref })),
    });
    const pay = vi.fn(async () => paid());

    await payTripRewardsOnce({ client, now: NOW, pay, voidReward: vi.fn(), notify: vi.fn(async () => true), limit: 2 });

    expect(pay).toHaveBeenCalledTimes(2);
  });

  it('pays the oldest due rewards first, across pages', async () => {
    const refs = ['FLT1', 'FLT2', 'FLT3'];
    const client = fakeClient({
      voucher_redemptions: [
        reward({ booking_reference: 'FLT1', due_at: iso(NOW - HOUR) }),
        reward({ booking_reference: 'FLT2', due_at: iso(NOW - 3 * HOUR) }),
        reward({ booking_reference: 'FLT3', due_at: iso(NOW - 2 * HOUR) }),
      ],
      bookings: refs.map((ref) => flown({ booking_reference: ref })),
    });
    const pay = vi.fn(async () => paid());

    await payTripRewardsOnce({ client, now: NOW, pay, voidReward: vi.fn(), notify: vi.fn(async () => true), limit: 2, pageSize: 2 });

    expect(pay.mock.calls.map(([, ref]) => ref)).toEqual(['FLT2', 'FLT3']);
  });

  it('keeps paying the others when one email notification throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = fakeClient({
      voucher_redemptions: [reward(), reward({ booking_reference: 'FLT2' })],
      bookings: [flown(), flown({ booking_reference: 'FLT2' })],
    });
    const notify = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(true);
    const { used, result } = runWith(client, { notify });

    expect((await result).paid).toBe(2);
    expect(used.pay).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});

describe('clearing rewards whose booking is gone, however far off the trip', () => {
  it('voids a reward not yet due when its booking was cancelled, and pays nothing', async () => {
    const client = fakeClient({
      voucher_redemptions: [reward({ due_at: iso(NOW + 30 * 24 * HOUR) })],
      bookings: [flown({ status: 'cancelled' })],
    });
    const { used, result } = runWith(client);

    expect(await result).toEqual({ paid: 0, voided: 1, waiting: 0, failed: 0 });
    expect(used.voidReward).toHaveBeenCalledWith(client, 'FLT1');
    expect(used.pay).not.toHaveBeenCalled();
    expect(used.notify).not.toHaveBeenCalled();
  });

  it('voids a reward with no payout date when its payment was refunded or reversed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = fakeClient({
      voucher_redemptions: [
        reward({ due_at: null }),
        reward({ booking_reference: 'FLT2', due_at: null }),
        reward({ booking_reference: 'FLT3', due_at: null }),
      ],
      bookings: [
        flown({ payment_status: 'refunded' }),
        flown({ booking_reference: 'FLT2', payment_status: 'reversed' }),
        flown({ booking_reference: 'FLT3' }),
      ],
    });
    const { used, result } = runWith(client);

    expect((await result).voided).toBe(2);
    expect(used.voidReward.mock.calls.map(([, ref]) => ref).sort()).toEqual(['FLT1', 'FLT2']);
    expect(used.pay).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('leaves a far-off reward on a live booking, and one on a partly refunded booking, alone', async () => {
    const client = fakeClient({
      voucher_redemptions: [reward({ due_at: iso(NOW + 30 * 24 * HOUR) }), reward({ booking_reference: 'FLT2', due_at: iso(NOW + HOUR) })],
      bookings: [flown(), flown({ booking_reference: 'FLT2', payment_status: 'partially_refunded' })],
    });
    const { used, result } = runWith(client);

    expect(await result).toEqual({ paid: 0, voided: 0, waiting: 0, failed: 0 });
    expect(used.voidReward).not.toHaveBeenCalled();
  });

  it('does not void a reward twice when the payout already did', async () => {
    const client = fakeClient({ voucher_redemptions: [reward()], bookings: [flown({ status: 'cancelled' })] });
    const { used, result } = runWith(client);

    expect((await result).voided).toBe(1);
    expect(used.voidReward).toHaveBeenCalledTimes(1);
  });

  it('does not touch a pending reward whose booking row it cannot find', async () => {
    const client = fakeClient({ voucher_redemptions: [reward({ due_at: iso(NOW + HOUR) })], bookings: [] });
    const { used, result } = runWith(client);

    expect(await result).toEqual({ paid: 0, voided: 0, waiting: 0, failed: 0 });
    expect(used.voidReward).not.toHaveBeenCalled();
  });

  it('voids at most the clean-up limit in a run', async () => {
    const refs = ['FLT1', 'FLT2', 'FLT3'];
    const client = fakeClient({
      voucher_redemptions: refs.map((ref) => reward({ booking_reference: ref, due_at: iso(NOW + HOUR) })),
      bookings: refs.map((ref) => flown({ booking_reference: ref, status: 'cancelled' })),
    });
    const voidReward = vi.fn(async () => ({ ok: true, status: 'void' }));

    const result = await payTripRewardsOnce({ client, now: NOW, pay: vi.fn(), voidReward, notify: vi.fn(), voidLimit: 2 });

    expect(voidReward).toHaveBeenCalledTimes(2);
    expect(result.voided).toBe(2);
  });

  it('reads the bookings in chunks, not one by one', async () => {
    const refs = Array.from({ length: 120 }, (_, index) => `FLT${index}`);
    const client = fakeClient({
      voucher_redemptions: refs.map((ref) => reward({ booking_reference: ref, due_at: iso(NOW + HOUR) })),
      bookings: refs.map((ref) => flown({ booking_reference: ref })),
    });
    const from = vi.spyOn(client, 'from');

    await payTripRewardsOnce({ client, now: NOW, pay: vi.fn(), voidReward: vi.fn(), notify: vi.fn() });

    expect(from.mock.calls.filter(([table]) => table === 'bookings')).toHaveLength(3);
  });

  it('counts a clean-up void that failed, and still pays what is due', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = fakeClient({
      voucher_redemptions: [reward({ booking_reference: 'GONE', due_at: iso(NOW + HOUR) }), reward({ booking_reference: 'FLT2' })],
      bookings: [flown({ booking_reference: 'GONE', status: 'cancelled' }), flown({ booking_reference: 'FLT2' })],
    });
    const { used, result } = runWith(client, { voidReward: vi.fn(async () => ({ ok: false, status: 'error' })) });

    expect(await result).toEqual({ paid: 1, voided: 0, waiting: 0, failed: 1 });
    expect(used.pay).toHaveBeenCalledWith(client, 'FLT2');
    error.mockRestore();
  });

  it('still pays what is due when the clean-up cannot read the bookings', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = fakeClient({
      voucher_redemptions: [reward({ booking_reference: 'GONE', due_at: iso(NOW + HOUR) }), reward({ booking_reference: 'FLT2' })],
      bookings: [flown({ booking_reference: 'GONE', status: 'cancelled' }), flown({ booking_reference: 'FLT2' })],
      errors: { 'bookings.in': 'connection reset' },
    });
    const { used, result } = runWith(client);

    expect(await result).toEqual({ paid: 1, voided: 0, waiting: 0, failed: 0 });
    expect(used.voidReward).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('reports the rewards with no payout date once, as a count, and leaves them pending', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = fakeClient({
      voucher_redemptions: [
        reward({ due_at: null }),
        reward({ booking_reference: 'FLT2', due_at: null }),
        reward({ booking_reference: 'FLT3', due_at: null }),
      ],
      bookings: [flown(), flown({ booking_reference: 'FLT2' }), flown({ booking_reference: 'FLT3', status: 'cancelled' })],
    });
    const { used, result } = runWith(client);

    expect(await result).toEqual({ paid: 0, voided: 1, waiting: 0, failed: 0 });
    const reports = warn.mock.calls.filter(([message]) => /no payout date/.test(message));
    expect(reports).toHaveLength(1);
    expect(reports[0][1]).toEqual({ count: 2 });
    expect(JSON.stringify(reports[0])).not.toMatch(/FLT|u1|SHUBHAM/);
    expect(used.pay).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('says nothing about payout dates when every pending reward has one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = fakeClient({ voucher_redemptions: [reward({ due_at: iso(NOW + HOUR) })], bookings: [flown()] });
    await runWith(client).result;

    expect(warn.mock.calls.filter(([message]) => /no payout date/.test(message))).toHaveLength(0);
    warn.mockRestore();
  });
});

describe('the "Your Jet Coins have arrived" email', () => {
  it('goes to the account address once the coins have landed', async () => {
    const client = fakeClient({ users: [{ id: 'u1', email: 'jane@example.com', first_name: 'Jane' }] });
    const send = vi.fn(async () => ({ id: 'e1' }));

    const sent = await sendTripRewardEmail({ client, reward: paid(), booking: flown(), send });

    expect(sent).toBe(true);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'jane@example.com', subject: 'Your Jet Coins have arrived' }));
    const { html } = send.mock.calls[0][0];
    expect(html).toContain('5,000 Jet Coins');
    expect(html).toContain('SHUBHAM');
    expect(html).toContain('FLT1 · JFK → LHR');
  });

  it("goes to the booking's contact when the account has no address", async () => {
    const send = vi.fn(async () => ({ id: 'e1' }));
    await sendTripRewardEmail({ client: fakeClient(), reward: paid(), booking: flown(), send });
    expect(send.mock.calls[0][0].to).toBe('booker@example.com');
  });

  it("goes to the booking's contact when the account's address cannot be delivered to", async () => {
    const client = fakeClient({ users: [{ id: 'u1', email: 'jane@gmailcom' }] });
    const send = vi.fn(async () => ({ id: 'e1' }));
    await sendTripRewardEmail({ client, reward: paid(), booking: flown(), send });
    expect(send.mock.calls[0][0].to).toBe('booker@example.com');
  });

  it('sends nothing, and does not throw, when nobody can be emailed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const send = vi.fn();
    const sent = await sendTripRewardEmail({ client: fakeClient(), reward: paid(), booking: flown({ booking_details: {} }), send });

    expect(sent).toBe(false);
    expect(send).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('counts the payout even when the email fails, and never sends it again', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    const send = vi.fn().mockRejectedValue(new Error('email refused by Resend'));
    const client = fakeClient({ voucher_redemptions: [reward()], bookings: [flown()], users: [{ id: 'u1', email: 'jane@example.com' }] });

    const result = await payTripRewardsOnce({
      client, now: NOW, pay: vi.fn(async () => paid()), voidReward: vi.fn(), notify: (args) => sendTripRewardEmail({ ...args, send }),
    });

    expect(result.paid).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    silence.mockRestore();
  });
});

describe('the periodic run', () => {
  const tickArgs = (client, extra = {}) => ({ client, now: NOW, timeZone: 'America/Los_Angeles', site: 'site', earn: vi.fn(), ...extra });

  it('pays due trip rewards on the same tick as earning and the hold sweep', async () => {
    const client = fakeClient({ voucher_redemptions: [reward()], bookings: [flown()] });
    const pay = vi.fn(async () => paid());

    const tick = await tickOnce(tickArgs(client, { pay, notify: vi.fn(async () => true) }));

    expect(tick.rewards).toMatchObject({ paid: 1 });
    expect(pay).toHaveBeenCalledWith(client, 'FLT1');
    expect(tick).toHaveProperty('earn');
    expect(tick).toHaveProperty('sweep');
  });

  it('earns and sweeps even when the reward pass blows up', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const base = fakeClient({
      bookings: [flown({ created_at: iso(NOW - 30 * HOUR), booking_details: { verified_charge: { total: 130.38, walletCoins: 0 }, gds: { ticketed: true } } })],
      wallet_holds: [{ booking_reference: 'GONE1', user_id: 'u1', coins: 500, status: 'held', created_at: iso(NOW - 4 * HOUR) }],
    });
    const client = {
      from: (table) => {
        if (table === 'voucher_redemptions') throw new Error('connection reset');
        return base.from(table);
      },
    };
    const earn = vi.fn(async () => ({ applied: true }));
    const release = vi.fn(async () => ({ status: 'released', coins: 500 }));

    const tick = await tickOnce(tickArgs(client, { earn, release }));

    expect(earn).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith(client, 'GONE1');
    expect(tick.earn).not.toBeNull();
    expect(tick.sweep).not.toBeNull();
    warn.mockRestore();
    error.mockRestore();
  });

  it('pays rewards even when earning and the hold sweep both fail', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = fakeClient({
      voucher_redemptions: [reward()],
      bookings: [flown({ created_at: iso(NOW - 30 * HOUR) })],
      errors: { wallet_entries: 'connection reset', wallet_holds: 'connection reset' },
    });
    const pay = vi.fn(async () => paid());

    const tick = await tickOnce(tickArgs(client, { pay, notify: vi.fn(async () => true) }));

    expect(pay).toHaveBeenCalledWith(client, 'FLT1');
    expect(tick.rewards).toMatchObject({ paid: 1 });
    warn.mockRestore();
    error.mockRestore();
  });
});
