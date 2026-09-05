import { describe, expect, it } from 'vitest';
import { createRedactor } from '../../scripts/lib/redact-evidence.mjs';

/**
 * Redaction of recorded Amadeus evidence.
 *
 * These files are sent outside the company, to Amadeus, so a miss here is a
 * disclosure — of our WSAP credentials, or of a traveller. Both failure modes
 * this suite pins were found in a real recording rather than imagined:
 *
 *   - `<givenName>` went unmasked. Amadeus echoes the given name back under
 *     that element in PNR replies, while we only masked `<firstName>`, so a
 *     real given name reached the pack.
 *   - Masking any long digit run in free text turned the RM reconciliation
 *     element `ARC REC-1788616…` into `ARC REC-5555550100`, which both
 *     destroyed evidence and read as a phone number leaking into it.
 *
 * The opposing risk is over-redaction. Fare amounts, dates, PNR locators and
 * the RF/RM/TK trail are the evidence; a redactor that eats them produces a
 * pack that proves nothing.
 */

const envelope = (body) => `<soap:Envelope><soap:Header>
<wsse:Security><wsse:UsernameToken>
<wsse:Username>WSJECJET</wsse:Username>
<wsse:Nonce EncodingType="Base64Binary">bm9uY2V2YWx1ZQ==</wsse:Nonce>
<wsse:Password Type="PasswordDigest">c2VjcmV0ZGlnZXN0dmFsdWU=</wsse:Password>
</wsse:UsernameToken></wsse:Security>
<awsse:Session TransactionStatusCode="InSeries">
<awsse:SessionId>01ABCDEF23</awsse:SessionId>
<awsse:SequenceNumber>2</awsse:SequenceNumber>
<awsse:SecurityToken>LIVETOKEN9988</awsse:SecurityToken>
</awsse:Session></soap:Header><soap:Body>${body}</soap:Body></soap:Envelope>`;

describe('credentials', () => {
  const { redact } = createRedactor();
  const out = redact(envelope('<x/>'));

  it('blanks the password digest', () => {
    expect(out).not.toContain('c2VjcmV0ZGlnZXN0dmFsdWU=');
    expect(out).toContain('<wsse:Password Type="PasswordDigest">[REDACTED]</wsse:Password>');
  });

  it('blanks the nonce and the security token', () => {
    expect(out).not.toContain('bm9uY2V2YWx1ZQ==');
    expect(out).not.toContain('LIVETOKEN9988');
  });

  it('keeps the element structure the reviewer is checking', () => {
    // Blanking the elements themselves would defeat the point of recording.
    for (const tag of ['wsse:Username', 'wsse:Nonce', 'wsse:Password', 'awsse:SequenceNumber']) {
      expect(out).toContain(`<${tag}`);
    }
    // The username identifies which office user made the call, which is
    // exactly what Amadeus needs to correlate the pack with their own logs.
    expect(out).toContain('WSJECJET');
  });
});

describe('session identifiers', () => {
  it('pseudonymises rather than blanks, so the chain stays followable', () => {
    const { redact } = createRedactor();
    const out = redact(envelope('<x/>'));

    expect(out).not.toContain('01ABCDEF23');
    expect(out).toContain('<awsse:SessionId>SESSION-1</awsse:SessionId>');
  });

  it('gives one session the same alias across every file in a run', () => {
    // This is the whole point: a reviewer must be able to see that one
    // session carried the entire booking chain.
    const { redact } = createRedactor();
    const first = redact(envelope('<a/>'));
    const second = redact(envelope('<b/>'));

    expect(first).toContain('SESSION-1');
    expect(second).toContain('SESSION-1');
  });

  it('distinguishes separate sessions', () => {
    const { redact } = createRedactor();
    redact(envelope('<a/>'));
    const other = redact(envelope('<b/>').replace('01ABCDEF23', '99ZZZZZZ11'));

    expect(other).toContain('SESSION-2');
  });
});

