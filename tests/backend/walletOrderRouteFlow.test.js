import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { supabaseMock } from './setup.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  const chain = {};
  for (const m of ['select', 'update', 'insert', 'upsert', 'eq', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.maybeSingle = chain.single;
  return { ...actual, supabase: { from: vi.fn(() => chain) } };
});

/**
 * Coins on the order route: captured when the booking is made, given back whole
 * when the payment is reversed or was a second one.
 *
 * Coins are held at checkout under the booking's reference. The order route
 * runs after the card has been charged, so every way out of it either keeps the
 * booking (the coins are spent) or gives the payment back (the coins go too).
 */

const FIRST = 'FLTFIRST1';
const REF = 'FLTCOIN1';
const COINS = 5000;

const offer = {
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

const withCoins = {
  total: 241, walletAmount: 50, walletCoins: COINS, wallet: { coins: COINS, amount: 50 },
  pricedFare: { total: 291, currency: 'USD' }, verifiedAt: new Date().toISOString(),
};
const withoutCoins = { total: 291, pricedFare: { total: 291, currency: 'USD' }, verifiedAt: new Date().toISOString() };

const checkout = (ref, { coins = true, ...over } = {}) => ({
  id: ref,
  booking_reference: ref,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: coins ? 241 : 291,
  user_id: 'user-1',
  created_at: new Date().toISOString(),
  ...over,
  booking_details: {
    order_id: ref,
    success_indicator: `SI-${ref}`,
    customer_email: 'jane@example.com',
    arc_captured_amount: coins ? 241 : 291,
    arc_captured_currency: 'USD',
    pending_booking_data: { bookingData: { originalOffer: offer, passengerData: JANE }, ...(coins ? { walletCoins: COINS } : {}) },
    verified_charge: coins ? withCoins : withoutCoins,
    ...(over.booking_details || {}),
  },
});

const bookedFirst = () => ({
  ...checkout(FIRST, { coins: false }),
  status: 'pending_ticketing',
  passenger_details: JANE,
  booking_details: { ...checkout(FIRST, { coins: false }).booking_details, pnr: 'ABC123', gds: { ticketed: false }, flight_offer: offer },
});

const orderFor = (ref) => ({
  bookingReference: ref,
  orderId: ref,
  transactionId: `SI-${ref}`,
  contactInfo: { email: 'jane@example.com', countryCode: '1', phoneNumber: '5551234567' },
  travelers: JANE,
});

const reverse = vi.fn();

const response = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};
const failure = { orderId: REF, bookingReference: REF, amount: 241, errorMsg: 'checkout kept no verified fare for this offer', status: 400, code: 'OFFER_NOT_VERIFIED' };
const calls = (name) => supabaseMock.rpc.mock.calls.filter(([fn]) => fn === name);

const bookingProvider = (after, { bookingEnabled = true } = {}) => {
  vi.doMock('../../backend/services/flightProvider.js', () => ({
    default: {
      priceFlightOffer: vi.fn(async (priced) => ({
        success: true,
        data: { flightOffers: [{ ...priced, price: { currency: 'USD', total: '291.00', grandTotal: '291.00', base: '110.00' } }] },
      })),
      createFlightOrder: vi.fn(async (_orderData, options) => {
        await options.onCommitted({ pnr: 'NEW999', tstRefs: ['1'], priced: { total: 291, currency: 'USD' } });
        return after();
      }),
    },
    providerStatus: () => ({ bookingEnabled, wsap: '1ASIWTEST' }),
  }));
};

const booked = () => ({ success: true, pnr: 'NEW999', orderId: 'NEW999', ticketed: false, tickets: [], mode: 'LIVE_GDS_BOOKING' });

