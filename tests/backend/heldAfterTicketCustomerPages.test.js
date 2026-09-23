import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

// Same harness as heldForReviewEmail.test.js.
vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  const chain = {};
  for (const m of ['select', 'update', 'insert', 'upsert', 'eq', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.maybeSingle = chain.single;
  return { ...actual, supabase: { from: vi.fn(() => chain) } };
});

/**
 * A booking the order route held for a person AFTER the chain reported its
 * ticket issued (the outer catch, committedTicketed). flagForReview writes
 * gds.ticketed true and `needs_review.ticketed: true`, and no ticket numbers.
 *
 * The desk and Slack say the ticket is issued, and a retry of the order
 * answers ALREADY_BOOKED ticketed. Every page the customer has said the
 * opposite: the order page "your ticket could not be issued automatically",
 * the held email "a reservation, not a ticket ... do not travel on this
 * email", My Trips "Needs attention ... your ticket has not been issued yet"
 * under the Failed tab, and the document Manage Booking offers "not a ticket"
 * and "Ticket not yet issued". The pages read only ticket numbers and the
 * chain's numbers flag, and this booking has neither.
 *
 * Now the server names it as the issued ticket whose number has not reached
 * us (toClientBooking `ticket_numbers_missing`), the order route's answer
 * says ticketed, and no held email is sent: ticket sync reads the numbers
 * and sends the e-ticket (ticketSyncHeldAfterIssue.test.js).
 */

const REF = 'FLTHT9';
const INDICATOR = 'SI-HT-9';

