import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * A cancellation email goes to the customer, or to nobody.
 *
 * With no address on the booking or the request it fell back to
 * test@jetsetterss.com: the "customer" confirmation went to an inbox nobody
 * reads and was reported as sent.
 */

let table = fakeBookingsTable([]);

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    getArcPayAuthConfig: () => ({ headers: {} }),
    get supabase() { return { from: (...args) => table.from(...args) }; },
  };
});

// Staff may cancel a booking without giving an email.
vi.mock('../../backend/routes/payment/agents.handlers.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getCaller: async () => ({ id: 'admin-1', role: 'admin' }),
}));

const unpaidHotel = (details = {}, over = {}) => ({
  id: 'bk-e1',
  booking_reference: 'HTLMAIL1',
  travel_type: 'hotel',
  status: 'confirmed',
  payment_status: 'unpaid',
  total_amount: 0,
  passenger_details: [{ firstName: 'Jane', lastName: 'Doe' }],
  ...over,
  booking_details: { ...details },
});

const cancel = async (row, body = {}) => {
  vi.resetModules();
  table = fakeBookingsTable([row]);
  const { sendCancellationNotificationEmails } = await import('../../backend/services/emailService.js');
  sendCancellationNotificationEmails.mockClear();
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const res = createResponse();
  await handleCancelBookingAction(createRequest({ method: 'POST', body: { bookingReference: 'HTLMAIL1', ...body } }), res);
  return { res, sendCancellationNotificationEmails };
};

beforeEach(() => {
  vi.resetModules();
});

describe('the cancellation email', () => {
  it('is not sent to a made-up address when the booking has none', async () => {
    const { res, sendCancellationNotificationEmails } = await cancel(unpaidHotel());

    expect(res.statusCode).toBe(200);
    expect(table.row('HTLMAIL1').status).toBe('cancelled');
    expect(sendCancellationNotificationEmails).not.toHaveBeenCalled();
  });

  it("goes to the booker's address when there is one", async () => {
    const { sendCancellationNotificationEmails } = await cancel(unpaidHotel({ customer_email: 'booker@example.com' }));

    expect(sendCancellationNotificationEmails).toHaveBeenCalledWith(expect.objectContaining({ customerEmail: 'booker@example.com' }));
  });
});