const appWith = async (rows) => {
  vi.doMock('../../backend/routes/payment/operations.handlers.js', async () => {
    const actual = await vi.importActual('../../backend/routes/payment/operations.handlers.js');
    return { ...actual, reverseArcPaymentForOrder: reverse };
  });
  const table = fakeBookingsTable(rows);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  return { table, place: (ref) => request(app).post('/api/flights/order').send(orderFor(ref)) };
};

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWTEST');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
  vi.resetModules();
  reverse.mockReset();
  reverse.mockResolvedValue({ reversed: true, action: 'VOID', transactionId: 'pay-1', amount: 241 });
  supabaseMock.rpc = vi.fn(async (fn) => ({
    data: fn === 'wallet_capture' ? { status: 'captured' } : { status: 'captured', coins: COINS, applied: true },
    error: null,
  }));
  const mailer = { sendBookingNotificationEmails: vi.fn(async () => ({ success: true })), sendEmail: vi.fn(), sendCancellationNotificationEmails: vi.fn() };
  vi.doMock('../../backend/services/emailService.js', () => ({ ...mailer, default: mailer }));
});

afterEach(() => {
  vi.doUnmock('../../backend/services/flightProvider.js');
  vi.doUnmock('../../backend/services/emailService.js');
  vi.doUnmock('../../backend/routes/payment/operations.handlers.js');
});

