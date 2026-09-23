import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../backend/middleware/errorHandler.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { canDownloadDocument, documentState, ticketState } from '../../frontend/src/utils/eTicket.js';
import { attentionMessage } from '../../frontend/src/utils/bookingStatus.js';
import { attentionOf, isUnrecordedCancellation } from '../../shared/reviewQueue.js';

/**
 * A cancel that went through and could not be recorded, whose flag a person
 * then marked handled - and left the booking confirmed.
 *
 * The flag records a fact about the airline record: the reservation released,
 * its tickets voided, the payment voided. "Mark as handled" says a person dealt
 * with it, not that any of that was undone. But unrecordedCancellationOf walks
 * flagInForce, which stops at a resolved flag - so once resolved, the order
 * route's reload read the row alone and answered ALREADY_BOOKED, ticketed:true
 * with the void number, and the order page said "Booking Confirmed!"; every
 * booking read went back to an issued ticket and an E-Ticket.
 *
 * The customer's answers now read the flag past a resolved one, until the
 * booking is recorded cancelled. The desk and the alarm do not: a person
 * resolving it takes it off their lists, as before.
 */

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

const REF = 'FLTHELD1';
const A = '220-1111111111';
const JANE = [{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', gender: 'FEMALE' }];
const HOUR_AGO = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();
const createFlightOrder = vi.fn();

const retry = async (row) => {
  table = fakeBookingsTable([row]);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  return request(app).post('/api/flights/order').send({
    bookingReference: REF, orderId: REF, transactionId: `SI-${REF}`, contactInfo: { email: 'jane@example.com' }, travelers: JANE,
  });
};

const client = async (booking) => {
  const { toClientBooking } = await import('../../backend/routes/flight.routes.js');
  return toClientBooking(booking);
};

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'false');
  vi.resetModules();
  createFlightOrder.mockReset();
  vi.doMock('../../backend/services/flightProvider.js', () => ({
    default: { createFlightOrder },
    providerStatus: () => ({ bookingEnabled: false }),
  }));
  const mailer = { sendBookingNotificationEmails: vi.fn(async () => ({ success: true })), sendEmail: vi.fn(), sendCancellationNotificationEmails: vi.fn() };
  vi.doMock('../../backend/services/emailService.js', () => ({ ...mailer, default: mailer }));
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockReset();
});

afterEach(() => {
  vi.doUnmock('../../backend/services/flightProvider.js');
  vi.doUnmock('../../backend/services/emailService.js');
  vi.unstubAllEnvs();
});

const RESOLVED = { resolved_at: '2026-09-22T10:00:00Z', resolved_by: 'desk@example.com', resolution: 'called the customer' };
const REFUSED = 'GDS cancellation failed; refund withheld to avoid paying out against a live booking';

// flagUnrecordedCancellation's flag, as the cancel handler writes it.
const unrecorded = (over = {}) => ({
  reason: 'cancellation carried out but not recorded: airline reservation released, payment VOID 291 USD; '
    + 'check the airline and ARC Pay and record it by hand',
  source: 'cancellation', unrecorded: true, ticketsVoided: true, at: '2026-09-22T08:03:00Z', paymentAction: 'VOID', refundAmount: 291,
  ...over,
});

const row = (details = {}, over = {}) => ({
  id: 'bk-held1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 291,
  user_id: 'user-1',
  created_at: new Date().toISOString(),
  ...over,
  booking_details: {
    pnr: 'HELD99',
    order_id: REF,
    success_indicator: `SI-${REF}`,
    customer_email: 'jane@example.com',
    gds: { ticketed: true },
    tickets: [{ number: A, travelerId: '1' }],
    gds_chain: { state: 'cancelling', startedAt: HOUR_AGO(), stateBeforeCancel: 'finished' },
    confirmation_email: { state: 'sent' },
    ...details,
  },
});

// Marked handled, the booking left confirmed and paid.
const handled = () => row({ needs_review: unrecorded(RESOLVED) });
// A later cancel refused on top of it, and that one marked handled.
const handledUnderLater = () => row({
  needs_review: {
    reason: REFUSED, source: 'cancellation', cancelFailed: true, pnr: 'HELD99', at: '2026-09-22T09:00:00Z', ...RESOLVED,
    previous: unrecorded(),
  },
});

