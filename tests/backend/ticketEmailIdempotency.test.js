import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The e-ticket email carries the job's idempotency key to Resend.
 *
 * Ticket sync takes a lapsed claim again when a process stopped between
 * claiming the email and recording it as sent. If that process's mail did go
 * out, only Resend knows - and it answers a repeated `Idempotency-Key` within
 * 24 hours with the first send instead of delivering a second. The key is
 * only useful if it reaches the request.
 */

vi.unmock('../../backend/services/emailService.js');

const calls = [];

vi.mock('resend', () => ({
  Resend: class {
    constructor() {
      this.emails = {
        send: vi.fn(async (message, options) => {
          calls.push({ message, options });
          return { data: { id: 'msg-1' }, error: null };
        }),
      };
    }
  },
}));

const load = async () => {
  vi.resetModules();
  return import('../../backend/services/emailService.js');
};

const email = (extra = {}) => ({
  customerEmail: 'flyer@example.com',
  customerName: 'Asha Rao',
  bookingReference: 'FLT-1',
  tickets: [{ number: '220-7491175301', travelerName: 'RAO/ASHA' }],
  bookingDetails: {},
  ...extra,
});

beforeEach(() => {
  calls.length = 0;
  vi.stubEnv('RESEND_API_KEY', 're_test_key');
});

describe('sendTicketIssuedEmail', () => {
  it('sends the idempotency key it is given as Resend\'s Idempotency-Key', async () => {
    const { sendTicketIssuedEmail } = await load();

    const result = await sendTicketIssuedEmail(email({ idempotencyKey: 'e-ticket/FLT-1/220-7491175301' }));

    expect(result.success).toBe(true);
    expect(calls[0].options).toEqual({ idempotencyKey: 'e-ticket/FLT-1/220-7491175301' });
  });

  it('sends without one when it is given none', async () => {
    const { sendTicketIssuedEmail } = await load();

    await sendTicketIssuedEmail(email());

    expect(calls[0].options?.idempotencyKey).toBeUndefined();
  });
});
