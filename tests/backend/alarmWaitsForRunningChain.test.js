import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { CHAIN_CLAIM_TTL_MS, QUEUED_CHAIN_TTL_MS } from '../../backend/utils/bookingChainClaim.js';
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
 * The paid-not-ticketed alarm ticking while the booking chain is still issuing.
 *
 * persistCommittedPnr writes the PNR and `gds.ticketed: false` at the commit,
 * and the row keeps that until the final save - seconds for an airline
 * Amadeus hosts, and up to AMADEUS_WS_AIRLINE_LOCATOR_WAIT_MS plus the issue
 * retries for one that confirms after the commit. The alarm, every fifteen
 * minutes, read that row as the unflagged "paid, PNR, never ticketed" case:
 * it posted "no ticket was issued ... ticket it, or refund it" with
 * "ticketed: NO", and stamped the row with its flag. The chain then ticketed
 * the booking, the final save kept that flag, and nothing ever corrected the
 * post. A person who refunded from Slack paid out against a live ticket; one
 * who ticketed from Slack issued a second.
 *
 * Now the unflagged "paid, PNR, never ticketed" row is neither announced nor
 * stamped while something still holds it (liveChainState: the chain issuing,
 * a cancel, the queue). That holder writes what it did, and a later tick
 * judges the row by it; a claim nothing renews any more - a process that died
 * mid-chain - lapses, and the row is announced as before. A flag is announced
 * as it is written, as before: the order route writes one when it stops.
 */

const REF = 'FLTMIDCH';
const INDICATOR = 'SI-MID-1';

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
const WEBHOOK = 'https://hooks.slack.test/x';
const send = vi.fn();
const posted = [];
let duringChain = null;

/**
 * The chain commits, and the fifteen-minute alarm tick lands while it is still
 * issuing - what the row holds at that moment is recorded too. Then it answers.
 */
const alarmTicksMidChain = (answer) => vi.doMock('../../backend/services/flightProvider.js', () => ({
  default: {
    priceFlightOffer: vi.fn(async (offer) => ({
      success: true,
      data: { flightOffers: [{ ...offer, price: { currency: 'USD', total: '291.00', grandTotal: '291.00', base: '110.00' } }] },
    })),
    createFlightOrder: vi.fn(async (_orderData, options) => {
      await options.onCommitted({ pnr: 'ABC123', tstRefs: ['1'], priced: { total: 291, currency: 'USD' } });
      const { runOnce } = await import('../../backend/jobs/needsReviewAlert.job.js');
      const tick = await runOnce({ webhookUrl: WEBHOOK });
      const supabase = (await import('../../backend/config/supabase.js')).default;
      const { data } = await supabase.from('bookings').select('booking_details').eq('booking_reference', REF).single();
      duringChain = { tick, flag: data?.booking_details?.needs_review ?? null };
      return { success: true, pnr: 'ABC123', orderId: 'ABC123', mode: 'LIVE_GDS_BOOKING', ...answer };
    }),
  },
  providerStatus: () => ({ bookingEnabled: true, wsap: '1ASIWTEST' }),
}));

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

const nextTick = async () => {
  const { runOnce } = await import('../../backend/jobs/needsReviewAlert.job.js');
  return runOnce({ webhookUrl: WEBHOOK });
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
  posted.length = 0;
  duringChain = null;
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    posted.push(JSON.parse(options.body).text);
    return { ok: true, status: 200, text: async () => 'ok' };
  }));
  const mailer = { sendBookingNotificationEmails: send, sendEmail: vi.fn(), sendCancellationNotificationEmails: vi.fn() };
  vi.doMock('../../backend/services/emailService.js', () => ({ ...mailer, default: mailer }));
});

afterEach(() => {
  vi.doUnmock('../../backend/services/emailService.js');
  vi.doUnmock('../../backend/services/flightProvider.js');
  vi.unstubAllGlobals();
});

