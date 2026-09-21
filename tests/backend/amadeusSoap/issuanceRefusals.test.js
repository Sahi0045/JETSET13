import { describe, expect, it } from 'vitest';
import { inspectReply } from '../../../backend/services/amadeusSoap/errors.js';
import { parseSoap, unwrapEnvelope } from '../../../backend/services/amadeusSoap/parseXml.js';

/**
 * A carrier the office may not ticket is a standing refusal, not a hiccup.
 *
 * Only 2161 PROHIBITED TICKETING CARRIER was named. The other standing
 * refusals DocIssuance_IssueTicket gave this office on PDT (15 Sep 2026) fell
 * to the default rule - "Flight service temporarily unavailable", alert off -
 * so the first booking on a newly refusing carrier was counted and grouped as
 * supplier flakiness. The British spelling is why the credentials rule never
 * caught it: "NOT AUTHORISED" does not match /not.*authoriz/.
 *
 * The replies below are the ones captured on PDT, body only.
 */

const issuanceReply = (code, text) => {
  const xml = '<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Header/><soap:Body>'
    + '<DocIssuance_IssueTicketReply xmlns="http://xml.amadeus.com/TTKTIR_15_1_1A"><processingStatus><statusCode>X</statusCode></processingStatus>'
    + `<errorGroup><errorOrWarningCodeDetails><errorDetails><errorCode>${code}</errorCode></errorDetails></errorOrWarningCodeDetails>`
    + '<errorWarningDescription><freeTextDetails><textSubjectQualifier>3</textSubjectQualifier><source>M</source><encoding>1</encoding></freeTextDetails>'
    + `<freeText>${text}</freeText></errorWarningDescription></errorGroup></DocIssuance_IssueTicketReply></soap:Body></soap:Envelope>`;
  const { body } = unwrapEnvelope(parseSoap(xml));
  return body.DocIssuance_IssueTicketReply;
};

const inspect = (code, text) => inspectReply(issuanceReply(code, text), 'DocIssuance_IssueTicket').error;

describe('a carrier this office may not ticket', () => {
  it.each([
    ['KU101', '0', 'KU ETKT: NOT AUTHORISED'],
    ['EN2158', '0', 'EN ETKT: NOT AUTHORISED'],
    ['BF700', '0', 'BF ETKT: NOT AUTHORISED'],
    ['GF7', '8100', 'ETKT THIS CARRIER NOT VALID THIS MARKET'],
    ['B6/LH', '8102', 'ETKT RJT - NO INTERLINE BETWEEN CARRIERS B6-LH'],
  ])('is named and alerted like 2161 (%s)', (_flight, code, text) => {
    expect(inspect(code, text)).toMatchObject({
      code: 502,
      alert: true,
      error: 'Your ticket could not be issued automatically - our team will complete it',
    });
  });
});

describe('what stays as it was', () => {
  // A link failure, not a refusal: ticketingCarriers.js leaves CZ off the block
  // list for exactly this reason.
  it('keeps a communications failure transient', () => {
    expect(inspect('0', 'CZ ETKT: COMMUNICATIONS LINE UNAVAILABLE')).toMatchObject({ alert: false });
  });

  // A void refusal says NOT AUTHORISED with no ETKT, and cancelBooking reads it
  // on its own terms.
  it('leaves a refused void alone', () => {
    const reply = issuanceReply('5458', 'NOT AUTHORISED');
    expect(inspectReply(reply, 'Ticket_CancelDocument').error).toMatchObject({ alert: false });
  });
});
