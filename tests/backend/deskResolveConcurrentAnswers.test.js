import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { shownQueryOf } from './helpers/deskShown.js';

/**
 * Two members of the desk answering the same "commit never answered" booking
 * at once. The desk writes were pinned to the row as read (unchangedSince),
 * but that pins status, payment and the money fields - not the flag's
 * resolution. So a "held" read before someone else's "not held" and written
 * after it still matched: it returned 200, erased the "not held" answer, note
 * and resolver, and emailed the customer their reservation. Both desk writes
 * now also pin the resolution as read (pinResolution): the second answer
 * matches nothing and is told the booking changed.
 */

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

const REF = 'FLTUNK1';
const COMMIT_UNKNOWN = 'chain failed after commit at commit';
const tenMinutesAgo = () => new Date(Date.now() - 10 * 60_000).toISOString();
const desk = { 'x-test-user': JSON.stringify({ id: 'staff-1', email: 'desk@jetsetterss.com', role: 'support' }) };

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

let table = null;
const send = vi.fn();

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ success: true });
});

const appWith = async (rows, landsAfterRead = null) => {
  vi.resetModules();
  const mailer = { sendBookingNotificationEmails: send, sendEmail: vi.fn(), sendCancellationNotificationEmails: vi.fn(), sendTicketIssuedEmail: vi.fn() };
  vi.doMock('../../backend/services/emailService.js', () => ({ ...mailer, default: mailer }));
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

/** What the default path writes when another desk member records "not held". */
const recordedNotHeldMeanwhile = (row) => {
  const at = new Date().toISOString();
  Object.assign(row, {
    updated_at: at,
    booking_details: {
      ...row.booking_details,
      needs_review: {
        ...row.booking_details.needs_review,
        resolved_at: at,
        resolved_by: 'other@jetsetterss.com',
        resolution: 'Airline has no record; refunding.',
        outcome: 'not_held',
      },
    },
  });
};

describe('"held" while another member of the desk records it NOT held', () => {
  it('is refused, and the "not held" answer stands, with no email sent', async () => {
    const app = await appWith([commitUnknownRow()], recordedNotHeldMeanwhile);

    const res = await request(app).post(`/api/flights/admin-bookings/1/resolve-review${shownQueryOf(table.row(REF))}`).set(desk)
      .send({ note: 'Airline holds it.', outcome: 'held', pnr: 'ABC123' });

    const row = table.row(REF);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_CHANGED');
    expect(res.body.error).toMatch(/changed while you were recording it/);
    expect(row.booking_details.pnr).toBeFalsy();
    expect(row.booking_details.needs_review.outcome).toBe('not_held');
    expect(row.booking_details.needs_review.resolved_at).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
  });
});
