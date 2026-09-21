import axios from 'axios';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
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
 * Retries, refunds and the payment check in POST /order.
 *
 * (Harness shared with heldForReviewEmail.test.js.)
 *
 * A booking held for staff gets an email.
 *
 * POST /order answers 202 "needs review" when the airline took the booking and
 * a later step - ticketing, the final save - failed. Neither answer sent any
 * email, and confirmationEmailOwed ruled them out on every retry, while the
 * order page said "We'll email your e-ticket" and the confirmation page "A
 * confirmation email has been sent".
 */

const REF = 'FLTHELD1';
const INDICATOR = 'SI-HELD-1';

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
    pending_booking_data: { bookingData: { originalOffer: offer, passengerData: [{ firstName: 'Jane', lastName: 'Doe', gender: 'FEMALE', dateOfBirth: '1990-01-01' }] } },
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
const emailRecord = (table) => table.row(REF).booking_details.confirmation_email;

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
  vi.doMock('../../backend/services/flightProvider.js', () => ({
    default: {
      priceFlightOffer: vi.fn(async (priced) => ({
        success: true,
        data: { flightOffers: [{ ...priced, price: { currency: 'USD', total: '291.00', grandTotal: '291.00', base: '110.00' } }] },
      })),
      createFlightOrder: vi.fn(async (_orderData, options) => {
        await options.onCommitted({ pnr: 'HELD42', tstRefs: ['1'], priced: { total: 291, currency: 'USD' } });
        return after();
      }),
    },
    providerStatus: () => ({ bookingEnabled: true, wsap: '1ASIWTEST' }),
  }));
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


const booked = { success: true, pnr: 'HELD42', orderId: 'HELD42', ticketed: true, mode: 'LIVE_GDS_BOOKING', tickets: [{ number: '081-1234567890', travelerId: '1' }] };

describe('a retry while the booking is still being made', () => {
  // After the commit the chain goes on to queue and ticket. A retry in that
  // window - a reload, a second tab, "Try again" after a gateway cut-off - sent
  // the "reservation held, no ticket yet" email and recorded it as the one
  // email, so the confirmation with the ticket was refused as already sent.
  it('is told to wait, and sends no email', async () => {
    bookThen(() => booked);
    const working = checkoutRow({
      status: 'pending_ticketing',
      booking_details: { pnr: 'HELD42', gds: { ticketed: false }, gds_chain: { state: 'committed', committedAt: new Date().toISOString() } },
    });
    const { app } = await appWith([working]);

    const res = await request(app).post('/api/flights/order').send(order);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_IN_PROGRESS');
    expect(send).not.toHaveBeenCalled();
  });

  it('is shown the booking once its outcome is saved', async () => {
    bookThen(() => booked);
    const { app, table } = await appWith([checkoutRow()]);

    const first = await request(app).post('/api/flights/order').send(order);
    expect(first.body.success).toBe(true);
    expect(table.row(REF).booking_details.gds_chain.state).toBe('finished');

    const again = await request(app).post('/api/flights/order').send(order);

    expect(again.body.mode).toBe('ALREADY_BOOKED');
  });
});

