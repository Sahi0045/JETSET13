import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';

/**
 * Cancelling a booking held after DocIssuance went unanswered.
 *
 * The row is the one the real chain and the real order route write
 * (issuanceUnansweredNotCalledUnticketed.test.js): pending_ticketing,
 * gds.ticketed false, and a flag saying ticketed false with `issuance:
 * 'unknown'` - a ticket may exist.
 *
 * A cancel retrieves the PNR first and voids any ticket on it. The one guard
 * for a retrieve that shows none - "the booking records a ticket, but the
 * airline showed none" (decideFlightRefund) - was armed only by a recorded
 * ticket, so for this row it stayed off and the cancel refunded in full: if
 * Amadeus had issued after our timeout and the FA line was not on the PNR yet,
 * that was a refund over a live ticket. The unanswered issuance now arms it,
 * wherever the flag sits in the chain, and the cancel goes to a person.
 *
 * The real handler and the real Amadeus provider (SOAP on axios.post); ARC is
 * axios.get (what is held) and axios.put (the reversal).
 */

const REF = 'FLTUNANSWERED1';

/** As flagForReview left it after the unanswered issuance. */
const flag = (over = {}) => ({
  reason: 'chain failed after commit at issueTicket',
  ticketed: false,
  issuance: 'unknown',
  at: '2026-09-23T09:00:26.000Z',
  amadeus: { operation: 'DocIssuance_IssueTicket', code: null, message: 'timeout of 25000ms exceeded' },
  ...over,
});

const heldRow = (needsReview = flag(), gdsTicketed = false) => ({
  id: 'uuid-unanswered-1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'pending_ticketing',
  payment_status: 'paid',
  total_amount: 291,
  user_id: null,
  created_at: '2026-09-23T09:00:00.000Z',
  booking_details: {
    order_id: REF,
    customer_email: 'jane@example.com',
    arc_captured_amount: 291,
    arc_captured_currency: 'USD',
    pnr: 'HELD42',
    amadeus_order_id: 'HELD42',
    gds: { tst_refs: ['1'], priced_total: 291, priced_currency: 'USD', ticketed: gdsTicketed, committed_at: '2026-09-23T09:00:00.000Z' },
    gds_chain: { state: 'finished', committedAt: '2026-09-23T09:00:00.000Z', finishedAt: '2026-09-23T09:00:26.000Z' },
    needs_review: needsReview,
  },
});

/** Minimal Supabase double, as cancelRefundGuard.test.js: reads return `row`, writes win. */
const supabaseFor = (row) => {
  const updates = [];
  const chain = () => {
    const c = {
      select: vi.fn(() => c),
      update: vi.fn((payload) => { updates.push(payload); return c; }),
      insert: vi.fn(() => c),
      eq: vi.fn(() => c),
      is: vi.fn(() => c),
      neq: vi.fn(() => c),
      or: vi.fn(() => c),
      filter: vi.fn(() => c),
      order: vi.fn(() => c),
      limit: vi.fn(() => c),
      single: vi.fn().mockResolvedValue({ data: row, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: (resolve) => resolve({ data: [row], error: null }),
    };
    return c;
  };
  return { client: { from: vi.fn(() => chain()) }, updates };
};

let supabaseDouble = supabaseFor(heldRow());

vi.mock('../../backend/routes/payment/arcpay.config.js', () => ({
  get supabase() { return supabaseDouble.client; },
  ARC_PAY_CONFIG: { BASE_URL: 'https://arc.test/api', MERCHANT_ID: 'TESTMERCHANT' },
  getArcPayAuthConfig: () => ({ headers: {} }),
}));

// ---- Amadeus replies (cancelVoid.test.js shapes) -----------------------------

const envelope = (name, inner) => `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3">
  <soap:Header><awsse:Session TransactionStatusCode="InSeries"><awsse:SessionId>S1</awsse:SessionId><awsse:SequenceNumber>1</awsse:SequenceNumber><awsse:SecurityToken>T</awsse:SecurityToken></awsse:Session></soap:Header>
  <soap:Body><${name}>${inner}</${name}></soap:Body>
</soap:Envelope>`;
const soap = (xml) => ({ status: 200, data: xml, headers: {} });
const todayDDMMMYY = () => {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const [year, month, day] = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).split('-');
  return `${day}${months[Number(month) - 1]}${year.slice(-2)}`;
};
const retrievedWithTicketToday = () => envelope('PNR_Reply',
  '<pnrHeader><reservationInfo><reservation><controlNumber>HELD42</controlNumber></reservation></reservationInfo></pnrHeader>'
  + '<dataElementsMaster><dataElementsIndiv>'
  + '<elementManagementData><segmentName>FA</segmentName></elementManagementData>'
  + `<otherDataFreetext><longFreetext>PAX 220-7491175301/ETLH/USD291.00/${todayDDMMMYY()}/SCK1S2400/12345678</longFreetext></otherDataFreetext>`
  + '</dataElementsIndiv></dataElementsMaster>');
const retrievedNoTicket = envelope('PNR_Reply',
  '<pnrHeader><reservationInfo><reservation><controlNumber>HELD42</controlNumber></reservation></reservationInfo></pnrHeader>');
const voided = envelope('Ticket_CancelDocumentReply',
  '<transactionResults><responseDetails><responseType>X</responseType><statusCode>O</statusCode></responseDetails></transactionResults>');
const cancelledOk = envelope('PNR_Reply',
  '<pnrHeader><reservationInfo><reservation><controlNumber>HELD42</controlNumber></reservation></reservationInfo></pnrHeader>');
const signOutOk = envelope('Security_SignOutReply', '<dummy/>');

const soapSent = () => axios.post.mock.calls.map(([, , cfg]) => cfg?.headers?.SOAPAction ?? '');
const indexOfAction = (fragment) => soapSent().findIndex((a) => a.includes(fragment));

const captured = (amount = 291) => ({
  status: 200,
  data: { status: 'CAPTURED', amount, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: '1', type: 'PAYMENT', amount, currency: 'USD' } }] },
});

