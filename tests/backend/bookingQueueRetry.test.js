import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { MAX_QUEUE_ATTEMPTS } from '../../backend/utils/bookingChainClaim.js';
import { queueEnvironment } from '../../backend/utils/queueEnvironment.js';

/**
 * The booking queue never drops a paid booking on an answer that meant "not now".
 *
 * replay() treated everything but queued, in progress, cancelled and success as
 * final - including the order route's 402 PAYMENT_NOT_CAPTURED with
 * `retryable: true` (the gateway could not be reached) and its 503
 * BOOKING_UNAVAILABLE. It then emailed "our team has been alerted", cleared the
 * stored order, and left the chain `queued`: the abandoned-checkout job skips a
 * row with a chain and no alarm matched it. Money held, nothing booked, nobody
 * told.
 */

const REF = 'FLTQR1';
const ORDER = { bookingReference: REF, contactInfo: { email: 'jane@example.com' }, transactionId: 'SI-QR' };
const minuteAgo = () => new Date(Date.now() - 60_000).toISOString();

const queuedRow = (chain = {}, details = {}, over = {}) => ({
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 291,
  created_at: new Date().toISOString(),
  ...over,
  booking_details: {
    queued_order: ORDER,
    queued_env: 'production',
    gds_chain: { state: 'queued', startedAt: minuteAgo(), queueAttempts: 1, ...chain },
    ...details,
  },
});

let table = null;

const load = async (rows, options) => {
  vi.resetModules();
  table = fakeBookingsTable(rows, options);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const job = await import('../../backend/jobs/bookingQueue.job.js');
  const { sendEmail } = await import('../../backend/services/emailService.js');
  sendEmail.mockClear();
  return { ...job, sendEmail };
};

const answer = (status, body) => vi.fn().mockResolvedValue({ status, json: async () => body });
const snapshot = (row) => JSON.parse(JSON.stringify(row));
const emailed = (sendEmail) => sendEmail.mock.calls[0]?.[0]?.data?.whatHappensNext || '';

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe('an answer that says "not now"', () => {
  it('retries a gateway the route could not reach, counting the attempt and waiting first', async () => {
    const { replay, RETRY_DELAY_MS, sendEmail } = await load([queuedRow()]);
    const before = Date.now();

    const outcome = await replay(snapshot(table.row(REF)), {
      baseUrl: 'http://x',
      fetchImpl: answer(402, { success: false, code: 'PAYMENT_NOT_CAPTURED', retryable: true }),
    });

    expect(outcome).toBe('retry');
    expect(sendEmail).not.toHaveBeenCalled();
    const details = table.row(REF).booking_details;
    expect(details.queued_order).toEqual(ORDER);
    expect(details.needs_review).toBeUndefined();
    expect(details.gds_chain).toMatchObject({ state: 'queued', queueAttempts: 2 });
    expect(Date.parse(details.gds_chain.retryAfter)).toBeGreaterThanOrEqual(before + RETRY_DELAY_MS);
  });

  it('queues again a booking whose claim the route let go of before answering 503', async () => {
    const released = queuedRow({ state: 'failed', failedStep: 'duplicate-check', finishedAt: minuteAgo(), startedAt: undefined, queueAttempts: 3 });
    const { replay } = await load([released]);

    const outcome = await replay(snapshot(released), {
      baseUrl: 'http://x',
      fetchImpl: answer(503, { success: false, code: 'BOOKING_UNAVAILABLE', retryable: true }),
    });

    expect(outcome).toBe('retry');
    expect(table.row(REF).booking_details.gds_chain).toMatchObject({ state: 'queued', queueAttempts: 4 });
  });

  it('gives up at the queue cap, and puts the booking in front of a human', async () => {
    const { replay, sendEmail } = await load([queuedRow({ queueAttempts: MAX_QUEUE_ATTEMPTS })]);

    const outcome = await replay(snapshot(table.row(REF)), {
      baseUrl: 'http://x',
      fetchImpl: answer(503, { success: false, code: 'BOOKING_UNAVAILABLE', retryable: true }),
    });

    expect(outcome).toBe('failed');
    const row = table.row(REF);
    expect(row.booking_details.needs_review).toMatchObject({ source: 'booking-queue', ticketed: false });
    expect(row.booking_details.needs_review.reason).toMatch(/BOOKING_UNAVAILABLE/);
    // The queue's hold is let go, so the booking can be cancelled now.
    expect(row.booking_details.gds_chain.state).toBe('failed');
    expect(row.booking_details.queued_order).toBeUndefined();
    expect(emailed(sendEmail)).toMatch(/Our team has been alerted/);

    const { selectUnannounced } = await import('../../backend/jobs/needsReviewAlert.job.js');
    expect(selectUnannounced([row])).toHaveLength(1);
  });

  it('leaves a booking another request has just taken alone', async () => {
    const taken = queuedRow({ state: 'in_progress', startedAt: new Date().toISOString(), attempt: 2 });
    const { replay } = await load([taken]);

    const outcome = await replay(queuedRow(), {
      baseUrl: 'http://x',
      fetchImpl: answer(402, { success: false, code: 'PAYMENT_NOT_CAPTURED', retryable: true }),
    });

    expect(outcome).toBe('retry');
    expect(table.row(REF).booking_details.gds_chain).toMatchObject({ state: 'in_progress', attempt: 2 });
    expect(table.writes).toEqual([]);
  });

  it('never counts a refund as a wait', async () => {
    const { isRetryableAnswer } = await load([]);
    expect(isRetryableAnswer(503, { success: false, code: 'BOOKING_DISABLED', bookingFailed: true, refunded: true })).toBe(false);
    expect(isRetryableAnswer(402, { success: false, code: 'PAYMENT_NOT_CAPTURED' })).toBe(false);
    expect(isRetryableAnswer(402, { success: false, code: 'PAYMENT_NOT_CAPTURED', retryable: true })).toBe(true);
    expect(isRetryableAnswer(503, {})).toBe(true);
  });
});

