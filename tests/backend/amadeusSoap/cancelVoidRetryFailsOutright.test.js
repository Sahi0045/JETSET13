import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A partial void whose retry then fails outright.
 *
 * cancelBooking tries a void once more in a new session when the airline
 * answers 5795 (the coupons are not in the e-ticket record yet) or goes quiet.
 * On PDT the first try of an adult and a lap infant voided the adult's ticket
 * and was told 5795 for the infant's. The lists of that first try were joined
 * with the second's only when the second failed "for now" too; when the second
 * failed outright - its PNR_Retrieve timed out, or a gateway page (not SOAP,
 * transport.js) answered its retrieve or its void - the throw left without
 * them. The cancel handler (payment/operations.handlers.js) then recorded no
 * voided ticket on the booking, and a cancel on a later day, every ticket past
 * its void window by then, listed the void one as a refund to claim from the
 * airline.
 *
 * Whatever the retry throws now carries the first try's voids. Which tickets
 * are still live stays as that error says it, or unknown (null) when it says
 * nothing: a retrieve that failed did not look.
 */

const envelope = (name, inner, session) => `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3">
  <soap:Header>${session ? `<awsse:Session TransactionStatusCode="InSeries"><awsse:SessionId>S1</awsse:SessionId><awsse:SequenceNumber>1</awsse:SequenceNumber><awsse:SecurityToken>T</awsse:SecurityToken></awsse:Session>` : ''}</soap:Header>
  <soap:Body><${name}>${inner}</${name}></soap:Body>
</soap:Envelope>`;

const reply = (xml) => ({ status: 200, data: xml, headers: {} });
const ok = (name) => envelope(name, '<dummy/>', true);

const ADULT = '220-7491174932';
const INFANT = '220-7491174933';

const OFFICE_ZONE = 'America/New_York';
const officeToday = () => {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const [year, month, day] = new Date().toLocaleDateString('en-CA', { timeZone: OFFICE_ZONE }).split('-');
  return `${day}${months[Number(month) - 1]}${year.slice(-2)}`;
};

/** An adult and the infant on their lap: two tickets, both issued today. */
const retrievedWithTwoTickets = () => envelope('PNR_Reply',
  '<pnrHeader><reservationInfo><reservation><controlNumber>ABC123</controlNumber></reservation></reservationInfo></pnrHeader>'
  + '<dataElementsMaster>'
  + '<dataElementsIndiv><elementManagementData><segmentName>FA</segmentName></elementManagementData>'
  + `<otherDataFreetext><longFreetext>PAX ${ADULT}/ETLH/USD626.30/${officeToday()}/SCK1S2400/12345678</longFreetext></otherDataFreetext></dataElementsIndiv>`
  + '<dataElementsIndiv><elementManagementData><segmentName>FA</segmentName></elementManagementData>'
  + `<otherDataFreetext><longFreetext>INF ${INFANT}/ETLH/USD62.63/${officeToday()}/SCK1S2400/12345678</longFreetext></otherDataFreetext></dataElementsIndiv>`
  + '</dataElementsMaster>', true);

/** One document's answer; the reply's number carries a check digit ours does not. */
const voidedDoc = (number) => '<transactionResults><responseDetails><responseType>X</responseType><statusCode>O</statusCode></responseDetails>'
  + `<ticketNumbers><documentDetails><number>${number.replace(/\D/g, '')}1</number></documentDetails></ticketNumbers></transactionResults>`;
const alreadyVoidedDoc = (number) => '<transactionResults><responseDetails><responseType>X</responseType><statusCode>N</statusCode></responseDetails>'
  + '<errorGroup><errorOrWarningCodeDetails><errorDetails><errorCode>6150</errorCode></errorDetails></errorOrWarningCodeDetails>'
  + '<errorWarningDescription><freeText>REJECTED - DOCUMENT ALREADY CANCELLED</freeText></errorWarningDescription></errorGroup>'
  + `<ticketNumbers><documentDetails><number>${number.replace(/\D/g, '')}1</number></documentDetails></ticketNumbers></transactionResults>`;
const tooSoonDoc = (number) => '<transactionResults><responseDetails><responseType>X</responseType><statusCode>N</statusCode></responseDetails>'
  + '<errorGroup><errorOrWarningCodeDetails><errorDetails><errorCode>5795</errorCode></errorDetails></errorOrWarningCodeDetails>'
  + '<errorWarningDescription><freeText>INVALID OR MISSING COUPON/BOOKLET NUMBER</freeText></errorWarningDescription></errorGroup>'
  + `<ticketNumbers><documentDetails><number>${number.replace(/\D/g, '')}1</number></documentDetails></ticketNumbers></transactionResults>`;
