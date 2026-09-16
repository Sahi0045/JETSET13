import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The retention job deletes. Only production may.
 *
 * `archiveOldRecords` never archived: every rule is a hard `.delete()` across
 * seven tables, `bookings` among them, and `ARCHIVE_STATUSES` sat unused while
 * the log line said "Archived". It was started under a bare
 * `NODE_ENV !== 'test'` in backend/server.js - which is what `npm run dev`
 * launches - and local development shares one database with production. Every
 * developer's laptop was running that delete every 24 hours.
 *
 * The two jobs beside it, bookingQueue and abandonedCheckout, were both given
 * `queueEnvironment()` for this exact reason. The one that deletes was not.
 *
 * Two of the rules were also dead: `payments` has `payment_status` and no
 * `status`, and `chat_sessions` has neither, so those filters errored on every
 * run and the retention they describe was never applied.
 */

const calls = [];

const makeQuery = () => {
  const q = {
    _table: null,
    delete: vi.fn(() => q),
    lt: vi.fn(() => q),
    in: vi.fn((column, values) => { calls.push({ table: q._table, op: 'in', column, values }); return q; }),
    eq: vi.fn(() => q),
    lte: vi.fn(() => q),
    update: vi.fn(() => q),
    insert: vi.fn(() => q),
    select: vi.fn(() => q),
    // A user is already due for deletion, so processScheduledDeletions has
    // something to erase. Without this it passed on the ungated code too -
    // there was simply nobody to delete - which proves nothing.
    then: (resolve) => resolve({
      data: q._table === 'users' ? [{ id: 'user-due-1', email: 'due@example.com' }] : [],
      error: null,
    }),
  };
  return q;
};

vi.mock('../../backend/config/supabase.js', () => ({
  default: {
    from: vi.fn((table) => {
      const q = makeQuery();
      q._table = table;
      q.delete = vi.fn(() => { calls.push({ table, op: 'delete' }); return q; });
      return q;
    }),
  },
}));

const load = async () => {
  vi.resetModules();
  return import('../../backend/jobs/dataRetention.job.js');
};

const deletedTables = () => calls.filter((c) => c.op === 'delete').map((c) => c.table);

beforeEach(() => {
  calls.length = 0;
});

describe('archiveOldRecords', () => {
  // The bug, exactly: this ran wherever the dev server ran.
  it('deletes nothing when the process is not production', async () => {
    const { archiveOldRecords } = await load();

    const results = await archiveOldRecords({ env: {} });

    expect(deletedTables(), 'a laptop must not delete from the shared database').toEqual([]);
    expect(results).toEqual({});
  });

  it('deletes nothing when NODE_ENV alone claims production', async () => {
    const { archiveOldRecords } = await load();

    // `npm start` sets NODE_ENV=production on any machine; only
    // BOOKING_QUEUE_ENV names the real stack.
    await archiveOldRecords({ env: { NODE_ENV: 'production' } });

    expect(deletedTables()).toEqual([]);
  });

  it('deletes on the production stack', async () => {
    const { archiveOldRecords } = await load();

    await archiveOldRecords({ env: { BOOKING_QUEUE_ENV: 'production' } });

    expect(deletedTables()).toContain('bookings');
    expect(deletedTables()).toContain('inquiries');
  });

  // Both filters named a column their table does not have, so the rule errored
  // every run and its retention was never applied.
  it('filters each table on a column that table actually has', async () => {
    const { archiveOldRecords } = await load();

    await archiveOldRecords({ env: { BOOKING_QUEUE_ENV: 'production' } });

    const filters = calls.filter((c) => c.op === 'in');
    const on = (table) => filters.find((f) => f.table === table)?.column ?? null;

    expect(on('payments'), 'payments has payment_status, not status').not.toBe('status');
    expect(on('chat_sessions'), 'chat_sessions has no status column at all').toBeNull();
    expect(on('bookings')).toBe('status');
    expect(on('inquiries')).toBe('status');
  });
});

describe('processScheduledDeletions', () => {
  it('erases nobody outside production', async () => {
    const { processScheduledDeletions } = await load();

    await processScheduledDeletions({ env: {} });

    expect(deletedTables()).toEqual([]);
  });
});

describe('retentionMayDelete', () => {
  it('is true only for the stack that names itself production', async () => {
    const { retentionMayDelete } = await load();

    expect(retentionMayDelete({ BOOKING_QUEUE_ENV: 'production' })).toBe(true);
    expect(retentionMayDelete({ BOOKING_QUEUE_ENV: 'development' })).toBe(false);
    expect(retentionMayDelete({ NODE_ENV: 'production' })).toBe(false);
    expect(retentionMayDelete({})).toBe(false);
  });
});
