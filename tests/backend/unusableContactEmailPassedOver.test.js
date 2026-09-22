import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { buildContactEmailFreetext } from '../../backend/services/amadeusSoap/operations/travelDocs.js';

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
 * Every other address POST /order uses, and not only the first confirmation.
 *
 * The success path's confirmation passes over an address that cannot be
 * delivered to (isUsableEmail): the order's contact email, its customerEmail,
 * the lead traveller's, then the one checkout recorded. Nothing else did. A
 * customer who typed "jane@gmailcom" - checkout having recorded the account's
 * jane@gmail.com - had the held-for-review email and the confirmation a retry
 * owed them (confirmationEmailFromRow) sent to "jane@gmailcom", and the PNR
 * was given that address as its contact: the SSR CTCE builder drops an address
 * it cannot write, so the PNR went with no email contact at all, which some
 * airlines refuse to ticket. Each now takes the first usable address in the
 * success path's order.
 */

const REF = 'FLTADDR2';
const INDICATOR = 'SI-ADDR-2';

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

/** A paid checkout, verified for this offer, not yet booked; checkout recorded the account's address. */
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
    customer_email: 'jane@gmail.com',
    arc_captured_amount: 291,
    arc_captured_currency: 'USD',
    pending_booking_data: { bookingData: { originalOffer: offer, passengerData: [{ firstName: 'Jane', lastName: 'Doe', gender: 'FEMALE', dateOfBirth: '1990-01-01', ...lead }] } },
    verified_charge: { total: 291, pricedFare: { total: 291, currency: 'USD' }, verifiedAt: new Date().toISOString() },
    ...(over.booking_details || {}),
  },
});

/** The same checkout once the airline holds the booking, its confirmation never sent. */
const bookedRow = (details = {}) => checkoutRow({}, {
  status: 'pending_ticketing',
  booking_details: { pnr: 'ADDR42', gds: { ticketed: false }, origin: 'JFK', destination: 'LHR', currency: 'USD', ...details },
});

