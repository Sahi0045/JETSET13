import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  const chain = {};
  for (const m of ['select', 'update', 'insert', 'upsert', 'eq', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.maybeSingle = chain.single;
  return { ...actual, supabase: { from: vi.fn(() => chain) } };
});

/**
 * The chain issued the ticket, then the booking's final save failed.
 *
 * persistCommittedPnr writes `gds.ticketed: false` at the commit, so the alarm
 * sees a booking whose final save failed. When issuance succeeded and only
 * the save failed (saveBookingToDatabase returning null), nothing else was
 * written: no review flag, no ticket numbers, and the route answered 200
 * ticketed. The alarm then read the row as never ticketed and told staff "no
 * ticket was issued ... ticket it, or refund it" with "ticketed: NO", and the
 * desk listed it "Paid, seats held, no ticket" - of a booking holding a live
 * ticket. A second ticket charges the fare twice; a refund leaves the live
 * ticket unpaid for.
 *
 * Now the route records what the chain knew - ticketed, and its numbers - on a
 * held flag, as flagForReview does for any booking held after issuance.
 */

const REF = 'FLTSAVE1';
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

/** The chain commits, and - AUTO_TICKET on - issues and reads the number back, or does not. */
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

const staffAreTold = async (row) => {
  const { selectUnannounced, buildMessage } = await import('../../backend/jobs/needsReviewAlert.job.js');
  const { attentionOf, attentionLabel } = await import('../../shared/reviewQueue.js');
  return { desk: attentionLabel(attentionOf(row)), slack: buildMessage(selectUnannounced([row])) };
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

describe('a ticketed booking whose final save failed', () => {
  it('is recorded ticketed and held, and announced to staff as a live ticket', async () => {
    chainAnswering({ ticketed: true, tickets: [TICKET], gds: { ticketed: true } });
    const table = fakeBookingsTable([checkoutRow()], { fail: finalSaveFails });

    const res = await orderWith(table);

    // The customer is told the ticket is issued, as before.
    expect(res.body).toMatchObject({ success: true, ticketed: true, savedToDatabase: false });

    const stored = table.row(REF);
    expect(stored.booking_details.pnr).toBe('ABC123');
    expect(stored.booking_details.gds.ticketed).toBe(true);
    expect(stored.booking_details.tickets).toEqual([expect.objectContaining({ number: TICKET.number })]);
    expect(stored.booking_details.needs_review).toMatchObject({ ticketed: true, reason: expect.stringMatching(/^order route failed after commit/) });
    expect(stored.status).toBe('confirmed');

    const told = await staffAreTold(stored);
    expect(told.desk).toBe('Ticketed, customer not sent it');
    expect(told.slack).toMatch(/held after its ticket was issued/);
    expect(told.slack).toMatch(/ticketed: yes/);
    expect(told.slack).not.toMatch(/ticket it, or refund it/);
    expect(told.slack).not.toMatch(/ticketed: NO/);
    // The held email ("not a ticket") is not sent to a ticketed booking.
    expect(send).not.toHaveBeenCalled();
  });
});

// Fences: the outcomes next to it, unchanged.
describe('around it', () => {
  it('an unticketed booking whose final save failed is still "paid but not ticketed"', async () => {
    chainAnswering({ ticketed: false, tickets: [], gds: { ticketed: false } });
    const table = fakeBookingsTable([checkoutRow()], { fail: finalSaveFails });

    const res = await orderWith(table);

    expect(res.body).toMatchObject({ success: true, ticketed: false, savedToDatabase: false });
    const stored = table.row(REF);
    expect(stored.booking_details.gds.ticketed).toBe(false);
    expect(stored.booking_details.needs_review).toBeUndefined();
    // The route has stopped, and nothing renews the chain's claim: the alarm
    // judges the row once it lapses, not while the chain may still be issuing
    // (alarmWaitsForRunningChain.test.js).
    const { CHAIN_CLAIM_TTL_MS } = await import('../../backend/utils/bookingChainClaim.js');
    const lapsed = { ...stored.booking_details.gds_chain, committedAt: new Date(Date.now() - CHAIN_CLAIM_TTL_MS - 1_000).toISOString() };
    const told = await staffAreTold({ ...stored, booking_details: { ...stored.booking_details, gds_chain: lapsed } });
    expect(told.desk).toBe('Paid, seats held, no ticket');
    expect(told.slack).toMatch(/paid but not ticketed/);
  });

  it('a ticketed booking whose final save went through is not flagged', async () => {
    chainAnswering({ ticketed: true, tickets: [TICKET], gds: { ticketed: true } });
    const table = fakeBookingsTable([checkoutRow()]);

    const res = await orderWith(table);

    expect(res.body).toMatchObject({ success: true, ticketed: true, savedToDatabase: true });
    const stored = table.row(REF);
    expect(stored.booking_details.needs_review ?? null).toBeNull();
    expect(stored.booking_details.tickets).toEqual([expect.objectContaining({ number: TICKET.number })]);
    expect((await staffAreTold(stored)).desk).toBeNull();
  });

  it('a ticketed booking cancelled before its save is left cancelled', async () => {
    chainAnswering({ ticketed: true, tickets: [TICKET], gds: { ticketed: true } });
    let cancelled = false;
    const table = fakeBookingsTable([checkoutRow()], {
      fail: (query) => {
        if (!finalSaveFails(query)) return false;
        // A cancellation lands, then the save's write meets an error.
        if (!cancelled) {
          cancelled = true;
          Object.assign(table.row(REF), { status: 'cancelled' });
        }
        return true;
      },
    });

    await orderWith(table);

    expect(table.row(REF).status).toBe('cancelled');
    expect(table.row(REF).booking_details.needs_review ?? null).toBeNull();
  });
});
