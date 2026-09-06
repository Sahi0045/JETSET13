import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULE_SECTIONS,
  buildCheckRulesBody,
  readCheckRulesReply,
} from '../../../backend/services/amadeusSoap/operations/fareRules.js';

/**
 * Fare_CheckRules.
 *
 * This was believed impossible before a booking existed. The module said so at
 * length: CheckRules needed a TST inside a committed PNR, so the review page
 * could only ever show informative pricing's thin rule text, usually without
 * the penalty amounts.
 *
 * That was wrong, and how it was reached is worth remembering. An early probe
 * sent `itemNumber` referencing a TST STATELESSLY, got BAD SYNTAX, and blamed
 * the missing PNR. The missing thing was the session.
 *
 * Per Amadeus's "request fare rule category text" example, CheckRules follows a
 * Fare_InformativePricingWithoutPNR reply IN THE SAME SESSION, and `itemNumber`
 * addresses a fare component of that pricing. No PNR, no booking. Verified
 * against 1ASIWJETJEC PDT on DEL-BOM: section 16 returns 184 lines of
 * PE.PENALTIES, section 10 returns 26 of CO.COMBINABILITY.
 *
 * The old tests asserted the standalone shape and passed, which is how the
 * wrong conclusion survived.
 */

describe('buildCheckRulesBody', () => {
  it('emits its own root element with the operation namespace', () => {
    const xml = buildCheckRulesBody();

    // Without this the WSAP answers "Root tag not found" — the transport sends
    // bodyXml verbatim.
    expect(xml).toContain('<Fare_CheckRules xmlns="http://xml.amadeus.com/FARQNQ_07_1_1A">');
    expect(xml.trimEnd().endsWith('</Fare_CheckRules>')).toBe(true);
  });

  it('uses messageFunction 712, not messageFunctionCode', () => {
    const xml = buildCheckRulesBody();

    expect(xml).toContain('<messageFunction>712</messageFunction>');
    expect(xml).not.toContain('messageFunctionCode');
  });

  it('addresses a fare component of the preceding pricing', () => {
    // The bare `number` selects the pricing record; the FC-typed one selects
    // the fare component within it.
    const xml = buildCheckRulesBody({ fareComponent: 1 });

    expect(xml).toContain('<itemNumber><itemNumberDetails><number>1</number></itemNumberDetails>'
      + '<itemNumberDetails><number>1</number><type>FC</type></itemNumberDetails></itemNumber>');
  });

  it('can read the inbound half of a round trip', () => {
    // A round trip prices as two fare components; the return is number 2.
    const xml = buildCheckRulesBody({ fareComponent: 2 });

    expect(xml).toContain('<number>2</number><type>FC</type>');
  });

  it('never describes the fare itself, which is what the WSAP refused', () => {
    // transportInformation + tripDescription is the standalone shape that
    // returned CHECK FORMAT every time.
    const xml = buildCheckRulesBody();

    expect(xml).not.toContain('transportInformation');
    expect(xml).not.toContain('tripDescription');
  });

  it('asks with ruleSectionId, and defaults to penalties', () => {
    // Request says ruleSectionId; the REPLY answers with ruleSectionLocalId and
    // ruleCategoryCode. Both halves were half-right before.
    expect(buildCheckRulesBody()).toContain(`<ruleSectionId>${DEFAULT_RULE_SECTIONS[0]}</ruleSectionId>`);
    expect(DEFAULT_RULE_SECTIONS).toContain('16');
  });
});

describe('readCheckRulesReply', () => {
  it('reads the text out of fareRuleText entries, which are objects', () => {
    // Each entry is {freeTextQualification, freeText}. Reading the entry
    // itself yielded nothing and threw away all 184 lines of a penalties
    // section.
    const parsed = readCheckRulesReply({
      tariffInfo: [{
        fareRuleInfo: { ruleSectionLocalId: '1', ruleCategoryCode: '(16)' },
        fareRuleText: [
          { freeTextQualification: { textSubjectQualifier: '3', informationType: 'CAT' }, freeText: 'PE.PENALTIES' },
          { freeTextQualification: { textSubjectQualifier: '3' }, freeText: 'CANCELLATION CHARGE INR 3000' },
        ],
      }],
    });

    expect(parsed.error).toBeNull();
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0].text).toContain('CANCELLATION CHARGE INR 3000');
    expect(parsed.sections[0].text.split('\n')).toHaveLength(2);
  });

  it('identifies the section by ruleCategoryCode, unparenthesised', () => {
    const parsed = readCheckRulesReply({
      tariffInfo: [{
        fareRuleInfo: { ruleSectionLocalId: '1', ruleCategoryCode: '(16)' },
        fareRuleText: [{ freeText: 'PE.PENALTIES' }],
      }],
    });

    expect(parsed.sections[0].code).toBe('16');
  });

  it('surfaces a business rejection instead of pretending there are no rules', () => {
    // Reading a refusal as "no rules" renders an empty, confident-looking
    // policy panel.
    const parsed = readCheckRulesReply({
      errorInfo: { rejectErrorCode: { errorDetails: { errorCode: 'CHECK FORMAT' } } },
    });

    expect(parsed.sections).toEqual([]);
    expect(parsed.error).toMatch(/CHECK FORMAT/);
  });

  it('drops placeholder sections that carry no rule', () => {
    const parsed = readCheckRulesReply({
      tariffInfo: [
        { fareRuleInfo: { ruleCategoryCode: '(16)' }, fareRuleText: [{ freeText: 'NO RULE DATA' }] },
        { fareRuleInfo: { ruleCategoryCode: '(10)' }, fareRuleText: [] },
        { fareRuleInfo: { ruleCategoryCode: '(23)' }, fareRuleText: [{ freeText: 'CHILD DISCOUNT 25 PCT' }] },
      ],
    });

    expect(parsed.sections.map((s) => s.code)).toEqual(['23']);
  });

  it('returns an empty result rather than throwing on an empty reply', () => {
    expect(readCheckRulesReply({})).toEqual({ sections: [], error: null });
    expect(readCheckRulesReply(undefined)).toEqual({ sections: [], error: null });
  });
});
