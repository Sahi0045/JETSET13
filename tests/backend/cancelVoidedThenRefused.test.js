import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * Every ticket voided, PNR_Cancel refused - and the cancel tried again on a
 * later day.
 *
 * Driven through the real booking chain (only the SOAP and ARC wire is
 * stubbed), because the gap was between the two: the chain's 'cancel' error
 * named no voided ticket, so the handler recorded none, and the next day's
 * cancel - both tickets now past their void window - listed both as refunds to
 * claim from the airline. For a non-refundable fare that held the customer's
 * refund for review under a false reason ("tickets past their void window ...
 * airline refund must be claimed"); the airline owes nothing, the tickets were
 * void.
 */

const REF = 'FLTVR1';
const ADULT = '220-7491174932';
const INFANT = '220-7491174933';

const flight = () => ({
  id: 'bk-vr1',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 688.93,
  user_id: null,
  created_at: '2026-09-21T08:00:00Z',
  booking_details: {
    pnr: 'ABC123',
    order_id: REF,
    customer_email: 'traveler@example.com',
    refundable: false,
    gds: { ticketed: true },
    tickets: [{ number: ADULT }, { number: INFANT }],
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

// The real SOAP provider behind the flight provider; only axios.post answers.
vi.mock('../../backend/services/flightProvider.js', async () => {
  const soap = (await vi.importActual('../../backend/services/amadeusSoap/index.js')).default;
  return {
    default: { cancelFlightOrder: (...args) => soap.cancelFlightOrder(...args) },
    providerStatus: () => ({ enabled: true, bookingEnabled: true }),
  };
});

const envelope = (name, inner) => `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3">
  <soap:Header><awsse:Session TransactionStatusCode="InSeries"><awsse:SessionId>S1</awsse:SessionId><awsse:SequenceNumber>1</awsse:SequenceNumber><awsse:SecurityToken>T</awsse:SecurityToken></awsse:Session></soap:Header>
  <soap:Body><${name}>${inner}</${name}></soap:Body>
</soap:Envelope>`;
const soapReply = (xml) => ({ status: 200, data: xml, headers: {} });
const ok = (name) => envelope(name, '<dummy/>');

const retrievedWithTwoTickets = (issuedOn) => envelope('PNR_Reply',
  '<pnrHeader><reservationInfo><reservation><controlNumber>ABC123</controlNumber></reservation></reservationInfo></pnrHeader>'
  + '<dataElementsMaster>'
  + '<dataElementsIndiv><elementManagementData><segmentName>FA</segmentName></elementManagementData>'
  + `<otherDataFreetext><longFreetext>PAX ${ADULT}/ETLH/USD626.30/${issuedOn}/SCK1S2400/12345678</longFreetext></otherDataFreetext></dataElementsIndiv>`
  + '<dataElementsIndiv><elementManagementData><segmentName>FA</segmentName></elementManagementData>'
  + `<otherDataFreetext><longFreetext>INF ${INFANT}/ETLH/USD62.63/${issuedOn}/SCK1S2400/12345678</longFreetext></otherDataFreetext></dataElementsIndiv>`
  + '</dataElementsMaster>');
const bothVoided = envelope('Ticket_CancelDocumentReply',
  ['X', 'X'].map((type) => `<transactionResults><responseDetails><responseType>${type}</responseType>`
    + '<statusCode>O</statusCode></responseDetails></transactionResults>').join(''));
const cancelRefused = envelope('PNR_Reply',
  '<generalErrorInfo><errorOrWarningCodeDetails><errorDetails><errorCode>999</errorCode></errorDetails></errorOrWarningCodeDetails>'
  + '<errorFreeText>CANCEL NOT ALLOWED</errorFreeText></generalErrorInfo>');

const officeDDMMMYY = (daysAgo = 0) => {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const [year, month, day] = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).split('-');
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) - daysAgo));
  return `${String(date.getUTCDate()).padStart(2, '0')}${months[date.getUTCMonth()]}${String(date.getUTCFullYear()).slice(-2)}`;
};

const cancel = async () => {
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const res = createResponse();
  await handleCancelBookingAction(createRequest({ method: 'POST', body: { bookingReference: REF, reason: 'Change of plans', email: 'traveler@example.com' } }), res);
  return res;
};

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.resetModules();
  axios.post.mockReset();
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS' } });
  axios.get.mockReset();
  axios.get.mockResolvedValue({
    status: 200,
    data: { status: 'CAPTURED', amount: 688.93, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: '1', type: 'PAYMENT', amount: 688.93, currency: 'USD' } }] },
  });
});

describe('a cancel that voided every ticket and then could not cancel the PNR', () => {
  it('records both tickets as voided on the day, and a later day does not ask the airline to refund them', async () => {
    table = fakeBookingsTable([flight()], { tables: { price_settings: [], payments: [] } });

    // Day 1: both tickets issued today, both voided, PNR_Cancel refused.
    axios.post
      .mockResolvedValueOnce(soapReply(retrievedWithTwoTickets(officeDDMMMYY())))
      .mockResolvedValueOnce(soapReply(bothVoided))
      .mockResolvedValueOnce(soapReply(cancelRefused))
      .mockResolvedValue(soapReply(ok('Security_SignOutReply')));

    const first = await cancel();

    expect(first.statusCode).toBe(502);
    const afterFirst = table.row(REF).booking_details;
    expect(afterFirst.voided_tickets).toEqual([ADULT, INFANT]);
    expect(afterFirst.needs_review).toMatchObject({ voided_tickets: [ADULT, INFANT], unvoided_tickets: [] });
    expect(afterFirst.needs_review.detail).toMatch(/the PNR is left live/);
    expect(axios.put).not.toHaveBeenCalled();

    // Day 2: the same tickets, now past their void window; PNR_Cancel goes through.
    axios.post.mockReset();
    axios.post
      .mockResolvedValueOnce(soapReply(retrievedWithTwoTickets(officeDDMMMYY(1))))
      .mockResolvedValueOnce(soapReply(ok('PNR_Reply')))
      .mockResolvedValue(soapReply(ok('Security_SignOutReply')));

    const second = await cancel();

    expect(second.statusCode).toBe(200);
    expect(second.body.cancellation.requiresAirlineRefund).toEqual([]);
    expect(second.body.cancellation.ticketsVoided).toBe(true);
    expect(second.body.cancellation.paymentAction).not.toBe('REFUND_UNDER_REVIEW');
    expect(table.row(REF).booking_details.needs_review?.tickets).toBeUndefined();
    expect(JSON.stringify(table.row(REF).booking_details.needs_review ?? {})).not.toMatch(/airline refund must be claimed/);
  });
});
