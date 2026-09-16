import { beforeEach, describe, expect, it, vi } from 'vitest';

// The real email service with only the Resend client replaced: nothing leaves
// the machine. tests/backend/setup.js mocks the service itself for every other
// test, so it is loaded here with importActual.
const sendMail = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    constructor() {
      this.emails = { send: sendMail };
    }
  },
}));

/**
 * The e-ticket email that three surfaces promised and nothing could send.
 *
 * "We will email your e-ticket as soon as it is issued" appears on the order
 * page, in the confirmation email and in the reservation-held email. With
 * auto-ticketing off - every booking so far - the ticket is issued by a person
 * in the Amadeus terminal, and there was no sender in the codebase at all. The
 * promise was never once kept.
 */

const load = () => vi.importActual('../../backend/services/emailService.js');

const base = {
  customerEmail: 'flyer@example.com',
  customerName: 'Asha Rao',
  bookingReference: 'FLT-1',
  bookingDetails: { pnr: 'BEEDS3' },
};

const sent = () => sendMail.mock.calls.at(-1)?.[0] ?? {};

beforeEach(() => {
  sendMail.mockReset();
  sendMail.mockResolvedValue({ data: { id: 'email-1' } });
  process.env.RESEND_API_KEY = 'test-key';
});

describe('the e-ticket email', () => {
  it('goes to the customer, and says so', async () => {
    const { sendTicketIssuedEmail } = await load();
    const result = await sendTicketIssuedEmail({ ...base, tickets: [{ number: '220-7491174929', travelerName: 'RAO/ASHA' }] });

    expect(result.success).toBe(true);
    expect(sent().to).toEqual(['flyer@example.com']);
  });

  /**
   * The ticket number is the only thing in the email the customer did not
   * already have, and it is what an airline's desk asks for. In the subject, it
   * can be read off a notification without opening anything.
   */
  it('puts the ticket number in the subject line', async () => {
    const { sendTicketIssuedEmail } = await load();
    await sendTicketIssuedEmail({ ...base, tickets: [{ number: '220-7491174929' }] });

    expect(sent().subject).toContain('220-7491174929');
    expect(sent().subject).toContain('FLT-1');
  });

  it('names every traveller when a family is ticketed together', async () => {
    const { sendTicketIssuedEmail } = await load();
    await sendTicketIssuedEmail({
      ...base,
      tickets: [
        { number: '220-1111111111', travelerName: 'RAO/ASHA' },
        { number: '220-2222222222', travelerName: 'RAO/DEV' },
      ],
    });

    expect(sent().html).toContain('220-1111111111');
    expect(sent().html).toContain('220-2222222222');
    expect(sent().html).toContain('RAO/DEV');
    expect(sent().subject).toMatch(/2 e-tickets/i);
  });

  it('carries the airline reference, which is the one the airline site wants', async () => {
    const { sendTicketIssuedEmail } = await load();
    await sendTicketIssuedEmail({ ...base, tickets: [{ number: '220-1' }] });

    expect(sent().html).toContain('BEEDS3');
  });

  it('does not promise a ticket it has no number for', async () => {
    const { sendTicketIssuedEmail } = await load();
    const result = await sendTicketIssuedEmail({ ...base, tickets: [{ travelerName: 'RAO/ASHA' }] });

    expect(result.success).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('says so rather than throwing when there is no address to send to', async () => {
    const { sendTicketIssuedEmail } = await load();
    const result = await sendTicketIssuedEmail({ ...base, customerEmail: null, tickets: [{ number: '220-1' }] });

    expect(result.success).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  // Resend reports a refused send in `error`; it does not throw. Reporting that
  // as success is what made a whole class of unsent mail invisible.
  it('reports a refused send as a failure', async () => {
    sendMail.mockResolvedValue({ error: { message: 'mailbox full' } });
    const { sendTicketIssuedEmail } = await load();

    const result = await sendTicketIssuedEmail({ ...base, tickets: [{ number: '220-1' }] });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/mailbox full/);
  });
});

/**
 * A ticketed booking's confirmation email listed its booking reference, its
 * PNR and its transaction id - and nowhere the 13 digits an airline actually
 * asks for at a check-in desk.
 */
describe('the booking confirmation email, once a ticket exists', () => {
  it('carries the ticket number', async () => {
    const { sendBookingConfirmationEmail } = await load();
    await sendBookingConfirmationEmail({
      ...base,
      bookingType: 'flight',
      paymentAmount: 217.77,
      currency: 'USD',
      bookingDetails: { pnr: 'BEEDS3', tickets: [{ number: '220-7491174929', travelerName: 'RAO/ASHA' }] },
    });

    expect(sent().html).toContain('220-7491174929');
  });

  it('names each traveller when there is more than one ticket', async () => {
    const { sendBookingConfirmationEmail } = await load();
    await sendBookingConfirmationEmail({
      ...base,
      bookingType: 'flight',
      paymentAmount: 435,
      bookingDetails: {
        pnr: 'BEEDS3',
        tickets: [{ number: '220-1', travelerName: 'RAO/ASHA' }, { number: '220-2', travelerName: 'RAO/DEV' }],
      },
    });

    expect(sent().html).toContain('RAO/DEV');
    expect(sent().html).toContain('220-2');
  });

  it('still sends cleanly for a booking with no ticket yet', async () => {
    const { sendBookingConfirmationEmail } = await load();
    const result = await sendBookingConfirmationEmail({
      ...base, bookingType: 'flight', paymentAmount: 217.77, bookingDetails: { pnr: 'BEEDS3' },
    });

    expect(result.success).toBe(true);
    expect(sent().html).not.toMatch(/E-ticket number/i);
  });
});
