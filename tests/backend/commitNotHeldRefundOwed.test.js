import axios from 'axios';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { shownQueryFor } from './helpers/deskShown.js';
import { attentionLabel, attentionOf } from '../../shared/reviewQueue.js';

/**
 * "The airline does not hold this booking", recorded on a paid commit that
 * never answered, with the money still at ARC.
 *
 * The desk dialog says "This does not move any money" and asks for nothing
 * else, and every customer surface had promised "we will email you either
 * way". resolve-review stamped the flag resolved with outcome not_held and
 * that was all. From then on the booking - pending, paid, no PNR, no
 * cancellation - was on no list and in no job: attentionOf read the resolved
 * flag as settled (off the desk and the needs-review alarm), the failed-refund
 * alarm needs a cancellation, the abandoned-checkout job skips a flagged row,
 * and ticket sync needs a PNR. No email went out, and the whole payment stayed
 * at ARC with nobody told to return it.
 *
 * Now the booking stays on the desk as a refund to make until Cancel & refund
 * returns the money or a person marks that entry handled; the needs-review
 * alarm announces it once, as a refund; and the customer is emailed that the
 * booking did not go through and the refund is being made.
 *
 * The desk list, "Mark as handled" and Cancel & refund are the real routes;
 * the row is the one the order route leaves when the commit never answered,
 * already announced by the alarm.
 */

const REF = 'FLTUNK1';
const COMMIT_UNKNOWN = 'chain failed after commit at commit';
const tenMinutesAgo = () => new Date(Date.now() - 10 * 60_000).toISOString();

let table = fakeBookingsTable([]);

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return {
    ...actual,
    ARC_PAY_CONFIG: { ...actual.ARC_PAY_CONFIG, BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT', API_PASSWORD: 'pw' },
    getArcPayAuthConfig: () => ({ headers: {} }),
    get supabase() { return { from: (...args) => table.from(...args) }; },
  };
});

vi.mock('../../backend/services/flightProvider.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: new Proxy(actual.default, {
      get: (target, key) => (key === 'cancelFlightOrder' ? vi.fn() : target[key]),
    }),
  };
});

vi.mock('../../backend/middleware/auth.middleware.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    protect: (req, _res, next) => { req.user = { id: 'staff-1', email: 'desk@jetsetterss.com', role: 'support' }; next(); },
  };
});

/** The row the order route leaves when the commit never answered, the chain's claim long lapsed, announced by the alarm. */
const commitUnknown = (over = {}) => {
  const at = tenMinutesAgo();
  return {
    id: 'bk-unk1',
    booking_reference: REF,
    travel_type: 'flight',
    status: 'pending',
    payment_status: 'paid',
    total_amount: 291,
    created_at: at,
    passenger_details: [{ firstName: 'Jane', lastName: 'Doe' }],
    ...over,
    booking_details: {
      order_id: REF,
      customer_email: 'jane@example.com',
      arc_captured_amount: 291,
      arc_captured_currency: 'USD',
      gds_chain: { state: 'in_progress', startedAt: at, claimedAt: at, attempt: 1 },
      needs_review: { reason: COMMIT_UNKNOWN, ticketed: false, at, alerted_at: at },
      ...over.booking_details,
    },
  };
};

let mailer;

beforeEach(() => {
  vi.resetModules();
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockReset();
  axios.get.mockResolvedValue({
    status: 200,
    data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: 'txn-1', type: 'PAYMENT', amount: 291, currency: 'USD' } }] },
  });
  // ARC Pay takes the cancel's VOID.
  axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
  mailer = {
    sendEmail: vi.fn().mockResolvedValue({ id: 'email-mock-id' }),
    sendBookingNotificationEmails: vi.fn().mockResolvedValue({ success: true }),
    sendCancellationNotificationEmails: vi.fn().mockResolvedValue({ success: true }),
  };
  vi.doMock('../../backend/services/emailService.js', () => ({ ...mailer, default: mailer }));
});