const runCancel = async (row) => {
  supabaseDouble = supabaseFor(row);
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const req = createRequest({ method: 'POST', body: { bookingReference: REF, reason: 'test', email: 'jane@example.com' } });
  const res = createResponse();
  await handleCancelBookingAction(req, res);
  const written = supabaseDouble.updates.find((u) => u.status === 'cancelled');
  return { res, cancellation: written?.booking_details?.cancellation ?? null, review: written?.booking_details?.needs_review ?? null };
};

const airlineShowsNoTicket = () => axios.post
  .mockResolvedValueOnce(soap(retrievedNoTicket)) // PNR_Retrieve
  .mockResolvedValueOnce(soap(cancelledOk)) // PNR_Cancel
  .mockResolvedValue(soap(signOutOk));

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_OFFICE_TIME_ZONE', 'America/New_York');
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_CANCEL_RETRY_DELAY_MS', '0');
  vi.stubEnv('AMADEUS_WS_VOID_RETRY_DELAY_MS', '0');
  vi.resetModules();
  axios.post.mockReset();
  axios.get.mockReset();
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.get.mockResolvedValue(captured(291));
  axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS', transaction: { id: '2' } } });
});

describe('a retrieve showing no ticket, on a booking whose issuance went unanswered', () => {
  it('is held for a person, not refunded in full', async () => {
    airlineShowsNoTicket();

    const { res, cancellation, review } = await runCancel(heldRow());

    expect(res.statusCode).toBe(200);
    // The PNR is still released: that is safe whatever was issued.
    expect(indexOfAction('PNRXCL')).toBeGreaterThan(indexOfAction('PNRRET'));
    expect(cancellation.paymentAction).toBe('REFUND_UNDER_REVIEW');
    expect(cancellation.refundAmount).toBe(0);
    expect(cancellation.basis).not.toBe('reservation released before any ticket was issued');
    // Its own reason: nothing recorded a ticket, so "the booking records a
    // ticket" would be false, and staff reading it would refund in full.
    expect(review.reason).toMatch(/DocIssuance was never answered and the airline showed no ticket/);
    expect(review.reason).toMatch(/check the ticket history before refunding/);
    expect(review.reason).not.toMatch(/the booking records a ticket/);
    // No money moved.
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('under a later flag too: a refused cancel kept it as `previous`', async () => {
    airlineShowsNoTicket();
    const refusedCancel = {
      reason: 'GDS cancellation failed; refund withheld to avoid paying out against a live booking',
      source: 'cancellation',
      cancelFailed: true,
      pnr: 'HELD42',
      at: '2026-09-23T10:00:00.000Z',
      previous: flag(),
    };

    const { cancellation } = await runCancel(heldRow(refusedCancel));

    expect(cancellation.paymentAction).toBe('REFUND_UNDER_REVIEW');
    expect(axios.put).not.toHaveBeenCalled();
  });
});

describe('the cancels around it, as before', () => {
  it('the ticket on the PNR: voided before PNR_Cancel, and refunded as a voided ticket', async () => {
    axios.post
      .mockResolvedValueOnce(soap(retrievedWithTicketToday())) // PNR_Retrieve
      .mockResolvedValueOnce(soap(voided)) // Ticket_CancelDocument
      .mockResolvedValueOnce(soap(cancelledOk)) // PNR_Cancel
      .mockResolvedValue(soap(signOutOk));

    const { res, cancellation } = await runCancel(heldRow());

    expect(res.statusCode).toBe(200);
    expect(indexOfAction('TRCANQ')).toBeGreaterThan(indexOfAction('PNRRET'));
    expect(indexOfAction('PNRXCL')).toBeGreaterThan(indexOfAction('TRCANQ'));
    expect(cancellation.ticketsVoided).toBe(true);
    expect(cancellation.basis).toMatch(/tickets voided the day they were issued/);
  });

  it('held with a refusal Amadeus answered (no issuance on the flag): refunded in full', async () => {
    airlineShowsNoTicket();
    const refused = flag({ amadeus: { operation: 'DocIssuance_IssueTicket', code: '2161', message: 'PROHIBITED TICKETING CARRIER' } });
    delete refused.issuance;

    const { res, cancellation } = await runCancel(heldRow(refused));

    expect(res.statusCode).toBe(200);
    expect(cancellation.basis).toBe('reservation released before any ticket was issued');
    expect(['VOID', 'FULL_REFUND']).toContain(cancellation.paymentAction);
    expect(cancellation.refundAmount).toBe(291);
  });

  it('a flag a person resolved: they read the PNR, so a retrieve with no ticket is refunded in full', async () => {
    airlineShowsNoTicket();

    const { cancellation } = await runCancel(heldRow(flag({
      resolved_at: '2026-09-23T11:00:00.000Z', resolved_by: 'desk', resolution: 'no FA line on the PNR',
    })));

    expect(cancellation.basis).toBe('reservation released before any ticket was issued');
    expect(cancellation.refundAmount).toBe(291);
  });

  it('a booking that records its ticket: held for a person, as before', async () => {
    airlineShowsNoTicket();

    const { cancellation, review } = await runCancel(heldRow(flag({ ticketed: true, issuance: undefined }), true));

    expect(cancellation.paymentAction).toBe('REFUND_UNDER_REVIEW');
    expect(review.reason).toMatch(/the booking records a ticket, but the airline showed none/);
    expect(axios.put).not.toHaveBeenCalled();
  });
});
