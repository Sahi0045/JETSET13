import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

// See commitUnknownDeskResolution.test.js: the payment handlers take their
// Supabase client from arcpay.config.js.
vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  const chain = {};
  for (const m of ['select', 'update', 'insert', 'upsert', 'eq', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.maybeSingle = chain.single;
  return { ...actual, supabase: { from: vi.fn(() => chain) } };
});

vi.mock('../../backend/middleware/auth.middleware.js', async (importOriginal) => {
  const actual = await importOriginal();
  const userFrom = (req) => (req.headers['x-test-user'] ? JSON.parse(req.headers['x-test-user']) : null);
  return {
    ...actual,
    protect: (req, res, next) => {
      req.user = userFrom(req);
      return req.user ? next() : res.status(401).json({ message: 'Not authorized' });
    },
    optionalProtect: (req, res, next) => { req.user = userFrom(req); next(); },
  };
});

/**
 * "Mark as handled" writes the whole booking_details column, from the copy it
 * read, filtered only by the booking's id.
 *
 * Anything written between that read and this write was lost. For a commit
 * that never answered, two people on the desk can answer at once: one records
 * it held under the airline's record locator (recordHeldAtAirline, pinned to
 * the row it read), the other "not held". The "not held" write, from a copy
 * read before the locator was written, put booking_details back without it -
 * and left the status the held write set: pending_ticketing with no PNR, a
 * reservation nothing can ticket, find or cancel. The same for every other
 * flag: ticket sync recording the ticket a person issued by hand while the
 * desk marks it handled lost the ticket.
 *
 * Now the write is pinned to the row as read (unchangedSince), like
 * recordHeldAtAirline: a change in between makes it match nothing, nothing is
 * written, and the desk is told to reload.
 */

const REF = 'FLTUNK1';
const HELD = 'FLTHELD1';
const COMMIT_UNKNOWN = 'chain failed after commit at commit';
const UNTICKETED = 'PNR committed, never ticketed';
const tenMinutesAgo = () => new Date(Date.now() - 10 * 60_000).toISOString();

const desk = { 'x-test-user': JSON.stringify({ id: 'staff-1', email: 'desk@jetsetterss.com', role: 'support' }) };

/** A commit the airline never answered, as the order route leaves it, the chain's claim long lapsed. */
const commitUnknownRow = () => ({
  id: 1,
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 291,
  created_at: tenMinutesAgo(),
  booking_details: {
    customer_email: 'jane@example.com',
    arc_captured_amount: 291,
    gds_chain: { state: 'in_progress', startedAt: tenMinutesAgo(), claimedAt: tenMinutesAgo(), attempt: 1 },
    needs_review: { reason: COMMIT_UNKNOWN, ticketed: false, at: tenMinutesAgo() },
  },
});

/** A reservation held for staff after its ticketing failed. */
const heldForStaffRow = () => ({
  id: 2,
  booking_reference: HELD,
  travel_type: 'flight',
  status: 'pending_ticketing',
  payment_status: 'paid',
  total_amount: 291,
  created_at: tenMinutesAgo(),
  booking_details: {
    customer_email: 'jane@example.com',
    arc_captured_amount: 291,
    pnr: 'XYZ789',
    gds: { ticketed: false },
    gds_chain: { state: 'finished', finishedAt: tenMinutesAgo() },
    needs_review: { reason: 'chain failed after commit at issueTicket', ticketed: false, at: tenMinutesAgo() },
  },
});

let table = null;

/**
 * The app, with `landsAfterRead` applied to the row the moment the route has
 * read it - a write from somewhere else, between this route's read and its
 * write.
 */
const appWith = async (rows, landsAfterRead = null) => {
  vi.resetModules();
  table = fakeBookingsTable(rows);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  let pending = landsAfterRead;
  supabase.from.mockImplementation((name) => {
    const chain = table.from(name);
    const single = chain.single;
    chain.single = async () => {
      const answer = await single();
      if (pending && answer.data) {
        const change = pending;
        pending = null;
        change(table.row(answer.data.booking_reference));
      }
      return answer;
    };
    return chain;
  });
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  return app;
};

const resolve = (app, id, body) => request(app).post(`/api/flights/admin-bookings/${id}/resolve-review`).set(desk).send(body);

