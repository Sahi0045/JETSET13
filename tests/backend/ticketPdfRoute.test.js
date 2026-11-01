import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const row = (overrides = {}) => ({
  id: 'b1',
  booking_reference: 'FLTGUEST1',
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  user_id: null,
  created_at: '2026-10-25T04:06:21Z',
  passenger_details: [{ id: '1', type: 'ADULT', firstName: 'Jane', lastName: 'Doe', email: 'jane.doe@example.com', passportNumber: 'X1234567' }],
  booking_details: {
    pnr: 'ABC123',
    customer_email: 'jane.doe@example.com',
    tickets: [{ number: '057-7513754072', travelerId: '1', issuedOn: '2026-10-24' }],
    itineraries: [{
      direction: 'outbound', origin: 'DEL', destination: 'BOM', departureDate: '2026-11-24', arrivalDate: '2026-11-24', stops: 0, duration: 'PT2H',
      segments: [{ flightNumber: 'AI101', carrierCode: 'AI', origin: 'DEL', destination: 'BOM', departureDate: '2026-11-24', departureTime: '08:00', arrivalDate: '2026-11-24', arrivalTime: '10:00' }],
    }],
    success_indicator: 'SECRET-SUCCESS-INDICATOR',
  },
  ...overrides,
});

const makeApp = async (stored) => {
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

const binary = (res, done) => {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};

beforeEach(() => {
  vi.resetModules();
});

describe('downloading the e-ticket PDF', () => {
  it('gives the owner a PDF file named for what it is', async () => {
    const res = await request(await makeApp(row()))
      .get('/api/flights/bookings/FLTGUEST1/ticket.pdf')
      .set('x-booking-email', 'jane.doe@example.com')
      .buffer(true).parse(binary);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="Jetsetters-ETicket-FLTGUEST1\.pdf"/);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('never prints a passport number or a payment secret', async () => {
    const res = await request(await makeApp(row()))
      .get('/api/flights/bookings/FLTGUEST1/ticket.pdf')
      .set('x-booking-email', 'jane.doe@example.com')
      .buffer(true).parse(binary);

    const text = res.body.toString('latin1');
    expect(text).not.toContain('X1234567');
    expect(text).not.toContain('SECRET-SUCCESS-INDICATOR');
  });

  it('is refused to anyone who cannot open the booking', async () => {
    const res = await request(await makeApp(row()))
      .get('/api/flights/bookings/FLTGUEST1/ticket.pdf')
      .set('x-booking-email', 'someone.else@example.com');

    expect(res.status).toBe(404);
  });

  it('says there is no document for a cancelled booking', async () => {
    const res = await request(await makeApp(row({ status: 'cancelled', payment_status: 'refunded' })))
      .get('/api/flights/bookings/FLTGUEST1/ticket.pdf')
      .set('x-booking-email', 'jane.doe@example.com');

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NO_DOCUMENT');
  });
});
