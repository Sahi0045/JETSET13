import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTO_COMPLETE_WINDOW_MS,
  GRACE_MS,
  LOOKBACK_MS,
  PAYABLE_MS,
  RECHECK_MS,
  checkoutSite,
  runOnce,
  selectCandidates,
  settle,
} from '../../backend/jobs/abandonedCheckout.job.js';
import { buildFlightOrderBody, orderDataFromCheckoutRow } from '../../shared/flightOrderBody.js';
import { provesPayer } from '../../backend/routes/flight.routes.js';
import { supabaseMock } from './setup.js';

/**
 * A customer who pays and closes the tab still gets their booking - or their
 * money back.
 *
 * Booking was driven only by the customer's browser coming back from ARC Pay.
 * A closed tab left the money captured, nothing booked, no email, and a row the
 * paid-not-ticketed alarm could not see: `pending`, no PNR.
 */

const NOW = Date.parse('2026-09-13T12:00:00Z');
const MIN = 60_000;
const ago = (ms) => new Date(NOW - ms).toISOString();

const checkoutRow = ({ booking_details: detailOverrides = {}, ...overrides } = {}) => ({
  id: 'row-1',
  booking_reference: 'FLTABANDON1',
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'unpaid',
  total_amount: 109.21,
  created_at: ago(45 * MIN),
  ...overrides,
  booking_details: {
    order_id: 'FLTABANDON1',
    session_id: 'SESSION-1',
    success_indicator: 'SUCCESS-INDICATOR-1',
    pending_booking_data: {
      orderId: 'FLTABANDON1',
      returnUrl: 'https://www.jetsetterss.com/payment/callback?orderId=FLTABANDON1&bookingType=flight',
      customerEmail: 'ann@example.com',
      bookingData: {
        amount: 109.21,
        originalOffer: {
          id: '1',
          source: 'GDS',
          itineraries: [{ segments: [] }],
          travelerPricings: [{ travelerId: '1', travelerType: 'ADULT' }],
          price: { total: '80.20', currency: 'USD' },
        },
        passengerData: [{
          firstName: 'Ann', lastName: 'Traveller', dateOfBirth: '1990-04-02', gender: 'FEMALE', type: 'ADULT',
          email: 'ann@example.com', mobile: '5550100', nationality: 'US', passportNumber: 'X1234567', passportExpiry: '2030-01-01',
        }],
        bookingDetails: { contact: { email: 'ann@example.com', phone: '5550100' } },
        calculatedFare: { totalAmount: 109.21 },
      },
    },
    ...detailOverrides,
  },
});

const select = (rows, opts = {}) => selectCandidates(rows, { now: NOW, site: 'site', ...opts });

describe('which checkouts it looks at', () => {
  it('a public-site checkout that never reached the order route, past the grace period', () => {
    expect(select([checkoutRow()])).toHaveLength(1);
  });

  it("gives the customer's own browser 30 minutes first", () => {
    expect(select([checkoutRow({ created_at: ago(GRACE_MS - MIN) })])).toHaveLength(0);
  });

  it('leaves anything the order route has already touched', () => {
    const touched = [
      checkoutRow({ booking_details: { pnr: 'ABC123' } }),
      checkoutRow({ booking_details: { gds_chain: { state: 'in_progress' } } }),
      checkoutRow({ booking_details: { queued_order: { bookingReference: 'FLTABANDON1' } } }),
      checkoutRow({ booking_details: { needs_review: { reason: 'x' } } }),
      checkoutRow({ status: 'pending_ticketing' }),
      checkoutRow({ status: 'cancelled' }),
      checkoutRow({ payment_status: 'refunded' }),
    ];
    expect(select(touched)).toHaveLength(0);
  });

  // Local and production share the database.
  it('settles only the checkouts its own site took', () => {
    const local = checkoutRow({ booking_details: { pending_booking_data: { ...checkoutRow().booking_details.pending_booking_data, returnUrl: 'http://localhost:5173/payment/callback' } } });
    const unknown = checkoutRow({ booking_details: { pending_booking_data: { ...checkoutRow().booking_details.pending_booking_data, returnUrl: undefined } } });
    expect(checkoutSite(local)).toBe('local');
    expect(checkoutSite(checkoutRow())).toBe('site');
    expect(select([local, unknown])).toHaveLength(0);
    expect(select([local, unknown], { site: 'local' })).toHaveLength(1);
  });

  it('leaves checkouts older than a week alone', () => {
    expect(select([checkoutRow({ created_at: ago(LOOKBACK_MS + MIN) })])).toHaveLength(0);
  });

  it('waits when the browser has only just confirmed the payment', () => {
    const handingOff = checkoutRow({ payment_status: 'paid', booking_details: { payment_reconciled_at: ago(2 * MIN) } });
    expect(select([handingOff])).toHaveLength(0);
  });

  it('asks again only after 30 minutes, and never after a final answer', () => {
    const recent = new Map([['FLTABANDON1', { at: NOW - 5 * MIN, final: false }]]);
    const stale = new Map([['FLTABANDON1', { at: NOW - RECHECK_MS, final: false }]]);
    const done = new Map([['FLTABANDON1', { at: NOW - 3 * RECHECK_MS, final: true }]]);
    expect(select([checkoutRow()], { checked: recent })).toHaveLength(0);
    expect(select([checkoutRow()], { checked: stale })).toHaveLength(1);
    expect(select([checkoutRow()], { checked: done })).toHaveLength(0);
  });
});

