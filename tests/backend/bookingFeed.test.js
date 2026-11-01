import { beforeEach, describe, expect, it, vi } from 'vitest';
import { feedEventsOf, feedMessage, runOnce, LOG_TABLE } from '../../backend/jobs/bookingFeed.job.js';
import { TICKET_REFUSED_REASON } from '../../shared/reviewQueue.js';
import { supabaseMock } from './setup.js';

/**
 * The owner asked for every booking, failure and cancellation in the alerts
 * channel (31 Oct). Only stuck money was posted there: a new booking, a
 * booking the airline refused to ticket, or a customer's cancellation reached
 * no one.
 */

const NOW = Date.parse('2026-10-31T12:00:00Z');
const recent = new Date(NOW - 60 * 60 * 1000).toISOString();

const leg = {
  direction: 'outbound',
  origin: 'SFO',
  destination: 'MCO',
  departureDate: '2027-01-21',
  segments: [{ flightNumber: 'AS1471', carrierCode: 'AS', departureDate: '2027-01-21', departureTime: '18:53' }],
};

const booked = (overrides = {}) => ({
  booking_reference: 'FLTBOOKED1',
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 742.53,
  created_at: recent,
  updated_at: recent,
  passenger_details: [{ firstName: 'Priya', lastName: 'Sharma', email: 'priya@example.com', phone: '+15550100' }],
  ...overrides,
  booking_details: {
    pnr: 'BMYESL',
    itineraries: [leg],
    cabin_class: 'ECONOMY',
    customer_email: 'priya@example.com',
    arc_captured_amount: 742.53,
    arc_captured_currency: 'USD',
    gds: { ticketed: true, node: 'noded2.production.webservices.amadeus.co' },
    gds_chain: { state: 'finished', finishedAt: recent },
    tickets: [{ number: '027-1' }, { number: '027-2' }],
    verified_charge: { passengers: 2, walletCoins: 0, coupon: null },
    ...(overrides.booking_details || {}),
  },
});

const cancellation = (fields = {}) => ({
  reason: 'Change of plans',
  currency: 'USD',
  refundAmount: 660.53,
  cancellationFee: 50,
  paymentAction: 'PARTIAL_REFUND',
  ticketsVoided: true,
  amadeusCancelled: true,
  coinsReturned: 0,
  cancelledAt: recent,
  ...fields,
});

const kinds = (booking) => feedEventsOf(booking).map((event) => event.kind);

describe('what a booking row is announced as', () => {
  it('a paid flight whose booking chain finished, with a PNR, is a new booking', () => {
    expect(feedEventsOf(booked())).toEqual([
      expect.objectContaining({ kind: 'booked', key: 'FLTBOOKED1:booked', booking_reference: 'FLTBOOKED1', at: recent }),
    ]);
  });

  it('a booking still being ticketed is not announced yet', () => {
    const running = booked({ booking_details: { gds: { ticketed: false }, tickets: [], gds_chain: { state: 'committed' } } });
    expect(kinds(running)).toEqual([]);
  });

  it('a checkout nobody paid for is not announced, nor its clean-up', () => {
    expect(kinds(booked({ status: 'pending', payment_status: 'unpaid', booking_details: { pnr: null, gds_chain: null } }))).toEqual([]);
    const cleaned = booked({
      status: 'cancelled',
      payment_status: 'unpaid',
      booking_details: { pnr: null, cancellation: cancellation({ paymentAction: 'NOTHING_TO_REFUND', amadeusCancelled: false, refundAmount: 0 }) },
    });
    expect(kinds(cleaned)).toEqual([]);
  });

  it('a cancelled booking is a cancellation, not a new booking', () => {
    expect(kinds(booked({ status: 'cancelled', payment_status: 'partially_refunded', booking_details: { cancellation: cancellation() } })))
      .toEqual(['cancelled']);
  });

  it('a ticket the airline refused is a failed booking, though it is recorded as a cancellation', () => {
    const refused = booked({
      status: 'cancelled',
      payment_status: 'refunded',
      booking_details: { cancellation: cancellation({ reason: `${TICKET_REFUSED_REASON}: 2161 PROHIBITED TICKETING CARRIER`, paymentAction: 'VOID' }) },
    });
    expect(kinds(refused)).toEqual(['failed']);
  });

  it('a paid booking that failed is announced even while the money is still held', () => {
    const held = booked({
      status: 'pending',
      booking_details: { pnr: null, gds_chain: null, fulfillment_failed: { at: recent, error: 'seat sold out', reversal: { reversed: false, action: 'FAILED' } } },
    });
    expect(kinds(held)).toEqual(['failed']);
  });

  it('a paid cruise is a new booking', () => {
    const cruise = { booking_reference: 'CRZ1', travel_type: 'cruise', status: 'confirmed', payment_status: 'paid', created_at: recent, booking_details: { cruise_name: 'Caribbean Escape', departure_date: '2026-12-01' } };
    expect(kinds(cruise)).toEqual(['booked']);
  });
});

