import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';
import { errorHandler } from '../../backend/middleware/errorHandler.js';

/**
 * An ordinary held reservation (a PNR, no ticket) whose cancel the airline
 * refused - PNR_Cancel answered with an error, or with a reply that is not a
 * SOAP envelope.
 *
 * The cancel answers the customer: "We could not cancel your reservation with
 * the airline. Our team has been alerted and will complete it". Nobody issues
 * a ticket on it after that: the desk lists it "Cancel failed at the airline".
 * Every page then promised one: My Trips and Manage Booking "your ticket has
 * not been issued yet. Our team is working on it", the document "We will
 * email your e-ticket once it is issued", and a reload of the order page "our
 * team is finishing it". No customer surface read the refused cancel.
 *
 * Now the server names it (toClientBooking `cancel_failed`, the order route's
 * `cancelFailed`, both the desk's rule: openFailedCancellationOf), and the
 * pages say the cancellation is being completed and that no ticket will be
 * issued. The states next to it - a ticket issued or voided, no confirmed
 * seat, a commit nobody heard back from, a cancellation carried out and not
 * recorded - read as they did.
 *
 * Driven through the real cancel handler and the real SOAP provider (only the
 * wire is stubbed), then the real projection and the real order route.
 */

const REF = 'FLTHCR1';
const PNR = 'HCR111';

const held = () => ({
  id: 'bk-hcr1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending_ticketing',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  created_at: '2026-09-21T08:00:00Z',
  booking_details: {
    pnr: PNR,
    order_id: REF,
    success_indicator: `SI-${REF}`,
    customer_email: 'jane@example.com',
    gds: { ticketed: false },
    tickets: [],
    gds_chain: { state: 'finished', finishedAt: '2026-09-21T08:01:00Z' },
    confirmation_email: { state: 'sent' },
  },
});

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

const createFlightOrder = vi.fn();
vi.mock('../../backend/services/flightProvider.js', async () => {
  const soap = (await vi.importActual('../../backend/services/amadeusSoap/index.js')).default;
  return {
    default: { cancelFlightOrder: (...args) => soap.cancelFlightOrder(...args), createFlightOrder: (...args) => createFlightOrder(...args) },
    providerStatus: () => ({ enabled: true, bookingEnabled: true, wsap: '1ASIWJETJEC' }),
  };
});

const envelope = (name, inner) => `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3">
  <soap:Header><awsse:Session TransactionStatusCode="InSeries"><awsse:SessionId>S1</awsse:SessionId><awsse:SequenceNumber>1</awsse:SequenceNumber><awsse:SecurityToken>T</awsse:SecurityToken></awsse:Session></soap:Header>
  <soap:Body><${name}>${inner}</${name}></soap:Body>
</soap:Envelope>`;
const soapReply = (xml) => ({ status: 200, data: xml, headers: {} });
const retrievedNoTickets = envelope('PNR_Reply',
  `<pnrHeader><reservationInfo><reservation><controlNumber>${PNR}</controlNumber></reservation></reservationInfo></pnrHeader>`);
const cancelRefused = envelope('PNR_Reply',
  '<generalErrorInfo><errorOrWarningCodeDetails><errorDetails><errorCode>999</errorCode></errorDetails></errorOrWarningCodeDetails>'
  + '<errorFreeText>CANCEL NOT ALLOWED</errorFreeText></generalErrorInfo>');

const cancel = async () => {
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const res = createResponse();
  await handleCancelBookingAction(createRequest({ method: 'POST', body: { bookingReference: REF, reason: 'Change of plans', email: 'jane@example.com' } }), res);
  return res;
};

const retryOrder = async () => {
  const supabase = (await import('../../backend/config/supabase.js')).default;
  supabase.from.mockImplementation(table.from);
  const routes = (await import('../../backend/routes/flight.routes.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/flights', routes);
  app.use(errorHandler);
  return request(app).post('/api/flights/order').send({
    bookingReference: REF,
    orderId: REF,
    transactionId: `SI-${REF}`,
    contactInfo: { email: 'jane@example.com' },
    travelers: [{ id: '1', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', gender: 'FEMALE' }],
  });
};

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.resetModules();
  createFlightOrder.mockReset();
  axios.post.mockReset();
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
  axios.get.mockReset();
  axios.get.mockResolvedValue({
    status: 200,
    data: { status: 'CAPTURED', amount: 291, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: '1', type: 'PAYMENT', amount: 291, currency: 'USD' } }] },
  });
});

