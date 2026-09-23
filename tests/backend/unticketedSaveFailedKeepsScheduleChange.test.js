import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

// Same harness as ticketedHoldKeepsScheduleChange.test.js.
vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  const chain = {};
  for (const m of ['select', 'update', 'insert', 'upsert', 'eq', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.maybeSingle = chain.single;
  return { ...actual, supabase: { from: vi.fn(() => chain) } };
});

/**
 * An UNticketed chain answer carrying the airline's schedule change, whose
 * final save failed.
 *
 * The chain commits, accepts a TK segment, and answers success with
 * `ticketed: false` - AUTO_TICKET off, or an issue reply that was not "issued"
 * without throwing - and the schedule change in `needsReview`, which the final
 * save writes. When that save failed, the order route wrote a flag only for a
 * ticketed answer (the hold after issue, which keeps the change under it). The
 * row kept only what persistCommittedPnr wrote at the commit: the PNR and
 * `gds.ticketed: false`, no flag. Once the claim lapsed, the alarm posted
 * "paid but not ticketed" with no word of the retiming; staff ticketed it,
 * ticket sync emailed the e-ticket with the searched times, and nobody told
 * the customer their flight was retimed.
 *
 * Now the chain's flag is written on that path too, as the save would have
 * written it: the desk and the alarm name the retiming, and it outlasts the
 * ticket.
 */

const REF = 'FLTSAVE4';
const INDICATOR = 'SI-SAVE-4';

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
const sendEmail = vi.fn();

const chainAnswering = (answer, whileRunning = () => {}) => vi.doMock('../../backend/services/flightProvider.js', () => ({
  default: {
    priceFlightOffer: vi.fn(async (offer) => ({
      success: true,
      data: { flightOffers: [{ ...offer, price: { currency: 'USD', total: '291.00', grandTotal: '291.00', base: '110.00' } }] },
    })),
    createFlightOrder: vi.fn(async (_orderData, options) => {
      await options.onCommitted({ pnr: 'ABC123', tstRefs: ['1'], priced: { total: 291, currency: 'USD' } });
      whileRunning();
      return { success: true, pnr: 'ABC123', orderId: 'ABC123', ...answer };
    }),
  },
  providerStatus: () => ({ bookingEnabled: true, wsap: '1ASIWTEST' }),
}));

// The chain's unticketed answer (amadeusSoap/index.js createFlightOrder).
const unticketed = (needsReview) => ({
  mode: 'LIVE_GDS_BOOKING_UNTICKETED', ticketed: false, tickets: [], gds: { ticketed: false }, ...(needsReview ? { needsReview } : {}),
});
const retimed = () => ({ reason: 'schedule_changed_by_airline', statuses: ['TK'], at: new Date().toISOString() });

// The final save's merge UPDATE (the one writing the booked row) meets a
// database error; every other query works.
const isFinalSave = (patch) => Boolean(patch && patch.travel_type === 'flight' && ['confirmed', 'pending_ticketing'].includes(patch.status));
const finalSaveFails = ({ patch }) => isFinalSave(patch);

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

const whatStaffSee = async (row) => {
  const { selectUnannounced, buildMessage } = await import('../../backend/jobs/needsReviewAlert.job.js');
  const { attentionOf, attentionLabel, scheduleChangeOf } = await import('../../shared/reviewQueue.js');
  const attention = attentionOf(row);
  return {
    desk: attentionLabel(attention),
    reason: attention?.reason ?? null,
    scheduleChange: scheduleChangeOf(row),
    slack: buildMessage(selectUnannounced([row])),
  };
};

/** Staff ticket it by hand; ticket sync reads the ticket from the PNR and records it. */
const ticketSyncRuns = async (table) => {
  const { syncOne } = await import('../../backend/jobs/ticketSync.job.js');
  const provider = { getFlightOrderDetails: vi.fn(async () => ({ success: true, data: { tickets: [TICKET], travelers: [{ id: '1', name: { firstName: 'JANE', lastName: 'DOE' } }] } })) };
  const stored = table.row(REF);
  return syncOne({ ...stored, passenger_details: [{ id: '1', firstName: 'Jane', lastName: 'Doe' }] }, {
    provider, sendEmail: vi.fn().mockResolvedValue({ success: true }),
  });
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
  sendEmail.mockReset();
  sendEmail.mockResolvedValue({ success: true });
  const mailer = { sendBookingNotificationEmails: send, sendEmail, sendCancellationNotificationEmails: vi.fn() };
  vi.doMock('../../backend/services/emailService.js', () => ({ ...mailer, default: mailer }));
});

afterEach(() => {
  vi.doUnmock('../../backend/services/emailService.js');
  vi.doUnmock('../../backend/services/flightProvider.js');
  vi.unstubAllEnvs();
});