/** Refused outright: not a code the chain tries again. */
const refusedDoc = (number) => '<transactionResults><responseDetails><responseType>X</responseType><statusCode>N</statusCode></responseDetails>'
  + '<errorGroup><errorOrWarningCodeDetails><errorDetails><errorCode>1234</errorCode></errorDetails></errorOrWarningCodeDetails>'
  + '<errorWarningDescription><freeText>VOID NOT AUTHORISED</freeText></errorWarningDescription></errorGroup>'
  + `<ticketNumbers><documentDetails><number>${number.replace(/\D/g, '')}1</number></documentDetails></ticketNumbers></transactionResults>`;
const voidReply = (...documents) => envelope('Ticket_CancelDocumentReply', documents.join(''), true);

/** The whole request answered 5795, naming no document. */
const tooSoonWhole = envelope('Ticket_CancelDocumentReply',
  '<errorGroup><errorOrWarningCodeDetails><errorDetails><errorCode>5795</errorCode></errorDetails></errorOrWarningCodeDetails>'
  + '<errorWarningDescription><freeText>INVALID OR MISSING COUPON/BOOKLET NUMBER</freeText></errorWarningDescription></errorGroup>', true);

/** PNR_Cancel refused with an error that is not 8111, so it is not tried again. */
const cancelRefused = envelope('PNR_Reply',
  '<generalErrorInfo><errorOrWarningCodeDetails><errorDetails><errorCode>999</errorCode></errorDetails></errorOrWarningCodeDetails>'
  + '<errorFreeText>CANCEL NOT ALLOWED</errorFreeText></generalErrorInfo>', true);

const GATEWAY_503 = { status: 503, data: '<html><body><h1>503 Service Unavailable</h1></body></html>', headers: {} };
const TIMEOUT = () => Object.assign(new Error('timeout of 25000ms exceeded'), { code: 'ECONNABORTED' });

const actionsSent = () => axios.post.mock.calls.map(([, , cfg]) => cfg?.headers?.SOAPAction ?? '');
const didCancel = () => actionsSent().some((a) => a.includes('PNRXCL'));

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_OFFICE_TIME_ZONE', OFFICE_ZONE);
  vi.stubEnv('AMADEUS_WS_VOID_RETRY_DELAY_MS', '0');
  vi.stubEnv('AMADEUS_WS_CANCEL_RETRY_DELAY_MS', '0');
  vi.resetModules();
  axios.post.mockReset();
});

const loadChain = () => import('../../../backend/services/amadeusSoap/bookingChain.js');

/** The first session: retrieve, a void that voids the adult and is too soon for the infant, sign out. */
const firstTryVoidsTheAdult = () => axios.post
  .mockResolvedValueOnce(reply(retrievedWithTwoTickets()))
  .mockResolvedValueOnce(reply(voidReply(voidedDoc(ADULT), tooSoonDoc(INFANT))))
  .mockResolvedValueOnce(reply(ok('Security_SignOutReply')));

describe('the retry fails outright after the first try voided one ticket', () => {
  it('keeps the first try\'s void when the retry\'s retrieve is answered by a gateway page', async () => {
    const { cancelBooking } = await loadChain();
    firstTryVoidsTheAdult()
      .mockResolvedValueOnce(GATEWAY_503) // the retry's PNR_Retrieve
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const failure = await cancelBooking('ABC123').catch((error) => error);

    expect(didCancel()).toBe(false);
    expect(failure.step).toBe('retrieve');
    expect(failure.voidedTickets).toEqual([ADULT]);
    // The retrieve did not look, so which tickets are live is unknown - not "none".
    expect(failure.unvoidedTickets).toBeNull();
    expect(failure.technicalError).toMatch(/not a SOAP envelope/);
    expect(failure.technicalError).toContain(ADULT);
  });

  it('keeps the first try\'s void when the retry\'s void is answered by a gateway page', async () => {
    const { cancelBooking } = await loadChain();
    firstTryVoidsTheAdult()
      .mockResolvedValueOnce(reply(retrievedWithTwoTickets()))
      .mockResolvedValueOnce(GATEWAY_503) // the retry's Ticket_CancelDocument
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const failure = await cancelBooking('ABC123').catch((error) => error);

    expect(didCancel()).toBe(false);
    expect(failure.step).toBe('voidTicket');
    expect(failure.voidedTickets).toEqual([ADULT]);
    expect(failure.unvoidedTickets).toBeNull();
  });

  it('keeps the first try\'s void when the retry\'s retrieve times out', async () => {
    const { cancelBooking } = await loadChain();
    firstTryVoidsTheAdult()
      .mockRejectedValueOnce(TIMEOUT())
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const failure = await cancelBooking('ABC123').catch((error) => error);

    expect(didCancel()).toBe(false);
    expect(failure.step).toBe('retrieve');
    expect(failure.voidedTickets).toEqual([ADULT]);
    expect(failure.unvoidedTickets).toBeNull();
    expect(failure.technicalError).toMatch(/timeout of 25000ms exceeded/);
  });
});

