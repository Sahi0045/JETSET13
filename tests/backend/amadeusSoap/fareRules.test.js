import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULE_SECTIONS,
  buildCheckRulesBody,
  readCheckRulesReply,
} from '../../../backend/services/amadeusSoap/operations/fareRules.js';

/**
 * Fare_CheckRules.
 *
 * The element names here come from Fare_CheckRules_07_1_1A.xsd, and two of them
 * contradict the migration plan: the rule section is `ruleSectionId` (the plan
 * says `ruleSectionLocalId`) and the function goes in `messageFunction` (the
 * plan says `messageFunctionCode`). Both were verified against the live WSAP —
 * a wrong element name comes back as "CHECK FORMAT" without naming the field,
 * so these assertions are the only cheap way to keep them right.
 */

const BASE = {
  carrier: 'AI',
  flightNumber: '9486',
  bookingClass: 'X',
  origin: 'DEL',
  destination: 'BOM',
  departDate: '151126',
};

describe('buildCheckRulesBody', () => {
  it('emits its own root element with the operation namespace', () => {
    const xml = buildCheckRulesBody(BASE);

    // Without this the WSAP answers "Serializing/Deserializing error ...
    // Root tag not found" — the transport sends bodyXml verbatim.
    expect(xml).toContain('<Fare_CheckRules xmlns="http://xml.amadeus.com/FARQNQ_07_1_1A">');
    expect(xml.trimEnd().endsWith('</Fare_CheckRules>')).toBe(true);
  });

  it('uses messageFunction 712, not messageFunctionCode', () => {
    const xml = buildCheckRulesBody(BASE);

    expect(xml).toContain('<messageFunction>712</messageFunction>');
    expect(xml).not.toContain('messageFunctionCode');
  });

  it('names rule sections ruleSectionId, not ruleSectionLocalId', () => {
    const xml = buildCheckRulesBody(BASE);

    for (const section of DEFAULT_RULE_SECTIONS) {
      expect(xml).toContain(`<ruleSectionId>${section}</ruleSectionId>`);
    }
    expect(xml).not.toContain('ruleSectionLocalId');
  });

  it('keeps the root sequence in XSD order', () => {
    const xml = buildCheckRulesBody(BASE);
    const order = ['msgType', 'transportInformation', 'tripDescription', 'fareRule']
      .map((name) => xml.indexOf(`<${name}>`));

    // Schema validation rejects a reordered body and does not say which element
    // is at fault, so ordering is worth asserting rather than eyeballing.
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i > -1)).toBe(true);
  });

  it('carries the carrier, flight, class, route and date', () => {
    const xml = buildCheckRulesBody(BASE);

    expect(xml).toContain('<marketingCompany>AI</marketingCompany>');
    expect(xml).toContain('<flightNumber>9486</flightNumber>');
    expect(xml).toContain('<designator>X</designator>');
    expect(xml).toContain('<origin>DEL</origin>');
    expect(xml).toContain('<destination>BOM</destination>');
    expect(xml).toContain('<date>151126</date>');
  });

  it('omits optional blocks rather than sending them empty', () => {
    const xml = buildCheckRulesBody({ carrier: 'AI', origin: 'DEL', destination: 'BOM' });

    expect(xml).not.toContain('productIdentificationDetails');
    expect(xml).not.toContain('availCabinConf');
    expect(xml).not.toContain('dateFlightMovement');
    expect(xml).toContain('<origin>DEL</origin>');
  });

  it('refuses to build without the fields the operation cannot work without', () => {
    expect(() => buildCheckRulesBody({ origin: 'DEL', destination: 'BOM' })).toThrow(/carrier/i);
    expect(() => buildCheckRulesBody({ carrier: 'AI', origin: 'DEL' })).toThrow(/origin and destination/i);
  });
});

describe('readCheckRulesReply', () => {
  it('reads rule sections and their text', () => {
    const parsed = readCheckRulesReply({
      tariffInfo: [
        {
          fareRuleInfo: { ruleSectionId: 'PE' },
          fareRuleText: ['CANCELLATION CHARGE INR 3000', 'CHANGE CHARGE INR 2500'],
        },
      ],
    });

    expect(parsed.error).toBeNull();
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0].code).toBe('PE');
    expect(parsed.sections[0].text).toContain('CANCELLATION CHARGE INR 3000');
    // Joined with newlines so the route's scraper sees each filed line.
    expect(parsed.sections[0].text.split('\n')).toHaveLength(2);
  });

  it('surfaces a business rejection instead of pretending there are no rules', () => {
    // This is the live answer for a standalone request on this office. Reading
    // it as "no rules" would render an empty, confident-looking policy panel.
    const parsed = readCheckRulesReply({
      errorInfo: { rejectErrorCode: { errorDetails: { errorCode: 'CHECK FORMAT' } } },
    });

    expect(parsed.sections).toEqual([]);
    expect(parsed.error).toMatch(/CHECK FORMAT/);
  });

  it('prefers the airline free text when the rejection carries one', () => {
    const parsed = readCheckRulesReply({
      errorInfo: {
        rejectErrorCode: { errorDetails: { errorCode: '123' } },
        errorFreeText: { freeText: 'NO FARE FOUND FOR REQUESTED ROUTE' },
      },
    });

    expect(parsed.error).toBe('NO FARE FOUND FOR REQUESTED ROUTE');
  });

  it('drops placeholder sections that carry no rule', () => {
    const parsed = readCheckRulesReply({
      tariffInfo: [
        { fareRuleInfo: { ruleSectionId: 'PE' }, fareRuleText: 'NO RULE DATA' },
        { fareRuleInfo: { ruleSectionId: 'AP' }, fareRuleText: '' },
        { fareRuleInfo: { ruleSectionId: 'CD' }, fareRuleText: 'CHILD DISCOUNT 25 PCT' },
      ],
    });

    expect(parsed.sections.map((s) => s.code)).toEqual(['CD']);
  });

  it('includes free text filed outside a section', () => {
    const parsed = readCheckRulesReply({
      infoText: [{ freeText: ['FARE VALID FOR 12 MONTHS'] }],
    });

    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0].text).toBe('FARE VALID FOR 12 MONTHS');
  });

  it('returns an empty result rather than throwing on an empty reply', () => {
    expect(readCheckRulesReply({})).toEqual({ sections: [], error: null });
    expect(readCheckRulesReply(undefined)).toEqual({ sections: [], error: null });
  });
});
