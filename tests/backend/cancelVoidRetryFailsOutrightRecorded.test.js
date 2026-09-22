import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequest, createResponse } from './helpers/express.helpers.js';
import { fakeBookingsTable } from './helpers/fakeBookings.js';

/**
 * A partial void whose retry fails outright, through the cancel handler.
 *
 * An adult and a lap infant, both ticketed today. The first void try voids the
 * adult's ticket and is told 5795 (too soon) for the infant's; the retry's
 * PNR_Retrieve is answered by a gateway 503 page. The cancel is refused and
 * flagged, and no money moves - but the chain's error named no ticket
 * (bookingChain.js cancelBooking), so the adult's void was recorded nowhere
 * on the booking. A cancel on the next day, both tickets past their void
 * window and the PNR cancelled, listed the adult's void ticket as a refund to
 * claim from the airline.
 *
 * Here the real chain (SOAP replies faked through axios.post) throws into the
 * real handler (payment/operations.handlers.js), which records what it is given.
 */

const REF = 'FLTVOID2';
const PNR = 'VOID22';
const ADULT = '220-7491174932';
const INFANT = '220-7491174933';

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

// The provider's cancel is the SOAP client's own (amadeusSoap/index.js), so a
// thrown chain error reaches the handler as it would in production.
vi.mock('../../backend/services/flightProvider.js', async () => {
  const soap = (await vi.importActual('../../backend/services/amadeusSoap/index.js')).default;
  return {
    default: { cancelFlightOrder: (...args) => soap.cancelFlightOrder(...args) },
    providerStatus: () => ({ enabled: true, bookingEnabled: true, wsap: '1ASIWJETJEC' }),
  };
});

const OFFICE_ZONE = 'America/New_York';
const ddmmmyy = (date) => {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const [year, month, day] = date.toLocaleDateString('en-CA', { timeZone: OFFICE_ZONE }).split('-');
  return `${day}${months[Number(month) - 1]}${year.slice(-2)}`;
};
const today = () => ddmmmyy(new Date());
const yesterday = () => ddmmmyy(new Date(Date.now() - 24 * 3600 * 1000));

const envelope = (name, inner) => `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3">
  <soap:Header><awsse:Session TransactionStatusCode="InSeries"><awsse:SessionId>S1</awsse:SessionId><awsse:SequenceNumber>1</awsse:SequenceNumber><awsse:SecurityToken>T</awsse:SecurityToken></awsse:Session></soap:Header>
  <soap:Body><${name}>${inner}</${name}></soap:Body>
</soap:Envelope>`;
const reply = (xml) => ({ status: 200, data: xml, headers: {} });
const signOut = reply(envelope('Security_SignOutReply', '<dummy/>'));
const GATEWAY_503 = { status: 503, data: '<html><body><h1>503 Service Unavailable</h1></body></html>', headers: {} };

/** Both tickets, issued on `date`. */
const retrieved = (date) => envelope('PNR_Reply',
  `<pnrHeader><reservationInfo><reservation><controlNumber>${PNR}</controlNumber></reservation></reservationInfo></pnrHeader>`
  + '<dataElementsMaster>'
  + '<dataElementsIndiv><elementManagementData><segmentName>FA</segmentName></elementManagementData>'
  + `<otherDataFreetext><longFreetext>PAX ${ADULT}/ETLH/USD626.30/${date}/SCK1S2400/12345678</longFreetext></otherDataFreetext></dataElementsIndiv>`
  + '<dataElementsIndiv><elementManagementData><segmentName>FA</segmentName></elementManagementData>'
  + `<otherDataFreetext><longFreetext>INF ${INFANT}/ETLH/USD62.63/${date}/SCK1S2400/12345678</longFreetext></otherDataFreetext></dataElementsIndiv>`
  + '</dataElementsMaster>');
const voidedDoc = (number) => '<transactionResults><responseDetails><responseType>X</responseType><statusCode>O</statusCode></responseDetails>'
  + `<ticketNumbers><documentDetails><number>${number.replace(/\D/g, '')}1</number></documentDetails></ticketNumbers></transactionResults>`;
const tooSoonDoc = (number) => '<transactionResults><responseDetails><responseType>X</responseType><statusCode>N</statusCode></responseDetails>'
  + '<errorGroup><errorOrWarningCodeDetails><errorDetails><errorCode>5795</errorCode></errorDetails></errorOrWarningCodeDetails>'
  + '<errorWarningDescription><freeText>INVALID OR MISSING COUPON/BOOKLET NUMBER</freeText></errorWarningDescription></errorGroup>'
  + `<ticketNumbers><documentDetails><number>${number.replace(/\D/g, '')}1</number></documentDetails></ticketNumbers></transactionResults>`;

