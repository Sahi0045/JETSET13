import { describe, expect, it } from 'vitest';
import { readRecordLocator } from '../../../backend/services/amadeusSoap/mappers/flightOrder.js';
import { buildAddElementsBody, buildIgnoreBody } from '../../../backend/services/amadeusSoap/operations/pnr.js';
import {
  buildContactEmailFreetext, buildContactPhoneFreetext, buildDocsFreetext, buildFoidFreetext,
} from '../../../backend/services/amadeusSoap/operations/travelDocs.js';
import { ERROR_CATALOGUE } from '../../../backend/services/amadeusSoap/codes.js';
import { touchesUnitedStates } from '../../../backend/utils/itinerary.js';
import { bookingTravellerProblems, needsDateOfBirth } from '../../../shared/travellerDetails.js';

/**
 * Fixes from the 15 Sep 2026 test of every airline on the PDT ticketing list,
 * each reproduced on PDT before it was changed (docs/audits/2026-09-15-pdt-airline-sweep.md).
 */

const passport = { documentType: 'PASSPORT', number: 'X3300055', nationality: 'US', issuanceCountry: 'US', expiryDate: '2033-01-01' };
const adult = (extra = {}) => ({ firstName: 'Proof', lastName: 'Domestic', gender: 'MALE', ptc: 'ADULT', ...extra });
const contact = { email: 'proof_test-x@example.com', phone: '+1 212 555 0100' };

describe('the record locator of a commit that also carries the airline locator', () => {
  // Asiana's commit answered a pnrHeader pair; read as one object it gave no
  // locator, and a PNR that existed was treated as a failed commit.
  it("reads Amadeus's own locator from a repeating pnrHeader", () => {
    const header = [
      { reservationInfo: { reservation: { companyId: 'OZ', controlNumber: '0243-3166', controlType: 'I' } } },
      { reservationInfo: { reservation: { companyId: '1A', controlNumber: 'BA67KD', date: '150926' } } },
    ];
    expect(readRecordLocator({ pnrHeader: header })).toBe('BA67KD');
  });

  it('still reads a single pnrHeader', () => {
    expect(readRecordLocator({ pnrHeader: { reservationInfo: { reservation: { companyId: '1A', controlNumber: 'ABC123' } } } })).toBe('ABC123');
  });
});

describe('ignoring a refused change', () => {
  it('asks to ignore and retrieve (optionCode 21)', () => {
    expect(buildIgnoreBody()).toContain('<pnrActions><optionCode>21</optionCode></pnrActions>');
  });
});

describe('passenger contact and identification on the PNR', () => {
  const xml = buildAddElementsBody({ travelers: [adult({ dateOfBirth: '1986-06-06', documents: [passport] })], contact, officeId: 'SCK1S2400' });
  const ssr = (type, freetext) => `<ssr><type>${type}</type><status>HK</status><quantity>1</quantity><companyId>YY</companyId><freetext>${freetext}</freetext></ssr>`
    + '</serviceRequest><referenceForDataElement><reference><qualifier>PR</qualifier><number>1</number></reference></referenceForDataElement>';

  // Arajet refused the ticket without CTCE/CTCM, and Arajet and Sky Airline
  // without FOID (10609); all three issued once these were on the PNR.
  it('sends the email as SSR CTCE in IATA encoding', () => {
    expect(xml).toContain(ssr('CTCE', 'PROOF..TEST./X//EXAMPLE.COM'));
  });

  it('sends the mobile as SSR CTCM digits', () => {
    expect(xml).toContain(ssr('CTCM', '12125550100'));
  });

  it('sends the passport as SSR FOID', () => {
    expect(xml).toContain(ssr('FOID', 'PPX3300055'));
  });

  it('sends no FOID for a traveller without a passport', () => {
    const domestic = buildAddElementsBody({ travelers: [adult()], contact, officeId: 'SCK1S2400' });
    expect(domestic).not.toContain('<type>FOID</type>');
    expect(domestic).toContain('<type>CTCE</type>');
  });

  it('encodes only what IATA allows', () => {
    expect(buildContactEmailFreetext('not an email')).toBeNull();
    expect(buildContactPhoneFreetext('12')).toBeNull();
    expect(buildFoidFreetext({ documents: [{ ...passport, documentType: 'ID_CARD' }] })).toBeNull();
  });
});

describe('Secure Flight: a US flight with no passport', () => {
  // American Airlines JFK-LAX refused the ticket (27791 SSR DOCS MISSING) and
  // issued with name, date of birth and gender only.
  it('sends DOCS with date of birth and gender when the itinerary touches the US', () => {
    const xml = buildAddElementsBody({ travelers: [adult({ dateOfBirth: '1990-01-15' })], contact, officeId: 'SCK1S2400', secureFlight: true });
    expect(xml).toContain('<type>DOCS</type><status>HK</status><quantity>1</quantity><companyId>YY</companyId><freetext>////15JAN90/M//DOMESTIC/PROOF</freetext>');
  });

  it('sends no DOCS without a passport outside the US', () => {
    const xml = buildAddElementsBody({ travelers: [adult({ dateOfBirth: '1990-01-15' })], contact, officeId: 'SCK1S2400' });
    expect(xml).not.toContain('<type>DOCS</type>');
    expect(buildDocsFreetext(adult({ dateOfBirth: '1990-01-15' }))).toBeNull();
  });

  it('knows which itineraries touch the US and its territories', () => {
    const offer = (...pairs) => ({ itineraries: [{ segments: pairs.map(([from, to]) => ({ departure: { iataCode: from }, arrival: { iataCode: to } })) }] });
    expect(touchesUnitedStates(offer(['JFK', 'LAX']))).toBe(true);
    expect(touchesUnitedStates(offer(['LHR', 'JFK']))).toBe(true);
    expect(touchesUnitedStates(offer(['SJU', 'STT']))).toBe(true);
    expect(touchesUnitedStates(offer(['DEL', 'BOM']))).toBe(false);
    expect(touchesUnitedStates(offer(['DEL', 'LHR']))).toBe(false);
  });

  it('asks every traveller on a US flight for a date of birth, domestic or not', () => {
    expect(needsDateOfBirth({ type: 'ADULT', international: false })).toBe(false);
    expect(needsDateOfBirth({ type: 'ADULT', international: false, secureFlight: true })).toBe(true);
    expect(bookingTravellerProblems(adult({ gender: 'male' }), { type: 'ADULT', international: false, secureFlight: true }))
      .toContain('Enter the date of birth.');
  });
});

describe('a class that can no longer be priced', () => {
  // 911 NO FARE FOR BOOKING CODE: a reason to search again, not an outage.
  it('is a 409 refusal, not a 502', () => {
    const text = '911 NO FARE FOR BOOKING CODE-TRY OTHER PRICING OPTIONS';
    const rule = ERROR_CATALOGUE.find((entry) => entry.match.test(text));
    expect(rule).toMatchObject({ code: 409 });
  });
});
