import { describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * Where the booking queue sends "We could not confirm your flight booking".
 *
 * It went to the stored order's contact email, whatever that held. A customer
 * who typed "jane@gmailcom" - checkout having recorded the account's
 * jane@gmail.com - was never told that their queued booking failed, and they
 * had left the page on the 202, so the email is the only word they get. It
 * now takes the first address that can be delivered to (isUsableEmail) in the
 * order route's order: the order's contact email, its customerEmail, the lead
 * traveller's, then the one checkout recorded.
 */

const REF = 'FLTQADDR1';
const minuteAgo = () => new Date(Date.now() - 60_000).toISOString();
const daysAgo = (days) => new Date(Date.now() - days * 24 * 3_600_000).toISOString();

const order = (over = {}) => ({
  bookingReference: REF,
  transactionId: 'SI-QADDR',
  contactInfo: { email: 'jane@gmailcom' },
  travelers: [{ id: '1', firstName: 'Jane', lastName: 'Doe' }],
  ...over,
});

const queuedRow = ({ queued = order(), chain = {}, lead = {}, recorded = 'jane@gmail.com' } = {}) => ({
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending',
  payment_status: 'paid',
  total_amount: 291,
  created_at: new Date().toISOString(),
  booking_details: {
    queued_order: queued,
    queued_env: 'production',
    customer_email: recorded,
    pending_booking_data: { bookingData: { passengerData: [{ firstName: 'Jane', lastName: 'Doe', ...lead }] } },
    gds_chain: { state: 'queued', startedAt: minuteAgo(), queueAttempts: 1, ...chain },
  },
});

let table = null;

const load = async (rows) => {
  vi.resetModules();
  table = fakeBookingsTable(rows);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const job = await import('../../backend/jobs/bookingQueue.job.js');
  const { sendEmail } = await import('../../backend/services/emailService.js');
  sendEmail.mockClear();
  return { ...job, sendEmail };
};

const refused = vi.fn().mockResolvedValue({ status: 403, json: async () => ({ success: false, code: 'PAYER_NOT_VERIFIED' }) });
const snapshot = (row) => JSON.parse(JSON.stringify(row));

/** Replays the row to a final failure; the address the failure email went to, or null. */
const failureEmailTo = async (row) => {
  const { replay, sendEmail } = await load([row]);
  const outcome = await replay(snapshot(table.row(REF)), { baseUrl: 'http://x', fetchImpl: refused });
  expect(outcome).toBe('failed');
  return sendEmail.mock.calls[0]?.[0]?.to ?? null;
};

describe('a queued booking that failed', () => {
  it('is told at the address checkout recorded when the contact email is not usable', async () => {
    expect(await failureEmailTo(queuedRow())).toBe('jane@gmail.com');
  });

  it("at the order's customerEmail first, then the lead traveller's", async () => {
    expect(await failureEmailTo(queuedRow({ queued: order({ customerEmail: 'jane.b@example.com' }) }))).toBe('jane.b@example.com');
    expect(await failureEmailTo(queuedRow({ lead: { email: 'jane.t@example.com' } }))).toBe('jane.t@example.com');
  });

  it('handed to a person without a replay: the same', async () => {
    const { runQueued, sendEmail } = await load([queuedRow({ chain: { state: 'failed', failedStep: 'unexpected-error', startedAt: undefined, finishedAt: daysAgo(30) } })]);

    expect(await runQueued(snapshot(table.row(REF)), { baseUrl: 'http://x' })).toBe('handed-over');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe('jane@gmail.com');
  });
});

describe('the addresses next to it', () => {
  it('a usable contact email is still used first', async () => {
    expect(await failureEmailTo(queuedRow({ queued: order({ contactInfo: { email: 'jane.work@example.com' } }) }))).toBe('jane.work@example.com');
  });

  it('with no usable address anywhere, nothing is sent', async () => {
    expect(await failureEmailTo(queuedRow({ recorded: null }))).toBeNull();
  });
});
