import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What cancelling would return, shown before the customer confirms: worked out
 * by the same rule the cancel uses, for whoever may open the booking.
 */

// Noon in New York, so "an hour ago" is the same office day.
const NOW = Date.parse('2026-10-11T16:00:00.000Z');
const hoursAgo = (hours) => new Date(NOW - hours * 60 * 60 * 1000).toISOString();
const nonRefundable = { currency: 'USD', change: { before: { allowed: false } }, refund: { before: { allowed: false, amount: 0 } } };
const refundable = { currency: 'USD', change: { before: { allowed: true, amount: 0 } }, refund: { before: { allowed: true, amount: 150 } } };

const row = (overrides = {}, details = {}) => ({
  id: 'b1',
  booking_reference: 'FLTQUOTE1',
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  user_id: null,
  created_at: hoursAgo(1),
  passenger_details: [{ firstName: 'Riya', lastName: 'Sharma', email: 'riya@example.com' }],
  booking_details: {
    pnr: '2OY43E',
    customer_email: 'riya@example.com',
    verified_charge: { fare: 287.5, serviceFee: 12.5, discount: 0, total: 300 },
    ...details,
  },
  ...overrides,
});
const ticketed = { gds: { ticketed: true }, tickets: [{ number: '057-2412345678' }] };

let getBookedFeeTable;

const makeApp = async (stored, feeTable = nonRefundable, settings = { cancellation_fee: 50, flight_cancellation_fee: 40 }) => {
  vi.resetModules();
  getBookedFeeTable = vi.fn(async () => feeTable);
  vi.doMock('../../backend/services/flightProvider.js', () => ({
    default: { getBookedFeeTable },
    providerStatus: () => ({ enabled: true, bookingEnabled: false }),
  }));
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation((table) => {
    const chain = {};
    for (const m of ['select', 'eq', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
    const data = table === 'price_settings' ? { settings } : stored;
    chain.maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
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
  .get('/api/flights/bookings/FLTQUOTE1/cancel-quote')
  .set('x-booking-email', email);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock('../../backend/services/flightProvider.js');
});

describe('the cancel quote', () => {
  it('is refused to anyone who may not open the booking', async () => {
    const res = await ask(await makeApp(row()), 'someone.else@example.com');

    expect(res.status).toBe(404);
    expect(getBookedFeeTable).not.toHaveBeenCalled();
  });

  it('is nothing for a cancelled booking or one that is not a flight', async () => {
    expect((await ask(await makeApp(row({ status: 'cancelled' })))).body).toEqual({ success: true, quote: null });
    expect((await ask(await makeApp(row({ travel_type: 'hotel' })))).body).toEqual({ success: true, quote: null });
  });

  it('returns the airline price before the ticket is issued', async () => {
    const res = await ask(await makeApp(row({ created_at: hoursAgo(72) })));

    expect(res.status).toBe(200);
    expect(res.body.quote).toMatchObject({ policy: 'not_ticketed', automatic: true, refundAmount: 287.5, serviceFeeKept: 12.5 });
    expect(getBookedFeeTable).not.toHaveBeenCalled();
  });

  it('returns the airline price before the void deadline without asking Amadeus', async () => {
    const res = await ask(await makeApp(row({}, ticketed)));

    expect(res.body.quote).toMatchObject({ policy: 'free_window', refundAmount: 287.5 });
    expect(res.body.quote.freeUntil).toBeTruthy();
    expect(getBookedFeeTable).not.toHaveBeenCalled();
  });

  it('reads the fare rules for a ticket after the void deadline', async () => {
    const res = await ask(await makeApp(row({ created_at: hoursAgo(30) }, ticketed)));

    expect(res.body.quote).toMatchObject({ policy: 'non_refundable', automatic: false, refundAmount: null });
    expect(getBookedFeeTable).toHaveBeenCalledWith('2OY43E');
  });

  it('names the penalty and the flight cancellation fee on a refundable fare', async () => {
    const res = await ask(await makeApp(row({ created_at: hoursAgo(30) }, ticketed), refundable));

    expect(res.body.quote).toMatchObject({ policy: 'refundable', penalty: 150, penaltyCurrency: 'USD', cancellationFee: 40, airlinePrice: 287.5 });
  });

  it('names the saved percentage of what was paid as the cancellation fee', async () => {
    const settings = { cancellation_fee: 50, flight_cancellation_fee_percent: 10 };
    const res = await ask(await makeApp(row({ created_at: hoursAgo(30) }, ticketed), refundable, settings));

    expect(res.body.quote).toMatchObject({ policy: 'refundable', cancellationFee: 30, airlinePrice: 287.5 });
  });

  it('returns everything for a booking the airline never had', async () => {
    const res = await ask(await makeApp(row({}, { pnr: undefined })));

    expect(res.body.quote).toMatchObject({ policy: 'never_booked', refundAmount: 300 });
  });
});
