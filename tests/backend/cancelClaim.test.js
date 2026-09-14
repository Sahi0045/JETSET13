import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { CHAIN_CLAIM_TTL_MS, QUEUED_CHAIN_TTL_MS, liveChainState } from '../../backend/utils/bookingChainClaim.js';

/**
 * One cancellation at a time, and none while the booking is still being made.
 *
 *  - A cancel was accepted while the booking chain was running, or while the
 *    booking waited in the durable queue for an Amadeus slot. It refunded the
 *    customer, and the chain - which had read the row first - went on to commit
 *    a PNR: real seats held against a payment that had just been returned.
 *  - Two cancels arriving together both passed the "already cancelled" check,
 *    both cancelled at the airline and both refunded. With a fee withheld, two
 *    partial refunds can together return more than was owed.
 *
 * The cancellation now takes the booking with a compare-and-set on the same
 * stamp the booking chain claims (`gds_chain.startedAt`). What is asserted here
 * is that a live holder is refused, that the loser of a race touches neither
 * ARC nor Amadeus, and that a cancellation that does not happen hands the
 * booking back.
 */

const NOW = () => new Date().toISOString();
const minutesAgo = (m) => new Date(Date.now() - m * 60 * 1000).toISOString();

const booking = (details = {}, over = {}) => ({
  id: 'uuid-1',
  booking_reference: 'FLT123',
  travel_type: 'flight',
  status: 'pending_ticketing',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  booking_details: { pnr: 'ABC123', order_id: 'FLT123', customer_email: 'traveler@example.com', gds: { ticketed: false }, ...details },
  ...over,
});

const captured = (amount = 291) => ({
  status: 200,
  data: { status: 'CAPTURED', amount, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount, currency: 'USD' } }] },
});

/**
 * A Supabase double with one row and a real compare-and-set: a claim wins only
 * when the stamp it was read with is still the row's stamp, and winning moves
 * the stamp - which is how the database behaves, and what makes a race testable.
 */
