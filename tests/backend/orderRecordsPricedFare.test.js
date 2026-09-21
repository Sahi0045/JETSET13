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
 * The booking record states the fare that was priced and charged, not the one
 * the search quoted.
 *
 * The order route books the offer as the airline priced it - fare basis, class,
 * cabin and checked bags per flight come from the pricing reply
 * (mappers/pricing.js), and the fare from checkout's verified figure. The
 * record was then written from the search offer: its grand total, a fee list
 * that is always empty on a search offer, its cabin and its baggage. A fare
 * that moved between search and checkout was charged at one figure and
 * recorded at another, and a 50 LB allowance the airline priced was stored as
 * the search's 23 KG.
 */

const REF = 'FLTPRC01';
const INDICATOR = 'SI-PRC-1';

const searched = {
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
  price: { currency: 'USD', total: '291.00', grandTotal: '291.00', base: '110.00', fees: [] },
  travelerPricings: [{
    travelerId: '1', fareOption: 'STANDARD', travelerType: 'ADULT',
    price: { currency: 'USD', total: '291.00', base: '110.00' },
    fareDetailsBySegment: [{
      segmentId: '1', cabin: 'ECONOMY', fareBasis: 'XJ1QUSLT', class: 'X',
      includedCheckedBags: { weight: 23, weightUnit: 'KG' },
    }],
  }],
  _ama: { wsap: '1ASIWTEST', searchedAt: new Date().toISOString(), segments: [], refundable: false },
};

// What the airline priced at checkout and again at the order: a dearer fare,
// booked in premium economy with a 50 LB allowance.
const priced = {
  ...searched,
  price: {
    currency: 'USD', total: '305.50', grandTotal: '305.50', base: '120.00',
    fees: [{ amount: '185.50', type: 'TAX', code: 'US' }],
  },
  travelerPricings: [{
    ...searched.travelerPricings[0],
    price: { currency: 'USD', total: '305.50', base: '120.00' },
    fareDetailsBySegment: [{
      segmentId: '1', cabin: 'PREMIUM_ECONOMY', fareBasis: 'WJ1QUSLT', class: 'W',
      includedCheckedBags: { weight: 50, weightUnit: 'LB' },
    }],
  }],
};

const checkoutRow = () => ({
  id: 1,
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 306.5,
  user_id: null,
  booking_details: {
    order_id: REF,
    success_indicator: INDICATOR,
    customer_email: 'jane@example.com',
    arc_captured_amount: 306.5,
    arc_captured_currency: 'USD',
    pending_booking_data: {
      bookingData: {
        originalOffer: searched,
        passengerData: [{ firstName: 'Jane', lastName: 'Doe', gender: 'female', dateOfBirth: '1990-01-01', type: 'ADULT' }],
      },
    },
    verified_charge: { total: 306.5, pricedFare: { total: 305.5, base: 120, currency: 'USD' }, verifiedAt: new Date().toISOString() },
  },
});

const order = {
  bookingReference: REF,
  orderId: REF,
  transactionId: INDICATOR,
  contactInfo: { email: 'jane@example.com', countryCode: '1', phoneNumber: '5551234567' },
  travelers: [{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', gender: 'FEMALE' }],
};

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
  vi.doMock('../../backend/services/flightProvider.js', () => ({
    default: {
      priceFlightOffer: vi.fn(async () => ({ success: true, data: { flightOffers: [priced] } })),
      createFlightOrder: vi.fn(async (_orderData, options) => {
        await options.onCommitted({ pnr: 'PRCD42', tstRefs: ['1'], priced: { total: 305.5, currency: 'USD' } });
        return { success: true, pnr: 'PRCD42', orderId: 'PRCD42', ticketed: false, tickets: [], mode: 'LIVE_GDS_BOOKING' };
      }),
    },
    providerStatus: () => ({ bookingEnabled: true, wsap: '1ASIWTEST' }),
  }));
});

afterEach(() => {
  vi.doUnmock('../../backend/services/emailService.js');
  vi.doUnmock('../../backend/services/flightProvider.js');
});

describe('the booking record after the airline priced the fare', () => {
  it('records the fare checkout charged for, not the search quote', async () => {
    const { app, table } = await appWith([checkoutRow()]);

    const res = await request(app).post('/api/flights/order').send(order);

    expect(res.body.success).toBe(true);
    const details = table.row(REF).booking_details;
    expect(Number(details.price_grand_total)).toBe(305.5);
    expect(Number(details.price_base)).toBe(120);
    expect(details.price_fees).toEqual([{ amount: '185.50', type: 'TAX', code: 'US' }]);
  });

  it('records the cabin, baggage and offer the airline priced', async () => {
    const { app, table } = await appWith([checkoutRow()]);

    await request(app).post('/api/flights/order').send(order);

    const details = table.row(REF).booking_details;
    expect(details.cabin_class).toBe('PREMIUM_ECONOMY');
    expect(details.baggage).toBe('50LB');
    expect(details.baggage_details.checked).toEqual({ weight: 50, weightUnit: 'LB' });
    expect(details.flight_offer.price.grandTotal).toBe('305.50');
    expect(details.itineraries[0].segments[0].cabin).toBe('PREMIUM_ECONOMY');
  });
});