afterEach(() => {
  vi.doUnmock('../../backend/services/emailService.js');
});

const desk = async (rows) => {
  table = fakeBookingsTable(rows, { tables: { price_settings: [], payments: [] } });
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  return {
    cancel: () => request(app).post('/api/flights/admin-bookings/bk-unk1/cancel').send({ reason: 'The airline does not hold it' }),
    open: async () => (await request(app).get('/api/flights/admin-bookings-all?attention=open')).body.data,
    // With the entry the desk page showed, as the page sends it.
    handle: async (body) => request(app).post(`/api/flights/admin-bookings/bk-unk1/resolve-review${await shownQueryFor('bk-unk1')}`).send(body),
  };
};

const notHeld = { note: 'Rang the airline: it has no record of it.', outcome: 'not_held' };

/** The emails sent through the generic customer email (the booking queue's path). */
const customerEmails = () => mailer.sendEmail.mock.calls.map(([mail]) => mail);

describe('"the airline does not hold it", with the whole payment still at ARC', () => {
  it('stays on the desk as a refund to make', async () => {
    const d = await desk([commitUnknown()]);

    expect((await d.handle(notHeld)).status).toBe(200);

    const listed = await d.open();
    expect(listed.map((b) => b.bookingReference), 'a paid booking the airline does not hold left every list').toEqual([REF]);
    expect(listed[0]).toMatchObject({ commitUnknown: false, attention: { kind: 'refund_not_made' } });
    expect(attentionLabel(listed[0].attention)).toBe('Refund not made yet');
    expect(listed[0].attention.reason).toMatch(/the airline does not hold this booking/);
    expect(listed[0].attention.reason).toMatch(/Cancel & refund/);
  });

  it('the customer is emailed once: the booking did not go through, and the refund is being made', async () => {
    const d = await desk([commitUnknown()]);

    const res = await d.handle(notHeld);

    expect(res.status).toBe(200);
    expect(res.body.emailed).toBe(true);
    expect(customerEmails()).toHaveLength(1);
    const [mail] = customerEmails();
    expect(mail.to).toBe('jane@example.com');
    expect(mail.subject).toBe('Your flight booking did not go through');
    expect(mail.data).toEqual({
      bookingReference: REF,
      status: 'Not booked - refund on its way',
      whatHappensNext: 'We checked with the airline, and your booking did not go through: the airline does not hold a reservation '
        + 'for it, so you are not booked on these flights. Our team is refunding your payment, and we will email you when the '
        + 'refund is made; it usually reaches your card within 5-10 business days after that. If you have not heard from us within '
        + '2 business days, call (877) 538-7380 with your booking reference.',
    });
    // Not the booking confirmation, nor a "held" email.
    expect(mailer.sendBookingNotificationEmails).not.toHaveBeenCalled();
  });

  it('the needs-review alarm announces it once more, as a refund to make - not "ticket it, or refund it"', async () => {
    const d = await desk([commitUnknown()]);
    await d.handle(notHeld);
    const row = table.row(REF);
    const { selectUnannounced, buildMessage } = await import('../../backend/jobs/needsReviewAlert.job.js');

    expect(selectUnannounced([row]), 'announced as a commit to check, then never as money to return').toHaveLength(1);
    const message = buildMessage([row]);
    expect(message).toMatch(/the airline does not hold/);
    expect(message).toMatch(/Cancel & refund/);
    expect(message).toMatch(/\*FLTUNK1\*/);
    expect(message).not.toMatch(/ticket it, or refund it/);
  });

  it('leaves the desk once Cancel & refund returns the payment', async () => {
    const d = await desk([commitUnknown()]);
    await d.handle(notHeld);

    expect((await d.cancel()).status).toBe(200);

    const row = table.row(REF);
    expect(row.status).toBe('cancelled');
    expect(row.booking_details.cancellation).toMatchObject({ paymentAction: 'VOID', refundAmount: 291 });
    // "We will email you when the refund is made": the cancellation email.
    expect(mailer.sendCancellationNotificationEmails).toHaveBeenCalledTimes(1);
    expect(await d.open()).toHaveLength(0);
    const { selectUnannounced } = await import('../../backend/jobs/needsReviewAlert.job.js');
    expect(selectUnannounced([row])).toHaveLength(0);
  });

  it('leaves the desk once a person marks the refund handled on its own entry', async () => {
    const d = await desk([commitUnknown()]);
    await d.handle(notHeld);

    const res = await d.handle({ note: 'Refunded 291 in the ARC portal.' });

    expect(res.status).toBe(200);
    expect(await d.open()).toHaveLength(0);
    expect(table.row(REF).booking_details.needs_review).toMatchObject({
      resolution: 'Refunded 291 in the ARC portal.', previous: { reason: COMMIT_UNKNOWN, outcome: 'not_held' },
    });
    // The customer was told once, at "not held".
    expect(customerEmails()).toHaveLength(1);
  });
});