const refusedCancel = async () => {
  table = fakeBookingsTable([held()], { tables: { price_settings: [], payments: [] } });
  axios.post
    .mockResolvedValueOnce(soapReply(retrievedNoTickets))
    .mockResolvedValueOnce(soapReply(cancelRefused))
    .mockResolvedValue(soapReply(envelope('Security_SignOutReply', '<dummy/>')));
  const cancelled = await cancel();
  expect(cancelled.statusCode).toBe(502);
  expect(cancelled.body.message).toMatch(/Our team has been alerted and will complete it/);
  return table.row(REF);
};

/** What My Trips, Manage Booking and the document read, from what GET /flights/bookings sends. */
const pagesSay = async (row) => {
  const { toClientBooking } = await import('../../backend/routes/flight.routes.js');
  const client = toClientBooking(row);
  const { attentionMessage } = await import('../../frontend/src/utils/bookingStatus.js');
  const { canDownloadDocument, documentState, ticketState } = await import('../../frontend/src/utils/eTicket.js');
  return {
    client,
    myTrips: attentionMessage(client),
    document: documentState(client),
    offered: canDownloadDocument(client),
    ticket: ticketState(client),
  };
};

// Sentences that promise a ticket will be issued on this booking.
const TICKET_PROMISED = /ticket is being issued|Our team is working on it|email your e-ticket once it is issued|Our team is finishing it|finishing your ticket|could not be issued automatically|not been issued yet/i;

const REFUSED = 'GDS cancellation failed; refund withheld to avoid paying out against a live booking';
const refusedFlag = (over = {}) => ({ reason: REFUSED, source: 'cancellation', cancelFailed: true, pnr: PNR, at: '2026-09-21T09:00:00Z', ...over });
const withFlag = (flag, over = {}) => {
  const row = held();
  Object.assign(row, over);
  row.booking_details.needs_review = flag;
  return row;
};
// What the pages said of each neighbour before this change.
const HELD_FOR_STAFF = 'Your seats are reserved, but your ticket has not been issued yet. Our team is working on it and will email you.';

describe('a held reservation whose cancel the airline refused', () => {
  it('is told on every page that the cancellation is being completed, and promised no ticket', async () => {
    const row = await refusedCancel();
    const { attentionOf, attentionLabel } = await import('../../shared/reviewQueue.js');
    // The desk: finish the cancel. Not issue a ticket.
    expect(attentionLabel(attentionOf(row))).toBe('Cancel failed at the airline');

    const said = await pagesSay(row);
    // My Trips and the Manage Booking banner.
    expect(said.myTrips).not.toMatch(TICKET_PROMISED);
    expect(said.myTrips).toMatch(/cancellation has not been completed with the airline yet/);
    expect(said.myTrips).toMatch(/no ticket will be issued/i);
    // Not the held document ("We will email your e-ticket once it is issued"),
    // and Manage Booking does not offer one for a booking being cancelled.
    expect({ document: said.document, offered: said.offered, ticket: said.ticket })
      .toEqual({ document: 'cancel_pending', offered: false, ticket: 'none' });
    expect(said.client.cancel_failed).toBe(true);
  });

  it('a reload of the order page is answered as a cancellation being completed', async () => {
    await refusedCancel();
    const retry = await retryOrder();
    expect(retry.body.message).not.toMatch(/not been issued yet/);
    expect(retry.body.message).toMatch(/cancellation has not been completed/);
    expect({
      mode: retry.body.mode,
      ticketed: retry.body.ticketed,
      needsReview: retry.body.needsReview,
      cancelFailed: retry.body.cancelFailed,
    }).toEqual({ mode: 'ALREADY_BOOKED', ticketed: false, needsReview: true, cancelFailed: true });
  });

  it('a copy of the row that carries the flag itself is read the same way', async () => {
    const row = await refusedCancel();
    const { attentionMessage } = await import('../../frontend/src/utils/bookingStatus.js');
    const { documentState } = await import('../../frontend/src/utils/eTicket.js');
    expect(documentState(row)).toBe('cancel_pending');
    expect(attentionMessage(row)).toMatch(/no ticket will be issued/i);
  });
});

