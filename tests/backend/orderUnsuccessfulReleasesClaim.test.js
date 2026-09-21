import express from 'express';
import request from 'supertest';
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
 * A chain that answered unsuccessfully lets go of the booking before refunding.
 *
 * A provider that throws releases the chain claim before the refund - "without
 * this the claim sits at in_progress until the TTL expires". The two refunds
 * for a provider that answered without throwing - an unsuccessful answer, and
 * a MOCK booking in production - did not, so the refunded booking read as
 * still being confirmed for the claim's lifetime. Anything that asks whether
 * the booking is being worked on (a duplicate check for the same trip, a
 * cancellation) was told yes.
 */

const REF = 'FLTREL01';
const INDICATOR = 'SI-REL-1';

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
      carrierCode: 'BA', number: '178', aircraft: { code: '777' }, numberOfStops: 0,
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

const JANE = { firstName: 'Jane', lastName: 'Doe', gender: 'female', dateOfBirth: '1990-01-01', type: 'ADULT' };

const checkoutRow = () => ({
  id: 1,
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  booking_details: {
    order_id: REF,
    success_indicator: INDICATOR,
    customer_email: 'jane@example.com',
    arc_captured_amount: 291,
    arc_captured_currency: 'USD',
    pending_booking_data: { bookingData: { originalOffer: offer, passengerData: [JANE] } },
    verified_charge: { total: 291, pricedFare: { total: 291, currency: 'USD' }, verifiedAt: new Date().toISOString() },
  },
});

const order = {
  bookingReference: REF,
  orderId: REF,
  transactionId: INDICATOR,
  contactInfo: { email: 'jane@example.com', countryCode: '1', phoneNumber: '5551234567' },
  travelers: [{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', gender: 'FEMALE' }],
};

const answering = (orderResponse) => vi.doMock('../../backend/services/flightProvider.js', () => ({
  default: {
    priceFlightOffer: vi.fn(async (priced) => ({
      success: true,
      data: { flightOffers: [{ ...priced, price: { currency: 'USD', total: '291.00', grandTotal: '291.00', base: '110.00' } }] },
    })),
    createFlightOrder: vi.fn(async () => orderResponse),
  },
  providerStatus: () => ({ bookingEnabled: true, wsap: '1ASIWTEST' }),
}));

const appWith = async (rows) => {
  const table = fakeBookingsTable(rows);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  return { app, table };
};

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWTEST');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
  vi.resetModules();
  const mailer = { sendBookingNotificationEmails: vi.fn().mockResolvedValue({ success: true }), sendEmail: vi.fn(), sendCancellationNotificationEmails: vi.fn() };
  vi.doMock('../../backend/services/emailService.js', () => ({ ...mailer, default: mailer }));
});

afterEach(() => {
  vi.doUnmock('../../backend/services/emailService.js');
  vi.doUnmock('../../backend/services/flightProvider.js');
});

describe('a refund for a chain that answered without throwing', () => {
  it('releases the claim when the provider answered unsuccessfully', async () => {
    answering({ success: false, error: 'Amadeus service returned unsuccessful response' });
    const { app, table } = await appWith([checkoutRow()]);

    const res = await request(app).post('/api/flights/order').send(order);

    expect(res.body.success).toBe(false);
    expect(res.body.bookingFailed).toBe(true);
    expect(table.row(REF).booking_details.gds_chain.state).toBe('failed');
  });

  it('releases the claim for a MOCK booking in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    answering({ success: true, mode: 'MOCK_BOOKING', pnr: null });
    const { app, table } = await appWith([checkoutRow()]);

    const res = await request(app).post('/api/flights/order').send(order);

    expect(res.body.bookingFailed).toBe(true);
    expect(table.row(REF).booking_details.gds_chain.state).toBe('failed');
  });
});
