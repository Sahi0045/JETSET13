import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A refused or partial same-day void on a PNR that also holds a ticket from an
 * earlier day.
 *
 * Only a ticket issued today can be voided, so the earlier-day ticket is not
 * sent to Ticket_CancelDocument at all - and it is live. The error's
 * unvoidedTickets held only the same-day tickets whose void failed, and the
 * cancel-failed Slack line prints that list as the complete "still live" set:
 * the earlier-day ticket went unnamed. The PNR_Cancel-after-void path already
 * listed earlier-day tickets; this one did not.
 */

const envelope = (name, inner, session) => `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3">
  <soap:Header>${session ? `<awsse:Session TransactionStatusCode="InSeries"><awsse:SessionId>S1</awsse:SessionId><awsse:SequenceNumber>1</awsse:SequenceNumber><awsse:SecurityToken>T</awsse:SecurityToken></awsse:Session>` : ''}</soap:Header>
  <soap:Body><${name}>${inner}</${name}></soap:Body>
</soap:Envelope>`;
const reply = (xml) => ({ status: 200, data: xml, headers: {} });
const ok = (name) => envelope(name, '<dummy/>', true);

const EARLIER = '220-7491174931';
const TODAY_A = '220-7491174932';
const TODAY_B = '220-7491174933';

const OFFICE_ZONE = 'America/New_York';
const officeDDMMMYY = (daysAgo = 0) => {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const [year, month, day] = new Date().toLocaleDateString('en-CA', { timeZone: OFFICE_ZONE }).split('-');
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) - daysAgo));
  return `${String(date.getUTCDate()).padStart(2, '0')}${months[date.getUTCMonth()]}${String(date.getUTCFullYear()).slice(-2)}`;
};

const faLine = (number, issuedOn) => '<dataElementsIndiv><elementManagementData><segmentName>FA</segmentName></elementManagementData>'
  + `<otherDataFreetext><longFreetext>PAX ${number}/ETLH/USD626.30/${issuedOn}/SCK1S2400/12345678</longFreetext></otherDataFreetext></dataElementsIndiv>`;
const retrieved = (...lines) => envelope('PNR_Reply',
  '<pnrHeader><reservationInfo><reservation><controlNumber>ABC123</controlNumber></reservation></reservationInfo></pnrHeader>'
  + `<dataElementsMaster>${lines.join('')}</dataElementsMaster>`, true);

// One transactionResults per document sent; the reply's number carries a check digit.
const voidAnswer = (...documents) => envelope('Ticket_CancelDocumentReply', documents.map(({ number, voided }) => (voided
  ? '<transactionResults><responseDetails><responseType>X</responseType><statusCode>O</statusCode></responseDetails>'
  : '<transactionResults><responseDetails><responseType>X</responseType><statusCode>N</statusCode></responseDetails>'
    + '<errorGroup><errorOrWarningCodeDetails><errorDetails><errorCode>5458</errorCode></errorDetails></errorOrWarningCodeDetails>'
    + '<errorWarningDescription><freeText>NOT AUTHORISED</freeText></errorWarningDescription></errorGroup>')
  + `<ticketNumbers><documentDetails><number>${number.replace(/\D/g, '')}1</number></documentDetails></ticketNumbers></transactionResults>`).join(''), true);

const didCancel = () => axios.post.mock.calls.some(([, , cfg]) => String(cfg?.headers?.SOAPAction ?? '').includes('PNRXCL'));

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

describe('a same-day void refused on a PNR that also holds an earlier-day ticket', () => {
  it('names every ticket on the PNR it did not void, the earlier-day one included', async () => {
    const { cancelBooking } = await import('../../../backend/services/amadeusSoap/bookingChain.js');
    axios.post
      .mockResolvedValueOnce(reply(retrieved(faLine(EARLIER, officeDDMMMYY(3)), faLine(TODAY_B, officeDDMMMYY()))))
      .mockResolvedValueOnce(reply(voidAnswer({ number: TODAY_B, voided: false })))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const failure = await cancelBooking('ABC123').catch((error) => error);

    expect(failure.step).toBe('voidTicket');
    expect(didCancel()).toBe(false);
    expect(failure.voidedTickets).toEqual([]);
    expect(failure.unvoidedTickets).toEqual(expect.arrayContaining([TODAY_B, EARLIER]));
    expect(failure.unvoidedTickets).toHaveLength(2);
  });

  it('on a partial void, names the failed same-day ticket and the earlier-day one, never the voided one', async () => {
    const { cancelBooking } = await import('../../../backend/services/amadeusSoap/bookingChain.js');
    axios.post
      .mockResolvedValueOnce(reply(retrieved(faLine(EARLIER, officeDDMMMYY(3)), faLine(TODAY_A, officeDDMMMYY()), faLine(TODAY_B, officeDDMMMYY()))))
      .mockResolvedValueOnce(reply(voidAnswer({ number: TODAY_A, voided: true }, { number: TODAY_B, voided: false })))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const failure = await cancelBooking('ABC123').catch((error) => error);

    expect(failure.voidedTickets).toEqual([TODAY_A]);
    expect(failure.unvoidedTickets).toEqual(expect.arrayContaining([TODAY_B, EARLIER]));
    expect(failure.unvoidedTickets).not.toContain(TODAY_A);
  });

  it('with only same-day tickets, is unchanged', async () => {
    const { cancelBooking } = await import('../../../backend/services/amadeusSoap/bookingChain.js');
    axios.post
      .mockResolvedValueOnce(reply(retrieved(faLine(TODAY_A, officeDDMMMYY()), faLine(TODAY_B, officeDDMMMYY()))))
      .mockResolvedValueOnce(reply(voidAnswer({ number: TODAY_A, voided: true }, { number: TODAY_B, voided: false })))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const failure = await cancelBooking('ABC123').catch((error) => error);

    expect(failure).toMatchObject({ voidedTickets: [TODAY_A], unvoidedTickets: [TODAY_B] });
  });
});
