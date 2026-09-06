import { describe, expect, it } from 'vitest';
import { buildDocsFreetext, toAlpha3, toDDMMMYY } from '../../../backend/services/amadeusSoap/operations/travelDocs.js';
import { buildAddElementsBody } from '../../../backend/services/amadeusSoap/operations/pnr.js';

/**
 * SSR DOCS — the passenger's travel document.
 *
 * Found by turning ticketing on against PDT: a JFK-LHR booking committed, the
 * customer had paid, and `DocIssuance_IssueTicket` answered
 * `27791 TICKETING INHIBITED-SSR DOCS MISSING FOR P1`. The chain wrote names
 * and contacts and no document element at all. Domestic itineraries never
 * asked for one, which is how it went unnoticed.
 *
 * The data was already being collected — the traveller form takes nationality,
 * passport number and expiry, and the route maps them — and then dropped one
 * layer before Amadeus.
 */

describe('toAlpha3', () => {
  it('converts the two-letter codes the traveller form stores', () => {
    // DOCS is a three-letter field; the country picker stores ISO alpha-2.
    expect(toAlpha3('GB')).toBe('GBR');
    expect(toAlpha3('IN')).toBe('IND');
    expect(toAlpha3('us')).toBe('USA');
  });

  it('passes a three-letter code straight through', () => {
    expect(toAlpha3('GBR')).toBe('GBR');
  });

  it('returns null rather than guessing', () => {
    // A wrong nationality on an APIS record is a border problem, not a
    // formatting one — omitting the element is the safer failure.
    expect(toAlpha3('ZZ')).toBeNull();
    expect(toAlpha3('')).toBeNull();
    expect(toAlpha3(undefined)).toBeNull();
  });
});

describe('toDDMMMYY', () => {
  it('converts an ISO date to the only format DOCS accepts', () => {
    expect(toDDMMMYY('1990-01-01')).toBe('01JAN90');
    expect(toDDMMMYY('2030-12-25')).toBe('25DEC30');
  });

  it('returns null on anything it cannot parse', () => {
    expect(toDDMMMYY('01/01/1990')).toBeNull();
    expect(toDDMMMYY('')).toBeNull();
    expect(toDDMMMYY(null)).toBeNull();
  });
});

describe('buildDocsFreetext', () => {
  const traveler = {
    firstName: 'LOCAL', lastName: 'TESTER', gender: 'MALE', dateOfBirth: '1990-01-01',
    documents: [{
      documentType: 'PASSPORT', number: 'X1234567', nationality: 'GB',
      issuanceCountry: 'GB', expiryDate: '2030-12-25', holder: true,
    }],
  };

  it('builds the IATA field order', () => {
    expect(buildDocsFreetext(traveler))
      .toBe('P/GBR/X1234567/GBR/01JAN90/M/25DEC30/TESTER/LOCAL/H');
  });

  it('marks an infant with the I suffix on the gender', () => {
    expect(buildDocsFreetext({ ...traveler, ptc: 'INF' })).toContain('/MI/');
    expect(buildDocsFreetext({ ...traveler, gender: 'FEMALE', ptc: 'INF' })).toContain('/FI/');
  });

  it('omits the element entirely when the document is incomplete', () => {
    // A malformed DOCS is rejected at commit, which fails the whole booking
    // rather than only the ticket. No document is the safer outcome.
    expect(buildDocsFreetext({ ...traveler, documents: [{ number: 'X1' }] })).toBeNull();
    expect(buildDocsFreetext({ ...traveler, dateOfBirth: null })).toBeNull();
    expect(buildDocsFreetext({ firstName: 'A', lastName: 'B' })).toBeNull();
    expect(buildDocsFreetext({})).toBeNull();
  });

  it('strips punctuation from the document number', () => {
    expect(buildDocsFreetext({
      ...traveler,
      documents: [{ ...traveler.documents[0], number: 'x-123 456/7' }],
    })).toContain('/X1234567/');
  });
});

