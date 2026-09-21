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
 * The order route books the travellers checkout verified, not the ones the
 * request carries.
 *
 * Checkout checks every traveller against the fare before the card is charged -
 * a name the airline can print, a date of birth, and a passport on a trip
 * abroad - and keeps them on the booking row. POST /order then booked whatever
 * `travelers` its own body held, and checked only for names, a gender and a
 * date of birth. A body with the same people and no passports passed, the chain
 * sold and committed the PNR, and the airline would not ticket it without the
 * travel document: a charge, a committed PNR and a refund.
 */

const REF = 'FLTPAX01';
const INDICATOR = 'SI-PAX-1';

const abroad = {
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

// Who checkout verified and charged for.
const JANE = {
  firstName: 'Jane', lastName: 'Doe', gender: 'female', dateOfBirth: '1990-01-01', type: 'ADULT',
  nationality: 'US', passportNumber: 'X1234567', passportExpiry: '2031-01-01',
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
    pending_booking_data: { bookingData: { originalOffer: abroad, passengerData: [JANE] } },
    verified_charge: { total: 291, pricedFare: { total: 291, currency: 'USD' }, verifiedAt: new Date().toISOString() },
  },
  passenger_details: [JANE],
});

const orderWith = (travelers) => ({
  bookingReference: REF,
  orderId: REF,
  transactionId: INDICATOR,
  contactInfo: { email: 'jane@example.com', countryCode: '1', phoneNumber: '5551234567' },
  travelers,
});

const createFlightOrder = vi.fn();

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
  createFlightOrder.mockReset();
  createFlightOrder.mockImplementation(async (_orderData, options) => {
    await options.onCommitted({ pnr: 'PAXS42', tstRefs: ['1'], priced: { total: 291, currency: 'USD' } });
    return { success: true, pnr: 'PAXS42', orderId: 'PAXS42', ticketed: false, tickets: [], mode: 'LIVE_GDS_BOOKING' };
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
});

afterEach(() => {
  vi.doUnmock('../../backend/services/emailService.js');
  vi.doUnmock('../../backend/services/flightProvider.js');
});

const booked = () => createFlightOrder.mock.calls[0][0].data.travelers;

describe('the travellers the order route books', () => {
  it('are the ones checkout verified, passport and all, when the request drops the passport', async () => {
    const { app } = await appWith([checkoutRow()]);

    const res = await request(app).post('/api/flights/order')
      .send(orderWith([{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', gender: 'FEMALE' }]));

    expect(res.body.success).toBe(true);
    expect(createFlightOrder).toHaveBeenCalledTimes(1);
    expect(booked()).toHaveLength(1);
    expect(booked()[0].documents?.[0]).toMatchObject({ number: 'X1234567', nationality: 'US', expiryDate: '2031-01-01' });
  });

  it('are the ones checkout verified when the request names somebody else', async () => {
    const { app, table } = await appWith([checkoutRow()]);

    const mallory = { id: '1', firstName: 'Mallory', lastName: 'Other', dateOfBirth: '1980-05-05', gender: 'MALE' };
    const res = await request(app).post('/api/flights/order')
      .send({ ...orderWith([mallory]), passengerDetails: [mallory] });

    expect(res.body.success).toBe(true);
    expect(booked()[0]).toMatchObject({
      name: { firstName: 'Jane', lastName: 'Doe' },
      dateOfBirth: '1990-01-01',
      gender: 'FEMALE',
    });
    // And the booking record names who was booked.
    const saved = table.row(REF);
    expect(saved.booking_details.pnr).toBe('PAXS42');
    expect(JSON.stringify(saved)).toContain('X1234567');
    expect(JSON.stringify(saved)).not.toContain('Mallory');
  });
});