describe('the paid-not-ticketed alarm ticks while the chain is still issuing', () => {
  it('says nothing and stamps nothing; the chain tickets it, and nothing is announced after', async () => {
    alarmTicksMidChain({ ticketed: true, tickets: [TICKET], gds: { ticketed: true } });
    const table = fakeBookingsTable([checkoutRow()]);

    const res = await orderWith(table);

    expect(duringChain).toEqual({ tick: { announced: 0 }, flag: null });
    expect(res.body).toMatchObject({ success: true, ticketed: true, savedToDatabase: true });
    const stored = table.row(REF);
    expect(stored.booking_details.gds.ticketed).toBe(true);
    expect(stored.booking_details.needs_review ?? null).toBeNull();

    expect(await nextTick()).toEqual({ announced: 0 });
    expect(posted).toEqual([]);
  });

  it('the chain leaves it unticketed (AUTO_TICKET off): announced once, by the tick after the chain', async () => {
    alarmTicksMidChain({ ticketed: false, tickets: [], gds: { ticketed: false } });
    const table = fakeBookingsTable([checkoutRow()]);

    await orderWith(table);

    expect(duringChain).toEqual({ tick: { announced: 0 }, flag: null });
    expect(posted).toEqual([]);

    expect(await nextTick()).toEqual({ announced: 1 });
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatch(/paid but not ticketed/);
    expect(posted[0]).toMatch(/ticketed: NO/);
    expect(table.row(REF).booking_details.needs_review).toMatchObject({
      reason: 'PNR committed, never ticketed', alerted_at: expect.any(String),
    });
    expect(await nextTick()).toEqual({ announced: 0 });
  });
});

// The rule itself, on rows: what holds the booking, and for how long.
describe('selectUnannounced and a booking something still holds', () => {
  const ago = (ms) => new Date(Date.now() - ms).toISOString();
  const paidUnticketed = (gdsChain, extra = {}) => ({
    booking_reference: 'FLTROW',
    status: 'pending',
    payment_status: 'paid',
    total_amount: 291,
    created_at: ago(60_000),
    booking_details: { pnr: 'ABC123', gds: { ticketed: false }, ...(gdsChain ? { gds_chain: gdsChain } : {}), ...extra },
  });
  const select = async (row) => (await import('../../backend/jobs/needsReviewAlert.job.js')).selectUnannounced([row]);

  it('the chain committed and still issuing: skipped', async () => {
    expect(await select(paidUnticketed({ state: 'committed', committedAt: ago(5_000) }))).toEqual([]);
  });

  it('the chain before its commit, a cancel, or the queue holding it: skipped', async () => {
    expect(await select(paidUnticketed({ state: 'in_progress', startedAt: ago(5_000) }))).toEqual([]);
    expect(await select(paidUnticketed({ state: 'cancelling', startedAt: ago(5_000) }))).toEqual([]);
    expect(await select(paidUnticketed({ state: 'queued', startedAt: ago(5_000) }))).toEqual([]);
  });

  // Fences: the neighbouring states are announced as before.
  it('a chain that finished: announced', async () => {
    const row = paidUnticketed({ state: 'finished', committedAt: ago(60_000), finishedAt: ago(30_000) });
    expect(await select(row)).toEqual([row]);
  });

  it('a claim nothing renews any more (the process died mid-chain): announced once it lapses', async () => {
    const committed = paidUnticketed({ state: 'committed', committedAt: ago(CHAIN_CLAIM_TTL_MS + 1_000) });
    expect(await select(committed)).toEqual([committed]);
    const started = paidUnticketed({ state: 'in_progress', startedAt: ago(CHAIN_CLAIM_TTL_MS + 1_000) });
    expect(await select(started)).toEqual([started]);
    const queued = paidUnticketed({ state: 'queued', startedAt: ago(QUEUED_CHAIN_TTL_MS + 1_000) });
    expect(await select(queued)).toEqual([queued]);
  });

  it('no chain recorded at all: announced', async () => {
    const row = paidUnticketed(null);
    expect(await select(row)).toEqual([row]);
  });

  it('a chain that failed and was flagged: announced', async () => {
    const row = paidUnticketed({ state: 'finished', committedAt: ago(60_000), finishedAt: ago(30_000) }, {
      needs_review: { reason: 'chain failed after commit at issueTicket', ticketed: false, at: ago(30_000) },
    });
    expect(await select(row)).toEqual([row]);
  });

  // The flag is what the order route wrote when it stopped: a commit that
  // never answered keeps the chain's `in_progress` claim until it lapses
  // (commitNeverAnsweredReadBack.test.js), and is announced as it is written.
  it('a flag written as the order route stopped, its claim not yet lapsed: announced', async () => {
    const row = paidUnticketed({ state: 'in_progress', startedAt: ago(5_000) }, {
      pnr: undefined,
      needs_review: { reason: 'chain failed after commit at commit', ticketed: false, at: ago(4_000) },
    });
    expect(await select(row)).toEqual([row]);
  });
});
