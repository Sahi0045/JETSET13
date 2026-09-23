import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { shownQueryOf } from './helpers/deskShown.js';

/**
 * "Mark as handled" that does not say which entry the page showed is refused.
 *
 * resolve-review checks the press against what the booking needs now
 * (shownKind, shownSince), and took a press that sent neither "as before".
 * The only caller, the desk page, now always sends them - so the one press
 * that sends none is a /desk tab still on the bundle from before that check,
 * and it repeated the symptom the check fixed: its stale claim note was
 * written as the refused customer refund's resolution, and a "held" answer
 * recorded a record locator and emailed the customer over whatever the
 * booking had become. It is answered BOOKING_CHANGED, reload the page, and
 * nothing is written or sent.
 */

vi.mock('../../backend/middleware/auth.middleware.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    protect: (req, _res, next) => { req.user = { id: 'staff-1', email: 'desk@jetsetterss.com', role: 'support' }; next(); },
  };
});

const heldUnticketed = () => ({
  id: 'b-held',
  booking_reference: 'FLTHELD1',
  travel_type: 'flight',
  status: 'pending_ticketing',
  payment_status: 'paid',
  total_amount: 291,
  created_at: '2026-09-22T09:00:00Z',
  booking_details: {
    pnr: 'HELD42', gds: { ticketed: false },
    needs_review: { reason: 'chain failed after commit at issueTicket', ticketed: false, at: '2026-09-22T09:05:00Z' },
  },
});

const commitUnknown = () => ({
  id: 'b-unk',
  booking_reference: 'FLTUNK1',
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 291,
  created_at: '2026-09-22T09:00:00Z',
  booking_details: { needs_review: { reason: 'chain failed after commit at commit', at: '2026-09-22T09:05:00Z' } },
});

beforeEach(() => {
  vi.resetModules();
});

const deskOver = async (rows) => {
  const table = fakeBookingsTable(rows);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  const handle = (id, query, body) => request(app).post(`/api/flights/admin-bookings/${id}/resolve-review${query}`).send(body);
  return { table, handle };
};

describe('a press that does not say which entry the page showed', () => {
  it('is refused: reload the page, and nothing is written', async () => {
    const desk = await deskOver([heldUnticketed()]);
    const before = JSON.parse(JSON.stringify(desk.table.row('FLTHELD1')));
    const response = await desk.handle('b-held', '', { note: 'Issued the ticket by hand.' });
    expect(response.status, 'a desk tab from before the check wrote its note over whatever the booking needs now').toBe(409);
    expect(response.body.code).toBe('BOOKING_CHANGED');
    expect(response.body.error).toMatch(/reload the page/);
    expect(response.body.error).toMatch(/Nothing has been recorded/);
    expect(desk.table.row('FLTHELD1')).toEqual(before);
  });

  it('an empty shownKind is no answer either', async () => {
    const desk = await deskOver([heldUnticketed()]);
    const response = await desk.handle('b-held', '?shownKind=&shownSince=', { note: 'Issued the ticket by hand.' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('BOOKING_CHANGED');
    expect(desk.table.row('FLTHELD1').booking_details.needs_review.resolved_at).toBeUndefined();
  });

  it('a "held" answer records no record locator, so no reservation email is owed', async () => {
    const desk = await deskOver([commitUnknown()]);
    const before = JSON.parse(JSON.stringify(desk.table.row('FLTUNK1')));
    const response = await desk.handle('b-unk', '', { note: 'Airline holds it.', outcome: 'held', pnr: 'ABC123' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('BOOKING_CHANGED');
    expect(desk.table.row('FLTUNK1')).toEqual(before);
  });
});

describe('beside it', () => {
  it('a press that says what the page showed is recorded, as before', async () => {
    const desk = await deskOver([heldUnticketed()]);
    const response = await desk.handle('b-held', shownQueryOf(heldUnticketed()), { note: 'Issued the ticket by hand.' });
    expect(response.status).toBe(200);
    expect(desk.table.row('FLTHELD1').booking_details.needs_review).toMatchObject({ resolution: 'Issued the ticket by hand.' });
  });

  it('a missing note is still asked for first', async () => {
    const desk = await deskOver([heldUnticketed()]);
    const response = await desk.handle('b-held', '', { note: '  ' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('NOTE_REQUIRED');
  });

  it('a booking handled already keeps its own answer', async () => {
    const done = { ...heldUnticketed(), id: 'b-done', booking_reference: 'FLTDONE1' };
    done.booking_details = { ...done.booking_details, gds: { ticketed: true }, tickets: [{ number: '220-7491175300' }], needs_review: { reason: 'x', at: '2026-09-22T09:05:00Z', resolved_at: '2026-09-22T12:00:00Z' } };
    const desk = await deskOver([done]);
    const again = await desk.handle('b-done', '', { note: 'x' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_RESOLVED');
  });
});