const offer = {
  type: 'flight-offer',
  id: '1',
  source: 'GDS',
  itineraries: [{
    duration: 'PT7H45M',
    segments: [{
      id: '1',
      departure: { iataCode: 'JFK', at: '2099-11-15T19:25:00' },
      arrival: { iataCode: 'LHR', at: '2099-11-16T06:10:00' },
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
  created_at: '2026-09-15T10:00:00Z',
  booking_details: {
    order_id: REF,
    success_indicator: INDICATOR,
    customer_email: 'jane@example.com',
    arc_captured_amount: 291,
    arc_captured_currency: 'USD',
    pending_booking_data: { bookingData: { originalOffer: offer, passengerData: [{ firstName: 'Jane', lastName: 'Doe', gender: 'FEMALE', dateOfBirth: '1990-01-01' }] } },
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

const send = vi.fn();

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

/**
 * The chain commits and answers with `ticketed` - then reading its answer
 * fails, which lands in the order route's outer catch.
 */
const chainAnswering = (ticketed) => vi.doMock('../../backend/services/flightProvider.js', () => ({
  default: {
    priceFlightOffer: vi.fn(async (priced) => ({
      success: true,
      data: { flightOffers: [{ ...priced, price: { currency: 'USD', total: '291.00', grandTotal: '291.00', base: '110.00' } }] },
    })),
    createFlightOrder: vi.fn(async (_orderData, options) => {
      await options.onCommitted({ pnr: 'HT9PNR', tstRefs: ['1'], priced: { total: 291, currency: 'USD' } });
      return {
        success: true, pnr: 'HT9PNR', orderId: 'HT9PNR', ticketed, mode: 'LIVE_GDS_BOOKING',
        get tickets() { throw new Error('boom'); },
      };
    }),
  },
  providerStatus: () => ({ bookingEnabled: true, wsap: '1ASIWTEST' }),
}));

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

const NOT_ISSUED = /not been issued|not yet issued|could not be issued|is being issued|not a ticket|once it is issued/i;

/** What My Trips, Manage Booking and the document read, from what GET /flights/bookings sends. */
const pagesSay = async (row) => {
  const { toClientBooking } = await import('../../backend/routes/flight.routes.js');
  const client = toClientBooking(row);
  const { attentionMessage, bookingStatusBadge, needsAttention } = await import('../../frontend/src/utils/bookingStatus.js');
  const { ticketState, documentState } = await import('../../frontend/src/utils/eTicket.js');
  return {
    client,
    // A raw row (the fallback when a copy carries no server verdict) reads the same.
    raw: ticketState(row),
    ticketState: ticketState(client),
    documentState: documentState(client),
    badge: bookingStatusBadge(client).label,
    failedTab: needsAttention(client),
    myTrips: attentionMessage(client),
  };
};

describe('a booking held after its ticket was issued, on the customer\'s pages', () => {
  it('the order route, the desk and the customer pages agree the ticket is issued', async () => {
    chainAnswering(true);
    const { app, table } = await appWith([checkoutRow()]);

    const first = await request(app).post('/api/flights/order').send(order);
    expect(first.status).toBe(202);
    // The order page renders its ticketed outcome from this.
    expect(first.body).toMatchObject({ ticketed: true, needsReview: true, pnr: 'HT9PNR' });
    expect(first.body.message).not.toMatch(NOT_ISSUED);
    // No "Reservation held - our team is finishing your ticket" email.
    expect(send).not.toHaveBeenCalled();

    const row = table.row(REF);
    // What flagForReview wrote: issued, held for a person, no numbers.
    expect(row.booking_details.gds.ticketed).toBe(true);
    expect(row.booking_details.needs_review).toMatchObject({ ticketed: true });
    expect(row.booking_details.tickets ?? []).toHaveLength(0);

    // The desk says the ticket is issued.
    const { attentionOf, attentionLabel } = await import('../../shared/reviewQueue.js');
    expect(attentionLabel(attentionOf(row))).toBe('Ticketed, customer not sent it');

    // The order route's own retry says the ticket is issued, and sends nothing.
    const retry = await request(app).post('/api/flights/order').send(order);
    expect(retry.body.mode).toBe('ALREADY_BOOKED');
    expect(retry.body.ticketed).toBe(true);
    expect(send).not.toHaveBeenCalled();

    const said = await pagesSay(row);
    expect({ ...said, client: undefined }).toEqual({
      client: undefined,
      raw: 'pending',
      ticketState: 'pending',
      documentState: 'ticket_pending',
      badge: 'Ticket issued',
      failedTab: false,
      myTrips: expect.stringMatching(/Your ticket has been issued/),
    });
    expect(said.myTrips).not.toMatch(NOT_ISSUED);
  });

  it('and once the desk marks it handled, the pages still say it', async () => {
    chainAnswering(true);
    const { app, table } = await appWith([checkoutRow()]);
    await request(app).post('/api/flights/order').send(order);

    const row = table.row(REF);
    const handled = {
      ...row,
      booking_details: {
        ...row.booking_details,
        needs_review: { ...row.booking_details.needs_review, resolved_at: new Date().toISOString(), resolution: 'e-ticket sent by hand' },
      },
    };
    const said = await pagesSay(handled);
    expect(said).toMatchObject({ raw: 'pending', ticketState: 'pending', documentState: 'ticket_pending', badge: 'Ticket issued', failedTab: false });
    expect(said.myTrips ?? '').not.toMatch(NOT_ISSUED);
  });
});

// Fence: held BEFORE any ticket was issued - unchanged.
describe('a booking held before its ticket was issued', () => {
  it('is still a held reservation with no ticket, and is sent the held email', async () => {
    chainAnswering(false);
    const { app, table } = await appWith([checkoutRow()]);

    const first = await request(app).post('/api/flights/order').send(order);
    expect(first.status).toBe(202);
    expect(first.body.ticketed).toBeUndefined();
    expect(first.body.message).toMatch(/Your seats are reserved with the airline and our team is completing your booking/);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].heldForReview).toBe(true);

    const row = table.row(REF);
    expect(row.booking_details.gds.ticketed).toBe(false);
    const said = await pagesSay(row);
    expect(said).toMatchObject({ raw: 'none', ticketState: 'none', documentState: 'held', badge: 'Needs attention', failedTab: true });
    expect(said.myTrips).toMatch(/your ticket has not been issued yet/);
  });
});

// Fence: a ticket a cancel voided is not an issued one, held or not.
describe('a booking held after issue whose tickets a cancel then voided', () => {
  it('is not called issued', async () => {
    const row = {
      booking_reference: REF, travel_type: 'flight', status: 'confirmed', payment_status: 'paid', total_amount: 291,
      booking_details: {
        pnr: 'HT9PNR', gds: { ticketed: true }, voided_tickets: ['108-2412345671'],
        needs_review: {
          reason: 'GDS cancellation failed; refund withheld to avoid paying out against a live booking', source: 'cancellation',
          cancelFailed: true, at: '2026-09-16T10:00:00Z',
          previous: { reason: 'order route failed after commit: boom', ticketed: true, at: '2026-09-15T10:05:00Z' },
        },
      },
    };
    const said = await pagesSay(row);
    expect(said.client.needs_review.ticket_numbers_missing).toBe(false);
    expect(said).toMatchObject({ raw: 'none', ticketState: 'none', documentState: 'tickets_voided' });
  });
});
