import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A void that fails "for now" twice.
 *
 * cancelBooking tries a void once more in a new session when the airline
 * answers 5795 (the coupons are not in the e-ticket record yet) or goes quiet.
 * When the second try fails for now too, it gives up with its own error - and
 * that error named no tickets. So when the first try had voided one ticket of
 * two, the cancel handler (payment/operations.handlers.js) recorded no voided
 * ticket on the booking, while the error's text said "voided X but not Y": a
 * cancel on a later day would find the void ticket past its void window and
 * list it as a refund to claim from the airline.
 *
 * The final error now carries the lists the way a refused void's does.
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
const voidReply = (...documents) => envelope('Ticket_CancelDocumentReply', documents.join(''), true);

/** The whole request answered 5795, naming no document. */
const tooSoonWhole = envelope('Ticket_CancelDocumentReply',
  '<errorGroup><errorOrWarningCodeDetails><errorDetails><errorCode>5795</errorCode></errorDetails></errorOrWarningCodeDetails>'
  + '<errorWarningDescription><freeText>INVALID OR MISSING COUPON/BOOKLET NUMBER</freeText></errorWarningDescription></errorGroup>', true);

const actionsSent = () => axios.post.mock.calls.map(([, , cfg]) => cfg?.headers?.SOAPAction ?? '');
const didCancel = () => actionsSent().some((a) => a.includes('PNRXCL'));

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_VOID_RETRY_DELAY_MS', '0');
  vi.resetModules();
  axios.post.mockReset();
});

const loadChain = () => import('../../../backend/services/amadeusSoap/bookingChain.js');

/** Two sessions: retrieve, void, sign out - twice. */
const twoTries = (firstVoid, secondVoid) => axios.post
  .mockResolvedValueOnce(reply(retrievedWithTwoTickets()))
  .mockResolvedValueOnce(reply(firstVoid))
  .mockResolvedValueOnce(reply(ok('Security_SignOutReply')))
  .mockResolvedValueOnce(reply(retrievedWithTwoTickets()))
  .mockResolvedValueOnce(reply(secondVoid))
  .mockResolvedValue(reply(ok('Security_SignOutReply')));

describe('a void that fails for now twice', () => {
  it('names the ticket the first try voided and the one neither try did', async () => {
    const { cancelBooking } = await loadChain();
    twoTries(
      voidReply(voidedDoc(ADULT), tooSoonDoc(INFANT)),
      // The adult's ticket is void already, so it answers 6150; the infant's is still too soon.
      voidReply(alreadyVoidedDoc(ADULT), tooSoonDoc(INFANT)),
    );

    const failure = await cancelBooking('ABC123').catch((error) => error);

    expect(didCancel()).toBe(false);
    expect(failure).toMatchObject({ step: 'voidTicket', voidedTickets: [ADULT], unvoidedTickets: [INFANT] });
  });

  // The second reply names no document, so which tickets are still live is
  // not known - but the first reply confirmed the adult's void, and that stays true.
  it('keeps the first try\'s void when the second reply names no document', async () => {
    const { cancelBooking } = await loadChain();
    twoTries(voidReply(voidedDoc(ADULT), tooSoonDoc(INFANT)), tooSoonWhole);

    const failure = await cancelBooking('ABC123').catch((error) => error);

    expect(didCancel()).toBe(false);
    expect(failure.step).toBe('voidTicket');
    expect(failure.voidedTickets).toEqual([ADULT]);
    expect(failure.unvoidedTickets ?? null).toBeNull();
  });
});

/**
 * Fence: what the neighbouring outcomes do on main, unchanged.
 */
describe('fence: the other void outcomes', () => {
  it('a void that fails for now twice with nothing voided records no voided ticket, and says why', async () => {
    const { cancelBooking } = await loadChain();
    twoTries(tooSoonWhole, tooSoonWhole);

    const failure = await cancelBooking('ABC123').catch((error) => error);

    expect(didCancel()).toBe(false);
    expect(failure.step).toBe('voidTicket');
    expect(failure.error).toBe('We could not void the ticket');
    expect(failure.technicalError).toMatch(/5795 INVALID OR MISSING COUPON/);
    expect(failure.voidedTickets ?? []).toEqual([]);
  });

  it('a void that fails for now and then goes through cancels the itinerary', async () => {
    const { cancelBooking } = await loadChain();
    axios.post
      .mockResolvedValueOnce(reply(retrievedWithTwoTickets()))
      .mockResolvedValueOnce(reply(voidReply(voidedDoc(ADULT), tooSoonDoc(INFANT))))
      .mockResolvedValueOnce(reply(ok('Security_SignOutReply')))
      .mockResolvedValueOnce(reply(retrievedWithTwoTickets()))
      .mockResolvedValueOnce(reply(voidReply(alreadyVoidedDoc(ADULT), voidedDoc(INFANT))))
      .mockResolvedValueOnce(reply(ok('PNR_Reply')))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const result = await cancelBooking('ABC123');

    expect(result).toMatchObject({ cancelled: true, voided: true, requiresAirlineRefund: [] });
    expect(didCancel()).toBe(true);
  });

  it('a partial void refused outright names both lists after one try, as before', async () => {
    const { cancelBooking } = await loadChain();
    const refusedDoc = '<transactionResults><responseDetails><responseType>X</responseType><statusCode>N</statusCode></responseDetails>'
      + '<errorGroup><errorOrWarningCodeDetails><errorDetails><errorCode>5458</errorCode></errorDetails></errorOrWarningCodeDetails>'
      + '<errorWarningDescription><freeText>NOT AUTHORISED</freeText></errorWarningDescription></errorGroup>'
      + `<ticketNumbers><documentDetails><number>${INFANT.replace(/\D/g, '')}1</number></documentDetails></ticketNumbers></transactionResults>`;
    axios.post
      .mockResolvedValueOnce(reply(retrievedWithTwoTickets()))
      .mockResolvedValueOnce(reply(voidReply(voidedDoc(ADULT), refusedDoc)))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const failure = await cancelBooking('ABC123').catch((error) => error);

    const voidCalls = axios.post.mock.calls.filter(([, body]) => String(body).includes('<Ticket_CancelDocument'));
    expect(voidCalls).toHaveLength(1);
    expect(failure).toMatchObject({ step: 'voidTicket', voidedTickets: [ADULT], unvoidedTickets: [INFANT] });
    expect(failure.technicalError).toMatch(new RegExp(`voided ${ADULT} but not ${INFANT}`));
  });
});
