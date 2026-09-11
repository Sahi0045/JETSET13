import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../backend/middleware/errorHandler.js';
import { SlotTimeoutError } from '../../../backend/services/amadeusSoap/semaphore.js';

/**
 * A burst of traffic must not cost a paying customer their booking.
 *
 * The customer pays at hosted checkout before POST /order runs. When every
 * Amadeus slot stayed busy past the booking wait, the route used to treat that
 * like any failure and refund. Nothing had been sold, so the booking is now
 * queued on its row and a worker runs it once a slot is free.
 */

const bookableOffer = {
  type: 'flight-offer',
  id: '1',
  source: 'GDS',
  itineraries: [{ duration: 'PT7H45M', segments: [{ id: '1', departure: { iataCode: 'JFK', at: '2026-11-15T19:25:00' }, arrival: { iataCode: 'LHR', at: '2026-11-16T06:10:00' }, carrierCode: 'FI', number: '614' }] }],
  price: { currency: 'USD', total: '291.00', base: '110.00' },
  travelerPricings: [{ travelerId: '1', price: { currency: 'USD', total: '291.00' } }],
  _ama: { wsap: '1ASIWTEST', searchedAt: new Date().toISOString(), segments: [] },
};

const orderBody = {
  flightOffer: bookableOffer,
  travelers: [{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', gender: 'FEMALE' }],
  contactInfo: { email: 'jane@example.com', countryCode: '1', phoneNumber: '5551234567' },
  totalAmount: '298.28',
  orderId: 'FLTQ1',
  bookingReference: 'FLTQ1',
};

/** A booking row the way hosted checkout leaves it, plus whatever the test needs. */
const checkoutRow = (details = {}) => ({
  booking_reference: 'FLTQ1',
  status: 'pending',
  total_amount: 298.28,
  booking_details: details,
});

/** Supabase double: every read returns `row`, every write is recorded and succeeds. */
const useRow = async (row) => {
  const supabase = (await import('../../../backend/config/supabase.js')).default;
  const updates = [];
  supabase.from.mockImplementation(() => {
    const chain = {};
    for (const m of ['select', 'insert', 'delete', 'upsert', 'eq', 'is', 'or', 'neq', 'not', 'order', 'limit']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.update = vi.fn((payload) => { updates.push(payload); return chain; });
    chain.single = vi.fn().mockResolvedValue({ data: row, error: null });
    chain.maybeSingle = chain.single;
    // Awaiting a write (or the claim's compare-and-set) resolves to success.
    chain.then = (resolve) => resolve({ data: [{ booking_reference: 'FLTQ1' }], error: null });
    return chain;
  });
  return updates;
};

// Pricing before the chain is optional: an ordinary pricing failure is
// tolerated and the booking proceeds on the searched offer.
const mockProvider = (createFlightOrder, priceFlightOffer = vi.fn().mockRejectedValue(new Error('pricing unavailable'))) => {
  vi.doMock('../../../backend/services/flightProvider.js', () => ({
    default: {
      priceFlightOffer,
      createFlightOrder,
    },
    providerStatus: () => ({ bookingEnabled: true, wsap: '1ASIWTEST' }),
  }));
};

const makeApp = async () => {
  const routes = (await import('../../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  return app;
};

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWTEST');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
  vi.resetModules();
  vi.doUnmock('../../../backend/services/flightProvider.js');
});

describe('POST /order when no Amadeus slot comes free', () => {
  it('queues the booking and answers 202 instead of refunding', async () => {
    mockProvider(vi.fn().mockRejectedValue(new SlotTimeoutError(true)));
    const updates = await useRow(checkoutRow());
    const app = await makeApp();

    const res = await request(app).post('/api/flights/order').send(orderBody);

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ success: true, queued: true, bookingReference: 'FLTQ1' });
    expect(res.body.data.status).toBe('PENDING_CONFIRMATION');
    expect(res.body.refundAction).toBeUndefined();
    expect(res.body.bookingFailed).toBeUndefined();

    const queued = updates.at(-1).booking_details;
    expect(queued.gds_chain).toMatchObject({ state: 'queued', queueAttempts: 1 });
    expect(queued.queued_order.bookingReference).toBe('FLTQ1');
    expect(queued.queued_env).toBe(process.env.NODE_ENV);
  });

  // Pricing already waited the full booking wait. Waiting again for the chain
  // would outlive the Vercel proxy, so it queues without trying.
  it('queues straight away when pricing could not get a slot', async () => {
    const createFlightOrder = vi.fn();
    mockProvider(createFlightOrder, vi.fn().mockRejectedValue(new SlotTimeoutError(true)));
    await useRow(checkoutRow());
    const app = await makeApp();

    const res = await request(app).post('/api/flights/order').send(orderBody);

    expect(res.status).toBe(202);
    expect(res.body.queued).toBe(true);
    expect(createFlightOrder).not.toHaveBeenCalled();
  });

  // Queued forever is its own failure. After the cap it is refunded like any
  // other booking that could not be completed.
  it('refunds once the booking has been queued too many times', async () => {
    mockProvider(vi.fn().mockRejectedValue(new SlotTimeoutError(true)));
    await useRow(checkoutRow({ gds_chain: { state: 'in_progress', startedAt: '2020-01-01T00:00:00Z', queueAttempts: 10 } }));
    const app = await makeApp();

    const res = await request(app).post('/api/flights/order').send(orderBody);

    expect(res.status).toBe(502);
    expect(res.body.bookingFailed).toBe(true);
    expect(res.body.queued).toBeUndefined();
  });

  // A direct POST with no checkout row has nothing to queue against.
  it('does not queue a booking that has no checkout row', async () => {
    mockProvider(vi.fn().mockRejectedValue(new SlotTimeoutError(true)));
    await useRow(null);
    const app = await makeApp();

    const res = await request(app).post('/api/flights/order').send(orderBody);

    expect(res.body.queued).toBeUndefined();
    expect(res.body.bookingFailed).toBe(true);
  });

  // Only a slot timeout is safe to retry: anything else may have sold seats.
  it('still refunds an ordinary uncommitted failure', async () => {
    const soldOut = Object.assign(new Error('no seats'), { step: 'sell', committed: false, code: 409 });
    mockProvider(vi.fn().mockRejectedValue(soldOut));
    await useRow(checkoutRow());
    const app = await makeApp();

    const res = await request(app).post('/api/flights/order').send(orderBody);

    expect(res.body.queued).toBeUndefined();
    expect(res.body.bookingFailed).toBe(true);
  });

  it('carries the queue count across the next claim', async () => {
    mockProvider(vi.fn().mockRejectedValue(new SlotTimeoutError(true)));
    const updates = await useRow(checkoutRow({
      gds_chain: { state: 'queued', startedAt: '2026-09-11T10:00:00Z', queueAttempts: 3 },
    }));
    const app = await makeApp();

    await request(app).post('/api/flights/order').send(orderBody);

    const claim = updates.find((u) => u.booking_details?.gds_chain?.state === 'in_progress');
    expect(claim.booking_details.gds_chain.queueAttempts).toBe(3);
  });

  it('runs the booking in the booking lane', async () => {
    const { withBookingPriority } = await import('../../../backend/services/amadeusSoap/semaphore.js');
    expect(typeof withBookingPriority).toBe('function');
    const source = (await import('node:fs')).readFileSync(
      new URL('../../../backend/routes/flight.routes.js', import.meta.url), 'utf8',
    );
    expect(source).toMatch(/withBookingPriority\(\(\) => FlightProvider\.createFlightOrder\(/);
  });
});

describe('the queue worker', () => {
  const queuedRow = (overrides = {}) => ({
    booking_reference: 'FLTQ1',
    status: 'pending',
    booking_details: {
      queued_order: orderBody,
      gds_chain: { state: 'queued', startedAt: new Date().toISOString(), queueAttempts: 1 },
      ...overrides,
    },
  });

  const fakeFetch = (status, body) => vi.fn().mockResolvedValue({ status, json: async () => body });

  it('replays the stored order through the route and clears it when confirmed', async () => {
    const updates = await useRow(queuedRow());
    const { replay } = await import('../../../backend/jobs/bookingQueue.job.js');
    const fetchImpl = fakeFetch(200, { success: true, pnr: 'ABC123' });

    const outcome = await replay(queuedRow(), { baseUrl: 'http://127.0.0.1:5004', fetchImpl });

    expect(outcome).toBe('confirmed');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:5004/api/flights/order');
    expect(JSON.parse(init.body).bookingReference).toBe('FLTQ1');
    // The stored order carries passenger details; it does not outlive its use.
    expect(updates.at(-1).booking_details.queued_order).toBeUndefined();
  });

  it('leaves a booking queued when the route re-queued it', async () => {
    const updates = await useRow(queuedRow());
    const { replay } = await import('../../../backend/jobs/bookingQueue.job.js');

    const outcome = await replay(queuedRow(), { baseUrl: 'http://x', fetchImpl: fakeFetch(202, { success: true, queued: true }) });

    expect(outcome).toBe('requeued');
    expect(updates).toHaveLength(0);
  });

  // The customer left with a "pending" screen, so a later failure has to reach
  // them some other way.
  it('emails the customer when the booking finally fails', async () => {
    await useRow(queuedRow());
    const { sendEmail } = await import('../../../backend/services/emailService.js');
    sendEmail.mockClear();
    const { replay } = await import('../../../backend/jobs/bookingQueue.job.js');

    const outcome = await replay(queuedRow(), {
      baseUrl: 'http://x',
      fetchImpl: fakeFetch(502, { success: false, bookingFailed: true, error: 'Your payment has been reversed.' }),
    });

    expect(outcome).toBe('failed');
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'jane@example.com' }));
  });

  it('retries on the next tick when the replay never completes', async () => {
    const updates = await useRow(queuedRow());
    const { replay } = await import('../../../backend/jobs/bookingQueue.job.js');

    const outcome = await replay(queuedRow(), { baseUrl: 'http://x', fetchImpl: vi.fn().mockRejectedValue(new Error('ECONNRESET')) });

    expect(outcome).toBe('retry');
    expect(updates).toHaveLength(0);
  });

  it('picks up queued rows and stale claims, not live ones', async () => {
    const now = Date.now();
    const env = 'production';
    const rows = [
      { booking_reference: 'Q', status: 'pending', booking_details: { queued_env: env, queued_order: {}, gds_chain: { state: 'queued' } } },
      { booking_reference: 'LIVE', status: 'pending', booking_details: { queued_env: env, queued_order: {}, gds_chain: { state: 'in_progress', startedAt: new Date(now - 5_000).toISOString() } } },
      { booking_reference: 'STALE', status: 'pending', booking_details: { queued_env: env, queued_order: {}, gds_chain: { state: 'in_progress', startedAt: new Date(now - 600_000).toISOString() } } },
      { booking_reference: 'DONE', status: 'confirmed', booking_details: { queued_env: env, queued_order: {}, pnr: 'ABC123' } },
      // Queued by a laptop against the shared database: production must not book it.
      { booking_reference: 'LOCAL', status: 'pending', booking_details: { queued_env: 'development', queued_order: {}, gds_chain: { state: 'queued' } } },
    ];
    const supabase = (await import('../../../backend/config/supabase.js')).default;
    supabase.from.mockImplementation(() => {
      const chain = {};
      for (const m of ['select', 'not', 'order', 'eq']) chain[m] = vi.fn(() => chain);
      chain.limit = vi.fn().mockResolvedValue({ data: rows, error: null });
      return chain;
    });
    const { findRunnable } = await import('../../../backend/jobs/bookingQueue.job.js');

    const picked = (await findRunnable({ now, env })).map((r) => r.booking_reference);

    expect(picked).toEqual(['Q', 'STALE', 'DONE']);
  });
});
