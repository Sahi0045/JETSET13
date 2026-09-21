import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { attentionOf, reviewResolution } from '../../shared/reviewQueue.js';
import { isBookingStaff, isFullAdmin } from '../../shared/staffRoles.js';

/**
 * The support desk.
 *
 * The Slack alarms announce a booking once, stamp `alerted_at` and forget it.
 * Nothing listed those bookings, showed why they were flagged, or recorded that
 * a person had dealt with one - and the only back-office role was `admin`, so
 * the person hired to work them could not be given an account at all.
 */

const ROLE = { value: 'admin' };

vi.mock('../../backend/middleware/auth.middleware.js', async () => {
  const actual = await vi.importActual('../../backend/middleware/auth.middleware.js');
  return {
    ...actual,
    protect: (req, _res, next) => { req.user = { id: 'staff-1', email: 'desk@jetsetterss.com', role: ROLE.value }; next(); },
  };
});

const flagged = (over = {}) => ({
  id: 'b-flagged',
  booking_reference: 'FLTHELD9',
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 291,
  created_at: '2026-09-17T10:00:00Z',
  ...over,
  booking_details: {
    pnr: 'HELD42',
    gds: { ticketed: false },
    needs_review: { reason: 'chain failed after commit at issueTicket', at: '2026-09-17T10:01:00Z', alerted_at: '2026-09-17T10:15:00Z' },
    ...(over.booking_details || {}),
  },
});

const ticketed = {
  id: 'b-ok',
  booking_reference: 'FLTOK1',
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 291,
  created_at: '2026-09-17T09:00:00Z',
  booking_details: { pnr: 'OK1234', gds: { ticketed: true }, tickets: [{ number: '220-7491175300' }] },
};

const appWith = async (rows) => {
  const table = fakeBookingsTable(rows);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  return { app, table };
};

beforeEach(() => {
  ROLE.value = 'admin';
  vi.resetModules();
});

describe('what still needs a person', () => {
  it('is the alarm\'s own selection', () => {
    expect(attentionOf(flagged())).toMatchObject({ kind: 'review', reason: /issueTicket/ });
    // Paid, seats held, no ticket, never flagged: the alarm announces these too.
    expect(attentionOf({ status: 'confirmed', payment_status: 'paid', booking_details: { pnr: 'ABC123', gds: { ticketed: false } } }))
      .toMatchObject({ kind: 'not_ticketed' });
    // Settled one way or another.
    expect(attentionOf(ticketed)).toBeNull();
    expect(attentionOf(flagged({ status: 'cancelled' }))).toBeNull();
    expect(attentionOf(flagged({ payment_status: 'refunded' }))).toBeNull();
    expect(attentionOf(flagged({ booking_details: { needs_review: { reason: 'x', resolved_at: '2026-09-17T12:00:00Z' } } }))).toBeNull();
  });

  it('keeps a cancelled booking whose tickets have to be claimed back from the airline', () => {
    const claim = {
      status: 'cancelled',
      payment_status: 'paid',
      booking_details: {
        // What cancelFlightBooking writes: the tickets it could not void, on
        // the review flag itself (payment/operations.handlers.js).
        needs_review: {
          source: 'cancellation', reason: 'past the void window', at: '2026-09-17T10:00:00Z', tickets: ['220-7491175301'],
        },
        tickets: [{ number: '220-7491175301' }],
      },
    };
    expect(attentionOf(claim)).toMatchObject({ kind: 'airline_refund', tickets: ['220-7491175301'] });
  });

  it('reads back what the desk recorded', () => {
    const done = flagged({ booking_details: { needs_review: { reason: 'x', resolved_at: '2026-09-17T12:00:00Z', resolved_by: 'desk@jetsetterss.com', resolution: 'ticketed by hand' } } });
    expect(reviewResolution(done)).toEqual({ at: '2026-09-17T12:00:00Z', by: 'desk@jetsetterss.com', note: 'ticketed by hand' });
  });
});

describe('the roles', () => {
  it('lets support work bookings, and keeps the rest to admins', () => {
    expect(['admin', 'superadmin', 'support'].every(isBookingStaff)).toBe(true);
    expect(isBookingStaff('user')).toBe(false);
    expect(isBookingStaff('agent')).toBe(false);
    expect(isFullAdmin('support')).toBe(false);
    expect(isFullAdmin('admin')).toBe(true);
  });
});