describe('traveller data', () => {
  const { redact } = createRedactor();
  const out = redact(envelope(`
    <travellerInfo><passengerData><travellerInformation>
      <traveller><surname>KUSHWAHA</surname><quantity>1</quantity></traveller>
      <passenger><firstName>SHUBHAM MR</firstName><type>ADT</type></passenger>
    </travellerInformation></passengerData></travellerInfo>
    <otherPassengerNames><surname>KUSHWAHA</surname><givenName>SHUBHAM MR</givenName></otherPassengerNames>
    <dateOfBirth>15081991</dateOfBirth>
    <documentNumber>Z1234567</documentNumber>`));

  it('masks the given name under both element names Amadeus uses', () => {
    // The reply echoes it as givenName, the request sends it as firstName.
    // Missing the former is how a real name reached a recorded pack.
    expect(out).not.toContain('SHUBHAM');
    expect(out).toContain('<givenName>TESTGIVEN MR</givenName>');
    expect(out).toContain('<firstName>TESTGIVEN MR</firstName>');
  });

  it('masks surname, date of birth and document number', () => {
    expect(out).not.toContain('KUSHWAHA');
    expect(out).not.toContain('15081991');
    expect(out).not.toContain('Z1234567');
  });

  it('leaves the surrounding structure intact', () => {
    // `redactEnvelope` in the runtime logger replaces this whole subtree. Here
    // the subtree IS the evidence.
    expect(out).toContain('<travellerInfo>');
    expect(out).toContain('<travellerInformation>');
    expect(out).toContain('<type>ADT</type>');
    expect(out).toContain('<quantity>1</quantity>');
  });
});

describe('contact details', () => {
  const pnrElements = `
    <dataElementsIndiv><elementManagementData><segmentName>AP</segmentName></elementManagementData>
      <freetextData><longFreetext>+91 98765 43210</longFreetext></freetextData></dataElementsIndiv>
    <dataElementsIndiv><elementManagementData><segmentName>APE</segmentName></elementManagementData>
      <freetextData><longFreetext>shubham@example.org</longFreetext></freetextData></dataElementsIndiv>
    <dataElementsIndiv><elementManagementData><segmentName>RM</segmentName></elementManagementData>
      <freetextData><longFreetext>ARC ORD-1788616542119</longFreetext></freetextData></dataElementsIndiv>
    <dataElementsIndiv><elementManagementData><segmentName>RF</segmentName></elementManagementData>
      <freetextData><longFreetext>JETSETTERS</longFreetext></freetextData></dataElementsIndiv>`;

  const { redact } = createRedactor();
  const out = redact(envelope(pnrElements));

  it('masks the phone in the AP element', () => {
    expect(out).not.toContain('98765');
    expect(out).toContain('5555550100');
  });

  it('masks the email in the APE element', () => {
    expect(out).not.toContain('shubham@example.org');
    expect(out).toContain('traveller@example.com');
  });

  it('leaves the RM reconciliation reference exactly as sent', () => {
    // The regression: a blanket digit rule rewrote this to
    // "ARC ORD-5555550100", destroying the trail and making it look as though
    // a phone number had leaked into it.
    expect(out).toContain('ARC ORD-1788616542119');
  });

  it('leaves the RF element alone', () => {
    expect(out).toContain('JETSETTERS');
  });
});

describe('evidence that must survive', () => {
  const { redact } = createRedactor();
  const out = redact(envelope(`
    <recommendation><itemNumber>1</itemNumber>
      <recPriceInfo><monetaryDetail><amount>540.86</amount><currency>USD</currency></monetaryDetail>
        <monetaryDetail><amount>130.86</amount></monetaryDetail></recPriceInfo></recommendation>
    <flightDetail><flightNumber>9486</flightNumber><departureDate>151126</departureDate></flightDetail>
    <controlNumber>CL8RHY</controlNumber>
    <lastTktDate>05SEP26</lastTktDate>
    <fareBasis>XJ1QUSLT</fareBasis>`));

  it('keeps fare amounts', () => {
    // These were being eaten by the digit-run rule the AP/APE targeting
    // replaced. A pack without prices proves nothing about pricing.
    expect(out).toContain('<amount>540.86</amount>');
    expect(out).toContain('<amount>130.86</amount>');
  });

  it('keeps the PNR locator, dates, flight number and fare basis', () => {
    expect(out).toContain('CL8RHY');
    expect(out).toContain('151126');
    expect(out).toContain('05SEP26');
    expect(out).toContain('9486');
    expect(out).toContain('XJ1QUSLT');
  });
});

describe('robustness', () => {
  it('handles an empty or absent document without throwing', () => {
    const { redact } = createRedactor();
    expect(redact('')).toBe('');
    expect(redact(undefined)).toBe('');
    expect(redact(null)).toBe('');
  });
});
