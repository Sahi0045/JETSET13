import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  const chain = {};
  for (const m of ['select', 'update', 'insert', 'upsert', 'eq', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.maybeSingle = chain.single;
  return { ...actual, supabase: { from: vi.fn(() => chain) } };
});

const REF = 'FLTLOC01';
const INDICATOR = 'SI-LOC-1';

const offer = {
  type: 'flight-offer',
  id: '1',
  source: 'GDS',
  itineraries: [{
    duration: 'PT6H',
    segments: [{
      id: '1', carrierCode: 'UA', number: '20', aircraft: { code: '789' }, numberOfStops: 0,
      departure: { iataCode: 'SFO', at: '2026-12-01T10:00:00' },
      arrival: { iataCode: 'EWR', at: '2026-12-01T18:30:00' },
    }],
  }],
  price: { currency: 'USD', total: '291.00', grandTotal: '291.00', base: '110.00', fees: [] },
  travelerPricings: [{
    travelerId: '1', fareOption: 'STANDARD', travelerType: 'ADULT',
    price: { currency: 'USD', total: '291.00', base: '110.00' },
    fareDetailsBySegment: [{ segmentId: '1', cabin: 'ECONOMY', fareBasis: 'XJ1QUSLT', class: 'X' }],
  }],
  _ama: { wsap: '1ASIWTEST', searchedAt: new Date().toISOString(), segments: [], refundable: false },
};

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

async function savedDetails(providerAnswer) {
  vi.doMock('../../backend/services/flightProvider.js', () => ({
    default: {
      priceFlightOffer: vi.fn(async () => ({ success: true, data: { flightOffers: [offer] } })),
      createFlightOrder: vi.fn(async (_orderData, options) => {
        await options.onCommitted({ pnr: 'Q7XK2M', tstRefs: ['1'], priced: { total: 291, currency: 'USD' } });
        return { success: true, pnr: 'Q7XK2M', orderId: 'Q7XK2M', ticketed: false, tickets: [], mode: 'LIVE_GDS_BOOKING', ...providerAnswer };
      }),
    },
    providerStatus: () => ({ bookingEnabled: true, wsap: '1ASIWTEST' }),
  }));
  const table = fakeBookingsTable([checkoutRow()]);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);

  const res = await request(app).post('/api/flights/order').send(order);
  expect(res.body.success).toBe(true);
  return { ...table.row(REF).booking_details, answered: res.body.airlineLocators };
}

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

describe("the booking keeps the airline's own booking code", () => {
  it('saves it beside our Amadeus code', async () => {
    const details = await savedDetails({ airlineLocators: [{ carrierCode: 'UA', locator: 'H8KQ2P' }] });

    expect(details.pnr).toBe('Q7XK2M');
    expect(details.airline_locators).toEqual([{ carrierCode: 'UA', locator: 'H8KQ2P' }]);
    expect(details.answered).toEqual([{ carrierCode: 'UA', locator: 'H8KQ2P' }]);
  });

  it('saves an empty list while the airline has not sent one', async () => {
    const details = await savedDetails({});

    expect(details.airline_locators).toEqual([]);
  });
});

describe("the booking the pages read carries the airline's code", () => {
  it('as airlineLocators', async () => {
    const { toClientBooking } = await import('../../backend/routes/flight.routes.js');
    const view = toClientBooking({
      booking_reference: REF,
      travel_type: 'flight',
      status: 'confirmed',
      booking_details: { pnr: 'Q7XK2M', airline_locators: [{ carrierCode: 'UA', locator: 'H8KQ2P' }] },
    });

    expect(view.pnr).toBe('Q7XK2M');
    expect(view.airlineLocators).toEqual([{ carrierCode: 'UA', locator: 'H8KQ2P' }]);
  });

  it('as an empty list for a booking saved before it was kept', async () => {
    const { toClientBooking } = await import('../../backend/routes/flight.routes.js');
    const view = toClientBooking({ booking_reference: REF, travel_type: 'flight', status: 'confirmed', booking_details: { pnr: 'Q7XK2M' } });

    expect(view.airlineLocators).toEqual([]);
  });
});