describe('the message', () => {
  it('says what was booked, for how much, and whether it is ticketed', () => {
    const text = feedMessage({ kind: 'booked' }, booked({ booking_details: { trip_reward: { code: 'VIKAS-HGI', coins: 5000 } } }));
    expect(text).toContain('New flight booking');
    expect(text).toContain('FLTBOOKED1');
    expect(text).toContain('SFO → MCO');
    expect(text).toContain('AS1471');
    expect(text).toContain('2 travellers');
    expect(text).toContain('paid 742.53 USD');
    expect(text).toContain('PNR BMYESL');
    expect(text).toContain('ticketed (2 tickets)');
    expect(text).toContain('trip reward VIKAS-HGI: 50.00 USD');
    expect(text).not.toContain('test booking');
  });

  it('never carries the customer: no name, email or phone', () => {
    const texts = [
      feedMessage({ kind: 'booked' }, booked()),
      feedMessage({ kind: 'cancelled' }, booked({ status: 'cancelled', booking_details: { cancellation: cancellation() } })),
    ].join('\n');
    expect(texts).not.toMatch(/Priya|Sharma|priya@example\.com|5550100/);
  });

  it('marks a booking made on the Amadeus test system', () => {
    const test = booked({ booking_details: { gds: { ticketed: true, node: 'noded2.test.webservices.amadeus.com' } } });
    expect(feedMessage({ kind: 'booked' }, test)).toContain('test booking');
  });

  it('says a failed booking whose money was not returned needs a refund by hand', () => {
    const held = booked({ status: 'pending', booking_details: { fulfillment_failed: { at: recent, error: 'seat sold out', reversal: { reversed: false, action: 'FAILED' } } } });
    const text = feedMessage({ kind: 'failed' }, held);
    expect(text).toContain('Booking failed after payment');
    expect(text).toContain('seat sold out');
    expect(text).toContain('refund it by hand');
  });

  it('gives a cancellation its reason, refund and fee', () => {
    const text = feedMessage({ kind: 'cancelled' }, booked({ status: 'cancelled', booking_details: { cancellation: cancellation() } }));
    expect(text).toContain('Booking cancelled');
    expect(text).toContain('reason: Change of plans');
    expect(text).toContain('refund 660.53 USD (partly refunded)');
    expect(text).toContain('50.00 USD kept as the fee');
    expect(text).toContain('tickets voided');
  });

  it('cannot be turned into a Slack link or mention by what a customer typed', () => {
    const text = feedMessage({ kind: 'cancelled' }, booked({ status: 'cancelled', booking_details: { cancellation: cancellation({ reason: '<!channel> <https://x.test|click> & go' }) } }));
    expect(text).toContain('reason: &lt;!channel&gt; &lt;https://x.test|click&gt; &amp; go');
  });
});