// Fences: where the money already went back, or a cancel owns it, nothing changes.
describe('beside it', () => {
  it('a commit whose cancel already returned the payment: settled, and no email, as before', async () => {
    const d = await desk([commitUnknown()]);
    expect((await d.cancel()).status).toBe(200);
    expect(table.row(REF).payment_status).toBe('refunded');

    expect((await d.handle(notHeld)).status).toBe(200);

    expect(await d.open()).toHaveLength(0);
    expect(customerEmails()).toHaveLength(0);
  });

  it('a commit refunded from the Payments tab: settled, and no email, as before', async () => {
    const d = await desk([commitUnknown({ payment_status: 'refunded' })]);

    expect((await d.handle(notHeld)).status).toBe(200);

    expect(await d.open()).toHaveLength(0);
    expect(customerEmails()).toHaveLength(0);
  });

  it('a commit whose cancel refund ARC Pay refused: the refused refund\'s own entry, and no email, as before', async () => {
    axios.put.mockResolvedValue({ status: 200, data: { result: 'FAILURE', response: { gatewayCode: 'DECLINED' } } });
    const d = await desk([commitUnknown()]);
    expect((await d.cancel()).status).toBe(200);
    mailer.sendEmail.mockClear();

    expect((await d.handle(notHeld)).status).toBe(200);

    const [listed] = await d.open();
    expect(listed.attention.kind).toBe('refund_failed');
    expect(customerEmails()).toHaveLength(0);
  });

  it('"held": a paid reservation to ticket, with no refund on the desk and no "did not go through" email', async () => {
    const d = await desk([commitUnknown()]);

    const res = await d.handle({ note: 'Airline holds it.', outcome: 'held', pnr: 'ABC123' });

    expect(res.status).toBe(200);
    expect(attentionOf(table.row(REF))).toMatchObject({ kind: 'review', reason: 'PNR committed, never ticketed' });
    expect(customerEmails()).toHaveLength(0);
  });

  it('the desk list reads the resolved commit alone as settled when the booking is cancelled or its money is back', () => {
    const answered = (over) => {
      const row = commitUnknown(over);
      row.booking_details.needs_review = { ...row.booking_details.needs_review, resolved_at: tenMinutesAgo(), outcome: 'not_held' };
      return row;
    };
    expect(attentionOf(answered({ status: 'cancelled', payment_status: 'refunded' }))).toBeNull();
    expect(attentionOf(answered({ payment_status: 'partially_refunded' }))).toBeNull();
    expect(attentionOf(answered({ payment_status: 'reversed' }))).toBeNull();
    expect(attentionOf(answered({ total_amount: 0 }))).toBeNull();
    // A person's note alone on it, with no airline answer: not a not-held commit.
    const noted = commitUnknown();
    noted.booking_details.needs_review = { ...noted.booking_details.needs_review, resolved_at: tenMinutesAgo() };
    expect(attentionOf(noted)).toBeNull();
  });
});
