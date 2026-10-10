import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * A booked trip's airline fee table, for whoever may open the booking - the
 * owner, or a guest with the email it was made with - and nobody else.
 */

const table = {
  currency: 'USD',
  bookBy: null,
  change: { before: { allowed: true, amount: 336, varies: false } },
  refund: { before: { allowed: false, amount: 0, varies: false } },
};

const row = (overrides = {}) => ({
  id: 'b1',
  booking_reference: 'FLTFEES1',
  travel_type: 'flight',
  status: 'pending_ticketing',
  payment_status: 'paid',
  user_id: null,
  created_at: '2026-10-10T10:00:00Z',
  passenger_details: [{ firstName: 'Riya', lastName: 'Sharma', email: 'riya@example.com' }],
  booking_details: { pnr: '2OY43E', customer_email: 'riya@example.com' },
  ...overrides,
});

let getBookedFeeTable;

const makeApp = async (stored) => {
  vi.resetModules();
  getBookedFeeTable = vi.fn(async () => table);
  vi.doMock('../../backend/services/flightProvider.js', () => ({
    default: { getBookedFeeTable },
    providerStatus: () => ({ enabled: true, bookingEnabled: false }),
  }));
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(() => {
    const chain = {};
    for (const m of ['select', 'eq', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: stored, error: null });
    chain.single = chain.maybeSingle;
    return chain;
  });
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  return app;
};

const ask = (app, email = 'riya@example.com') => request(app)
  .get('/api/flights/bookings/FLTFEES1/fee-rules')
  .set('x-booking-email', email);

afterEach(() => {
  vi.doUnmock('../../backend/services/flightProvider.js');
});

describe("a booked trip's airline fee table", () => {
  it("is read from the booking's PNR for whoever may open the booking", async () => {
    const res = await ask(await makeApp(row()));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, penalties: table });
    expect(getBookedFeeTable).toHaveBeenCalledWith('2OY43E');
  });

  it("is refused to anyone else with the booking read's own answer, and Amadeus is not asked", async () => {
    const res = await ask(await makeApp(row()), 'someone.else@example.com');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Booking not found');
    expect(getBookedFeeTable).not.toHaveBeenCalled();
  });

  it('is not asked of Amadeus for a booking with no PNR', async () => {
    const res = await ask(await makeApp(row({ booking_details: { customer_email: 'riya@example.com' } })));
    expect(res.body).toEqual({ success: true, penalties: null });
    expect(getBookedFeeTable).not.toHaveBeenCalled();
  });

  it('is not asked of Amadeus for a cancelled booking', async () => {
    const res = await ask(await makeApp(row({ status: 'cancelled' })));
    expect(res.body).toEqual({ success: true, penalties: null });
    expect(getBookedFeeTable).not.toHaveBeenCalled();
  });

  it('is simply absent when Amadeus cannot answer', async () => {
    const app = await makeApp(row());
    getBookedFeeTable.mockRejectedValueOnce(Object.assign(new Error('timeout'), { technicalError: 'read ETIMEDOUT' }));
    const res = await ask(app);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, penalties: null });
  });
});
