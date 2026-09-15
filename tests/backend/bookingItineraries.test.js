import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { itinerariesFromOffer } from '../../shared/bookingItineraries.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

// See confirmationEmailRetry.test.js: the payment handlers take their Supabase
// client from arcpay.config.js.
vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  const chain = {};
  for (const m of ['select', 'update', 'insert', 'upsert', 'eq', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.maybeSingle = chain.single;
  return { ...actual, supabase: { from: vi.fn(() => chain) } };
});

/**
 * A round trip's return flight, and each flight of a connection, after payment.
 *
 * The order route saved the first leg's first departure and last arrival and
 * nothing else; toClientBooking had no return fields; the confirmation email
 * drew one flight. So a round trip's return flight was recorded, sent and
 * emailed nowhere.
 */

const REF = 'FLTLEGS1';
const INDICATOR = 'SI-LEGS-1';

const segment = (id, from, to, depAt, arrAt, carrier, number, terminals = {}) => ({
  id,
  departure: { iataCode: from, at: depAt, ...(terminals.dep ? { terminal: terminals.dep } : {}) },
  arrival: { iataCode: to, at: arrAt, ...(terminals.arr ? { terminal: terminals.arr } : {}) },
  carrierCode: carrier, number, aircraft: { code: '7M9' }, operating: { carrierCode: carrier }, numberOfStops: 0,
});

const roundTripOffer = {
  type: 'flight-offer',
  id: '1',
  source: 'GDS',
  itineraries: [
    {
      duration: 'PT10H40M',
      segments: [
        segment('1', 'JFK', 'KEF', '2026-11-15T19:25:00', '2026-11-16T05:05:00', 'FI', '614', { dep: '1' }),
        segment('2', 'KEF', 'LHR', '2026-11-16T07:40:00', '2026-11-16T11:05:00', 'FI', '450', { arr: '2' }),
      ],
    },
    {
      duration: 'PT8H10M',
      segments: [segment('3', 'LHR', 'JFK', '2026-11-22T13:00:00', '2026-11-22T16:10:00', 'BA', '117', { dep: '2', arr: '7' })],
    },
  ],
  price: { currency: 'USD', total: '291.00', base: '110.00' },
  travelerPricings: [{
    travelerId: '1', fareOption: 'STANDARD', travelerType: 'ADULT',
    price: { currency: 'USD', total: '291.00', base: '110.00' },
    fareDetailsBySegment: ['1', '2', '3'].map((segmentId) => ({ segmentId, cabin: 'ECONOMY', fareBasis: 'XJ1QUSLT', class: 'X' })),
  }],
  _ama: { wsap: '1ASIWTEST', searchedAt: new Date().toISOString(), segments: [] },
};

const legs = itinerariesFromOffer(roundTripOffer);

const checkoutRow = (over = {}) => ({
  id: 1,
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  created_at: '2026-09-15T10:00:00Z',
  ...over,
  booking_details: {
    order_id: REF,
    success_indicator: INDICATOR,
    customer_email: 'jane@example.com',
    arc_captured_amount: 291,
    arc_captured_currency: 'USD',
    pending_booking_data: { bookingData: { originalOffer: roundTripOffer, passengerData: [{ firstName: 'Jane', lastName: 'Doe' }] } },
    verified_charge: { total: 291, pricedFare: { total: 291, currency: 'USD' }, verifiedAt: new Date().toISOString() },
    ...(over.booking_details || {}),
  },
});

