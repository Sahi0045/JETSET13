import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

// Same harness as ticketedSaveFailedAlarm.test.js.
vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  const chain = {};
  for (const m of ['select', 'update', 'insert', 'upsert', 'eq', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.maybeSingle = chain.single;
  return { ...actual, supabase: { from: vi.fn(() => chain) } };
});

/**
 * A ticketed booking the airline retimed, which the order route then held
 * after issuing it.
 *
 * The chain accepts a TK segment at commit and, on a chain that completes,
 * createFlightOrder hands the change back as the answer's `needsReview`
 * (schedule_changed_by_airline) - which the final save writes on the booking,
 * where the desk and Slack find it. When the final save failed instead, the
 * route held the booking with flagForReview - ticketed, with its numbers -
 * and passed no schedule change: the retiming was written nowhere. The desk
 * said "Ticketed, customer not sent it", Slack named no retiming, and ticket
 * sync then read the numbers, emailed the e-ticket with the searched times and
 * settled the hold. The desk went empty and nobody told the customer their
 * flight was retimed. The outer catch did the same for a chain that answered
 * and a later step that threw.
 *
 * Now both holds keep the chain's schedule change under the held flag
 * (`previous`), as flagForReview keeps the one a chain error carries
 * (scheduleChangeKeptWhenHeld.test.js). Slack names it on the held booking's
 * line, and ticket sync, settling the hold, lifts it back on top for a person.
 */

const REF = 'FLTSAVE2';
const INDICATOR = 'SI-SAVE-1';

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

const checkoutRow = () => ({
  id: 1,
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  created_at: new Date().toISOString(),
  booking_details: {
    order_id: REF,
    success_indicator: INDICATOR,
    customer_email: 'jane@example.com',
    arc_captured_amount: 291,
    arc_captured_currency: 'USD',
    pending_booking_data: { bookingData: { originalOffer: bookableOffer, passengerData: [{ firstName: 'Jane', lastName: 'Doe', gender: 'FEMALE', dateOfBirth: '1990-01-01' }] } },
    verified_charge: { total: 291, pricedFare: { total: 291, currency: 'USD' }, verifiedAt: new Date().toISOString() },
  },
});