describe('a booking that used coins', () => {
  it('captures them once the airline has booked it', async () => {
    bookingProvider(booked);
    const { place, table } = await appWith([checkout(REF)]);

    const res = await place(REF);

    expect(res.body.success).toBe(true);
    expect(calls('wallet_capture')).toEqual([['wallet_capture', { p_ref: REF }]]);
    expect(calls('wallet_return')).toHaveLength(0);
    expect(table.row(REF).booking_details.wallet_issue).toBeUndefined();
  });

  it('captures them when the airline holds the booking but ticketing failed', async () => {
    bookingProvider(() => {
      throw Object.assign(new Error('ticketing refused'), { committed: true, pnr: 'NEW999', step: 'issueTicket', ticketed: false });
    });
    const { place } = await appWith([checkout(REF)]);

    const res = await place(REF);

    expect(res.status).toBe(202);
    expect(res.body.needsReview).toBe(true);
    expect(calls('wallet_capture')).toEqual([['wallet_capture', { p_ref: REF }]]);
    expect(calls('wallet_return')).toHaveLength(0);
  });

  it('does not capture coins for a booking that failed before the airline held it', async () => {
    bookingProvider(() => { throw Object.assign(new Error('no availability'), { committed: false, step: 'sell' }); });
    const { place } = await appWith([checkout(REF)]);

    await place(REF);

    expect(calls('wallet_capture')).toHaveLength(0);
    expect(supabaseMock.rpc).toHaveBeenCalledWith('wallet_return', expect.objectContaining({ p_ref: REF, p_reason: 'reversal' }));
  });

  it('still books when the coins turn out not to be held, and marks it', async () => {
    supabaseMock.rpc.mockImplementation(async () => ({ data: { status: 'released' }, error: null }));
    bookingProvider(booked);
    const { place, table } = await appWith([checkout(REF)]);

    const res = await place(REF);

    expect(res.body.success).toBe(true);
    expect(table.row(REF).booking_details.pnr).toBe('NEW999');
    expect(table.row(REF).booking_details.wallet_issue).toMatchObject({ kind: 'capture_failed', coins: COINS, status: 'released' });
    expect(table.row(REF).booking_details.needs_review).toBeUndefined();
  });

  it('still books when the wallet cannot be reached, and marks it', async () => {
    supabaseMock.rpc.mockImplementation(async () => ({ data: null, error: { message: 'connection reset' } }));
    bookingProvider(booked);
    const { place, table } = await appWith([checkout(REF)]);

    const res = await place(REF);

    expect(res.body.success).toBe(true);
    expect(table.row(REF).booking_details.wallet_issue).toMatchObject({ kind: 'capture_failed', coins: COINS });
  });

  it('gives every coin back when the payment is reversed after a failed booking', async () => {
    bookingProvider(booked, { bookingEnabled: false });
    const { place, table } = await appWith([checkout(REF)]);

    const res = await place(REF);

    expect(res.status).toBe(503);
    expect(reverse).toHaveBeenCalledTimes(1);
    expect(supabaseMock.rpc).toHaveBeenCalledWith('wallet_return', expect.objectContaining({ p_ref: REF, p_reason: 'reversal' }));
    expect(calls('wallet_return')).toHaveLength(1);
    expect(calls('wallet_capture')).toHaveLength(0);
    expect(table.row(REF).booking_details.wallet_issue).toBeUndefined();
  });

  it('gives the coins back even when the card could not be refunded', async () => {
    reverse.mockResolvedValue({ reversed: false, action: 'FAILED', error: 'gateway down' });
    bookingProvider(booked, { bookingEnabled: false });
    const { place, table } = await appWith([checkout(REF)]);

    await place(REF);

    expect(calls('wallet_return')).toHaveLength(1);
    expect(table.row(REF).booking_details.needs_review.reason).toMatch(/charge not reversed/);
  });

  it('gives them back to the request that finds the payment already being reversed', async () => {
    const { table } = await appWith([checkout(REF, {
      booking_details: { fulfillment_failed: { at: new Date().toISOString(), error: 'earlier', reversal: { action: 'IN_PROGRESS' } } },
    })]);
    const { refundOnFulfillmentFailure } = await import('../../backend/routes/flight.routes.js');

    const res = response();
    await refundOnFulfillmentFailure(res, failure);

    expect(reverse).not.toHaveBeenCalled();
    expect(calls('wallet_return')).toHaveLength(1);
    expect(supabaseMock.rpc).toHaveBeenCalledWith('wallet_return', expect.objectContaining({ p_ref: REF, p_reason: 'reversal' }));
    expect(table.row(REF).booking_details.wallet_issue).toBeUndefined();
  });

  it('asks for the coins from every request that fails the booking, and reverses the card once', async () => {
    await appWith([checkout(REF)]);
    const { refundOnFulfillmentFailure } = await import('../../backend/routes/flight.routes.js');

    await Promise.all([refundOnFulfillmentFailure(response(), failure), refundOnFulfillmentFailure(response(), failure)]);

    expect(reverse).toHaveBeenCalledTimes(1);
    expect(calls('wallet_return')).toHaveLength(2);
    expect(calls('wallet_return').every(([, args]) => args.p_ref === REF && args.p_reason === 'reversal')).toBe(true);
  });

  it('marks coins that could not be given back, and still answers the refund', async () => {
    supabaseMock.rpc.mockImplementation(async () => ({ data: null, error: { message: 'connection reset' } }));
    bookingProvider(booked, { bookingEnabled: false });
    const { place, table } = await appWith([checkout(REF)]);

    const res = await place(REF);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('BOOKING_DISABLED');
    expect(table.row(REF).booking_details.wallet_issue).toMatchObject({ kind: 'return_failed', reason: 'reversal', coins: COINS });
    expect(table.row(REF).booking_details.fulfillment_failed).toBeTruthy();
    expect(table.row(REF).status).toBe('cancelled');
  });

  it('gives every coin back when this was a second payment for a trip already booked', async () => {
    bookingProvider(booked);
    const { place } = await appWith([bookedFirst(), checkout(REF)]);

    const res = await place(REF);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_PAYMENT');
    expect(reverse).toHaveBeenCalledTimes(1);
    expect(supabaseMock.rpc).toHaveBeenCalledWith('wallet_return', expect.objectContaining({ p_ref: REF, p_reason: 'duplicate' }));
    expect(calls('wallet_return')).toHaveLength(1);
    expect(calls('wallet_capture')).toHaveLength(0);
  });
});

