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
 * Where POST /order sends the booking's first confirmation email.
 *
 * It took the order's contact email first, whatever it held. A signed-in
 * customer who typed "jane@gmailcom" on the review page had it sent there -
 * checkout had recorded the account's address as customer_email, and the
 * email never reached it. An address that is not usable is now passed over
 * for the next one that is: the order's customerEmail, the lead traveller's,
 * then the one checkout recorded.
 */

const REF = 'FLTADDR1';
const INDICATOR = 'SI-ADDR-1';

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

/** A paid checkout, verified for this offer, not yet booked; checkout recorded the account's address. */
const checkoutRow = (lead = {}) => ({
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
    customer_email: 'jane@gmail.com',
    arc_captured_amount: 291,
    arc_captured_currency: 'USD',
    pending_booking_data: { bookingData: { originalOffer: bookableOffer, passengerData: [{ firstName: 'Jane', lastName: 'Doe', gender: 'FEMALE', dateOfBirth: '1990-01-01', ...lead }] } },
    verified_charge: { total: 291, pricedFare: { total: 291, currency: 'USD' }, verifiedAt: new Date().toISOString() },
  },
});

const order = (over = {}) => ({
  bookingReference: REF,
  orderId: REF,
  transactionId: INDICATOR,
  contactInfo: { email: 'jane@gmailcom', countryCode: '1', phoneNumber: '5551234567' },
  travelers: [{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', gender: 'FEMALE' }],
  ...over,
});

const send = vi.fn();

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
  send.mockReset();
  send.mockResolvedValue({ success: true });
  const mailer = { sendBookingNotificationEmails: send, sendEmail: vi.fn(), sendCancellationNotificationEmails: vi.fn() };
  vi.doMock('../../backend/services/emailService.js', () => ({ ...mailer, default: mailer }));
  vi.doMock('../../backend/services/flightProvider.js', () => ({
    default: {
      priceFlightOffer: vi.fn(async (offer) => ({
        success: true,
        data: { flightOffers: [{ ...offer, price: { currency: 'USD', total: '291.00', grandTotal: '291.00', base: '110.00' } }] },
      })),
      createFlightOrder: vi.fn(async (_orderData, options) => {
        await options.onCommitted({ pnr: 'ABC123', tstRefs: ['1'], priced: { total: 291, currency: 'USD' } });
        return { success: true, pnr: 'ABC123', orderId: 'ABC123', ticketed: false, tickets: [], mode: 'LIVE_GDS_BOOKING' };
      }),
    },
    providerStatus: () => ({ bookingEnabled: true, wsap: '1ASIWTEST' }),
  }));
});

afterEach(() => {
  vi.doUnmock('../../backend/services/emailService.js');
  vi.doUnmock('../../backend/services/flightProvider.js');
});

/** Books the checkout with this order body; the address the confirmation went to. */
const recipientFor = async (body, row = checkoutRow()) => {
  const { app } = await appWith([row]);
  const res = await request(app).post('/api/flights/order').send(body);
  expect(res.body.success).toBe(true);
  expect(send).toHaveBeenCalledTimes(1);
  return send.mock.calls[0][0].customerEmail;
};

describe("the booking's first confirmation email", () => {
  it('passes over a contact email that is not usable, for the address checkout recorded', async () => {
    expect(await recipientFor(order())).toBe('jane@gmail.com');
  });

  it("passes over it for the order's customerEmail first", async () => {
    expect(await recipientFor(order({ customerEmail: 'jane.b@example.com' }))).toBe('jane.b@example.com');
  });

  it("passes over it for the lead traveller's email next", async () => {
    // The travellers come from what checkout verified, not from the order body.
    expect(await recipientFor(order(), checkoutRow({ email: 'jane.t@example.com' }))).toBe('jane.t@example.com');
  });

  it('still goes to a usable contact email first', async () => {
    expect(await recipientFor(order({ contactInfo: { email: 'jane.work@example.com', countryCode: '1', phoneNumber: '5551234567' } })))
      .toBe('jane.work@example.com');
  });
});
