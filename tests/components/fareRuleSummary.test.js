import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ruleBlocks } from '../../backend/services/amadeusSoap/operations/fareRules.js';
import { readableRuleText, summarizeRule } from '../../frontend/src/utils/fareRuleSummary.js';

/**
 * The fare rules a traveller reads, from Lufthansa's own text (LH4462 FRA-JFK,
 * ECOFLEX, PDT, 5 Oct 2026): a verdict, the points they act on, and the text in
 * sentence case. Nothing the text does not say.
 */

const [cancellations, changes] = ruleBlocks(readFileSync(path.resolve('tests/fixtures/amadeus/fare-rules-lh-ecoflex.txt'), 'utf8'));

describe('a rule block', () => {
  it('takes its verdict from the airline\'s own line', () => {
    expect(summarizeRule(cancellations).verdict).toBe('allowed');
    expect(summarizeRule(changes).verdict).toBe('allowed');
    expect(summarizeRule({ text: 'TICKET IS NON-REFUNDABLE.' }).verdict).toBe('notAllowed');
    expect(summarizeRule({ text: 'SOME TEXT WITH NO VERDICT' }).verdict).toBeNull();
  });

  // "ANY ORIGINAL NON-REFUNDABLE AMOUNT FROM A PREVIOUS TICKET REMAINS NON
  // REFUNDABLE" is deep in a refundable fare's rules, and is not its verdict.
  it('is not called non-refundable for a sentence about something else', () => {
    expect(cancellations.text).toMatch(/NON-REFUNDABLE/);
    expect(summarizeRule(cancellations).verdict).toBe('allowed');
  });

  it('lists only points the text states', () => {
    expect(summarizeRule(cancellations).points).toEqual([
      'Refund available while the ticket is valid',
      'Refund before departure if your visa is refused (embassy statement needed)',
      'Fees waived if the passenger or a close family member dies',
      'Unused government taxes are refunded',
    ]);
    expect(summarizeRule(changes).points).toContain('No changes once a flight is missed (no-show)');
    expect(summarizeRule({ text: 'CHANGES PERMITTED.' }).points).toEqual([]);
  });

  it('reads every fee the airline states, and none it does not', () => {
    expect(summarizeRule({ text: 'CHANGES PERMITTED.\nBEFORE DEPARTURE CHARGE EUR 70.00\nAFTER DEPARTURE CHARGE EUR 150.00' }).fees)
      .toEqual([{ currency: 'EUR', amount: 70 }, { currency: 'EUR', amount: 150 }]);
    expect(summarizeRule(changes).fees).toEqual([]);
  });

  // Cancelling before departure is allowed for a fee; after it, it is not.
  it('is neither allowed nor refused when a fee and a refusal stand together', () => {
    const rule = { text: 'BEFORE DEPARTURE\nCHARGE USD 200 FOR CANCEL/REFUND\nAFTER DEPARTURE\nTICKET IS NON-REFUNDABLE' };

    expect(summarizeRule(rule).verdict).toBe('conditional');
  });

  it('is shown in sentence case, keeping airline and tax codes', () => {
    const text = readableRuleText(cancellations.text).join(' ');

    expect(text).toContain('Refund permitted before departure in case of rejection of visa.');
    expect(text).toContain('ESTA/ETA');
    expect(text).toContain('LH/LX/OS/SN DCC');
    expect(text).toContain('RBD');
  });
});