describe('the order it rebuilds', () => {
  it("is the order page's own body, and the route accepts its proof of payer", () => {
    const { body, problem } = buildFlightOrderBody(orderDataFromCheckoutRow(checkoutRow()));
    const posted = { ...body, resultIndicator: 'SUCCESS-INDICATOR-1' };

    expect(problem).toBeNull();
    expect(posted.bookingReference).toBe('FLTABANDON1');
    expect(posted.flightOffer.id).toBe('1');
    expect(posted.travelers[0]).toMatchObject({ firstName: 'Ann', ptc: 'ADULT', passportNumber: 'X1234567', documentType: 'PASSPORT' });
    expect(posted.contactInfo).toMatchObject({ email: 'ann@example.com', phoneNumber: '5550100' });
    expect(provesPayer({ body: posted }, checkoutRow())).toBe(true);
    expect(provesPayer({ body: { ...posted, resultIndicator: 'SOMEONE-ELSES' } }, checkoutRow())).toBe(false);
  });

  it('reports missing travellers or offer instead of inventing them', () => {
    const noTravellers = orderDataFromCheckoutRow(checkoutRow());
    noTravellers.passengerData = [];
    expect(buildFlightOrderBody(noTravellers).problem).toBe('PASSENGERS_INCOMPLETE');

    const noOffer = orderDataFromCheckoutRow(checkoutRow());
    noOffer.originalOffer = undefined;
    noOffer.selectedFlight = undefined;
    noOffer.flightData = undefined;
    expect(buildFlightOrderBody(noOffer).problem).toBe('OFFER_MISSING');
  });

  // A domestic adult needs no date of birth; a child, or anyone on a trip the
  // review page did not record as domestic, still does.
  it('asks for a date of birth only where the airline needs one', () => {
    const domesticAdult = orderDataFromCheckoutRow(checkoutRow());
    domesticAdult.passengerData = [{ ...domesticAdult.passengerData[0], dateOfBirth: '' }];
    domesticAdult.bookingDetails = { ...domesticAdult.bookingDetails, isInternational: false };
    expect(buildFlightOrderBody(domesticAdult).problem).toBeNull();

    const domesticChild = { ...domesticAdult, passengerData: [{ ...domesticAdult.passengerData[0], type: 'CHILD' }] };
    expect(buildFlightOrderBody(domesticChild).problem).toBe('PASSENGERS_INCOMPLETE');

    const notRecorded = { ...domesticAdult, bookingDetails: { contact: domesticAdult.bookingDetails.contact } };
    expect(buildFlightOrderBody(notRecorded).problem).toBe('PASSENGERS_INCOMPLETE');
  });
});

