import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * A void that failed "for now" twice, through the cancel handler.
 *
 * The chain's final error named no tickets (cancelBooking's last throw), so
 * when the first try had voided the adult's ticket and the infant's failed
 * twice, the handler recorded no voided ticket on the booking - though the
 * flag's detail said "voided X but not Y". A cancel on a later day would then
 * list the void ticket as a refund to claim from the airline.
 *
 * Here the real chain (bookingChain.js, SOAP replies faked through axios.post)
 * throws into the real handler, which records what it is given.
 */

const REF = 'FLTVT2';
const ADULT = '220-7491174932';
const INFANT = '220-7491174933';

const flight = () => ({
  id: 'bk-vt2',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 688.93,
  user_id: null,
  created_at: '2026-09-22T08:00:00Z',
  booking_details: {
    pnr: 'ABC123',
    order_id: REF,
    customer_email: 'traveler@example.com',
    refundable: true,
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

// The provider's cancel is the chain's own, as in amadeusSoap/index.js: a
// thrown chain error reaches the handler untouched.
vi.mock('../../backend/services/flightProvider.js', () => ({
  default: {
    cancelFlightOrder: async (pnr) => {
      const { cancelBooking } = await import('../../backend/services/amadeusSoap/bookingChain.js');
      const result = await cancelBooking(pnr);
      return { success: true, ...result };
    },
  },
  providerStatus: () => ({ enabled: true, bookingEnabled: true }),
}));

const envelope = (name, inner) => `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3">
  <soap:Header><awsse:Session TransactionStatusCode="InSeries"><awsse:SessionId>S1</awsse:SessionId><awsse:SequenceNumber>1</awsse:SequenceNumber><awsse:SecurityToken>T</awsse:SecurityToken></awsse:Session></soap:Header>
  <soap:Body><${name}>${inner}</${name}></soap:Body>
</soap:Envelope>`;
const reply = (xml) => ({ status: 200, data: xml, headers: {} });
const ok = (name) => envelope(name, '<dummy/>');

const officeToday = () => {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const [year, month, day] = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).split('-');
  return `${day}${months[Number(month) - 1]}${year.slice(-2)}`;
};
const retrieved = () => envelope('PNR_Reply',
  '<pnrHeader><reservationInfo><reservation><controlNumber>ABC123</controlNumber></reservation></reservationInfo></pnrHeader>'
  + '<dataElementsMaster>'
  + '<dataElementsIndiv><elementManagementData><segmentName>FA</segmentName></elementManagementData>'
  + `<otherDataFreetext><longFreetext>PAX ${ADULT}/ETLH/USD626.30/${officeToday()}/SCK1S2400/12345678</longFreetext></otherDataFreetext></dataElementsIndiv>`
  + '<dataElementsIndiv><elementManagementData><segmentName>FA</segmentName></elementManagementData>'
  + `<otherDataFreetext><longFreetext>INF ${INFANT}/ETLH/USD62.63/${officeToday()}/SCK1S2400/12345678</longFreetext></otherDataFreetext></dataElementsIndiv>`
  + '</dataElementsMaster>');
const doc = (number, type, status, error) => `<transactionResults><responseDetails><responseType>${type}</responseType><statusCode>${status}</statusCode></responseDetails>`
  + (error ? `<errorGroup><errorOrWarningCodeDetails><errorDetails><errorCode>${error[0]}</errorCode></errorDetails></errorOrWarningCodeDetails><errorWarningDescription><freeText>${error[1]}</freeText></errorWarningDescription></errorGroup>` : '')
  + `<ticketNumbers><documentDetails><number>${number.replace(/\D/g, '')}1</number></documentDetails></ticketNumbers></transactionResults>`;
const TOO_SOON = ['5795', 'INVALID OR MISSING COUPON/BOOKLET NUMBER'];

const cancel = async () => {
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const res = createResponse();
  await handleCancelBookingAction(createRequest({ method: 'POST', body: { bookingReference: REF, reason: 'Change of plans', email: 'traveler@example.com' } }), res);
  return res;
};

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_VOID_RETRY_DELAY_MS', '0');
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

describe('a cancel whose void failed for now twice, after the first try voided one ticket', () => {
  it('records the voided ticket on the booking and on the flag, and refunds nothing', async () => {
    table = fakeBookingsTable([flight()], { tables: { price_settings: [], payments: [] } });
    axios.post
      .mockResolvedValueOnce(reply(retrieved()))
      .mockResolvedValueOnce(reply(envelope('Ticket_CancelDocumentReply', doc(ADULT, 'X', 'O') + doc(INFANT, 'X', 'N', TOO_SOON))))
      .mockResolvedValueOnce(reply(ok('Security_SignOutReply')))
      .mockResolvedValueOnce(reply(retrieved()))
      .mockResolvedValueOnce(reply(envelope('Ticket_CancelDocumentReply',
        doc(ADULT, 'X', 'N', ['6150', 'REJECTED - DOCUMENT ALREADY CANCELLED']) + doc(INFANT, 'X', 'N', TOO_SOON))))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const res = await cancel();

    expect(res.statusCode).toBe(502);
    const row = table.row(REF);
    expect(row.status).toBe('confirmed');
    expect(row.booking_details.voided_tickets).toEqual([ADULT]);
    expect(row.booking_details.needs_review).toMatchObject({
      cancelFailed: true, voided_tickets: [ADULT], unvoided_tickets: [INFANT],
    });
    expect(axios.put).not.toHaveBeenCalled();
  });

  // Fence: nothing voided by either try - no voided list, as on main.
  it('records no voided ticket when neither try voided one', async () => {
    table = fakeBookingsTable([flight()], { tables: { price_settings: [], payments: [] } });
    const wholeTooSoon = envelope('Ticket_CancelDocumentReply',
      `<errorGroup><errorOrWarningCodeDetails><errorDetails><errorCode>${TOO_SOON[0]}</errorCode></errorDetails></errorOrWarningCodeDetails><errorWarningDescription><freeText>${TOO_SOON[1]}</freeText></errorWarningDescription></errorGroup>`);
    axios.post
      .mockResolvedValueOnce(reply(retrieved()))
      .mockResolvedValueOnce(reply(wholeTooSoon))
      .mockResolvedValueOnce(reply(ok('Security_SignOutReply')))
      .mockResolvedValueOnce(reply(retrieved()))
      .mockResolvedValueOnce(reply(wholeTooSoon))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const res = await cancel();

    expect(res.statusCode).toBe(502);
    const row = table.row(REF);
    expect(row.status).toBe('confirmed');
    expect(row.booking_details.voided_tickets).toBeUndefined();
    expect(row.booking_details.needs_review.cancelFailed).toBe(true);
    expect(row.booking_details.needs_review.voided_tickets).toBeUndefined();
    expect(axios.put).not.toHaveBeenCalled();
  });
});
