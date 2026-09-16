import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readTickets } from '../../../backend/services/amadeusSoap/mappers/flightOrder.js';

/**
 * Voiding a ticket before cancelling the itinerary.
 *
 * A ticket issued today can be voided: the fare comes back in full and nothing
 * is left to reconcile. After the day of issue it cannot - the money has
 * settled, and the value has to be reclaimed from the airline under its own
 * fare rules. Cancelling the segments without voiding a same-day ticket throws
 * that window away.
 *
 * Proved on PDT since: single tickets void cleanly, and on 15 Sep 2026 an adult
 * and a lap infant's two tickets voided in one call - which is what showed the
 * reply carries one transactionResults per document.
 */

const envelope = (name, inner, session) => `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3">
  <soap:Header>${session ? `<awsse:Session TransactionStatusCode="InSeries"><awsse:SessionId>S1</awsse:SessionId><awsse:SequenceNumber>1</awsse:SequenceNumber><awsse:SecurityToken>T</awsse:SecurityToken></awsse:Session>` : ''}</soap:Header>
  <soap:Body><${name}>${inner}</${name}></soap:Body>
</soap:Envelope>`;

const reply = (xml) => ({ status: 200, data: xml, headers: {} });

/** A retrieved PNR carrying one ticket issued on `issuedOn` (DDMMMYY). */
const retrievedWithTicket = (issuedOn) => envelope('PNR_Reply',
  '<pnrHeader><reservationInfo><reservation><controlNumber>ABC123</controlNumber></reservation></reservationInfo></pnrHeader>'
  + '<dataElementsMaster><dataElementsIndiv>'
  + '<elementManagementData><segmentName>FA</segmentName></elementManagementData>'
  + `<otherDataFreetext><longFreetext>PAX 057-2412345678/ETAI/USD221.70/${issuedOn}/SCK1S2400/12345678</longFreetext></otherDataFreetext>`
  + '</dataElementsIndiv></dataElementsMaster>', true);

const retrievedNoTicket = envelope('PNR_Reply',
  '<pnrHeader><reservationInfo><reservation><controlNumber>ABC123</controlNumber></reservation></reservationInfo></pnrHeader>', true);

const ok = (name) => envelope(name, '<dummy/>', true);
const errorReply = envelope('PNR_Reply',
  '<generalErrorInfo><errorOrWarningCodeDetails><errorDetails><errorCode>999</errorCode></errorDetails></errorOrWarningCodeDetails><errorFreeText>VOID NOT ALLOWED</errorFreeText></generalErrorInfo>', true);

/**
 * Today as Amadeus writes it on a ticket: the OFFICE's date, not UTC.
 *
 * This helper used to read the UTC date, which made every "issued today" test
 * here pass only outside the hours between midnight UTC and midnight in the
 * office - the very window in which the void was being skipped in production.
 */
const OFFICE_ZONE = 'America/New_York';
const todayDDMMMYY = () => {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const [year, month, day] = new Date().toLocaleDateString('en-CA', { timeZone: OFFICE_ZONE }).split('-');
  return `${day}${months[Number(month) - 1]}${year.slice(-2)}`;
};

const actionsSent = () => axios.post.mock.calls.map(([, , cfg]) => cfg?.headers?.SOAPAction ?? '');
const didVoid = () => actionsSent().some((a) => a.includes('TRCANQ'));
const didCancel = () => actionsSent().some((a) => a.includes('PNRXCL'));

const loadChain = async () => (await import('../../../backend/services/amadeusSoap/bookingChain.js'));

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.resetModules();
  axios.post.mockReset();
});

/**
 * A confirmed void. Amadeus answers `responseType X` — anything else means the
 * ticket is still live, and the chain must not cancel the itinerary on top of
 * it. Previously this test returned a bare reply, which the chain read as
 * success because it never checked.
 */
const voided = () => envelope('Ticket_CancelDocumentReply',
  '<transactionResults><responseDetails><responseType>X</responseType>'
  + '<statusCode>O</statusCode></responseDetails></transactionResults>', true);