describe('an unticketed chain answer with a schedule change, whose final save failed', () => {
  it('writes the chain\'s schedule change: the desk and Slack name the retiming, and it outlasts the ticket', async () => {
    chainAnswering(unticketed(retimed()));
    const table = fakeBookingsTable([checkoutRow()], { fail: finalSaveFails });

    const res = await orderWith(table);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, ticketed: false, savedToDatabase: false });

    const details = table.row(REF).booking_details;
    expect(details.needs_review).toMatchObject({ reason: 'schedule_changed_by_airline', statuses: ['TK'] });
    // What the commit wrote is kept.
    expect(details).toMatchObject({ pnr: 'ABC123', gds: { ticketed: false } });
    // The chain has stopped, as the save or a hold would have recorded it.
    expect(details.gds_chain?.state).toBe('finished');

    const seen = await whatStaffSee(table.row(REF));
    expect(seen.scheduleChange).toMatchObject({ statuses: ['TK'] });
    expect(seen.reason).toMatch(/schedule_changed_by_airline/);
    expect(seen.slack).toMatch(/schedule_changed_by_airline/);

    // Staff ticket it; the retiming is still somebody's job afterwards.
    const synced = await ticketSyncRuns(table);
    expect(synced).toMatchObject({ outcome: 'recorded' });
    const after = await whatStaffSee(table.row(REF));
    expect(after.desk).toBe('Airline changed the schedule');
    expect(after.slack).toMatch(/whose schedule the airline changed/);
  });

  it('keeps a flag written on the row while the chain ran under the chain\'s', async () => {
    // The paid-not-ticketed alarm's own flag, written by a run that found the
    // claim lapsed while the chain was still out (needsReviewAlert.job.js).
    let table;
    const alarmFlag = { reason: 'PNR committed, never ticketed', ticketed: false, at: new Date().toISOString(), alerted_at: new Date().toISOString() };
    chainAnswering(unticketed(retimed()), () => { table.row(REF).booking_details.needs_review = alarmFlag; });
    table = fakeBookingsTable([checkoutRow()], { fail: finalSaveFails });

    await orderWith(table);

    expect(table.row(REF).booking_details.needs_review).toMatchObject({
      reason: 'schedule_changed_by_airline', statuses: ['TK'], previous: { reason: 'PNR committed, never ticketed' },
    });
  });
});

// Fences: the outcomes next to it, unchanged.
describe('around it', () => {
  it('sends no email of its own: the failed save still sends none', async () => {
    chainAnswering(unticketed(retimed()));
    const table = fakeBookingsTable([checkoutRow()], { fail: finalSaveFails });

    await orderWith(table);

    expect(send).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('no schedule change: nothing is written over what the commit recorded', async () => {
    chainAnswering(unticketed(null));
    const table = fakeBookingsTable([checkoutRow()], { fail: finalSaveFails });

    const res = await orderWith(table);

    expect(res.body).toMatchObject({ success: true, savedToDatabase: false });
    const details = table.row(REF).booking_details;
    expect(details.needs_review).toBeUndefined();
    expect(details).toMatchObject({ pnr: 'ABC123', gds: { ticketed: false } });
  });

  it('a booking cancelled while the save failed is not flagged', async () => {
    chainAnswering(unticketed(retimed()));
    let table;
    table = fakeBookingsTable([checkoutRow()], {
      fail: ({ patch }) => {
        if (!isFinalSave(patch)) return false;
        table.row(REF).status = 'cancelled';
        return true;
      },
    });

    await orderWith(table);

    expect(table.row(REF).booking_details.needs_review).toBeUndefined();
  });

  it('saved normally, the save writes the schedule change as before', async () => {
    chainAnswering(unticketed(retimed()));
    const table = fakeBookingsTable([checkoutRow()]);

    const res = await orderWith(table);

    expect(res.body).toMatchObject({ success: true, savedToDatabase: true });
    expect(table.row(REF).booking_details.needs_review).toMatchObject({ reason: 'schedule_changed_by_airline', statuses: ['TK'] });
    expect(table.row(REF).booking_details.needs_review).not.toHaveProperty('previous');
  });

  it('a ticketed answer whose save failed is still held after issue, with the change under the hold', async () => {
    chainAnswering({ mode: 'LIVE_GDS_BOOKING', ticketed: true, tickets: [TICKET], gds: { ticketed: true }, needsReview: retimed() });
    const table = fakeBookingsTable([checkoutRow()], { fail: finalSaveFails });

    await orderWith(table);

    expect(table.row(REF).booking_details.needs_review).toMatchObject({
      reason: 'order route failed after commit: the booking could not be saved',
      ticketed: true,
      previous: { reason: 'schedule_changed_by_airline', statuses: ['TK'] },
    });
  });
});
