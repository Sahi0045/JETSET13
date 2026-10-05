/**
 * Filed fare rules made readable: a verdict, the fee the airline states, and
 * plain-English points for the rules a traveller acts on. Every point is
 * matched from the airline's own text; nothing is shown that the text does not
 * say, and the full text stays one click away.
 */

const POINTS = Object.freeze([
  [/REFUND PERMITTED WITHIN TICKET VALIDITY/, 'Refund available while the ticket is valid'],
  [/REFUND PERMITTED BEFORE DEPARTURE IN CASE OF\s+REJECTION OF VISA/, 'Refund before departure if your visa is refused (embassy statement needed)'],
  [/WAIVED FOR DEATH OF PASSENGER OR FAMILY MEMBER/, 'Fees waived if the passenger or a close family member dies'],
  [/REFUND OF UNUSED TAXES PAID TO THIRD PARTIES\s+PERMITTED/, 'Unused government taxes are refunded'],
  [/CHANGES NOT PERMITTED IN CASE OF NO[\s-]?SHOW/, 'No changes once a flight is missed (no-show)'],
  [/REROUTING PERMITTED/, 'Route changes allowed'],
  [/FARE DIFFERENCE WILL BE COLLECTED|CHARGE\s+THE FARE DIFFERENCE/, 'If the new fare costs more, you pay the difference'],
  [/WITHIN 24 HOURS AFTER CHANGE/, 'After a change, the new ticket must be issued within 24 hours'],
]);

const flat = (text) => String(text || '').toUpperCase().replace(/\s+/g, ' ');

const ALLOWED = /^(ANY TIME )?(CANCELL?ATIONS?|CHANGES?|REFUNDS?)( ARE)? PERMITTED/;
const DENIED = /^(CANCELL?ATIONS?|CHANGES?|REFUNDS?)( ARE)? NOT PERMITTED|^(TICKET|FARE) IS NON-?REFUNDABLE|^NON-?REFUNDABLE/;

const feesOf = (text) => {
  const fees = [];
  for (const match of flat(text).matchAll(/CHARGE ([A-Z]{3}) ?([\d,]+(?:\.\d+)?)/g)) {
    const amount = Number(match[2].replace(/,/g, ''));
    if (Number.isFinite(amount) && !fees.some((f) => f.currency === match[1] && f.amount === amount)) {
      fees.push({ currency: match[1], amount });
    }
  }
  return fees.slice(0, 3);
};

/**
 * The airline's verdict, from the lines where airlines state it. A refusal
 * beside a fee ("CHARGE USD 200 BEFORE DEPARTURE / NON-REFUNDABLE AFTER") is
 * neither allowed nor refused outright.
 */
const verdictOf = (text, fees) => {
  const lines = String(text || '').toUpperCase().split('\n').slice(0, 6).map((line) => line.trim());
  const allowed = lines.some((line) => ALLOWED.test(line));
  const denied = lines.some((line) => DENIED.test(line));
  if (allowed && !denied) return 'allowed';
  if (denied && !allowed && fees.length === 0) return 'notAllowed';
  return allowed || denied || fees.length > 0 ? 'conditional' : null;
};

/**
 * @param {{ title?: string, text?: string }} rule
 * @returns {{ verdict: 'allowed' | 'notAllowed' | 'conditional' | null, fees: Array<{ currency: string, amount: number }>, points: string[] }}
 */
export const summarizeRule = (rule) => {
  const text = flat(rule?.text);
  const fees = feesOf(rule?.text);
  return {
    verdict: verdictOf(rule?.text, fees),
    fees,
    points: POINTS.filter(([pattern]) => pattern.test(text)).map(([, point]) => point),
  };
};

const KEEP_UPPER = new Set(['ESTA', 'ETA', 'RBD', 'EMD', 'DCC', 'NUC', 'ROE', 'PNR', 'TST', 'USD', 'EUR', 'GBP', 'INR', 'NYC', 'FRA', 'JFK']);
const COMMON_SHORT = new Set(['AND', 'THE', 'FOR', 'ANY', 'NOT', 'ALL', 'ONE', 'TWO', 'PER', 'NEW', 'OLD']);
const SHORT_WORDS = new Set(['A', 'AN', 'AS', 'AT', 'BE', 'BY', 'DO', 'IF', 'IN', 'IS', 'IT', 'NO', 'OF', 'ON', 'OR', 'SO', 'TO', 'UP', 'WE']);

const keepsCase = (word) => {
  const core = word.replace(/[^A-Z0-9/]/g, '');
  if (!core) return false;
  if (/\d/.test(core) || KEEP_UPPER.has(core)) return true;
  if (core.includes('/')) {
    return core.split('/').every((part) => KEEP_UPPER.has(part)
      || (part.length > 0 && part.length <= 3 && !SHORT_WORDS.has(part) && !COMMON_SHORT.has(part)));
  }
  return core.length === 2 && !SHORT_WORDS.has(core);
};

const sentenceCase = (paragraph) => paragraph
  .split(' ')
  .map((word) => (keepsCase(word) ? word : word.toLowerCase()))
  .join(' ')
  .replace(/(^|[.!?]\s+)([a-z])/g, (_, lead, letter) => lead + letter.toUpperCase());

/** The airline's text as paragraphs in sentence case, airline and tax codes kept. */
export const readableRuleText = (text) => String(text || '')
  .split(/\n\s*\n/)
  .map((paragraph) => paragraph.split('\n').map((line) => line.trim()).filter(Boolean).join(' '))
  .filter(Boolean)
  .map(sentenceCase);
