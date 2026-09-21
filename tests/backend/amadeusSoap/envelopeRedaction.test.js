import { describe, expect, it } from 'vitest';
import { redactEnvelope } from '../../../backend/services/amadeusSoap/xml.js';
import { buildAddElementsBody } from '../../../backend/services/amadeusSoap/operations/pnr.js';

/**
 * redactEnvelope promises that no caller "can leak a password or a passport by
 * forgetting to redact". The passport is not in travellerInfo, which it blanks:
 * it rides in SSR DOCS and SSR FOID free text (the certification request
 * 9-Ticket-2ADT-1CH-1INF/03-PNR_AddMultiElements carried
 * `<freetext>P/GBR/X1234567/GBR/12APR88/M/25DEC30/...`), and those went to the
 * envelope log whole.
 */

const travelers = [{
  firstName: 'JOHN', lastName: 'CERTTWO', gender: 'MALE', dateOfBirth: '1988-04-12', ptc: 'ADT',
  documents: [{ documentType: 'PASSPORT', number: 'X9988776', nationality: 'GB', issuanceCountry: 'GB', expiryDate: '2030-12-25' }],
}];

const body = () => buildAddElementsBody({
  travelers, contact: { email: 'john@example.com', phone: '15555550100' }, bookingReference: 'FLTREF', officeId: 'SCK1S2400',
});

describe('an envelope on its way to a log', () => {
  it('carries no passport number, date of birth or contact detail from an SSR', () => {
    const raw = body();
    // The request really does carry them before redaction.
    expect(raw).toContain('X9988776');

    const logged = redactEnvelope(raw);

    expect(logged).not.toContain('X9988776');
    expect(logged).not.toContain('12APR88');
    expect(logged).not.toContain('JOHN//EXAMPLE.COM');
  });

  it('keeps the element types, so the log still shows what was sent', () => {
    expect(redactEnvelope(body())).toContain('<segmentName>SSR</segmentName>');
  });
});
