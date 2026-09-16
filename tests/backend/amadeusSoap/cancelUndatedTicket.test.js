import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readTickets } from '../../../backend/services/amadeusSoap/mappers/flightOrder.js';

/**
 * A ticket whose issue date cannot be read is not "past its void window".
 *
 * `issuedOn` comes from a DDMMMYY token in the FA element's free text
 * (mappers/flightOrder.js). When that token is absent - a format variant, or a
 * value split across the two 70-character free-text entries - it is `null`.
 *
 * The void decision was `issuedOn === today`, and `null === today` is false, so
 * such a ticket fell into `unvoidable`: the void block was skipped ENTIRELY and
 * PNR_Cancel went straight ahead. The segments were stripped while a live
 * ticket stood against them - the exact outcome the guard on a *failed* void
 * exists to prevent ("Do not cancel the itinerary on top of a failed void").
 * A void that was never attempted had no guard at all.
 *
 * Downstream it is worse than losing the void window: `requiresAirlineRefund`
 * lists the ticket, and when the row records `refundable: true`,
 * decideFlightRefund returns `refund_less_fee` - money back to the customer
 * against a ticket that was never voided and may still have been voidable.
 */

const envelope = (name, inner) => `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3">
  <soap:Header><awsse:Session TransactionStatusCode="InSeries"><awsse:SessionId>S1</awsse:SessionId><awsse:SequenceNumber>1</awsse:SequenceNumber><awsse:SecurityToken>T</awsse:SecurityToken></awsse:Session></soap:Header>
  <soap:Body><${name}>${inner}</${name}></soap:Body>
</soap:Envelope>`;

const reply = (xml) => ({ status: 200, data: xml, headers: {} });

const withFreetext = (freetext) => envelope('PNR_Reply',
  '<pnrHeader><reservationInfo><reservation><controlNumber>ABC123</controlNumber></reservation></reservationInfo></pnrHeader>'
  + '<dataElementsMaster><dataElementsIndiv>'
  + '<elementManagementData><segmentName>FA</segmentName></elementManagementData>'
  + `<otherDataFreetext><longFreetext>${freetext}</longFreetext></otherDataFreetext>`
  + '</dataElementsIndiv></dataElementsMaster>');

/** The same FA element, with the date token missing. */
const UNDATED = 'PAX 057-2412345678/ETAI/USD221.70/SCK1S2400/12345678';
const DATED = (ddmmmyy) => `PAX 057-2412345678/ETAI/USD221.70/${ddmmmyy}/SCK1S2400/12345678`;

const OFFICE_ZONE = 'America/New_York';
const todayDDMMMYY = () => {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const [year, month, day] = new Date().toLocaleDateString('en-CA', { timeZone: OFFICE_ZONE }).split('-');
  return `${day}${months[Number(month) - 1]}${year.slice(-2)}`;
};

const ok = (name) => envelope(name, '<dummy/>');
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
  vi.stubEnv('AMADEUS_WS_OFFICE_TIME_ZONE', OFFICE_ZONE);
  vi.resetModules();
  axios.post.mockReset();
});

describe('a ticket with no readable issue date', () => {
  // The mapper's half of the story, so this test cannot drift from it.
  it('reads as null rather than as some date', () => {
    const [ticket] = readTickets({
      dataElementsMaster: {
        dataElementsIndiv: [{
          elementManagementData: { segmentName: 'FA' },
          otherDataFreetext: { longFreetext: UNDATED },
        }],
      },
    });

    expect(ticket.number).toBe('057-2412345678');
    expect(ticket.issuedOn).toBeNull();
  });

  // The bug, exactly.
  it('is never cancelled over: no void attempted, no itinerary stripped', async () => {
    const { cancelBooking } = await loadChain();
    axios.post
      .mockResolvedValueOnce(reply(withFreetext(UNDATED)))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    await expect(cancelBooking('ABC123')).rejects.toMatchObject({
      step: 'voidTicket',
      committed: true,
      ticketed: true,
    });

    expect(didVoid(), 'no void was attempted').toBe(false);
    expect(didCancel(), 'the itinerary must not be cancelled over it').toBe(false);
  });

  it('says which ticket, so a human can finish it', async () => {
    const { cancelBooking } = await loadChain();
    axios.post
      .mockResolvedValueOnce(reply(withFreetext(UNDATED)))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    await expect(cancelBooking('ABC123')).rejects.toMatchObject({
      technicalError: expect.stringContaining('057-2412345678'),
    });
  });

  // The control: a ticket that DOES carry today's date still voids, so the
  // guard above cannot be satisfied by refusing to cancel anything at all.
  it('still voids a ticket whose date reads as today', async () => {
    const { cancelBooking } = await loadChain();
    const voidOk = envelope('Ticket_CancelDocumentReply',
      '<transactionResults><responseDetails><responseType>X</responseType>'
      + '<statusCode>O</statusCode></responseDetails></transactionResults>');
    axios.post
      .mockResolvedValueOnce(reply(withFreetext(DATED(todayDDMMMYY()))))
      .mockResolvedValueOnce(reply(voidOk))
      .mockResolvedValueOnce(reply(ok('PNR_Reply')))
      .mockResolvedValue(reply(ok('Security_SignOutReply')));

    await cancelBooking('ABC123').catch(() => {});

    expect(didVoid(), 'a dated, same-day ticket is still voided').toBe(true);
  });
});
