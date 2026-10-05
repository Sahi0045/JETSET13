import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ruleBlocks } from '../../../backend/services/amadeusSoap/operations/fareRules.js';

/**
 * Filed fare rules as the airline headed them.
 *
 * The fixture is Lufthansa's category 16 for LH4462 FRA-JFK in ECOFLEX, read
 * with Fare_CheckRules on PDT on 5 Oct 2026: 138 lines under CANCELLATIONS and
 * CHANGES. Each line used to become its own entry, and the review page showed
 * the first eight as panels titled "Penalties" or "Information".
 */

const lufthansa = readFileSync(new URL('../../fixtures/amadeus/fare-rules-lh-ecoflex.txt', import.meta.url), 'utf8');

describe('filed rule text', () => {
  it('is one block per heading the airline wrote, not one per line', () => {
    expect(ruleBlocks(lufthansa).map((b) => b.title)).toEqual(['CANCELLATIONS', 'CHANGES']);
  });

  it('keeps each block whole, with its paragraphs', () => {
    const [cancellations, changes] = ruleBlocks(lufthansa);

    expect(cancellations.text.startsWith('ANY TIME\nCANCELLATIONS PERMITTED.')).toBe(true);
    expect(cancellations.text).toContain('REFUND PERMITTED WITHIN TICKET VALIDITY.');
    expect(changes.text).toContain('CHANGES NOT PERMITTED IN CASE OF NO SHOW.');
    expect(cancellations.text).toContain('\n\n');
  });

  it('drops the section title and the dashed separators', () => {
    const all = ruleBlocks(lufthansa).map((b) => b.text).join('\n');

    expect(all).not.toContain('PE.PENALTIES');
    expect(all).not.toMatch(/-{5,}/);
  });

  it('keeps unheaded text together under one title', () => {
    expect(ruleBlocks('NON-REFUNDABLE FARE\nCHANGE FEE USD 100')).toEqual([
      { title: 'PENALTIES', text: 'NON-REFUNDABLE FARE\nCHANGE FEE USD 100' },
    ]);
  });
});
