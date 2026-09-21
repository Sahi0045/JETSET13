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
 * The failure records written around a reversal keep what landed in between.
 *
 * refundOnFulfillmentFailure writes booking_details twice - `fulfillment_failed`
 * before the gateway is asked, and the outcome after - each time as the whole
 * column, from a copy it had just read, with no compare-and-set. Whatever
 * another writer put on the row between that read and that write was erased:
 * a payment reconcile's captured amount, or a record locator a running chain
 * had just committed - "a reservation nobody can find again".
 */

const REF = 'FLTCAS01';
const INDICATOR = 'SI-CAS-1';

const offer = {
  type: 'flight-offer',
  id: '1',
  source: 'GDS',
  itineraries: [{ segments: [{ id: '1', departure: { iataCode: 'JFK', at: '2026-11-15T19:25:00' }, arrival: { iataCode: 'LHR', at: '2026-11-16T06:10:00' }, carrierCode: 'BA', number: '178' }] }],
  price: { currency: 'USD', total: '291.00', base: '110.00' },
  travelerPricings: [{ travelerId: '1', travelerType: 'ADULT', price: { currency: 'USD', total: '291.00' }, fareDetailsBySegment: [{ segmentId: '1', cabin: 'ECONOMY' }] }],
  _ama: { wsap: '1ASIWTEST', segments: [] },
};

const checkoutRow = () => ({
  id: 1,
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  created_at: new Date().toISOString(),
  booking_details: {
    order_id: REF,
    success_indicator: INDICATOR,
    customer_email: 'jane@example.com',
    arc_captured_amount: 291,
    arc_captured_currency: 'USD',
    pending_booking_data: { bookingData: { originalOffer: offer, passengerData: [{ firstName: 'Jane', lastName: 'Doe', gender: 'female', dateOfBirth: '1990-01-01' }] } },
    verified_charge: { total: 291, pricedFare: { total: 291, currency: 'USD' }, verifiedAt: new Date().toISOString() },
  },
});

const order = { bookingReference: REF, orderId: REF, transactionId: INDICATOR };

let table = null;

const appWith = async (rows, fail) => {
  table = fakeBookingsTable(rows, { fail });
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  return app;
};

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWTEST');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.resetModules();
  // Booking switched off: the order route refunds before anything is sold,
  // which is the shortest way into refundOnFulfillmentFailure.
  vi.doMock('../../backend/services/flightProvider.js', () => ({
    default: { priceFlightOffer: vi.fn(), createFlightOrder: vi.fn() },
    providerStatus: () => ({ bookingEnabled: false, wsap: '1ASIWTEST' }),
  }));
});

afterEach(() => {
  vi.doUnmock('../../backend/services/flightProvider.js');
});

const recordsFailure = (patch, action) => patch?.booking_details?.fulfillment_failed?.reversal
  && (action === 'IN_PROGRESS') === (patch.booking_details.fulfillment_failed.reversal.action === 'IN_PROGRESS');

describe('the failure records around a reversal', () => {
  it('keep what another writer put on the booking just before the first one', async () => {
    let landed = false;
    const app = await appWith([checkoutRow()], ({ patch }) => {
      if (!landed && recordsFailure(patch, 'IN_PROGRESS')) {
        landed = true;
        // A running chain's persistCommittedPnr, say.
        table.row(REF).booking_details.pnr = 'LATE42';
      }
      return false;
    });

    const res = await request(app).post('/api/flights/order').send(order);

    expect(res.body.code).toBe('BOOKING_DISABLED');
    const details = table.row(REF).booking_details;
    expect(details.pnr).toBe('LATE42');
    expect(details.fulfillment_failed).toBeTruthy();
  });

  it('keep what another writer put on the booking just before the second one', async () => {
    let landed = false;
    const app = await appWith([checkoutRow()], ({ patch }) => {
      if (!landed && patch?.booking_details?.fulfillment_failed && !recordsFailure(patch, 'IN_PROGRESS')) {
        landed = true;
        // A record locator committed while the payment was on its way back.
        table.row(REF).booking_details.pnr = 'LATE43';
      }
      return false;
    });

    const res = await request(app).post('/api/flights/order').send(order);

    expect(res.body.code).toBe('BOOKING_DISABLED');
    const row = table.row(REF);
    // The outcome is recorded - from the row as it is now.
    expect(row.booking_details.fulfillment_failed.reversal.action).not.toBe('IN_PROGRESS');
    expect(row.booking_details.pnr).toBe('LATE43');
    expect(table.writes.filter((w) => w.patch?.booking_details?.fulfillment_failed).every((w) => w.matched <= 1)).toBe(true);
  });
});