describe('a booking whose payment is being returned', () => {
  // The failing request released its claim, then spent seconds reversing the
  // payment. A retry could take the claim in between and commit a PNR - and
  // issue a ticket - on a payment already going back to the card.
  it('cannot be held by another request', async () => {
    const { holdChainClaim } = await import('../../backend/routes/flight.routes.js');
    const startedAt = new Date().toISOString();
    const { table } = await appWith([checkoutRow({
      booking_details: {
        gds_chain: { state: 'in_progress', startedAt, claimedAt: startedAt, attempt: 2 },
        fulfillment_failed: { at: startedAt, error: 'sell refused', reversal: { action: 'IN_PROGRESS' } },
      },
    })]);
    expect(table.row(REF)).toBeTruthy();

    expect(await holdChainClaim(REF, 2, startedAt)).toBe('lost');
  });

  it('is marked failed before the gateway is asked to return it', async () => {
    let rowWhenReversing = null;
    let table = null;
    vi.doMock('../../backend/routes/payment/operations.handlers.js', async () => {
      const actual = await vi.importActual('../../backend/routes/payment/operations.handlers.js');
      return {
        ...actual,
        reverseArcPaymentForOrder: vi.fn(async () => {
          rowWhenReversing = JSON.parse(JSON.stringify(table.row(REF)));
          return { reversed: true, action: 'VOID' };
        }),
      };
    });
    bookThen(() => {
      throw Object.assign(new Error('sell refused'), { committed: false, step: 'sell', code: 409 });
    });
    const built = await appWith([checkoutRow()]);
    table = built.table;

    const res = await request(built.app).post('/api/flights/order').send(order);
    vi.doUnmock('../../backend/routes/payment/operations.handlers.js');

    expect(res.body.bookingFailed).toBe(true);
    expect(rowWhenReversing.booking_details.fulfillment_failed).toMatchObject({ reversal: { action: 'IN_PROGRESS' } });
    expect(table.row(REF).booking_details.fulfillment_failed.reversal).toMatchObject({ action: 'VOID' });
  });
});

describe('the payment check before booking', () => {
  const captured = { status: 200, data: { status: 'CAPTURED', amount: 291, transaction: [{ result: 'SUCCESS', transaction: { type: 'PAYMENT', amount: 291 } }] } };
  const askedGateway = () => axios.get.mock.calls.some(([url]) => String(url).includes(`/order/${REF}`));

  it('asks the gateway again when the recorded payment is not recent', async () => {
    axios.get.mockReset();
    axios.get.mockResolvedValue(captured);
    bookThen(() => booked);
    const { app: server } = await appWith([checkoutRow({ booking_details: { payment_reconciled_at: new Date(Date.now() - 60 * 60000).toISOString() } })]);

    await request(server).post('/api/flights/order').send(order);

    expect(askedGateway()).toBe(true);
  });

  // "Transaction ID 1" on My Trips: the booking saved ARC's transaction `id`,
  // which counts within the order. The bank's reference is `receipt`.
  it('saves and answers with the bank reference, not the count or the indicator', async () => {
    axios.get.mockReset();
    axios.get.mockResolvedValue({
      status: 200,
      data: { status: 'CAPTURED', amount: 291, transaction: [{ result: 'SUCCESS', transaction: { id: '1', type: 'PAYMENT', amount: 291, receipt: '625923098465' } }] },
    });
    bookThen(() => booked);
    const { app: server, table } = await appWith([checkoutRow({ booking_details: { payment_reconciled_at: new Date(Date.now() - 60 * 60000).toISOString() } })]);

    const res = await request(server).post('/api/flights/order').send(order);

    expect(res.body.success).toBe(true);
    expect(res.body.transactionId).toBe('625923098465');
    expect(table.row(REF).booking_details.transaction_id).toBe('625923098465');
  });

  // The usual path: the payment page reconciled moments ago, so the order
  // route reads the reference from the row instead of asking again.
  it('answers with the bank reference the payment page recorded', async () => {
    bookThen(() => booked);
    const { app: server, table } = await appWith([checkoutRow({ booking_details: { payment_reconciled_at: new Date().toISOString(), arc_transaction_id: '1', arc_receipt: '625923098465' } })]);

    const res = await request(server).post('/api/flights/order').send(order);

    expect(res.body.transactionId).toBe('625923098465');
    expect(table.row(REF).booking_details.transaction_id).toBe('625923098465');
  });

  it('trusts a payment the payment page confirmed moments ago', async () => {
    axios.get.mockReset();
    axios.get.mockResolvedValue(captured);
    bookThen(() => booked);
    const { app: server } = await appWith([checkoutRow({ booking_details: { payment_reconciled_at: new Date().toISOString() } })]);

    await request(server).post('/api/flights/order').send(order);

    expect(askedGateway()).toBe(false);
  });
});
