import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

// The payment handlers take their Supabase client from arcpay.config.js; see
// amadeusSoap/bookingGate.test.js for why it is mocked here too.
vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  const chain = {};
  for (const m of ['select', 'update', 'insert', 'upsert', 'eq', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.maybeSingle = chain.single;
  return { ...actual, supabase: { from: vi.fn(() => chain) } };
});

/**
 * A second payment for one trip is held for a human, not booked.
 *
 * The review page opened a new payment page on every Pay click, so a double
 * click, the back button or a second tab could leave a customer with two paid
 * checkouts for the same trip - and POST /order booked both: two PNRs, two
 * charges. Nothing is refunded automatically, because a family can book one
 * flight twice for different people; that is why the travellers' names must
 * match.
 */

const USER = 'user-1';
const FIRST = 'FLTFIRST1';
const SECOND = 'FLTSECOND2';

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

const JANE = [{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', gender: 'FEMALE' }];
const JOHN = [{ id: '1', firstName: 'John', lastName: 'Doe', dateOfBirth: '1988-02-02', gender: 'MALE' }];

/** A checkout ARC captured, verified for the offer, not yet booked. */
const paidCheckout = (ref, over = {}) => ({
  booking_reference: ref,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 291,
  user_id: USER,
  created_at: new Date().toISOString(),
  ...over,
  booking_details: {
    order_id: ref,
    success_indicator: `SI-${ref}`,
    customer_email: 'jane@example.com',
    arc_captured_amount: 291,
    arc_captured_currency: 'USD',
    pending_booking_data: { bookingData: { originalOffer: bookableOffer, passengerData: JANE } },
    verified_charge: { total: 291, pricedFare: { total: 291, currency: 'USD' }, verifiedAt: new Date().toISOString() },
    ...(over.booking_details || {}),
  },
});

/** The first checkout for the trip, already booked with the airline. */
const bookedFirst = (over = {}) => paidCheckout(FIRST, {
  status: 'pending_ticketing',
  passenger_details: JANE,
  ...over,
  booking_details: { pnr: 'ABC123', gds: { ticketed: false }, flight_offer: bookableOffer, ...(over.booking_details || {}) },
});

const orderFor = (ref, travelers = JANE) => ({
  bookingReference: ref,
  orderId: ref,
  transactionId: `SI-${ref}`,
  contactInfo: { email: 'jane@example.com' },
  travelers,
});

const createFlightOrder = vi.fn();

const appWith = async (rows, options) => {
  const table = fakeBookingsTable(rows, options);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  return { app, table, place: (body) => request(app).post('/api/flights/order').send(body) };
};

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWTEST');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
  vi.resetModules();

  createFlightOrder.mockReset();
  createFlightOrder.mockImplementation(async (_orderData, options) => {
    await options.onCommitted({ pnr: 'NEW999', tstRefs: ['1'], priced: { total: 291, currency: 'USD' } });
    return { success: true, pnr: 'NEW999', orderId: 'NEW999', ticketed: false, tickets: [], mode: 'LIVE_GDS_BOOKING' };
  });
  vi.doMock('../../backend/services/flightProvider.js', () => ({
    default: {
      priceFlightOffer: vi.fn(async (offer) => ({
        success: true,
        data: { flightOffers: [{ ...offer, price: { currency: 'USD', total: '291.00', grandTotal: '291.00', base: '110.00' } }] },
      })),
      createFlightOrder,
    },
    providerStatus: () => ({ bookingEnabled: true, wsap: '1ASIWTEST' }),
  }));
  const mailer = { sendBookingNotificationEmails: vi.fn(async () => ({ success: true })), sendEmail: vi.fn(), sendCancellationNotificationEmails: vi.fn() };
  vi.doMock('../../backend/services/emailService.js', () => ({ ...mailer, default: mailer }));
});

afterEach(() => {
  vi.doUnmock('../../backend/services/flightProvider.js');
  vi.doUnmock('../../backend/services/emailService.js');
});

