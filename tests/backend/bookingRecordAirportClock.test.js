import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
 * The departure and arrival times the booking record keeps, as the airports'
 * clocks read them, whatever time zone the server runs in.
 *
 * The order route wrote `departure_time` / `arrival_time` with
 * `new Date(at).toLocaleTimeString()`: the airline's airport-local time read
 * through the SERVER's zone. My Trips, Manage Booking, the travel document and
 * the confirmation email print those fields as stored. Production runs in UTC,
 * which has no clock change, so the times came out right by accident; a server
 * in a zone with one stored a 02:40 departure on its spring-forward day as
 * 03:40, for good.
 *
 * 14 Mar 2027 is the day New York springs forward (02:00 -> 03:00).
 */

const REF = 'FLTCLK01';
const INDICATOR = 'SI-CLK-1';

const offerFor = (segments) => ({
  type: 'flight-offer',
  id: '1',
  source: 'GDS',
  itineraries: [{ duration: 'PT2H', segments }],
  price: { currency: 'USD', total: '291.00', grandTotal: '291.00', base: '110.00', fees: [] },
  travelerPricings: [{
    travelerId: '1', fareOption: 'STANDARD', travelerType: 'ADULT',
    price: { currency: 'USD', total: '291.00', base: '110.00' },
    fareDetailsBySegment: segments.map((s) => ({ segmentId: s.id, cabin: 'ECONOMY', fareBasis: 'XJ1QUSLT', class: 'X' })),
  }],
  _ama: { wsap: '1ASIWTEST', searchedAt: new Date().toISOString(), segments: [], refundable: false },
});

const flight = (id, from, to, dep, arr) => ({
  id, carrierCode: 'AI', number: `10${id}`, aircraft: { code: '320' }, numberOfStops: 0,
  departure: { iataCode: from, at: dep },
  arrival: { iataCode: to, at: arr },
});

const checkoutRow = (offer) => ({
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
    pending_booking_data: {
      bookingData: {
        originalOffer: offer,
        passengerData: [{ firstName: 'Jane', lastName: 'Doe', gender: 'female', dateOfBirth: '1990-01-01', type: 'ADULT' }],
      },
    },
    verified_charge: { total: 291, pricedFare: { total: 291, base: 110, currency: 'USD' }, verifiedAt: new Date().toISOString() },
  },
});

const order = {
  bookingReference: REF,
  orderId: REF,
  transactionId: INDICATOR,
  contactInfo: { email: 'jane@example.com', countryCode: '1', phoneNumber: '5551234567' },
  travelers: [{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', gender: 'FEMALE' }],
};

/** Books `segments` through the order route and returns the stored booking_details. */
async function bookedDetails(segments) {
  const offer = offerFor(segments);
  vi.doMock('../../backend/services/flightProvider.js', () => ({
    default: {
      priceFlightOffer: vi.fn(async () => ({ success: true, data: { flightOffers: [offer] } })),
      createFlightOrder: vi.fn(async (_orderData, options) => {
        await options.onCommitted({ pnr: 'CLKD42', tstRefs: ['1'], priced: { total: 291, currency: 'USD' } });
        return { success: true, pnr: 'CLKD42', orderId: 'CLKD42', ticketed: false, tickets: [], mode: 'LIVE_GDS_BOOKING' };
      }),
    },
    providerStatus: () => ({ bookingEnabled: true, wsap: '1ASIWTEST' }),
  }));
  const table = fakeBookingsTable([checkoutRow(offer)]);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);

  const res = await request(app).post('/api/flights/order').send(order);
  expect(res.body.success).toBe(true);
  return table.row(REF).booking_details;
}

let originalTz;
beforeAll(() => {
  originalTz = process.env.TZ;
  process.env.TZ = 'America/New_York';
});
afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

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

describe('the booking record, written by a server in New York on its spring-forward day', () => {
  it("keeps a 02:40 departure as the airport's clock reads it, not 03:40", async () => {
    const details = await bookedDetails([flight('1', 'DEL', 'BOM', '2027-03-14T02:40:00', '2027-03-14T04:40:00')]);

    expect(details.departure_time).toBe('2:40 AM');
    expect(details.arrival_time).toBe('4:40 AM');
  });

  it("keeps a 02:50 arrival as the airport's clock reads it, not 03:50", async () => {
    const details = await bookedDetails([flight('1', 'BOM', 'DEL', '2027-03-14T00:35:00', '2027-03-14T02:50:00')]);

    expect(details.departure_time).toBe('12:35 AM');
    expect(details.arrival_time).toBe('2:50 AM');
  });

  it('reads a connection from its first departure and its last arrival', async () => {
    const details = await bookedDetails([
      flight('1', 'DEL', 'BOM', '2027-03-14T02:40:00', '2027-03-14T04:40:00'),
      flight('2', 'BOM', 'GOI', '2027-03-14T06:00:00', '2027-03-14T07:15:00'),
    ]);

    expect(details.departure_time).toBe('2:40 AM');
    expect(details.arrival_time).toBe('7:15 AM');
    // The legs every page draws were already the airport's clock.
    expect(details.itineraries[0].segments[0].departureTime).toBe('02:40');
  });
});

describe('the booking record on an ordinary day, as before', () => {
  it('keeps an evening departure and a next-morning arrival', async () => {
    const details = await bookedDetails([flight('1', 'JFK', 'LHR', '2026-11-15T19:25:00', '2026-11-16T06:10:00')]);

    expect(details.departure_time).toMatch(/^0?7:25 PM$/);
    expect(details.arrival_time).toMatch(/^0?6:10 AM$/);
    expect(details.departure_date).toBe('2026-11-15');
  });

  it('keeps a noon departure as 12:30 PM', async () => {
    const details = await bookedDetails([flight('1', 'DEL', 'BOM', '2026-11-15T12:30:00', '2026-11-15T14:35:00')]);

    expect(details.departure_time).toBe('12:30 PM');
    expect(details.arrival_time).toMatch(/^0?2:35 PM$/);
  });
});
