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


/**
 * Verifier probe (audit r3, item 1): the same row, after a cancel the airline
 * did not carry out - here PNR_Retrieve at the cancel got no answer, so the
 * cancel knows nothing about tickets. The refused-cancel flag goes on top with
 * the held flag (issuance: 'unknown') kept under it (keepingPrevious).
 *
 * The Slack alarm then lists the booking under "cancellations the airline did
 * not carry out" (describeFailedCancellation). That line is the only Slack
 * message about this booking when the cancel came before the alarm's first
 * post, and the only one staff read when they go to cancel the PNR by hand.
 */
const timeout = () => Object.assign(new Error('timeout of 25000ms exceeded'), { code: 'ECONNABORTED' });

describe('verifier: a refused cancel over an issuance nobody saw answered', () => {
  it('the Slack line does not say "ticketed: NO" / "no tickets issued" of it', async () => {
    axios.post.mockImplementation(async (_url, _body, cfg) => {
      const action = String(cfg?.headers?.SOAPAction ?? '');
      if (action.includes('PNRRET')) throw timeout();
      return soap(signOutOk);
    });

    const row = heldRow();
    supabaseDouble = supabaseFor(row);
    const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
    const { createRequest: mkReq, createResponse: mkRes } = await import('./helpers/express.helpers.js');
    const req = mkReq({ method: 'POST', body: { bookingReference: REF, reason: 'test', email: 'jane@example.com' } });
    const res = mkRes();
    await handleCancelBookingAction(req, res);

    expect(res.statusCode).toBe(502);
    expect(axios.put).not.toHaveBeenCalled();
    const written = supabaseDouble.updates.map((u) => u.booking_details?.needs_review).filter((r) => r?.cancelFailed === true).pop();
    expect(written).toBeTruthy();
    // The held flag, with its unknown issuance, is kept under the refused cancel.
    expect(written.previous).toMatchObject({ reason: 'chain failed after commit at issueTicket', issuance: 'unknown' });

    const after = { ...row, booking_details: { ...row.booking_details, needs_review: written } };
    const { buildMessage, selectUnannounced } = await import('../../backend/jobs/needsReviewAlert.job.js');
    const picked = selectUnannounced([after]);
    expect(picked).toHaveLength(1);
    const text = buildMessage(picked);
    expect(text).toMatch(/cancellation the airline did not carry out/);
    // The claim of item (1): nothing tells staff, as fact, that no ticket was
    // issued while DocIssuance's answer was never seen.
    expect(text).not.toMatch(/ticketed: NO/);
    expect(text).not.toMatch(/no tickets issued/);
  });
});
