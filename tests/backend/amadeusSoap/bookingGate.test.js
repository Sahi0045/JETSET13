import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../backend/middleware/errorHandler.js';

/**
 * POST /api/flights/order must never fabricate a booking.
 *
 * Payment runs before this route - ARC Pay hosted checkout takes the money and
 * the browser returns here - so anything that invents a PNR hands a customer a
 * worthless confirmation for a real charge. The route used to do exactly that
 * for any offer that was not Amadeus-shaped, which is the shape the mobile app
 * sends, and again as an "emergency fallback" outside production.
 */

const makeApp = async () => {
  const routes = (await import('../../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  return app;
};

const uiShapedOffer = {
  id: '1',
  airline: 'Icelandair',
  airlineCode: 'FI',
  price: { total: '291.00', currency: 'USD' },
  departure: { airport: 'JFK' },
  arrival: { airport: 'LHR' },
};

const orderBody = {
  flightOffer: uiShapedOffer,
  travelers: [{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', gender: 'FEMALE' }],
  contactInfo: { email: 'jane@example.com', countryCode: '1', phoneNumber: '5551234567' },
  totalAmount: '291.00',
  orderId: 'FLTTEST1',
  bookingReference: 'FLTTEST1',
};

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWTEST');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.resetModules();
});

describe('booking gate', () => {
  // The flag was config-only until this test existed: it was set to false in
  // production and no route read it.
  it('refuses with 503 when AMADEUS_WS_BOOKING_ENABLED is false', async () => {
    vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'false');
    vi.resetModules();
    const app = await makeApp();

    const res = await request(app).post('/api/flights/order').send(orderBody);

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('BOOKING_DISABLED');
    // Refused before any supplier call.
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('gives the customer a way to complete the booking', async () => {
    vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'false');
    vi.resetModules();
    const app = await makeApp();

    const res = await request(app).post('/api/flights/order').send(orderBody);
    expect(res.body.error).toMatch(/538-7380/);
  });

  // The gate does NOT run before the money moves: ARC Pay's hosted checkout
  // completes first and the browser returns here. Refusing without reversing
  // leaves the customer charged, with no booking and no refund - which is the
  // outcome the flag exists to prevent. Seen live during a UI walkthrough.
  it('reverses the payment instead of keeping it', async () => {
    vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'false');
    vi.resetModules();
    const app = await makeApp();

    const res = await request(app).post('/api/flights/order').send(orderBody);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('BOOKING_DISABLED');
    // The refund path ran, whatever the gateway said about it.
    expect(res.body).toHaveProperty('refundAction');
    expect(res.body.bookingFailed).toBe(true);
  });

  it('still tells the customer how to complete the booking', async () => {
    vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'false');
    vi.resetModules();
    const app = await makeApp();

    const res = await request(app).post('/api/flights/order').send(orderBody);
    expect(res.body.error).toMatch(/538-7380/);
  });

  it('never returns a PNR or a mock mode while disabled', async () => {
    vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'false');
    vi.resetModules();
    const app = await makeApp();

    const res = await request(app).post('/api/flights/order').send(orderBody);
    const body = JSON.stringify(res.body);

    expect(body).not.toMatch(/mock/i);
    expect(body).not.toMatch(/"pnr"/i);
    expect(res.body.bookingReference).toBeUndefined();
  });
});

describe('no fabricated bookings', () => {
  // Mobile posts the flattened card as flightOffer. That used to fail the
  // Amadeus-shape check and drop into a branch that invented a PNR, saved it
  // and emailed a confirmation - for a customer who had already paid.
  it('does not invent a PNR for a UI-shaped offer', async () => {
    vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
    vi.resetModules();
    const app = await makeApp();

    const res = await request(app).post('/api/flights/order').send(orderBody);
    const body = JSON.stringify(res.body);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(body).not.toMatch(/MOCK_DEMO_BOOKING|EMERGENCY_FALLBACK|MOCK_TESTING_PNR/);
    expect(res.body.success).not.toBe(true);
  });

  it('has no mock generators left in the route module', async () => {
    const source = (await import('node:fs')).readFileSync(
      new URL('../../../backend/routes/flight.routes.js', import.meta.url), 'utf8',
    );

    for (const banned of [
      'generateMockPNR',
      'buildMockFlightOffers',
      'ENABLE_MOCK_FLIGHTS',
      'MOCK_DEMO_BOOKING',
      'EMERGENCY_FALLBACK',
    ]) {
      expect(source, `${banned} must not survive in the flight route`).not.toContain(banned);
    }
  });
});