describe('what it does with a checkout', () => {
  let send;
  let flag;
  const paid = vi.fn(async () => ({ paid: true }));
  const run = (row, reconcile = paid) => settle(row, { now: NOW, reconcile, send, flag });

  beforeEach(() => {
    send = vi.fn(async () => 'confirmed');
    flag = vi.fn(async () => true);
  });

  it('does nothing to a checkout that was not paid, and keeps asking while it still could be', async () => {
    const unpaid = vi.fn(async () => ({ paid: false }));

    expect(await run(checkoutRow(), unpaid)).toEqual({ outcome: 'not-paid', final: false });
    expect(await run(checkoutRow({ created_at: ago(PAYABLE_MS + MIN) }), unpaid)).toEqual({ outcome: 'not-paid', final: true });
    expect(send).not.toHaveBeenCalled();
    expect(flag).not.toHaveBeenCalled();
  });

  it('waits when the gateway cannot answer', async () => {
    const down = vi.fn(async () => ({ paid: false, gatewayUnavailable: true }));
    expect(await run(checkoutRow(), down)).toEqual({ outcome: 'gateway-unavailable', final: false });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends a paid checkout through the order route, as the browser would have', async () => {
    expect(await run(checkoutRow())).toEqual({ outcome: 'booked', final: true });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ booking_reference: 'FLTABANDON1' }),
      expect.objectContaining({ bookingReference: 'FLTABANDON1', resultIndicator: 'SUCCESS-INDICATOR-1' }),
    );
    expect(flag).not.toHaveBeenCalled();
  });

  // The customer may have booked elsewhere by now.
  it('hands a paid checkout older than 6 hours to a human instead of booking it', async () => {
    const result = await run(checkoutRow({ created_at: ago(AUTO_COMPLETE_WINDOW_MS + MIN) }));
    expect(result).toEqual({ outcome: 'flagged-late', final: true });
    expect(send).not.toHaveBeenCalled();
    expect(flag).toHaveBeenCalledWith(expect.anything(), expect.stringMatching(/never came back.*by hand or refund/));
  });

  it('flags a paid checkout whose saved data cannot be booked', async () => {
    const pending = checkoutRow().booking_details.pending_booking_data;
    const row = checkoutRow({ booking_details: { pending_booking_data: { ...pending, bookingData: { ...pending.bookingData, passengerData: [] } } } });
    expect(await run(row)).toEqual({ outcome: 'flagged-incomplete', final: true });
    expect(send).not.toHaveBeenCalled();
    expect(flag).toHaveBeenCalled();
  });

  it('asks for a human when the route refused it (flagging checks the row was left untouched)', async () => {
    send = vi.fn(async () => 'failed');
    expect(await run(checkoutRow())).toEqual({ outcome: 'failed', final: true });
    expect(flag).toHaveBeenCalled();
  });

  it('tries again later when the order route could not be reached', async () => {
    send = vi.fn(async () => 'retry');
    expect(await run(checkoutRow())).toEqual({ outcome: 'retry', final: false });
    expect(flag).not.toHaveBeenCalled();
  });

  it('lets the queue or the returning browser keep a booking they already have', async () => {
    send = vi.fn(async () => 'in-progress');
    expect(await run(checkoutRow())).toEqual({ outcome: 'in-progress', final: true });
  });
});

describe('a run', () => {
  const rowsFromDatabase = (rows) => {
    supabaseMock.from.mockImplementation(() => {
      const chain = {};
      for (const m of ['select', 'eq', 'gte', 'lte', 'order']) chain[m] = vi.fn(() => chain);
      chain.limit = vi.fn().mockResolvedValue({ data: rows, error: null });
      return chain;
    });
  };

  it('settles at most five per run, one at a time, and remembers what it asked', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => checkoutRow({ booking_reference: `FLTABANDON${i}` }));
    rowsFromDatabase(rows);
    const checked = new Map();
    const reconcile = vi.fn(async () => ({ paid: false }));

    const first = await runOnce({ now: NOW, site: 'site', checked, reconcile, send: vi.fn(), flag: vi.fn() });
    expect(first).toHaveLength(5);
    expect(reconcile).toHaveBeenCalledTimes(5);

    // The next run takes the two it has not asked about yet.
    const second = await runOnce({ now: NOW + MIN, site: 'site', checked, reconcile, send: vi.fn(), flag: vi.fn() });
    expect(second.map((r) => r.bookingReference)).toEqual(['FLTABANDON5', 'FLTABANDON6']);
  });

  it('runs in production from both server entry points, never in the Vercel handler', () => {
    const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
    expect(read('server.js')).toMatch(/startAbandonedCheckoutJob\(\{ port: PORT \}\)/);
    expect(read('backend/server.js')).toMatch(/startAbandonedCheckoutJob\(\{ port: PORT \}\)/);
    expect(read('backend/api/index.js')).not.toMatch(/startAbandonedCheckoutJob/);
  });
});