/**
 * Fence: the neighbouring outcomes, as they were.
 */
describe('fence: the other ways a retry ends', () => {
  it('a retry refused outright keeps its own lists, joined with the first try\'s', async () => {
    const { cancelBooking } = await loadChain();
    firstTryVoidsTheAdult()
      .mockResolvedValueOnce(reply(retrievedWithTwoTickets()))
      .mockResolvedValueOnce(reply(voidReply(alreadyVoidedDoc(ADULT), refusedDoc(INFANT))))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const failure = await cancelBooking('ABC123').catch((error) => error);

    expect(didCancel()).toBe(false);
    expect(failure).toMatchObject({ step: 'voidTicket', voidedTickets: [ADULT], unvoidedTickets: [INFANT] });
    // It named the adult's void itself; said once.
    expect(failure.technicalError.split(ADULT)).toHaveLength(2);
  });

  it('a retry that voids the rest and then fails to cancel says both are void and none is live', async () => {
    const { cancelBooking } = await loadChain();
    firstTryVoidsTheAdult()
      .mockResolvedValueOnce(reply(retrievedWithTwoTickets()))
      .mockResolvedValueOnce(reply(voidReply(alreadyVoidedDoc(ADULT), voidedDoc(INFANT))))
      .mockResolvedValueOnce(reply(cancelRefused))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const failure = await cancelBooking('ABC123').catch((error) => error);

    expect(failure.step).toBe('cancel');
    expect(failure.voidedTickets).toEqual([ADULT, INFANT]);
    expect(failure.unvoidedTickets).toEqual([]);
  });

  it('a retry that voids the rest and cancels returns the cancellation', async () => {
    const { cancelBooking } = await loadChain();
    firstTryVoidsTheAdult()
      .mockResolvedValueOnce(reply(retrievedWithTwoTickets()))
      .mockResolvedValueOnce(reply(voidReply(alreadyVoidedDoc(ADULT), voidedDoc(INFANT))))
      .mockResolvedValueOnce(reply(ok('PNR_Reply')))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const result = await cancelBooking('ABC123');

    expect(didCancel()).toBe(true);
    expect(result).toMatchObject({ cancelled: true, voided: true, requiresAirlineRefund: [] });
  });

  it('a retry that fails outright after a first try that voided nothing throws its own error unchanged', async () => {
    const { cancelBooking } = await loadChain();
    axios.post
      .mockResolvedValueOnce(reply(retrievedWithTwoTickets()))
      .mockResolvedValueOnce(reply(tooSoonWhole))
      .mockResolvedValueOnce(reply(ok('Security_SignOutReply')))
      .mockResolvedValueOnce(GATEWAY_503)
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const failure = await cancelBooking('ABC123').catch((error) => error);

    expect(didCancel()).toBe(false);
    expect(failure.step).toBe('retrieve');
    expect(failure.voidedTickets).toBeUndefined();
    expect(failure.unvoidedTickets).toBeUndefined();
    expect(failure.technicalError).toBe('HTTP 503: the reply is not a SOAP envelope (58 bytes)');
  });

  it('a first try that fails outright is not tried again and names no ticket', async () => {
    const { cancelBooking } = await loadChain();
    axios.post
      .mockResolvedValueOnce(GATEWAY_503)
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const failure = await cancelBooking('ABC123').catch((error) => error);

    expect(failure.step).toBe('retrieve');
    expect(failure.voidedTickets).toBeUndefined();
    expect(actionsSent().filter((a) => a.includes('PNRRET'))).toHaveLength(1);
  });

  it('a retry that fails for now too keeps the first try\'s void and the second\'s live list', async () => {
    const { cancelBooking } = await loadChain();
    firstTryVoidsTheAdult()
      .mockResolvedValueOnce(reply(retrievedWithTwoTickets()))
      .mockResolvedValueOnce(reply(voidReply(alreadyVoidedDoc(ADULT), tooSoonDoc(INFANT))))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const failure = await cancelBooking('ABC123').catch((error) => error);

    expect(didCancel()).toBe(false);
    expect(failure).toMatchObject({ step: 'voidTicket', voidedTickets: [ADULT], unvoidedTickets: [INFANT] });
  });
});