const order = (over = {}) => ({
  bookingReference: REF,
  orderId: REF,
  transactionId: INDICATOR,
  contactInfo: { email: 'jane@gmailcom', countryCode: '1', phoneNumber: '5551234567' },
  travelers: [{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', gender: 'FEMALE' }],
  ...over,
});
const usableContact = { email: 'jane.work@example.com', countryCode: '1', phoneNumber: '5551234567' };

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

/** The provider, booking the PNR and then doing whatever `after` does. */
const bookThen = (after) => {
  createFlightOrder.mockImplementation(async (_orderData, options) => {
    await options.onCommitted({ pnr: 'ADDR42', tstRefs: ['1'], priced: { total: 291, currency: 'USD' } });
    return after();
  });
};
const issued = () => ({ success: true, pnr: 'ADDR42', orderId: 'ADDR42', ticketed: false, tickets: [], mode: 'LIVE_GDS_BOOKING' });
const ticketingRefused = () => {
  throw Object.assign(new Error('ticketing refused'), { committed: true, pnr: 'ADDR42', step: 'issueTicket', ticketed: false });
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
  bookThen(issued);
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

/** Where the held-for-review email went, for a booking held after its PNR. */
const heldEmailTo = async (body, row = checkoutRow()) => {
  bookThen(ticketingRefused);
  const { app } = await appWith([row]);
  const res = await request(app).post('/api/flights/order').send(body);
  expect(res.status).toBe(202);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0].heldForReview).toBe(true);
  return send.mock.calls[0][0].customerEmail;
};

/** Where a retry sent the email a booked row still owed. */
const owedEmailTo = async (body, row = bookedRow()) => {
  const { app, table } = await appWith([row]);
  const res = await request(app).post('/api/flights/order').send(body);
  expect(res.body.mode).toBe('ALREADY_BOOKED');
  await vi.waitFor(() => expect(table.row(REF).booking_details.confirmation_email?.state).toBe('sent'));
  expect(send).toHaveBeenCalledTimes(1);
  return send.mock.calls[0][0];
};

/** The contact the PNR was booked with: the provider's payload, and the SSR CTCE text it becomes. */
const pnrContactFor = async (body, row = checkoutRow()) => {
  const { app } = await appWith([row]);
  const res = await request(app).post('/api/flights/order').send(body);
  expect(res.body.success).toBe(true);
  const [orderData] = createFlightOrder.mock.calls[0];
  const emailAddress = orderData.data.contacts[0].emailAddress;
  return {
    emailAddress,
    travellerContact: orderData.data.travelers[0].contact.emailAddress,
    ctce: buildContactEmailFreetext(emailAddress),
  };
};

describe('the held-for-review email', () => {
  it('passes over a contact email that is not usable, for the address checkout recorded', async () => {
    expect(await heldEmailTo(order())).toBe('jane@gmail.com');
  });

  it("passes over it for the lead traveller's email first", async () => {
    // The order's own travellers, when it names any (confirmationEmailFromRow).
    expect(await heldEmailTo(order({ travelers: [{ ...order().travelers[0], email: 'jane.t@example.com' }] }))).toBe('jane.t@example.com');
  });

  it('still goes to a usable contact email first', async () => {
    expect(await heldEmailTo(order({ contactInfo: usableContact }))).toBe('jane.work@example.com');
  });
});

describe('the confirmation a retry sends a booking that never got one', () => {
  it('passes over a contact email that is not usable, for the address checkout recorded', async () => {
    const email = await owedEmailTo(order());
    expect(email.customerEmail).toBe('jane@gmail.com');
    expect(email.heldForReview).toBe(false);
  });

  it("passes over it for the order's customerEmail first", async () => {
    expect((await owedEmailTo(order({ customerEmail: 'jane.b@example.com' }))).customerEmail).toBe('jane.b@example.com');
  });

  it('the held email a retry owes: the same', async () => {
    const email = await owedEmailTo(order(), bookedRow({ needs_review: { reason: 'chain failed after commit at issueTicket', ticketed: false } }));
    expect(email.heldForReview).toBe(true);
    expect(email.customerEmail).toBe('jane@gmail.com');
  });

  it('still goes to a usable contact email first', async () => {
    expect((await owedEmailTo(order({ contactInfo: usableContact }))).customerEmail).toBe('jane.work@example.com');
  });
});

describe("the PNR's contact email (SSR CTCE)", () => {
  it('passes over a contact email that is not usable, for the address checkout recorded', async () => {
    const contact = await pnrContactFor(order());
    expect(contact.emailAddress).toBe('jane@gmail.com');
    expect(contact.travellerContact).toBe('jane@gmail.com');
    expect(contact.ctce).toBe('JANE//GMAIL.COM');
  });

  it("passes over it for the order's customerEmail, then the lead traveller's", async () => {
    expect((await pnrContactFor(order({ customerEmail: 'jane.b@example.com' }))).emailAddress).toBe('jane.b@example.com');
    createFlightOrder.mockClear();
    vi.resetModules();
    expect((await pnrContactFor(order(), checkoutRow({ email: 'jane.t@example.com' }))).emailAddress).toBe('jane.t@example.com');
  });

  it('a usable contact email goes on exactly as before', async () => {
    const contact = await pnrContactFor(order({ contactInfo: { ...usableContact, email: 'Proof_Test-x@Example.com' } }));
    expect(contact.emailAddress).toBe('Proof_Test-x@Example.com');
    expect(contact.travellerContact).toBe('Proof_Test-x@Example.com');
    expect(contact.ctce).toBe('PROOF..TEST./X//EXAMPLE.COM');
  });

  it('with no usable address anywhere, none is invented', async () => {
    const row = checkoutRow({}, { booking_details: { customer_email: null } });
    const contact = await pnrContactFor(order(), row);
    expect(contact.emailAddress).toBeUndefined();
    expect(contact.ctce).toBeNull();
  });
});