describe('an unrecorded cancel marked handled, the booking still confirmed', () => {
  it.each([
    ['its own flag resolved', handled],
    ['a later flag over it resolved', handledUnderLater],
  ])('a reload of the order page is still under review, not ALREADY_BOOKED and ticketed (%s)', async (_label, make) => {
    const res = await retry(make());

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_NEEDS_REVIEW');
    expect(res.body.paymentState).toBe('unconfirmed');
    expect(res.body.error).not.toMatch(/refunded|held/);
    expect(res.body.mode).toBeUndefined();
    expect(res.body.ticketed).toBeUndefined();
    expect(res.body.tickets).toBeUndefined();
    expect(createFlightOrder).not.toHaveBeenCalled();
  });

  it.each([
    ['its own flag resolved', handled],
    ['a later flag over it resolved', handledUnderLater],
  ])('the booking reads still name it, and offer no document (%s)', async (_label, make) => {
    const sent = await client(make());

    expect(sent.needs_review.unrecorded_cancellation).toBe(true);
    expect(ticketState(sent)).toBe('cancelled');
    expect(documentState(sent)).toBe('cancelled');
    expect(canDownloadDocument(sent)).toBe(false);
    expect(attentionMessage(sent)).toMatch(/^Your cancellation went through, but our record of it is still being updated/);
  });

  it('a raw row, which names nothing, reads the same', () => {
    expect(ticketState(handled())).toBe('cancelled');
    expect(canDownloadDocument(handled())).toBe(false);
    expect(attentionMessage(handled())).toMatch(/^Your cancellation went through/);
  });
});

// Fences: what is right today, and must stay right.
describe('next to it', () => {
  it('the desk and the alarm: marked handled takes it off their lists, as before', () => {
    expect(attentionOf(handled())).toBeNull();
    expect(isUnrecordedCancellation(handled())).toBe(false);
    expect(isUnrecordedCancellation(handledUnderLater())).toBe(false);
    // Not handled: on both lists, as before.
    expect(attentionOf(row({ needs_review: unrecorded() })).kind).toBe('unrecorded_cancellation');
    expect(isUnrecordedCancellation(row({ needs_review: unrecorded() }))).toBe(true);
  });

  it('recorded cancelled since: BOOKING_CANCELLED on a reload, cancelled on the reads, and the flag is not named', async () => {
    const cancelled = () => row({ needs_review: unrecorded(RESOLVED) }, { status: 'cancelled', payment_status: 'refunded' });

    const res = await retry(cancelled());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_CANCELLED');

    const sent = await client(cancelled());
    expect(sent.needs_review.unrecorded_cancellation).not.toBe(true);
    expect(ticketState(sent)).toBe('cancelled');
    expect(canDownloadDocument(sent)).toBe(false);
  });

  it('a refused cancel marked handled, nothing voided: ALREADY_BOOKED and ticketed, as before', async () => {
    const res = await retry(row({
      gds_chain: { state: 'finished', finishedAt: '2026-09-21T08:01:00Z' },
      needs_review: { reason: REFUSED, source: 'cancellation', cancelFailed: true, pnr: 'HELD99', at: '2026-09-22T08:01:00Z', ...RESOLVED },
    }));

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('ALREADY_BOOKED');
    expect(res.body.ticketed).toBe(true);
    expect(res.body.paymentState).toBe('held');
  });

  it('a ticketed booking nobody cancelled: ALREADY_BOOKED and ticketed, issued on the reads, as before', async () => {
    const plain = () => row({ gds_chain: { state: 'finished', finishedAt: '2026-09-21T08:01:00Z' } });

    const res = await retry(plain());
    expect(res.status).toBe(200);
    expect(res.body.ticketed).toBe(true);
    expect(res.body.paymentState).toBe('held');
    expect(ticketState(await client(plain()))).toBe('issued');
  });

  it('a commit that never answered, marked handled: reads as before, not as a cancellation', async () => {
    const sent = await client(row({
      pnr: undefined, gds: { ticketed: false }, tickets: [], gds_chain: { state: 'in_progress', startedAt: HOUR_AGO() },
      needs_review: { reason: 'chain failed after commit at commit', ticketed: false, at: '2026-09-22T08:00:00Z', ...RESOLVED },
    }, { status: 'pending' }));

    expect(sent.needs_review.commit_unknown).toBe(false);
    expect(sent.needs_review.unrecorded_cancellation).not.toBe(true);
    expect(ticketState(sent)).toBe('none');
  });
});