describe('the SSR element on the request', () => {
  const travelers = [
    { firstName: 'LOCAL', lastName: 'TESTER', gender: 'MALE', dateOfBirth: '1990-01-01', ptc: 'ADT',
      documents: [{ documentType: 'PASSPORT', number: 'X1234567', nationality: 'GB', issuanceCountry: 'GB', expiryDate: '2030-12-25' }] },
    { firstName: 'NODOC', lastName: 'PERSON', gender: 'FEMALE', dateOfBirth: '1985-05-05', ptc: 'ADT' },
  ];
  const xml = buildAddElementsBody({
    travelers, contact: { email: 'a@b.com', phone: '15555550100' },
    bookingReference: 'REF1', officeId: 'SCK1S2400',
  });

  it('emits one SSR per traveller who has a usable document', () => {
    expect((xml.match(/<segmentName>SSR<\/segmentName>/g) || [])).toHaveLength(1);
  });

  it('follows the XSD element order for the ssr sequence', () => {
    // type, status, quantity, companyId, ..., freetext — a sequence, so order
    // is enforced by the schema and the error would not name the element.
    expect(xml).toContain('<ssr><type>DOCS</type><status>HK</status><quantity>1</quantity>'
      + '<companyId>YY</companyId><freetext>P/GBR/X1234567/GBR/01JAN90/M/25DEC30/TESTER/LOCAL/H</freetext></ssr>');
  });

  it('associates the document with PR, the reference this message creates', () => {
    /**
     * `PR`, not `PT`, and the difference was the whole bug.
     *
     * The XSD says a reference number "refers to an existing PNR
     * segment/element that has been previously transmitted in a previous
     * Server response message". A passenger TATTOO is assigned by the host,
     * and Amadeus's own FP element — written later, once the PNR existed —
     * carries `PT/2` for a single passenger. So the tattoo is not the ordinal,
     * and `PT/1` pointed at a passenger that does not exist.
     *
     * The element was accepted (it is schema-valid either way), appeared on
     * the working PNR, and was then purged at commit — after which ticketing
     * answered `27791 SSR DOCS MISSING FOR P1`. With `PR`, which addresses the
     * `elementManagementPassenger` reference created by this very message, a
     * real ticket issues.
     */
    expect(xml).toContain('<referenceForDataElement><reference><qualifier>PR</qualifier><number>1</number></reference></referenceForDataElement>');
    expect(xml).not.toContain('<qualifier>PT</qualifier>');
  });

  it('still builds a PNR for travellers with no document at all', () => {
    const domestic = buildAddElementsBody({
      travelers: [{ firstName: 'A', lastName: 'B', gender: 'MALE', ptc: 'ADT' }],
      contact: {}, officeId: 'SCK1S2400',
    });

    expect(domestic).not.toContain('<segmentName>SSR</segmentName>');
    expect(domestic).toContain('<segmentName>NM</segmentName>');
  });
});

/**
 * FM — the commission element.
 *
 * With SSR DOCS accepted, issuance moved on to `374 CMC RJT : NEED COMMISSION`.
 * This office will not issue against a TST that does not state the agency's
 * commission. Zero is the right figure — the customer pays us through ARC Pay
 * and we settle the fare, so there is no airline commission to claim — but it
 * has to be said rather than left out.
 *
 * With both in place a real e-ticket issued on PDT: 220-7491174912, LH.
 */
describe('the commission element', () => {
  const xml = buildAddElementsBody({
    travelers: [{ firstName: 'A', lastName: 'B', gender: 'MALE', ptc: 'ADT' }],
    contact: {}, officeId: 'SCK1S2400',
  });

  it('is always present, because ticketing is refused without it', () => {
    expect(xml).toContain('<segmentName>FM</segmentName>');
  });

  it('claims zero by default, and says so explicitly', () => {
    expect(xml).toContain('<commission><passengerType>PAX</passengerType><indicator>P</indicator>'
      + '<commissionInfo><percentage>0</percentage></commissionInfo></commission>');
  });

  it('can carry a real percentage when an office earns one', () => {
    const paid = buildAddElementsBody({
      travelers: [{ firstName: 'A', lastName: 'B', gender: 'MALE', ptc: 'ADT' }],
      contact: {}, officeId: 'SCK1S2400', commissionPercent: 5,
    });

    expect(paid).toContain('<percentage>5</percentage>');
  });
});
