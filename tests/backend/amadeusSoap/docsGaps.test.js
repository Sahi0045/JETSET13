import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A traveller whose SSR DOCS could not be written was dropped without a word.
 *
 * Whatever the reason - one unusable passport field, an empty nationality where
 * the issuing country was known, a document too long for the element - the
 * PNR committed with no DOCS for that traveller, and the first anyone heard of
 * it was `27791 TICKETING INHIBITED-SSR DOCS MISSING FOR P1` at issuance, after
 * the charge. These pin what is sent instead, and that the gap is said out loud.
 */

const logged = [];
vi.mock('../../../backend/services/logger.js', () => {
  const record = (level) => (obj, msg) => logged.push({ level, obj, msg });
  const logger = {
    error: record('error'), warn: record('warn'), info: record('info'), debug: record('debug'),
    child: () => logger,
  };
  return { logger, default: logger };
});

let buildDocsFreetext;
let buildAddElementsBody;

beforeEach(async () => {
  logged.length = 0;
  vi.resetModules();
  ({ buildDocsFreetext } = await import('../../../backend/services/amadeusSoap/operations/travelDocs.js'));
  ({ buildAddElementsBody } = await import('../../../backend/services/amadeusSoap/operations/pnr.js'));
});

const passport = {
  documentType: 'PASSPORT', number: 'X1234567', nationality: 'GB', issuanceCountry: 'GB', expiryDate: '2030-12-25',
};
const traveler = (doc = passport, extra = {}) => ({
  firstName: 'LOCAL', lastName: 'TESTER', gender: 'MALE', dateOfBirth: '1990-01-01', ptc: 'ADT', documents: [doc], ...extra,
});
const docsIn = (xml) => [...xml.matchAll(/<type>DOCS<\/type>[\s\S]*?<\/ssr>/g)].map(([element]) => element);

describe('a Secure Flight itinerary with a passport that cannot be written', () => {
  // The fallback American Airlines JFK-LAX issued against (PDT, 15 Sep 2026)
  // was used only when there was NO passport. A passport with one bad field
  // lost the fallback too, and the ticket was refused 27791.
  it('still gets the name, date of birth and gender DOCS', () => {
    const noExpiry = { ...passport, expiryDate: '25/12/2030' };
    expect(buildDocsFreetext(traveler(noExpiry), { withoutDocument: true })).toBe('////01JAN90/M//TESTER/LOCAL');
    expect(buildDocsFreetext(traveler({ ...passport, nationality: 'Britain', issuanceCountry: 'Britain' }), { withoutDocument: true }))
      .toBe('////01JAN90/M//TESTER/LOCAL');
  });

  it('is still refused a partial document away from the United States', () => {
    expect(buildDocsFreetext(traveler({ ...passport, expiryDate: '25/12/2030' }))).toBeNull();
  });
});

describe('a passport with only one of its two countries', () => {
  // The order route writes absent countries as '' (flight.routes.js), and
  // `'' ?? 'GB'` is '': the fallback between the two never fired.
  it('reads the issuing country when the nationality is empty', () => {
    expect(buildDocsFreetext(traveler({ ...passport, nationality: '' })))
      .toBe('P/GBR/X1234567/GBR/01JAN90/M/25DEC30/TESTER/LOCAL/H');
  });

  it('and the nationality when the issuing country is empty', () => {
    expect(buildDocsFreetext(traveler({ ...passport, issuanceCountry: '' })))
      .toBe('P/GBR/X1234567/GBR/01JAN90/M/25DEC30/TESTER/LOCAL/H');
  });
});

describe('a document longer than the element holds', () => {
  // freetext repeats at most twice at 70 characters (PNR_AddMultiElements XSD),
  // and the 71st to 140th went into the second - anything after was cut off,
  // given names and the /H holder mark with it: an APIS record that does not
  // match the passport, which is worse than none.
  const longNames = traveler(passport, { lastName: 'A'.repeat(60), firstName: 'B'.repeat(60) });

  it('is not sent cut short', () => {
    expect(buildDocsFreetext(longNames)).toBeNull();

    const xml = buildAddElementsBody({ travelers: [longNames], contact: {}, officeId: 'SCK1S2400' });
    expect(docsIn(xml)).toHaveLength(0);
  });

  it('falls back to the Secure Flight DOCS when that one fits', () => {
    const xml = buildAddElementsBody({ travelers: [longNames], contact: {}, officeId: 'SCK1S2400', secureFlight: true });
    expect(docsIn(xml)).toHaveLength(1);
    expect(docsIn(xml)[0]).toContain(`////01JAN90/M//${'A'.repeat(55)}`);
  });
});

describe('saying so when a traveller gets no document', () => {
  it('names the passenger and the unusable field, never the document number', () => {
    const xml = buildAddElementsBody({
      travelers: [traveler(), traveler({ ...passport, number: 'Y7654321', expiryDate: '' }, { firstName: 'OTHER' })],
      contact: {},
      officeId: 'SCK1S2400',
    });

    expect(docsIn(xml)).toHaveLength(1);
    const warning = logged.find((entry) => entry.level === 'warn' && /DOCS/.test(entry.msg));
    expect(warning?.obj).toMatchObject({ paxNumber: 2, fields: ['expiryDate'] });
    expect(JSON.stringify(logged)).not.toContain('Y7654321');
  });

  it('stays quiet for a domestic traveller who gave no document', () => {
    buildAddElementsBody({
      travelers: [{ firstName: 'A', lastName: 'B', gender: 'MALE', ptc: 'ADT' }], contact: {}, officeId: 'SCK1S2400',
    });
    expect(logged.filter((entry) => entry.level === 'warn')).toHaveLength(0);
  });
});