describe('posting', () => {
  let logged;
  let claimedOnly;
  let calls;

  const mockTables = (rows) => {
    calls = { upserts: [], stamps: [], deletes: [], range: 0 };
    const bookings = {
      select: vi.fn(() => bookings),
      gte: vi.fn(() => bookings),
      order: vi.fn(() => bookings),
      range: vi.fn(async () => { calls.range += 1; return { data: rows, error: null }; }),
    };
    const log = {
      select: vi.fn(() => ({ in: vi.fn(async () => ({ data: logged, error: null })) })),
      upsert: vi.fn((claim) => {
        calls.upserts.push(claim);
        const won = claimedOnly ? claim.filter((row) => claimedOnly.includes(row.event_key)) : claim;
        return { select: vi.fn(async () => ({ data: won.map((row) => ({ event_key: row.event_key })), error: null })) };
      }),
      update: vi.fn(() => ({ eq: vi.fn(async (_column, key) => { calls.stamps.push(key); return { error: null }; }) })),
      delete: vi.fn(() => ({ in: vi.fn((_column, keys) => ({ is: vi.fn(async () => { calls.deletes.push(...keys); return { error: null }; }) })) })),
    };
    supabaseMock.from.mockImplementation((table) => (table === LOG_TABLE ? log : bookings));
    return { bookings, log };
  };

  const posted = () => globalThis.fetch.mock.calls.map(([, init]) => JSON.parse(init.body).text);

  beforeEach(() => {
    logged = [];
    claimedOnly = null;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' }));
  });

  it('posts each new event and records it as posted', async () => {
    mockTables([booked(), booked({ booking_reference: 'FLTCANCEL1', status: 'cancelled', booking_details: { cancellation: cancellation() } })]);

    const result = await runOnce({ webhookUrl: 'https://hooks.slack.test/x', now: NOW });

    expect(result).toEqual({ announced: 2 });
    expect(posted()).toHaveLength(2);
    expect(posted()[0]).toContain('FLTBOOKED1');
    expect(posted()[1]).toContain('FLTCANCEL1');
    expect(calls.stamps).toEqual(['FLTBOOKED1:booked', 'FLTCANCEL1:cancelled']);
  });

  it('does not post an event twice', async () => {
    mockTables([booked()]);
    logged = [{ event_key: 'FLTBOOKED1:booked', posted_at: recent, claimed_at: recent }];

    expect(await runOnce({ webhookUrl: 'https://hooks.slack.test/x', now: NOW })).toEqual({ announced: 0 });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  // Two processes reading the same rows: only the one whose claim landed posts.
  it('posts only what this run claimed', async () => {
    mockTables([booked(), booked({ booking_reference: 'FLTOTHER1' })]);
    claimedOnly = ['FLTOTHER1:booked'];

    await runOnce({ webhookUrl: 'https://hooks.slack.test/x', now: NOW });

    expect(posted()).toHaveLength(1);
    expect(posted()[0]).toContain('FLTOTHER1');
  });

  it('lets go of what Slack refused, so the next run posts it', async () => {
    mockTables([booked(), booked({ booking_reference: 'FLTSECOND1' })]);
    globalThis.fetch
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => 'ok' })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'rollup_error' });

    await expect(runOnce({ webhookUrl: 'https://hooks.slack.test/x', now: NOW })).rejects.toThrow(/refused/);

    expect(calls.stamps).toEqual(['FLTBOOKED1:booked']);
    expect(calls.deletes).toEqual(['FLTSECOND1:booked']);
  });

  it('takes back a claim left unposted by a run that died, and posts it', async () => {
    mockTables([booked()]);
    logged = [{ event_key: 'FLTBOOKED1:booked', posted_at: null, claimed_at: new Date(NOW - 60 * 60 * 1000).toISOString() }];

    await runOnce({ webhookUrl: 'https://hooks.slack.test/x', now: NOW });

    expect(calls.deletes).toEqual(['FLTBOOKED1:booked']);
    expect(posted()).toHaveLength(1);
  });

  it('leaves a claim another run is posting right now', async () => {
    mockTables([booked()]);
    logged = [{ event_key: 'FLTBOOKED1:booked', posted_at: null, claimed_at: new Date(NOW - 30 * 1000).toISOString() }];

    await runOnce({ webhookUrl: 'https://hooks.slack.test/x', now: NOW });

    expect(calls.deletes).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  // The first run after a deploy must not post every booking ever made.
  it('does not post what happened more than a day ago', async () => {
    const old = new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString();
    mockTables([booked({ created_at: old, updated_at: recent, booking_details: { gds_chain: { state: 'finished', finishedAt: old } } })]);

    expect(await runOnce({ webhookUrl: 'https://hooks.slack.test/x', now: NOW })).toEqual({ announced: 0 });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('a dry run posts nothing and claims nothing', async () => {
    mockTables([booked()]);

    const result = await runOnce({ dryRun: true, now: NOW });

    expect(result.wouldAnnounce).toEqual(['FLTBOOKED1:booked']);
    expect(result.messages[0]).toContain('New flight booking');
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(calls.upserts).toEqual([]);
  });
});