/** An adult and the infant on their lap: two tickets, both issued on `issuedOn`. */
const retrievedWithTwoTickets = (issuedOn) => envelope('PNR_Reply',
  '<pnrHeader><reservationInfo><reservation><controlNumber>ABC123</controlNumber></reservation></reservationInfo></pnrHeader>'
  + '<dataElementsMaster>'
  + '<dataElementsIndiv><elementManagementData><segmentName>FA</segmentName></elementManagementData>'
  + `<otherDataFreetext><longFreetext>PAX 220-7491174932/ETLH/USD626.30/${issuedOn}/SCK1S2400/12345678</longFreetext></otherDataFreetext></dataElementsIndiv>`
  + '<dataElementsIndiv><elementManagementData><segmentName>FA</segmentName></elementManagementData>'
  + `<otherDataFreetext><longFreetext>INF 220-7491174933/ETLH/USD62.63/${issuedOn}/SCK1S2400/12345678</longFreetext></otherDataFreetext></dataElementsIndiv>`
  + '</dataElementsMaster>', true);

/** Ticket_CancelDocument answers once per document, as a list, when it voids several. */
const voidedEach = (...types) => envelope('Ticket_CancelDocumentReply',
  types.map((type) => `<transactionResults><responseDetails><responseType>${type}</responseType>`
    + '<statusCode>O</statusCode></responseDetails></transactionResults>').join(''), true);

describe('reading a ticket element', () => {
  // `issuedOn` used to be new Date() at read time, which made every ticket look
  // issued today - the exact question the void decision turns on.
  it('takes the issue date from the ticket, not from the clock', () => {
    const [ticket] = readTickets({
      dataElementsMaster: {
        dataElementsIndiv: {
          elementManagementData: { segmentName: 'FA' },
          otherDataFreetext: { longFreetext: 'PAX 057-2412345678/ETAI/USD221.70/04SEP26/SCK1S2400' },
        },
      },
    });
    expect(ticket.number).toBe('057-2412345678');
    expect(ticket.issuedOn).toBe('2026-09-04');
    expect(ticket.validatingCarrier).toBe('AI');
  });

  it('ignores elements that are not tickets', () => {
    expect(readTickets({
      dataElementsMaster: {
        dataElementsIndiv: {
          elementManagementData: { segmentName: 'AP' },
          otherDataFreetext: { longFreetext: 'contact@example.com' },
        },
      },
    })).toHaveLength(0);
  });
});