const ticketed = () => ({
  id: 'bk-void2',
  booking_reference: REF,
  travel_type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 700,
  user_id: null,
  created_at: '2026-09-22T08:00:00Z',
  booking_details: {
    pnr: PNR,
    order_id: REF,
    success_indicator: `SI-${REF}`,
    customer_email: 'jane@example.com',
    refundable: true,
    gds: { ticketed: true },
    tickets: [{ number: ADULT, travelerId: '1' }, { number: INFANT, travelerId: '2' }],
    gds_chain: { state: 'finished', finishedAt: '2026-09-22T08:01:00Z' },
  },
});

const cancel = async () => {
  const { handleCancelBookingAction } = await import('../../backend/routes/payment/operations.handlers.js');
  const res = createResponse();
  await handleCancelBookingAction(createRequest({ method: 'POST', body: { bookingReference: REF, reason: 'Change of plans', email: 'jane@example.com' } }), res);
  return res;
};

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_OFFICE_TIME_ZONE', OFFICE_ZONE);
  vi.stubEnv('AMADEUS_WS_VOID_RETRY_DELAY_MS', '0');
  vi.resetModules();
  axios.post.mockReset();
  if (!axios.put) axios.put = vi.fn();
  axios.put.mockReset();
  axios.put.mockResolvedValue({ status: 200, data: { result: 'SUCCESS', transaction: { id: '2' } } });
  axios.get.mockReset();
  axios.get.mockResolvedValue({
    status: 200,
    data: { status: 'CAPTURED', amount: 700, currency: 'USD', transaction: [{ result: 'SUCCESS', transaction: { id: '1', type: 'PAYMENT', amount: 700, currency: 'USD' } }] },
  });
  table = fakeBookingsTable([ticketed()], { tables: { price_settings: [], payments: [] } });
});

/** Today: the first try voids the adult's ticket, the retry's retrieve meets a gateway page. */
const cancelToday = async () => {
  axios.post
    .mockResolvedValueOnce(reply(retrieved(today())))
    .mockResolvedValueOnce(reply(envelope('Ticket_CancelDocumentReply', voidedDoc(ADULT) + tooSoonDoc(INFANT))))
    .mockResolvedValueOnce(signOut)
    .mockResolvedValueOnce(GATEWAY_503) // the retry's PNR_Retrieve
    .mockResolvedValue(signOut);
  return cancel();
};

/** Tomorrow: both tickets past their void window; the PNR cancels. */
const cancelTomorrow = async () => {
  axios.post.mockReset();
  axios.post
    .mockResolvedValueOnce(reply(retrieved(yesterday())))
    .mockResolvedValueOnce(reply(envelope('PNR_Reply', `<pnrHeader><reservationInfo><reservation><controlNumber>${PNR}</controlNumber></reservation></reservationInfo></pnrHeader>`)))
    .mockResolvedValue(signOut);
  return cancel();
};

describe('a partial void whose retry fails outright', () => {
  it('records the voided ticket on the booking and its flag', async () => {
    const first = await cancelToday();
    const details = table.row(REF).booking_details;

    expect(first.statusCode).toBe(502);
    expect(details.voided_tickets).toEqual([ADULT]);
    expect(details.needs_review).toMatchObject({ cancelFailed: true, voided_tickets: [ADULT] });
    // The retry's retrieve never looked: which tickets are live is not known,
    // so no "still live" list is written.
    expect(details.needs_review).not.toHaveProperty('unvoided_tickets');
    expect(details.needs_review.detail).toMatch(/not a SOAP envelope/);
  });

  it('a cancel on a later day does not list the voided ticket as an airline refund to claim', async () => {
    await cancelToday();
    const second = await cancelTomorrow();
    const details = table.row(REF).booking_details;

    expect(second.statusCode).toBe(200);
    expect(details.needs_review?.tickets).toEqual([INFANT]);
  });
});

/**
 * Fence: the money, as it was.
 */
describe('fence: what the partial void does not change', () => {
  it('the refused cancel moves no money', async () => {
    await cancelToday();

    expect(axios.put).not.toHaveBeenCalled();
    expect(table.row(REF).status).not.toBe('cancelled');
  });

  it('the later cancel refunds the fare less the fee once, as before', async () => {
    await cancelToday();
    await cancelTomorrow();
    const { cancellation } = table.row(REF).booking_details;

    expect(cancellation).toMatchObject({ amadeusCancelled: true, refundAmount: 650, cancellationFee: 50 });
    expect(axios.put).toHaveBeenCalledTimes(1);
  });
});
