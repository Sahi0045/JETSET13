import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
 * What the inbox shows for a reservation held for staff.
 *
 * The subject line is what everyone reads. A booking our team is finishing by
 * hand must not arrive as "Booking Confirmed", nor look like an ordinary
 * reservation whose ticket simply follows.
 */

const load = () => vi.importActual('../../backend/services/emailService.js');

const held = {
  customerEmail: 'jane@example.com',
  customerName: 'Jane Doe',
  bookingReference: 'FLTHELD1',
  bookingType: 'flight',
  paymentAmount: 291,
  currency: 'USD',
  passengers: 1,
  bookingDetails: { pnr: 'HELD42', gds: { ticketed: false }, tickets: [] },
  heldForReview: true,
};

describe('the email service for a booking held for staff', () => {
  beforeEach(() => {
    vi.stubEnv('RESEND_API_KEY', 're_test_not_a_real_key');
    sendMail.mockReset();
    sendMail.mockResolvedValue({ data: { id: 'message-1' }, error: null });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('sends the held email, with a subject that says our team is finishing the ticket', async () => {
    const { sendBookingConfirmationEmail } = await load();

    const result = await sendBookingConfirmationEmail(held);

    expect(result.success).toBe(true);
    const [message] = sendMail.mock.calls[0];
    expect(message.to).toEqual(['jane@example.com']);
    expect(message.subject).toBe('Reservation held - our team is finishing your ticket - FLTHELD1 | Jetsetters');
    expect(message.html).toMatch(/Our team is finishing your ticket/);
    expect(message.html).not.toMatch(/Booking Confirmed/);
  });

  it('leaves the ordinary reservation email as it was', async () => {
    const { sendBookingConfirmationEmail } = await load();

    await sendBookingConfirmationEmail({ ...held, heldForReview: undefined });

    expect(sendMail.mock.calls[0][0].subject).toBe('Reservation held - FLTHELD1 | Jetsetters');
  });

  it('tells the office the booking is held for review', async () => {
    const { sendBookingNotificationEmails } = await load();

    await sendBookingNotificationEmails(held);

    expect(sendMail.mock.calls.map(([message]) => message.subject)).toContain('⚠️ Booking held for review: FLTHELD1 - Jane Doe');
  });
});