describe('GET /admin-bookings-all', () => {
  it('sends the PNR, the tickets and why a booking is flagged', async () => {
    const { app } = await appWith([flagged(), ticketed]);

    const res = await request(app).get('/api/flights/admin-bookings-all');

    const row = res.body.data.find((b) => b.bookingReference === 'FLTHELD9');
    expect(row.pnr).toBe('HELD42');
    expect(row.ticketed).toBe(false);
    expect(row.attention).toMatchObject({ kind: 'review' });
    const fine = res.body.data.find((b) => b.bookingReference === 'FLTOK1');
    expect(fine.attention).toBeNull();
    expect(fine.ticketNumbers).toEqual(['220-7491175300']);
  });

  it('filters to the queue with attention=open, and to what was dealt with', async () => {
    const handled = flagged({ id: 'b-done', booking_reference: 'FLTDONE1', booking_details: { needs_review: { reason: 'x', resolved_at: '2026-09-17T12:00:00Z', resolution: 'ticketed by hand' } } });
    const { app } = await appWith([flagged(), ticketed, handled]);

    const open = await request(app).get('/api/flights/admin-bookings-all?attention=open');
    expect(open.body.data.map((b) => b.bookingReference)).toEqual(['FLTHELD9']);

    const done = await request(app).get('/api/flights/admin-bookings-all?attention=handled');
    expect(done.body.data.map((b) => b.bookingReference)).toEqual(['FLTDONE1']);
  });

  it('opens for support, and not for a customer', async () => {
    ROLE.value = 'support';
    const { app } = await appWith([flagged()]);
    expect((await request(app).get('/api/flights/admin-bookings-all')).status).toBe(200);

    ROLE.value = 'user';
    const { app: closed } = await appWith([flagged()]);
    expect((await request(closed).get('/api/flights/admin-bookings-all')).status).toBe(403);
  });
});

describe('reaching the customer', () => {
  it('sends the phone the traveller gave, and the address checkout charged', async () => {
    const withContact = flagged({
      id: 'b-contact',
      booking_reference: 'FLTCALL1',
      passenger_details: [{ firstName: 'Jane', lastName: 'Doe', email: '', mobile: '+1 415 555 0100' }],
      booking_details: { customer_email: 'paid@example.com' },
    });
    const { app } = await appWith([withContact]);

    const res = await request(app).get('/api/flights/admin-bookings-all');

    const row = res.body.data.find((b) => b.bookingReference === 'FLTCALL1');
    expect(row.customerPhone).toBe('+1 415 555 0100');
    // The traveller left the optional email box empty; checkout charged this one.
    expect(row.customerEmail).toBe('paid@example.com');
  });
});

describe('POST /admin-bookings/:id/resolve-review', () => {
  it('records who dealt with it and what they did, and clears it from the queue', async () => {
    ROLE.value = 'support';
    const { app, table } = await appWith([flagged()]);

    const res = await request(app)
      .post('/api/flights/admin-bookings/b-flagged/resolve-review')
      .send({ note: 'Ticket issued by hand in Amadeus, 220-7491175310.' });

    expect(res.status).toBe(200);
    const review = table.row('FLTHELD9').booking_details.needs_review;
    expect(review.resolution).toMatch(/issued by hand/);
    expect(review.resolved_by).toBe('desk@jetsetterss.com');
    expect(review.resolved_at).toBeTruthy();
    // The reason it was flagged is kept, not overwritten.
    expect(review.reason).toMatch(/issueTicket/);

    const open = await request(app).get('/api/flights/admin-bookings-all?attention=open');
    expect(open.body.data).toHaveLength(0);
  });

  it('records a paid-but-never-ticketed booking that was never flagged', async () => {
    const unflagged = flagged({ id: 'b-raw', booking_reference: 'FLTRAW1', booking_details: { pnr: 'RAW123', gds: { ticketed: false }, needs_review: undefined } });
    delete unflagged.booking_details.needs_review;
    const { app, table } = await appWith([unflagged]);

    const res = await request(app)
      .post('/api/flights/admin-bookings/b-raw/resolve-review')
      .send({ note: 'Refunded, the customer rebooked.' });

    expect(res.status).toBe(200);
    expect(table.row('FLTRAW1').booking_details.needs_review.resolution).toMatch(/rebooked/);
  });

  it('asks for a note, refuses a booking with nothing to handle, and refuses twice', async () => {
    const done = flagged({ id: 'b-done', booking_reference: 'FLTDONE2', booking_details: { needs_review: { reason: 'x', resolved_at: '2026-09-17T12:00:00Z' } } });
    const { app } = await appWith([flagged(), ticketed, done]);

    const noNote = await request(app).post('/api/flights/admin-bookings/b-flagged/resolve-review').send({ note: '  ' });
    expect(noNote.status).toBe(400);
    expect(noNote.body.code).toBe('NOTE_REQUIRED');

    const nothing = await request(app).post('/api/flights/admin-bookings/b-ok/resolve-review').send({ note: 'x' });
    expect(nothing.status).toBe(409);
    expect(nothing.body.code).toBe('NOTHING_TO_RESOLVE');

    const again = await request(app).post('/api/flights/admin-bookings/b-done/resolve-review').send({ note: 'x' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_RESOLVED');
  });

  it('is closed to a customer', async () => {
    ROLE.value = 'user';
    const { app } = await appWith([flagged()]);
    const res = await request(app).post('/api/flights/admin-bookings/b-flagged/resolve-review').send({ note: 'let me in' });
    expect(res.status).toBe(403);
  });
});
