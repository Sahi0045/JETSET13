import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { attentionLabel, attentionOf } from '../../shared/reviewQueue.js';
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
 * The desk card of a ticketed hold the airline retimed.
 *
 * The order route keeps the chain's schedule change under a ticketed hold
 * (flagForReview, keepingScheduleChange) when the final save fails or a later
 * step throws. Slack named it on the held line, and ticket sync lifted it back
 * on top once it settled the hold - but the desk, which lists the hold the
 * moment it is written, read the held flag's reason alone: "Ticketed, customer
 * not sent it - order route failed after commit: the booking could not be
 * saved", no word of the retiming. A person who sent the e-ticket by hand and
 * pressed "Mark as handled" before ticket sync or the alarm ran resolved the
 * top flag, which settles everything under it (flagsInForce): the retiming
 * left the desk and the alarm, and nobody told the customer the new times.
 *
 * The desk now names the schedule change on a ticketed hold, as it does under
 * an unticketed hold and under the numbers flag, so it is seen before anyone
 * resolves it.
 */

const REF = 'FLTSAVE3';
const INDICATOR = 'SI-SAVE-3';
const at = '2026-09-23T10:00:00.000Z';

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

const chainAnswering = (answer) => vi.doMock('../../backend/services/flightProvider.js', () => ({
  default: {
    priceFlightOffer: vi.fn(async (offer) => ({
      success: true,
      data: { flightOffers: [{ ...offer, price: { currency: 'USD', total: '291.00', grandTotal: '291.00', base: '110.00' } }] },
    })),
    createFlightOrder: vi.fn(async (_orderData, options) => {
      await options.onCommitted({ pnr: 'ABC123', tstRefs: ['1'], priced: { total: 291, currency: 'USD' } });
      return { success: true, pnr: 'ABC123', orderId: 'ABC123', mode: 'LIVE_GDS_BOOKING', ...answer };
    }),
  },
  providerStatus: () => ({ bookingEnabled: true, wsap: '1ASIWTEST' }),
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

const retimed = () => ({ reason: 'schedule_changed_by_airline', statuses: ['TK'], at: new Date().toISOString() });

/** A ticketed booking held after issue, with `previous` under the hold. */
const heldTicketedRow = (reason, previous) => ({
  booking_reference: 'FLTHELD9',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 291,
  booking_details: {
    pnr: 'ABC123',
    gds: { ticketed: true },
    tickets: [TICKET],
    needs_review: { reason, ticketed: true, at, ...(previous ? { previous } : {}) },
  },
});

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
  vi.unstubAllEnvs();
});

describe('the desk card of a ticketed hold the airline retimed', () => {
  it('names the schedule change when the final save failed (the order route, end to end)', async () => {
    chainAnswering({ ticketed: true, tickets: [TICKET], gds: { ticketed: true }, needsReview: retimed() });
    const table = fakeBookingsTable([checkoutRow()], { fail: finalSaveFails });

    const res = await orderWith(table);
    expect(res.body).toMatchObject({ success: true, ticketed: true, savedToDatabase: false });

    const attention = attentionOf(table.row(REF));
    expect(attention.kind).toBe('held_ticketed');
    expect(attentionLabel(attention)).toBe('Ticketed, customer not sent it');
    expect(attention.reason).toMatch(/^order route failed after commit: the booking could not be saved/);
    expect(attention.reason).toMatch(/schedule_changed_by_airline/);
  });

  it('names it under a chain error held after issue', () => {
    const booking = heldTicketedRow('chain failed after commit at retrieveTickets', retimed());
    const attention = attentionOf(booking);
    expect(attention).toMatchObject({ kind: 'held_ticketed', since: at });
    expect(attention.reason).toBe('chain failed after commit at retrieveTickets; schedule_changed_by_airline');
  });
});

// Fences: the entries around it, unchanged.
describe('around it', () => {
  it('a ticketed hold with nothing under it reads its own reason alone', () => {
    const reason = 'order route failed after commit: the booking could not be saved';
    expect(attentionOf(heldTicketedRow(reason))).toEqual({ kind: 'held_ticketed', reason, since: at });
  });

  it('a retiming resolved by a person before the hold is not named again', () => {
    const booking = heldTicketedRow('order route failed after commit: boom', {
      ...retimed(), resolved_at: at, resolved_by: 'desk@jetsetterss.com', resolution: 'Told the customer',
    });
    expect(attentionOf(booking).reason).toBe('order route failed after commit: boom');
  });

  it('kind and time stay what "Mark as handled" compares against', () => {
    const booking = heldTicketedRow('order route failed after commit: boom', retimed());
    const attention = attentionOf(booking);
    expect(attention.kind).toBe('held_ticketed');
    expect(attention.since).toBe(at);
  });

  it('a ticketed booking with the schedule change on top is still "Airline changed the schedule"', () => {
    const booking = heldTicketedRow('ignored', null);
    booking.booking_details.needs_review = { ...retimed(), at };
    expect(attentionOf(booking)).toEqual({ kind: 'schedule_changed', reason: 'schedule_changed_by_airline', since: at });
  });

  it('saved normally, the desk reads the schedule change as before', async () => {
    chainAnswering({ ticketed: true, tickets: [TICKET], gds: { ticketed: true }, needsReview: retimed() });
    const table = fakeBookingsTable([checkoutRow()]);

    await orderWith(table);

    expect(attentionLabel(attentionOf(table.row(REF)))).toBe('Airline changed the schedule');
  });
});