const order = {
  bookingReference: REF,
  orderId: REF,
  transactionId: INDICATOR,
  contactInfo: { email: 'jane@example.com', countryCode: '1', phoneNumber: '5551234567' },
  travelers: [{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', gender: 'FEMALE' }],
};

const TICKET = { number: '108-2412345671', travelerId: '1' };
const send = vi.fn();

/** The chain commits, issues, and answers with what `answer()` builds. */
const chainAnsweringWith = (answer) => vi.doMock('../../backend/services/flightProvider.js', () => ({
  default: {
    priceFlightOffer: vi.fn(async (offer) => ({
      success: true,
      data: { flightOffers: [{ ...offer, price: { currency: 'USD', total: '291.00', grandTotal: '291.00', base: '110.00' } }] },
    })),
    createFlightOrder: vi.fn(async (_orderData, options) => {
      await options.onCommitted({ pnr: 'ABC123', tstRefs: ['1'], priced: { total: 291, currency: 'USD' } });
      return answer();
    }),
  },
  providerStatus: () => ({ bookingEnabled: true, wsap: '1ASIWTEST' }),
}));
const chainAnswering = (answer) => chainAnsweringWith(() => ({
  success: true, pnr: 'ABC123', orderId: 'ABC123', mode: 'LIVE_GDS_BOOKING', ...answer,
}));
// The chain answered, ticketed, then reading its answer threw
// (heldForReviewEmail.test.js): the order route's outer catch holds it.
const chainAnsweringThenUnreadable = (needsReview) => chainAnsweringWith(() => ({
  success: true, pnr: 'ABC123', orderId: 'ABC123', mode: 'LIVE_GDS_BOOKING', ticketed: true, gds: { ticketed: true }, needsReview,
  get tickets() { throw new Error('boom'); },
}));

// The final save's merge UPDATE (the one writing the booked row) meets a
// database error; every other query works.
const finalSaveFails = ({ patch }) => Boolean(patch && patch.travel_type === 'flight' && ['confirmed', 'pending_ticketing'].includes(patch.status));

const orderWith = async (table) => {
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  return request(app).post('/api/flights/order').send(order);
};

// The chain's answer: createFlightOrder's flag for a retimed booking, alone or
// kept under the numbers flag (amadeusSoap/index.js).
const retimed = () => ({ reason: 'schedule_changed_by_airline', statuses: ['TK'], at: new Date().toISOString() });
const numbersMissing = (previous) => ({
  reason: 'ticket_numbers_not_retrieved', expected: 1, got: 0, at: new Date().toISOString(), ...(previous ? { previous } : {}),
});

const whatStaffSee = async (row) => {
  const { selectUnannounced, buildMessage } = await import('../../backend/jobs/needsReviewAlert.job.js');
  const { attentionOf, attentionLabel, scheduleChangeOf } = await import('../../shared/reviewQueue.js');
  const attention = attentionOf(row);
  return {
    desk: attentionLabel(attention),
    scheduleChange: scheduleChangeOf(row),
    slack: buildMessage(selectUnannounced([row])),
  };
};

/** Ticket sync reads the numbers from the PNR, records them and settles the hold. */
const ticketSyncRuns = async (table) => {
  const { syncOne } = await import('../../backend/jobs/ticketSync.job.js');
  const sendEmail = vi.fn().mockResolvedValue({ success: true });
  const provider = { getFlightOrderDetails: vi.fn(async () => ({ success: true, data: { tickets: [TICKET], travelers: [{ id: '1', name: { firstName: 'JANE', lastName: 'DOE' } }] } })) };
  const stored = table.row(REF);
  const synced = await syncOne({ ...stored, passenger_details: [{ id: '1', firstName: 'Jane', lastName: 'Doe' }] }, { provider, sendEmail });
  return { synced, sendEmail };
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

describe('a ticketed booking the airline retimed, whose final save failed', () => {
  it('keeps the schedule change under the held flag: Slack names it, and it outlasts ticket sync', async () => {
    chainAnswering({ ticketed: true, tickets: [TICKET], gds: { ticketed: true }, needsReview: retimed() });
    const table = fakeBookingsTable([checkoutRow()], { fail: finalSaveFails });

    const res = await orderWith(table);
    expect(res.body).toMatchObject({ success: true, ticketed: true, savedToDatabase: false });

    const flag = table.row(REF).booking_details.needs_review;
    expect(flag).toMatchObject({
      reason: 'order route failed after commit: the booking could not be saved',
      ticketed: true,
      previous: { reason: 'schedule_changed_by_airline', statuses: ['TK'] },
    });
    const held = await whatStaffSee(table.row(REF));
    expect(held.desk).toBe('Ticketed, customer not sent it');
    expect(held.scheduleChange).toMatchObject({ statuses: ['TK'] });
    expect(held.slack).toMatch(/held after its ticket was issued/);
    expect(held.slack).toMatch(/the airline also changed the schedule \(segment status: TK\)/);

    // Ticket sync sends the e-ticket and settles the hold, and the retiming
    // is what is left for a person.
    const { synced } = await ticketSyncRuns(table);
    expect(synced).toMatchObject({ outcome: 'recorded', emailed: true });
    const after = await whatStaffSee(table.row(REF));
    expect(after.desk).toBe('Airline changed the schedule');
    expect(after.slack).toMatch(/whose schedule the airline changed/);
  });

  it('keeps a schedule change the chain kept under its numbers flag', async () => {
    chainAnswering({ ticketed: true, tickets: [], gds: { ticketed: true }, needsReview: numbersMissing(retimed()) });
    const table = fakeBookingsTable([checkoutRow()], { fail: finalSaveFails });

    await orderWith(table);

    const flag = table.row(REF).booking_details.needs_review;
    expect(flag).toMatchObject({ ticketed: true, previous: { reason: 'schedule_changed_by_airline', statuses: ['TK'] } });
    expect((await whatStaffSee(table.row(REF))).scheduleChange).toMatchObject({ statuses: ['TK'] });
  });
});

describe('a ticketed booking the airline retimed, held by the outer catch', () => {
  it('keeps the schedule change when reading the chain\'s answer fails after it', async () => {
    chainAnsweringThenUnreadable(retimed());
    const table = fakeBookingsTable([checkoutRow()]);

    const res = await orderWith(table);

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ needsReview: true, ticketed: true });
    const flag = table.row(REF).booking_details.needs_review;
    expect(flag).toMatchObject({
      reason: expect.stringMatching(/^order route failed after commit: /),
      ticketed: true,
      previous: { reason: 'schedule_changed_by_airline', statuses: ['TK'] },
    });
    expect((await whatStaffSee(table.row(REF))).slack).toMatch(/the airline also changed the schedule/);
  });
});

// Fences: the outcomes next to it, unchanged.
describe('around it', () => {
  it('saved normally, the desk and Slack carry the retiming as before', async () => {
    chainAnswering({ ticketed: true, tickets: [TICKET], gds: { ticketed: true }, needsReview: retimed() });
    const table = fakeBookingsTable([checkoutRow()]);

    const res = await orderWith(table);

    expect(res.body).toMatchObject({ success: true, ticketed: true, savedToDatabase: true });
    expect(table.row(REF).booking_details.needs_review).toMatchObject({ reason: 'schedule_changed_by_airline' });
    expect((await whatStaffSee(table.row(REF))).desk).toBe('Airline changed the schedule');
  });

  it('no schedule change: the save-failed hold is written with nothing under it, and ticket sync settles it', async () => {
    chainAnswering({ ticketed: true, tickets: [TICKET], gds: { ticketed: true } });
    const table = fakeBookingsTable([checkoutRow()], { fail: finalSaveFails });

    await orderWith(table);

    const flag = table.row(REF).booking_details.needs_review;
    expect(flag).toMatchObject({ ticketed: true, reason: 'order route failed after commit: the booking could not be saved' });
    expect(flag).not.toHaveProperty('previous');
    expect((await whatStaffSee(table.row(REF))).slack).not.toMatch(/schedule/);

    await ticketSyncRuns(table);
    expect((await whatStaffSee(table.row(REF))).desk).toBeNull();
  });

  it('only the numbers flag: nothing is invented under the hold', async () => {
    chainAnswering({ ticketed: true, tickets: [], gds: { ticketed: true }, needsReview: numbersMissing() });
    const table = fakeBookingsTable([checkoutRow()], { fail: finalSaveFails });

    await orderWith(table);

    expect(table.row(REF).booking_details.needs_review).not.toHaveProperty('previous');
  });

  it('no schedule change, held by the outer catch: nothing under the hold', async () => {
    chainAnsweringThenUnreadable(null);
    const table = fakeBookingsTable([checkoutRow()]);

    const res = await orderWith(table);

    expect(res.status).toBe(202);
    const flag = table.row(REF).booking_details.needs_review;
    expect(flag).toMatchObject({ ticketed: true });
    expect(flag).not.toHaveProperty('previous');
  });
});
