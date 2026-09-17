import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * Modify Status only gives a booking a status that still describes it.
 *
 * PUT /api/flights/admin-bookings/:id wrote whatever it was sent. `cancelled`
 * on a paid flight with a PNR released no seats and refunded nothing, hid
 * Cancel & Refund and Void, made the orchestrated cancel refuse the booking as
 * "already cancelled", and silenced both alarms. `confirmed` on a reservation
 * with no ticket told the customer it was ticketed.
 */

vi.mock('../../backend/middleware/auth.middleware.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    protect: (req, _res, next) => { req.user = { id: 'admin-1', role: 'admin' }; next(); },
    admin: (_req, _res, next) => next(),
  };
});

const REF = 'FLTS1';

const flight = (details = {}, over = {}) => ({
  id: 'bk-1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending_ticketing',
  payment_status: 'paid',
  total_amount: 291,
  ...over,
  booking_details: { order_id: REF, ...details },
});

let table = null;

const put = async (rows, body, options) => {
  table = fakeBookingsTable(rows, options);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  return request(app).put('/api/flights/admin-bookings/bk-1').send(body);
};

const statusWrites = () => table.writes.filter((w) => w.patch.status !== undefined);

beforeEach(() => {
  vi.resetModules();
});

describe('marking a booking cancelled by hand', () => {
  it('is refused for a paid flight with a PNR, and changes nothing', async () => {
    const res = await put([flight({ pnr: 'ABC123', gds: { ticketed: false } })], { status: 'cancelled' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USE_CANCEL_AND_REFUND');
    expect(res.body.error).toMatch(/Cancel & Refund/);
    expect(table.row(REF).status).toBe('pending_ticketing');
    expect(table.writes).toEqual([]);
  });

  it('is refused for a flight that holds a payment but never reached the airline', async () => {
    const res = await put([flight({}, { status: 'pending', payment_status: 'paid' })], { status: 'cancelled' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USE_CANCEL_AND_REFUND');
    expect(statusWrites()).toEqual([]);
  });

  // The row says unpaid until the gateway is asked. A customer whose tab died on
  // the way back from paying looks exactly like this, and a hand-set cancel hid
  // their payment from every job and alarm.
  it('is refused for a checkout that opened a payment page, which may have been paid', async () => {
    const res = await put([flight({ arc_pay_checkout_url: 'https://arc.test/pay/SESSION1', session_id: 'SESSION1' }, { status: 'pending', payment_status: 'unpaid' })], { status: 'cancelled' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USE_CANCEL_AND_REFUND');
    expect(statusWrites()).toEqual([]);
  });

  it('is allowed for a checkout that was never paid and never booked', async () => {
    const res = await put([flight({}, { status: 'pending', payment_status: 'unpaid' })], { status: 'cancelled' });

    expect(res.status).toBe(200);
    expect(table.row(REF).status).toBe('cancelled');
  });

  it('waits while the booking is being made', async () => {
    const running = flight({ gds_chain: { state: 'in_progress', startedAt: new Date().toISOString(), attempt: 1 } }, { status: 'pending', payment_status: 'unpaid' });

    const res = await put([running], { status: 'cancelled' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_BUSY');
    expect(statusWrites()).toEqual([]);
  });
});

describe('marking a flight confirmed by hand', () => {
  it('is refused for a reservation with no ticket', async () => {
    const res = await put([flight({ pnr: 'ABC123', gds: { ticketed: false } })], { status: 'confirmed' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_TICKETED');
    expect(table.row(REF).status).toBe('pending_ticketing');
  });

  it('is allowed once a ticket exists', async () => {
    const res = await put([flight({ pnr: 'ABC123', tickets: [{ number: '057-1234567890' }] })], { status: 'confirmed' });

    expect(res.status).toBe(200);
    expect(table.row(REF).status).toBe('confirmed');
  });
});

describe('other changes', () => {
  it('never reopens a cancelled booking', async () => {
    const res = await put([flight({}, { status: 'cancelled', payment_status: 'refunded' })], { status: 'pending' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_CANCELLED');
    expect(table.row(REF).status).toBe('cancelled');
  });

  it('never writes a payment status typed by hand', async () => {
    const res = await put([flight({}, { status: 'pending' })], { payment_status: 'refunded' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PAYMENT_STATUS_READ_ONLY');
    expect(table.row(REF).payment_status).toBe('paid');
    expect(table.writes).toEqual([]);
  });

  it('refuses a status that is not one', async () => {
    const res = await put([flight({}, { status: 'pending', payment_status: 'unpaid' })], { status: 'paid' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_STATUS');
  });

  it('does not overwrite a status that changed while the admin was deciding', async () => {
    const res = await put([flight({}, { status: 'pending', payment_status: 'unpaid' })], { status: 'cancelled' }, {
      // A booking chain commits between the read and the write.
      fail: ({ patch }) => {
        if (patch?.status === 'cancelled') table.row(REF).status = 'pending_ticketing';
        return false;
      },
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_CHANGED');
    expect(table.row(REF).status).toBe('pending_ticketing');
  });

  it('still lets a hotel be confirmed or completed by hand', async () => {
    const res = await put([flight({}, { travel_type: 'hotel', status: 'pending' })], { status: 'completed' });

    expect(res.status).toBe(200);
    expect(table.row(REF).status).toBe('completed');
  });

  it('answers 404 for a booking that does not exist', async () => {
    const res = await put([], { status: 'confirmed' });
    expect(res.status).toBe(404);
  });
});
