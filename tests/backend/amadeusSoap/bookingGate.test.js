import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../backend/middleware/errorHandler.js';

// The payment handlers take their Supabase client from arcpay.config.js, not
// from config/supabase.js, so the global mock does not cover it. Without this,
// the payment-gate test that reaches reconcile's `.update()` dialled the
// placeholder host for real - a unit test making a network call, passing only
// because DNS failed fast. Same shape as checkoutCurrency.test.js.
vi.mock('../../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../../backend/routes/payment/arcpay.config.js');
  const chain = {};
  for (const m of ['select', 'update', 'insert', 'upsert', 'eq', 'or', 'order', 'limit']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.maybeSingle = chain.single;
  return { ...actual, supabase: { from: vi.fn(() => chain) } };
});

/**
 * POST /api/flights/order must never fabricate a booking.
 *
 * Payment runs before this route - ARC Pay hosted checkout takes the money and
 * the browser returns here - so anything that invents a PNR hands a customer a
 * worthless confirmation for a real charge. The route used to do exactly that
 * for any offer that was not Amadeus-shaped, which is the shape the mobile app
 * sends, and again as an "emergency fallback" outside production.
 */

const makeApp = async (row) => {
  if (row !== undefined) await seedRow(row);
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
  // ARC's success indicator, which the paying browser received on the redirect
  // back and posts on. It is what proves the caller made the payment.
  transactionId: 'SI-TEST-1',
};

/**
 * What hosted checkout keeps for a flight: the offer it priced, and the fare
 * and charge it verified. The order route books this offer - never the one in
 * the request body, which `orderBody` deliberately fills with a display card.
 */
const verifiedCheckout = (offer, { fare = 291, charge = 291, coupon } = {}) => ({
  pending_booking_data: { bookingData: { originalOffer: offer } },
  verified_charge: {
    total: charge,
    pricedFare: { total: fare, currency: 'USD' },
    ...(coupon ? { coupon } : {}),
    verifiedAt: new Date().toISOString(),
  },
});

/**
 * A checkout row holding a real, captured payment whose success indicator
 * matches the one `orderBody` carries, for the fare checkout verified.
 */
const paidRow = (over = {}) => ({
  id: 1,
  booking_reference: 'FLTTEST1',
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  ...over,
  booking_details: {
    order_id: 'FLTTEST1',
    success_indicator: 'SI-TEST-1',
    arc_captured_amount: 291,
    arc_captured_currency: 'USD',
    ...verifiedCheckout(bookableOffer),
    ...(over.booking_details || {}),
  },
});

