import { describe, expect, it, vi } from 'vitest';
import { canDownloadDocument, documentState, ticketState } from '../../frontend/src/utils/eTicket.js';
import { attentionOf } from '../../shared/reviewQueue.js';

vi.mock('../../backend/routes/payment/arcpay.config.js', async () => {
  const actual = await vi.importActual('../../backend/routes/payment/arcpay.config.js');
  const chain = {};
  for (const m of ['select', 'update', 'insert', 'upsert', 'eq', 'or', 'order', 'limit']) chain[m] = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.maybeSingle = chain.single;
  return { ...actual, supabase: { from: vi.fn(() => chain) } };
});

/**
 * The booking reads (My Trips, Manage Booking, the page My Trips "View
 * Details" opens) of a cancel that went through and could not be recorded.
 *
 * The cancel voided every ticket, released the PNR and voided the payment,
 * and its final "cancelled" write failed (flagUnrecordedCancellation,
 * payment/operations.handlers.js). The row reads as it did before: confirmed
 * and paid, gds.ticketed, its ticket list - and the flag records no voided
 * numbers. The customer was told "Please do not try again - call".
 *
 * toClientBooking sent none of that: status 'confirmed', tickets [A],
 * voided_tickets [], and a flag cut down to its reason. So every page called
 * the void ticket issued and offered its "E-Ticket". The order page's reload
 * already answers it as under review (alreadyBookedUnrecordedCancellation).
 */

const A = '220-1111111111';
const HOUR_AGO = new Date(Date.now() - 3600e3).toISOString();

// flagUnrecordedCancellation's flag, as the cancel handler writes it.
const unrecorded = (over = {}) => ({
  reason: 'cancellation carried out but not recorded: airline reservation released, payment VOID 291 USD; check the airline and ARC Pay and record it by hand',
  source: 'cancellation', unrecorded: true, ticketsVoided: true, at: '2026-09-22T08:03:00Z', paymentAction: 'VOID', refundAmount: 291,
  ...over,
});
const REFUSED = 'GDS cancellation failed; refund withheld to avoid paying out against a live booking';

const row = (details = {}, over = {}) => ({
  id: 'bk-held1',
  booking_reference: 'FLTHELD1',
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 291,
  user_id: 'user-1',
  created_at: new Date().toISOString(),
  ...over,
  booking_details: {
    pnr: 'HELD99',
    order_id: 'FLTHELD1',
    customer_email: 'jane@example.com',
    gds: { ticketed: true },
    tickets: [{ number: A, travelerId: '1' }],
    gds_chain: { state: 'cancelling', startedAt: HOUR_AGO, stateBeforeCancel: 'finished' },
    ...details,
  },
});

const refused = (over = {}) => ({
  reason: REFUSED, source: 'cancellation', cancelFailed: true, pnr: 'HELD99', at: '2026-09-22T08:01:00Z', ...over,
});
const allVoided = () => row({ voided_tickets: [A], needs_review: refused({ voided_tickets: [A], unvoided_tickets: [] }) });
const commitUnknown = () => row({
  pnr: undefined, gds: { ticketed: false }, tickets: [], gds_chain: { state: 'in_progress', startedAt: HOUR_AGO },
  needs_review: { reason: 'chain failed after commit at commit', ticketed: false, at: '2026-09-22T08:00:00Z' },
}, { status: 'pending' });
const noSeat = () => row({
  gds: { ticketed: false }, tickets: [], gds_chain: { state: 'failed' },
  needs_review: { reason: 'chain failed after commit at segmentStatus', ticketed: false, at: '2026-09-22T08:00:00Z' },
}, { status: 'pending_ticketing' });

const client = async (booking) => {
  const { toClientBooking } = await import('../../backend/routes/flight.routes.js');
  return toClientBooking(booking);
};

const reads = (sent) => ({
  ticketState: ticketState(sent),
  documentState: documentState(sent),
  canDownload: canDownloadDocument(sent),
});

describe('a cancel that went through and could not be recorded, on the booking reads', () => {
  it('the server names it', async () => {
    const booking = row({ needs_review: unrecorded() });
    expect(attentionOf(booking).kind).toBe('unrecorded_cancellation');

    expect((await client(booking)).needs_review.unrecorded_cancellation).toBe(true);
  });

  it('the void ticket is not called issued, and no document is offered', async () => {
    expect(reads(await client(row({ needs_review: unrecorded() })))).toEqual({
      ticketState: 'cancelled', documentState: 'cancelled', canDownload: false,
    });
  });

  it('with its flag under a later one (a retried cancel refused): the same', async () => {
    const sent = await client(row({
      needs_review: {
        reason: REFUSED, source: 'cancellation', cancelFailed: true, pnr: 'HELD99', at: '2026-09-22T09:00:00Z',
        previous: unrecorded(),
      },
    }));

    expect(sent.needs_review.unrecorded_cancellation).toBe(true);
    expect(reads(sent)).toEqual({ ticketState: 'cancelled', documentState: 'cancelled', canDownload: false });
  });

  it('and only it: no other flag is named an unrecorded cancellation', async () => {
    for (const booking of [row({ needs_review: refused() }), allVoided(), commitUnknown(), noSeat()]) {
      expect((await client(booking)).needs_review.unrecorded_cancellation).toBe(false);
    }
  });

  it('read from a raw row, which names nothing: the same', () => {
    expect(reads(row({ needs_review: unrecorded() }))).toEqual({
      ticketState: 'cancelled', documentState: 'cancelled', canDownload: false,
    });
  });
});

// Fences: the states next to it read exactly as before.
describe('the booking reads next to it', () => {
  it('a ticketed booking nobody cancelled: issued, an E-Ticket, not flagged', async () => {
    const sent = await client(row({ gds_chain: { state: 'finished' } }));

    expect(sent.needs_review).toBeNull();
    expect(reads(sent)).toEqual({ ticketState: 'issued', documentState: 'ticketed', canDownload: true });
  });

  it('a cancelled booking: cancelled, no document', async () => {
    const sent = await client(row({ needs_review: unrecorded() }, { status: 'cancelled', payment_status: 'refunded' }));

    expect(reads(sent)).toEqual({ ticketState: 'cancelled', documentState: 'cancelled', canDownload: false });
  });

  it('a ticketed booking refunded from the Payments tab: issued, as before', async () => {
    const sent = await client(row({ gds_chain: { state: 'finished' } }, { payment_status: 'refunded' }));

    expect(reads(sent)).toEqual({ ticketState: 'issued', documentState: 'ticketed', canDownload: true });
  });

  it('a cancel the airline refused, nothing voided: issued', async () => {
    const sent = await client(row({ needs_review: refused() }));

    expect(reads(sent)).toEqual({ ticketState: 'issued', documentState: 'ticketed', canDownload: true });
  });

  it('a cancel the airline refused after voiding every ticket: voided, as before', async () => {
    const sent = await client(allVoided());

    expect(reads(sent)).toEqual({ ticketState: 'none', documentState: 'tickets_voided', canDownload: false });
  });

  it('a commit that never answered: no PNR, no document, as before', async () => {
    const sent = await client(commitUnknown());

    expect(sent.needs_review.commit_unknown).toBe(true);
    expect(reads(sent)).toEqual({ ticketState: 'none', documentState: 'not_booked', canDownload: false });
  });

  it('a PNR the airline confirmed no seat on: as before', async () => {
    const sent = await client(noSeat());

    expect(sent.needs_review.no_confirmed_seat).toBe(true);
    expect(reads(sent)).toEqual({ ticketState: 'none', documentState: 'no_confirmed_seat', canDownload: false });
  });
});