// Fences: the states next to it keep their words.
describe('around it', () => {
  it('a held reservation nobody asked to cancel still waits for its ticket', async () => {
    table = fakeBookingsTable([held()], { tables: { price_settings: [], payments: [] } });
    const said = await pagesSay(table.row(REF));
    expect(said.client.needs_review).toBeNull();
    expect(said.myTrips).toBeNull();
    expect(said.document).toBe('held');
    expect(said.offered).toBe(true);

    const retry = await retryOrder();
    expect(retry.body).toMatchObject({ mode: 'ALREADY_BOOKED', ticketed: false });
    expect(retry.body.message).toBe('This booking already exists; its ticket has not been issued yet');
  });

  it('a held reservation flagged for staff still says our team is working on its ticket', async () => {
    const row = withFlag({ reason: 'chain failed after commit at issueTicket', ticketed: false, at: '2026-09-21T08:01:00Z' });
    table = fakeBookingsTable([row], { tables: { price_settings: [], payments: [] } });
    const said = await pagesSay(table.row(REF));
    expect(said.myTrips).toBe(HELD_FOR_STAFF);
    expect(said.document).toBe('held');
    expect(said.offered).toBe(true);
  });

  it('a refused cancel on a ticketed booking keeps its ticket', async () => {
    const row = withFlag(refusedFlag(), { status: 'confirmed' });
    row.booking_details.gds = { ticketed: true };
    row.booking_details.tickets = [{ number: '220-7491175301', travelerId: '1' }];
    table = fakeBookingsTable([row], { tables: { price_settings: [], payments: [] } });
    const said = await pagesSay(table.row(REF));
    expect(said.ticket).toBe('issued');
    expect(said.document).toBe('ticketed');
    expect(said.myTrips).toBeNull();

    const retry = await retryOrder();
    expect(retry.body).toMatchObject({ mode: 'ALREADY_BOOKED', ticketed: true, message: 'This booking already exists' });
  });

  it('a refused cancel after the void keeps the voided wording', async () => {
    const A = '220-7491175301';
    const row = withFlag(refusedFlag({ voided_tickets: [A], unvoided_tickets: [] }), { status: 'confirmed' });
    row.booking_details.gds = { ticketed: true };
    row.booking_details.tickets = [{ number: A, travelerId: '1' }];
    row.booking_details.voided_tickets = [A];
    table = fakeBookingsTable([row], { tables: { price_settings: [], payments: [] } });
    const said = await pagesSay(table.row(REF));
    expect(said.document).toBe('tickets_voided');
    expect(said.offered).toBe(false);
    expect(said.myTrips).toMatch(/^Your ticket has been voided and is not valid for travel\. The cancellation has not been completed/);

    const retry = await retryOrder();
    expect(retry.body).toMatchObject({ mode: 'ALREADY_BOOKED', ticketed: false, message: 'This booking already exists; its ticket has been voided' });
  });

  it('a refused cancel on a PNR with no confirmed seat keeps its seat wording', async () => {
    const { NO_CONFIRMED_SEAT_REVIEW_REASON } = await import('../../shared/reviewQueue.js');
    const row = withFlag(refusedFlag({ previous: { reason: NO_CONFIRMED_SEAT_REVIEW_REASON, at: '2026-09-21T08:01:00Z' } }));
    const said = await pagesSay(row);
    expect(said.document).toBe('no_confirmed_seat');
    expect(said.offered).toBe(false);
    expect(said.myTrips).toMatch(/^The airline has not confirmed a seat on every flight/);
  });

  it('a commit nobody heard back from, whose fallback cancel could not reach the airline, is still being checked', async () => {
    const row = withFlag({
      reason: 'fallback cancel could not reach the GDS; booking may still be live', source: 'cancellation', cancelFailed: true,
      at: '2026-09-21T09:00:00Z', previous: { reason: 'chain failed after commit at commit', at: '2026-09-21T08:01:00Z' },
    }, { status: 'pending' });
    delete row.booking_details.pnr;
    const said = await pagesSay(row);
    expect(said.document).toBe('not_booked');
    expect(said.myTrips).toMatch(/^Your payment is safe and our team is checking with the airline whether your booking went through/);
  });

  it('a cancellation carried out and not recorded, over or under a refused one, reads as it did', async () => {
    const unrecorded = {
      reason: 'cancellation carried out but not recorded: airline reservation released, payment REFUND_PROCESSED 291 USD; check the airline and ARC Pay and record it by hand',
      source: 'cancellation', unrecorded: true, at: '2026-09-21T10:00:00Z',
    };
    for (const flag of [{ ...unrecorded, previous: refusedFlag() }, refusedFlag({ previous: unrecorded })]) {
      const said = await pagesSay(withFlag(flag));
      // As before this change - not an endorsement of the words.
      expect({ document: said.document, myTrips: said.myTrips }).toEqual({ document: 'held', myTrips: HELD_FOR_STAFF });
    }
  });

  it('a refused cancel a person marked handled is off the desk, and reads as it did', async () => {
    // As the desk reads it: marked handled, it is off the desk's list, so the
    // pages no longer say our team is completing the cancellation, and read as
    // they did before this change (a resolved flag still reads "held for
    // staff" on every held reservation - not an endorsement of the words).
    const said = await pagesSay(withFlag(refusedFlag({ resolved_at: '2026-09-22T09:00:00Z', resolved_by: 'desk@example.com' })));
    expect({ document: said.document, myTrips: said.myTrips }).toEqual({ document: 'held', myTrips: HELD_FOR_STAFF });
  });
});
