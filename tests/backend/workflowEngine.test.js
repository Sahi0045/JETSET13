import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The inquiry workflow engine: one refused email, and the rest of the run.
 *
 * `sendEmail` now throws when Resend refuses a send (it used to log "Email sent
 * successfully" and return). The SLA and escalation loops had one try around
 * the whole loop, so a single refused address would have ended the run for
 * every inquiry behind it.
 */

let inquiries = [];
let updates = [];

const query = (table) => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    not: () => chain,
    lt: () => chain,
    lte: () => chain,
    insert: async () => ({ data: null, error: null }),
    update: (patch) => ({
      eq: async (_column, id) => {
        updates.push({ table, id, patch });
        return { data: null, error: null };
      },
    }),
    then: (resolve) => resolve({ data: table === 'inquiries' ? inquiries : [], error: null }),
  };
  return chain;
};

const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();

let sendEmail;
let engine;

beforeEach(async () => {
  inquiries = [];
  updates = [];
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(query);
  ({ sendEmail } = await import('../../backend/services/emailService.js'));
  // clearAllMocks (setup.js) keeps queued once-answers; a leftover one from
  // the test before would answer this test's first send.
  sendEmail.mockReset();
  sendEmail.mockResolvedValue({ data: { id: 'email-mock-id' }, error: null });
  engine = await import('../../backend/jobs/workflowEngine.js');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('a refused SLA notice', () => {
  it('does not stop the notices behind it', async () => {
    inquiries = [
      { id: 'inq-00000001', inquiry_type: 'flight', status: 'pending', customer_name: 'A', created_at: hoursAgo(30), sla_breach_notified: false },
      { id: 'inq-00000002', inquiry_type: 'flight', status: 'pending', customer_name: 'B', created_at: hoursAgo(30), sla_breach_notified: false },
    ];
    sendEmail.mockRejectedValueOnce(new Error('email refused by Resend: rate limited'));
    sendEmail.mockResolvedValueOnce({ data: { id: 'm2' }, error: null });

    await engine.checkSLABreaches();

    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
});

describe('a refused escalation notice', () => {
  it('does not stop the escalations behind it', async () => {
    inquiries = [
      { id: 'inq-00000003', customer_name: 'C', inquiry_type: 'visa' },
      { id: 'inq-00000004', customer_name: 'D', inquiry_type: 'visa' },
    ];
    sendEmail.mockRejectedValueOnce(new Error('email refused by Resend: rate limited'));
    sendEmail.mockResolvedValueOnce({ data: { id: 'm4' }, error: null });

    await engine.checkEscalations();

    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
});
