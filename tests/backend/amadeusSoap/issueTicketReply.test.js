import { describe, expect, it } from 'vitest';
import { inspectReply } from '../../../backend/services/amadeusSoap/errors.js';
import { readIssueTicketReply } from '../../../backend/services/amadeusSoap/operations/ticketing.js';
import { parseSoap, unwrapEnvelope } from '../../../backend/services/amadeusSoap/parseXml.js';

/**
 * Ticket issuance reports SUCCESS inside an error container.
 *
 * `DocIssuance_IssueTicket` answers a successful issuance with
 * `processingStatus O` AND an `errorGroup` whose `errorCode` is the literal
 * string "OK" — this is Amadeus's own documented example, not an edge case.
 *
 * `errorGroup` is one of the containers `collectMessages` gathers, so without
 * a guard a successful issuance reads as a failure. `callStep` throws on that,
 * which means every ticket that issued correctly would have failed its
 * booking, and the compensation path would have run for a customer holding a
 * valid ticket. It would have surfaced the moment AMADEUS_WS_AUTO_TICKET was
 * switched on — a launch-blocking bug that no test could catch, because we had
 * never seen a real issuance reply.
 */

const body = (xml) => unwrapEnvelope(parseSoap(
  `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${xml}</soap:Body></soap:Envelope>`,
)).body;

const SUCCESS = `<DocIssuance_IssueTicketReply>
  <processingStatus><statusCode>O</statusCode></processingStatus>
  <errorGroup>
    <errorOrWarningCodeDetails><errorDetails><errorCode>OK</errorCode></errorDetails></errorOrWarningCodeDetails>
    <errorWarningDescription>
      <freeTextDetails><textSubjectQualifier>3</textSubjectQualifier><source>M</source><encoding>1</encoding></freeTextDetails>
      <freeText>OK</freeText>
    </errorWarningDescription>
  </errorGroup>
</DocIssuance_IssueTicketReply>`;

describe('a successful issuance', () => {
  it('is not reported as a failure just because it carries an errorGroup', () => {
    expect(inspectReply(body(SUCCESS), 'DocIssuance_IssueTicket').ok).toBe(true);
  });

  it('is read as issued', () => {
    const reply = body(SUCCESS).DocIssuance_IssueTicketReply;
    expect(readIssueTicketReply(reply).issued).toBe(true);
  });
});

describe('a real failure still fails', () => {
  it('reports an errorGroup carrying an actual error code', () => {
    const xml = `<DocIssuance_IssueTicketReply>
      <errorGroup>
        <errorOrWarningCodeDetails><errorDetails><errorCode>288</errorCode></errorDetails></errorOrWarningCodeDetails>
        <errorWarningDescription><freeText>UNABLE TO ISSUE</freeText></errorWarningDescription>
      </errorGroup>
    </DocIssuance_IssueTicketReply>`;
    const inspected = inspectReply(body(xml), 'DocIssuance_IssueTicket');

    expect(inspected.ok).toBe(false);
    expect(inspected.error.amadeusCode).toBe('288');
  });

  // The exact reply the PDT office returned for Air India PNR ASOV8X on
  // 2026-09-13, while Lufthansa tickets issued. It arrives after commit, so the
  // booking stands and a human must act: catalogued and alerting, never the
  // generic "temporarily unavailable" that reads as our outage.
  it('names a carrier the office may not ticket, and alerts', () => {
    const xml = `<DocIssuance_IssueTicketReply>
      <processingStatus><statusCode>X</statusCode></processingStatus>
      <errorGroup>
        <errorOrWarningCodeDetails><errorDetails><errorCode>2161</errorCode></errorDetails></errorOrWarningCodeDetails>
        <errorWarningDescription>
          <freeTextDetails><textSubjectQualifier>3</textSubjectQualifier><source>M</source><encoding>1</encoding></freeTextDetails>
          <freeText>PROHIBITED TICKETING CARRIER - RE-ENTER TICKETING CARRIER</freeText>
        </errorWarningDescription>
      </errorGroup>
    </DocIssuance_IssueTicketReply>`;
    const parsed = body(xml);
    const inspected = inspectReply(parsed, 'DocIssuance_IssueTicket');

    expect(inspected.ok).toBe(false);
    expect(inspected.error.amadeusCode).toBe('2161');
    expect(inspected.error.technicalError).toMatch(/PROHIBITED TICKETING CARRIER/);
    expect(inspected.error.alert).toBe(true);
    expect(inspected.error.error).toMatch(/our team will complete it/);
    expect(readIssueTicketReply(parsed.DocIssuance_IssueTicketReply)).toEqual({ issued: false, status: 'X' });
  });

  it('fails when OK sits alongside a real error, rather than excusing it', () => {
    // The guard must require EVERY code to be OK. One genuine error among
    // several must still fail the step.
    const xml = `<DocIssuance_IssueTicketReply>
      <errorGroup><errorOrWarningCodeDetails><errorDetails><errorCode>OK</errorCode></errorDetails></errorOrWarningCodeDetails></errorGroup>
      <errorGroup><errorOrWarningCodeDetails><errorDetails><errorCode>931</errorCode></errorDetails></errorOrWarningCodeDetails></errorGroup>
    </DocIssuance_IssueTicketReply>`;

    expect(inspectReply(body(xml), 'DocIssuance_IssueTicket').ok).toBe(false);
  });
});

/**
 * An ambiguous reply is not a ticket.
 *
 * `issued` becomes `gds.ticketed` - the flag that tells the customer "booked
 * and ticketed", and that the paid-but-not-ticketed alarm uses to EXCLUDE a
 * row. It used to be true for an empty status and for P (pending): a reply
 * shape nobody had seen counted as a ticket, and then hid itself from the one
 * job looking for it. No real issuance has ever run on this system, so this
 * line has to be right by construction rather than by observation.
 */
describe('an ambiguous reply is not a ticket', () => {
  const withStatus = (code) => body(
    `<DocIssuance_IssueTicketReply><processingStatus><statusCode>${code}</statusCode></processingStatus></DocIssuance_IssueTicketReply>`,
  ).DocIssuance_IssueTicketReply;

  it('is not issued when there is no processing status at all', () => {
    expect(readIssueTicketReply({}).issued).toBe(false);
    expect(readIssueTicketReply({ errorGroup: {} }).issued).toBe(false);
  });

  it('is not issued for an empty status code', () => {
    expect(readIssueTicketReply(withStatus('')).issued).toBe(false);
  });

  it('treats P (pending) as not yet issued', () => {
    const read = readIssueTicketReply(withStatus('P'));
    expect(read.issued).toBe(false);
    expect(read.status).toBe('P');
  });

  it('still reads O and OK as issued', () => {
    expect(readIssueTicketReply(withStatus('O')).issued).toBe(true);
    expect(readIssueTicketReply(withStatus('OK')).issued).toBe(true);
  });
});
