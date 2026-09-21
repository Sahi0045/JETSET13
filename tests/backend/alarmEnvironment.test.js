import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The two Slack alarms run on production, not on whoever has the webhook.
 *
 * Local development and production share one database. The only thing that
 * kept the paid-but-not-ticketed alarm and the failed-refund alarm off a
 * laptop was the webhook URL not being in its environment. A laptop that had
 * it - copied to test a message, say - read production's bookings, posted
 * them, and stamped `alerted_at` on every one: each alarm announces a booking
 * exactly once, so production's own run then stayed silent about them for
 * ever. Every other job that acts on shared rows is gated to the stack that
 * names itself production (utils/queueEnvironment.js); these two were not.
 */

const WEBHOOK = 'https://hooks.slack.invalid/services/T000/B000/XXXX';

const jobs = [
  ['the paid-but-not-ticketed alarm', '../../backend/jobs/needsReviewAlert.job.js', 'startNeedsReviewAlertJob'],
  ['the failed-refund alarm', '../../backend/jobs/paymentFailureAlert.job.js', 'startPaymentFailureAlertJob'],
];

let supabase;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  supabase = (await import('../../backend/config/supabase.js')).default;
  // Whatever the alarm asks, answer "nothing stuck": this is about whether it asks.
  supabase.from.mockImplementation(() => {
    const chain = {
      select: () => chain, or: () => chain, not: () => chain, is: () => chain, order: () => chain,
      limit: async () => ({ data: [], error: null }),
    };
    return chain;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const runFirstTick = async (start, env) => {
  const job = start({ env, intervalMs: 3_600_000 });
  await vi.advanceTimersByTimeAsync(5 * 60_000);
  job.stop();
};

describe.each(jobs)('%s', (_name, path, startName) => {
  it('stays asleep on a machine that is not production, webhook or not', async () => {
    vi.stubEnv('ALERT_SLACK_WEBHOOK_URL', WEBHOOK);
    const start = (await import(path))[startName];

    await runFirstTick(start, { ALERT_SLACK_WEBHOOK_URL: WEBHOOK, NODE_ENV: 'production' });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('runs on the stack that names itself production', async () => {
    vi.stubEnv('ALERT_SLACK_WEBHOOK_URL', WEBHOOK);
    const start = (await import(path))[startName];

    await runFirstTick(start, { ALERT_SLACK_WEBHOOK_URL: WEBHOOK, BOOKING_QUEUE_ENV: 'production' });

    expect(supabase.from).toHaveBeenCalled();
  });

  it('runs elsewhere only when asked for by name', async () => {
    vi.stubEnv('ALERT_SLACK_WEBHOOK_URL', WEBHOOK);
    const start = (await import(path))[startName];

    await runFirstTick(start, { ALERT_SLACK_WEBHOOK_URL: WEBHOOK, ALERT_JOBS: 'true' });

    expect(supabase.from).toHaveBeenCalled();
  });

  it('still needs the webhook to run at all', async () => {
    const start = (await import(path))[startName];

    await runFirstTick(start, { BOOKING_QUEUE_ENV: 'production' });

    expect(supabase.from).not.toHaveBeenCalled();
  });
});
