import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A send Resend refused is not a send.
 *
 * Resend reports a refused send - a suppressed address, a bounced domain, a
 * rate limit, a bad key - in `error`, and does not throw. `sendEmail` never
 * looked: it logged "Email sent successfully" and returned. Every caller treats
 * a throw as "not sent" and nothing else, so each of them believed it.
 *
 * The one that matters most is the booking queue's failure notice: "we could
 * not confirm your booking, and the automatic refund did not go through". The
 * worker saw no exception, dropped the stored order, and moved on - a customer
 * charged, not booked, not refunded and not told, with a log line saying they
 * had been. The sibling senders in the same file already check (`Resend
 * reports a refused send in error; it does not throw`); the generic one did not.
 */

// tests/backend/setup.js stubs this whole module; here the module is the subject.
vi.unmock('../../backend/services/emailService.js');

const sent = [];
let nextResult = null;

vi.mock('resend', () => ({
  Resend: class {
    constructor() {
      this.emails = {
        send: vi.fn(async (message) => {
          sent.push(message);
          return nextResult ?? { data: { id: 'msg-1' }, error: null };
        }),
      };
    }
  },
}));

const load = async () => {
  vi.resetModules();
  return import('../../backend/services/emailService.js');
};

beforeEach(() => {
  sent.length = 0;
  nextResult = null;
  vi.stubEnv('RESEND_API_KEY', 're_test_key');
});

describe('sendEmail', () => {
  it('fails when Resend refuses the send, rather than calling it sent', async () => {
    const { sendEmail } = await load();
    nextResult = { data: null, error: { message: 'Recipient is on the suppression list', name: 'validation_error' } };

    await expect(sendEmail({ to: 'traveller@example.com', subject: 'We could not confirm your flight booking', data: { a: 1 } }))
      .rejects.toThrow(/suppression list/);
    expect(sent).toHaveLength(1);
  });

  it('still answers with what Resend said when the send is accepted', async () => {
    const { sendEmail } = await load();

    const response = await sendEmail({ to: 'traveller@example.com', subject: 'Hello', html: '<p>hi</p>' });

    expect(response).toEqual({ data: { id: 'msg-1' }, error: null });
  });
});

/**
 * The queue's failure notice goes through this function. A refused notice has
 * to be said as one - not logged as sent while the stored order is dropped.
 */
describe("the booking queue's failure notice", () => {
  it('is reported as not sent when Resend refuses it', async () => {
    const { sendEmail } = await load();
    nextResult = { data: null, error: { message: 'Domain is not verified' } };
    const logs = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendEmail({ to: 'traveller@example.com', subject: 'We could not confirm your flight booking', data: {} }))
      .rejects.toThrow(/not verified/);
    expect(logs.mock.calls.some(([line]) => /sent successfully/i.test(String(line)))).toBe(false);
  });
});
