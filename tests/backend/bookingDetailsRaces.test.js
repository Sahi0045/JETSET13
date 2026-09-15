import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * A whole-column write of booking_details never undoes what landed after it
 * read the row.
 *
 * PostgREST cannot change one key inside a jsonb column, so these writers read
 * the row, change their part and write the whole column back. The needs-review
 * alarm wrote back a copy read before its Slack post; the order route's final
 * save wrote back a copy read just before. A cancellation that landed in
 * between was erased, and a cancelled booking could come back to life.
 */

let table = null;

const useTable = async (rows, options) => {
  vi.resetModules();
  table = fakeBookingsTable(rows, options);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
};

/** What a cancellation writes when it finishes. */
const cancelIn = (row) => {
  Object.assign(row, { status: 'cancelled', payment_status: 'refunded' });
  row.booking_details.cancellation = { cancelledAt: '2026-09-15T08:10:00.000Z', paymentAction: 'VOID', refundAmount: 291 };
  row.booking_details.gds_chain = { state: 'cancelled', startedAt: '2026-09-15T08:09:00.000Z', cancelledAt: '2026-09-15T08:10:00.000Z' };
};

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWTEST');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' }));
});

describe("the needs-review alarm's stamp", () => {
  const stuck = () => ({
    booking_reference: 'FLTR1',
    status: 'pending_ticketing',
    payment_status: 'paid',
    total_amount: 291,
    created_at: new Date().toISOString(),
    booking_details: {
      pnr: 'ABC123',
      gds: { ticketed: false },
      gds_chain: { state: 'committed', committedAt: '2026-09-15T08:00:00.000Z' },
      needs_review: { reason: 'chain failed after commit at issueTicket', ticketed: false, at: '2026-09-15T08:00:00.000Z' },
    },
  });

  it('keeps a cancellation that landed after the alarm read the booking', async () => {
    let landed = false;
    await useTable([stuck()], {
      fail: ({ patch }) => {
        if (!landed && patch?.booking_details?.needs_review?.alerted_at) {
          landed = true;
          cancelIn(table.row('FLTR1'));
        }
        return false;
      },
    });
    const { runOnce } = await import('../../backend/jobs/needsReviewAlert.job.js');

    const result = await runOnce({ webhookUrl: 'https://hooks.slack.test/x' });

    expect(result.announced).toBe(1);
    const row = table.row('FLTR1');
    expect(row.status).toBe('cancelled');
    expect(row.booking_details.cancellation).toMatchObject({ paymentAction: 'VOID' });
    expect(row.booking_details.gds_chain.state).toBe('cancelled');
    // Still stamped, from the row as it is now.
    expect(row.booking_details.needs_review.alerted_at).toBeTruthy();
  });

  it('stamps a booking nothing else touched on the first try', async () => {
    await useTable([stuck()]);
    const { runOnce } = await import('../../backend/jobs/needsReviewAlert.job.js');

    await runOnce({ webhookUrl: 'https://hooks.slack.test/x' });

    const stamps = table.writes.filter((w) => w.patch.booking_details?.needs_review?.alerted_at);
    expect(stamps).toHaveLength(1);
    expect(stamps[0].matched).toBe(1);
  });
});

describe("the order route's final save", () => {
  const committed = () => ({
    id: 'bk-m1',
    booking_reference: 'FLTM1',
    travel_type: 'flight',
    status: 'pending',
    payment_status: 'paid',
    total_amount: 291,
    user_id: 'user-1',
    booking_details: {
      order_id: 'FLTM1',
      customer_email: 'jane@example.com',
      arc_captured_amount: 291,
      pnr: 'ABC123',
      gds: { ticketed: false },
      gds_chain: { state: 'committed', committedAt: '2026-09-15T08:00:00.000Z' },
    },
  });

  const bookingData = {
    bookingReference: 'FLTM1',
    pnr: 'ABC123',
    orderId: 'FLTM1',
    totalAmount: 291,
    currency: 'USD',
    gds: { ticketed: false, office: 'SCK1S2400' },
    tickets: [],
    ticketed: false,
  };

  it('does not bring back a booking cancelled after it read the row', async () => {
    let landed = false;
    await useTable([committed()], {
      fail: ({ patch }) => {
        if (!landed && patch?.status === 'pending_ticketing') {
          landed = true;
          cancelIn(table.row('FLTM1'));
        }
        return false;
      },
    });
    const { handleDuplicateBookingMerge, buildBookingRow } = await import('../../backend/routes/flight.routes.js');

    const saved = await handleDuplicateBookingMerge(bookingData, buildBookingRow(bookingData, null));

    expect(saved).toBeTruthy();
    const row = table.row('FLTM1');
    expect(row.status).toBe('cancelled');
    expect(row.payment_status).toBe('refunded');
    expect(row.booking_details.cancellation).toMatchObject({ paymentAction: 'VOID' });
    expect(row.booking_details.gds_chain.state).toBe('cancelled');
    // What the chain learned is still laid on top.
    expect(row.booking_details.gds).toMatchObject({ office: 'SCK1S2400' });
    expect(row.user_id).toBe('user-1');
  });

  it('saves on the first try when nothing moved', async () => {
    await useTable([committed()]);
    const { handleDuplicateBookingMerge, buildBookingRow } = await import('../../backend/routes/flight.routes.js');

    const saved = await handleDuplicateBookingMerge(bookingData, buildBookingRow(bookingData, null));

    expect(saved.status).toBe('pending_ticketing');
    expect(table.writes).toHaveLength(1);
    expect(table.row('FLTM1').booking_details).toMatchObject({ arc_captured_amount: 291, gds: { office: 'SCK1S2400' } });
  });

  it('gives up, rather than overwrite, when the booking keeps changing', async () => {
    let moves = 0;
    await useTable([committed()], {
      // Something else writes the row before every one of the merge's writes.
      fail: ({ patch }) => {
        if (patch?.status) {
          moves += 1;
          table.row('FLTM1').booking_details.needs_review = { reason: 'moved', at: `2026-09-15T08:0${moves}:00.000Z` };
        }
        return false;
      },
    });
    const { handleDuplicateBookingMerge, buildBookingRow } = await import('../../backend/routes/flight.routes.js');

    const saved = await handleDuplicateBookingMerge(bookingData, buildBookingRow(bookingData, null));

    expect(saved).toBeNull();
    expect(table.row('FLTM1').status).toBe('pending');
  });
});
