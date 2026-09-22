import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * The reason a held refund is announced with is the reason of THIS cancel.
 *
 * The failed-refund alarm printed "held because:" from any review flag with
 * source 'cancellation', ahead of the cancellation's own basis and reason. A
 * fallback cancel (DELETE /api/flights/order/:orderId, when the orchestrated
 * cancel threw) that the airline DID carry out writes a cancellation record
 * and no flag - so an earlier cancel the airline refused, whose flag says
 * "GDS cancellation failed; refund withheld to avoid paying out against a live
 * booking", was still on top, and the alarm said the refund was held for that.
 * The seats had been released; the refund was held because the fallback never
 * attempts one.
 *
 * A flag is now taken as this cancel's only when it is not a refused cancel's
 * (cancelFailed, which never comes with a cancellation record) and was written
 * no earlier than the cancellation. The cancel writes its own flag in the same
 * write as its cancellation, at the same moment.
 */

const REF = 'FLTFB1';
const OWNER = { id: '0b7c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4', role: 'user' };

const row = (details = {}) => ({
  id: 'bk-fb1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending_ticketing',
  payment_status: 'paid',
  total_amount: 291,
  user_id: OWNER.id,
  created_at: '2026-09-21T08:00:00Z',
  booking_details: { pnr: 'SEAT42', order_id: REF, customer_email: 'jane@example.com', gds: { ticketed: false }, tickets: [], ...details },
});

let table = fakeBookingsTable([]);
const cancelFlightOrder = vi.fn();

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  return { ...actual, get supabase() { return { from: (...args) => table.from(...args) }; } };
});

// The orchestrated cancel throws: the only way the fallback runs.
vi.mock('../../backend/routes/payment/operations.handlers.js', async (importOriginal) => ({
  ...(await importOriginal()),
  handleCancelBookingAction: async () => { throw new Error('orchestrator crashed'); },
}));

vi.mock('../../backend/services/flightProvider.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: new Proxy(actual.default, {
      get: (target, key) => (key === 'cancelFlightOrder' ? (...args) => cancelFlightOrder(...args) : target[key]),
    }),
  };
});

vi.mock('../../backend/middleware/auth.middleware.js', async (importOriginal) => {
  const actual = await importOriginal();
  const userFrom = (req) => (req.headers['x-test-user'] ? JSON.parse(req.headers['x-test-user']) : null);
  return {
    ...actual,
    protect: (req, res, next) => {
      req.user = userFrom(req);
      return req.user ? next() : res.status(401).json({ message: 'Not authorized' });
    },
    optionalProtect: (req, res, next) => { req.user = userFrom(req); next(); },
  };
});

const deleteOrder = async (bookingRow) => {
  table = fakeBookingsTable([bookingRow]);
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  return request(app).delete(`/api/flights/order/${REF}`).set('x-test-user', JSON.stringify(OWNER)).send();
};

const alarm = () => import('../../backend/jobs/paymentFailureAlert.job.js');

// What cancelFlightBooking writes when the airline refuses the cancel.
const REFUSED_EARLIER = {
  reason: 'GDS cancellation failed; refund withheld to avoid paying out against a live booking',
  source: 'cancellation', cancelFailed: true, pnr: 'SEAT42', at: '2026-09-21T09:00:00Z', alerted_at: '2026-09-21T09:15:00Z',
};
const FALLBACK_REASON = 'fallback cancel: the orchestrated cancel gave no answer, so no refund was attempted';

beforeEach(() => {
  vi.resetModules();
  cancelFlightOrder.mockReset();
  cancelFlightOrder.mockResolvedValue({ success: true, hadTickets: false, voided: false, requiresAirlineRefund: [] });
});

describe('a fallback cancel the airline carried out, after an earlier cancel it refused', () => {
  it('is announced as held for the fallback\'s reason, not the refused cancel\'s', async () => {
    const res = await deleteOrder(row({ needs_review: REFUSED_EARLIER }));
    expect(res.status).toBe(200);
    const saved = table.row(REF);
    expect(saved.status).toBe('cancelled');
    expect(saved.booking_details.cancellation.paymentAction).toBe('REFUND_UNDER_REVIEW');
    expect(saved.booking_details.needs_review.cancelFailed).toBe(true);

    const { selectUnrefunded, buildMessage } = await alarm();
    expect(selectUnrefunded([saved])).toHaveLength(1);
    const message = buildMessage([saved]);
    expect(message).toContain(`held because: ${FALLBACK_REASON}`);
    expect(message).not.toMatch(/GDS cancellation failed|refund withheld to avoid paying out against a live booking/);
  });
});

describe('which flag is this cancel\'s', () => {
  const now = '2026-09-23T10:00:00.000Z';
  const earlier = '2026-09-22T10:00:00.000Z';
  const cancelled = (cancellation, needsReview) => ({
    booking_reference: 'FLTRV2',
    status: 'cancelled',
    payment_status: 'paid',
    total_amount: 400,
    created_at: earlier,
    booking_details: {
      cancellation: { paymentAction: 'REFUND_UNDER_REVIEW', refundAmount: 0, cancelledAt: now, reason: 'Customer request', ...cancellation },
      ...(needsReview ? { needs_review: needsReview } : {}),
    },
  });
  const heldLine = async (booking) => (await alarm()).buildMessage([booking]).split('\n').find((line) => line.startsWith('held because:'));

  it('a refused cancel\'s flag written at the same moment is still not this cancel\'s', async () => {
    const booking = cancelled({ reason: FALLBACK_REASON, source: 'fallback' }, { ...REFUSED_EARLIER, at: now });
    expect(await heldLine(booking)).toBe(`held because: ${FALLBACK_REASON}`);
  });

  it('a flag from before the cancellation gives way to the cancellation\'s basis', async () => {
    const booking = cancelled(
      { basis: 'the airline did not say whether a ticket had been issued' },
      { reason: 'cancellation carried out but not recorded: no airline reservation, payment VOID 0 USD', source: 'cancellation', unrecorded: true, at: earlier },
    );
    expect(await heldLine(booking)).toBe('held because: the airline did not say whether a ticket had been issued');
  });

  // Fences: the cancel's own flag, written with its cancellation, still wins -
  // it carries the decision and anything added after it, such as the claim.
  it('the cancel\'s own flag, written with the cancellation, is still preferred to the basis', async () => {
    const booking = cancelled(
      { basis: 'non-refundable fare with tickets past their void window: what the airline returns depends on its fare rules' },
      {
        reason: 'non-refundable fare with tickets past their void window: what the airline returns depends on its fare rules; '
          + 'tickets could not be voided; airline refund must be claimed',
        source: 'cancellation', at: now, tickets: ['057-2412345678'],
      },
    );
    expect(await heldLine(booking)).toMatch(/airline refund must be claimed$/);
  });

  it('a flag that records no time is still taken as the cancel\'s', async () => {
    const booking = cancelled({ basis: 'the decision alone' }, { reason: 'the fullest reason', source: 'cancellation' });
    expect(await heldLine(booking)).toBe('held because: the fullest reason');
  });

  it('with no flag and no basis, the cancellation\'s own reason', async () => {
    const booking = cancelled({ reason: FALLBACK_REASON, source: 'fallback' });
    expect(await heldLine(booking)).toBe(`held because: ${FALLBACK_REASON}`);
  });

  it('a flag another source wrote is not this cancel\'s either', async () => {
    const booking = cancelled({ basis: 'the decision alone' }, { reason: 'chain failed after commit at issueTicket', at: now });
    expect(await heldLine(booking)).toBe('held because: the decision alone');
  });
});