describe('a final failure', () => {
  it('is flagged for review when the route recorded nothing, so the alarm announces it', async () => {
    const { replay, sendEmail } = await load([queuedRow()]);

    const outcome = await replay(snapshot(table.row(REF)), {
      baseUrl: 'http://x',
      fetchImpl: answer(403, { success: false, code: 'PAYER_NOT_VERIFIED' }),
    });

    expect(outcome).toBe('failed');
    expect(table.row(REF).booking_details.needs_review.reason).toMatch(/PAYER_NOT_VERIFIED/);
    expect(emailed(sendEmail)).toMatch(/Our team has been alerted/);
  });

  it("keeps the route's own flag, and says the team is alerted", async () => {
    const routeFlag = { reason: 'charge not reversed after the booking failed', ticketed: false, at: minuteAgo() };
    const { replay, sendEmail } = await load([queuedRow({}, { needs_review: routeFlag })]);

    await replay(queuedRow(), {
      baseUrl: 'http://x',
      fetchImpl: answer(502, { success: false, bookingFailed: true, refunded: false }),
    });

    expect(table.row(REF).booking_details.needs_review).toEqual(routeFlag);
    expect(emailed(sendEmail)).toMatch(/refund did not go through/);
    expect(emailed(sendEmail)).toMatch(/alerted/);
  });

  it('is not flagged when the payment went back', async () => {
    const { replay, sendEmail } = await load([queuedRow({}, {}, { status: 'cancelled', payment_status: 'refunded' })]);

    await replay(queuedRow(), {
      baseUrl: 'http://x',
      fetchImpl: answer(502, { success: false, bookingFailed: true, refunded: true }),
    });

    expect(table.row(REF).booking_details.needs_review).toBeUndefined();
    expect(emailed(sendEmail)).toMatch(/payment has been reversed/);
  });

  it('does not tell the customer the team is alerted when the flag could not be written', async () => {
    const { replay, sendEmail } = await load([queuedRow()], {
      fail: ({ patch }) => Boolean(patch?.booking_details?.needs_review),
    });

    await replay(snapshot(table.row(REF)), {
      baseUrl: 'http://x',
      fetchImpl: answer(403, { success: false, code: 'PAYER_NOT_VERIFIED' }),
    });

    expect(emailed(sendEmail)).not.toMatch(/alerted/);
    expect(emailed(sendEmail)).toMatch(/call \(877\) 538-7380/);
  });
});

describe('the retry delay', () => {
  it('is waited out before the booking is picked up again', async () => {
    const now = Date.now();
    const waiting = queuedRow({ retryAfter: new Date(now + 30_000).toISOString() });
    const due = { ...queuedRow({ retryAfter: new Date(now - 1_000).toISOString() }), booking_reference: 'FLTQR2' };
    const { findRunnable } = await load([waiting, due]);

    const picked = (await findRunnable({ now, env: 'production' })).map((row) => row.booking_reference);

    expect(picked).toEqual(['FLTQR2']);
  });
});

describe("which environment's queue a process runs", () => {
  it('is production only when named, whatever NODE_ENV says', () => {
    expect(queueEnvironment({ NODE_ENV: 'production' })).toBe('development');
    expect(queueEnvironment({})).toBe('development');
    expect(queueEnvironment({ NODE_ENV: 'production', BOOKING_QUEUE_ENV: 'production' })).toBe('production');
  });

  it('is named production on the Lightsail stack, where production bookings are queued', () => {
    const compose = readFileSync(new URL('../../deploy/docker-compose.yml', import.meta.url), 'utf8');
    expect(compose).toMatch(/^\s+BOOKING_QUEUE_ENV: production$/m);
  });

  it("labels a queued booking with this process's environment, not NODE_ENV", async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { findRunnable } = await load([queuedRow({}, { queued_env: 'production' })]);

    expect(await findRunnable({ now: Date.now() })).toEqual([]);

    vi.stubEnv('BOOKING_QUEUE_ENV', 'production');
    expect((await findRunnable({ now: Date.now() })).map((row) => row.booking_reference)).toEqual([REF]);
  });
});