describe('a booking that used no coins', () => {
  it('never touches the wallet when it books', async () => {
    bookingProvider(booked);
    const { place } = await appWith([checkout(REF, { coins: false })]);

    const res = await place(REF);

    expect(res.body.success).toBe(true);
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it('never touches the wallet when its payment is reversed', async () => {
    bookingProvider(booked, { bookingEnabled: false });
    const { place, table } = await appWith([checkout(REF, { coins: false })]);

    await place(REF);

    expect(reverse).toHaveBeenCalledTimes(1);
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
    expect(table.row(REF).booking_details.wallet_issue).toBeUndefined();
  });

  it('never touches the wallet when it was a second payment', async () => {
    bookingProvider(booked);
    const { place } = await appWith([bookedFirst(), checkout(REF, { coins: false })]);

    const res = await place(REF);

    expect(res.body.code).toBe('DUPLICATE_PAYMENT');
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });
});

describe('a booking with a trip-reward voucher', () => {
  const voucher = { id: 'v1', code: 'SHUBHAM', coins: 5000 };
  const withVoucher = (ref) => checkout(ref, { coins: false, booking_details: { verified_charge: { ...withoutCoins, voucher } } });
  const reserved = { status: 'pending', code: 'SHUBHAM', coins: 5000, due_at: '2026-11-18T00:00:00+00:00', created: true };

  it('reserves the reward once the airline has booked it, due two days after the last arrival', async () => {
    supabaseMock.rpc.mockImplementation(async (fn) => ({ data: fn === 'reserve_trip_voucher' ? reserved : {}, error: null }));
    bookingProvider(booked);
    const { place, table } = await appWith([withVoucher(REF)]);

    const res = await place(REF);

    expect(res.body.success).toBe(true);
    expect(calls('reserve_trip_voucher')).toEqual([['reserve_trip_voucher', { p_user: 'user-1', p_code: 'SHUBHAM', p_ref: REF, p_due_at: '2026-11-18T00:00:00.000Z' }]]);
    expect(res.body.tripReward).toEqual({ code: 'SHUBHAM', coins: 5000, dueAt: '2026-11-18T00:00:00.000Z' });
    expect(table.row(REF).booking_details.trip_reward).toEqual({ code: 'SHUBHAM', coins: 5000, due_at: '2026-11-18T00:00:00.000Z' });
    expect(table.row(REF).booking_details.wallet_issue).toBeUndefined();
  });

  it('still books when the voucher is refused, and marks it', async () => {
    const silence = vi.spyOn(console, 'warn').mockImplementation(() => {});
    supabaseMock.rpc.mockImplementation(async (fn) => (fn === 'reserve_trip_voucher'
      ? { data: null, error: { message: 'VOUCHER_USED_UP' } }
      : { data: {}, error: null }));
    bookingProvider(booked);
    const { place, table } = await appWith([withVoucher(REF)]);

    const res = await place(REF);

    expect(res.body.success).toBe(true);
    expect(res.body.tripReward).toBeUndefined();
    expect(table.row(REF).booking_details.pnr).toBe('NEW999');
    expect(table.row(REF).booking_details.wallet_issue).toMatchObject({ kind: 'voucher_refused', code: 'SHUBHAM', reason: 'VOUCHER_USED_UP' });
    expect(table.row(REF).booking_details.trip_reward).toBeUndefined();
    silence.mockRestore();
  });

  it('reserves the reward when the airline holds the booking but ticketing failed', async () => {
    supabaseMock.rpc.mockImplementation(async (fn) => ({ data: fn === 'reserve_trip_voucher' ? reserved : {}, error: null }));
    bookingProvider(() => {
      throw Object.assign(new Error('ticketing refused'), { committed: true, pnr: 'NEW999', step: 'issueTicket', ticketed: false });
    });
    const { place } = await appWith([withVoucher(REF)]);

    const res = await place(REF);

    expect(res.status).toBe(202);
    expect(calls('reserve_trip_voucher')).toHaveLength(1);
    expect(calls('void_trip_voucher')).toHaveLength(0);
  });

  it('voids the reward when the payment is reversed after a failed booking', async () => {
    bookingProvider(booked, { bookingEnabled: false });
    const { place } = await appWith([withVoucher(REF)]);

    await place(REF);

    expect(calls('void_trip_voucher')).toEqual([['void_trip_voucher', { p_ref: REF }]]);
    expect(calls('reserve_trip_voucher')).toHaveLength(0);
  });

  it('voids the reward of a second payment', async () => {
    bookingProvider(booked);
    const { place } = await appWith([bookedFirst(), withVoucher(REF)]);

    const res = await place(REF);

    expect(res.body.code).toBe('DUPLICATE_PAYMENT');
    expect(calls('void_trip_voucher')).toEqual([['void_trip_voucher', { p_ref: REF }]]);
  });
});