const seedRow = async (row) => {
  const supabase = (await import('../../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(() => {
    const chain = {};
    for (const m of ['select', 'update', 'insert', 'delete', 'upsert', 'eq', 'is', 'or', 'neq', 'ilike', 'order', 'limit']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.single = vi.fn().mockResolvedValue({ data: row, error: null });
    chain.maybeSingle = chain.single;
    return chain;
  });
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
  // A verified payment from the caller, so the gate itself is what is tested.
  beforeEach(async () => { await seedRow(paidRow()); });

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
  beforeEach(async () => { await seedRow(paidRow({ booking_details: verifiedCheckout(uiShapedOffer) })); });

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

/**
 * The route books the offer checkout priced and charged for.
 *
 * It used to book whatever offer the request carried, and the chain checked the
 * airline's price against that same offer - so a different, dearer fare posted
 * here was sold against the payment for a cheaper one. Web and mobile clients
 * post different shapes; neither matters any more.
 */
describe('booking the offer checkout verified, not the one posted', () => {
  beforeEach(() => {
    vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
    vi.resetModules();
  });

  it('books from the row when the request carries only a display card', async () => {
    const app = await makeApp(paidRow());

    const res = await request(app).post('/api/flights/order').send(orderBody);

    expect(res.body.code).not.toBe('OFFER_NOT_BOOKABLE');
    expect(res.body.code).not.toBe('OFFER_NOT_VERIFIED');
  });

  it('ignores a bookable offer in the request when checkout kept something else', async () => {
    const app = await makeApp(paidRow({ booking_details: verifiedCheckout(uiShapedOffer) }));

    const res = await request(app).post('/api/flights/order').send({ ...orderBody, flightOffer: bookableOffer });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OFFER_NOT_BOOKABLE');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('refuses and reverses a payment checkout never verified a fare for', async () => {
    const app = await makeApp(paidRow({ booking_details: { verified_charge: null } }));

    const res = await request(app).post('/api/flights/order').send({ ...orderBody, flightOffer: bookableOffer });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OFFER_NOT_VERIFIED');
    expect(res.body).toHaveProperty('refundAction');
    expect(axios.post).not.toHaveBeenCalled();
  });

  // The refund paths reverse whatever payment is behind the reference.
  it('never reverses the payment of a booking that is not a flight', async () => {
    const app = await makeApp(paidRow({ travel_type: 'cruise' }));

    const res = await request(app).post('/api/flights/order').send(orderBody);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_A_FLIGHT_BOOKING');
    expect(res.body.refundAction).toBeUndefined();
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
  beforeEach(async () => {
    vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
    vi.resetModules();
    await seedRow(paidRow({ booking_details: verifiedCheckout(uiShapedOffer) }));
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

  it('refunds when checkout kept no offer for the payment', async () => {
    const app = await makeApp(paidRow({ booking_details: { pending_booking_data: null } }));

    const res = await request(app).post('/api/flights/order').send(orderBody);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OFFER_NOT_VERIFIED');
    expect(res.body).toHaveProperty('refundAction');
  });

  it('needs no offer in the request at all', async () => {
    const app = await makeApp(paidRow());

    const { flightOffer, ...withoutOffer } = orderBody;
    const res = await request(app).post('/api/flights/order').send(withoutOffer);

    expect(['OFFER_MISSING', 'OFFER_NOT_BOOKABLE', 'OFFER_NOT_VERIFIED']).not.toContain(res.body.code);
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
  // A real in-flight booking: the gateway captured the charge and reconcile
  // recorded the amount, so the order route's payment check passes without a
  // gateway round trip and the claim is what this suite exercises.
  const inProgressRow = (startedAt) => ({
    id: 1,
    booking_reference: 'FLTTEST1',
    travel_type: 'flight',
    status: 'pending',
    payment_status: 'paid',
    total_amount: 291,
    booking_details: {
      success_indicator: 'SI-TEST-1',
      arc_captured_amount: 291,
      arc_captured_currency: 'USD',
      ...verifiedCheckout(bookableOffer),
      gds_chain: { state: 'in_progress', startedAt, attempt: 1 },
    },
  });

  beforeEach(() => {
    vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
    vi.resetModules();
  });

  it('refuses a second attempt while the first is still running', async () => {
    const supabase = (await import('../../../backend/config/supabase.js')).default;
    supabase.from.mockImplementation(() => {
      const chain = {};
      for (const m of ['select', 'update', 'insert', 'delete', 'upsert', 'eq', 'is', 'or', 'neq', 'ilike', 'order', 'limit']) {
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
      for (const m of ['select', 'update', 'insert', 'delete', 'upsert', 'eq', 'is', 'or', 'neq', 'ilike', 'order', 'limit']) {
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
      for (const m of ['select', 'update', 'insert', 'delete', 'upsert', 'eq', 'is', 'or', 'neq', 'ilike', 'order', 'limit']) {
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

  // The claim is a database write; when it errors, nobody knows who holds it.
  // Two requests that both carried on used to sell two sets of seats.
  const claimErrors = async ({ queueErrors = false } = {}) => {
    const supabase = (await import('../../../backend/config/supabase.js')).default;
    supabase.from.mockImplementation(() => {
      const chain = {};
      for (const m of ['select', 'update', 'insert', 'delete', 'upsert', 'eq', 'is', 'or', 'neq', 'ilike', 'order', 'limit']) {
        chain[m] = vi.fn(() => chain);
      }
      chain.single = vi.fn().mockResolvedValue({ data: paidRow(), error: null });
      chain.maybeSingle = chain.single;
      const down = (resolve) => resolve({ data: null, error: { message: 'connection reset' } });
      // Only the claim's compare-and-set asks for rows back from a write.
      chain.select = vi.fn(() => ({ ...chain, then: down }));
      if (queueErrors) {
        const failing = { ...chain, then: down };
        for (const m of ['eq', 'is', 'select']) failing[m] = vi.fn(() => failing);
        chain.update = vi.fn(() => failing);
      }
      return chain;
    });
    return makeApp();
  };

  it('queues the booking, unsold and unrefunded, when the claim cannot be decided', async () => {
    const app = await claimErrors();

    const res = await request(app).post('/api/flights/order').send(orderBody);

    expect(res.status).toBe(202);
    expect(res.body.queued).toBe(true);
    expect(res.body.refundAction).toBeUndefined();
    expect(axios.post).not.toHaveBeenCalled();
  });

  // A cancellation takes the same stamp as the chain. While it runs, the
  // payment is on its way back; once it has finished there is nothing to book.
  // The order route used to have read the row before the cancel landed and
  // sell the seats anyway.
  const chainStateRow = (gdsChain) => {
    const r = inProgressRow(new Date().toISOString());
    return { ...r, booking_details: { ...r.booking_details, gds_chain: gdsChain } };
  };
  const seedChain = async (gdsChain) => {
    const supabase = (await import('../../../backend/config/supabase.js')).default;
    supabase.from.mockImplementation(() => {
      const chain = {};
      for (const m of ['select', 'update', 'insert', 'delete', 'upsert', 'eq', 'is', 'or', 'neq', 'ilike', 'order', 'limit']) {
        chain[m] = vi.fn(() => chain);
      }
      chain.single = vi.fn().mockResolvedValue({ data: chainStateRow(gdsChain), error: null });
      chain.maybeSingle = chain.single;
      return chain;
    });
    return makeApp();
  };

  it('does not start a chain on a booking that is being cancelled', async () => {
    const app = await seedChain({ state: 'cancelling', startedAt: new Date().toISOString() });

    const res = await request(app).post('/api/flights/order').send({ ...orderBody, flightOffer: bookableOffer });

    expect(res.status).toBe(409);
    // The queue worker waits on this code rather than emailing a failure.
    expect(res.body.code).toBe('BOOKING_IN_PROGRESS');
    expect(res.body.error).toMatch(/being cancelled/);
    expect(axios.post).not.toHaveBeenCalled();
    expect(res.body.refundAction).toBeUndefined();
  });

  it('does not start a chain on a booking whose cancellation finished after the row was read', async () => {
    const app = await seedChain({ state: 'cancelled', startedAt: new Date(Date.now() - 60_000).toISOString() });

    const res = await request(app).post('/api/flights/order').send({ ...orderBody, flightOffer: bookableOffer });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_CANCELLED');
    expect(axios.post).not.toHaveBeenCalled();
    expect(res.body.refundAction).toBeUndefined();
  });

  it('asks the customer to retry, without a refund, when it cannot be queued either', async () => {
    const app = await claimErrors({ queueErrors: true });

    const res = await request(app).post('/api/flights/order').send(orderBody);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('BOOKING_UNAVAILABLE');
    expect(res.body.refundAction).toBeUndefined();
    expect(axios.post).not.toHaveBeenCalled();
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
    travel_type: 'flight',
    status: 'confirmed',
    booking_details: { pnr: 'CHOY42', amadeus_order_id: 'CHOY42', success_indicator: 'SI-TEST-1', gds: { ticketed: true } },
  };

  const withStoredBooking = async () => {
    const supabase = (await import('../../../backend/config/supabase.js')).default;
    supabase.from.mockImplementation(() => {
      const chain = {};
      for (const m of ['select', 'update', 'insert', 'delete', 'upsert', 'eq', 'is', 'or', 'neq', 'ilike', 'order', 'limit']) {
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

/**
 * Was this actually paid for?
 *
 * The route never used to ask. `paidAmount` was the row's `total_amount` - the
 * figure the CLIENT asked to be charged when the checkout session was created,
 * written while the row was still `unpaid` - and nothing read
 * `payment_status`. Abandon the ARC page, come back to this route, and a seat
 * was sold and a PNR committed for a charge that never happened. The browser
 * flow does that on its own when the callback's pending-booking lookup fails.
 *
 * Now the route reconciles with the gateway before any GDS call. Every case
 * below asserts the same thing first: Air_Sell was never sent.
 */
describe('the payment gate', () => {
  const chainWith = (row) => {
    const chain = {};
    for (const m of ['select', 'update', 'insert', 'delete', 'upsert', 'eq', 'is', 'or', 'neq', 'ilike', 'order', 'limit']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.single = vi.fn().mockResolvedValue({ data: row, error: null });
    chain.maybeSingle = chain.single;
    return chain;
  };

  const withRow = async (row) => {
    const supabase = (await import('../../../backend/config/supabase.js')).default;
    supabase.from.mockImplementation(() => chainWith(row));
    return makeApp();
  };

  const unpaidRow = {
    id: 1,
    booking_reference: 'FLTTEST1',
    travel_type: 'flight',
    status: 'pending',
    payment_status: 'unpaid',
    total_amount: 5000,           // what the client asked for; proves nothing
    booking_details: { order_id: 'FLTTEST1', success_indicator: 'SI-TEST-1' },
  };

  beforeEach(() => {
    vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
    vi.resetModules();
  });

  it('refuses when no checkout row exists - there is nothing proving a payment', async () => {
    const app = await withRow(null);

    const res = await request(app).post('/api/flights/order').send({ ...orderBody, flightOffer: bookableOffer });

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('PAYMENT_NOT_FOUND');
    expect(axios.post).not.toHaveBeenCalled();
    // Nothing to reverse, so nothing was "refunded".
    expect(res.body.refundAction).toBeUndefined();
  });

  it('refuses an unpaid row when the gateway shows no capture', async () => {
    axios.get.mockResolvedValue({ status: 200, data: { status: 'PENDING', transaction: [] } });
    const app = await withRow(unpaidRow);

    const res = await request(app).post('/api/flights/order').send({ ...orderBody, flightOffer: bookableOffer });

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('PAYMENT_NOT_CAPTURED');
    expect(res.body.orderStatus).toBe('PENDING');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('refuses an unpaid row when the gateway cannot be reached', async () => {
    axios.get.mockRejectedValue(new Error('ECONNRESET'));
    const app = await withRow(unpaidRow);

    const res = await request(app).post('/api/flights/order').send({ ...orderBody, flightOffer: bookableOffer });

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('PAYMENT_NOT_CAPTURED');
    expect(axios.post).not.toHaveBeenCalled();
  });

  // The exploit: the row says 5000 was requested. Nobody paid it.
  it('does not let the row\'s total_amount stand in for a payment', async () => {
    axios.get.mockResolvedValue({ status: 200, data: { status: 'PENDING', transaction: [] } });
    const app = await withRow({ ...unpaidRow, total_amount: 5000 });

    const res = await request(app).post('/api/flights/order').send({ ...orderBody, flightOffer: bookableOffer });

    expect(res.status).toBe(402);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('refuses a row whose payment was refunded', async () => {
    const app = await withRow({ ...unpaidRow, payment_status: 'refunded' });

    const res = await request(app).post('/api/flights/order').send({ ...orderBody, flightOffer: bookableOffer });

    expect(res.status).toBe(402);
    expect(axios.post).not.toHaveBeenCalled();
    // Settled rows are answered from the row; no gateway call.
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('lets a paid row with a recorded capture through without a gateway round trip', async () => {
    const app = await withRow({
      ...unpaidRow,
      payment_status: 'paid',
      booking_details: {
        order_id: 'FLTTEST1', success_indicator: 'SI-TEST-1', arc_captured_amount: 291, arc_captured_currency: 'USD',
        ...verifiedCheckout(bookableOffer),
      },
    });

    const res = await request(app).post('/api/flights/order').send({ ...orderBody, flightOffer: bookableOffer });

    expect(res.body.code).not.toBe('PAYMENT_NOT_FOUND');
    expect(res.body.code).not.toBe('PAYMENT_NOT_CAPTURED');
    expect(axios.get).not.toHaveBeenCalled();
  });

  // The tab-died case: the customer paid, but the browser-driven reconcile
  // never ran, so the row still says unpaid. The route asks the gateway itself.
  it('accepts an unpaid row once the gateway confirms a capture', async () => {
    axios.get.mockResolvedValue({
      status: 200,
      data: {
        status: 'CAPTURED',
        amount: 291,
        currency: 'USD',
        transaction: [{ result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 291, currency: 'USD' } }],
      },
    });
    // The checkout asked for 291 and the gateway holds 291.
    const app = await withRow({
      ...unpaidRow,
      total_amount: 291,
      booking_details: { ...unpaidRow.booking_details, ...verifiedCheckout(bookableOffer) },
    });

    const res = await request(app).post('/api/flights/order').send({ ...orderBody, flightOffer: bookableOffer });

    expect(res.body.code).not.toBe('PAYMENT_NOT_FOUND');
    expect(res.body.code).not.toBe('PAYMENT_NOT_CAPTURED');
    expect(axios.get).toHaveBeenCalledTimes(1);
  });
});

/**
 * Only whoever paid can make this route move money.
 *
 * The refund paths reverse the payment behind the reference in the body, and
 * the route has no auth middleware. They used to run before anything checked
 * a payment existed or who was asking: a POST carrying only another customer's
 * order id reversed their payment and wrote their booking cancelled - even a
 * booking already holding a PNR. With booking disabled in production, any body
 * at all did it.
 */
describe('proving the caller made the payment', () => {
  beforeEach(() => {
    vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'false');
    vi.resetModules();
  });

  it('does not reverse a payment for a caller who cannot prove they made it', async () => {
    const app = await makeApp(paidRow());

    const res = await request(app).post('/api/flights/order').send({ ...orderBody, transactionId: 'guessed' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PAYER_NOT_VERIFIED');
    expect(res.body.refundAction).toBeUndefined();
    // No RETRIEVE_ORDER, so no reversal was even attempted.
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('refuses a caller who presents nothing at all', async () => {
    const { transactionId, ...anonymous } = orderBody;
    const app = await makeApp(paidRow());

    const res = await request(app).post('/api/flights/order').send(anonymous);

    expect(res.status).toBe(403);
    expect(res.body.refundAction).toBeUndefined();
  });

  it('never reverses the payment behind a booking that already holds a PNR', async () => {
    const app = await makeApp(paidRow({ status: 'pending_ticketing', booking_details: { pnr: 'CHOY42', gds: { ticketed: false } } }));

    const res = await request(app).post('/api/flights/order').send(orderBody);

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('ALREADY_BOOKED');
    expect(res.body.refundAction).toBeUndefined();
    expect(axios.get).not.toHaveBeenCalled();
  });

  // It used to answer CONFIRMED for any row with a PNR.
  it('reports an unticketed stored booking as pending, not confirmed', async () => {
    const app = await makeApp(paidRow({ status: 'pending_ticketing', booking_details: { pnr: 'CHOY42', gds: { ticketed: false } } }));

    const res = await request(app).post('/api/flights/order').send(orderBody);

    expect(res.body.data.status).toBe('PENDING_TICKETING');
    expect(res.body.ticketed).toBe(false);
  });

  it('lets the payer through, on the indicator their browser was given', async () => {
    const app = await makeApp(paidRow());

    const res = await request(app).post('/api/flights/order').send(orderBody);

    // Past the payer check, into the booking-disabled refund.
    expect(res.body.code).toBe('BOOKING_DISABLED');
  });
});

describe('provesPayer', () => {
  it('accepts the owner, staff, or the matching indicator - nothing else', async () => {
    const { provesPayer } = await import('../../../backend/routes/flight.routes.js');
    const row = paidRow({ user_id: 'user-1' });

    expect(provesPayer({ user: { id: 'user-1' }, body: {} }, row)).toBe(true);
    expect(provesPayer({ user: { id: 'user-2', role: 'admin' }, body: {} }, row)).toBe(true);
    expect(provesPayer({ user: { id: 'user-2' }, body: {} }, row)).toBe(false);
    expect(provesPayer({ body: { transactionId: 'SI-TEST-1' } }, row)).toBe(true);
    expect(provesPayer({ body: { resultIndicator: 'SI-TEST-1' } }, row)).toBe(true);
    expect(provesPayer({ body: { transactionId: 'SI-TEST-2' } }, row)).toBe(false);
    // An empty indicator can never match an empty one.
    expect(provesPayer({ body: { transactionId: '' } }, paidRow({ booking_details: { success_indicator: '' } }))).toBe(false);
  });
});

describe('traveller details are checked before anything is sold', () => {
  beforeEach(() => {
    vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
    vi.resetModules();
  });

  it('refuses and reverses when a traveller has no date of birth', async () => {
    const app = await makeApp(paidRow());

    const res = await request(app).post('/api/flights/order').send({
      ...orderBody,
      flightOffer: bookableOffer,
      travelers: [{ id: '1', firstName: 'Jane', lastName: 'Doe', gender: 'FEMALE' }],
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PASSENGERS_INCOMPLETE');
    expect(res.body.bookingFailed).toBe(true);
    expect(axios.post).not.toHaveBeenCalled();
  });

  // A domestic adult needs no date of birth - the PNR does not carry one - and
  // "domestic" is decided from the offer's own airports.
  const domesticOffer = {
    ...bookableOffer,
    itineraries: [{
      ...bookableOffer.itineraries[0],
      segments: [{
        ...bookableOffer.itineraries[0].segments[0],
        departure: { iataCode: 'DEL', at: '2026-11-15T07:00:00' },
        arrival: { iataCode: 'BOM', at: '2026-11-15T09:10:00' },
      }],
    }],
  };

  it('lets a domestic adult through without a date of birth', async () => {
    const app = await makeApp(paidRow({ booking_details: verifiedCheckout(domesticOffer) }));

    const res = await request(app).post('/api/flights/order').send({
      ...orderBody,
      travelers: [{ id: '1', firstName: 'Jane', lastName: 'Doe', gender: 'FEMALE' }],
    });

    expect(res.body.code).not.toBe('PASSENGERS_INCOMPLETE');
  });

  // Decided from the offer checkout kept: a domestic offer in the request
  // cannot excuse a date of birth on an international fare.
  it('decides whether the trip crosses a border from the stored offer', async () => {
    const app = await makeApp(paidRow());

    const res = await request(app).post('/api/flights/order').send({
      ...orderBody,
      flightOffer: domesticOffer,
      travelers: [{ id: '1', firstName: 'Jane', lastName: 'Doe', gender: 'FEMALE' }],
    });

    expect(res.body.code).toBe('PASSENGERS_INCOMPLETE');
  });

  it('still needs a date of birth for a child on a domestic trip', async () => {
    const childFare = { ...domesticOffer, travelerPricings: [{ ...domesticOffer.travelerPricings[0], travelerType: 'CHILD' }] };
    const app = await makeApp(paidRow({ booking_details: verifiedCheckout(childFare) }));

    const res = await request(app).post('/api/flights/order').send({
      ...orderBody,
      travelers: [{ id: '1', firstName: 'Kabir', lastName: 'Doe', gender: 'MALE', ptc: 'CHILD' }],
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PASSENGERS_INCOMPLETE');
    expect(axios.post).not.toHaveBeenCalled();
  });

  // Extra travellers added on the review page were booked on the fare of the
  // number the search priced.
  it('refuses more travellers than the fare was priced for', async () => {
    const app = await makeApp(paidRow());

    const res = await request(app).post('/api/flights/order').send({
      ...orderBody,
      flightOffer: bookableOffer,
      travelers: [orderBody.travelers[0], { ...orderBody.travelers[0], id: '2', firstName: 'John' }],
    });

    expect(res.body.code).toBe('PASSENGER_COUNT_MISMATCH');
    expect(axios.post).not.toHaveBeenCalled();
  });

  // Types used to be assigned by position: whoever was typed second in a one
  // adult + one child search became the child.
  it('refuses passenger types that do not match the fare', async () => {
    const app = await makeApp(paidRow());

    const res = await request(app).post('/api/flights/order').send({
      ...orderBody,
      flightOffer: bookableOffer,
      travelers: [{ ...orderBody.travelers[0], ptc: 'CHILD' }],
    });

    expect(res.body.code).toBe('PASSENGER_COUNT_MISMATCH');
    expect(res.body.technicalError).toMatch(/passenger types/);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('has no invented passenger, contact or transaction id left in the route', async () => {
    const source = (await import('node:fs')).readFileSync(
      new URL('../../../backend/routes/flight.routes.js', import.meta.url), 'utf8',
    );
    for (const banned of ["'1990-01-01'", "'1234567890'", "'guest@jetsetters.com'", "'guest@jetsetterss.com'", "|| 'Test'", "|| 'User'", 'TXN-${Date.now()}']) {
      expect(source, `${banned} must not survive in the flight route`).not.toContain(banned);
    }
  });
});

describe('an unexpected error after the payment was verified', () => {
  afterEach(() => {
    vi.doUnmock('../../../backend/services/flightProvider.js');
  });

  it('reverses the payment and does not show the customer the exception', async () => {
    vi.doMock('../../../backend/services/flightProvider.js', () => ({
      default: {},
      providerStatus: () => { throw new Error('kaboom internal detail'); },
    }));
    const app = await makeApp(paidRow());

    const res = await request(app).post('/api/flights/order').send(orderBody);

    expect(res.status).toBe(500);
    expect(res.body.bookingFailed).toBe(true);
    expect(res.body).toHaveProperty('refundAction');
    expect(res.body.error).not.toMatch(/kaboom/);
  });
});

/**
 * The chain is held to what the customer paid for.
 *
 * The fare the chain compared the airline's price with was the one re-read a
 * moment before booking - so a fare that rose after payment matched itself and
 * was sold. And a coupon was checked at checkout but never counted as used.
 */
describe('the fare the customer paid for', () => {
  const provider = ({ pricedTotal = null, order } = {}) => {
    const createFlightOrder = vi.fn(order || (async () => {
      throw Object.assign(new Error('stop after the call'), { step: 'sell', committed: false });
    }));
    vi.doMock('../../../backend/services/flightProvider.js', () => ({
      default: {
        priceFlightOffer: vi.fn(async (offer) => (pricedTotal
          ? { success: true, data: { flightOffers: [{ ...offer, price: { currency: 'USD', total: pricedTotal, grandTotal: pricedTotal, base: '110.00' } }] } }
          : { success: false })),
        createFlightOrder,
      },
      providerStatus: () => ({ bookingEnabled: true, wsap: '1ASIWTEST' }),
    }));
    return createFlightOrder;
  };

  // A row whose chain claim is free and is won.
  const claimable = async (row) => {
    const supabase = (await import('../../../backend/config/supabase.js')).default;
    supabase.from.mockImplementation(() => {
      const chain = {};
      for (const m of ['select', 'update', 'insert', 'delete', 'upsert', 'eq', 'is', 'or', 'neq', 'ilike', 'order', 'limit']) {
        chain[m] = vi.fn(() => chain);
      }
      chain.single = vi.fn().mockResolvedValue({ data: row, error: null });
      chain.maybeSingle = chain.single;
      chain.select = vi.fn(() => Object.assign(chain, {
        then: (resolve) => resolve({ data: [{ booking_reference: 'FLTTEST1' }], error: null }),
      }));
      return chain;
    });
    return makeApp();
  };

  beforeEach(() => {
    vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('../../../backend/services/flightProvider.js');
    vi.doUnmock('../../../backend/services/coupon.service.js');
    vi.doUnmock('../../../backend/services/emailService.js');
  });

  it('refunds before selling anything when the fare rose after payment', async () => {
    const createFlightOrder = provider({ pricedTotal: '340.00' });
    const app = await claimable(paidRow());

    const res = await request(app).post('/api/flights/order').send(orderBody);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PRICE_CHANGED');
    expect(res.body).toHaveProperty('refundAction');
    expect(createFlightOrder).not.toHaveBeenCalled();
  });

  it('books a fare that came in lower, held to the fare and charge checkout verified', async () => {
    const createFlightOrder = provider({ pricedTotal: '280.00' });
    const app = await claimable(paidRow({ booking_details: verifiedCheckout(bookableOffer, { fare: 291, charge: 298.28 }) }));

    await request(app).post('/api/flights/order').send(orderBody);

    expect(createFlightOrder).toHaveBeenCalledTimes(1);
    const [orderData, options] = createFlightOrder.mock.calls[0];
    expect(orderData.data.flightOffers[0].itineraries[0].segments[0].departure.iataCode).toBe('JFK');
    expect(options.expectedTotal).toBe(291);
    expect(options.verifiedChargeTotal).toBe(298.28);
  });

  it('ages a fare it could not price again from checkout\'s verification', async () => {
    const createFlightOrder = provider();
    const row = paidRow();
    const app = await claimable(row);

    await request(app).post('/api/flights/order').send(orderBody);

    const [orderData] = createFlightOrder.mock.calls[0];
    expect(orderData.data.flightOffers[0]._ama.pricedAt).toBe(row.booking_details.verified_charge.verifiedAt);
  });

  it('counts the coupon as used once the booking exists', async () => {
    const recordCouponUse = vi.fn(async () => ({ recorded: true }));
    vi.doMock('../../../backend/services/coupon.service.js', () => ({ recordCouponUse }));
    vi.doMock('../../../backend/services/emailService.js', () => ({
      sendBookingNotificationEmails: vi.fn(async () => ({ success: true })),
    }));
    provider({
      pricedTotal: '291.00',
      order: async () => ({ success: true, pnr: 'ABC123', orderId: 'ABC123', ticketed: true, tickets: [], mode: 'LIVE_GDS_BOOKING' }),
    });
    const coupon = { id: 'coupon-1', code: 'SAVE10', discountAmount: 29.1 };
    const app = await claimable(paidRow({
      user_id: 'user-1',
      booking_details: { customer_email: 'jane@example.com', ...verifiedCheckout(bookableOffer, { charge: 268.2, coupon }) },
    }));

    await request(app).post('/api/flights/order').send(orderBody);

    expect(recordCouponUse).toHaveBeenCalledTimes(1);
    expect(recordCouponUse.mock.calls[0][1]).toEqual({
      coupon, userId: 'user-1', email: 'jane@example.com', bookingReference: 'FLTTEST1',
    });
  });

  // The PNR is recorded the instant it exists, before anything else is saved.
  // That record alone lacked `gds.ticketed`, so if nothing after it was saved,
  // the paid-not-ticketed alarm could not see a live reservation.
  it('records a committed booking the paid-not-ticketed alarm can find', async () => {
    const { selectUnannounced } = await import('../../../backend/jobs/needsReviewAlert.job.js');
    provider({
      pricedTotal: '291.00',
      order: async (_orderData, options) => {
        await options.onCommitted({ pnr: 'ABC123', tstRefs: ['1'], priced: { total: 291, currency: 'USD' } });
        throw Object.assign(new Error('the process went away'), { step: 'issueTicket' });
      },
    });
    const updates = [];
    const supabase = (await import('../../../backend/config/supabase.js')).default;
    supabase.from.mockImplementation(() => {
      const chain = {};
      for (const m of ['select', 'insert', 'delete', 'upsert', 'eq', 'is', 'or', 'neq', 'ilike', 'order', 'limit']) {
        chain[m] = vi.fn(() => chain);
      }
      chain.update = vi.fn((payload) => { updates.push(payload); return chain; });
      chain.single = vi.fn().mockResolvedValue({ data: paidRow(), error: null });
      chain.maybeSingle = chain.single;
      chain.select = vi.fn(() => Object.assign(chain, {
        then: (resolve) => resolve({ data: [{ booking_reference: 'FLTTEST1' }], error: null }),
      }));
      return chain;
    });
    const app = await makeApp();

    await request(app).post('/api/flights/order').send(orderBody);

    const committed = updates.find((u) => u.booking_details?.gds?.committed_at);
    expect(committed.booking_details).toMatchObject({ pnr: 'ABC123', gds: { ticketed: false } });
    expect(selectUnannounced([{ status: 'pending', payment_status: 'paid', booking_details: committed.booking_details }])).toHaveLength(1);
  });

  // The chain stopped before its commit: this request no longer holds the
  // booking. Nothing was sold and someone else may be booking it.
  it('neither refunds nor books when the chain lost its claim before commit', async () => {
    provider({
      pricedTotal: '291.00',
      order: async () => { throw Object.assign(new Error('claim lost'), { step: 'claim', committed: false, claimLost: true }); },
    });
    const app = await claimable(paidRow());

    const res = await request(app).post('/api/flights/order').send(orderBody);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_IN_PROGRESS');
    expect(res.body.refundAction).toBeUndefined();
    expect(res.body.bookingFailed).toBeUndefined();
  });

  it('queues the booking when the claim could not be confirmed before commit', async () => {
    provider({
      pricedTotal: '291.00',
      order: async () => { throw Object.assign(new Error('claim unknown'), { step: 'claim', committed: false, claimUnavailable: true }); },
    });
    const app = await claimable(paidRow());

    const res = await request(app).post('/api/flights/order').send(orderBody);

    expect(res.status).toBe(202);
    expect(res.body.queued).toBe(true);
    expect(res.body.refundAction).toBeUndefined();
  });

  it('counts nothing when the booking is refused', async () => {
    const recordCouponUse = vi.fn();
    vi.doMock('../../../backend/services/coupon.service.js', () => ({ recordCouponUse }));
    provider({ pricedTotal: '340.00' });
    const coupon = { id: 'coupon-1', code: 'SAVE10', discountAmount: 29.1 };
    const app = await claimable(paidRow({ booking_details: verifiedCheckout(bookableOffer, { coupon }) }));

    await request(app).post('/api/flights/order').send(orderBody);

    expect(recordCouponUse).not.toHaveBeenCalled();
  });
});
