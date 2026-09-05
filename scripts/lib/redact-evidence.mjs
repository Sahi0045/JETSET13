/**
 * Redaction for recorded Amadeus request/reply pairs.
 *
 * This is deliberately not the runtime logger's `redactEnvelope`. That one
 * blanks whole `travellerInfo` and `passengerData` subtrees, which is exactly
 * right for a log sink and exactly wrong here: a certification reviewer is
 * checking the *shape* of the name element, so removing the element defeats
 * the purpose of recording it.
 *
 * The rule is therefore: keep every element, destroy every value that
 * identifies a person or authenticates us.
 *
 *   credentials          blanked outright
 *   session identifiers  pseudonymised, consistently within a run, so the flow
 *                        from Start through InSeries to End stays readable
 *   traveller values     replaced with fixed stand-ins
 *   contact details      masked by ELEMENT ROLE, not by pattern
 *
 * That last point is the one worth explaining. Phone and email travel as free
 * text in `dataElementsIndiv`, in the same element type as the RF and RM
 * entries — the reconciliation trail a reviewer wants to see intact. An
 * earlier version masked any long digit run in any free text and turned the
 * RM element `ARC REC-1788616…` into `ARC REC-5555550100`, which reads as a
 * phone number leaking into the reconciliation reference. So contact details
 * are now found by their AP / APE segment name and masked only there.
 */

/** Elements whose text is replaced wholesale. */
const TRAVELLER_VALUES = Object.freeze({
  surname: 'TESTSURNAME',
  firstName: 'TESTGIVEN MR',
  // Amadeus echoes the given name back as `givenName` in PNR replies, not as
  // `firstName`. Missing it leaked a real given name into recorded evidence.
  givenName: 'TESTGIVEN MR',
  dateOfBirth: '01011990',
  birthDate: '01011990',
  documentNumber: 'X0000000',
});

/** Credentials. Blanked, never pseudonymised. */
const SECRETS = Object.freeze(['Password', 'Nonce', 'SecurityToken']);

const REDACTED = '[REDACTED]';

/** Replace an element's text content, keeping the element and its attributes. */
const setText = (xml, tag, value) =>
  xml.replace(
    new RegExp(`(<(?:\\w+:)?${tag}(?:\\s[^>]*)?>)[\\s\\S]*?(</(?:\\w+:)?${tag}>)`, 'gi'),
    `$1${value}$2`,
  );

/**
 * Mask contact details inside the PNR elements that carry them.
 *
 * AP is the phone element and APE the email one. Both appear as
 * `dataElementsIndiv` blocks whose `segmentName` names the type, in the
 * request we build and in the reply Amadeus echoes. Everything else —
 * RF, RM, TK — is left exactly as sent.
 */
const maskContactElements = (xml) =>
  xml.replace(/<dataElementsIndiv>[\s\S]*?<\/dataElementsIndiv>/gi, (block) => {
    const segment = block.match(/<segmentName>([^<]*)<\/segmentName>/i)?.[1];
    if (segment !== 'AP' && segment !== 'APE') return block;

    const replacement = segment === 'APE' ? 'traveller@example.com' : '5555550100';
    return block.replace(
      /(<(?:\w+:)?(?:freeText|longFreetext|freetext)(?:\s[^>]*)?>)([\s\S]*?)(<\/(?:\w+:)?(?:freeText|longFreetext|freetext)>)/gi,
      `$1${replacement}$3`,
    );
  });

/**
 * Build a redactor for one recording run.
 *
 * Session aliases are per-run state: the same SessionId must read as the same
 * pseudonym across every file, which is what lets a reviewer follow one
 * session through the chain.
 */
export const createRedactor = () => {
  const sessionAliases = new Map();

  const aliasFor = (id) => {
    const key = id.trim();
    if (!sessionAliases.has(key)) sessionAliases.set(key, `SESSION-${sessionAliases.size + 1}`);
    return sessionAliases.get(key);
  };

  const redact = (xml) => {
    let out = String(xml ?? '');

    for (const secret of SECRETS) out = setText(out, secret, REDACTED);

    out = out.replace(
      /(<(?:\w+:)?SessionId>)([\s\S]*?)(<\/(?:\w+:)?SessionId>)/gi,
      (_m, open, id, close) => `${open}${aliasFor(id)}${close}`,
    );

    for (const [tag, value] of Object.entries(TRAVELLER_VALUES)) out = setText(out, tag, value);

    // A bare address anywhere else — a reply echoing it outside an APE block,
    // say — still has to go. This pattern cannot touch an amount or a date.
    out = out.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, 'traveller@example.com');

    return maskContactElements(out);
  };

  return { redact, sessionAliases };
};