const order = {
  bookingReference: REF,
  orderId: REF,
  transactionId: INDICATOR,
  contactInfo: { email: 'jane@example.com', countryCode: '1', phoneNumber: '5551234567' },
  travelers: [{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', gender: 'FEMALE' }],
};

const send = vi.fn();

/** The route, over an in-memory bookings table that also records every insert. */
const appWith = async (rows) => {
  const table = fakeBookingsTable(rows);
  const inserted = [];
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation((name) => {
    const chain = table.from(name);
    const insert = chain.insert;
    chain.insert = (row) => { inserted.push(row); return insert(row); };
    return chain;
  });
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  return { app, table, inserted };
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
});

afterEach(() => {
  vi.doUnmock('../../backend/services/emailService.js');
  vi.doUnmock('../../backend/services/flightProvider.js');
});

describe('the order route saves every leg', () => {
  it('hands the return leg and each flight of the connection to the booking row', async () => {
    vi.doMock('../../backend/services/flightProvider.js', () => ({
      default: {
        priceFlightOffer: vi.fn(async (offer) => ({
          success: true,
          data: { flightOffers: [{ ...offer, price: { currency: 'USD', total: '291.00', grandTotal: '291.00', base: '110.00' } }] },
        })),
        createFlightOrder: vi.fn(async (_orderData, options) => {
          await options.onCommitted({ pnr: 'LEGS42', tstRefs: ['1'], priced: { total: 291, currency: 'USD' } });
          return { success: true, pnr: 'LEGS42', orderId: 'LEGS42', ticketed: false, tickets: [], mode: 'LIVE_GDS_BOOKING' };
        }),
      },
      providerStatus: () => ({ bookingEnabled: true, wsap: '1ASIWTEST' }),
    }));
    const { app, inserted } = await appWith([checkoutRow()]);

    const res = await request(app).post('/api/flights/order').send(order);

    expect(res.body.success).toBe(true);
    const saved = inserted.find((row) => row?.booking_details?.pnr === 'LEGS42');
    expect(saved.booking_details.itineraries.map((leg) => `${leg.direction} ${leg.origin}-${leg.destination}`))
      .toEqual(['outbound JFK-LHR', 'return LHR-JFK']);
    expect(saved.booking_details.itineraries[0].segments.map((s) => s.flightNumber)).toEqual(['FI614', 'FI450']);
    expect(saved.booking_details.itineraries[1].segments[0]).toMatchObject({ flightNumber: 'BA117', departureTerminal: '2', arrivalTerminal: '7' });
    // The flat first-leg fields stay for the clients that read them.
    expect(saved.booking_details).toMatchObject({ origin: 'JFK', destination: 'LHR', flight_number: 'FI614' });
  });

  it('a retry of a booked round trip emails both legs', async () => {
    const { app } = await appWith([checkoutRow({ status: 'pending_ticketing', booking_details: { pnr: 'LEGS42', gds: { ticketed: false } } })]);

    const res = await request(app).post('/api/flights/order').send(order);

    expect(res.body.mode).toBe('ALREADY_BOOKED');
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0][0].bookingDetails.itineraries).toHaveLength(2);
  });
});

describe('what the bookings API sends', () => {
  const flightRow = (details) => ({ id: 'b1', travel_type: 'flight', booking_reference: REF, status: 'pending_ticketing', payment_status: 'paid', booking_details: details });

  it('sends the saved legs and the return date', async () => {
    const { toClientBooking } = await import('../../backend/routes/flight.routes.js');
    const out = toClientBooking(flightRow({ pnr: 'LEGS42', itineraries: legs }));

    expect(out.itineraries).toEqual(legs);
    expect(out.returnDate).toBe('2026-11-22');
  });

  it('rebuilds them for a booking saved before legs were kept, carrying no traveller data', async () => {
    const { toClientBooking } = await import('../../backend/routes/flight.routes.js');

    expect(toClientBooking(flightRow({ flight_offer: roundTripOffer })).itineraries).toHaveLength(2);
    const fromCheckout = toClientBooking(checkoutRow());
    expect(fromCheckout.itineraries).toHaveLength(2);
    expect(JSON.stringify(fromCheckout.itineraries)).not.toContain('Jane');
  });

  it('sends none for a one-way return date, or for anything but a flight', async () => {
    const { toClientBooking } = await import('../../backend/routes/flight.routes.js');

    expect(toClientBooking(flightRow({ itineraries: [legs[0]] })).returnDate).toBeNull();
    const hotel = toClientBooking({ ...flightRow({ flight_offer: roundTripOffer }), travel_type: 'hotel' });
    expect(hotel.itineraries).toEqual([]);
    expect(hotel.returnDate).toBeNull();
  });

  it('buildBookingRow keeps the legs it is given', async () => {
    const { buildBookingRow } = await import('../../backend/routes/flight.routes.js');

    expect(buildBookingRow({ bookingReference: REF, itineraries: legs }).booking_details.itineraries).toEqual(legs);
    expect(buildBookingRow({ bookingReference: REF }).booking_details.itineraries).toEqual([]);
  });
});

describe('the confirmation email', () => {
  const base = { customerName: 'Jane', bookingReference: REF, bookingType: 'flight', paymentAmount: 291, travelDate: '2026-11-15', passengers: 1 };

  it('shows both legs, every flight number, the connection and the terminals', async () => {
    const T = await import('../../backend/services/email/templates.js');
    const html = T.generateBookingConfirmationTemplate({ ...base, bookingDetails: { origin: 'JFK', destination: 'LHR', itineraries: legs } });

    expect(html).toContain('Outbound');
    expect(html).toContain('Return');
    for (const flight of ['FI614', 'FI450', 'BA117']) expect(html).toContain(flight);
    expect(html).toContain('Connection in KEF · 2h 35m between flights');
    expect(html).toContain('Terminal 7');
    expect(html).toContain('7:25 PM');
  });

  it('rebuilds the legs from the offer on an older booking', async () => {
    const T = await import('../../backend/services/email/templates.js');
    const html = T.generateBookingConfirmationTemplate({ ...base, bookingDetails: { origin: 'JFK', destination: 'LHR', flight_offer: roundTripOffer } });

    expect(html).toContain('BA117');
  });
});