/** What recordHeldAtAirline writes when another member of the desk records it held. */
const recordedHeldMeanwhile = (row) => {
  const at = new Date().toISOString();
  Object.assign(row, {
    status: 'pending_ticketing',
    updated_at: at,
    booking_details: {
      ...row.booking_details,
      pnr: 'ABC123',
      amadeus_order_id: 'ABC123',
      gds: { ticketed: false },
      gds_chain: { ...row.booking_details.gds_chain, state: 'finished', finishedAt: at },
      needs_review: {
        reason: UNTICKETED,
        ticketed: false,
        at,
        previous: { ...row.booking_details.needs_review, resolved_at: at, resolved_by: 'other@jetsetterss.com', resolution: 'Held.', outcome: 'held', pnr: 'ABC123' },
      },
    },
  });
};

/** What ticket sync writes when it finds the ticket a person issued by hand. */
const ticketRecordedMeanwhile = (row) => {
  Object.assign(row, {
    status: 'confirmed',
    booking_details: {
      ...row.booking_details,
      gds: { ticketed: true },
      tickets: [{ number: '220-7491175310', travelerId: '1' }],
    },
  });
};

const snapshot = (row) => JSON.parse(JSON.stringify(row));

describe('"not held", while another member of the desk records it held', () => {
  it('is refused, and the record locator the other one wrote is kept', async () => {
    const app = await appWith([commitUnknownRow()], recordedHeldMeanwhile);

    const res = await resolve(app, 1, { note: 'Airline has no record of it.', outcome: 'not_held' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_CHANGED');
    expect(res.body.error).toMatch(/changed while you were recording it/);
    const row = table.row(REF);
    expect(row.status).toBe('pending_ticketing');
    expect(row.booking_details.pnr).toBe('ABC123');
    expect(row.booking_details.needs_review.reason).toBe(UNTICKETED);
    expect(row.booking_details.needs_review.previous.outcome).toBe('held');
  });
});

describe('any other flag, marked handled while something else writes the booking', () => {
  it('is refused, and the ticket ticket sync recorded is kept', async () => {
    const app = await appWith([heldForStaffRow()], ticketRecordedMeanwhile);

    const res = await resolve(app, 2, { note: 'Ticketed by hand, 220-7491175310.' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_CHANGED');
    const row = table.row(HELD);
    expect(row.booking_details.gds.ticketed).toBe(true);
    expect(row.booking_details.tickets).toEqual([{ number: '220-7491175310', travelerId: '1' }]);
    expect(row.booking_details.needs_review.resolved_at).toBeUndefined();
  });
});

// Fences: with nothing written in between, both resolve exactly as today.
describe('with nothing written in between', () => {
  it('"not held" is recorded as before', async () => {
    const app = await appWith([commitUnknownRow()]);
    const before = snapshot(table.row(REF));

    const res = await resolve(app, 1, { note: 'Airline has no record of it.', outcome: 'not_held' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, note: 'Airline has no record of it.', message: 'Marked as handled' });
    const row = table.row(REF);
    expect(row.status).toBe('pending');
    expect(row.booking_details.pnr).toBeUndefined();
    expect(row.booking_details.needs_review).toEqual({
      ...before.booking_details.needs_review,
      resolved_at: expect.any(String),
      resolved_by: 'desk@jetsetterss.com',
      resolution: 'Airline has no record of it.',
      outcome: 'not_held',
    });
  });

  it('another flag is marked handled with a note alone, and nothing else on the row changes', async () => {
    const app = await appWith([heldForStaffRow()]);
    const before = snapshot(table.row(HELD));

    const res = await resolve(app, 2, { note: 'Ticketed by hand, 220-7491175310.' });

    expect(res.status).toBe(200);
    const row = table.row(HELD);
    expect(row.status).toBe(before.status);
    expect(row.booking_details.pnr).toBe('XYZ789');
    expect(row.booking_details.needs_review).toEqual({
      ...before.booking_details.needs_review,
      resolved_at: expect.any(String),
      resolved_by: 'desk@jetsetterss.com',
      resolution: 'Ticketed by hand, 220-7491175310.',
    });
  });
});
