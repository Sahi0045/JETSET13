import { describe, expect, it } from 'vitest';
import { buildEnvelope } from '../../../backend/services/amadeusSoap/envelope.js';

const config = {
  endpoint: 'https://nodeD2.test.webservices.amadeus.com/1ASIWJETJEC',
  username: 'WSUSER',
  password: 'pw',
  officeId: 'SCK1S2400',
  dutyCode: 'SU',
  requestorType: 'U',
};

const build = (session) => buildEnvelope({
  action: 'http://webservices.amadeus.com/FMPTBQ_24_6_1A',
  bodyXml: '<Body/>',
  config,
  session,
  now: new Date('2026-09-04T12:00:00Z'),
});

describe('session header', () => {
  // The regression this whole module exists to prevent: the previous client
  // always sent TransactionStatusCode="Start", so every stateless search opened
  // a server-side session and abandoned it, consuming WSAP session quota.
  it('omits the Session element entirely when stateless', () => {
    const xml = build(null);
    expect(xml).not.toContain('awsse:Session');
    expect(xml).not.toContain('TransactionStatusCode');
  });

  it('opens a session with Start and no body', () => {
    const xml = build({ status: 'Start' });
    expect(xml).toContain('<awsse:Session TransactionStatusCode="Start">');
    expect(xml).not.toContain('SessionId');
  });

  it('echoes the session triple in schema order when continuing', () => {
    const xml = build({
      status: 'InSeries', sessionId: 'ABC123', sequenceNumber: '2', securityToken: 'TOK',
    });

    expect(xml).toContain('TransactionStatusCode="InSeries"');
    // AMA_WS_Session.xsd fixes this order: SessionId, SequenceNumber, SecurityToken.
    const order = xml.indexOf('<awsse:SessionId>') < xml.indexOf('<awsse:SequenceNumber>')
      && xml.indexOf('<awsse:SequenceNumber>') < xml.indexOf('<awsse:SecurityToken>');
    expect(order).toBe(true);
    expect(xml).toContain('<awsse:SessionId>ABC123</awsse:SessionId>');
    expect(xml).toContain('<awsse:SecurityToken>TOK</awsse:SecurityToken>');
  });

  it('closes with End', () => {
    expect(build({ status: 'End', sessionId: 'A', sequenceNumber: '3', securityToken: 'T' }))
      .toContain('TransactionStatusCode="End"');
  });
});

describe('security header', () => {
  it('carries the credentials and the office in their own blocks', () => {
    const xml = build(null);

    expect(xml).toContain('<wsse:Username>WSUSER</wsse:Username>');
    expect(xml).toContain('PasswordDigest');
    expect(xml).toContain('<wsu:Created>2026-09-04T12:00:00Z</wsu:Created>');
    // Office ID belongs in AMA_SecurityHostedUser, never the UsernameToken -
    // the most common first-attempt mistake.
    expect(xml).toContain('PseudoCityCode="SCK1S2400"');
    expect(xml).toContain('AgentDutyCode="SU"');
    expect(xml).toContain('RequestorType="U"');
    expect(xml).not.toContain('<wsse:Username>SCK1S2400');
  });

  it('never emits the raw password', () => {
    expect(build(null)).not.toContain('>pw<');
  });

  it('uses the namespaces declared by the WSAP WSDL', () => {
    const xml = build(null);
    expect(xml).toContain('xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3"');
    expect(xml).toContain('xmlns:amasec="http://xml.amadeus.com/2010/06/Security_v1"');
    expect(xml).toContain('xmlns:awsl="http://wsdl.amadeus.com/2010/06/ws/Link_v1"');
  });
});

describe('escaping', () => {
  // A surname with an apostrophe or ampersand silently corrupts the envelope,
  // and the resulting fault does not name the offending element.
  it('escapes special characters in credentials and office', () => {
    const xml = buildEnvelope({
      action: 'a&b',
      bodyXml: '<Body/>',
      config: { ...config, username: "O'Brien & Co", officeId: '<SCK>' },
      session: null,
      now: new Date('2026-09-04T12:00:00Z'),
    });

    expect(xml).toContain('O&apos;Brien &amp; Co');
    expect(xml).toContain('PseudoCityCode="&lt;SCK&gt;"');
    expect(xml).toContain('<add:Action>a&amp;b</add:Action>');
    expect(xml).not.toMatch(/<wsse:Username>[^<]*&(?!amp;|apos;|lt;|gt;|quot;)/);
  });
});
