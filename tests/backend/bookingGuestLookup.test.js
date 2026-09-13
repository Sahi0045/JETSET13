import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A guest can open their own booking - and nobody else's.
 *
 * Both booking reads required an account, and a guest booking has no owner, so
 * the "Manage booking" link in every guest's confirmation email led to a page
 * they could never open. A guest now proves the booking is theirs with the
 * email it was made with, on top of the reference.
 *
 * The same response used to spread `booking_details` wholesale, which carried
 * the ARC success indicator (the proof of payer POST /order checks), the
 * gateway session, and the checkout payload with every traveller's passport.
 */

const row = {
  id: 'b1',
  booking_reference: 'FLTGUEST1',
  travel_type: 'flight',
  status: 'pending_ticketing',
  payment_status: 'paid',
  user_id: null,
  created_at: '2026-09-12T10:00:00Z',
  passenger_details: [{ firstName: 'Jane', lastName: 'Doe', email: 'Jane.Doe@Example.com' }],
  booking_details: {
    pnr: 'ABC123',
    customer_email: 'jane.doe@example.com',
    arrival_date: '2026-09-20',
    success_indicator: 'SECRET-SUCCESS-INDICATOR',
    session_id: 'SESSION-SECRET',
    arc_pay_checkout_url: 'https://api.arcpay.travel/checkout/pay/SESSION-SECRET',
    pending_booking_data: { passengerData: [{ passportNumber: 'X1234567' }] },
  },
};

const makeApp = async (stored = row) => {
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

beforeEach(() => {
  vi.resetModules();
});

describe('opening a guest booking', () => {
  it('is refused with no session and no email', async () => {
    const res = await request(await makeApp()).get('/api/flights/bookings/FLTGUEST1');
    expect(res.status).toBe(404);
  });

  it('is refused with the wrong email, with the same answer as an unknown reference', async () => {
    const res = await request(await makeApp())
      .get('/api/flights/bookings/FLTGUEST1')
      .set('x-booking-email', 'someone.else@example.com');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Booking not found');
  });

  it('opens with the email the booking was made with, in any letter case', async () => {
    const res = await request(await makeApp())
      .get('/api/flights/bookings/FLTGUEST1')
      .set('x-booking-email', '  JANE.DOE@example.com ');

    expect(res.status).toBe(200);
    expect(res.body.data.bookingReference).toBe('FLTGUEST1');
    // The camelCase shape Manage Booking reads, which this endpoint never had.
    expect(res.body.data.arrivalDate).toBe('2026-09-20');
    expect(res.body.data.payment_status).toBe('paid');
  });

  it('never returns the payment secrets or the checkout passports', async () => {
    const res = await request(await makeApp())
      .get('/api/flights/bookings/FLTGUEST1')
      .set('x-booking-email', 'jane.doe@example.com');

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('SECRET-SUCCESS-INDICATOR');
    expect(body).not.toContain('SESSION-SECRET');
    expect(body).not.toContain('X1234567');
  });
});