const supabaseFor = (row, { claimError = null } = {}) => {
  const updates = [];
  const filters = [];
  let stamp = row.booking_details?.gds_chain?.startedAt ?? null;
  const from = vi.fn(() => {
    let payload = null;
    let stampCondition;
    const c = {
      select: vi.fn(() => c),
      update: vi.fn((p) => { payload = p; updates.push(p); return c; }),
      insert: vi.fn(() => c),
      eq: vi.fn((col, value) => {
        filters.push(['eq', col, value]);
        if (col === 'booking_details->gds_chain->>startedAt') stampCondition = value;
        return c;
      }),
      is: vi.fn((col, value) => {
        filters.push(['is', col, value]);
        if (col === 'booking_details->gds_chain->>startedAt') stampCondition = value;
        return c;
      }),
      neq: vi.fn(() => c),
      or: vi.fn(() => c),
      filter: vi.fn(() => c),
      order: vi.fn(() => c),
      limit: vi.fn(() => c),
      single: vi.fn().mockResolvedValue({ data: row, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: (resolve) => {
        const isClaim = payload?.booking_details?.gds_chain?.state === 'cancelling';
        if (isClaim && claimError) return resolve({ data: null, error: claimError });
        if (stampCondition !== undefined) {
          if (stampCondition !== stamp) return resolve({ data: [], error: null });
          stamp = payload?.booking_details?.gds_chain?.startedAt ?? null;
        }
        return resolve({ data: [row], error: null });
      },
    };
    return c;
  });
  return { client: { from }, updates, filters };
};

const cancelFlightOrder = vi.fn();
let supabaseDouble = supabaseFor(booking());

vi.mock('../../backend/routes/payment/arcpay.config.js', () => ({
  get supabase() { return supabaseDouble.client; },
  ARC_PAY_CONFIG: { BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw' },
  getArcPayAuthConfig: () => ({ headers: {} }),
}));
vi.mock('../../backend/services/flightProvider.js', () => ({
  default: { cancelFlightOrder: (...args) => cancelFlightOrder(...args) },
  providerStatus: () => ({ enabled: true, bookingEnabled: true }),
}));

const cancelWith = async () => {
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const req = createRequest({ method: 'POST', body: { bookingReference: 'FLT123', reason: 'test', email: 'traveler@example.com' } });
  const res = createResponse();
  await handleCancelBookingAction(req, res);
  return res;
};

const cancel = async (row, options) => {
  supabaseDouble = supabaseFor(row, options);
  return cancelWith();
};

const expectNothingMoved = () => {
  expect(cancelFlightOrder).not.toHaveBeenCalled();
  expect(axios.put).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.resetModules();
  cancelFlightOrder.mockReset();
  cancelFlightOrder.mockResolvedValue({ success: true, hadTickets: false, voided: false, requiresAirlineRefund: [] });
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
  axios.get.mockResolvedValue(captured(291));
});

describe('a booking that is still being made', () => {
  it('is not cancelled while the booking chain is running, and nothing moves', async () => {
    const res = await cancel(booking({ gds_chain: { state: 'in_progress', startedAt: NOW(), attempt: 1 } }, { status: 'pending' }));

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('BOOKING_IN_PROGRESS');
    expect(res.body.error).toMatch(/still being confirmed/);
    expect(res.body.error).toMatch(/Nothing has been cancelled or refunded/);
    expectNothingMoved();
    expect(axios.get).not.toHaveBeenCalled();
    expect(supabaseDouble.updates).toEqual([]);
  });

  it('is not cancelled while it waits in the queue for an Amadeus slot', async () => {
    const res = await cancel(booking({ pnr: undefined, gds_chain: { state: 'queued', startedAt: minutesAgo(5), queueAttempts: 1 }, queued_order: {} }, { status: 'pending' }));

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('BOOKING_IN_PROGRESS');
    expectNothingMoved();
    expect(supabaseDouble.updates).toEqual([]);
  });

  // A process killed mid-chain leaves its claim behind. It expires, as it does
  // for the chain's own retries, or the booking could never be cancelled.
  it('is cancelled once a dead chain has let its claim expire', async () => {
    const res = await cancel(booking({ gds_chain: { state: 'in_progress', startedAt: minutesAgo(10) } }));

    expect(res.statusCode).toBe(200);
    expect(cancelFlightOrder).toHaveBeenCalledWith('ABC123');
  });

  it('is cancelled once a queued booking has outlived the offer it was priced on', async () => {
    const res = await cancel(booking({ pnr: undefined, gds_chain: { state: 'queued', startedAt: minutesAgo(45) }, queued_order: {} }, { status: 'pending' }));

    expect(res.statusCode).toBe(200);
  });
});

describe('two cancellations of one booking', () => {
  it('refuses a second while the first holds the booking, before anything moves', async () => {
    const res = await cancel(booking({ gds_chain: { state: 'cancelling', startedAt: NOW() } }));

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('CANCEL_IN_PROGRESS');
    // The app reads `message`, the site `error`: both say the same.
    expect(res.body.message).toBe(res.body.error);
    expectNothingMoved();
    expect(supabaseDouble.updates).toEqual([]);
  });

  it('lets exactly one of two simultaneous requests cancel and refund', async () => {
    supabaseDouble = supabaseFor(booking());

    const [first, second] = await Promise.all([cancelWith(), cancelWith()]);
    const statuses = [first.statusCode, second.statusCode].sort();

    expect(statuses).toEqual([200, 409]);
    const loser = first.statusCode === 409 ? first : second;
    expect(loser.body.code).toBe('CANCEL_IN_PROGRESS');
    // One airline cancel, one reversal: the loser touched neither.
    expect(cancelFlightOrder).toHaveBeenCalledTimes(1);
    expect(axios.put).toHaveBeenCalledTimes(1);
    expect(supabaseDouble.updates.filter((u) => u.status === 'cancelled')).toHaveLength(1);
  });

  it('claims with a compare-and-set on the stamp it read, never with .or() on a json path', async () => {
    await cancel(booking({ gds_chain: { state: 'failed', startedAt: '2026-09-14T10:00:00.000Z', failedStep: 'priceCheck' } }));

    expect(supabaseDouble.filters).toContainEqual(['eq', 'booking_details->gds_chain->>startedAt', '2026-09-14T10:00:00.000Z']);
    const claim = supabaseDouble.updates[0];
    expect(claim.booking_details.gds_chain.state).toBe('cancelling');
    expect(claim.booking_details.gds_chain.stateBeforeCancel).toBe('failed');
  });

  it('claims a booking the chain never touched on a stamp that is not there', async () => {
    await cancel(booking());

    expect(supabaseDouble.filters).toContainEqual(['is', 'booking_details->gds_chain->>startedAt', null]);
  });

  // Nobody knows who holds the booking, and a refund on a guess is the double
  // refund this exists to stop.
  it('fails closed when the claim cannot be written', async () => {
    const res = await cancel(booking(), { claimError: { message: 'connection reset' } });

    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('CANCEL_UNAVAILABLE');
    expect(res.body.retryable).toBe(true);
    expectNothingMoved();
  });
});

describe('a cancellation that does not happen hands the booking back', () => {
  it('when the payment gateway cannot be reached, before the seats are released', async () => {
    axios.get.mockRejectedValue(new Error('ECONNRESET'));

    const res = await cancel(booking());

    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('PAYMENT_GATEWAY_UNAVAILABLE');
    expect(res.body.error).toMatch(/nothing has been cancelled/i);
    expectNothingMoved();
    const release = supabaseDouble.updates.at(-1);
    expect(release.status).toBeUndefined();
    expect(release.booking_details.gds_chain).toBeUndefined();
  });

  it('when the airline will not cancel, restoring what held it before', async () => {
    cancelFlightOrder.mockRejectedValue(new Error('boom'));
    const prior = { state: 'committed', committedAt: '2026-09-14T10:00:00.000Z' };

    const res = await cancel(booking({ gds_chain: prior }));

    expect(res.statusCode).toBe(502);
    expect(axios.put).not.toHaveBeenCalled();
    const claim = supabaseDouble.updates[0];
    const release = supabaseDouble.updates.find((u) => u.booking_details?.needs_review);
    expect(release.booking_details.gds_chain).toEqual(prior);
    // Conditioned on this cancellation's own stamp, so it cannot undo a later claim.
    expect(supabaseDouble.filters).toContainEqual(['eq', 'booking_details->gds_chain->>startedAt', claim.booking_details.gds_chain.startedAt]);
  });
});

describe('a finished cancellation', () => {
  it('leaves the chain marked cancelled, so a late booking attempt is refused', async () => {
    const res = await cancel(booking());

    expect(res.statusCode).toBe(200);
    const written = supabaseDouble.updates.find((u) => u.status === 'cancelled');
    expect(written.booking_details.gds_chain.state).toBe('cancelled');
  });
});

describe('liveChainState', () => {
  const at = (ms) => new Date(Date.now() - ms).toISOString();

  it('holds a running chain or cancellation for the claim TTL, then lets go', () => {
    for (const state of ['in_progress', 'cancelling']) {
      expect(liveChainState({ state, startedAt: at(1000) })).toBe(state);
      expect(liveChainState({ state, startedAt: at(CHAIN_CLAIM_TTL_MS + 1000) })).toBeNull();
    }
  });

  it('holds a queued booking until its offer would have gone stale', () => {
    expect(liveChainState({ state: 'queued', startedAt: at(CHAIN_CLAIM_TTL_MS + 1000) })).toBe('queued');
    expect(liveChainState({ state: 'queued', startedAt: at(QUEUED_CHAIN_TTL_MS + 1000) })).toBeNull();
  });

  it('holds nothing for a finished, failed or unstamped chain', () => {
    expect(liveChainState({ state: 'committed', committedAt: at(1000) })).toBeNull();
    expect(liveChainState({ state: 'failed', finishedAt: at(1000) })).toBeNull();
    expect(liveChainState({ state: 'cancelled', startedAt: at(1000) })).toBeNull();
    expect(liveChainState({ state: 'in_progress' })).toBeNull();
    expect(liveChainState(null)).toBeNull();
  });
});

describe('the booking queue', () => {
  // The worker read the row, the customer cancelled, the replay found it
  // cancelled. Emailing "we could not confirm your booking" to them is wrong.
  it('treats a booking cancelled under it as finished, not failed', async () => {
    const { replay } = await import('../../backend/jobs/bookingQueue.job.js');
    const { sendEmail } = await import('../../backend/services/emailService.js');
    const fetchImpl = vi.fn().mockResolvedValue({ status: 409, json: async () => ({ success: false, code: 'BOOKING_CANCELLED' }) });

    const outcome = await replay(
      { booking_reference: 'FLT123', status: 'pending', booking_details: { queued_order: { contactInfo: { email: 'a@example.com' } } } },
      { baseUrl: 'http://localhost:0', fetchImpl },
    );

    expect(outcome).toBe('already-finished');
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
