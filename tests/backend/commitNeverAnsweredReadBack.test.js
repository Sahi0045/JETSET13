import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

// See heldForReviewEmail.test.js: the payment handlers take their Supabase
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
 * A booking whose airline commit never answered, read back from its row.
 *
 * The chain throws `committed: 'unknown'` from its commit step (bookingChain.js
 * step 6): a timeout, a reply that is not SOAP, or an answer with no record
 * locator. That throw happens before `onCommitted`, so no PNR reaches the row.
 * The order route flags it for review and answers 202: our team is checking
 * with the airline whether the booking went through, please do not book again.
 * The order page and the confirmation page it redirects to say so.
 *
 * Every later read of the booking comes from the row, which has no PNR and
 * carried nothing but the review reason. My Trips and Manage Booking called it
 * a booking that had failed, with no word against booking again, and so did a
 * reload of the order page: its retry of POST /order was refused, rightly, in
 * the words for a booking that could not be completed. And once the chain's
 * two-minute claim lapsed, the duplicate check stopped counting the row as
 * booked: a second payment for the same trip was sent to the airline, while
 * the first may be held there. These drive the real route to the real row,
 * then the real projection (toClientBooking) and the real customer-facing
 * helpers.
 */

const REF = 'FLTUNK1';
const SECOND = 'FLTUNK2';
const JANE = [{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', gender: 'FEMALE' }];
const JOHN = [{ id: '1', firstName: 'John', lastName: 'Doe', dateOfBirth: '1988-02-02', gender: 'MALE' }];

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

/** A checkout ARC captured, verified for the offer, not yet booked. */
const checkoutRow = (ref = REF, travellers = JANE) => ({
  id: ref === REF ? 1 : 2,
  booking_reference: ref,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  created_at: new Date().toISOString(),
  booking_details: {
    order_id: ref,
    success_indicator: `SI-${ref}`,
    customer_email: 'jane@example.com',
    arc_captured_amount: 291,
    arc_captured_currency: 'USD',
    pending_booking_data: { bookingData: { originalOffer: offer, passengerData: travellers } },
    verified_charge: { total: 291, pricedFare: { total: 291, currency: 'USD' }, verifiedAt: new Date().toISOString() },
  },
});

const orderFor = (ref, travelers = JANE) => ({
  bookingReference: ref,
  orderId: ref,
  transactionId: `SI-${ref}`,
  contactInfo: { email: 'jane@example.com', countryCode: '1', phoneNumber: '5551234567' },
  travelers,
});
const order = orderFor(REF);

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

  // The chain as it stops when the commit's answer never arrives: it asks
  // beforeCommit, sends the end transact, and throws from callStep - before any
  // record locator is read, so onCommitted is never called.
  createFlightOrder.mockReset();
  createFlightOrder.mockImplementation(async (_orderData, options) => {
    if (options?.beforeCommit) await options.beforeCommit();
    throw Object.assign(new Error('We could not confirm your booking'), {
      name: 'BookingChainError',
      step: 'commit',
      committed: 'unknown',
      code: 504,
      operation: 'PNR_AddMultiElements',
      technicalError: 'timeout of 25000ms exceeded',
    });
  });
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

const commitNeverAnswered = async (otherRows = []) => {
  const { app, table } = await appWith([checkoutRow(), ...otherRows]);
  const res = await request(app).post('/api/flights/order').send(order);
  // Let anything started on `finish` run.
  await new Promise((resolve) => setTimeout(resolve, 30));
  return { app, table, res };
};

// Fence: the held email needs a PNR on the row (confirmationEmailKind).
describe('the email after a commit that never answered', () => {
  it('is not the Reservation Held email: no email is sent at all', async () => {
    const { res, table } = await commitNeverAnswered();

    expect(createFlightOrder).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(202);
    expect(res.body.pnr).toBeFalsy();
    expect(res.body.message).toMatch(/checking with the airline whether your booking went through/);
    expect(send).not.toHaveBeenCalled();

    const row = table.row(REF);
    expect(row.booking_details.pnr).toBeUndefined();
    expect(row.status).toBe('pending');
    expect(row.booking_details.needs_review.reason).toBe('chain failed after commit at commit');
    expect(row.booking_details.confirmation_email).toBeUndefined();
    // What the duplicate check has to go on once the chain's claim lapses: no
    // pnr, no queued_order, and the chain left 'in_progress'.
    expect(row.booking_details.gds_chain?.state).toBe('in_progress');
    expect(row.booking_details.queued_order).toBeUndefined();
  });
});

describe('the same booking read back from its row', () => {
  const NOT_COMPLETED = /could not be completed/i;

  it('is sent to the pages naming the state, in the shape the component test renders', async () => {
    const { table } = await commitNeverAnswered();
    const { toClientBooking } = await import('../../backend/routes/flight.routes.js');
    const client = toClientBooking(table.row(REF));

    // tests/components/commitNeverAnsweredReadBack.test.jsx renders this shape.
    expect(client).toMatchObject({
      type: 'flight', status: 'pending', paymentStatus: 'paid', payment_status: 'paid', queued: false,
      tickets: [], voided_tickets: [], cancellation: null, gds: null,
    });
    expect(client.needs_review).toEqual({
      reason: 'chain failed after commit at commit', no_confirmed_seat: false, ticket_numbers_missing: false, commit_unknown: true,
    });
    expect(client.pnr).toBeUndefined();
  });

  it('My Trips card and Manage Booking banner: we are checking, do not book again', async () => {
    const { table } = await commitNeverAnswered();
    const { toClientBooking } = await import('../../backend/routes/flight.routes.js');
    const { attentionMessage } = await import('../../frontend/src/utils/bookingStatus.js');

    const sentence = attentionMessage({ ...toClientBooking(table.row(REF)), source: 'database' });

    // What the customer was told when they paid.
    expect(sentence).not.toMatch(NOT_COMPLETED);
    expect(sentence).toMatch(/checking with the airline whether your booking went through/);
    expect(sentence).toMatch(/please do not book this trip again/);
  });

  it('once a person resolves the flag, the pages are told nothing new', async () => {
    const { table } = await commitNeverAnswered();
    const { toClientBooking } = await import('../../backend/routes/flight.routes.js');
    const { attentionMessage } = await import('../../frontend/src/utils/bookingStatus.js');
    const row = table.row(REF);
    row.booking_details.needs_review = {
      ...row.booking_details.needs_review, resolved_at: new Date().toISOString(), resolved_by: 'desk', resolution: 'not held at the airline',
    };

    const client = toClientBooking(row);

    expect(client.needs_review.commit_unknown).toBe(false);
    expect(attentionMessage(client)).toMatch(NOT_COMPLETED);
  });

  it('a PNR recorded on it since: not commit-unknown', async () => {
    const { table } = await commitNeverAnswered();
    const { toClientBooking } = await import('../../backend/routes/flight.routes.js');
    const row = table.row(REF);
    row.booking_details.pnr = 'LATE01';

    expect(toClientBooking(row).needs_review.commit_unknown).toBe(false);
  });
});

// The order page reloaded, or reached again with Back: it sends the order again.
describe('the same order sent again', () => {
  const CHECKING_NOT_SENT = 'Our team is checking with the airline whether this booking went through, so it was not sent to the airline again. '
    + 'Nothing more has been charged. Please do not book this trip again in the meantime - we will email you either way. '
    + `If you have not heard from us within 2 business days, call (877) 538-7380 with booking reference ${REF}.`;

  it('is not sent again, and says we are checking - not that the booking could not be completed', async () => {
    const { app } = await commitNeverAnswered();

    const retry = await request(app).post('/api/flights/order').send(order);

    expect(createFlightOrder).toHaveBeenCalledTimes(1);
    expect(retry.status).toBe(409);
    expect(retry.body).toMatchObject({ code: 'BOOKING_NEEDS_REVIEW', needsReview: true, bookingReference: REF, paymentState: 'held' });
    expect(retry.body.message).toBe(CHECKING_NOT_SENT);
    expect(retry.body.error).toBe(CHECKING_NOT_SENT);
  });

  // Fences: once somebody knows, the answer is what it was.
  it('once a person resolved the flag: refused in the words it had before', async () => {
    const { app, table } = await commitNeverAnswered();
    const row = table.row(REF);
    row.booking_details.needs_review = { ...row.booking_details.needs_review, resolved_at: new Date().toISOString() };

    const retry = await request(app).post('/api/flights/order').send(order);

    expect(createFlightOrder).toHaveBeenCalledTimes(1);
    expect(retry.status).toBe(409);
    expect(retry.body.message).toBe('This booking could not be completed and our team is reviewing it, so it was not sent to the airline again. '
      + `Nothing more has been charged. If you have not heard from us within 2 business days, call (877) 538-7380 with booking reference ${REF}.`);
  });

  it('refunded since: the refunded answer, as for any booking under review', async () => {
    const { app, table } = await commitNeverAnswered();
    table.row(REF).payment_status = 'refunded';

    const retry = await request(app).post('/api/flights/order').send(order);

    expect(createFlightOrder).toHaveBeenCalledTimes(1);
    expect(retry.body.paymentState).toBe('returned');
    expect(retry.body.message).toBe('This booking could not be completed, so it was not sent to the airline again. '
      + `Your payment for it has been refunded. If you have any questions, call (877) 538-7380 with booking reference ${REF}.`);
  });
});

const PAID_FOR_NOT_BOOKED = (reference) => 'This payment looks like a second payment for a trip you have already paid for, '
  + 'for the same travellers on the same flights, so we have not booked it again. Your first payment is not affected, and our team '
  + 'is still checking with the airline whether that booking went through. Our support team will check it and refund this payment. '
  + 'If you did mean to book this trip twice, or have not heard from us within 2 business days, '
  + `call (877) 538-7380 with booking reference ${reference}.`;
const ALREADY_BOOKED = (reference) => 'This payment looks like a second payment for a trip you have already booked, for the same travellers '
  + 'on the same flights, so we have not booked it again. Your other booking is not affected. Our support team will check it '
  + 'and refund this payment. If you did mean to book this trip twice, or have not heard from us within 2 business days, '
  + `call (877) 538-7380 with booking reference ${reference}.`;

// A second payment for the same trip, once the first chain's claim has lapsed.
describe('a second checkout for the same trip, paid after it', () => {
  // The chain claim is two minutes (CHAIN_CLAIM_TTL_MS). Nothing renews it once
  // the commit has thrown, so a second payment made later finds it lapsed.
  const claimLapsed = (table) => {
    const chain = table.row(REF).booking_details.gds_chain;
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    Object.assign(chain, { startedAt: tenMinutesAgo, claimedAt: tenMinutesAgo });
  };

  it('is held for a person, not sent to the airline: no second reservation, and the payment is not booked', async () => {
    const { app, table } = await commitNeverAnswered([checkoutRow(SECOND)]);
    claimLapsed(table);

    const res = await request(app).post('/api/flights/order').send(orderFor(SECOND));

    // Only the first order ever reached the airline.
    expect(createFlightOrder).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(409);
    // What the customer sees: the order page's "We did not book this trip
    // twice", with this answer.
    expect(res.body).toMatchObject({ code: 'DUPLICATE_PAYMENT', duplicatePayment: true, needsReview: true, bookingReference: SECOND });
    // "Already paid for", not "already booked": nobody knows yet whether the
    // first went through.
    expect(res.body.message).toBe(PAID_FOR_NOT_BOOKED(SECOND));

    // Held against the first, for the alarm and the desk; its claim let go.
    const held = table.row(SECOND).booking_details;
    expect(held.needs_review).toMatchObject({ duplicate_of: REF, source: 'duplicate-payment', ticketed: false });
    expect(held.gds_chain.state).toBe('failed');
    expect(held.pnr).toBeUndefined();
    const { selectUnannounced } = await import('../../backend/jobs/needsReviewAlert.job.js');
    expect(selectUnannounced([table.row(SECOND)])).toHaveLength(1);
  });

  it('sent again (a reload of its order page): still "already paid for" while the first is being checked', async () => {
    const { app, table } = await commitNeverAnswered([checkoutRow(SECOND)]);
    claimLapsed(table);
    await request(app).post('/api/flights/order').send(orderFor(SECOND));

    const retry = await request(app).post('/api/flights/order').send(orderFor(SECOND));

    expect(createFlightOrder).toHaveBeenCalledTimes(1);
    expect(retry.status).toBe(409);
    expect(retry.body).toMatchObject({ code: 'DUPLICATE_PAYMENT', paymentState: 'held' });
    expect(retry.body.message).toBe(PAID_FOR_NOT_BOOKED(SECOND));
  });

  // Fences.
  it('once the first has a record locator (the desk found it held), it is "already booked" again', async () => {
    const { app, table } = await commitNeverAnswered([checkoutRow(SECOND)]);
    claimLapsed(table);
    table.row(REF).booking_details.pnr = 'ABC123';

    const res = await request(app).post('/api/flights/order').send(orderFor(SECOND));

    expect(res.body.code).toBe('DUPLICATE_PAYMENT');
    expect(res.body.message).toBe(ALREADY_BOOKED(SECOND));
    const retry = await request(app).post('/api/flights/order').send(orderFor(SECOND));
    expect(retry.body.message).toBe(ALREADY_BOOKED(SECOND));
  });

  it('while the first claim is still live it is held as before', async () => {
    const { app, table } = await commitNeverAnswered([checkoutRow(SECOND)]);

    const res = await request(app).post('/api/flights/order').send(orderFor(SECOND));

    expect(createFlightOrder).toHaveBeenCalledTimes(1);
    expect(res.body.code).toBe('DUPLICATE_PAYMENT');
    expect(table.row(SECOND).booking_details.needs_review.duplicate_of).toBe(REF);
  });

  it('the same flights for other travellers are booked: a family can book one flight twice', async () => {
    const { app, table } = await commitNeverAnswered([checkoutRow(SECOND, JOHN)]);
    claimLapsed(table);

    const res = await request(app).post('/api/flights/order').send(orderFor(SECOND, JOHN));

    expect(res.body.code).not.toBe('DUPLICATE_PAYMENT');
    expect(createFlightOrder).toHaveBeenCalledTimes(2);
  });

  it('once a person resolved the flag, the first no longer counts as booked', async () => {
    const { app, table } = await commitNeverAnswered([checkoutRow(SECOND)]);
    claimLapsed(table);
    const first = table.row(REF).booking_details;
    first.needs_review = { ...first.needs_review, resolved_at: new Date().toISOString(), resolution: 'not held at the airline' };

    const res = await request(app).post('/api/flights/order').send(orderFor(SECOND));

    expect(res.body.code).not.toBe('DUPLICATE_PAYMENT');
    expect(createFlightOrder).toHaveBeenCalledTimes(2);
  });

  it('a first booking that really failed does not count as booked', async () => {
    const failedFirst = {
      ...checkoutRow(),
      booking_details: {
        ...checkoutRow().booking_details,
        fulfillment_failed: { at: '2026-09-15T08:00:00Z', error: 'step=sell', reversal: { reversed: false, action: 'FAILED' } },
        needs_review: { reason: 'charge not reversed after the booking failed', ticketed: false, at: '2026-09-15T08:00:00Z' },
        gds_chain: { state: 'failed', failedStep: 'sell', finishedAt: '2026-09-15T08:00:00Z' },
      },
    };
    const { app } = await appWith([failedFirst, checkoutRow(SECOND)]);

    const res = await request(app).post('/api/flights/order').send(orderFor(SECOND));

    expect(res.body.code).not.toBe('DUPLICATE_PAYMENT');
    expect(createFlightOrder).toHaveBeenCalledTimes(1);
  });
});

// Fence: what the desk, the admin list and Slack say of the same row.
describe('the same row, as staff see it', () => {
  it('desk and admin: "Flagged for review" with the raw reason; Slack: under "paid but not ticketed", PNR none', async () => {
    const { table } = await commitNeverAnswered();
    const row = table.row(REF);
    const { attentionOf, attentionLabel } = await import('../../shared/reviewQueue.js');
    const { selectUnannounced, describeBooking } = await import('../../backend/jobs/needsReviewAlert.job.js');

    const attention = attentionOf(row);
    expect(attention).toMatchObject({ kind: 'review', reason: 'chain failed after commit at commit' });
    expect(attentionLabel(attention)).toBe('Flagged for review');

    expect(selectUnannounced([row])).toHaveLength(1);
    const line = describeBooking(row);
    expect(line).toMatch(/PNR none · ticketed: NO/);
    expect(line).toMatch(/Amadeus PNR_AddMultiElements: timeout of 25000ms exceeded/);
  });
});