describe('cancelling', () => {
  it('voids a ticket issued today, then cancels', async () => {
    const { cancelBooking } = await loadChain();
    axios.post
      .mockResolvedValueOnce(reply(retrievedWithTicket(todayDDMMMYY())))
      .mockResolvedValueOnce(reply(voided()))
      .mockResolvedValueOnce(reply(ok('PNR_Reply')))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const result = await cancelBooking('ABC123');

    expect(didVoid()).toBe(true);
    expect(didCancel()).toBe(true);
    expect(result.voided).toBe(true);
    expect(result.requiresAirlineRefund).toEqual([]);
  });

  // Past the void window the money has settled with the airline. Cancelling
  // still happens, but the value has to be reclaimed rather than assumed gone.
  it('cancels without voiding a ticket issued earlier, and says what is owed', async () => {
    const { cancelBooking } = await loadChain();
    axios.post
      .mockResolvedValueOnce(reply(retrievedWithTicket('04SEP20')))
      .mockResolvedValueOnce(reply(ok('PNR_Reply')))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const result = await cancelBooking('ABC123');

    expect(didVoid()).toBe(false);
    expect(didCancel()).toBe(true);
    expect(result.voided).toBe(false);
    expect(result.requiresAirlineRefund).toEqual(['057-2412345678']);
  });

  it('just cancels when there is no ticket at all', async () => {
    const { cancelBooking } = await loadChain();
    axios.post
      .mockResolvedValueOnce(reply(retrievedNoTicket))
      .mockResolvedValueOnce(reply(ok('PNR_Reply')))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const result = await cancelBooking('ABC123');

    expect(didVoid()).toBe(false);
    expect(didCancel()).toBe(true);
    expect(result.hadTickets).toBe(false);
  });

  // Stripping the segments while a live ticket still points at them is worse
  // than leaving the booking intact for someone to deal with.
  it('does not cancel the itinerary when the void fails', async () => {
    const { cancelBooking } = await loadChain();
    axios.post
      .mockResolvedValueOnce(reply(retrievedWithTicket(todayDDMMMYY())))
      .mockResolvedValueOnce(reply(errorReply))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    await expect(cancelBooking('ABC123')).rejects.toMatchObject({ step: 'voidTicket' });
    expect(didCancel()).toBe(false);
  });

  // Two tickets are answered with two transactionResults. Read as one result,
  // the reply had no responseType: Amadeus voided both, and the chain reported
  // the void as failed and left the itinerary in place.
  it('voids both tickets of a two-ticket booking, then cancels', async () => {
    const { cancelBooking } = await loadChain();
    axios.post
      .mockResolvedValueOnce(reply(retrievedWithTwoTickets(todayDDMMMYY())))
      .mockResolvedValueOnce(reply(voidedEach('X', 'X')))
      .mockResolvedValueOnce(reply(ok('PNR_Reply')))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const result = await cancelBooking('ABC123');

    expect(didVoid()).toBe(true);
    expect(didCancel()).toBe(true);
    expect(result.voided).toBe(true);
    expect(result.tickets).toHaveLength(2);
    expect(result.requiresAirlineRefund).toEqual([]);
  });

  it('does not cancel when only one of two tickets was voided', async () => {
    const { cancelBooking } = await loadChain();
    axios.post
      .mockResolvedValueOnce(reply(retrievedWithTwoTickets(todayDDMMMYY())))
      .mockResolvedValueOnce(reply(voidedEach('X', 'E')))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    await expect(cancelBooking('ABC123')).rejects.toMatchObject({ step: 'voidTicket' });
    expect(didCancel()).toBe(false);
  });

  // Every answer said voided, but there was one answer for two tickets.
  it('does not cancel when the reply answers only one of two tickets', async () => {
    const { cancelBooking } = await loadChain();
    axios.post
      .mockResolvedValueOnce(reply(retrievedWithTwoTickets(todayDDMMMYY())))
      .mockResolvedValueOnce(reply(envelope('Ticket_CancelDocumentReply',
        '<transactionResults><responseDetails><responseType>X</responseType><statusCode>O</statusCode></responseDetails>'
        + '<ticketNumbers><documentDetails><number>22074911749321</number></documentDetails></ticketNumbers></transactionResults>', true)))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    await expect(cancelBooking('ABC123')).rejects.toMatchObject({ step: 'voidTicket' });
    expect(didCancel()).toBe(false);
  });

  // A cancel whose PNR_Cancel failed has already voided the tickets. Retried,
  // the void answers 6150 DOCUMENT ALREADY CANCELLED - which stopped every
  // retry at the void, and the booking stayed live with its tickets voided.
  it('finishes a cancel whose tickets an earlier attempt already voided', async () => {
    const { cancelBooking } = await loadChain();
    const alreadyVoided = envelope('Ticket_CancelDocumentReply',
      '<transactionResults><responseDetails><responseType>X</responseType><statusCode>N</statusCode></responseDetails>'
      + '<errorGroup><errorOrWarningCodeDetails><errorDetails><errorCode>6150</errorCode></errorDetails></errorOrWarningCodeDetails>'
      + '<errorWarningDescription><freeText>REJECTED - DOCUMENT ALREADY CANCELLED</freeText></errorWarningDescription></errorGroup></transactionResults>', true);
    axios.post
      .mockResolvedValueOnce(reply(retrievedWithTicket(todayDDMMMYY())))
      .mockResolvedValueOnce(reply(alreadyVoided))
      .mockResolvedValueOnce(reply(ok('PNR_Reply')))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const result = await cancelBooking('ABC123');

    expect(didCancel()).toBe(true);
    expect(result.voided).toBe(true);
  });

  // Amadeus stamps the ticket with the OFFICE's date, not UTC. On PDT at
  // 00:11 UTC on 16 Sep 2026 a ticket issued minutes earlier read /15SEP26/,
  // so measuring the void window against UTC skipped the void and told the
  // customer the airline owed them a refund - every night, for the hours
  // between midnight UTC and midnight in the office.
  it("voids a ticket the office's calendar still calls today, after UTC has rolled over", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: Date.parse('2026-09-16T00:20:00Z') });
    vi.stubEnv('AMADEUS_WS_OFFICE_TIME_ZONE', 'America/New_York');
    const { cancelBooking } = await loadChain();
    axios.post
      .mockResolvedValueOnce(reply(retrievedWithTicket('15SEP26')))
      .mockResolvedValueOnce(reply(voided()))
      .mockResolvedValueOnce(reply(ok('PNR_Reply')))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const result = await cancelBooking('ABC123');

    expect(didVoid()).toBe(true);
    expect(result.voided).toBe(true);
    expect(result.requiresAirlineRefund).toEqual([]);
    vi.useRealTimers();
  });

  it('still leaves a ticket from an earlier day to the airline', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: Date.parse('2026-09-16T00:20:00Z') });
    vi.stubEnv('AMADEUS_WS_OFFICE_TIME_ZONE', 'America/New_York');
    const { cancelBooking } = await loadChain();
    axios.post
      .mockResolvedValueOnce(reply(retrievedWithTicket('14SEP26')))
      .mockResolvedValueOnce(reply(ok('PNR_Reply')))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const result = await cancelBooking('ABC123');

    expect(didVoid()).toBe(false);
    expect(result.voided).toBe(false);
    expect(result.requiresAirlineRefund).toEqual(['057-2412345678']);
    vi.useRealTimers();
  });

  // 5795 INVALID OR MISSING COUPON/BOOKLET NUMBER answered a void asked for
  // seconds after issuance on PDT (16 Sep 2026): the coupons were not in the
  // e-ticket record yet, and the same void succeeded 15 s later.
  it('tries the void again in a new session when the coupons are not there yet', async () => {
    vi.stubEnv('AMADEUS_WS_VOID_RETRY_DELAY_MS', '0');
    const { cancelBooking } = await loadChain();
    const tooSoon = envelope('Ticket_CancelDocumentReply',
      '<errorGroup><errorOrWarningCodeDetails><errorDetails><errorCode>5795</errorCode></errorDetails></errorOrWarningCodeDetails>'
      + '<errorWarningDescription><freeText>INVALID OR MISSING COUPON/BOOKLET NUMBER</freeText></errorWarningDescription></errorGroup>', true);
    const voided = envelope('Ticket_CancelDocumentReply',
      '<transactionResults><responseDetails><responseType>X</responseType><statusCode>O</statusCode></responseDetails></transactionResults>', true);
    axios.post
      .mockResolvedValueOnce(reply(retrievedWithTicket(todayDDMMMYY())))
      .mockResolvedValueOnce(reply(tooSoon))
      .mockResolvedValueOnce(reply(ok('Security_SignOutReply')))
      .mockResolvedValueOnce(reply(retrievedWithTicket(todayDDMMMYY())))
      .mockResolvedValueOnce(reply(voided))
      .mockResolvedValueOnce(reply(ok('PNR_Reply')))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    const result = await cancelBooking('ABC123');

    expect(result).toMatchObject({ cancelled: true, voided: true });
    const sent = axios.post.mock.calls.map(([, body]) => String(body));
    expect(sent.filter((body) => body.includes('<Ticket_CancelDocument'))).toHaveLength(2);
    // The second attempt is a session of its own; a timed-out one is unusable.
    expect(sent.filter((body) => body.includes('TransactionStatusCode="Start"'))).toHaveLength(2);
    expect(didCancel()).toBe(true);
  });

  it('does not try again when the airline refuses the void outright', async () => {
    vi.stubEnv('AMADEUS_WS_VOID_RETRY_DELAY_MS', '0');
    const { cancelBooking } = await loadChain();
    const refused = envelope('Ticket_CancelDocumentReply',
      '<errorGroup><errorOrWarningCodeDetails><errorDetails><errorCode>5458</errorCode></errorDetails></errorOrWarningCodeDetails>'
      + '<errorWarningDescription><freeText>NOT AUTHORISED</freeText></errorWarningDescription></errorGroup>', true);
    axios.post
      .mockResolvedValueOnce(reply(retrievedWithTicket(todayDDMMMYY())))
      .mockResolvedValueOnce(reply(refused))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    await expect(cancelBooking('ABC123')).rejects.toMatchObject({ step: 'voidTicket' });

    const sent = axios.post.mock.calls.map(([, body]) => String(body));
    expect(sent.filter((body) => body.includes('<Ticket_CancelDocument'))).toHaveLength(1);
    expect(didCancel()).toBe(false);
  });

  it('does not cancel when the void is refused for any other reason', async () => {
    const { cancelBooking } = await loadChain();
    const refusedVoid = envelope('Ticket_CancelDocumentReply',
      '<transactionResults><responseDetails><responseType>X</responseType><statusCode>N</statusCode></responseDetails>'
      + '<errorGroup><errorOrWarningCodeDetails><errorDetails><errorCode>1234</errorCode></errorDetails></errorOrWarningCodeDetails>'
      + '<errorWarningDescription><freeText>VOID NOT PERMITTED</freeText></errorWarningDescription></errorGroup></transactionResults>', true);
    axios.post
      .mockResolvedValueOnce(reply(retrievedWithTicket(todayDDMMMYY())))
      .mockResolvedValueOnce(reply(refusedVoid))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    await expect(cancelBooking('ABC123')).rejects.toMatchObject({ step: 'voidTicket' });
    expect(didCancel()).toBe(false);
  });

  describe('a PNR still being updated', () => {
    const simultaneous = envelope('PNR_Reply',
      '<generalErrorInfo><errorOrWarningCodeDetails><errorDetails><errorCode>8111</errorCode></errorDetails></errorOrWarningCodeDetails>'
      + '<errorFreeText>SIMULTANEOUS CHANGES TO PNR - USE WRA/RT TO PRINT OR IGNORE</errorFreeText></generalErrorInfo>', true);
    const cancelCalls = () => actionsSent().filter((a) => a.includes('PNRXCL')).length;

    beforeEach(() => {
      vi.stubEnv('AMADEUS_WS_CANCEL_RETRY_DELAY_MS', '0');
    });

    // Right after ticketing the airline's updates are still landing on the PNR;
    // an Etihad and an Air Canada booking were left live on PDT this way.
    it('redisplays the PNR and cancels again after 8111', async () => {
      const { cancelBooking } = await loadChain();
      axios.post
        .mockResolvedValueOnce(reply(retrievedNoTicket))
        .mockResolvedValueOnce(reply(simultaneous))
        .mockResolvedValueOnce(reply(retrievedNoTicket))
        .mockResolvedValueOnce(reply(ok('PNR_Reply')))
        .mockResolvedValue(reply(ok('Security_SignOutReply')));

      const result = await cancelBooking('ABC123');

      expect(result.cancelled).toBe(true);
      expect(cancelCalls()).toBe(2);
      // The refused cancel is still pending: it is ignored (optionCode 21) before
      // the retry, because a plain retrieve answers 31 FINISH OR IGNORE.
      const bodies = axios.post.mock.calls.map(([, body]) => String(body));
      expect(bodies.some((body) => body.includes('<PNR_AddMultiElements') && body.includes('<optionCode>21</optionCode>'))).toBe(true);
    });

    it('gives up after three attempts', async () => {
      const { cancelBooking } = await loadChain();
      axios.post
        .mockResolvedValueOnce(reply(retrievedNoTicket))
        .mockResolvedValueOnce(reply(simultaneous))
        .mockResolvedValueOnce(reply(retrievedNoTicket))
        .mockResolvedValueOnce(reply(simultaneous))
        .mockResolvedValueOnce(reply(retrievedNoTicket))
        .mockResolvedValueOnce(reply(simultaneous))
        .mockResolvedValue(reply(ok('Security_SignOutReply')));

      await expect(cancelBooking('ABC123')).rejects.toMatchObject({ step: 'cancel' });
      expect(cancelCalls()).toBe(3);
    });
  });

  it('identifies the stock by market code, which is what the schema holds', async () => {
    const { cancelBooking } = await loadChain();
    axios.post
      .mockResolvedValueOnce(reply(retrievedWithTicket(todayDDMMMYY())))
      .mockResolvedValueOnce(reply(voided()))
      .mockResolvedValueOnce(reply(ok('PNR_Reply')))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    await cancelBooking('ABC123');

    const voidCall = axios.post.mock.calls.find(([, , cfg]) => cfg?.headers?.SOAPAction?.includes('TRCANQ'));
    // stockProviderDetails is OfficeSettingsDetailsType: a market code, not a
    // carrier. The old assertion pinned an element this schema does not have.
    expect(voidCall[1]).toContain('<marketIataCode>US</marketIataCode>');
    expect(voidCall[1]).not.toContain('marketingCompany');
    // The document number goes without its separator.
    expect(voidCall[1]).toContain('<number>0572412345678</number>');
  });
});
