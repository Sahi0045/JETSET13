import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { buildFlightOrderBody, orderDataFromCheckoutRow } from '../../shared/flightOrderBody.js';

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
 * The email rebuilt from a booking's row (confirmationEmailFromRow): the one a
 * held booking is sent, and the confirmation a retry owes a booking that never
 * got one.
 *
 * It took its lead traveller from the order's request body first - and the
 * body the order page sends (shared/flightOrderBody.js) carries the
 * travellers' names and documents, never their email. The success path, the
 * PNR's contact and the booking queue's failure email all take the lead from
 * the travellers checkout verified. So a customer whose lead traveller's
 * address was the only usable one was sent nothing, and one whose checkout
 * recorded another address was sent this email there instead of where the
 * confirmation goes; and a body naming anybody else put that name on it.
 */

const REF = 'FLTLEAD1';
const INDICATOR = 'SI-LEAD-1';

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

const JANE = { firstName: 'Jane', lastName: 'Doe', gender: 'FEMALE', dateOfBirth: '1990-01-01', type: 'ADULT' };

/** A paid checkout, verified for this offer; its lead traveller as checkout verified them. */
const checkoutRow = (lead = {}, over = {}) => ({
  id: 1,
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  created_at: new Date().toISOString(),
  ...over,
  booking_details: {
    order_id: REF,
    success_indicator: INDICATOR,
    customer_email: null,
    arc_captured_amount: 291,
    arc_captured_currency: 'USD',
    pending_booking_data: { bookingData: { originalOffer: offer, passengerData: [{ ...JANE, ...lead }] } },
    verified_charge: { total: 291, pricedFare: { total: 291, currency: 'USD' }, verifiedAt: new Date().toISOString() },
    ...(over.booking_details || {}),
  },
});

/** The same checkout once the airline holds the booking, its confirmation never sent. */
const bookedRow = (lead = {}, details = {}) => checkoutRow(lead, {
  status: 'pending_ticketing',
  booking_details: { pnr: 'LEAD42', gds: { ticketed: false }, origin: 'JFK', destination: 'LHR', currency: 'USD', ...details },
});

/**
 * The body the order page sends for a row: built from it exactly as the page
 * builds it (buildFlightOrderBody), so its travellers carry no email - and the
 * page's contact, left blank on the review page.
 */
const pageBody = (row, over = {}) => ({
  ...buildFlightOrderBody(orderDataFromCheckoutRow(row)).body,
  transactionId: INDICATOR,
  contactInfo: { email: '', countryCode: '1', phoneNumber: '5551234567' },
  ...over,
});

const send = vi.fn();
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

const bookThen = (after) => {
  createFlightOrder.mockImplementation(async (_orderData, options) => {
    await options.onCommitted({ pnr: 'LEAD42', tstRefs: ['1'], priced: { total: 291, currency: 'USD' } });
    return after();
  });
};
const ticketingRefused = () => {
  throw Object.assign(new Error('ticketing refused'), { committed: true, pnr: 'LEAD42', step: 'issueTicket', ticketed: false });
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
  createFlightOrder.mockReset();
  bookThen(ticketingRefused);
  const mailer = { sendBookingNotificationEmails: send, sendEmail: vi.fn(), sendCancellationNotificationEmails: vi.fn() };
  vi.doMock('../../backend/services/emailService.js', () => ({ ...mailer, default: mailer }));
  vi.doMock('../../backend/services/flightProvider.js', () => ({
    default: {
      priceFlightOffer: vi.fn(async (priced) => ({
        success: true,
        data: { flightOffers: [{ ...priced, price: { currency: 'USD', total: '291.00', grandTotal: '291.00', base: '110.00' } }] },
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

/** The held-for-review email, for a booking held after its PNR: what was sent, or null. */
const heldEmail = async (row, body = pageBody(row)) => {
  const { app } = await appWith([row]);
  const res = await request(app).post('/api/flights/order').send(body);
  expect(res.status).toBe(202);
  return send.mock.calls[0]?.[0] ?? null;
};

/** The confirmation a retry owes a booked row: what was sent, or null. */
const owedEmail = async (row, body = pageBody(row)) => {
  const { app, table } = await appWith([row]);
  const res = await request(app).post('/api/flights/order').send(body);
  expect(res.body.mode).toBe('ALREADY_BOOKED');
  await vi.waitFor(() => expect(table.row(REF).booking_details.confirmation_email?.state).toBeDefined(), { timeout: 2000 })
    .catch(() => {});
  return send.mock.calls[0]?.[0] ?? null;
};

describe('the lead traveller of an email rebuilt from the row is the one checkout verified', () => {
  it("the held email goes to the lead traveller's address when it is the only usable one", async () => {
    const email = await heldEmail(checkoutRow({ email: 'jane.t@example.com' }));

    expect(email?.customerEmail).toBe('jane.t@example.com');
    expect(email?.heldForReview).toBe(true);
  });

  it("the confirmation a retry owes: the same", async () => {
    const email = await owedEmail(bookedRow({ email: 'jane.t@example.com' }));

    expect(email?.customerEmail).toBe('jane.t@example.com');
  });

  it("before the address checkout recorded, as the success path orders them", async () => {
    const email = await owedEmail(bookedRow({ email: 'jane.t@example.com' }, { customer_email: 'account@example.com' }));

    expect(email?.customerEmail).toBe('jane.t@example.com');
  });

  it('named for the traveller checkout verified, not whoever the request body names', async () => {
    const row = checkoutRow({ email: 'jane.t@example.com' }, { booking_details: { customer_email: 'account@example.com' } });
    const body = pageBody(row, { travelers: [{ id: '1', firstName: 'John', lastName: 'Roe', dateOfBirth: '1980-01-01', gender: 'MALE' }] });

    const email = await heldEmail(row, body);
    expect(email?.customerName).toBe('Jane Doe');
    expect(email?.passengers).toBe(1);
  });
});

// Fences: what is right today, and must stay right.
describe('next to it', () => {
  it('a usable contact email still goes first', async () => {
    const row = bookedRow({ email: 'jane.t@example.com' });
    const email = await owedEmail(row, pageBody(row, { contactInfo: { email: 'jane.work@example.com', countryCode: '1', phoneNumber: '5551234567' } }));

    expect(email?.customerEmail).toBe('jane.work@example.com');
  });

  it("with no usable address for the lead traveller, the address checkout recorded", async () => {
    const email = await owedEmail(bookedRow({ email: 'jane@gmailcom' }, { customer_email: 'account@example.com' }));

    expect(email?.customerEmail).toBe('account@example.com');
    expect(email?.customerName).toBe('Jane Doe');
  });

  it('with no address at all, nothing is sent and none is invented', async () => {
    expect(await owedEmail(bookedRow())).toBeNull();
  });

  it('a row that kept no checkout travellers still takes the lead from the request body', async () => {
    const row = bookedRow({}, { pending_booking_data: { bookingData: { originalOffer: offer } } });
    const body = {
      bookingReference: REF, orderId: REF, transactionId: INDICATOR, contactInfo: { email: '' },
      travelers: [{ id: '1', firstName: 'Jane', lastName: 'Doe', email: 'jane.b@example.com' }],
    };

    const email = await owedEmail(row, body);
    expect(email?.customerEmail).toBe('jane.b@example.com');
    expect(email?.customerName).toBe('Jane Doe');
  });
});
