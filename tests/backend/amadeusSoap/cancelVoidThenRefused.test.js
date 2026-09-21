import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Every ticket voided, and then PNR_Cancel refused.
 *
 * The sibling of the partial void. The void of every ticket went through, so
 * the chain went on to PNR_Cancel; that was refused (a refusal other than 8111,
 * or 8111 three times) and the 'cancel' error carried no voidedTickets and
 * said nothing about the void. The cancel handler recorded no voided tickets,
 * and on a later day - both tickets past their void window - the chain listed
 * them as refunds to claim from the airline. They were void: the airline owes
 * nothing, and the customer is owed the fare.
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

/** An adult and the infant on their lap: two tickets, both issued on `issuedOn`. */
const retrievedWithTwoTickets = (issuedOn) => envelope('PNR_Reply',
  '<pnrHeader><reservationInfo><reservation><controlNumber>ABC123</controlNumber></reservation></reservationInfo></pnrHeader>'
  + '<dataElementsMaster>'
  + '<dataElementsIndiv><elementManagementData><segmentName>FA</segmentName></elementManagementData>'
  + `<otherDataFreetext><longFreetext>PAX ${ADULT}/ETLH/USD626.30/${issuedOn}/SCK1S2400/12345678</longFreetext></otherDataFreetext></dataElementsIndiv>`
  + '<dataElementsIndiv><elementManagementData><segmentName>FA</segmentName></elementManagementData>'
  + `<otherDataFreetext><longFreetext>INF ${INFANT}/ETLH/USD62.63/${issuedOn}/SCK1S2400/12345678</longFreetext></otherDataFreetext></dataElementsIndiv>`
  + '</dataElementsMaster>', true);

/** Ticket_CancelDocument answering voided for both documents. */
const bothVoided = () => envelope('Ticket_CancelDocumentReply',
  ['X', 'X'].map((type) => `<transactionResults><responseDetails><responseType>${type}</responseType>`
    + '<statusCode>O</statusCode></responseDetails></transactionResults>').join(''), true);

const cancelRefused = envelope('PNR_Reply',
  '<generalErrorInfo><errorOrWarningCodeDetails><errorDetails><errorCode>999</errorCode></errorDetails></errorOrWarningCodeDetails>'
  + '<errorFreeText>CANCEL NOT ALLOWED</errorFreeText></generalErrorInfo>', true);

const simultaneous = envelope('PNR_Reply',
  '<generalErrorInfo><errorOrWarningCodeDetails><errorDetails><errorCode>8111</errorCode></errorDetails></errorOrWarningCodeDetails>'
  + '<errorFreeText>SIMULTANEOUS CHANGES TO PNR - USE WRA/RT TO PRINT OR IGNORE</errorFreeText></generalErrorInfo>', true);

const OFFICE_ZONE = 'America/New_York';
const officeDDMMMYY = (daysAgo = 0) => {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const [year, month, day] = new Date().toLocaleDateString('en-CA', { timeZone: OFFICE_ZONE }).split('-');
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) - daysAgo));
  return `${String(date.getUTCDate()).padStart(2, '0')}${months[date.getUTCMonth()]}${String(date.getUTCFullYear()).slice(-2)}`;
};

const actionsSent = () => axios.post.mock.calls.map(([, , cfg]) => cfg?.headers?.SOAPAction ?? '');
const cancelCalls = () => actionsSent().filter((a) => a.includes('PNRXCL')).length;

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_CANCEL_RETRY_DELAY_MS', '0');
  vi.resetModules();
  axios.post.mockReset();
});

describe('a cancel whose void went through and whose PNR_Cancel was refused', () => {
  it('says which tickets were voided, and that the PNR is left live', async () => {
    const { cancelBooking } = await import('../../../backend/services/amadeusSoap/bookingChain.js');
    axios.post
      .mockResolvedValueOnce(reply(retrievedWithTwoTickets(officeDDMMMYY())))
      .mockResolvedValueOnce(reply(bothVoided()))
      .mockResolvedValueOnce(reply(cancelRefused))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const failure = await cancelBooking('ABC123').catch((error) => error);

    expect(failure).toMatchObject({ step: 'cancel', voidedTickets: [ADULT, INFANT], unvoidedTickets: [] });
    expect(failure.technicalError).toMatch(/CANCEL NOT ALLOWED/);
    expect(failure.technicalError).toMatch(new RegExp(`; tickets voided ${ADULT}, ${INFANT} - the PNR is left live$`));
  });

  it('says so after 8111 three times too', async () => {
    const { cancelBooking } = await import('../../../backend/services/amadeusSoap/bookingChain.js');
    const ignored = ok('PNR_Reply');
    axios.post
      .mockResolvedValueOnce(reply(retrievedWithTwoTickets(officeDDMMMYY())))
      .mockResolvedValueOnce(reply(bothVoided()))
      .mockResolvedValueOnce(reply(simultaneous))
      .mockResolvedValueOnce(reply(ignored))
      .mockResolvedValueOnce(reply(simultaneous))
      .mockResolvedValueOnce(reply(ignored))
      .mockResolvedValueOnce(reply(simultaneous))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const failure = await cancelBooking('ABC123').catch((error) => error);

    expect(cancelCalls()).toBe(3);
    expect(failure).toMatchObject({ step: 'cancel', voidedTickets: [ADULT, INFANT], unvoidedTickets: [] });
    expect(failure.technicalError).toMatch(/tickets voided .* - the PNR is left live$/);
  });

  it('claims no void when nothing was voided', async () => {
    const { cancelBooking } = await import('../../../backend/services/amadeusSoap/bookingChain.js');
    axios.post
      .mockResolvedValueOnce(reply(retrievedWithTwoTickets(officeDDMMMYY(3))))
      .mockResolvedValueOnce(reply(cancelRefused))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const failure = await cancelBooking('ABC123').catch((error) => error);

    expect(failure.step).toBe('cancel');
    expect(failure.voidedTickets).toBeUndefined();
    expect(failure.technicalError).not.toMatch(/voided/);
  });
});
