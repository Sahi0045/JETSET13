import { OPERATIONS } from '../codes.js';
import { arr, at, atTxt, txt } from '../parseXml.js';
import { el, wrap } from '../xml.js';

/**
 * Fare_CheckRules — the airline's filed fare conditions.
 *
 * Informative pricing returns some rule text, and that is what `/fare-rules`
 * shipped with. It is thin: a few lines, usually without the penalty amounts.
 * CheckRules returns the filed rule sections, which is where the cancellation
 * and change fees actually live.
 *
 * This module previously concluded that CheckRules needed a TST inside a
 * committed PNR, and that a customer on the review page could therefore never
 * see filed penalties. That was wrong, and the reasoning is worth keeping so
 * nobody repeats it: the earlier probe tried `itemNumber` referencing a TST,
 * sent STATELESSLY, and got BAD SYNTAX — then concluded the problem was the
 * missing PNR rather than the missing session.
 *
 * What it actually needs, per Amadeus's "request fare rule category text"
 * example, is a Fare_InformativePricingWithoutPNR reply EARLIER IN THE SAME
 * SESSION. `itemNumber` then addresses a fare component of that pricing, not a
 * TST. No PNR, no booking, nothing committed.
 *
 * Verified against 1ASIWJETJEC PDT, DEL-BOM:
 *
 *   informative pricing, then CheckRules FC 1, section 16  -> 184 lines of
 *                                                             PE.PENALTIES
 *   the same for section 10                                -> 26 lines of
 *                                                             CO.COMBINABILITY
 *
 * Request and reply disagree about the element name, which is why both halves
 * were half-right before. The REQUEST asks with `ruleSectionId`. The REPLY
 * answers with `ruleSectionLocalId` and `ruleCategoryCode`.
 */

/**
 * Rule sections worth asking for.
 *
 * 16 is penalties — cancellation and change fees, the reason this call exists.
 * Amadeus accepts both the numeric category and its letter code; the numbers
 * are what its own examples use.
 *
 * Asking for everything returns pages of filed tariff nobody reads, and each
 * section is a separate round trip inside the session.
 */
export const DEFAULT_RULE_SECTIONS = ['16'];

/** '712' = "rules requested for a fare", per the message-function catalogue. */
const MESSAGE_FUNCTION = '712';

/**
 * @param {object} [p]
 * @param {number|string} [p.fareComponent=1] which fare component of the
 *   preceding informative pricing to read rules for. A round trip prices as
 *   two: outbound is 1, inbound is 2.
 * @param {string} [p.ruleSection='16'] category to read.
 */
export const buildCheckRulesBody = ({ fareComponent = 1, ruleSection = '16' } = {}) => {
  const body = [
    wrap('msgType', wrap('messageFunctionDetails', el('messageFunction', MESSAGE_FUNCTION))),

    // Addresses the fare component of the pricing already done in this
    // session. The bare `number` selects the pricing record; the `FC`-typed
    // one selects the fare component within it.
    wrap('itemNumber', [
      wrap('itemNumberDetails', el('number', '1')),
      wrap('itemNumberDetails', [
        el('number', String(fareComponent)),
        el('type', 'FC'),
      ]),
    ]),

    wrap('fareRule', wrap('tarifFareRule', el('ruleSectionId', String(ruleSection)))),
  ].join('');

  // The builder emits its own root element: the transport sends bodyXml
  // verbatim, so without this the WSAP answers "Root tag not found".
  const ns = OPERATIONS.Fare_CheckRules.namespace;
  return `    <Fare_CheckRules xmlns="${ns}">${body}</Fare_CheckRules>`;
};

/** Sections Amadeus returns that carry no rule text worth showing. */
const isNoise = (text) => !text || /^\s*$/.test(text) || /^NO\s+(RULE|DATA)/i.test(text);

/**
 * Read the rule text back.
 *
 * `tariffInfo[]` holds one entry per requested section. Each carries
 * `fareRuleText[]`, and every entry there is an OBJECT — `{freeTextQualification,
 * freeText}` — not a string. Reading the entry itself yielded nothing and threw
 * away all 184 lines of a penalties section; the text is in `.freeText`.
 *
 * The section is identified by `ruleCategoryCode`, which comes back
 * parenthesised as "(16)".
 *
 * @returns {{sections: Array<{code: string|null, text: string}>, error: string|null}}
 */
export const readCheckRulesReply = (reply) => {
  const rejectCode = atTxt(reply, 'errorInfo.rejectErrorCode.errorDetails.errorCode')
    || atTxt(reply, 'errorInfo.rejectErrorCode');
  if (rejectCode) {
    const detail = arr(at(reply, 'errorInfo.errorFreeText.freeText')).map(txt).filter(Boolean).join(' ');
    return { sections: [], error: detail || `Fare_CheckRules rejected: ${rejectCode}` };
  }

  const sections = [];

  for (const info of arr(reply?.tariffInfo)) {
    const code = (atTxt(info, 'fareRuleInfo.ruleCategoryCode') || '').replace(/[()]/g, '')
      || atTxt(info, 'fareRuleInfo.ruleSectionLocalId')
      || null;

    const text = arr(info.fareRuleText)
      .map((entry) => txt(entry?.freeText ?? entry))
      .filter(Boolean)
      .join('\n');

    if (!isNoise(text)) sections.push({ code, text });
  }

  for (const info of arr(reply?.infoText)) {
    const text = arr(info.freeText).map(txt).filter(Boolean).join('\n');
    if (!isNoise(text)) sections.push({ code: atTxt(info, 'freeTextQualification.textSubjectQualifier') || null, text });
  }

  return { sections, error: null };
};