describe('accepting the offer the mobile app actually sends', () => {
  // Mobile posts the flattened UI card and keeps the bookable offer on
  // `originalOffer`. Reading only the top level made every mobile booking fail
  // the shape check - which is how they ended up in the fabricated-PNR branch.
  it('recovers the bookable offer from originalOffer', async () => {
    vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
    vi.resetModules();
    const app = await makeApp();

    const res = await request(app).post('/api/flights/order').send({
      ...orderBody,
      flightOffer: {
        ...uiShapedOffer,
        originalOffer: {
          id: '1',
          source: 'GDS',
          price: { total: '291.00', currency: 'USD' },
          itineraries: [{ segments: [{ id: '1' }] }],
          travelerPricings: [{ travelerId: '1', travelerType: 'ADULT' }],
          // No _ama, so the chain still refuses - but for the right reason,
          // and only after the offer was recognised as bookable at all.
        },
      },
    });

    expect(res.body.code).not.toBe('OFFER_NOT_BOOKABLE');
  });

  it('refuses a card with no bookable offer anywhere on it', async () => {
    vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
    vi.resetModules();
    const app = await makeApp();

    const res = await request(app).post('/api/flights/order').send(orderBody);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OFFER_NOT_BOOKABLE');
    // Refused before anything reaches the GDS.
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe('no simulated bookings on retrieval', () => {
  // GET /order/:id used to answer any failure with a hard-coded DEL-JAI
  // booking for $29.60 and a randomly generated PNR: someone looking up their
  // own reservation was shown an itinerary that does not exist.
  it('fails honestly instead of inventing an itinerary', async () => {
    axios.post.mockRejectedValue(new Error('amadeus down'));
    const app = await makeApp();

    const res = await request(app).get('/api/flights/order/ABC123');
    const body = JSON.stringify(res.body);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
    expect(body).not.toMatch(/29\.60|JAI|simulated/i);
  });

  it('has no simulated order left in the route module', async () => {
    const source = (await import('node:fs')).readFileSync(
      new URL('../../../backend/routes/flight.routes.js', import.meta.url), 'utf8',
    );
    expect(source).not.toContain('simulatedOrderDetails');
  });
});

/**
 * Every rejection on POST /order happens after the money has moved.
 *
 * The booking-disabled gate was fixed once and its two siblings were left
 * behind: a request with no offers, and an offer that fails the shape check,
 * both answered 400 and kept the charge. Same route, same position after
 * checkout, same outcome for the customer.
 */
describe('post-payment rejections reverse the charge', () => {
  beforeEach(() => {
    vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
    vi.resetModules();
  });

  it('refunds when the offer cannot be sold', async () => {
    const app = await makeApp();

    const res = await request(app).post('/api/flights/order').send(orderBody);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OFFER_NOT_BOOKABLE');
    expect(res.body.bookingFailed).toBe(true);
    expect(res.body).toHaveProperty('refundAction');
  });

  it('tells the customer the charge was reversed, not just that it failed', async () => {
    const app = await makeApp();

    const res = await request(app).post('/api/flights/order').send(orderBody);
    expect(res.body.error).toMatch(/reversed/i);
  });

  it('refunds when the request carries no offers at all', async () => {
    const app = await makeApp();

    const { flightOffer, ...withoutOffer } = orderBody;
    const res = await request(app).post('/api/flights/order').send(withoutOffer);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OFFER_MISSING');
    expect(res.body).toHaveProperty('refundAction');
  });

  // The stored reason is what a human has to work from when a customer calls
  // about a refunded booking. `providerError.message` is the deliberately vague
  // customer wording, and storing it leaves no operation, code or step.
  it('keeps the technical detail out of the customer message but in the record', async () => {
    const app = await makeApp();

    const res = await request(app).post('/api/flights/order').send(orderBody);

    expect(res.body.technicalError).toMatch(/itineraries=|source=|travelerPricings=/);
    expect(res.body.error).not.toMatch(/itineraries=/);
  });
});

/**
 * Two POSTs for one payment.
 *
 * The existing-PNR check cannot catch a race: between two concurrent requests
 * neither has a PNR yet, so both pass it and both run the chain, selling two
 * sets of seats against a single charge. A double-clicked confirm button or a
 * client retry mid-chain is enough.
 *
 * The claim itself is a compare-and-set in the database - verified against a
 * real Postgres, where two simultaneous callers produce exactly one winner.
 * What is asserted here is the route's half: that a live claim is refused, and
 * refused WITHOUT reversing the payment, because the request holding it may be
 * about to succeed.
 */
// Shaped well enough to get PAST the offer gate, so the claim is what the test
// actually exercises. The UI-shaped offer above is rejected earlier.
const bookableOffer = {
  type: 'flight-offer',
  id: '1',
  source: 'GDS',
  itineraries: [{
    duration: 'PT7H45M',
    segments: [{
      id: '1',
      departure: { iataCode: 'JFK', at: '2026-11-15T19:25:00' },
      arrival: { iataCode: 'LHR', at: '2026-11-16T06:10:00' },
      carrierCode: 'FI', number: '614', aircraft: { code: '7M9' }, numberOfStops: 0,
    }],
  }],
  price: { currency: 'USD', total: '291.00', base: '110.00' },
  travelerPricings: [{
    travelerId: '1', fareOption: 'STANDARD', travelerType: 'ADULT',
    price: { currency: 'USD', total: '291.00', base: '110.00' },
    fareDetailsBySegment: [{ segmentId: '1', cabin: 'ECONOMY', fareBasis: 'XJ1QUSLT', class: 'X' }],
  }],
  _ama: { wsap: '1ASIWTEST', searchedAt: new Date().toISOString(), segments: [] },
};

describe('concurrent booking attempts', () => {
  const inProgressRow = (startedAt) => ({
    booking_reference: 'FLTTEST1',
    status: 'pending',
    booking_details: { gds_chain: { state: 'in_progress', startedAt, attempt: 1 } },
  });

  beforeEach(() => {
    vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
    vi.resetModules();
  });

  it('refuses a second attempt while the first is still running', async () => {
    const supabase = (await import('../../../backend/config/supabase.js')).default;
    supabase.from.mockImplementation(() => {
      const chain = {};
      for (const m of ['select', 'update', 'insert', 'delete', 'upsert', 'eq', 'is', 'or', 'neq', 'order', 'limit']) {
        chain[m] = vi.fn(() => chain);
      }
      chain.single = vi.fn().mockResolvedValue({ data: inProgressRow(new Date().toISOString()), error: null });
      chain.maybeSingle = chain.single;
      return chain;
    });

    const app = await makeApp();
    const res = await request(app).post('/api/flights/order').send({ ...orderBody, flightOffer: bookableOffer });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_IN_PROGRESS');
    // Nothing was sold.
    expect(axios.post).not.toHaveBeenCalled();
  });

  // Reversing here would cancel the payment behind a booking that the other
  // request is seconds from confirming.
  it('does not reverse the payment of the request that holds the claim', async () => {
    const supabase = (await import('../../../backend/config/supabase.js')).default;
    supabase.from.mockImplementation(() => {
      const chain = {};
      for (const m of ['select', 'update', 'insert', 'delete', 'upsert', 'eq', 'is', 'or', 'neq', 'order', 'limit']) {
        chain[m] = vi.fn(() => chain);
      }
      chain.single = vi.fn().mockResolvedValue({ data: inProgressRow(new Date().toISOString()), error: null });
      chain.maybeSingle = chain.single;
      return chain;
    });

    const app = await makeApp();
    const res = await request(app).post('/api/flights/order').send({ ...orderBody, flightOffer: bookableOffer });

    expect(res.body.refundAction).toBeUndefined();
    expect(res.body.bookingFailed).toBeUndefined();
  });

  // A process killed mid-chain leaves a claim behind. If that blocked forever,
  // the customer could never complete a booking they had already paid for.
  it('lets a later attempt take over an abandoned claim', async () => {
    const supabase = (await import('../../../backend/config/supabase.js')).default;
    const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    supabase.from.mockImplementation(() => {
      const chain = {};
      for (const m of ['select', 'update', 'insert', 'delete', 'upsert', 'eq', 'is', 'or', 'neq', 'order', 'limit']) {
        chain[m] = vi.fn(() => chain);
      }
      chain.single = vi.fn().mockResolvedValue({ data: inProgressRow(stale), error: null });
      chain.maybeSingle = chain.single;
      // The compare-and-set wins: this row is the one that was read.
      chain.select = vi.fn(() => Object.assign(chain, {
        then: (resolve) => resolve({ data: [{ booking_reference: 'FLTTEST1' }], error: null }),
      }));
      return chain;
    });

    const app = await makeApp();
    const res = await request(app).post('/api/flights/order').send({ ...orderBody, flightOffer: bookableOffer });

    expect(res.body.code).not.toBe('BOOKING_IN_PROGRESS');
  });
});

/**
 * One payment, one booking.
 *
 * A double-clicked confirm, a refreshed callback page and a client retry all
 * arrive with the same bookingReference. If the second one runs the chain it
 * sells a second set of seats against a single charge. The plan named this as a
 * required route test and it did not exist — the concurrency tests cover the
 * claim, which is a different guard for a different case.
 */
describe('a booking that already has a PNR', () => {
  const bookedRow = {
    booking_reference: 'FLTTEST1',
    status: 'confirmed',
    booking_details: { pnr: 'CHOY42', amadeus_order_id: 'CHOY42' },
  };

  const withStoredBooking = async () => {
    const supabase = (await import('../../../backend/config/supabase.js')).default;
    supabase.from.mockImplementation(() => {
      const chain = {};
      for (const m of ['select', 'update', 'insert', 'delete', 'upsert', 'eq', 'is', 'or', 'neq', 'order', 'limit']) {
        chain[m] = vi.fn(() => chain);
      }
      chain.single = vi.fn().mockResolvedValue({ data: bookedRow, error: null });
      chain.maybeSingle = chain.single;
      return chain;
    });
    return makeApp();
  };

  beforeEach(() => {
    vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
    vi.resetModules();
  });

  it('returns the stored order without touching the GDS', async () => {
    const app = await withStoredBooking();

    const res = await request(app).post('/api/flights/order').send({ ...orderBody, flightOffer: bookableOffer });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.mode).toBe('ALREADY_BOOKED');
    expect(res.body.pnr).toBe('CHOY42');
    // The whole point: zero Air_Sell, so no second set of seats.
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('answers with the same locator at both the top level and inside data', async () => {
    const app = await withStoredBooking();

    const res = await request(app).post('/api/flights/order').send({ ...orderBody, flightOffer: bookableOffer });

    // Both clients read one or the other; they must not disagree.
    expect(res.body.data.pnr).toBe('CHOY42');
    expect(res.body.data.id).toBe('CHOY42');
    expect(res.body.orderId).toBe('CHOY42');
  });

  it('never reports a second booking as newly created', async () => {
    const app = await withStoredBooking();

    const res = await request(app).post('/api/flights/order').send({ ...orderBody, flightOffer: bookableOffer });

    expect(res.body.mode).not.toBe('LIVE_GDS_BOOKING');
    expect(JSON.stringify(res.body)).not.toMatch(/mock/i);
  });
});