describe('a second paid checkout for a trip that is already booked', () => {
  it('is held for review: not booked, and not refunded', async () => {
    const { table, place } = await appWith([bookedFirst(), paidCheckout(SECOND)]);

    const res = await place(orderFor(SECOND));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_PAYMENT');
    expect(res.body.success).toBe(false);
    expect(createFlightOrder).not.toHaveBeenCalled();
    expect(res.body.refundAction).toBeUndefined();
    expect(res.body.bookingFailed).toBeUndefined();

    const held = table.row(SECOND).booking_details;
    expect(held.needs_review).toMatchObject({ duplicate_of: FIRST, ticketed: false, source: 'duplicate-payment' });
    expect(held.needs_review.reason).toMatch(/duplicate payment/);
    // The claim this request took is let go: nothing was sold.
    expect(held.gds_chain.state).toBe('failed');
  });

  it('tells the customer honestly, and that support will refund it', async () => {
    const { place } = await appWith([bookedFirst(), paidCheckout(SECOND)]);

    const res = await place(orderFor(SECOND));

    expect(res.body.error).toMatch(/second payment for a trip you have already booked/);
    expect(res.body.error).toMatch(/refund this payment/);
    expect(res.body.error).toContain(SECOND);
    expect(res.body.error).not.toMatch(/reversed/);
  });

  it('is announced by the paid-not-ticketed alarm', async () => {
    const { table, place } = await appWith([bookedFirst(), paidCheckout(SECOND)]);
    await place(orderFor(SECOND));
    const { selectUnannounced, describeBooking } = await import('../../backend/jobs/needsReviewAlert.job.js');

    const announced = selectUnannounced([table.row(SECOND)]);

    expect(announced).toHaveLength(1);
    expect(describeBooking(announced[0])).toContain(FIRST);
  });

  it('stays held when the order is sent again, before any gateway call', async () => {
    const heldRow = paidCheckout(SECOND, {
      payment_status: 'unpaid',
      booking_details: { arc_captured_amount: null, needs_review: { reason: 'possible duplicate payment', duplicate_of: FIRST } },
    });
    const { place } = await appWith([bookedFirst(), heldRow]);

    const res = await place(orderFor(SECOND));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_PAYMENT');
    expect(axios.get).not.toHaveBeenCalled();
    expect(createFlightOrder).not.toHaveBeenCalled();
  });

  it('is held while the first is still being booked, or waits in the queue', async () => {
    const inProgress = paidCheckout(FIRST, {
      booking_details: { gds_chain: { state: 'in_progress', startedAt: new Date(Date.now() - 1000).toISOString(), claimedAt: new Date(Date.now() - 1000).toISOString() } },
    });
    let app = await appWith([inProgress, paidCheckout(SECOND)]);
    expect((await app.place(orderFor(SECOND))).body.code).toBe('DUPLICATE_PAYMENT');

    vi.resetModules();
    const queued = paidCheckout(FIRST, { booking_details: { queued_order: orderFor(FIRST), gds_chain: { state: 'queued', startedAt: new Date().toISOString() } } });
    app = await appWith([queued, paidCheckout(SECOND)]);
    expect((await app.place(orderFor(SECOND))).body.code).toBe('DUPLICATE_PAYMENT');
    expect(createFlightOrder).not.toHaveBeenCalled();
  });
});

describe('what is not a duplicate is booked as before', () => {
  // A family booking the same flight twice, for different people.
  it('books the same flights for different travellers', async () => {
    const { place } = await appWith([bookedFirst(), paidCheckout(SECOND, { booking_details: { pending_booking_data: { bookingData: { originalOffer: bookableOffer, passengerData: JOHN } } } })]);

    const res = await place(orderFor(SECOND, JOHN));

    expect(res.body.code).not.toBe('DUPLICATE_PAYMENT');
    expect(createFlightOrder).toHaveBeenCalledTimes(1);
  });

  it("books another customer's identical trip", async () => {
    const { place } = await appWith([bookedFirst(), paidCheckout(SECOND, { user_id: 'user-2', booking_details: { customer_email: 'someone@example.com' } })]);

    const res = await place(orderFor(SECOND));

    expect(res.body.code).not.toBe('DUPLICATE_PAYMENT');
    expect(createFlightOrder).toHaveBeenCalledTimes(1);
  });

  it('books it when the first booking was cancelled or its money returned', async () => {
    let app = await appWith([bookedFirst({ status: 'cancelled' }), paidCheckout(SECOND)]);
    expect((await app.place(orderFor(SECOND))).body.code).not.toBe('DUPLICATE_PAYMENT');

    vi.resetModules();
    app = await appWith([bookedFirst({ payment_status: 'refunded' }), paidCheckout(SECOND)]);
    expect((await app.place(orderFor(SECOND))).body.code).not.toBe('DUPLICATE_PAYMENT');
    expect(createFlightOrder).toHaveBeenCalledTimes(2);
  });

  // Two payments racing: each sees the other after its own claim, and only
  // the one that claimed later is held.
  it('books this one when the other claimed after it', async () => {
    const later = new Date(Date.now() + 60_000).toISOString();
    const { place } = await appWith([
      paidCheckout(FIRST, { booking_details: { gds_chain: { state: 'in_progress', startedAt: new Date().toISOString(), claimedAt: later } } }),
      paidCheckout(SECOND),
    ]);

    const res = await place(orderFor(SECOND));

    expect(res.body.code).not.toBe('DUPLICATE_PAYMENT');
    expect(createFlightOrder).toHaveBeenCalledTimes(1);
  });
});

describe('when the check cannot be made', () => {
  it('queues the booking instead of booking it unchecked, and refunds nothing', async () => {
    const lookupFails = ({ filters, patch }) => !patch && filters.some(([, column]) => column === 'travel_type');
    const { place } = await appWith([bookedFirst(), paidCheckout(SECOND)], { fail: lookupFails });

    const res = await place(orderFor(SECOND));

    expect(res.status).toBe(202);
    expect(res.body.queued).toBe(true);
    expect(res.body.refundAction).toBeUndefined();
    expect(createFlightOrder).not.toHaveBeenCalled();
  });
});

describe("the booking queue's email about a held payment", () => {
  it('says it was not booked twice and support will refund it, not that it was reversed', async () => {
    const { failureCopy } = await import('../../backend/jobs/bookingQueue.job.js');

    const copy = failureCopy({ success: false, code: 'DUPLICATE_PAYMENT', needsReview: true });

    expect(copy).toMatch(/second payment/);
    expect(copy).toMatch(/refund this payment/);
    expect(copy).not.toMatch(/reversed/);
  });
});
